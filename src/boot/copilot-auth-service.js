const axios = require('axios');

const GITHUB_AUTH_URL = "https://github.com/login/oauth";

class CopilotAuthService {
    constructor() {
    }

    /**
     * Request a device code for authentication
     * @param {string} clientId 
     */
    async requestDeviceCode(clientId) {
        try {
            const res = await axios.post(
                `${GITHUB_AUTH_URL}/device/code`,
                {
                    client_id: clientId,
                    scope: "read:user", // Standard scope for device flow
                },
                {
                    headers: { Accept: "application/json" },
                }
            );
            return res.data;
        } catch (error) {
            console.error('[CopilotAuthService] Request Code Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
                throw new Error(error.response.data.error_description || error.response.data.error || 'Failed to request device code');
            }
            throw error;
        }
    }

    /**
     * Poll for the access token
     * @param {string} clientId 
     * @param {string} deviceCode 
     * @param {number} interval 
     */
    async pollForToken(clientId, deviceCode, interval) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const timeout = 300 * 1000; // 5 min timeout

            const check = async () => {
                if (Date.now() - start > timeout) {
                    reject(new Error("Timeout polling for token"));
                    return;
                }

                try {
                    const res = await axios.post(
                        `${GITHUB_AUTH_URL}/access_token`,
                        {
                            client_id: clientId,
                            device_code: deviceCode,
                            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
                        },
                        {
                            headers: { Accept: "application/json" },
                        }
                    );

                    if (res.data.error) {
                        if (res.data.error === "authorization_pending") {
                            setTimeout(check, (interval + 1) * 1000); // Wait + 1s buffer
                            return;
                        } else if (res.data.error === "slow_down") {
                            setTimeout(check, (interval + 5) * 1000);
                            return;
                        } else {
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
                    }
                } catch (err) {
                    // Network error or other fatal error
                    console.error("[CopilotAuthService] Polling error", err.message);
                    setTimeout(check, interval * 1000);
                }
            };

            check();
        });
    }
}

module.exports = CopilotAuthService;
