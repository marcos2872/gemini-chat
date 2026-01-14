const axios = require('axios');

class CopilotAuthService {
    constructor() {
    }

    /**
     * Request a device code for authentication
     * Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
     * POST https://github.com/login/device/code
     * @param {string} clientId 
     */
    async requestDeviceCode(clientId) {
        try {
            console.log(`[CopilotAuthService] Requesting device code for client: ${clientId}`);
            
            // NOTE: GitHub docs say POST https://github.com/login/device/code
            const res = await axios.post(
                'https://github.com/login/device/code',
                {
                    client_id: clientId,
                    scope: "read:user" 
                },
                {
                    headers: { 
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "User-Agent": "Gemini-Chat-Desktop/1.0" 
                    },
                }
            );
            
            console.log('[CopilotAuthService] Device Code Response:', res.data);
            return res.data;
        } catch (error) {
            console.error('[CopilotAuthService] Request Code Error:', error.message);
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                throw new Error(error.response.data.error_description || error.response.data.error || 'Failed to request device code');
            }
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
        // Ensure interval is at least 5 seconds
        const pollInterval = Math.max(interval, 5);
        
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timeout = 600 * 1000; // 10 min timeout (GitHub codes usually last 15 min)

            const check = async () => {
                if (Date.now() - start > timeout) {
                    reject(new Error("Timeout polling for token"));
                    return;
                }

                try {
                    const res = await axios.post(
                        'https://github.com/login/oauth/access_token',
                        {
                            client_id: clientId,
                            device_code: deviceCode,
                            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                        },
                        {
                            headers: { 
                                "Accept": "application/json",
                                "Content-Type": "application/json",
                                "User-Agent": "Gemini-Chat-Desktop/1.0"
                            },
                        }
                    );

                    if (res.data.error) {
                        if (res.data.error === "authorization_pending") {
                            // Continue polling
                            setTimeout(check, (pollInterval + 1) * 1000); 
                            return;
                        } else if (res.data.error === "slow_down") {
                            // Increase interval
                            console.log('[CopilotAuthService] Received slow_down, increasing interval');
                            setTimeout(check, (pollInterval + 5) * 1000);
                            return;
                        } else {
                            // Fatal error
                            reject(new Error(res.data.error_description || res.data.error));
                            return;
                        }
                    }

                    if (res.data.access_token) {
                        resolve({
                            accessToken: res.data.access_token,
                            tokenType: res.data.token_type,
                            scope: res.data.scope,
                        });
                    } else {
                        // Unexpected response format
                        console.error('[CopilotAuthService] Unexpected response:', res.data);
                        setTimeout(check, pollInterval * 1000);
                    }
                } catch (err) {
                    console.error("[CopilotAuthService] Polling network error", err.message);
                    // Network glitch? retry
                    setTimeout(check, pollInterval * 1000);
                }
            };

            check();
        });
    }
}

module.exports = CopilotAuthService;
