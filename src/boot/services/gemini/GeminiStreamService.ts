import { logger } from '../../lib/logger';
import { Content, Part } from './types';
import { responseValidator, InvalidStreamError } from './ResponseValidator';

const log = logger.gemini;

export interface StreamResult {
    content: Content;
    finishReason?: string;
    hasFinishReason: boolean;
}

export interface StreamOptions {
    /** Optional AbortSignal to cancel the stream */
    signal?: AbortSignal;
    /** Optional callback for each text chunk (for streaming UI) */
    onChunk?: (chunk: string) => void;
}

export class GeminiStreamService {
    /**
     * Consume a stream and return the aggregated content
     * @param stream - The stream to consume (Node.js ReadableStream or AsyncIterator)
     * @param options - Optional streaming options (signal, onChunk)
     */
    async consumeStream(
        stream: NodeJS.ReadableStream,
        options?: AbortSignal | StreamOptions,
    ): Promise<StreamResult> {
        // Handle both old signature (just signal) and new signature (options object)
        const signal = options instanceof AbortSignal ? options : options?.signal;
        const onChunk = options instanceof AbortSignal ? undefined : options?.onChunk;

        let accumulatedText = '';
        const functionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        const role = 'model';
        let finishReason: string | undefined;
        let hasFinishReason = false;

        // Helper to process a JSON chunk
        const processJson = (json: Record<string, unknown>) => {
            const response = json.response as Record<string, unknown> | undefined;
            const candidates = response?.candidates as Array<Record<string, unknown>> | undefined;
            const candidate = candidates?.[0];

            if (!candidate) return;

            // Extract finish reason if present
            if (candidate.finishReason) {
                finishReason = candidate.finishReason as string;
                hasFinishReason = true;
            }

            const content = candidate.content as Record<string, unknown> | undefined;
            if (!content) return;

            const parts = (content.parts || []) as Array<Record<string, unknown>>;
            for (const part of parts) {
                if (part.text) {
                    const textChunk = part.text as string;
                    accumulatedText += textChunk;
                    // Call streaming callback if provided
                    onChunk?.(textChunk);
                }
                if (part.functionCall) {
                    functionCalls.push(
                        part.functionCall as { name: string; args: Record<string, unknown> },
                    );
                }
            }
        };

        // Check abort before starting
        if (signal?.aborted) {
            throw new Error('Operation aborted');
        }

        // Buffer for incomplete lines across chunks
        let lineBuffer = '';

        if ('on' in stream && typeof stream.on === 'function') {
            await new Promise<void>((resolve, reject) => {
                // Handle abort signal
                const abortHandler = () => {
                    // Cast to Node.js stream type which has destroy
                    (stream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
                    reject(new Error('Operation aborted'));
                };

                if (signal) {
                    signal.addEventListener('abort', abortHandler);
                }

                stream.on('data', (d: Buffer | string) => {
                    if (signal?.aborted) return;
                    const { results, remaining } = this.parseChunkLines(lineBuffer + d.toString());
                    lineBuffer = remaining;
                    results.forEach(processJson);
                });

                stream.on('end', () => {
                    signal?.removeEventListener('abort', abortHandler);
                    // Try to parse any remaining buffer
                    if (lineBuffer.trim()) {
                        const { results } = this.parseChunkLines(lineBuffer);
                        results.forEach(processJson);
                    }
                    resolve();
                });

                stream.on('error', (err: Error) => {
                    signal?.removeEventListener('abort', abortHandler);
                    reject(err);
                });
            });
        } else if (Symbol.asyncIterator in stream) {
            for await (const chunk of stream as AsyncIterable<Buffer | string>) {
                if (signal?.aborted) {
                    throw new Error('Operation aborted');
                }
                const { results, remaining } = this.parseChunkLines(lineBuffer + chunk.toString());
                lineBuffer = remaining;
                results.forEach(processJson);
            }
            // Process any remaining buffer
            if (lineBuffer.trim()) {
                const { results } = this.parseChunkLines(lineBuffer);
                results.forEach(processJson);
            }
        }

        // Reconstruct final Content object
        const parts: Part[] = [];
        if (accumulatedText) parts.push({ text: accumulatedText });
        functionCalls.forEach((fc) => parts.push({ functionCall: fc }));

        const content: Content = { role, parts };

        return { content, finishReason, hasFinishReason };
    }

    /**
     * Consume stream with validation - throws on invalid responses
     */
    async consumeStreamWithValidation(
        stream: NodeJS.ReadableStream,
        options?: StreamOptions,
    ): Promise<Content> {
        const result = await this.consumeStream(stream, options);

        // Validate the stream result
        responseValidator.validateStreamCompletion(
            result.content,
            result.hasFinishReason,
            result.finishReason,
        );

        return result.content;
    }

    private parseChunkLines(data: string): {
        results: Array<Record<string, unknown>>;
        remaining: string;
    } {
        const results: Array<Record<string, unknown>> = [];
        const lines = data.split('\n');

        // Keep the last line as remaining (might be incomplete)
        const remaining = lines.pop() || '';

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                if (!jsonStr) continue;
                try {
                    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
                    results.push(parsed);
                } catch {
                    log.warn('[Gemini] Failed to parse JSON chunk:', jsonStr.substring(0, 200));
                }
            }
        }
        return { results, remaining };
    }
}

// Re-export for convenience
export { InvalidStreamError };
