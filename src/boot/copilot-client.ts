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
            await this.exchangeToken();
        } catch (e) {
            log.warn('Token exchange failed during listModels', { error: e });
            return [];
        }

        try {
            log.debug('Fetching models');

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

            // Expected format: { data: [...] } or just [...]?
            // Usually { data: [...] } for /models endpoint in OpenAI style, but Copilot might differ.
            // Documentation says "JSON com a lista de modelos".
            // Let's handle both.
            const models = Array.isArray(data) ? data : data.data || [];

            // Filter
            const validModels = models.filter((m: any) => {
                // model_picker_enabled === true
                if (m.model_picker_enabled !== true) return false;
                // capabilities.type === "chat"
                if (m.capabilities?.type !== 'chat') return false;
                // policy.state === "enabled"
                if (m.policy?.state !== 'enabled') return false;
                return true;
            });

            return validModels.map((m: any) => ({
                name: m.id || m.name,
                displayName: m.name || m.id,
            }));
        } catch (error: any) {
            log.warn('Failed to fetch models', { error: error.message });
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
        if (!this.oauthToken) throw new Error('Not authenticated');
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
            }
        }

        const maxTurns = 10;
        let turn = 0;

        while (turn < maxTurns) {
            try {
                log.debug('Sending prompt', { model: this.modelName, turn: turn + 1 });
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
                    throw new Error(errorMsg);
                }

                const data = await response.json();

                if (data && data.choices && data.choices.length > 0) {
                    const message = data.choices[0].message;

                    // Add assistant message to local history (and to next request)
                    messages.push(message);

                    if (message.tool_calls && message.tool_calls.length > 0) {
                        log.info('Tool calls requested', {
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

                            // Approval
                            if (typeof onApproval === 'function') {
                                const approved = await onApproval(functionName, args);
                                if (!approved) {
                                    log.warn('Tool execution rejected', { tool: functionName });
                                    throw new Error('User denied tool execution.');
                                }
                            }

                            // Execution
                            let result;
                            try {
                                result = await mcpManager.callTool(functionName, args);
                            } catch (err: any) {
                                result = { error: err.message };
                            }

                            log.debug('Tool result', { tool: functionName, result });

                            // Append Tool Output
                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(result),
                            });
                        }
                        turn++;
                        // Loop continues to send tool outputs back to model
                    } else {
                        // Final text response
                        if (message.content) {
                            this._addToHistory('assistant', message.content);
                            return message.content;
                        } else {
                            throw new Error('No content in response');
                        }
                    }
                } else {
                    console.warn('[Copilot] Response contained no choices/messages.');
                    throw new Error('No content in response');
                }
            } catch (error: any) {
                console.error('[CopilotClient] Chat request failed:', error.message);
                throw error;
            }
        }

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
