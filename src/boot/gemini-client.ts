import { GoogleAuthService } from "./auth/GoogleAuthService";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";

// Internal API Constants
const ENDPOINT = "https://cloudcode-pa.googleapis.com/v1internal";

interface LoadResponse {
  currentTier?: { id: string };
  cloudaicompanionProject?: string;
}

interface OnboardResponse {
  done: boolean;
  name?: string;
  response?: { cloudaicompanionProject?: { id: string } };
}

// Helper Interfaces for Gemini Content
interface Part {
  text?: string;
  functionCall?: {
    name: string;
    args: any;
  };
  functionResponse?: {
    name: string;
    response: any;
  };
}

interface Content {
  role: string;
  parts: Part[];
}

export class GeminiClient {
  private configPath: string | undefined;
  public modelName: string;
  private history: Content[]; // Valid Content objects
  private authService: GoogleAuthService;
  private client: OAuth2Client | null = null;
  private projectId: string | undefined;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    this.history = [];
    this.authService = new GoogleAuthService();
  }

  async initialize() {
    try {
      this.client = await this.authService.getAuthenticatedClient(false);
      const accessToken = await this.client.getAccessToken();
      if (!accessToken.token)
        throw new Error("Failed to retrieve access token");
      console.log(
        `[Gemini] Client Initialized (Internal API mode). Model: ${this.modelName}`
      );
    } catch (error) {
      // Silent fail expected
    }
  }

  async signIn() {
    this.client = await this.authService.signIn();
  }

  async setModel(model: string) {
    this.modelName = model;
    console.log(`[Gemini] Model set to ${model}`);
  }

  isConfigured() {
    return !!this.client;
  }

  async validateConnection() {
    try {
      const client = await this.authService.getAuthenticatedClient();
      return !!client;
    } catch (e) {
      return false;
    }
  }

  private async performHandshake(): Promise<string> {
    if (!this.client) throw new Error("Not authenticated");
    if (this.projectId) return this.projectId;

    console.log("[Gemini Setup] Handshaking...");
    const userProjectId = undefined;
    const loadReq = {
      cloudaicompanionProject: userProjectId,
      metadata: { ideType: "IDE_UNSPECIFIED", pluginType: "GEMINI" },
    };

    const loadRes = await this.postRequest<LoadResponse>(
      "loadCodeAssist",
      loadReq
    );

    if (loadRes.cloudaicompanionProject) {
      this.projectId = loadRes.cloudaicompanionProject;
      return this.projectId;
    }

    const tierId = loadRes.currentTier?.id || "FREE";
    const onboardReq = {
      tierId: tierId,
      cloudaicompanionProject: tierId === "FREE" ? undefined : userProjectId,
      metadata: { ideType: "IDE_UNSPECIFIED", pluginType: "GEMINI" },
    };

    let lro = await this.postRequest<OnboardResponse>(
      "onboardUser",
      onboardReq
    );

    while (!lro.done && lro.name) {
      console.log("[Gemini Setup] Waiting for onboarding...");
      await new Promise((r) => setTimeout(r, 2000));
      const opRes = await this.client.request({
        url: `${ENDPOINT}/${lro.name}`,
        method: "GET",
      });
      lro = opRes.data as OnboardResponse;
    }

    const finalProjectId = lro.response?.cloudaicompanionProject?.id;
    if (!finalProjectId && tierId !== "FREE" && userProjectId) {
      this.projectId = userProjectId;
      return userProjectId!;
    }
    if (!finalProjectId) throw new Error("Failed to obtain Project ID.");

    this.projectId = finalProjectId;
    return finalProjectId;
  }

  private async postRequest<T>(method: string, body: any): Promise<T> {
    if (!this.client) throw new Error("Client not ready");
    const res = await this.client.request({
      url: `${ENDPOINT}:${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.data as T;
  }

  /**
   * Main Prompt Function with Tool Loop
   */
  async sendPrompt(prompt: string, mcpManager?: any, onApproval?: any) {
    if (!this.client) await this.initialize();
    if (!this.client) throw new Error("Gemini Client not authenticated");

    // 1. Setup
    const projectId = await this.performHandshake();
    const promptId = uuidv4();

    // Add user message to history
    this.history.push({ role: "user", parts: [{ text: prompt }] });

    // Prepare Tools
    let geminiTools: any[] | undefined = undefined;
    if (mcpManager) {
      const tools = await mcpManager.getAllTools();
      if (tools && tools.length > 0) {
        geminiTools = this._mapToolsToGemini(tools);
      }
    }

    const MAX_TURNS = 10;
    let turn = 0;
    let finalAnswer = "";

    // 2. Loop
    while (turn < MAX_TURNS) {
      // Build Payload with current history (which includes previous turns)
      const payload = this.buildInternalRequestPayload(
        {
          model: this.modelName,
          contents: this.history,
          tools: geminiTools,
        },
        promptId,
        projectId
      );

      console.log(`[Gemini] Sending Request (Turn ${turn})...`);
      const stream = await this.sendInternalChat(this.client, payload);

      // Parse Full Response
      const responseContent = await this.consumeStream(stream);

      // Add Model Response to History
      this.history.push(responseContent);

      // Check for Function Calls
      const functionCalls = responseContent.parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall!);

      if (functionCalls.length > 0) {
        console.log(`[Gemini] Received ${functionCalls.length} tool calls.`);

        for (const call of functionCalls) {
          // Approval
          if (typeof onApproval === "function") {
            if (!(await onApproval(call.name, call.args))) {
              throw new Error("User denied tool execution.");
            }
          }

          // Execution
          let result: any;
          try {
            result = await mcpManager.callTool(call.name, call.args);
            console.log(`[Gemini] Tool ${call.name} executed.`);
          } catch (e: any) {
            console.error(`[Gemini] Tool ${call.name} failed:`, e);
            result = { error: e.message };
          }

          // Create Function Response Part
          const toolResponsePart: Part = {
            functionResponse: {
              name: call.name,
              response: {
                name: call.name,
                content: result,
              },
            },
          };

          // Add failure/success response to history
          this.history.push({
            role: "user", // Internal API uses 'user' (or function specific role depending on strictness, but prompt says user works)
            parts: [toolResponsePart],
          });
        }
        // Continue loop to get model's interpretation of tool results
        turn++;
      } else {
        // No function calls, this is the final text
        finalAnswer = responseContent.parts.map((p) => p.text).join("");
        break;
      }
    }

    return finalAnswer;
  }

  private async consumeStream(stream: any): Promise<Content> {
    let accumulatedText = "";
    const functionCalls: any[] = [];
    const role = "model"; // Default response role

    // Helper to process a JSON chunk
    const processJson = (json: any) => {
      const candidate = json.response?.candidates?.[0];
      if (!candidate || !candidate.content) return;

      const parts = candidate.content.parts || [];
      for (const part of parts) {
        if (part.text) accumulatedText += part.text;
        if (part.functionCall) functionCalls.push(part.functionCall);
      }
    };

    if (stream.on) {
      await new Promise<void>((resolve, reject) => {
        stream.on("data", (d: any) => {
          this.parseChunkLines(d).forEach(processJson);
        });
        stream.on("end", resolve);
        stream.on("error", reject);
      });
    } else if (stream[Symbol.asyncIterator]) {
      for await (const chunk of stream) {
        this.parseChunkLines(chunk).forEach(processJson);
      }
    }

    // Reconstruct final Content object
    const parts: Part[] = [];
    if (accumulatedText) parts.push({ text: accumulatedText });
    functionCalls.forEach((fc) => parts.push({ functionCall: fc }));

    return { role, parts };
  }

  private parseChunkLines(chunk: any): any[] {
    const str = chunk.toString();
    const results = [];
    const lines = str.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          results.push(JSON.parse(jsonStr));
        } catch (e) {}
      }
    }
    return results;
  }

  private buildInternalRequestPayload(
    req: any,
    userPromptId: string,
    projectId?: string
  ) {
    return {
      model: req.model,
      project: projectId,
      user_prompt_id: userPromptId,
      request: {
        contents: req.contents,
        generationConfig: {
          temperature: 0.7, // Default
          // Add any config params here
        },
        tools: req.tools, // Pass tools array here
      },
    };
  }

  private async sendInternalChat(client: OAuth2Client, payload: any) {
    const url = `${ENDPOINT}:streamGenerateContent?alt=sse`;
    // console.log("[Gemini] Sending request to: ", {
    //   url: url,
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload),
    //   responseType: "stream",
    // });
    const res = await client.request({
      url: url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      responseType: "stream",
    });
    return res.data as any;
  }

  _mapToolsToGemini(mcpTools: any[]) {
    // Map to { function_declarations: [...] }
    const tools = mcpTools.map((tool) => ({
      name: this._sanitizeName(tool.name),
      description: tool.description || `Tool ${tool.name}`,
      parameters: this._sanitizeSchema(tool.inputSchema),
    }));
    // User snippet uses: tools: [ { function_declarations: [...] } ]
    return [
      {
        functionDeclarations: tools,
      },
    ];
  }

  _sanitizeName(name: string) {
    return name.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  _sanitizeSchema(schema: any): any {
    if (!schema || typeof schema !== "object") return schema;
    const clean = { ...schema };
    if (!clean.type && clean.properties) clean.type = "OBJECT";
    if (clean.type && typeof clean.type === "string")
      clean.type = clean.type.toUpperCase();
    delete clean.$schema;
    delete clean.title;
    // Gemini doesn't like some standard json schema keywords?
    // Usually fine, keeping existing sanitization
    return clean;
  }

  _addToHistory(role: string, content: string) {
    // Legacy method for types that might still use it,
    // but internal logic now pushes directly to this.history array with 'parts'
    // We can adapt:
    this.history.push({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    });
  }

  getHistory() {
    // Map back to UI format if needed: { role, content }
    // Implementation depends on what the UI expects.
    // Assuming UI expects: [{ role: 'user', content: '...' }]
    return this.history.map((h) => ({
      role: h.role === "model" ? "assistant" : "user",
      content: h.parts
        .map(
          (p) =>
            p.text ||
            (p.functionCall ? `Using tool: ${p.functionCall.name}` : "")
        )
        .join(""),
    }));
  }

  shutdown() {
    this.client = null;
    this.projectId = undefined;
    console.log("[Gemini] Client shut down.");
  }

  async signOut() {
    await this.authService.signOut();
    this.shutdown();
  }

  async listModels(): Promise<Array<{ name: string; displayName: string }>> {
    const PREVIEW_GEMINI_MODEL = "gemini-3-pro-preview";
    const PREVIEW_GEMINI_FLASH_MODEL = "gemini-3-flash-preview";
    const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
    const DEFAULT_GEMINI_FLASH_MODEL = "gemini-2.5-flash";
    const DEFAULT_GEMINI_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";

    return [
      {
        name: PREVIEW_GEMINI_MODEL,
        displayName: PREVIEW_GEMINI_MODEL,
      },
      {
        name: PREVIEW_GEMINI_FLASH_MODEL,
        displayName: PREVIEW_GEMINI_FLASH_MODEL,
      },
      { name: DEFAULT_GEMINI_MODEL, displayName: DEFAULT_GEMINI_MODEL },
      {
        name: DEFAULT_GEMINI_FLASH_MODEL,
        displayName: DEFAULT_GEMINI_FLASH_MODEL,
      },
      {
        name: DEFAULT_GEMINI_FLASH_LITE_MODEL,
        displayName: DEFAULT_GEMINI_FLASH_LITE_MODEL,
      },
    ];
  }
}
