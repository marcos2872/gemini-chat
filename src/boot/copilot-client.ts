const GITHUB_API_USER_URL = "https://api.github.com/user";
const GITHUB_MODELS_CATALOG_URL = "https://models.github.ai/catalog/models";
const GITHUB_INFERENCE_URL = "https://models.github.ai/inference/chat/completions";

const DEFAULT_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "GeminiChat-App/1.0",
    "Editor-Version": "vscode/1.85.0",
    "Editor-Plugin-Version": "copilot/1.145.0",
};

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

export class CopilotClient {
    private accessToken: string | null;
    public modelName: string;
    public history: any[]; // Made public or accessor used? getHistory() exists.
    private timeoutMs: number;

    constructor() {
        this.accessToken = null;
        this.modelName = 'gpt-4o'; // Default to a standard model
        this.history = [];
        this.timeoutMs = 30000;
    }

    initialize(accessToken: string) {
        this.accessToken = accessToken;
        console.log(`[Copilot] Initialized with model: ${this.modelName}`);
    }

    async setApiKey(key: string) {
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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(GITHUB_API_USER_URL, {
                method: 'GET',
                headers: {
                    ...DEFAULT_HEADERS,
                    Authorization: `Bearer ${this.accessToken}`
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (error: any) {
            console.error("[CopilotClient] Connection check failed:", error.message);
            return false;
        }
    }

    /**
     * Set the current model.
     * @param {string} modelName
     */
    async setModel(modelName: string) {
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

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

            const response = await fetch(GITHUB_MODELS_CATALOG_URL, {
                method: 'GET',
                headers: {
                    ...DEFAULT_HEADERS,
                    "Authorization": `Bearer ${this.accessToken}`,
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28"
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[CopilotClient] Failed to fetch models: ${response.status}`);
                return [];
            }

            const data = await response.json();

            if (Array.isArray(data)) {
                return data.map((m: any) => ({
                    name: m.id || m.name,
                    displayName: m.name || m.id
                }));
            }
            return [];
        } catch (error: any) {
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
    async sendPrompt(prompt: string, mcpManager: any, onApproval: any) {
        if (!this.accessToken) throw new Error("Not authenticated");

        this._addToHistory('user', prompt);

        // Prepare messages from history
        let messages: any[] = this.history.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Handle Tools
        let tools: any[] = [];
        let openAITools: any[] = [];

        if (mcpManager) {
            tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                openAITools = this._mapToolsToOpenAI(tools);
            }
        }

        const maxTurns = 10;
        let turn = 0;

        while (turn < maxTurns) {
            try {
                console.log(`[Copilot] Sending prompt to ${this.modelName} (Turn ${turn + 1})...`);
                const payload: any = {
                    messages: messages,
                    model: this.modelName,
                    stream: false
                };

                if (openAITools.length > 0) {
                    payload.tools = openAITools;
                    payload.tool_choice = "auto";
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

                const response = await fetch(GITHUB_INFERENCE_URL, {
                    method: 'POST',
                    headers: {
                        ...DEFAULT_HEADERS,
                        "Authorization": `Bearer ${this.accessToken}`,
                        "Content-Type": "application/json",
                        "Accept": "application/vnd.github+json",
                        "X-GitHub-Api-Version": "2022-11-28"
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    let errorMsg = `HTTP Error ${response.status}`;
                    try {
                        const errData = await response.json();
                        if (errData.error) {
                            errorMsg = typeof errData.error === 'string' ? errData.error : JSON.stringify(errData.error);
                        }
                    } catch (e) { /* ignore */ }
                    throw new Error(errorMsg);
                }

                const data = await response.json();

                if (data && data.choices && data.choices.length > 0) {
                    const message = data.choices[0].message;

                    // Add assistant message to local history (and to next request)
                    messages.push(message);

                    if (message.tool_calls && message.tool_calls.length > 0) {
                        console.log('[Copilot] Model requested tool calls:', JSON.stringify(message.tool_calls));

                        // Execute Tools
                        for (const toolCall of message.tool_calls) {
                            const functionName = toolCall.function.name;
                            const argsString = toolCall.function.arguments;
                            let args = {};
                            try {
                                args = JSON.parse(argsString);
                            } catch (e) {
                                console.error(`[Copilot] Failed to parse args for ${functionName}:`, argsString);
                            }

                            // Approval
                            if (typeof onApproval === 'function') {
                                const approved = await onApproval(functionName, args);
                                if (!approved) {
                                    console.log(`[Copilot] Tool execution for ${functionName} rejected.`);
                                    throw new Error("User denied tool execution.");
                                }
                            }

                            // Execution
                            let result;
                            try {
                                result = await mcpManager.callTool(functionName, args);
                            } catch (err: any) {
                                result = { error: err.message };
                            }

                            console.log(`[Copilot] Tool result for ${functionName}:`, result);

                            // Append Tool Output
                            messages.push({
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(result)
                            });
                        }
                        turn++;
                        // Loop continues to send tool outputs back to model
                    } else {
                        // Final text response
                        if (message.content) {
                            this._addToHistory('assistant', message.content);
                            return message.content;
                        } else {
                            throw new Error("No content in response");
                        }
                    }
                } else {
                    console.warn("[Copilot] Response contained no choices/messages.");
                    throw new Error("No content in response");
                }

            } catch (error: any) {
                console.error("[CopilotClient] Chat request failed:", error.message);
                throw error;
            }
        }

        throw new Error("Max conversation turns reached.");
    }

    _mapToolsToOpenAI(mcpTools: any[]) {
        return mcpTools.map(tool => ({
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema
            }
        }));
    }

    _addToHistory(role: string, content: string) {
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
}
