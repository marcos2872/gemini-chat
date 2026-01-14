export {};

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      sendPrompt: (prompt: string) => Promise<{
        success: boolean;
        data?: string;
        conversationId?: string;
        error?: string;
        mcpCalls?: any[];
      }>;
      getHistory: () => Promise<any[]>;
      setModel: (
        modelName: string
      ) => Promise<{ success: boolean; error?: string }>;
      listModels: () => Promise<Array<{ name: string; displayName: string }>>;

      // MCP
      mcpList: () => Promise<any[]>;
      mcpListTools: () => Promise<any[]>;
      mcpListPrompts: () => Promise<any[]>;
      mcpGetPrompt: (
        serverName: string,
        promptName: string,
        args?: any
      ) => Promise<any>;
      mcpAdd: (server: any) => Promise<{ success: boolean; error?: string }>;
      mcpRemove: (
        name: string
      ) => Promise<{ success: boolean; error?: string }>;
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

      saveAuthToken: (token: any) => Promise<boolean>;
      getAuthToken: () => Promise<any>;
      requestDeviceCode: (clientId: string) => Promise<any>;
      pollForToken: (
        clientId: string,
        deviceCode: string,
        interval: number
      ) => Promise<any>;

      // Conversation
      conversationNew: () => Promise<any>;
      conversationLoad: (id: string) => Promise<any>;
      conversationList: () => Promise<any[]>;
      conversationDelete: (id: string) => Promise<{ success: boolean }>;
      conversationExport: (id: string, format: string) => Promise<string>;
      conversationSync: (
        conversation: any
      ) => Promise<{ success: boolean; error?: string }>;
      onConversationUpdate: (callback: (conversation: any) => void) => void;
      // Approval
      onApprovalRequest: (
        callback: (data: { toolName: string; args: any }) => void
      ) => void;
      sendApprovalResponse: (approved: boolean) => void;
    };
  }
}
