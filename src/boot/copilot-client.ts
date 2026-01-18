import { ConfigPersistence } from './lib/config-persistence';
import { SETTINGS_KEY } from '../cli/hooks/useChat';
import { Model, HistoryMessage, IMcpManager, ApprovalCallback } from '../shared/types';
import { BaseClient, MAX_TOOL_TURNS } from './clients/BaseClient';

const GITHUB_API_USER_URL = 'https://api.github.com/user';
const CONFIG_KEY = 'copilot-auth';

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

export class CopilotClient extends BaseClient {
    private oauthToken: string | null;
    private apiToken: string | null;
    private apiEndpoint: string | null;
    private tokenExpiresAt: number;
    public modelName: string;
    protected override history: HistoryMessage[] = [];
    private timeoutMs: number;
    private tokenExchangePromise: Promise<void> | null;

    constructor() {
        super('Copilot');
        this.oauthToken = null;
        this.apiToken = null;
        this.apiEndpoint = null;
        this.tokenExpiresAt = 0;
        this.modelName = 'gpt-5-mini';
        this.timeoutMs = 30000;
        this.tokenExchangePromise = null;
    }

    async initialize(oauthToken?: string): Promise<boolean> {
        if (oauthToken) {
            this.oauthToken = oauthToken;
            ConfigPersistence.save(CONFIG_KEY, { oauthToken });
        } else {
            const saved = await ConfigPersistence.load<{ oauthToken: string }>(CONFIG_KEY);
            if (saved?.oauthToken) {
                this.oauthToken = saved.oauthToken;
                this.log.info('OAuth token loaded from persistence');
            }
        }

        if (this.oauthToken) {
            await this.exchangeToken();
            this.log.info('Initialized', { model: this.modelName });
            return true;
        }
        return false;
    }

