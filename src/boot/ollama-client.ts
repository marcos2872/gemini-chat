import { OllamaToolService } from './services/ollama/OllamaToolService';
import { IMcpManager, ApprovalCallback, Model, HistoryMessage } from '../shared/types';
import { BaseClient, MAX_TOOL_TURNS } from './clients/BaseClient';

interface OllamaMessage extends HistoryMessage {
    tool_calls?: Array<{
        function: { name: string; arguments: Record<string, unknown> };
    }>;
    name?: string;
}

interface OllamaApiResponse {
    message: {
        role: string;
        content: string;
        tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
        }>;
    };
}

export class OllamaClient extends BaseClient {
    public modelName: string;
    protected override history: OllamaMessage[] = [];
    private baseUrl: string;
    private toolService: OllamaToolService;

    constructor() {
        super('Ollama');
        this.modelName = 'llama3';
        this.baseUrl = 'http://localhost:11434';
        this.toolService = new OllamaToolService();
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
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        _signal?: AbortSignal, // TODO: Implement abort support
    ): Promise<string> {
        // 1. Add user message
        this.history.push({ role: 'user', content: prompt });

        // 2. Prepare Tools
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
            const messages = this.history.map((h) => ({
                role: h.role,
                content: h.content,
                tool_calls: h.tool_calls,
            }));

            try {
                this.log.info('Sending prompt to Ollama', { model: this.modelName, turn });

                let response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.modelName,
                        messages,
                        stream: false,
                        tools: ollamaTools,
                    }),
                });

                // If model doesn't support tools, retry without them
                if (response.status === 400 && ollamaTools && ollamaTools.length > 0) {
                    this.log.warn('Model may not support tools, retrying without tools', {
                        model: this.modelName,
                    });
                    ollamaTools = undefined;

                    response = await fetch(`${this.baseUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: this.modelName,
                            messages,
                            stream: false,
                        }),
                    });
                }

                if (!response.ok) {
                    this.log.error('Ollama API error', { status: response.status });
                    throw new Error(`Ollama API Error: ${response.statusText}`);
                }

                const data = (await response.json()) as OllamaApiResponse;
                const message = data.message;
                const responseText = message?.content || '';

                // Push assistant response to history
                this.history.push({
                    role: message.role,
                    content: responseText,
                    tool_calls: message.tool_calls,
                });

                // Check for tool calls
                if (message.tool_calls && message.tool_calls.length > 0) {
                    this.log.info('Received tool calls from Ollama', {
                        count: message.tool_calls.length,
                    });

                    for (const toolCall of message.tool_calls) {
                        const functionName = toolCall.function.name;
                        const args = toolCall.function.arguments;

                        if (!mcpManager) {
                            this.history.push({
                                role: 'tool',
                                content: JSON.stringify({ error: 'McpManager not available' }),
                                name: functionName,
                            });
                            continue;
                        }

                        // Use base class method for tool execution with approval
                        const { result } = await this.executeToolWithApproval(
                            functionName,
                            args as Record<string, unknown>,
                            mcpManager,
                            onApproval,
                        );

                        this.history.push({
                            role: 'tool',
                            content: JSON.stringify(result),
                            name: functionName,
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

        return finalAnswer;
    }

    reset() {
        this.clearHistory();
    }
}
