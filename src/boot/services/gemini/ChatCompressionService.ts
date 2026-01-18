/**
 * ChatCompressionService - Compresses chat history to stay within token limits
 * Based on gemini-cli's chatCompressionService
 */
import { Content } from './types';
import { createLogger } from '../../lib/logger';

const log = createLogger('ChatCompression');

/**
 * Default threshold for compression as a fraction of model's token limit
 * If history exceeds this, compression will be triggered
 */
export const DEFAULT_COMPRESSION_THRESHOLD = 0.5;

/**
 * Fraction of latest history to preserve after compression
 * 0.3 = keep the last 30% of messages intact
 */
export const COMPRESSION_PRESERVE_FRACTION = 0.3;

/**
 * Approximate token limits for different models
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
    'gemini-2.5-flash': 1048576,
    'gemini-2.5-pro': 1048576,
    'gemini-2.0-flash': 1048576,
    'gemini-1.5-flash': 1048576,
    'gemini-1.5-pro': 2097152,
    default: 128000,
};

export interface CompressionResult {
    /** Whether compression was performed */
    compressed: boolean;
    /** New history after compression (or original if not compressed) */
    newHistory: Content[];
    /** Original token count estimate */
    originalTokenCount: number;
    /** New token count estimate after compression */
    newTokenCount: number;
    /** Reason for compression status */
    status: 'NOOP' | 'COMPRESSED' | 'SKIPPED_TOO_SHORT';
}

export class ChatCompressionService {
    /**
     * Get token limit for a model
     */
    getTokenLimit(model: string): number {
        return MODEL_TOKEN_LIMITS[model] || MODEL_TOKEN_LIMITS.default;
    }

    /**
     * Estimate token count from content (rough approximation: 4 chars = 1 token)
     */
    estimateTokenCount(contents: Content[]): number {
        const charCount = contents.reduce((total, content) => {
            return (
                total +
                content.parts.reduce((partTotal, part) => {
                    if (part.text) return partTotal + part.text.length;
                    if (part.functionCall)
                        return partTotal + JSON.stringify(part.functionCall).length;
                    if (part.functionResponse)
                        return partTotal + JSON.stringify(part.functionResponse).length;
                    return partTotal;
                }, 0)
            );
        }, 0);
        return Math.ceil(charCount / 4);
    }

    /**
     * Check if compression is needed based on token count threshold
     */
    shouldCompress(
        history: Content[],
        model: string,
        threshold = DEFAULT_COMPRESSION_THRESHOLD,
    ): boolean {
        const tokenCount = this.estimateTokenCount(history);
        const limit = this.getTokenLimit(model);
        return tokenCount > limit * threshold;
    }

    /**
     * Find the split point for compression
     * Returns the index where we should start preserving messages
     */
    findSplitPoint(contents: Content[], preserveFraction = COMPRESSION_PRESERVE_FRACTION): number {
        if (contents.length === 0) return 0;

        // Calculate total character count
        const charCounts = contents.map((c) => JSON.stringify(c).length);
        const totalCharCount = charCounts.reduce((a, b) => a + b, 0);
        const targetCharCount = totalCharCount * (1 - preserveFraction);

        let cumulativeCharCount = 0;
        let lastValidSplitPoint = 0;

        for (let i = 0; i < contents.length; i++) {
            const content = contents[i];

            // Only split at user messages (not in the middle of tool calls)
            if (content.role === 'user' && !content.parts?.some((p) => !!p.functionResponse)) {
                if (cumulativeCharCount >= targetCharCount) {
                    return i;
                }
                lastValidSplitPoint = i;
            }

            cumulativeCharCount += charCounts[i];
        }

        // Check if we can compress everything
        const lastContent = contents[contents.length - 1];
        if (lastContent?.role === 'model' && !lastContent?.parts?.some((p) => p.functionCall)) {
            return contents.length;
        }

        return lastValidSplitPoint;
    }

    /**
     * Generate a summary of the compressed history
     * This is a simple summarization - in production you might use the LLM itself
     */
    generateSummary(historyToCompress: Content[]): string {
        const messages: string[] = [];

        for (const content of historyToCompress) {
            const role = content.role === 'user' ? 'User' : 'Assistant';

            for (const part of content.parts) {
                if (part.text) {
                    // Truncate long messages
                    const text =
                        part.text.length > 200 ? part.text.substring(0, 200) + '...' : part.text;
                    messages.push(`${role}: ${text}`);
                }
                if (part.functionCall) {
                    messages.push(`Assistant used tool: ${part.functionCall.name}`);
                }
            }
        }

        // Create a condensed summary
        const summary = `<previous_conversation_summary>
The conversation so far covered:
${messages.slice(0, 10).join('\n')}
${messages.length > 10 ? `... and ${messages.length - 10} more exchanges` : ''}
</previous_conversation_summary>`;

        return summary;
    }

    /**
     * Compress the chat history
     * @param history - Current chat history
     * @param model - Model name for token limit calculation
     * @param force - Force compression even if under threshold
     */
    compress(history: Content[], model: string, force = false): CompressionResult {
        const originalTokenCount = this.estimateTokenCount(history);

        // Check if compression is needed
        if (!force && !this.shouldCompress(history, model)) {
            return {
                compressed: false,
                newHistory: history,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'NOOP',
            };
        }

        // Don't compress if history is too short
        if (history.length < 4) {
            log.debug('History too short to compress', { length: history.length });
            return {
                compressed: false,
                newHistory: history,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'SKIPPED_TOO_SHORT',
            };
        }

        // Find split point
        const splitPoint = this.findSplitPoint(history);

        if (splitPoint === 0) {
            log.debug('No valid split point found');
            return {
                compressed: false,
                newHistory: history,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'NOOP',
            };
        }

        const historyToCompress = history.slice(0, splitPoint);
        const historyToKeep = history.slice(splitPoint);

        // Generate summary
        const summary = this.generateSummary(historyToCompress);

        // Create new compressed history
        const newHistory: Content[] = [
            {
                role: 'user',
                parts: [{ text: summary }],
            },
            {
                role: 'model',
                parts: [
                    {
                        text: 'Got it, I understand the previous context. How can I help you continue?',
                    },
                ],
            },
            ...historyToKeep,
        ];

        const newTokenCount = this.estimateTokenCount(newHistory);

        log.info('Chat history compressed', {
            originalMessages: history.length,
            newMessages: newHistory.length,
            originalTokens: originalTokenCount,
            newTokens: newTokenCount,
            reduction: `${Math.round((1 - newTokenCount / originalTokenCount) * 100)}%`,
        });

        return {
            compressed: true,
            newHistory,
            originalTokenCount,
            newTokenCount,
            status: 'COMPRESSED',
        };
    }
}

// Singleton instance
export const chatCompressionService = new ChatCompressionService();
