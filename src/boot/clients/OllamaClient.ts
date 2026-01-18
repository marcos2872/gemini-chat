import { OllamaToolService } from '../services/ollama/OllamaToolService';
import { OllamaStreamService, OllamaStreamOptions } from '../services/ollama/OllamaStreamService';
import { IMcpManager, ApprovalCallback, Model, Message } from '../../shared/types';
import { BaseClient, MAX_TOOL_TURNS, SendPromptResult } from './BaseClient';
import { HistoryConverter, OpenAIMessage } from '../services/HistoryConverter';

export class OllamaClient extends BaseClient {
    public modelName: string;
    private baseUrl: string;
    private toolService: OllamaToolService;
    private streamService: OllamaStreamService;

    constructor() {
        super('Ollama');
        this.modelName = 'llama3';
        this.baseUrl = 'http://localhost:11434';
        this.toolService = new OllamaToolService();
        this.streamService = new OllamaStreamService();
    }

    async initialize() {
        // No explicit auth needed for local Ollama
    }

    isConfigured(): boolean {
        return true; // Local Ollama doesn't need auth
    }

    async validateConnection(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                this.log.info('Ollama connection verified');
            }
            return response.ok;
        } catch (e) {
            const err = e as Error;
            this.log.warn('Ollama connection check failed', { error: err.message });
            return false;
        }
    }

    async setModel(model: string) {
        this.modelName = model;
        this.log.info('Model set', { model });
    }

    async listModels(): Promise<Model[]> {
        try {
            this.log.info('Fetching available models');
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];

            const data = (await response.json()) as { models?: Array<{ name: string }> };

            return (data.models || []).map((m) => ({
                name: m.name,
                displayName: m.name,
            }));
        } catch (e) {
            const err = e as Error;
            this.log.error('Failed to list models', { error: err.message });
            return [];
        }
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

        // Convert history to OpenAI format (Ollama uses similar format)
        const messages: OpenAIMessage[] = HistoryConverter.toOpenAIFormat(history);
        messages.push({ role: 'user', content: prompt });

        // Track tool messages
        const toolMessages: Message[] = [];

        // Prepare Tools
        let ollamaTools: unknown[] | undefined = undefined;
        if (mcpManager) {
            const tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                ollamaTools = this.toolService.mapToolsToOllama(tools);
                this.log.info('Mapped MCP tools for Ollama', { count: ollamaTools.length });
            }
        }

        let turn = 0;
        let finalAnswer = '';

        while (turn < MAX_TOOL_TURNS) {
            // Check abort at each turn
            if (signal?.aborted) {
                throw new Error('Operation aborted');
            }

            try {
                this.log.info('Sending prompt to Ollama', { model: this.modelName, turn });

                // Create abort controller to link with user's signal
                const controller = new AbortController();
                const handleAbort = () => controller.abort();
                signal?.addEventListener('abort', handleAbort);

                let response: Response;
                try {
                    response = await fetch(`${this.baseUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: this.modelName,
                            messages,
                            stream: true,
                            tools: ollamaTools,
                        }),
                        signal: controller.signal,
                    });
                } finally {
                    signal?.removeEventListener('abort', handleAbort);
                }

                // If model doesn't support tools, retry without them
                if (response.status === 400 && ollamaTools && ollamaTools.length > 0) {
                    this.log.warn('Model may not support tools, retrying without tools', {
                        model: this.modelName,
                    });
                    ollamaTools = undefined;

                    signal?.addEventListener('abort', handleAbort);
                    try {
                        response = await fetch(`${this.baseUrl}/api/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: this.modelName,
                                messages,
                                stream: true,
                            }),
                            signal: controller.signal,
                        });
                    } finally {
                        signal?.removeEventListener('abort', handleAbort);
                    }
                }

                if (!response.ok) {
                    this.log.error('Ollama API error', { status: response.status });
                    throw new Error(`Ollama API Error: ${response.statusText}`);
                }

                // Use streaming service to consume NDJSON
                const streamOptions: OllamaStreamOptions = {
                    signal,
                    // Only stream to UI on first turn (initial response)
                    onChunk: turn === 0 ? onChunk : undefined,
                };

                const streamResult = await this.streamService.consumeStream(
                    response,
                    streamOptions,
                );
                const responseText = streamResult.content;
                const toolCalls = streamResult.toolCalls;

                // Push assistant response to messages
                messages.push({
                    role: 'assistant',
                    content: responseText,
                    tool_calls: toolCalls?.map((tc, idx) => ({
                        id: `call_${idx}`,
                        function: {
                            name: tc.function.name,
                            arguments: JSON.stringify(tc.function.arguments),
                        },
                    })),
                });

                // Check for tool calls
                if (toolCalls && toolCalls.length > 0) {
                    this.log.info('Received tool calls from Ollama', {
                        count: toolCalls.length,
                    });

                    // Add assistant message with tool_calls to history
                    toolMessages.push({
                        role: 'assistant',
                        content: responseText,
                        timestamp: new Date().toISOString(),
                        tool_calls: toolCalls.map((tc, idx) => ({
                            id: `call_${idx}`,
                            function: {
                                name: tc.function.name,
                                arguments: JSON.stringify(tc.function.arguments),
                            },
                        })),
                    });

                    for (let i = 0; i < toolCalls.length; i++) {
                        const toolCall = toolCalls[i];
                        const functionName = toolCall.function.name;
                        const args = toolCall.function.arguments;
                        const toolCallId = `call_${i}`;

                        if (!mcpManager) {
                            messages.push({
                                role: 'tool',
                                content: JSON.stringify({ error: 'McpManager not available' }),
                                name: functionName,
                            });
                            continue;
                        }

                        const { result } = await this.executeToolWithApproval(
                            functionName,
                            args as Record<string, unknown>,
                            mcpManager,
                            onApproval,
                        );

                        messages.push({
                            role: 'tool',
                            content: JSON.stringify(result),
                            name: functionName,
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
                                    input: args as Record<string, unknown>,
                                    output: result,
                                    duration: 0,
                                    error: false,
                                    toolCallId: toolCallId,
                                },
                            ],
                        });
                    }

                    turn++;
                } else {
                    finalAnswer = responseText;
                    this.log.info('Received final response from Ollama', {
                        length: finalAnswer.length,
                    });
                    break;
                }
            } catch (e) {
                if ((e as Error).message === 'Operation aborted') {
                    throw e;
                }
                const err = e as Error;
                this.log.error('Ollama request failed', { error: err.message });

                if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
                    throw new Error(
                        '📡 Não foi possível conectar ao Ollama. Verifique se ele está rodando (http://localhost:11434).',
                    );
                }

                throw new Error(`Erro no Ollama: ${err.message}`);
            }
        }

        return {
            response: finalAnswer,
            toolMessages: toolMessages.length > 0 ? toolMessages : undefined,
        };
    }

    reset() {
        // No persistent state to clear
    }
}
