export interface IElectronAPI {
  ping: () => Promise<string>;

  // Gemini
  sendPrompt: (prompt: string) => Promise<any>;
  getHistory: () => Promise<any[]>;
  setModel: (modelName: string) => Promise<void>;
  listModels: () => Promise<string[]>;
  setGeminiKey: (key: string) => Promise<{ success: boolean; valid: boolean }>;
  checkGeminiConnection: () => Promise<{
    success: boolean;
    connected: boolean;
  }>;
  signOutGemini: () => Promise<{ success: boolean; error?: string }>;

  // MCP
  mcpList: () => Promise<any[]>;
  mcpListTools: () => Promise<any[]>;
  mcpListPrompts: () => Promise<any[]>;
  mcpGetPrompt: (
    serverName: string,
    promptName: string,
    args: any
  ) => Promise<any>;
  mcpAdd: (server: any) => Promise<{ success: boolean; error?: string }>;
  mcpRemove: (name: string) => Promise<{ success: boolean; error?: string }>;
  mcpUpdate: (
    name: string,
    updates: any
  ) => Promise<{ success: boolean; error?: string }>;
  mcpTest: (
    name: string
  ) => Promise<{ success: boolean; connected?: boolean; error?: string }>;
  mcpTestConfig: (
    config: any
  ) => Promise<{ success: boolean; connected?: boolean; error?: string }>;
  mcpCallTool: (
    name: string,
    args: any
  ) => Promise<{ success: boolean; result?: any; error?: string }>;

  // Auth
  saveAuthToken: (token: string | null) => Promise<boolean>;
  getAuthToken: () => Promise<string | null>;
  requestDeviceCode: (clientId: string) => Promise<any>;
  pollForToken: (
    clientId: string,
    deviceCode: string,
    interval: number
  ) => Promise<any>;

  // Copilot
  copilotInit: (
    token: string
  ) => Promise<{ success: boolean; connected: boolean }>;
  copilotCheck: () => Promise<{ success: boolean; connected: boolean }>;
  copilotModels: () => Promise<string[]>;
  copilotChatStream: (
    messages: any[],
    model: string
  ) => Promise<{ success: boolean; error?: string }>;
  onCopilotChunk: (callback: (chunk: string) => void) => void;

  // Conversation
  conversationNew: (options?: any) => Promise<any>;
  conversationLoad: (id: string) => Promise<any>;
  conversationList: () => Promise<any[]>;
  conversationDelete: (id: string) => Promise<void>;
  conversationExport: (id: string, format: string) => Promise<string>;
  conversationSync: (
    conversation: any
  ) => Promise<{ success: boolean; error?: string }>;
  onConversationUpdate: (callback: (conversation: any) => void) => void;

  // Approvals
  onApprovalRequest: (callback: (data: any) => void) => void;
  sendApprovalResponse: (approved: boolean) => void;

  // System
  openExternal: (url: string) => Promise<{ success: boolean }>;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
