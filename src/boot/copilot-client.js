const axios = require('axios');

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

class CopilotClient {
    constructor() {
        this.accessToken = null;
        this.modelName = 'gpt-4o'; // Default to a standard model
        this.history = [];
        this.client = axios.create({
            timeout: 30000,
            headers: {
                "Accept": "application/json",
                "User-Agent": "GeminiChat-App/1.0",
                "Editor-Version": "vscode/1.85.0",
                "Editor-Plugin-Version": "copilot/1.145.0",
            }
        });
    }

    initialize(accessToken) {
        this.accessToken = accessToken;
        console.log(`[Copilot] Initialized with model: ${this.modelName}`);
    }

    async setApiKey(key) {
        this.initialize(key);
    }

    isConfigured() {
        return !!this.accessToken;
    }

    /**
     * Verify if the token is valid by fetching user info
     */
    async validateConnection() {
        if (!this.accessToken) return false;
        try {
            await this.client.get("https://api.github.com/user", {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            return true;
        } catch (error) {
            console.error("[CopilotClient] Connection check failed:", error.message);
            return false;
        }
    }

    /**
     * Set the current model.
     * @param {string} modelName
     */
    async setModel(modelName) {
        console.log(`[Copilot] Switching model to: ${modelName}`);
        this.modelName = modelName;
    }

    /**
     * List available models.
     * @returns {Promise<Array<{name: string, displayName: string}>>}
     */
    async listModels() {
        if (!this.accessToken) return [];

        try {
            console.log("[CopilotClient] Fetching models from catalog...");
            const res = await axios.get("https://models.github.ai/catalog/models", {
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });

            if (Array.isArray(res.data)) {
                return res.data.map(m => ({
                    name: m.id || m.name,
                    displayName: m.name || m.id
                }));
            }
            return [];
        } catch (error) {
            console.warn("[CopilotClient] Failed to fetch models:", error.message);
            return [];
        }
    }

    /**
     * Send a prompt to the model.
     * @param {string} prompt 
     * @param {Object} [mcpManager] - Ignored for now
     * @param {Function} [onApproval] - Ignored for now
     * @returns {Promise<string>}
     */
    async sendPrompt(prompt, mcpManager, onApproval) {
        if (!this.accessToken) throw new Error("Not authenticated");

        this._addToHistory('user', prompt);

        // Prepare messages from history
        // Copilot (OpenAI compatible) expects { role, content }
        const messages = this.history.map(m => ({
            role: m.role,
            content: m.content
        }));

        try {
            console.log(`[Copilot] Sending prompt to ${this.modelName}...`);
            const response = await this.client.post(
                "https://models.github.ai/inference/chat/completions",
                {
                    messages: messages,
                    model: this.modelName,
                    stream: false
                },
                {
                    headers: {
                        "Authorization": `Bearer ${this.accessToken}`,
                        "Content-Type": "application/json",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28"
                    }
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const message = response.data.choices[0].message;
                if (message && message.content) {
                    this._addToHistory('assistant', message.content);
                    return message.content;
                }
            }
            throw new Error("No content in response");

        } catch (error) {
            console.error("[CopilotClient] Chat request failed:", error.message);
            if (error.response) {
                console.error("Data:", error.response.data);
            }
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

    getHistory() {
        return this.history;
    }

    /**
     * Legacy support if needed, or removing for purity.
     * Keeping it might break the "same interface" contract if inferred,
     * but removing it is safer for uniformity.
     * I will remove chatStream as per plan.
     */
}

module.exports = CopilotClient;
