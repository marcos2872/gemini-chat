export { };

declare global {
    interface Window {
        electronAPI: {
            ping: () => Promise<string>;
            sendPrompt: (prompt: string) => Promise<{ success: boolean; data?: string; conversationId?: string; error?: string; mcpCalls?: any[] }>;
            getHistory: () => Promise<any[]>;
            setModel: (modelName: string) => Promise<{ success: boolean; error?: string }>;
            listModels: () => Promise<Array<{ name: string; displayName: string }>>;

            // MCP
            mcpList: () => Promise<any[]>;
            mcpListTools: () => Promise<any[]>;
            mcpAdd: (server: any) => Promise<{ success: boolean; error?: string }>;
            mcpRemove: (name: string) => Promise<{ success: boolean; error?: string }>;
            mcpUpdate: (name: string, updates: any) => Promise<{ success: boolean; error?: string }>;
            mcpTest: (name: string) => Promise<{ success: boolean; connected?: boolean; error?: string }>;

            // Conversation
            conversationNew: () => Promise<any>;
            conversationLoad: (id: string) => Promise<any>;
            conversationList: () => Promise<any[]>;
            conversationDelete: (id: string) => Promise<{ success: boolean }>;
            conversationExport: (id: string, format: string) => Promise<string>;
        };
    }
}
