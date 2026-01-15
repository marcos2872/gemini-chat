/**
 * Domain types for the IA-Chat application
 * These types are shared between main and renderer processes
 */

// ============= Message Types =============

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
    id: string;
    role: MessageRole;
    content: string;
    timestamp: string;
    /** Optional MCP tool call details for system messages */
    mcpCalls?: McpToolCall[];
}

export interface McpToolCall {
    server: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    duration: number;
    error: boolean;
}

// ============= Conversation Types =============

export interface Conversation {
    id: string;
    title?: string;
    model?: string;
    provider?: 'gemini' | 'copilot';
    messages: Message[];
    /** ISO timestamp string - when conversation started */
    startTime: string;
    /** ISO timestamp string - last activity */
    endTime: string;
    /** MCP servers used in this conversation */
    mcpServersUsed?: string[];
}

export interface ConversationSummary {
    id: string;
    title?: string;
    model?: string;
    messageCount?: number;
    startTime: string;
    endTime: string;
}

// ============= MCP Types =============

export type McpServerType = 'stdio' | 'sse';

export interface McpServer {
    name: string;
    type: McpServerType;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    token?: string;
    enabled: boolean;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    serverName: string;
    originalName: string;
}

export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: Array<{ name: string; description?: string; required?: boolean }>;
    serverName: string;
}

// ============= Approval Types =============

export interface ToolApprovalRequest {
    toolName: string;
    args: Record<string, unknown>;
}

export interface ToolApprovalResponse {
    approved: boolean;
}

// ============= API Response Types =============

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

export interface ConnectionStatus {
    success: boolean;
    connected: boolean;
    error?: string;
}

// ============= MCP Manager Interface =============

export interface IMcpManager {
    getAllTools(): Promise<McpTool[]>;
    callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
    getAllPrompts(): Promise<McpPrompt[]>;
    getPrompt(
        serverName: string,
        promptName: string,
        args?: Record<string, unknown>,
    ): Promise<unknown>;
}

// ============= Approval Callback Type =============

export type ApprovalCallback = (
    toolName: string,
    args: Record<string, unknown>,
) => Promise<boolean>;
