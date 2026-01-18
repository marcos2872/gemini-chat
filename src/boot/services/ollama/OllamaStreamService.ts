/**
 * OllamaStreamService - Handles NDJSON streaming for Ollama API
 * Parses newline-delimited JSON responses from Ollama
 */

import { createLogger } from '../../lib/logger';

const log = createLogger('OllamaStream');

export interface OllamaStreamOptions {
    /** Optional AbortSignal to cancel the stream */
    signal?: AbortSignal;
    /** Optional callback for each text chunk (for streaming UI) */
    onChunk?: (chunk: string) => void;
}

export interface OllamaStreamResult {
    /** The accumulated response content */
    content: string;
    /** Tool calls if model supports them */
    toolCalls?: Array<{
        function: { name: string; arguments: Record<string, unknown> };
    }>;
    /** Whether the stream completed successfully */
    done: boolean;
}

interface OllamaStreamChunk {
    model: string;
    created_at: string;
    message?: {
        role: string;
        content: string;
        tool_calls?: Array<{
            function: { name: string; arguments: Record<string, unknown> };
        }>;
    };
    done: boolean;
    done_reason?: string;
}

export class OllamaStreamService {
    /**
     * Consume an NDJSON stream from Ollama API
     * @param response - Fetch Response with streaming body
     * @param options - Streaming options (signal, onChunk)
     */
    async consumeStream(
        response: Response,
        options?: OllamaStreamOptions,
    ): Promise<OllamaStreamResult> {
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
        let toolCalls:
            | Array<{ function: { name: string; arguments: Record<string, unknown> } }>
            | undefined;
        let done = false;

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        let streamDone = false;
        try {
            while (!streamDone) {
                if (signal?.aborted) {
                    reader.cancel();
                    throw new Error('Operation aborted');
                }

                const result = await reader.read();
                streamDone = result.done;
                const value = result.value;
                if (streamDone) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');

                // Keep the last incomplete line in buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed) continue;

                    try {
                        const chunk = JSON.parse(trimmed) as OllamaStreamChunk;

                        // Accumulate content from message
                        if (chunk.message?.content) {
                            accumulatedContent += chunk.message.content;
                            onChunk?.(chunk.message.content);
                        }

                        // Capture tool calls (sent in final chunk)
                        if (chunk.message?.tool_calls) {
                            toolCalls = chunk.message.tool_calls;
                        }

                        // Check if done
                        if (chunk.done) {
                            done = true;
                        }
                    } catch {
                        log.warn('Failed to parse stream chunk', { data: trimmed });
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        return {
            content: accumulatedContent,
            toolCalls,
            done,
        };
    }
}

// Export singleton
export const ollamaStreamService = new OllamaStreamService();
