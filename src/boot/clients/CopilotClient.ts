import { ConfigPersistence } from '../lib/config-persistence';
import { SETTINGS_KEY } from '../../cli/hooks/useChat';
import { Model, IMcpManager, ApprovalCallback, Message } from '../../shared/types';
import { BaseClient, MAX_TOOL_TURNS, SendPromptResult } from './BaseClient';
import { HistoryConverter, OpenAIMessage } from '../services/HistoryConverter';
import { retryService } from '../services/RetryService';

// Services
import { CopilotTokenManager } from '../services/copilot/CopilotTokenManager';
import { CopilotModelService } from '../services/copilot/CopilotModelService';
import { CopilotToolService } from '../services/copilot/CopilotToolService';
import {
    CopilotStreamService,
    CopilotStreamOptions,
} from '../services/copilot/CopilotStreamService';

const DEFAULT_HEADERS = {
    Accept: 'application/json',
    'User-Agent': 'GeminiChat-App/1.0',
    'Editor-Version': 'vscode/1.85.0',
    'Editor-Plugin-Version': 'copilot/1.145.0',
};

export class CopilotClient extends BaseClient {
    public modelName: string;
    private timeoutMs: number;

    // Services
    private tokenManager: CopilotTokenManager;
    private modelService: CopilotModelService;
    private toolService: CopilotToolService;
    private streamService: CopilotStreamService;

    constructor() {
        super('Copilot');
        this.modelName = 'gpt-4o-mini';
        this.timeoutMs = 60000; // Increased for streaming

        // Initialize Services
        this.tokenManager = new CopilotTokenManager();
        this.modelService = new CopilotModelService(this.tokenManager);
        this.toolService = new CopilotToolService();
        this.streamService = new CopilotStreamService();
    }

    async initialize(oauthToken?: string): Promise<boolean> {
        const initialized = await this.tokenManager.initialize(oauthToken);
        if (initialized) {
            this.log.info('Initialized', { model: this.modelName });
        }
        return initialized;
    }

    async setApiKey(key: string) {
        this.initialize(key);
    }

    isConfigured(): boolean {
        const configured = !!this.tokenManager.getOAuthToken();
        this.log.info('Checking if Copilot client is configured', configured);
        return configured;
    }

    async validateConnection(): Promise<boolean> {
        return this.tokenManager.validateConnection();
    }

    async setModel(modelName: string) {
        this.log.info('Model changed', { model: modelName });
        this.modelName = modelName;
    }

    async listModels(): Promise<Model[]> {
        return this.modelService.listModels();
    }

