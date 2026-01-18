/**
 * RetryService - Provides retry logic with exponential backoff
 * Based on gemini-cli's retry patterns
 */
import { createLogger } from '../lib/logger';

const log = createLogger('RetryService');

export interface RetryOptions {
    /** Maximum number of attempts (1 = no retry) */
    maxAttempts: number;
    /** Initial delay in milliseconds */
    initialDelayMs: number;
    /** Maximum delay in milliseconds */
    maxDelayMs: number;
    /** Optional abort signal */
    signal?: AbortSignal;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
};

/**
 * Error codes that are safe to retry
 */
const RETRYABLE_ERROR_PATTERNS = [
    '429', // Too Many Requests
    '503', // Service Unavailable
    '502', // Bad Gateway
    '504', // Gateway Timeout
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'fetch failed',
    'network',
    'socket hang up',
    'resource exhausted',
    'rate limit',
];

export class RetryService {
    /**
     * Execute a function with retry logic and exponential backoff
     */
    async withRetry<T>(fn: () => Promise<T>, options: Partial<RetryOptions> = {}): Promise<T> {
        const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
        let lastError: Error = new Error('Retry failed');

        for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
            // Check if aborted before attempting
            if (opts.signal?.aborted) {
                throw new Error('Operation aborted');
            }

            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;
                const isLast = attempt === opts.maxAttempts - 1;

                if (isLast) {
                    log.error('All retry attempts exhausted', {
                        attempts: opts.maxAttempts,
                        error: lastError.message,
                    });
                    throw lastError;
                }

                if (!this.isRetryableError(lastError)) {
                    log.debug('Non-retryable error, failing immediately', {
                        error: lastError.message,
                    });
                    throw lastError;
                }

                // Check if aborted before waiting
                if (opts.signal?.aborted) {
                    throw new Error('Operation aborted');
                }

                const delayMs = this.calculateDelay(attempt, opts);
                log.info('Retrying after error', {
                    attempt: attempt + 1,
                    maxAttempts: opts.maxAttempts,
                    delayMs,
                    error: lastError.message,
                });

                await this.sleep(delayMs, opts.signal);
            }
        }

        throw lastError;
    }

    /**
     * Check if an error is retryable based on known patterns
     */
    isRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        return RETRYABLE_ERROR_PATTERNS.some(
            (pattern) =>
                message.includes(pattern.toLowerCase()) ||
                error.name.toLowerCase().includes(pattern.toLowerCase()),
        );
    }

    /**
     * Calculate delay with exponential backoff
     */
    private calculateDelay(attempt: number, opts: RetryOptions): number {
        // Exponential backoff: initialDelay * 2^attempt
        const exponentialDelay = opts.initialDelayMs * Math.pow(2, attempt);
        // Add jitter (±25%) to prevent thundering herd
        const jitter = exponentialDelay * 0.25 * (Math.random() - 0.5);
        const delay = Math.min(exponentialDelay + jitter, opts.maxDelayMs);
        return Math.round(delay);
    }

    /**
     * Sleep for a duration, respecting abort signal
     */
    private sleep(ms: number, signal?: AbortSignal): Promise<void> {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new Error('Operation aborted'));
                return;
            }

            const timeout = setTimeout(resolve, ms);

            signal?.addEventListener('abort', () => {
                clearTimeout(timeout);
                reject(new Error('Operation aborted'));
            });
        });
    }
}

// Singleton instance for convenience
export const retryService = new RetryService();
