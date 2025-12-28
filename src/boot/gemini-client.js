const { spawn } = require('child_process');
const fs = require('fs');

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

class GeminiClient {
    /**
     * @param {string} [configPath] - Path to config file (optional for now)
     */
    constructor(configPath) {
        this.configPath = configPath;
        this.process = null;
        this.history = [];
        this.initialized = false;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        this.buffer = '';
        this.timeout = 30000; // 30s
        this.isProcessing = false;
    }

    /**
     * Initialize the Gemini CLI process.
     * @returns {Promise<void>}
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            if (this.initialized && this.process) return resolve();

            try {
                console.log('[Gemini] Spawning process...');
                this.process = spawn('gemini', ['chat'], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    env: { ...process.env } // Remove FORCE_COLOR or TERM overrides that might confuse it
                });

                let resolved = false;

                this.process.stdout.on('data', (chunk) => {
                    const text = chunk.toString();
                    console.log('[Gemini] stdout:', text);
                    this.buffer += text;

                    // Initialization check
                    if (!resolved && text.toLowerCase().includes('ready')) {
                        console.log('[Gemini] Detected ready signal.');
                        this.initialized = true;
                        resolved = true;
                        resolve();
                    }

                    // Regular handling
                    this._handleStdout(chunk);
                });

                this.process.stderr.on('data', (chunk) => {
                    console.error('[Gemini] stderr:', chunk.toString());
                    // Some tools print "ready" to stderr
                    if (!resolved && chunk.toString().toLowerCase().includes('ready')) {
                        console.log('[Gemini] Detected ready signal in stderr.');
                        this.initialized = true;
                        resolved = true;
                        resolve();
                    }
                });

                this.process.on('error', (err) => {
                    console.error('[Gemini] Process error:', err);
                    if (!resolved) { resolved = true; reject(err); }
                });

                this.process.on('close', (code) => {
                    console.log(`[Gemini] Process exited with code ${code}`);
                    this.initialized = false;
                    this.process = null;
                    if (!resolved) {
                        resolved = true;
                        reject(new Error(`Process exited early with code ${code}`));
                    }
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Send a prompt to the persistent CLI process.
     * @param {string} prompt 
     * @returns {Promise<string>}
     */
    async sendPrompt(prompt) {
        if (!this.initialized || !this.process) {
            console.log('[Gemini] Process not running, attempting to restart...');
            await this.initialize();
        }
        if (this.isProcessing) {
            throw new Error('Client is busy processing another request');
        }

        // Add to history
        this._addToHistory('user', prompt);

        return new Promise((resolve, reject) => {
            this.isProcessing = true;
            this.pendingResolver = resolve;
            this.pendingRejecter = reject;
            this.buffer = '';

            // Set timeout
            const timeoutId = setTimeout(() => {
                this._cleanupRequest();
                reject(new Error('Timeout: Gemini CLI did not respond in 30s'));
            }, this.timeout);

            this.currentTimeoutId = timeoutId;

            try {
                // Write prompt to stdin
                this.process.stdin.write(prompt + '\n');
            } catch (err) {
                clearTimeout(timeoutId);
                this._cleanupRequest();
                reject(err);
            }
        });
    }

    /**
     * Clean up internal state after request completion/failure
     */
    _cleanupRequest() {
        this.isProcessing = false;
        this.pendingResolver = null;
        this.pendingRejecter = null;
        if (this.currentTimeoutId) clearTimeout(this.currentTimeoutId);
    }

    /**
     * Internal stdout handler
     * WARNING: This logic relies on a heuristic for "end of message".
     * Is Gemini CLI streaming? Does it end with a newline? 
     * Since we don't have the real binary, I will implement a debounce strategy:
     * Use a short debounce to guess end of stream if no specific delimiter is known.
     * OR assumes the CLI prints a propmt token.
     */
    _handleStdout(chunk) {
        const text = chunk.toString();
        console.log('[Gemini] stdout:', text);
        this.buffer += text;

        // Heuristic: If we are waiting for a response, check if it seems complete.
        // For many LLM CLIs, they stream tokens. We need to know when it stops.
        // Strategy: Debounce 500ms. If no new data comes, assume done.
        // NOTE: This is imperfect but standard for wrapping unknown CLIs without explicit delimiters.

        if (this.isProcessing && this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        if (this.isProcessing) {
            this.debounceTimer = setTimeout(() => {
                this._finalizeResponse();
            }, 1000); // 1s silence = done
        }
    }

    _finalizeResponse() {
        if (!this.pendingResolver) return;

        const response = this.buffer.trim();
        this._addToHistory('assistant', response);
        this.pendingResolver(response);
        this._cleanupRequest();
    }

    _handleStderr(chunk) {
        console.error('[Gemini] stderr:', chunk.toString());
    }

    _addToHistory(role, content) {
        const msg = {
            role,
            content,
            timestamp: new Date().toISOString()
        };
        this.history.push(msg);
        return msg;
    }

    /**
     * Get formattted history
     * @returns {Array<Message>}
     */
    getHistory() {
        return this.history;
    }

    shutdown() {
        console.log('[Gemini] Shutting down...');
        if (this.process) {
            this.process.stdin.end();
            this.process.kill(); // SIGTERM
            this.process = null;
        }
        this.initialized = false;
    }
}

module.exports = GeminiClient;
