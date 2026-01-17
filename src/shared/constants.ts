/**
 * Global application constants to avoid magic numbers/strings
 */
export const UI_CONFIG = {
    /** Number of models to show in the selector before scrolling */
    MODEL_SELECTOR_WINDOW_SIZE: 10,
} as const;

export const AUTH_CONFIG = {
    /** Timeout for device code polling (10 minutes) */
    POLL_TIMEOUT_MS: 10 * 60 * 1000,
    /** Interval between polling attempts */
    POLL_INTERVAL_MS: 5000,
} as const;
