import {
  ChatProvider,
  ProviderType,
  AuthConfig,
  ChatMessage,
  ChatOptions,
} from "../types";
import { CopilotService } from "./copilot.service";

export class CopilotProvider implements ChatProvider {
  public type = ProviderType.COPILOT;
  public managesHistory = false;
  private service: CopilotService;

  constructor() {
    this.service = new CopilotService();
  }

  async initialize(authConfig?: AuthConfig): Promise<void> {
    if (authConfig) {
      this.service.setAuthConfig(authConfig);
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.service.isAvailable();
  }

  async getModels(): Promise<any[]> {
    return this.service.getModels();
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // For non-streaming, we can use stream and collect or implement a separate method.
    // For now, we simulate non-stream by collecting stream.
    let fullText = "";
    await this.service.chatStream(
      messages,
      (chunk) => {
        fullText += chunk;
      },
      options?.signal
    );
    return fullText;
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void> {
    await this.service.chatStream(messages, onChunk, options);
  }

  async getUserInfo() {
    return this.service.getUserInfo();
  }
}
