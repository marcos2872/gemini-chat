const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CLIENT_DEFAULTS = { scope: 'read:user' };
const USER_AGENT = 'Gemini-Chat-Desktop/1.0';

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class CopilotAuthService {
    /**
     * Request a device code for authentication
     * Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
     * POST https://github.com/login/device/code
     * @param {string} clientId 
     */
    async requestDeviceCode(clientId) {
        console.log(`[CopilotAuthService] Requesting device code for client: ${clientId}`);

        try {
            const response = await fetch(GITHUB_DEVICE_CODE_URL, {
                method: 'POST',
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "User-Agent": USER_AGENT
                },
                body: JSON.stringify({
                    client_id: clientId,
                    scope: CLIENT_DEFAULTS.scope
                })
            });

            if (!response.ok) {
                // Try to parse error details if available
                let errorDetails = `HTTP Error ${response.status}`;
                try {
                    const errData = await response.json();
                    errorDetails = errData.error_description || errData.error || errorDetails;
                } catch (e) { /* ignore parse error */ }

                throw new Error(errorDetails);
            }

            const data = await response.json();
            console.log('[CopilotAuthService] Device Code Response:', data);

            // Check for functional errors inside 200 OK
            if (data.error) {
                throw new Error(data.error_description || data.error);
            }

            return data;
        } catch (error) {
            console.error('[CopilotAuthService] Request Code Error:', error.message);
            throw error;
        }
    }

    /**
     * Poll for the access token
     * POST https://github.com/login/oauth/access_token
     * @param {string} clientId 
     * @param {string} deviceCode 
     * @param {number} interval 
     */
    async pollForToken(clientId, deviceCode, interval) {
        let pollInterval = Math.max(interval, 5);
        const timeout = 600 * 1000; // 10 min timeout
        const start = Date.now();

        console.log('[CopilotAuthService] Starting poll for token...');

        while (Date.now() - start < timeout) {
            try {
                const response = await fetch(GITHUB_TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "User-Agent": USER_AGENT
                    },
                    body: JSON.stringify({
                        client_id: clientId,
                        device_code: deviceCode,
                        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                    })
                });

                // Network or Server Errors
                if (!response.ok) {
                    console.warn(`[CopilotAuthService] Poll request failed: ${response.status}`);
                    // Non-fatal, just wait and retry unless it's 400/401/403 permanent failures?
                    // GitHub docs say some errors are returned as 200 with error field, but 404/500 might happen.
                    // We'll treat HTTP errors as retriable for now mostly, or throw if critical.
                } else {
                    const data = await response.json();

                    if (data.error) {
                        if (data.error === "authorization_pending") {
                            // Continue polling
                            // console.debug('[CopilotAuthService] authorization_pending...');
                        } else if (data.error === "slow_down") {
                            console.log('[CopilotAuthService] Received slow_down, increasing interval');
                            pollInterval += 5;
                        } else {
                            // Fatal error (e.g., expired_token, access_denied)
                            throw new Error(data.error_description || data.error);
                        }
                    } else if (data.access_token) {
                        console.log('[CopilotAuthService] Token received successfully.');
                        return {
                            accessToken: data.access_token,
                            tokenType: data.token_type,
                            scope: data.scope,
                        };
                    } else {
                        console.warn('[CopilotAuthService] Unexpected response format:', data);
                    }
                }
            } catch (err) {
                console.error("[CopilotAuthService] Polling error:", err.message);
                // If it's a fatal logic error, we should probably stop. 
                // But for now we treat as retriable unless explicitly thrown above.
                if (!err.message.includes('fetch')) {
                    // logic errors re-thrown
                    if (err.message !== 'Failed to fetch' && !err.message.includes('network')) {
                        throw err;
                    }
                }
            }

            // Wait before next attempt
            await delay(pollInterval * 1000);
        }

        throw new Error("Timeout polling for token");
    }
}

module.exports = CopilotAuthService;
