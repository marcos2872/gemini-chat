/**
 * CopilotStreamService - Handles SSE streaming for Copilot API
 * Parses Server-Sent Events in OpenAI format
 */

import { OpenAIMessage } from '../HistoryConverter';
import { createLogger } from '../../lib/logger';

const log = createLogger('CopilotStream');

export interface CopilotStreamOptions {
    /** Optional AbortSignal to cancel the stream */
    signal?: AbortSignal;
    /** Optional callback for each text chunk (for streaming UI) */
    onChunk?: (chunk: string) => void;
}

export interface CopilotStreamResult {
    /** The accumulated message from the stream */
    message: OpenAIMessage;
    /** Finish reason from the API */
    finishReason?: string;
}

interface OpenAIStreamDelta {
    role?: 'assistant';
    content?: string;
    tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
            name?: string;
            arguments?: string;
        };
    }>;
}

interface OpenAIStreamChoice {
    index: number;
    delta: OpenAIStreamDelta;
    finish_reason?: string | null;
}

interface OpenAIStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: OpenAIStreamChoice[];
}

export class CopilotStreamService {
    /**
     * Consume an SSE stream from Copilot API
     * @param response - Fetch Response with streaming body
     * @param options - Streaming options (signal, onChunk)
     */
    async consumeStream(
        response: Response,
        options?: CopilotStreamOptions,
    ): Promise<CopilotStreamResult> {
        const signal = options?.signal;
        const onChunk = options?.onChunk;

        if (!response.body) {
            throw new Error('Response body is not available for streaming');
        }

        // Check abort before starting
        if (signal?.aborted) {
            throw new Error('Operation aborted');
        }

        let accumulatedContent = '';
        let finishReason: string | undefined;
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let readerDone = false;
        try {
            while (!readerDone) {
                if (signal?.aborted) {
                    reader.cancel();
                    throw new Error('Operation aborted');
                }

                const result = await reader.read();
                readerDone = result.done;
                const value = result.value;
                if (readerDone) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonStr = line.slice(6).trim();

                        if (jsonStr === '[DONE]') {
                            continue;
                        }

                        try {
                            const chunk = JSON.parse(jsonStr) as OpenAIStreamChunk;

                            for (const choice of chunk.choices) {
                                const delta = choice.delta;

                                // Accumulate content
                                if (delta.content) {
                                    accumulatedContent += delta.content;
                                    onChunk?.(delta.content);
                                }

                                // Handle tool calls (streamed incrementally)
                                if (delta.tool_calls) {
                                    for (const tc of delta.tool_calls) {
                                        const existing = toolCalls.get(tc.index);
                                        if (existing) {
                                            // Append to existing tool call
                                            if (tc.function?.arguments) {
                                                existing.arguments += tc.function.arguments;
                                            }
                                        } else {
                                            // New tool call
                                            toolCalls.set(tc.index, {
                                                id: tc.id || `call_${tc.index}`,
                                                name: tc.function?.name || '',
                                                arguments: tc.function?.arguments || '',
                                            });
                                        }
                                    }
                                }

                                // Capture finish reason
                                if (choice.finish_reason) {
                                    finishReason = choice.finish_reason;
                                }
                            }
                        } catch {
                            log.warn('Failed to parse stream chunk', { data: jsonStr });
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        // Build the final message
        const message: OpenAIMessage = {
            role: 'assistant',
            content: accumulatedContent,
        };

        // Add tool calls if present
        if (toolCalls.size > 0) {
            message.tool_calls = Array.from(toolCalls.values()).map((tc) => ({
                id: tc.id,
                function: {
                    name: tc.name,
                    arguments: tc.arguments,
                },
            }));
        }

        return { message, finishReason };
    }
}

// Export singleton
export const copilotStreamService = new CopilotStreamService();
