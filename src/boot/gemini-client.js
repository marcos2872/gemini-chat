require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

class GeminiClient {
    /**
     * @param {string} [configPath] - Path to config file (optional)
     */
    constructor(configPath) {
        this.configPath = configPath;
        this.apiKey = process.env.GEMINI_API_KEY;
        this.modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        this.genAI = null;
        this.model = null;
        this.chat = null;
        this.history = []; // Keep local history for getHistory() compatibility
    }

    /**
     * Initialize the Gemini SDK.
     * @returns {Promise<void>}
     */
    async initialize() {
        if (!this.apiKey) {
            console.warn('[Gemini] GEMINI_API_KEY not found in environment variables. Initialization deferred.');
            // We allow initialization to pass without key, but subsequent calls will fail or we can throw here.
            // Only throw if we strictly need it now. The original wrapper didn't throw on constructor.
            // But initialize() returns a Promise.
            return;
        }

        try {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            this.model = this.genAI.getGenerativeModel({ model: this.modelName });

            // Initialize chat session
            // Note: The SDK manages history in the chat session object.
            // We also keep a local this.history for the UI compatibility.
            // We can sync them if needed, but for now we start fresh.
            this.chat = this.model.startChat({
                history: [],
            });

            console.log(`[Gemini] SDK Initialized with model: ${this.modelName}`);
        } catch (error) {
            console.error('[Gemini] Failed to initialize SDK:', error);
            throw error;
        }
    }

    /**
     * Send a prompt to the model.
     * @param {string} prompt 
     * @returns {Promise<string>}
     */
    async sendPrompt(prompt) {
        if (!this.genAI || !this.chat) {
            // Try to initialize if not ready (e.g. key was added later)
            this.apiKey = process.env.GEMINI_API_KEY;
            if (this.apiKey) {
                await this.initialize();
            } else {
                throw new Error('Gemini SDK not initialized. Missing API Key.');
            }
        }

        // Add user message to local history (for UI/getHistory)
        this._addToHistory('user', prompt);

        try {
            // Use streaming to capture chunks (supports future real-time features)
            const result = await this.chat.sendMessageStream(prompt);

            let fullText = '';
            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                fullText += chunkText;
            }

            // Add assistant message to local history
            this._addToHistory('assistant', fullText);

            return fullText;
        } catch (error) {
            console.error('[Gemini] Error sending message:', error);
            throw error;
        }
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
        // No explicit shutdown needed for HTTP API
        this.chat = null;
        this.genAI = null;
        console.log('[Gemini] Client shut down.');
    }

    /**
     * Set the current model and reset the session.
     * @param {string} modelName
     */
    async setModel(modelName) {
        console.log(`[Gemini] Switching model to: ${modelName}`);
        this.modelName = modelName;
        await this.initialize();
    }

    /**
     * List available models using the REST API.
     * @returns {Promise<Array<{name: string, displayName: string}>>}
     */
    async listModels() {
        if (!this.apiKey) return [];

        return new Promise((resolve, reject) => {
            const https = require('https');
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;

            https.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.models) {
                            const validModels = json.models
                                .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
                                .filter(m => !m.name.includes('vision') && !m.name.includes('image') && !m.name.includes('nano')) // Exclude vision, image, and nano models
                                .map(m => ({
                                    name: m.name.replace('models/', ''),
                                    displayName: m.displayName || m.name.replace('models/', '')
                                }));
                            resolve(validModels);
                        } else {
                            console.warn('[Gemini] Unexpected response listing models:', json);
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('[Gemini] Failed to parse model list:', e);
                        resolve([]);
                    }
                });
            }).on('error', (err) => {
                console.error('[Gemini] Failed to list models:', err);
                resolve([]);
            });
        });
    }
}

module.exports = GeminiClient;
