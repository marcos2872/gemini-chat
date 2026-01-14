export enum ProviderType {
  GEMINI = "GEMINI",
  COPILOT = "COPILOT",
}

export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
}

export interface AuthConfig {
  accessToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: number;
  // Specific to GitHub
  refreshToken?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  signal?: AbortSignal;
}

/**
 * Interface that all AI Providers must implement
 */
export interface ChatProvider {
  /**
   * Unique identifier for the provider type
   */
  type: ProviderType;

  /**
   * Whether the provider manages history internally (e.g. backend IPC)
   * If true, UI should expect history updates via events or reload.
   * If false, UI must manage history and sync it.
   */
  managesHistory: boolean;

  /**
   * Initialize the provider with authentication
   */
  initialize(authConfig?: AuthConfig): Promise<void>;

  /**
   * Check if provider is ready/available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Get list of available models
   */
  getModels(): Promise<any[]>;

  /**
   * Send a chat message (single response)
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Send a chat message with streaming response
   */
  chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<void>;

  /**
   * Get user information (profile)
   */
  getUserInfo?(): Promise<any>;
}
