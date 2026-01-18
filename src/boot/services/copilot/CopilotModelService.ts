import { createLogger } from '../../lib/logger';
import { Model } from '../../../shared/types';
import { CopilotTokenManager } from './CopilotTokenManager';
import { retryService } from '../RetryService';

const log = createLogger('CopilotModelService');

const DEFAULT_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'GeminiChat-App/1.0',
    'Editor-Version': 'vscode/1.85.0',
    'Editor-Plugin-Version': 'copilot/1.145.0',
};

interface CopilotModel {
    id: string;
    name: string;
    model_picker_enabled?: boolean;
    capabilities?: { type: string };
    policy?: { state: string };
}

export class CopilotModelService {
    constructor(private tokenManager: CopilotTokenManager) {}

    async listModels(): Promise<Model[]> {
        const oauthToken = this.tokenManager.getOAuthToken();
        if (!oauthToken) return [];

        try {
            // Ensure we have a valid API token
            await this.tokenManager.getValidToken();
            const apiToken = this.tokenManager.getApiToken();
            const apiEndpoint = this.tokenManager.apiEndpoint;

            if (!apiToken || !apiEndpoint) {
                log.warn('Missing API token or endpoint for listModels');
                return [];
            }

            log.info('Fetching models from Copilot API...');

            return await retryService.withRetry(async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch(`${apiEndpoint}/models`, {
                    method: 'GET',
                    headers: {
                        ...DEFAULT_HEADERS,
                        Authorization: `Bearer ${apiToken}`,
                        'Copilot-Integration-Id': 'vscode-chat',
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    log.warn('Failed to fetch models', { status: response.status });
                    return [];
                }

                const data = await response.json();
                const models = Array.isArray(data) ? data : data.data || [];

                const validModels = models.filter((m: CopilotModel) => {
                    if (m.model_picker_enabled !== true) return false;
                    if (m.capabilities?.type !== 'chat') return false;
                    if (m.policy?.state !== 'enabled') return false;
                    return true;
                });

                log.info('Models fetched successfully', { count: validModels.length });
                return validModels.map((m: CopilotModel) => ({
                    name: m.id || m.name,
                    displayName: m.name || m.id,
                }));
            });
        } catch (error) {
            const err = error as Error;
            log.error('Failed to fetch models', { error: err.message });
            return [];
        }
    }
}