    private async exchangeToken() {
        if (!this.oauthToken) throw new Error('No OAuth token provided');

        if (this.apiToken && Date.now() < this.tokenExpiresAt) return;

        if (this.tokenExchangePromise) {
            return this.tokenExchangePromise;
        }

        this.tokenExchangePromise = (async () => {
            try {
                this.log.debug('Exchanging OAuth token for API Token...');
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);

                const response = await fetch('https://api.github.com/copilot_internal/v2/token', {
                    headers: {
                        ...DEFAULT_HEADERS,
                        Authorization: `token ${this.oauthToken}`,
                    },
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    this.log.error('Token exchange failed', { status: response.status });
                    throw new Error(`Token exchange failed: ${response.status}`);
                }

                const data = await response.json();

                this.apiToken = data.token;
                this.apiEndpoint =
                    data.endpoints?.api?.replace(/\/$/, '') || 'https://api.githubcopilot.com';
                this.tokenExpiresAt = (data.expires_at || Date.now() / 1000 + 1500) * 1000;

                this.log.debug('Token exchanged successfully', { endpoint: this.apiEndpoint });
            } catch (error) {
                const err = error as Error;
                this.log.error('Token exchange error', { error: err.message });
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

    isConfigured(): boolean {
        this.log.info('Checking if Copilot client is configured', !!this.oauthToken);
        return !!this.oauthToken;
    }

    async validateConnection(): Promise<boolean> {
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
        } catch (error) {
            const err = error as Error;
            this.log.error('Connection check failed', { error: err.message });
            return false;
        }
    }

    async setModel(modelName: string) {
        this.log.info('Model changed', { model: modelName });
        this.modelName = modelName;
    }

    async listModels(): Promise<Model[]> {
        if (!this.oauthToken) return [];

        try {
            this.log.info('Exchanging token for listModels');
            await this.exchangeToken();
        } catch (e) {
            this.log.warn('Token exchange failed during listModels', { error: e });
            return [];
        }

        try {
            this.log.info('Fetching models from Copilot API...');

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
                this.log.warn('Failed to fetch models', { status: response.status });
                return [];
            }

            const data = await response.json();
            const models = Array.isArray(data) ? data : data.data || [];

            // Filter
            const validModels = models.filter((m: CopilotModel) => {
                if (m.model_picker_enabled !== true) return false;
                if (m.capabilities?.type !== 'chat') return false;
                if (m.policy?.state !== 'enabled') return false;
                return true;
            });

            this.log.info('Models fetched successfully', { count: validModels.length });
            return validModels.map((m: CopilotModel) => ({
                name: m.id || m.name,
                displayName: m.name || m.id,
            }));
        } catch (error: any) {
            // eslint-disable-line @typescript-eslint/no-explicit-any
            this.log.error('Failed to fetch models', { error: error.message });
            return [];
        }
    }

    async sendPrompt(
        prompt: string,
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        _signal?: AbortSignal, // TODO: Implement abort support
    ): Promise<string> {
        if (!this.oauthToken) {
            this.log.error('sendPrompt failed: Not authenticated');
            throw new Error('🔐 Você não está autenticado. Use o comando /auth para fazer login.');
        }

        this.log.info('Sending prompt to Copilot', {
            prompt: prompt.substring(0, 100) + '...',
            model: this.modelName,
        });
        await this.exchangeToken();

        this.addToHistory('user', prompt);

        // Prepare messages from history
        const messages: unknown[] = this.history.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        // Handle Tools
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let openAITools: any[] = [];

        if (mcpManager) {
            const tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                openAITools = this._mapToolsToOpenAI(tools);
                this.log.debug('Tools mapped for OpenAI', { count: openAITools.length });
            }
        }

        let turn = 0;

        while (turn < MAX_TOOL_TURNS) {
            try {
                this.log.info('Executing chat turn', { turn: turn + 1, model: this.modelName });
                const payload: Record<string, unknown> = {
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
                    this.log.error('Chat API Error', { status: response.status, error: errorMsg });

                    if (response.status === 401)
                        throw new Error(
                            '🔒 Sessão inválida (401). Faça login novamente com /auth.',
                        );
                    if (response.status === 403)
                        throw new Error(
                            '🚫 Acesso negado (403). Verifique suas permissões no GitHub.',
                        );
                    if (response.status === 429)
                        throw new Error('⏳ Muitas requisições (429). Aguarde um momento.');

                    throw new Error(`Erro na API (${response.status}): ${errorMsg}`);
                }

                const data = await response.json();

                if (data && data.choices && data.choices.length > 0) {
                    const message = data.choices[0].message;
                    messages.push(message);

                    if (message.tool_calls && message.tool_calls.length > 0) {
                        this.log.info('Model requested tool calls', {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                                this.log.error('Failed to parse tool args', {
                                    tool: functionName,
                                    args: argsString,
                                });
                            }

                            if (!mcpManager) {
                                this.log.error('McpManager not available for tool execution');
                                continue;
                            }

                            // Use base class method for tool execution with approval
                            const { result } = await this.executeToolWithApproval(
                                functionName,
                                args as Record<string, unknown>,
                                mcpManager,
                                onApproval,
                            );

                            messages.push({
                                role: 'tool',
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(result),
                            });
                        }
                        turn++;
                    } else {
                        if (message.content) {
                            this.log.info('Response received from Copilot');
                            this.addToHistory('assistant', message.content);
                            return message.content;
                        } else {
                            this.log.warn('Response contained no content');
                            throw new Error('No content in response');
                        }
                    }
                } else {
                    this.log.warn('Response choices array is empty');
                    throw new Error('No content in response');
                }
            } catch (error: any) {
                // eslint-disable-line @typescript-eslint/no-explicit-any
                this.log.error('Chat request failed', { error: error.message });
                throw error;
            }
        }

        if (turn >= MAX_TOOL_TURNS) {
            this.log.error('Exceeded max conversation turns');
            throw new Error('🛑 Limite de turnos da conversa atingido. Inicie uma nova conversa.');
        }

        return '';
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    override getHistory() {
        return this.history;
    }

    override clearHistory(): void {
        this.history = [];
    }

    reset() {
        ConfigPersistence.delete(CONFIG_KEY).catch(() => {});
        ConfigPersistence.delete(SETTINGS_KEY).catch(() => {});
        this.oauthToken = null;
        this.apiToken = null;
        this.apiEndpoint = null;
        this.tokenExpiresAt = 0;
        this.tokenExchangePromise = null;
        this.log.info('Copilot client session reset');
    }
}
