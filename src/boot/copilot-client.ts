const GITHUB_API_USER_URL = 'https://api.github.com/user';
// const GITHUB_MODELS_CATALOG_URL = 'https://models.github.ai/catalog/models';
// const GITHUB_INFERENCE_URL = 'https://models.github.ai/inference/chat/completions';
import { logger } from './lib/logger';

const log = logger.copilot;

const DEFAULT_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'GeminiChat-App/1.0',
    'Editor-Version': 'vscode/1.85.0',
    'Editor-Plugin-Version': 'copilot/1.145.0',
};

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

export class CopilotClient {
    private oauthToken: string | null;
    private apiToken: string | null;
    private apiEndpoint: string | null;
    private tokenExpiresAt: number;
    public modelName: string;
    public history: any[];
    private timeoutMs: number;

    private tokenExchangePromise: Promise<void> | null;

    constructor() {
        this.oauthToken = null;
        this.apiToken = null;
        this.apiEndpoint = null;
        this.tokenExpiresAt = 0;
        this.modelName = 'gpt-5-mini'; // Default to a standard model gpt-5-mini GPT-5.1 Grok Code Fast 1  grok-code-fast-1
        this.history = [];
        this.timeoutMs = 30000;
        this.tokenExchangePromise = null;
    }

    async initialize(oauthToken: string) {
        this.oauthToken = oauthToken;
        await this.exchangeToken();
        log.info('Initialized', { model: this.modelName });
    }

