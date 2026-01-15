import { GoogleAuthService } from "./auth/GoogleAuthService";
import { v4 as uuidv4 } from "uuid";
import { OAuth2Client } from "google-auth-library";

/**
 * @typedef {Object} Message
 * @property {string} role - 'user' | 'assistant' | 'system'
 * @property {string} content - The text content
 * @property {string} timestamp - ISO string of the time
 */

// Internal API Constants
const ENDPOINT = "https://cloudcode-pa.googleapis.com/v1internal";

interface LoadResponse {
  currentTier?: { id: string };
  cloudaicompanionProject?: string;
}

interface OnboardResponse {
  done: boolean;
  name?: string; // Operation name
  response?: { cloudaicompanionProject?: { id: string } };
}

export class GeminiClient {
  private configPath: string | undefined;
  public modelName: string;
  private history: any[];
  private authService: GoogleAuthService;
  private client: OAuth2Client | null = null;
  private projectId: string | undefined;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash-exp";
    this.history = [];
    this.authService = new GoogleAuthService();
  }

  /**
   * Initialize and authenticate.
   */
  async initialize() {
    try {
      this.client = await this.authService.getAuthenticatedClient(false);
      const accessToken = await this.client.getAccessToken();

      if (!accessToken.token) {
        throw new Error("Failed to retrieve access token");
      }

      console.log(
        `[Gemini] Client Initialized (Internal API mode). Model: ${this.modelName}`
      );
    } catch (error) {
      // Silent fail expected if not logged in
    }
  }

  async signIn() {
    this.client = await this.authService.signIn();
    // After sign-in, we might want to pre-fetch the project ID, but we can do it lazily
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

  /**
   * Performs the Handshake/Setup required by the Internal API.
   * Loads Code Assist state and Onboards if necessary.
   */
  private async performHandshake(): Promise<string> {
    if (!this.client) throw new Error("Not authenticated");

    // If we already have a projectId, maybe verify it?
    // For now, we cache it. If user switches accounts, we might need reset.
    if (this.projectId) return this.projectId;

    console.log("[Gemini Setup] Loading Code Assist state...");

    // A. LOAD CODE ASSIST
    // We don't have a userProjectId from config yet, passing undefined for now (Free Tier logic)
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

    // B. ONBOARD USER
    const tierId = loadRes.currentTier?.id || "FREE";
    console.log(`[Gemini Setup] User Tier: ${tierId}. Onboarding required...`);

    const onboardReq = {
      tierId: tierId,
      cloudaicompanionProject: tierId === "FREE" ? undefined : userProjectId,
      metadata: { ideType: "IDE_UNSPECIFIED", pluginType: "GEMINI" },
    };

    let lro = await this.postRequest<OnboardResponse>(
      "onboardUser",
      onboardReq
    );

    // Polling LRO
    while (!lro.done && lro.name) {
      console.log("[Gemini Setup] Waiting for onboarding operation...");
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

    if (!finalProjectId)
      throw new Error("Failed to obtain Project ID from Onboarding.");

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
   * Send a prompt to the internal model API.
   */
  async sendPrompt(prompt: string, mcpManager?: any, onApproval?: any) {
    if (!this.client) {
      await this.initialize();
    }
    if (!this.client) throw new Error("Gemini Client not authenticated");

    this._addToHistory("user", prompt);

    try {
      // Ensure handshake is done to get Project ID
      const projectId = await this.performHandshake();
      console.log(`[Gemini] Using Project ID: ${projectId}`);

      const promptId = uuidv4();

      // Prepare full history + current prompt
      const historyContent = this.history.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

      const requestParams = {
        model: this.modelName,
        contents: historyContent,
        config: {
          // Future: tools mapping
        },
      };

      const payload = this.buildInternalRequestPayload(
        requestParams,
        promptId,
        projectId
      );

      console.log("[Gemini] Sending internal request...");
      const stream = await this.sendInternalChat(this.client, payload);

      // Read the stream
      let fullText = "";

      if (stream.on) {
        stream.on("data", (d: any) => {
          const text = this.parseChunk(d);
          if (text) fullText += text;
        });
        await new Promise((resolve, reject) => {
          stream.on("end", resolve);
          stream.on("error", reject);
        });
      } else if (stream[Symbol.asyncIterator]) {
        for await (const chunk of stream) {
          const text = this.parseChunk(chunk);
          if (text) fullText += text;
        }
      }

      this._addToHistory("assistant", fullText);
      return fullText;
    } catch (error) {
      console.error("[Gemini] Internal API Error:", error);
      throw error;
    }
  }

  private parseChunk(chunk: any): string {
    let str = chunk.toString();
    let accumulated = "";

    const lines = str.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const data = JSON.parse(jsonStr);
          const text =
            data.response?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) accumulated += text;
        } catch (e) {}
      }
    }
    return accumulated;
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
        generationConfig: req.config
          ? {
              temperature: req.config.temperature,
              candidateCount: req.config.candidateCount,
            }
          : undefined,
        safetySettings: req.config?.safetySettings,
        tools: req.config?.tools,
      },
    };
  }

  private async sendInternalChat(client: OAuth2Client, payload: any) {
    const url = `${ENDPOINT}:streamGenerateContent?alt=sse`;

    // Use the authenticated client to request
    const res = await client.request({
      url: url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      responseType: "stream",
    });

    return res.data as any;
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

  getHistory() {
    return this.history;
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
    const GEMINI_2_FLASH_EXP = "gemini-2.0-flash-exp";

    return [
      {
        name: GEMINI_2_FLASH_EXP,
        displayName: GEMINI_2_FLASH_EXP + " (Recommended)",
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
    ];
  }
}
