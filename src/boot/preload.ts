import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    sendPrompt: (prompt: string) => ipcRenderer.invoke('gemini:prompt', prompt),
    getHistory: () => ipcRenderer.invoke('gemini:history'),
    setModel: (modelName: string) => ipcRenderer.invoke('gemini:set-model', modelName),
    listModels: () => ipcRenderer.invoke('gemini:list-models'),

    // MCP Configuration
    mcpList: () => ipcRenderer.invoke('mcp:list'),
    mcpListTools: () => ipcRenderer.invoke('mcp:list-tools'),
    mcpListPrompts: () => ipcRenderer.invoke('mcp:list-prompts'),
    mcpGetPrompt: (serverName: string, promptName: string, args: any) => ipcRenderer.invoke('mcp:get-prompt', serverName, promptName, args),
    mcpAdd: (server: any) => ipcRenderer.invoke('mcp:add', server),
    mcpRemove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
    mcpUpdate: (name: string, updates: any) => ipcRenderer.invoke('mcp:update', name, updates),
    mcpTest: (name: string) => ipcRenderer.invoke('mcp:test', name),
    mcpTestConfig: (config: any) => ipcRenderer.invoke('mcp:test-config', config),
    mcpCallTool: (name: string, args: any) => ipcRenderer.invoke('mcp:call-tool', name, args),

    // Auth
    saveAuthToken: (token: string) => ipcRenderer.invoke('auth:save-token', token),
    getAuthToken: () => ipcRenderer.invoke('auth:get-token'),
    requestDeviceCode: (clientId: string) => ipcRenderer.invoke('auth:request-device-code', clientId),
    pollForToken: (clientId: string, deviceCode: string, interval: number) => ipcRenderer.invoke('auth:poll-token', clientId, deviceCode, interval),

    // Copilot Client
    copilotInit: (token: string) => ipcRenderer.invoke('copilot:init', token),
    copilotCheck: () => ipcRenderer.invoke('copilot:check-connection'),
    copilotModels: () => ipcRenderer.invoke('copilot:models'),
    copilotChatStream: (messages: any[], model: string) => ipcRenderer.invoke('copilot:chat-stream', { messages, model }),
    onCopilotChunk: (callback: (chunk: string) => void) => ipcRenderer.on('copilot:chunk', (event, chunk) => callback(chunk)),

    setGeminiKey: (key: string) => ipcRenderer.invoke('gemini:set-key', key),
    checkGeminiConnection: () => ipcRenderer.invoke('gemini:check-connection'),

    // Conversation Management
    conversationNew: (options: any) => ipcRenderer.invoke('conversation:new', options),
    conversationLoad: (id: string) => ipcRenderer.invoke('conversation:load', id),
    conversationList: () => ipcRenderer.invoke('conversation:list'),
    conversationDelete: (id: string) => ipcRenderer.invoke('conversation:delete', id),
    conversationExport: (id: string, format: string) => ipcRenderer.invoke('conversation:export', id, format),
    conversationSync: (conversation: any) => ipcRenderer.invoke('conversation:sync', conversation),
    onConversationUpdate: (callback: (conversation: any) => void) => ipcRenderer.on('conversation:update', (event, conversation) => callback(conversation)),
    // Tool Approval
    onApprovalRequest: (callback: (data: any) => void) => ipcRenderer.on('gemini:approval-request', (event: IpcRendererEvent, data: any) => callback(data)),
    sendApprovalResponse: (approved: boolean) => ipcRenderer.send('gemini:approval-response', { approved }),

    // System
    openExternal: (url: string) => ipcRenderer.invoke('shell:open', url)
});
