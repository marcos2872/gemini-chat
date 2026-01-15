/**
 * Centralized Logger Module
 * Uses electron-log for structured logging with file rotation
 */
import log from 'electron-log';
import * as path from 'path';
import * as os from 'os';

// Configure log file location
const logPath = path.join(os.homedir(), '.gemini-desktop', 'logs');
log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');

// Configure log format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope}: {text}';
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {scope}: {text}';

// Configure log levels
log.transports.file.level = 'info';
log.transports.console.level = process.env.IS_DEV ? 'debug' : 'info';

// Configure file rotation (max 5 files, 5MB each)
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB

/**
 * Create a scoped logger for a specific module
 */
export function createLogger(scope: string) {
    return log.scope(scope);
}

/**
 * Pre-configured loggers for each module
 */
export const logger = {
    main: createLogger('Main'),
    gemini: createLogger('Gemini'),
    copilot: createLogger('Copilot'),
    mcp: createLogger('MCP'),
    auth: createLogger('Auth'),
    ipc: createLogger('IPC'),
    storage: createLogger('Storage'),
};

// Export the base log for direct use if needed
export default log;
