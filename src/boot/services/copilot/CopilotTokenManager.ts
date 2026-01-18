import { ConfigPersistence } from '../../lib/config-persistence';
import { createLogger } from '../../lib/logger';
import { retryService } from '../RetryService';

const log = createLogger('CopilotTokenManager');
const CONFIG_KEY = 'copilot-auth';

const DEFAULT_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'GeminiChat-App/1.0',
    'Editor-Version': 'vscode/1.85.0',
    'Editor-Plugin-Version': 'copilot/1.145.0',
};

export class CopilotTokenManager {
    private oauthToken: string | null = null;
    private apiToken: string | null = null;
    public apiEndpoint: string | null = null;
    private tokenExpiresAt: number = 0;
    private tokenExchangePromise: Promise<void> | null = null;

    async initialize(oauthToken?: string): Promise<boolean> {
        if (oauthToken) {
            this.oauthToken = oauthToken;
            ConfigPersistence.save(CONFIG_KEY, { oauthToken });
        } else {
            const saved = await ConfigPersistence.load<{ oauthToken: string }>(CONFIG_KEY);
            if (saved?.oauthToken) {
                this.oauthToken = saved.oauthToken;
                log.info('OAuth token loaded from persistence');
            }
        }

        if (this.oauthToken) {
            await this.refreshToken();
            return true;
        }
        return false;
    }

    getOAuthToken(): string | null {
        return this.oauthToken;
    }

    getApiToken(): string | null {
        return this.apiToken;
    }

    async getValidToken(): Promise<string> {
        if (!this.oauthToken) {
            throw new Error('No OAuth token provided');
        }
        await this.refreshToken();
        if (!this.apiToken) {
            throw new Error('Failed to obtain API token');
        }
        return this.apiToken;
    }

    private async refreshToken() {
        if (!this.oauthToken) throw new Error('No OAuth token provided');

        if (this.apiToken && Date.now() < this.tokenExpiresAt) return;

        if (this.tokenExchangePromise) {
            return this.tokenExchangePromise;
        }

        this.tokenExchangePromise = (async () => {
            try {
                log.debug('Exchanging OAuth token for API Token...');

                await retryService.withRetry(async () => {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000);

                    const response = await fetch(
                        'https://api.github.com/copilot_internal/v2/token',
                        {
                            headers: {
                                ...DEFAULT_HEADERS,
                                Authorization: `token ${this.oauthToken}`,
                            },
                            signal: controller.signal,
                        },
                    );

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        log.error('Token exchange failed', { status: response.status });
                        throw new Error(`Token exchange failed: ${response.status}`);
                    }

                    const data = await response.json();

                    this.apiToken = data.token;
                    this.apiEndpoint =
                        data.endpoints?.api?.replace(/\/$/, '') || 'https://api.githubcopilot.com';
                    this.tokenExpiresAt = (data.expires_at || Date.now() / 1000 + 1500) * 1000;

                    log.debug('Token exchanged successfully', { endpoint: this.apiEndpoint });
                });
            } catch (error) {
                const err = error as Error;
                log.error('Token exchange error', { error: err.message });
                throw error;
            } finally {
                this.tokenExchangePromise = null;
            }
        })();

        return this.tokenExchangePromise;
    }

    async validateConnection(): Promise<boolean> {
        if (!this.oauthToken) return false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch('https://api.github.com/user', {
                method: 'GET',
                headers: {
                    ...DEFAULT_HEADERS,
                    Authorization: `Bearer ${this.oauthToken}`,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error) {
            const err = error as Error;
            log.error('Connection check failed', { error: err.message });
            return false;
        }
    }

    reset() {
        ConfigPersistence.delete(CONFIG_KEY).catch(() => {});
        this.oauthToken = null;
        this.apiToken = null;
        this.apiEndpoint = null;
        this.tokenExpiresAt = 0;
        this.tokenExchangePromise = null;
        log.info('Token manager reset');
    }
}