    async sendPrompt(
        prompt: string,
        history: Message[],
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        signal?: AbortSignal,
        onChunk?: (chunk: string) => void,
    ): Promise<SendPromptResult> {
        // Check abort before starting
        if (signal?.aborted) {
            throw new Error('Operation aborted');
        }

        if (!this.tokenManager.getOAuthToken()) {
            this.log.error('sendPrompt failed: Not authenticated');
            throw new Error('🔐 Você não está autenticado. Use o comando /auth para fazer login.');
        }

        this.log.info('Sending prompt to Copilot', {
            prompt: prompt.substring(0, 100) + '...',
            model: this.modelName,
        });

        // Ensure we have a valid token
        const apiToken = await this.tokenManager.getValidToken();

        // Convert history to OpenAI format and add current prompt
        const messages: OpenAIMessage[] = HistoryConverter.toOpenAIFormat(history);
        messages.push({ role: 'user', content: prompt });

        // Track tool messages
        const toolMessages: Message[] = [];

        // Handle Tools
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let openAITools: any[] = [];
        if (mcpManager) {
            openAITools = await this.toolService.getOpenAITools(mcpManager);
        }

        let turn = 0;

        while (turn < MAX_TOOL_TURNS) {
            // Check abort at each turn
            if (signal?.aborted) {
                throw new Error('Operation aborted');
            }

            try {
                this.log.info('Executing chat turn', { turn: turn + 1, model: this.modelName });

                // Enable streaming for better UX
                const payload: Record<string, unknown> = {
                    messages: messages,
                    model: this.modelName,
                    stream: true,
                };

                if (openAITools.length > 0) {
                    payload.tools = openAITools;
                    payload.tool_choice = 'auto';
                }

                const response = await retryService.withRetry(
                    async () => {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

                        // Link to user's signal if provided
                        const handleAbort = () => controller.abort();
                        signal?.addEventListener('abort', handleAbort);

                        try {
                            const res = await fetch(
                                `${this.tokenManager.apiEndpoint}/chat/completions`,
                                {
                                    method: 'POST',
                                    headers: {
                                        ...DEFAULT_HEADERS,
                                        Authorization: `Bearer ${apiToken}`,
                                        'Content-Type': 'application/json',
                                        'Copilot-Integration-Id': 'vscode-chat',
                                    },
                                    body: JSON.stringify(payload),
                                    signal: controller.signal,
                                },
                            );

                            clearTimeout(timeoutId);
                            return res;
                        } finally {
                            signal?.removeEventListener('abort', handleAbort);
                            clearTimeout(timeoutId);
                        }
                    },
                    { signal },
                );

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Copilot API error: ${response.status} - ${text}`);
                }

                // Use streaming service to consume SSE
                const streamOptions: CopilotStreamOptions = {
                    signal,
                    // Only stream to UI on first turn (initial response)
                    onChunk: turn === 0 ? onChunk : undefined,
                };

                const streamResult = await this.streamService.consumeStream(
                    response,
                    streamOptions,
                );
                const message = streamResult.message;

                messages.push(message);

                if (message.tool_calls && message.tool_calls.length > 0) {
                    this.log.info('Model requested tool calls', {
                        tools: message.tool_calls.map(
                            (t: { function: { name: string } }) => t.function.name,
                        ),
                    });

                    // Add assistant message with tool_calls to history
                    toolMessages.push({
                        role: 'assistant',
                        content: message.content || '',
                        timestamp: new Date().toISOString(),
                        tool_calls: message.tool_calls.map((tc) => ({
                            id: tc.id,
                            function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments,
                            },
                        })),
                    });

                    for (const toolCall of message.tool_calls) {
                        const functionName = toolCall.function.name;
                        const args = this.toolService.parseToolArgs(
                            functionName,
                            toolCall.function.arguments,
                        );

                        if (!mcpManager) {
                            this.log.error('McpManager not available for tool execution');
                            continue;
                        }

                        const { result } = await this.executeToolWithApproval(
                            functionName,
                            args,
                            mcpManager,
                            onApproval,
                        );

                        messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result),
                        });

                        // Track for CLI
                        toolMessages.push({
                            role: 'tool',
                            content: JSON.stringify(result),
                            timestamp: new Date().toISOString(),
                            mcpCalls: [
                                {
                                    server: 'mcp',
                                    toolName: functionName,
                                    input: args,
                                    output: result,
                                    duration: 0,
                                    error: false,
                                    toolCallId: toolCall.id,
                                },
                            ],
                        });
                    }
                    turn++;
                } else {
                    this.log.info('Response received from Copilot');
                    return {
                        response: message.content || '',
                        toolMessages: toolMessages.length > 0 ? toolMessages : undefined,
                    };
                }
            } catch (error) {
                if ((error as Error).message === 'Operation aborted') {
                    throw error;
                }
                const err = error as Error;
                this.log.error('Chat request failed', { error: err.message });
                this.handleApiError(err);
            }
        }

        if (turn >= MAX_TOOL_TURNS) {
            this.log.error('Exceeded max conversation turns');
            throw new Error('🛑 Limite de turnos da conversa atingido. Inicie uma nova conversa.');
        }

        return { response: '' };
    }

    reset() {
        ConfigPersistence.delete(SETTINGS_KEY).catch(() => {});
        this.tokenManager.reset();
        this.log.info('Copilot client session reset');
    }
}
