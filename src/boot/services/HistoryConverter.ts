/**
 * HistoryConverter - Converts between unified Message[] format and provider-specific formats
 */
import { Message, GeminiContent, GeminiPart } from '../../shared/types';

/**
 * OpenAI-style message format (used by Copilot and Ollama)
 */
export interface OpenAIMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    tool_calls?: Array<{
        id?: string;
        function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
    name?: string;
}

/**
 * Converts between unified CLI history (Message[]) and provider-specific formats
 */
export class HistoryConverter {
    /**
     * Convert CLI Message[] to Gemini Content[] format
     */
    static toGeminiFormat(messages: Message[]): GeminiContent[] {
        const contents: GeminiContent[] = [];

        for (const msg of messages) {
            // Skip system messages for Gemini
            if (msg.role === 'system') continue;

            const role = msg.role === 'user' ? 'user' : 'model';
            const parts: GeminiPart[] = [];

            // Add text content
            if (msg.content) {
                parts.push({ text: msg.content });
            }

            // Handle tool calls (from assistant)
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                for (const tc of msg.tool_calls) {
                    const args =
                        typeof tc.function.arguments === 'string'
                            ? JSON.parse(tc.function.arguments)
                            : tc.function.arguments;

                    parts.push({
                        functionCall: {
                            name: tc.function.name,
                            args,
                        },
                    });
                }
            }

            // Handle tool role (function responses)
            if (msg.role === 'tool' && msg.mcpCalls && msg.mcpCalls.length > 0) {
                for (const call of msg.mcpCalls) {
                    parts.push({
                        functionResponse: {
                            name: call.toolName,
                            response: {
                                name: call.toolName,
                                content: call.output,
                            },
                        },
                    });
                }
            }

            if (parts.length > 0) {
                contents.push({ role, parts });
            }
        }

        return contents;
    }

    /**
     * Convert CLI Message[] to OpenAI format (for Copilot/Ollama)
     * Properly links tool_calls with their tool responses via tool_call_id
     */
    static toOpenAIFormat(messages: Message[]): OpenAIMessage[] {
        const result: OpenAIMessage[] = [];

        for (const msg of messages) {
            // Handle tool responses - need to link with tool_call_id
            if (msg.role === 'tool' && msg.mcpCalls && msg.mcpCalls.length > 0) {
                for (const call of msg.mcpCalls) {
                    result.push({
                        role: 'tool',
                        content: JSON.stringify(call.output),
                        tool_call_id: call.toolCallId || `call_${call.toolName}`,
                        name: call.toolName,
                    });
                }
                continue;
            }

            const openAIMsg: OpenAIMessage = {
                role: this.mapRoleToOpenAI(msg.role),
                content: msg.content || '',
            };

            // Handle tool calls from assistant
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                openAIMsg.tool_calls = msg.tool_calls.map((tc, idx) => ({
                    id: tc.id || `call_${tc.function.name}_${idx}`,
                    function: {
                        name: tc.function.name,
                        arguments:
                            typeof tc.function.arguments === 'string'
                                ? tc.function.arguments
                                : JSON.stringify(tc.function.arguments),
                    },
                }));
            }

            result.push(openAIMsg);
        }

        return result;
    }

    /**
     * Map unified role to OpenAI role
     */
    private static mapRoleToOpenAI(role: string): 'user' | 'assistant' | 'system' | 'tool' {
        switch (role) {
            case 'user':
                return 'user';
            case 'assistant':
            case 'model':
                return 'assistant';
            case 'tool':
                return 'tool';
            case 'system':
            default:
                return 'system';
        }
    }

    /**
     * Convert Gemini Content[] back to Message[] (for responses)
     */
    static fromGeminiContent(content: GeminiContent): Message {
        const textParts = content.parts
            .filter((p) => p.text)
            .map((p) => p.text)
            .join('');

        const toolCalls = content.parts
            .filter((p) => p.functionCall)
            .map((p) => ({
                function: {
                    name: p.functionCall!.name,
                    arguments: p.functionCall!.args,
                },
            }));

        return {
            role: content.role === 'model' ? 'assistant' : 'user',
            content: textParts,
            timestamp: new Date().toISOString(),
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        };
    }
}
