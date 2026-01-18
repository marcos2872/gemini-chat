/**
 * UnifiedCompressionService - Compresses chat history in unified Message[] format
 * Works with the CLI's conversation.messages as single source of truth
 */
import { Message } from '../../shared/types';
import { createLogger } from '../lib/logger';

const log = createLogger('UnifiedCompression');

/**
 * Default threshold for compression as a fraction of model's token limit
 */
export const DEFAULT_COMPRESSION_THRESHOLD = 0.5;

/**
 * Fraction of latest history to preserve after compression
 */
export const COMPRESSION_PRESERVE_FRACTION = 0.3;

/**
 * Approximate token limits for different models
 */
const MODEL_TOKEN_LIMITS: Record<string, number> = {
    // Gemini models
    'gemini-2.5-flash': 1048576,
    'gemini-2.5-pro': 1048576,
    'gemini-2.0-flash': 1048576,
    'gemini-1.5-flash': 1048576,
    'gemini-1.5-pro': 2097152,
    // OpenAI/Copilot models
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4': 128000,
    'gpt-4-turbo': 128000,
    'gpt-3.5-turbo': 16385,
    o1: 128000,
    'o1-mini': 128000,
    // Ollama models (typical defaults)
    llama3: 8192,
    'llama3.1': 128000,
    'llama3.2': 128000,
    mistral: 32768,
    codellama: 16384,
    // Default
    default: 32000,
};

export interface CompressionResult {
    /** Whether compression was performed */
    compressed: boolean;
    /** New history after compression (or original if not compressed) */
    newHistory: Message[];
    /** Original token count estimate */
    originalTokenCount: number;
    /** New token count estimate after compression */
    newTokenCount: number;
    /** Reason for compression status */
    status: 'NOOP' | 'COMPRESSED' | 'SKIPPED_TOO_SHORT';
}

export class UnifiedCompressionService {
    /**
     * Get token limit for a model
     */
    getTokenLimit(model: string): number {
        // Try exact match first
        if (MODEL_TOKEN_LIMITS[model]) {
            return MODEL_TOKEN_LIMITS[model];
        }
        // Try prefix match
        for (const [prefix, limit] of Object.entries(MODEL_TOKEN_LIMITS)) {
            if (model.startsWith(prefix)) {
                return limit;
            }
        }
        return MODEL_TOKEN_LIMITS.default;
    }

    /**
     * Estimate token count from messages (rough approximation: 4 chars = 1 token)
     */
    estimateTokenCount(messages: Message[]): number {
        const charCount = messages.reduce((total, msg) => {
            let msgSize = msg.content?.length || 0;

            // Add tool calls
            if (msg.tool_calls) {
                msgSize += JSON.stringify(msg.tool_calls).length;
            }

            // Add MCP calls
            if (msg.mcpCalls) {
                msgSize += JSON.stringify(msg.mcpCalls).length;
            }

            return total + msgSize;
        }, 0);

        return Math.ceil(charCount / 4);
    }

    /**
     * Check if compression is needed based on token count threshold
     */
    shouldCompress(
        messages: Message[],
        model: string,
        threshold = DEFAULT_COMPRESSION_THRESHOLD,
    ): boolean {
        const tokenCount = this.estimateTokenCount(messages);
        const limit = this.getTokenLimit(model);
        return tokenCount > limit * threshold;
    }

    /**
     * Find the split point for compression
     */
    findSplitPoint(messages: Message[], preserveFraction = COMPRESSION_PRESERVE_FRACTION): number {
        if (messages.length === 0) return 0;

        const charCounts = messages.map((m) => JSON.stringify(m).length);
        const totalCharCount = charCounts.reduce((a, b) => a + b, 0);
        const targetCharCount = totalCharCount * (1 - preserveFraction);

        let cumulativeCharCount = 0;
        let lastValidSplitPoint = 0;

        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            // Only split at user messages (not in the middle of tool calls)
            if (msg.role === 'user' && !msg.tool_calls) {
                if (cumulativeCharCount >= targetCharCount) {
                    return i;
                }
                lastValidSplitPoint = i;
            }

            cumulativeCharCount += charCounts[i];
        }

        return lastValidSplitPoint;
    }

    /**
     * Generate a summary of the compressed history
     */
    generateSummary(historyToCompress: Message[]): string {
        const summaryLines: string[] = [];

        for (const msg of historyToCompress) {
            const role = msg.role === 'user' ? 'User' : 'Assistant';

            if (msg.content) {
                const text =
                    msg.content.length > 150 ? msg.content.substring(0, 150) + '...' : msg.content;
                summaryLines.push(`${role}: ${text}`);
            }

            if (msg.tool_calls && msg.tool_calls.length > 0) {
                const tools = msg.tool_calls.map((t) => t.function.name).join(', ');
                summaryLines.push(`Assistant used tools: ${tools}`);
            }
        }

        // Take first 10 lines
        const summary = `<previous_conversation_summary>
The conversation so far covered:
${summaryLines.slice(0, 10).join('\n')}
${summaryLines.length > 10 ? `... and ${summaryLines.length - 10} more exchanges` : ''}
</previous_conversation_summary>`;

        return summary;
    }

    /**
     * Compress the chat history
     */
    compress(messages: Message[], model: string, force = false): CompressionResult {
        const originalTokenCount = this.estimateTokenCount(messages);

        // Check if compression is needed
        if (!force && !this.shouldCompress(messages, model)) {
            return {
                compressed: false,
                newHistory: messages,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'NOOP',
            };
        }

        // Don't compress if history is too short
        if (messages.length < 4) {
            log.debug('History too short to compress', { length: messages.length });
            return {
                compressed: false,
                newHistory: messages,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'SKIPPED_TOO_SHORT',
            };
        }

        // Find split point
        const splitPoint = this.findSplitPoint(messages);

        if (splitPoint === 0) {
            log.debug('No valid split point found');
            return {
                compressed: false,
                newHistory: messages,
                originalTokenCount,
                newTokenCount: originalTokenCount,
                status: 'NOOP',
            };
        }

        const historyToCompress = messages.slice(0, splitPoint);
        const historyToKeep = messages.slice(splitPoint);

        // Generate summary
        const summary = this.generateSummary(historyToCompress);

        // Create new compressed history
        const timestamp = new Date().toISOString();
        const newHistory: Message[] = [
            {
                role: 'user',
                content: summary,
                timestamp,
            },
            {
                role: 'assistant',
                content: 'Got it, I understand the previous context. How can I help you continue?',
                timestamp,
            },
            ...historyToKeep,
        ];

        const newTokenCount = this.estimateTokenCount(newHistory);

        log.info('Chat history compressed', {
            originalMessages: messages.length,
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
export const unifiedCompressionService = new UnifiedCompressionService();
