import { logger } from './lib/logger';
import { AUTH_CONFIG } from '../shared/constants';
const log = logger.copilot;

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const CLIENT_DEFAULTS = { scope: 'read:user' };
const USER_AGENT = 'Gemini-Chat-Desktop/1.0';
const CLIENT_ID = 'Iv1.b507a08c87ecfe98';

// Helper for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CopilotAuthService {
    /**
     * Request a device code for authentication
     * Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow
     * POST https://github.com/login/device/code
     */
    async requestDeviceCode() {
        log.info('Requesting device code...');
        try {
            const response = await fetch(GITHUB_DEVICE_CODE_URL, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT,
                },
                body: JSON.stringify({
                    client_id: CLIENT_ID,
                    scope: CLIENT_DEFAULTS.scope,
                }),
            });

            if (!response.ok) {
                // Try to parse error details if available
                let errorDetails = `HTTP Error ${response.status}`;
                try {
                    const errData = await response.json();
                    errorDetails = errData.error_description || errData.error || errorDetails;
                } catch (e: any) {
                    log.error('Failed to parse error response', { error: e.message });
                }

                throw new Error(errorDetails);
            }

            const data = await response.json();

            // Check for functional errors inside 200 OK
            if (data.error) {
                throw new Error(data.error_description || data.error);
            }

            log.info('Device code received', {
                user_code: data.user_code,
                verification_uri: data.verification_uri,
            });
            return data;
        } catch (error: any) {
            log.error('Request Device Code Failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Poll for the access token
     * POST https://github.com/login/oauth/access_token
     * @param {string} deviceCode
     * @param {number} interval
     */
    async pollForToken(deviceCode: string, interval: number) {
        log.info('Starting polling for token', { interval });
        let pollInterval = Math.max(interval, 5);

        const timeout = AUTH_CONFIG.POLL_TIMEOUT_MS;
        const start = Date.now();

        while (Date.now() - start < timeout) {
            try {
                const response = await fetch(GITHUB_TOKEN_URL, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT,
                    },
                    body: JSON.stringify({
                        client_id: CLIENT_ID,
                        device_code: deviceCode,
                        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
                    }),
                });

                // Network or Server Errors
                if (!response.ok) {
                    log.warn(`Poll request failed: ${response.status}`);
                } else {
                    const data = await response.json();

                    if (data.error) {
                        if (data.error === 'authorization_pending') {
                            // Wait and retry
                        } else if (data.error === 'slow_down') {
                            pollInterval += 5;
                            log.debug('Slow down requested', { newInterval: pollInterval });
                        } else {
                            // Fatal error
                            throw new Error(data.error_description || data.error);
                        }
                    } else if (data.access_token) {
                        log.info('Token received successfully');
                        return {
                            accessToken: data.access_token,
                            tokenType: data.token_type,
                            scope: data.scope,
                        };
                    } else {
                        log.warn('Unexpected response format', { data });
                    }
                }
            } catch (err: any) {
                log.error('Polling error', { error: err.message });
                if (!err.message.includes('fetch')) {
                    if (err.message !== 'Failed to fetch' && !err.message.includes('network')) {
                        throw err;
                    }
                }
            }

            // Wait before next attempt
            await delay(pollInterval * 1000);
        }

        throw new Error('Timeout polling for token');
    }
}