    private async exchangeToken() {
        if (!this.oauthToken) throw new Error('No OAuth token provided');

        // Simple check if existing token is valid
        if (this.apiToken && Date.now() < this.tokenExpiresAt) return;

        // Return existing promise if exchange is in progress
        if (this.tokenExchangePromise) {
            return this.tokenExchangePromise;
        }

        this.tokenExchangePromise = (async () => {
            try {
                log.debug('Exchanging OAuth token for API Token...');
                const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
                    headers: {
                        ...DEFAULT_HEADERS,
                        Authorization: `token ${this.oauthToken}`,
                    },
                });

                if (!response.ok) {
                    throw new Error(`Token exchange failed: ${response.status}`);
                }

                const data = await response.json();

                this.apiToken = data.token;
                // Ensure endpoint doesn't have trailing slash
                this.apiEndpoint =
                    data.endpoints?.api?.replace(/\/$/, '') || 'https://api.githubcopilot.com';
                this.tokenExpiresAt = (data.expires_at || Date.now() / 1000 + 1500) * 1000; // default 25 min

                log.debug('Token exchanged', { endpoint: this.apiEndpoint });
            } catch (error: any) {
                log.error('Token exchange error', { error: error.message });
                throw error;
            } finally {
                this.tokenExchangePromise = null;
            }
        })();

        return this.tokenExchangePromise;
    }

    async setApiKey(key: string) {
        this.initialize(key);
    }

    isConfigured() {
        return !!this.oauthToken;
    }

    /**
     * Verify if the token is valid by fetching user info
     */
    async validateConnection() {
        if (!this.oauthToken) return false;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(GITHUB_API_USER_URL, {
                method: 'GET',
                headers: {
                    ...DEFAULT_HEADERS,
                    Authorization: `Bearer ${this.oauthToken}`,
                },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error: any) {
            console.error('[CopilotClient] Connection check failed:', error.message);
            return false;
        }
    }

    /**
     * Set the current model.
     * @param {string} modelName
     */
    async setModel(modelName: string) {
        log.info('Model changed', { model: modelName });
        this.modelName = modelName;
    }

    /**
     * List available models.
     * @returns {Promise<Array<{name: string, displayName: string}>>}
     */
    async listModels() {
        if (!this.oauthToken) return [];

        try {
            log.info('Exchanging token for listModels');
            await this.exchangeToken();
        } catch (e) {
            log.warn('Token exchange failed during listModels', { error: e });
            return [];
        }

        try {
            log.info('Fetching models from Copilot API...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(`${this.apiEndpoint}/models`, {
                method: 'GET',
                headers: {
                    ...DEFAULT_HEADERS,
                    Authorization: `Bearer ${this.apiToken}`,
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

            // Filter
            const validModels = models.filter((m: any) => {
                if (m.model_picker_enabled !== true) return false;
                if (m.capabilities?.type !== 'chat') return false;
                if (m.policy?.state !== 'enabled') return false;
                return true;
            });

            log.info('Models fetched successfully', { count: validModels.length });
            return validModels.map((m: any) => ({
                name: m.id || m.name,
                displayName: m.name || m.id,
            }));
        } catch (error: any) {
            log.error('Failed to fetch models', { error: error.message });
            return [];
        }
    }

    /**
     * Send a prompt to the model.
     * @param {string} prompt
     * @param {Object} [mcpManager] - Ignored for now
     * @param {Function} [onApproval] - Ignored for now
     * @returns {Promise<string>}
     */
    async sendPrompt(prompt: string, mcpManager: any, onApproval: any) {
        if (!this.oauthToken) {
            log.error('sendPrompt failed: Not authenticated');
            throw new Error('Not authenticated');
        }

        log.info('Sending prompt to Copilot', {
            prompt: prompt.substring(0, 100) + '...',
            model: this.modelName,
        });
        await this.exchangeToken();

        this._addToHistory('user', prompt);

        // Prepare messages from history
        const messages: any[] = this.history.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // Handle Tools
        let tools: any[] = [];
        let openAITools: any[] = [];

        if (mcpManager) {
            tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                openAITools = this._mapToolsToOpenAI(tools);
                log.debug('Tools mapped for OpenAI', { count: openAITools.length });
            }
        }

        const maxTurns = 10;
        let turn = 0;
        const deniedTools = new Set<string>();

        while (turn < maxTurns) {
            try {
                log.info('Executing chat turn', { turn: turn + 1, model: this.modelName });
                const payload: any = {
                    messages: messages,
                    model: this.modelName,
                    stream: false,
                };

                if (openAITools.length > 0) {
                    payload.tools = openAITools;
                    payload.tool_choice = 'auto';
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

                const response = await fetch(`${this.apiEndpoint}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        ...DEFAULT_HEADERS,
                        Authorization: `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json',
                        'Copilot-Integration-Id': 'vscode-chat',
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    let errorMsg = `HTTP Error ${response.status}`;
                    try {
                        const errData = await response.json();
                        if (errData.error) {
                            errorMsg =
                                typeof errData.error === 'string'
                                    ? errData.error
                                    : JSON.stringify(errData.error);
                        }
                    } catch {
                        /* ignore */
                    }
                    log.error('Chat API Error', { status: response.status, error: errorMsg });
                    throw new Error(errorMsg);
                }

                const data = await response.json();

                if (data && data.choices && data.choices.length > 0) {
                    const message = data.choices[0].message;
                    messages.push(message);

                    if (message.tool_calls && message.tool_calls.length > 0) {
                        log.info('Model requested tool calls', {
                            tools: message.tool_calls.map((t: any) => t.function.name),
                        });

                        // Execute Tools
                        for (const toolCall of message.tool_calls) {
                            const functionName = toolCall.function.name;
                            const argsString = toolCall.function.arguments;
                            let args = {};
                            try {
                                args = JSON.parse(argsString);
                            } catch {
                                log.error('Failed to parse tool args', {
                                    tool: functionName,
                                    args: argsString,
                                });
                            }

                            // Execution
                            let result;
                            let approved = true;
                            const sortKeys = (obj: any): any => {
                                if (obj === null || typeof obj !== 'object') return obj;
                                if (Array.isArray(obj)) return obj.map(sortKeys);
                                return Object.keys(obj)
                                    .sort()
                                    .reduce((acc: any, key) => {
                                        acc[key] = sortKeys(obj[key]);
                                        return acc;
                                    }, {});
                            };
                            const stableArgs = sortKeys(args);
                            const toolSignature = `${functionName}:${JSON.stringify(stableArgs)}`;

                            if (deniedTools.has(toolSignature)) {
                                log.warn('Auto-denying already rejected tool', {
                                    tool: functionName,
                                });
                                approved = false;
                            } else if (typeof onApproval === 'function') {
                                approved = await onApproval(functionName, args);
                                if (!approved) {
                                    log.debug('Adding signature to denied tools', {
                                        signature: toolSignature,
                                    });
                                    deniedTools.add(toolSignature);
                                }
                            }

                            if (!approved) {
                                log.warn('Tool execution rejected', { tool: functionName });
                                result = { error: 'User denied tool execution.' };
                            } else {
                                try {
                                    log.info('Calling tool', { tool: functionName });
                                    result = await mcpManager.callTool(functionName, args);
                                    log.debug('Tool result acquired', { tool: functionName });
                                } catch (err: any) {
                                    log.error('Tool execution error', {
                                        tool: functionName,
                                        error: err.message,
                                    });
                                    result = { error: err.message };
                                }
                            }

                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(result),
                            });
                        }
                        turn++;
                    } else {
                        if (message.content) {
                            log.info('Response received from Copilot');
                            this._addToHistory('assistant', message.content);
                            return message.content;
                        } else {
                            log.warn('Response contained no content');
                            throw new Error('No content in response');
                        }
                    }
                } else {
                    log.warn('Response choices array is empty');
                    throw new Error('No content in response');
                }
            } catch (error: any) {
                log.error('Chat request failed', { error: error.message });
                throw error;
            }
        }

        log.error('Exceeded max conversation turns');
        throw new Error('Max conversation turns reached.');
    }

    _mapToolsToOpenAI(mcpTools: any[]) {
        return mcpTools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        }));
    }

    _addToHistory(role: string, content: string) {
        const msg = {
            role,
            content,
            timestamp: new Date().toISOString(),
        };
        this.history.push(msg);
        return msg;
    }

    getHistory() {
        return this.history;
    }

    reset() {
        this.oauthToken = null;
        this.apiToken = null;
        this.apiEndpoint = null;
        this.tokenExpiresAt = 0;
        this.tokenExchangePromise = null;
        log.info('Copilot client session reset');
    }
}
