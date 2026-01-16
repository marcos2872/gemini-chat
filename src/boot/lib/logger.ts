/**
 * Centralized Logger Module
 * Simple file logger for CLI environment
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Configure log file location
const logPath = path.join(os.homedir(), '.gemini-desktop', 'logs');
const logFile = path.join(logPath, 'cli.log');

// Ensure log directory exists
try {
    if (!fs.existsSync(logPath)) {
        fs.mkdirSync(logPath, { recursive: true });
    }
} catch (e) {
    console.error('Failed to create log directory', e);
}

function formatMsg(level: string, scope: string, text: any, meta?: any) {
    const now = new Date();
    const ts = now.toISOString();
    let msg = text;
    if (typeof text !== 'string') {
        try {
            msg = JSON.stringify(text);
        } catch {
            msg = String(text);
        }
    }
    if (meta !== undefined) {
        try {
            msg += ' ' + JSON.stringify(meta);
        } catch {
            msg += ' [Meta Error]';
        }
    }
    return `[${ts}] [${level}] ${scope}: ${msg}\n`;
}

function writeLog(level: string, scope: string, text: any, meta?: any) {
    const entry = formatMsg(level, scope, text, meta);
    try {
        fs.appendFileSync(logFile, entry);
    } catch (e) {
        console.error('Failed to write to log', e);
    }
}

class ScopeLogger {
    private scope: string;

    constructor(scope: string) {
        this.scope = scope;
    }

    info(text: any, meta?: any) {
        writeLog('INFO', this.scope, text, meta);
    }

    warn(text: any, meta?: any) {
        writeLog('WARN', this.scope, text, meta);
    }

    error(text: any, meta?: any) {
        writeLog('ERROR', this.scope, text, meta);
    }

    debug(_text: any) {
        // Uncomment to enable debug logs
        // writeLog('DEBUG', this.scope, text);
    }

    log(text: any) {
        writeLog('INFO', this.scope, text);
    }
}

export function createLogger(scope: string) {
    return new ScopeLogger(scope);
}

export const logger = {
    main: createLogger('Main'),
    gemini: createLogger('Gemini'),
    copilot: createLogger('Copilot'),
    ollama: createLogger('Ollama'),
    mcp: createLogger('MCP'),
    auth: createLogger('Auth'),
    storage: createLogger('Storage'),
};

export default {
    scope: createLogger,
    info: (text: any) => writeLog('INFO', 'Global', text),
    error: (text: any) => writeLog('ERROR', 'Global', text),
    warn: (text: any) => writeLog('WARN', 'Global', text),
    debug: (text: any) => writeLog('DEBUG', 'Global', text),
};
