/**
 * Domain types for the IA-Chat application
 * These types are shared between main and renderer processes
 */

// ============= Provider & Model Types =============

export type Provider = 'gemini' | 'copilot' | 'ollama';

export interface Model {
    name: string;
    displayName: string;
}

// ============= Chat Mode Types =============

export type ChatMode = 'chat' | 'model-selector' | 'provider-selector' | 'help' | 'mcp-manager';

/** Constants for ChatMode to avoid magic strings */
export const CHAT_MODES = {
    CHAT: 'chat',
    MODEL_SELECTOR: 'model-selector',
    PROVIDER_SELECTOR: 'provider-selector',
    HELP: 'help',
    MCP_MANAGER: 'mcp-manager',
} as const satisfies Record<string, ChatMode>;

// ============= Message Types =============

export type MessageRole = 'user' | 'assistant' | 'system' | 'model' | 'tool';

export interface Message {
    id?: string;
    role: MessageRole;
    content: string;
    timestamp: string;
    provider?: Provider;
    /** Optional MCP tool call details for system messages */
    mcpCalls?: McpToolCall[];
    /** Tool calls from assistant (OpenAI format) */
    tool_calls?: ToolCall[];
}

/** History message for Gemini-style clients */
export interface HistoryMessage {
    role: string;
    content: string;
    timestamp?: string;
    tool_calls?: ToolCall[];
}

export interface McpToolCall {
    server: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    duration: number;
    error: boolean;
    /** Tool call ID for linking with assistant's tool_calls (OpenAI format) */
    toolCallId?: string;
}

/** OpenAI-style tool call */
export interface ToolCall {
    id?: string;
    function: {
        name: string;
        arguments: string | Record<string, unknown>;
    };
}

/** Tool result message */
export interface ToolResultMessage {
    role: 'tool';
    tool_call_id?: string;
    content: string;
    name?: string;
}

// ============= Conversation Types =============

export interface Conversation {
    id: string;
    title?: string;
    model?: string;
    provider?: Provider;
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
    type?: McpServerType;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    token?: string;
    enabled?: boolean;
}

export interface McpTool {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
    serverName?: string;
    originalName?: string;
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
    resolve: (value: boolean) => void;
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

// ============= App Settings Types =============

export interface AppSettings {
    provider: Provider;
    model: string;
}

// ============= Gemini-specific Types =============

export interface GeminiPart {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: {
            name: string;
            content: unknown;
        };
    };
}

export interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

export interface GeminiTool {
    functionDeclarations: Array<{
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    }>;
}

// ============= OpenAI-style Types (Copilot/Ollama) =============

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}
