import {
  ChatProvider,
  ProviderType,
  AuthConfig,
  ChatMessage,
  ChatOptions,
} from "../types";

export class GeminiProvider implements ChatProvider {
  public type = ProviderType.GEMINI;
  public managesHistory = true;

  async initialize(authConfig?: AuthConfig): Promise<void> {
    // Gemini is initialized in Main process on startup.
    // Re-initialization with new key is possible via settings but handled via .env usually.
    // If authConfig has key, we might send IPC to update it?
    // For now, assuming environment setup.
    return;
  }

  async isAvailable(): Promise<boolean> {
    // We could check if Main process Gemini is ready.
    // Simple check: list models.
    try {
      const models = await window.electronAPI.listModels();
      return models && models.length > 0;
    } catch (e) {
      return false;
    }
  }

  async getModels(): Promise<any[]> {
    try {
      const models = await window.electronAPI.listModels();
      return models.map((m) => m.name);
    } catch {
      return ["gemini-2.5-flash"];
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // Extract last message
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "user")
      throw new Error("Last message must be from user");

    const result = await window.electronAPI.sendPrompt(lastMsg.content);
    if (!result.success) {
      throw new Error(result.error || "Gemini Error");
    }
    return result.data || "";
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
    // Current IPC is not streaming.
    // We get the full response and emit it as one chunk (or simulate typing).
    const text = await this.chat(messages, options);
    onChunk(text);
  }
}
