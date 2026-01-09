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
        this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
    /**
     * Send a prompt to the model, optionally using MCP tools.
     * @param {string} prompt 
     * @param {Object} [mcpManager] - The MCP Manager instance
     * @param {Function} [onApproval] - Async callback (toolName, args) => Promise<boolean>
     * @returns {Promise<string>}
     */
    async sendPrompt(prompt, mcpManager, onApproval) {
        if (!this.genAI || !this.chat) {
            this.apiKey = process.env.GEMINI_API_KEY;
            if (this.apiKey) {
                await this.initialize();
            } else {
                throw new Error('Gemini SDK not initialized. Missing API Key.');
            }
        }

        this._addToHistory('user', prompt);

        try {
            let tools = [];
            let geminiTools = [];

            if (mcpManager) {
                tools = await mcpManager.getAllTools();
                if (tools && tools.length > 0) {
                    geminiTools = this._mapToolsToGemini(tools);
                    // Re-initialize chat with tools if we have them
                    // Note: This is a bit expensive but necessary to inject tools dynamically
                    // We preserve history
                    const currentHistory = await this.chat.getHistory();
                    this.model = this.genAI.getGenerativeModel({
                        model: this.modelName,
                        tools: geminiTools
                    });
                    this.chat = this.model.startChat({
                        history: currentHistory
                    });
                }
            }

            console.log(`[Gemini] Sending prompt with ${tools.length} tools...`);

            let result = await this.chat.sendMessage(prompt);
            let response = result.response;
            let text = response.text();

            // Function Call Loop
            // The SDK handles function calls by returning a part with functionCall
            // We need to loop until the model returns just text
            const maxTurns = 10;
            let turn = 0;

            while (turn < maxTurns) {
                const functionCalls = response.functionCalls();
                if (functionCalls && functionCalls.length > 0) {
                    console.log('[Gemini] Model requested function calls:', JSON.stringify(functionCalls));

                    const toolParts = [];
                    for (const call of functionCalls) {
                        try {
                            // Check for approval before executing the tool
                            if (typeof onApproval === 'function') {
                                const approved = await onApproval(call.name, call.args);
                                if (!approved) {
                                    console.log(`[Gemini] Tool execution for ${call.name} rejected by onApproval.`);
                                    throw new Error("User denied tool execution.");
                                }
                            }

                            let executionResult;

                            executionResult = await mcpManager.callTool(call.name, call.args);

                            console.log(`[Gemini] Tool result for ${call.name}:`, executionResult);

                            // Construct FunctionResponse
                            toolParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: { result: executionResult }
                                }
                            });
                        } catch (err) {
                            console.error(`[Gemini] Tool execution failed for ${call.name}:`, err);
                            toolParts.push({
                                functionResponse: {
                                    name: call.name,
                                    response: { error: err.message }
                                }
                            });
                        }
                    }

                    // Send tool results back to model
                    console.log('[Gemini] Sending tool outputs to model...');
                    result = await this.chat.sendMessage(toolParts);
                    response = result.response;
                    text = response.text();
                    turn++;
                } else {
                    // No more function calls, we are done
                    break;
                }
            }

            this._addToHistory('assistant', text);
            return text;

        } catch (error) {
            console.error('[Gemini] Error sending message:', error);
            throw error;
        }
    }

    /**
     * Map MCP tools to Gemini format
     */
    /**
     * Map MCP tools to Gemini format
     */
    _mapToolsToGemini(mcpTools) {
        return [{
            functionDeclarations: mcpTools.map(tool => ({
                name: this._sanitizeName(tool.name),
                description: tool.description || `Tool ${tool.name}`,
                parameters: this._sanitizeSchema(tool.inputSchema)
            }))
        }];
    }

    _sanitizeName(name) {
        // Gemini names: ^[a-zA-Z0-9_-]+$
        // Our namespaced names use __ which is valid (underscores).
        // Just ensure no other chars.
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _sanitizeSchema(schema) {
        if (!schema || typeof schema !== 'object') {
            return schema;
        }

        // Deep clone to avoid mutating original if not already cloned
        // But here we are processing a structure, let's just returns new objects or same if primitive

        const clean = { ...schema };

        // Ensure type is OBJECT for root if missing, but primarily we want to clean specific fields
        if (!clean.type && clean.properties) {
            clean.type = 'OBJECT';
        }
        
        // Capitalize types for Gemini (older API requirement, good practice)
        if (clean.type && typeof clean.type === 'string') {
            clean.type = clean.type.toUpperCase();
        }

        // Remove unsupported fields
        delete clean.$schema;
        delete clean.title;
        delete clean.additionalProperties;
        delete clean.exclusiveMinimum;
        delete clean.exclusiveMaximum;
        delete clean.default; // Sometimes problematic depending on context

        // Recursively clean 'properties'
        if (clean.properties) {
            const newProps = {};
            for (const [key, value] of Object.entries(clean.properties)) {
                newProps[key] = this._sanitizeSchema(value);
            }
            clean.properties = newProps;
        }

        // Recursively clean 'items' (for arrays)
        if (clean.items) {
            clean.items = this._sanitizeSchema(clean.items);
        }

        return clean;
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
