/**
 * ResponseValidator - Validates Gemini API responses
 * Based on gemini-cli's validation patterns
 */
import { Content, Part } from './types';

/**
 * Custom error for invalid stream responses
 */
export class InvalidStreamError extends Error {
    readonly type:
        | 'NO_FINISH_REASON'
        | 'NO_RESPONSE_TEXT'
        | 'MALFORMED_FUNCTION_CALL'
        | 'EMPTY_CONTENT';

    constructor(
        message: string,
        type: 'NO_FINISH_REASON' | 'NO_RESPONSE_TEXT' | 'MALFORMED_FUNCTION_CALL' | 'EMPTY_CONTENT',
    ) {
        super(message);
        this.name = 'InvalidStreamError';
        this.type = type;
    }
}

export class ResponseValidator {
    /**
     * Validate a complete API response
     */
    isValidResponse(response: unknown): boolean {
        if (!response || typeof response !== 'object') return false;

        const resp = response as Record<string, unknown>;
        const candidates = resp.candidates as unknown[] | undefined;

        if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
            return false;
        }

        const firstCandidate = candidates[0] as Record<string, unknown> | undefined;
        if (!firstCandidate) return false;

        const content = firstCandidate.content as Content | undefined;
        if (!content) return false;

        return this.isValidContent(content);
    }

    /**
     * Validate a Content object
     */
    isValidContent(content: Content): boolean {
        if (!content.parts || !Array.isArray(content.parts) || content.parts.length === 0) {
            return false;
        }

        for (const part of content.parts) {
            if (!part || typeof part !== 'object' || Object.keys(part).length === 0) {
                return false;
            }
            // Empty text (not in a thought) is invalid
            if (part.text !== undefined && part.text === '' && !this.isThoughtPart(part)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a part is a valid text part (not a thought)
     */
    isValidNonThoughtTextPart(part: Part): boolean {
        return (
            typeof part.text === 'string' &&
            !this.isThoughtPart(part) &&
            !part.functionCall &&
            !part.functionResponse
        );
    }

    /**
     * Check if a part is a thought part
     */
    private isThoughtPart(part: unknown): boolean {
        return !!(part && typeof part === 'object' && 'thought' in part);
    }

    /**
     * Check if response has a valid finish reason
     */
    hasValidFinishReason(response: unknown): boolean {
        if (!response || typeof response !== 'object') return false;

        const resp = response as Record<string, unknown>;
        const candidates = resp.candidates as unknown[] | undefined;

        if (!candidates || !Array.isArray(candidates)) return false;

        return candidates.some((candidate) => {
            if (!candidate || typeof candidate !== 'object') return false;
            return 'finishReason' in candidate;
        });
    }

    /**
     * Check if response contains tool calls
     */
    hasToolCalls(content: Content): boolean {
        return content.parts?.some((part) => !!part.functionCall) ?? false;
    }

    /**
     * Validate and throw specific errors for stream completion
     */
    validateStreamCompletion(
        content: Content,
        hasFinishReason: boolean,
        finishReason?: string,
    ): void {
        const hasToolCall = this.hasToolCalls(content);

        // If there's a tool call, validation passes
        if (hasToolCall) {
            return;
        }

        // Check finish reason
        if (!hasFinishReason) {
            throw new InvalidStreamError(
                'Model stream ended without a finish reason.',
                'NO_FINISH_REASON',
            );
        }

        // Check for malformed function call
        if (finishReason === 'MALFORMED_FUNCTION_CALL') {
            throw new InvalidStreamError(
                'Model stream ended with malformed function call.',
                'MALFORMED_FUNCTION_CALL',
            );
        }

        // Check for empty response text
        const responseText = content.parts
            ?.filter((p) => p.text)
            .map((p) => p.text)
            .join('')
            .trim();

        if (!responseText) {
            throw new InvalidStreamError(
                'Model stream ended with empty response text.',
                'NO_RESPONSE_TEXT',
            );
        }
    }
}

// Singleton instance
export const responseValidator = new ResponseValidator();
