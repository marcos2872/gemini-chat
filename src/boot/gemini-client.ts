import * as dotenv from "dotenv";
import {
  GoogleGenerativeAI,
  ChatSession,
  GenerativeModel,
} from "@google/generative-ai";
import * as https from "https";

dotenv.config();

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

export class GeminiClient {
  private configPath: string | undefined;
  private apiKey: string | undefined;
  public modelName: string;
  private genAI: GoogleGenerativeAI | null;
  private model: GenerativeModel | null;
  private chat: ChatSession | null;
  private history: any[];

  /**
   * @param {string} [configPath] - Path to config file (optional)
   */
  constructor(configPath?: string) {
    this.configPath = configPath;
    this.apiKey = process.env.GEMINI_API_KEY;
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    this.genAI = null;
    this.model = null;
    this.chat = null;
    this.history = []; // Keep local history for getHistory() compatibility
  }

  /**
   * Initialize the Gemini SDK.
   * @returns {Promise<void>}
   */
  async initialize(apiKey: string | null = null) {
    if (apiKey) {
      this.apiKey = apiKey;
    } else if (!this.apiKey) {
      this.apiKey = process.env.GEMINI_API_KEY;
    }

    if (!this.apiKey) {
      console.warn("[Gemini] No API Key provided or found in environment.");
      return;
    }

    try {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.modelName });

      // Initialize chat session
      this.chat = this.model.startChat({
        history: [], // We manage history externally or sync it
      });

