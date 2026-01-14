export interface CopilotInitParams {
    token: string;
}

export interface CopilotChatParams {
    messages: {
        role: string;
        content: string;
        timestamp?: string;
    }[];
    model?: string;
}

export interface McpServer {
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
    type?: 'stdio' | 'sse';
    url?: string;
    token?: string;
}

export interface Conversation {
    id: string;
    messages: any[];
    model?: string;
    created: string;
    updated: string;
}
