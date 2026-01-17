import { logger } from './lib/logger';
import { OllamaToolService } from './services/ollama/OllamaToolService';
import { IMcpManager, ApprovalCallback } from '../shared/types';

const log = logger.ollama;

export class OllamaClient {
    public modelName: string;
    public history: any[];
    private baseUrl: string;
    private toolService: OllamaToolService;

    constructor() {
        this.modelName = 'llama3'; // Default model
        this.history = [];
        this.baseUrl = 'http://localhost:11434';
        this.toolService = new OllamaToolService();
    }

    async initialize() {
        // No explicit auth needed for local Ollama
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
                log.info('Ollama connection verified');
            }
            return response.ok;
        } catch (e: any) {
            log.warn('Ollama connection check failed', { error: e.message });
            return false;
        }
    }

    async setModel(model: string) {
        this.modelName = model;
        log.info('Model set', { model });
    }

    async listModels(): Promise<Array<{ name: string; displayName: string }>> {
        try {
            log.info('Fetching available models');
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];

            const data: any = await response.json();
            // data.models is the array

            return (data.models || []).map((m: any) => ({
                name: m.name,
                displayName: m.name,
            }));
        } catch (e: any) {
            log.error('Failed to list models', { error: e.message });
            return [];
        }
    }

    // Standardize to match other clients
    async sendPrompt(prompt: string, mcpManager?: IMcpManager, onApproval?: ApprovalCallback) {
        // 1. Add user message
        this.history.push({ role: 'user', content: prompt });

        // 2. Prepare Tools
        let ollamaTools: any[] | undefined = undefined;
        if (mcpManager) {
            const tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                ollamaTools = this.toolService.mapToolsToOllama(tools);
                log.info('Mapped MCP tools for Ollama', { count: ollamaTools.length });
            }
        }

        const MAX_TURNS = 10;
        let turn = 0;
        let finalAnswer = '';

        while (turn < MAX_TURNS) {
            // Prepare messages for this turn
            const messages = this.history.map((h) => ({
                role: h.role,
                content: h.content,
                // Include tool_calls if present in history interactions
                tool_calls: h.tool_calls,
            }));

            try {
                log.info('Sending prompt to Ollama', { model: this.modelName, turn });
                const response = await fetch(`${this.baseUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: this.modelName,
                        messages: messages,
                        stream: false,
                        tools: ollamaTools,
                    }),
                });

                if (!response.ok) {
                    log.error('Ollama API error', { status: response.status });
                    throw new Error(`Ollama API Error: ${response.statusText}`);
                }

                const data: any = await response.json();
                const message = data.message;
                const responseText = message?.content || '';

                // Push assistant response to history
                // Note: Ollama expects the full message object for tool use history context
                this.history.push({
                    role: message.role,
                    content: responseText,
                    tool_calls: message.tool_calls,
                });

                // Check for tool calls
                if (message.tool_calls && message.tool_calls.length > 0) {
                    log.info('Received tool calls from Ollama', {
                        count: message.tool_calls.length,
                    });

                    for (const toolCall of message.tool_calls) {
                        const functionName = toolCall.function.name;
                        const args = toolCall.function.arguments;

                        let result: any;
                        let approved = true;

                        // Approval logic
                        if (typeof onApproval === 'function') {
                            approved = await onApproval(functionName, args);
                        }

                        if (!approved) {
                            log.warn('Tool execution rejected', { tool: functionName });
                            result = { error: 'User denied tool execution.' };
                        } else {
                            // Execute Code
                            try {
                                if (!mcpManager) throw new Error('McpManager not available');
                                result = await mcpManager.callTool(functionName, args);
                                log.debug('Tool executed', { tool: functionName });
                            } catch (e: any) {
                                log.error('Tool execution failed', {
                                    tool: functionName,
                                    error: e.message,
                                });
                                result = { error: e.message };
                            }
                        }

                        // Add tool result to history
                        this.history.push({
                            role: 'tool',
                            content: JSON.stringify(result),
                            // IMPORTANT: Is this naming standard for Ollama?
                            // Ollama mimics OpenAI: role: 'tool', tool_call_id: ...?
                            // Ollama docs say "role": "tool", "content": "result"
                            // But usually also needs to link back to the call?
                            // For now assuming simplified array flow if ID not strictly enforced or handled by lib
                            // checking local docs/examples, Ollama often just needs the sequence.
                            // but OpenAI format usually requires tool_call_id.
                            // Since we don't have IDs in the 'toolCall' object from Ollama sometimes (depending on version),
                            // we will just push. If issues arise, we'll verify Ollama version support.
                            name: functionName,
                        });
                    }

                    // Continue to next turn to let model interpret results
                    turn++;
                } else {
                    // No tools called, this is the final answer
                    finalAnswer = responseText;
                    log.info('Received final response from Ollama', { length: finalAnswer.length });
                    break;
                }
            } catch (e: any) {
                log.error('Ollama request failed', { error: e.message });

                if (e.message.includes('fetch failed') || e.code === 'ECONNREFUSED') {
                    throw new Error(
                        '📡 Não foi possível conectar ao Ollama. Verifique se ele está rodando (http://localhost:11434).',
                    );
                }

                throw new Error(`Erro no Ollama: ${e.message}`);
            }
        }

        return finalAnswer;
    }

    getHistory() {
        return this.history;
    }

    reset() {
        this.history = [];
    }
}
