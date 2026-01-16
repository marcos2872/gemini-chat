import { logger } from '../../lib/logger';
import { Content, Part } from './types';

const log = logger.gemini;

export class GeminiStreamService {
    async consumeStream(stream: any): Promise<Content> {
        let accumulatedText = '';
        const functionCalls: any[] = [];
        const role = 'model'; // Default response role

        // Helper to process a JSON chunk
        const processJson = (json: any) => {
            const candidate = json.response?.candidates?.[0];
            if (!candidate || !candidate.content) return;

            const parts = candidate.content.parts || [];
            for (const part of parts) {
                if (part.text) accumulatedText += part.text;
                if (part.functionCall) functionCalls.push(part.functionCall);
            }
        };

        if (stream.on) {
            await new Promise<void>((resolve, reject) => {
                stream.on('data', (d: any) => {
                    this.parseChunkLines(d).forEach(processJson);
                });
                stream.on('end', resolve);
                stream.on('error', reject);
            });
        } else if (stream[Symbol.asyncIterator]) {
            for await (const chunk of stream) {
                this.parseChunkLines(chunk).forEach(processJson);
            }
        }

        // Reconstruct final Content object
        const parts: Part[] = [];
        if (accumulatedText) parts.push({ text: accumulatedText });
        functionCalls.forEach((fc) => parts.push({ functionCall: fc }));

        return { role, parts };
    }

    private parseChunkLines(chunk: any): any[] {
        const str = chunk.toString();
        const results = [];
        const lines = str.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                    const parsed = JSON.parse(jsonStr);
                    // log.debug('[Gemini] Parsed JSON:', JSON.stringify(parsed));
                    results.push(parsed);
                } catch {
                    log.warn('[Gemini] Failed to parse JSON chunk:', jsonStr);
                }
            }
        }
        return results;
    }
}
