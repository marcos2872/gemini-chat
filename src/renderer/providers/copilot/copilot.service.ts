import { AuthConfig, ChatMessage } from "../types";

export class CopilotService {
  private authConfig: AuthConfig | null = null;
  private currentChunkHandler: ((chunk: string) => void) | null = null;

  constructor() {
    // Listen for chunks from the main process
    if (window.electronAPI?.onCopilotChunk) {
      if (window.electronAPI?.onCopilotChunk) {
        window.electronAPI.onCopilotChunk((chunk) => {
          console.log("[CopilotService] Received chunk:", chunk);
          if (this.currentChunkHandler) {
            console.log("[CopilotService] Invoking currentChunkHandler");
            this.currentChunkHandler(chunk);
          } else {
            console.warn("[CopilotService] No chunk handler assigned!");
          }
        });
      }
    }
  }

  async setAuthConfig(config: AuthConfig) {
    this.authConfig = config;
    try {
      if (config.accessToken) {
        await window.electronAPI.copilotInit(config.accessToken);
      }
    } catch (error) {
      console.warn("[CopilotService] Failed to initialize copilot:", error);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await window.electronAPI.copilotCheck();
      return result.connected;
    } catch (error) {
      console.warn("[CopilotService] Availability check failed:", error);
      return false;
    }
  }

  async getModels(): Promise<any[]> {
    try {
      const models = await window.electronAPI.copilotModels();
      return models && models.length > 0 ? models : ["gpt-4", "gpt-3.5-turbo"];
    } catch (error) {
      console.warn("[CopilotService] Failed to get models:", error);
      return ["gpt-4", "gpt-3.5-turbo"];
    }
  }

  async getUserInfo(): Promise<any> {
    try {
      const result = await window.electronAPI.copilotCheck();
      return result.user ? { login: result.user } : {};
    } catch (error) {
      console.warn("[CopilotService] Failed to get user info:", error);
      return {};
    }
  }

  /**
   * Perform a chat completion (Streaming preferred)
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: any
  ): Promise<void> {
    if (!this.authConfig?.accessToken) {
      throw new Error("Copilot not authenticated");
    }

    this.currentChunkHandler = onChunk;
    const model = options?.model || "gpt-4o";

    try {
      console.log("[CopilotService] Calling backend chatStream...");
      const result = await window.electronAPI.copilotChatStream(
        messages,
        model
      );
      console.log("[CopilotService] Backend call returned:", result);

      if (!result.success) {
        throw new Error(result.error || "Unknown error during chat stream");
      }
    } catch (error) {
      console.error("[CopilotService] Chat request failed:", error);
      throw error;
    }
  }
}
