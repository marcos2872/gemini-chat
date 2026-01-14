const axios = require('axios');

class CopilotClient {
    constructor() {
        this.accessToken = null;
        this.chatToken = null;
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

    async getModels() {
        if (!this.accessToken) return [];

        try {
            console.log("[CopilotClient] Fetching models from catalog...");
            // User requested URL: https://models.github.ai/catalog/models
            const res = await axios.get("https://models.github.ai/catalog/models", {
                headers: {
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                }
            });

            if (Array.isArray(res.data)) {
                return res.data.map(m => m.name || m.id);
            }
            return [];
        } catch (error) {
            console.warn("[CopilotClient] Failed to fetch models:", error.message);
            return [];
        }
    }


    /**
     * Stream chat completion
     * @param {Array} messages 
     * @param {Function} onChunk 
     * @param {Object} options 
     */
    async chatStream(messages, onChunk, options = {}) {
        if (!this.accessToken) throw new Error("Not authenticated");

        const token = this.accessToken;

        try {
            console.log("[CopilotClient] Sending non-streaming request to models.github.ai...");
            const response = await this.client.post(
                "https://models.github.ai/inference/chat/completions",
                {
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    model: options.model || "openai/gpt-5-mini",
                    stream: false
                },
                {
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28"
                    }
                }
            );

            if (response.data && response.data.choices && response.data.choices.length > 0) {
                const message = response.data.choices[0].message;
                if (message && message.content) {
                    onChunk(message.content);
                }
            }

        } catch (error) {
            console.error("[CopilotClient] Chat request failed:", error.message);
            if (error.response) {
                console.error("Data:", error.response.data);
            }
            throw error;
        }
    }
}

module.exports = CopilotClient;
