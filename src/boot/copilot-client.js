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

    getModels() {
        // Copilot doesn't typically provide a public endpoint to list models
        // We return the supported ones.
        return ["gpt-4", "gpt-3.5-turbo"];
    }

    /**
     * Get the internal token required for Chat API
     */
    async _getChatToken() {
        try {
            const res = await this.client.get("https://api.github.com/copilot/internal/v2/token", {
                headers: { Authorization: `Bearer ${this.accessToken}` }
            });
            if (res.data && res.data.token) {
                return res.data.token;
            }
            throw new Error("No token returned");
        } catch (error) {
            console.error("[CopilotClient] Token exchange failed:", error.message);
            throw error;
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

        // 1. Get Internal Token
        const token = await this._getChatToken();

        // 2. Call Chat API
        try {
            const response = await this.client.post(
                "https://api.githubcopilot.com/chat/completions",
                {
                    messages: messages.map(m => ({
                        role: m.role,
                        content: m.content
                    })),
                    model: options.model || "gpt-4",
                    stream: true
                },
                {
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                        "Accept": "text/event-stream"
                    },
                    responseType: 'stream'
                }
            );

            // 3. Handle Stream
            const stream = response.data;
            
             // Parse SSE
            return new Promise((resolve, reject) => {
                stream.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed === 'data: [DONE]') continue;
                        if (trimmed.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(trimmed.slice(6));
                                const content = data.choices?.[0]?.delta?.content;
                                if (content) {
                                    onChunk(content);
                                }
                            } catch (e) {
                                // Ignore parse errors for partial chunks
                            }
                        }
                    }
                });

                stream.on('end', () => resolve());
                stream.on('error', (err) => reject(err));
            });

        } catch (error) {
             console.error("[CopilotClient] Chat request failed:", error.message);
             throw error;
        }
    }
}

module.exports = CopilotClient;