      console.log(`[Gemini] SDK Initialized with model: ${this.modelName}`);
    } catch (error) {
      console.error("[Gemini] Failed to initialize SDK:", error);
      // Don't throw here to allow app to start even if invalid key
    }
  }

  async setApiKey(key: string) {
    this.apiKey = key;
    await this.initialize(key);
  }

  isConfigured() {
    return !!this.apiKey;
  }

  async validateConnection() {
    if (!this.apiKey) return false;
    try {
      const models = await this.listModels();
      return models.length > 0;
    } catch (e) {
      return false;
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
  async sendPrompt(prompt: string, mcpManager: any, onApproval: any) {
    if (!this.genAI || !this.chat) {
      this.apiKey = process.env.GEMINI_API_KEY;
      if (this.apiKey) {
        await this.initialize();
      } else {
        throw new Error("Gemini SDK not initialized. Missing API Key.");
      }
    }

    // Check if chat is still null after possible init
    if (!this.chat || !this.model || !this.genAI)
      throw new Error("Gemini Client failed to initialize");

    this._addToHistory("user", prompt);

    try {
      let tools: any[] = [];
      let geminiTools: any[] = [];

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
            tools: geminiTools,
          });
          this.chat = this.model.startChat({
            history: currentHistory,
          });
        }
      }

      console.log(`[Gemini] Sending prompt with ${tools.length} tools...`);

      let result = await this._callWithRetry(() =>
        this.chat!.sendMessage(prompt)
      );
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
          console.log(
            "[Gemini] Model requested function calls:",
            JSON.stringify(functionCalls)
          );

          const toolParts: any[] = [];
          for (const call of functionCalls) {
            try {
              // Check for approval before executing the tool
              if (typeof onApproval === "function") {
                const approved = await onApproval(call.name, call.args);
                if (!approved) {
                  console.log(
                    `[Gemini] Tool execution for ${call.name} rejected by onApproval.`
                  );
                  throw new Error("User denied tool execution.");
                }
              }

              let executionResult;

              executionResult = await mcpManager.callTool(call.name, call.args);

              console.log(
                `[Gemini] Tool result for ${call.name}:`,
                executionResult
              );

              // Construct FunctionResponse
              toolParts.push({
                functionResponse: {
                  name: call.name,
                  response: { result: executionResult },
                },
              });
            } catch (err: any) {
              console.error(
                `[Gemini] Tool execution failed for ${call.name}:`,
                err
              );
              toolParts.push({
                functionResponse: {
                  name: call.name,
                  response: { error: err.message },
                },
              });
            }
          }

          // Send tool results back to model
          console.log("[Gemini] Sending tool outputs to model...");
          // Ensure chat is valid
          if (!this.chat) throw new Error("Chat session lost");

          result = await this._callWithRetry(() =>
            this.chat!.sendMessage(toolParts)
          );
          response = result.response;
          text = response.text();
          turn++;
        } else {
          // No more function calls, we are done
          break;
        }
      }

      this._addToHistory("assistant", text);
      return text;
    } catch (error) {
      console.error("[Gemini] Error sending message:", error);
      throw error;
    }
  }

  /**
   * Retry helper for API calls (handling 429s)
   */
  async _callWithRetry(fn: () => Promise<any>, retries = 3, delay = 2000) {
    let attempt = 0;
    while (attempt < retries) {
      try {
        return await fn();
      } catch (error: any) {
        const isQuotaError =
          error.message &&
          (error.message.includes("429") ||
            error.message.includes("Quota exceeded"));
        if (isQuotaError && attempt < retries - 1) {
          // Extract retry delay if possible, or backoff
          console.warn(
            `[Gemini] Rate limit hit (429). Retrying in ${delay}ms... (Attempt ${
              attempt + 1
            }/${retries})`
          );
          await new Promise((r) => setTimeout(r, delay));
          delay *= 2; // Exponential backoff
          attempt++;
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Map MCP tools to Gemini format
   */
  _mapToolsToGemini(mcpTools: any[]) {
    const tools = mcpTools.map((tool) => ({
      name: this._sanitizeName(tool.name),
      description: tool.description || `Tool ${tool.name}`,
      parameters: this._sanitizeSchema(tool.inputSchema),
    }));
    return [
      {
        functionDeclarations: tools,
      } as any,
    ]; // Force any because Gemini types might be strict about tool structure
  }

  _sanitizeName(name: string) {
    // Gemini names: ^[a-zA-Z0-9_-]+$
    // Our namespaced names use __ which is valid (underscores).
    // Just ensure no other chars.
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  _sanitizeSchema(schema: any): any {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    // Deep clone to avoid mutating original if not already cloned
    // But here we are processing a structure, let's just returns new objects or same if primitive

    const clean = { ...schema };

    // Ensure type is OBJECT for root if missing, but primarily we want to clean specific fields
    if (!clean.type && clean.properties) {
      clean.type = "OBJECT";
    }

    // Capitalize types for Gemini (older API requirement, good practice)
    if (clean.type && typeof clean.type === "string") {
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
      const newProps: any = {};
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

  _addToHistory(role: string, content: string) {
    const msg = {
      role,
      content,
      timestamp: new Date().toISOString(),
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
    console.log("[Gemini] Client shut down.");
  }

  /**
   * Set the current model and reset the session.
   * @param {string} modelName
   */
  async setModel(modelName: string) {
    console.log(`[Gemini] Switching model to: ${modelName}`);
    this.modelName = modelName;
    await this.initialize();
  }

  /**
   * List available models using the REST API.
   * @returns {Promise<Array<{name: string, displayName: string}>>}
   */
  async listModels(): Promise<Array<{ name: string; displayName: string }>> {
    if (!this.apiKey) return [];

    return new Promise((resolve, reject) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;

      https
        .get(url, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const json = JSON.parse(data);
              if (json.models) {
                const allowedModels = [
                  "gemini-2.5-flash",
                  "gemini-2.5-flash-lite",
                  "gemini-2.5-pro",
                  "gemini-3-flash-preview",
                  "gemini-3-pro-preview",
                ];

                const validModels = json.models
                  .filter(
                    (m: any) =>
                      m.supportedGenerationMethods &&
                      m.supportedGenerationMethods.includes("generateContent")
                  )
                  .map((m: any) => ({
                    name: m.name.replace("models/", ""),
                    displayName: m.displayName || m.name.replace("models/", ""),
                  }))
                  .filter((m: any) => allowedModels.includes(m.name));
                resolve(validModels);
              } else {
                console.warn(
                  "[Gemini] Unexpected response listing models:",
                  json
                );
                resolve([]);
              }
            } catch (e) {
              console.error("[Gemini] Failed to parse model list:", e);
              resolve([]);
            }
          });
        })
        .on("error", (err) => {
          console.error("[Gemini] Failed to list models:", err);
          resolve([]);
        });
    });
  }
}
