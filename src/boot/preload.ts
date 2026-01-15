import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
// Note: Cannot import VALUES from ../shared in sandbox preload - must inline
// Type imports are fine (erased at compile time) - use to enforce consistency
import type { IpcChannels } from "../shared/ipc-channels";
import type {
  Conversation,
  McpServer,
  ToolApprovalRequest,
  ToolApprovalResponse
} from "../shared/types";

/**
 * IPC_CHANNELS must match src/shared/ipc-channels.ts exactly.
 * TypeScript will error if they differ thanks to the IpcChannels type.
 */
const IPC_CHANNELS: IpcChannels = {
  PING: "ping",
  GEMINI: {
    PROMPT: "gemini:prompt",
    HISTORY: "gemini:history",
    SET_MODEL: "gemini:set-model",
    LIST_MODELS: "gemini:list-models",
    SET_KEY: "gemini:set-key",
    CHECK_CONNECTION: "gemini:check-connection",
    APPROVAL_REQUEST: "gemini:approval-request",
    APPROVAL_RESPONSE: "gemini:approval-response",
    SIGN_OUT: "gemini:sign-out",
  },
  MCP: {
    LIST: "mcp:list",
    LIST_TOOLS: "mcp:list-tools",
    LIST_PROMPTS: "mcp:list-prompts",
    GET_PROMPT: "mcp:get-prompt",
    ADD: "mcp:add",
    REMOVE: "mcp:remove",
    UPDATE: "mcp:update",
    TEST: "mcp:test",
    TEST_CONFIG: "mcp:test-config",
    CALL_TOOL: "mcp:call-tool",
  },
  AUTH: {
    SAVE_TOKEN: "auth:save-token",
    GET_TOKEN: "auth:get-token",
    REQUEST_DEVICE_CODE: "auth:request-device-code",
    POLL_TOKEN: "auth:poll-token",
  },
  COPILOT: {
    INIT: "copilot:init",
    CHECK_CONNECTION: "copilot:check-connection",
    MODELS: "copilot:models",
    CHAT_STREAM: "copilot:chat-stream",
    CHUNK: "copilot:chunk",
  },
  CONVERSATION: {
    NEW: "conversation:new",
    LOAD: "conversation:load",
    LIST: "conversation:list",
    DELETE: "conversation:delete",
    EXPORT: "conversation:export",
    SYNC: "conversation:sync",
    UPDATE: "conversation:update",
  },
  SHELL: {
    OPEN: "shell:open",
  },
};

contextBridge.exposeInMainWorld("electronAPI", {
  ping: () => ipcRenderer.invoke(IPC_CHANNELS.PING),

  // Gemini
  sendPrompt: (prompt: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GEMINI.PROMPT, prompt),
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.GEMINI.HISTORY),
  setModel: (modelName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GEMINI.SET_MODEL, modelName),
  listModels: () => ipcRenderer.invoke(IPC_CHANNELS.GEMINI.LIST_MODELS),
  setGeminiKey: (key: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GEMINI.SET_KEY, key),
  checkGeminiConnection: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GEMINI.CHECK_CONNECTION),
  signOutGemini: () => ipcRenderer.invoke(IPC_CHANNELS.GEMINI.SIGN_OUT),

  // MCP Configuration
  mcpList: () => ipcRenderer.invoke(IPC_CHANNELS.MCP.LIST),
  mcpListTools: () => ipcRenderer.invoke(IPC_CHANNELS.MCP.LIST_TOOLS),
  mcpListPrompts: () => ipcRenderer.invoke(IPC_CHANNELS.MCP.LIST_PROMPTS),
  mcpGetPrompt: (serverName: string, promptName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MCP.GET_PROMPT,
      serverName,
      promptName,
      args
    ),
  mcpAdd: (server: McpServer) => ipcRenderer.invoke(IPC_CHANNELS.MCP.ADD, server),
  mcpRemove: (name: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP.REMOVE, name),
  mcpUpdate: (name: string, updates: Partial<McpServer>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP.UPDATE, name, updates),
  mcpTest: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.MCP.TEST, name),
  mcpTestConfig: (config: McpServer) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP.TEST_CONFIG, config),
  mcpCallTool: (name: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP.CALL_TOOL, name, args),

  // Auth
  saveAuthToken: (token: string | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH.SAVE_TOKEN, token),
  getAuthToken: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH.GET_TOKEN),
  requestDeviceCode: (clientId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH.REQUEST_DEVICE_CODE, clientId),
  pollForToken: (clientId: string, deviceCode: string, interval: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.AUTH.POLL_TOKEN,
      clientId,
      deviceCode,
      interval
    ),

  // Copilot Client
  copilotInit: (token: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COPILOT.INIT, token),
  copilotCheck: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT.CHECK_CONNECTION),
  copilotModels: () => ipcRenderer.invoke(IPC_CHANNELS.COPILOT.MODELS),
  copilotChatStream: (messages: Array<{ role: string; content: string }>, model: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.COPILOT.CHAT_STREAM, { messages, model }),
  onCopilotChunk: (callback: (chunk: string) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on(IPC_CHANNELS.COPILOT.CHUNK, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COPILOT.CHUNK, handler);
  },

  // Conversation Management
  conversationNew: (options?: { model?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.NEW, options),
  conversationLoad: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.LOAD, id),
  conversationList: () => ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.LIST),
  conversationDelete: (id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.DELETE, id),
  conversationExport: (id: string, format: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.EXPORT, id, format),
  conversationSync: (conversation: Conversation) =>
    ipcRenderer.invoke(IPC_CHANNELS.CONVERSATION.SYNC, conversation),
  onConversationUpdate: (callback: (conversation: Conversation) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, conversation: Conversation) => callback(conversation);
    ipcRenderer.on(IPC_CHANNELS.CONVERSATION.UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONVERSATION.UPDATE, handler);
  },

  // Tool Approval
  onApprovalRequest: (callback: (data: ToolApprovalRequest) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, data: ToolApprovalRequest) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.GEMINI.APPROVAL_REQUEST, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.GEMINI.APPROVAL_REQUEST, handler);
  },
  sendApprovalResponse: (approved: boolean) =>
    ipcRenderer.send(IPC_CHANNELS.GEMINI.APPROVAL_RESPONSE, { approved } as ToolApprovalResponse),

  // System
  openExternal: (url: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHELL.OPEN, url),
});
