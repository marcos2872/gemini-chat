import type {
  Conversation,
  ConversationSummary,
  McpServer,
  McpTool,
  McpPrompt,
  Message,
  ToolApprovalRequest,
  ApiResponse,
  ConnectionStatus,
} from "../shared/types";

export interface IElectronAPI {
  ping: () => Promise<string>;

  // Gemini
  sendPrompt: (prompt: string) => Promise<ApiResponse<string>>;
  getHistory: () => Promise<Message[]>;
  setModel: (modelName: string) => Promise<ApiResponse>;
  listModels: () => Promise<Array<{ name: string; displayName: string }>>;
  setGeminiKey: (key: string) => Promise<{ success: boolean; valid: boolean }>;
  checkGeminiConnection: () => Promise<ConnectionStatus>;
  signOutGemini: () => Promise<ApiResponse>;

  // MCP
  mcpList: () => Promise<McpServer[]>;
  mcpListTools: () => Promise<McpTool[]>;
  mcpListPrompts: () => Promise<McpPrompt[]>;
  mcpGetPrompt: (
    serverName: string,
    promptName: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  mcpAdd: (server: McpServer) => Promise<ApiResponse>;
  mcpRemove: (name: string) => Promise<ApiResponse>;
  mcpUpdate: (name: string, updates: Partial<McpServer>) => Promise<ApiResponse>;
  mcpTest: (name: string) => Promise<ConnectionStatus>;
  mcpTestConfig: (config: McpServer) => Promise<ConnectionStatus>;
  mcpCallTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<ApiResponse<unknown>>;

  // Auth
  saveAuthToken: (token: string | null) => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;
  requestDeviceCode: (clientId: string) => Promise<{
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  }>;
  pollForToken: (
    clientId: string,
    deviceCode: string,
    interval: number
  ) => Promise<{ access_token: string; token_type: string } | null>;

  // Copilot
  copilotInit: (token: string) => Promise<ConnectionStatus>;
  copilotCheck: () => Promise<ConnectionStatus>;
  copilotModels: () => Promise<Array<{ name: string; displayName: string }>>;
  copilotChatStream: (
    messages: Array<{ role: string; content: string }>,
    model: string
  ) => Promise<ApiResponse>;
  /** Returns cleanup function to remove listener - call on unmount */
  onCopilotChunk: (callback: (chunk: string) => void) => () => void;

  // Conversation
  conversationNew: (options?: { model?: string }) => Promise<Conversation>;
  conversationLoad: (id: string) => Promise<Conversation>;
  conversationList: () => Promise<ConversationSummary[]>;
  conversationDelete: (id: string) => Promise<void>;
  conversationExport: (id: string, format: string) => Promise<string>;
  conversationSync: (conversation: Conversation) => Promise<ApiResponse>;
  /** Returns cleanup function to remove listener - call on unmount */
  onConversationUpdate: (callback: (conversation: Conversation) => void) => () => void;

  // Approvals
  /** Returns cleanup function to remove listener - call on unmount */
  onApprovalRequest: (callback: (data: ToolApprovalRequest) => void) => () => void;
  sendApprovalResponse: (approved: boolean) => void;

  // System
  openExternal: (url: string) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

