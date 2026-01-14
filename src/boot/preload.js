const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    ping: () => ipcRenderer.invoke('ping'),
    sendPrompt: (prompt) => ipcRenderer.invoke('gemini:prompt', prompt),
    getHistory: () => ipcRenderer.invoke('gemini:history'),
    setModel: (modelName) => ipcRenderer.invoke('gemini:set-model', modelName),
    listModels: () => ipcRenderer.invoke('gemini:list-models'),

    // MCP Configuration
    mcpList: () => ipcRenderer.invoke('mcp:list'),
    mcpListTools: () => ipcRenderer.invoke('mcp:list-tools'),
    mcpListPrompts: () => ipcRenderer.invoke('mcp:list-prompts'),
    mcpGetPrompt: (serverName, promptName, args) => ipcRenderer.invoke('mcp:get-prompt', serverName, promptName, args),
    mcpAdd: (server) => ipcRenderer.invoke('mcp:add', server),
    mcpRemove: (name) => ipcRenderer.invoke('mcp:remove', name),
    mcpUpdate: (name, updates) => ipcRenderer.invoke('mcp:update', name, updates),
    mcpUpdate: (name, updates) => ipcRenderer.invoke('mcp:update', name, updates),
    mcpTest: (name) => ipcRenderer.invoke('mcp:test', name),
    mcpTestConfig: (config) => ipcRenderer.invoke('mcp:test-config', config),
    mcpCallTool: (name, args) => ipcRenderer.invoke('mcp:call-tool', name, args),

    // Auth
    saveAuthToken: (token) => ipcRenderer.invoke('auth:save-token', token),
    getAuthToken: () => ipcRenderer.invoke('auth:get-token'),
    requestDeviceCode: (clientId) => ipcRenderer.invoke('auth:request-device-code', clientId),
    pollForToken: (clientId, deviceCode, interval) => ipcRenderer.invoke('auth:poll-token', clientId, deviceCode, interval),

    // Copilot Client
    copilotInit: (token) => ipcRenderer.invoke('copilot:init', token),
    copilotCheck: () => ipcRenderer.invoke('copilot:check-connection'),
    copilotModels: () => ipcRenderer.invoke('copilot:models'),
    copilotChatStream: (messages, model) => ipcRenderer.invoke('copilot:chat-stream', { messages, model }),
    onCopilotChunk: (callback) => ipcRenderer.on('copilot:chunk', (event, chunk) => callback(chunk)),

    setGeminiKey: (key) => ipcRenderer.invoke('gemini:set-key', key),
    checkGeminiConnection: () => ipcRenderer.invoke('gemini:check-connection'),

    // Conversation Management
    conversationNew: (options) => ipcRenderer.invoke('conversation:new', options),
    conversationLoad: (id) => ipcRenderer.invoke('conversation:load', id),
    conversationList: () => ipcRenderer.invoke('conversation:list'),
    conversationDelete: (id) => ipcRenderer.invoke('conversation:delete', id),
    conversationExport: (id, format) => ipcRenderer.invoke('conversation:export', id, format),
    conversationSync: (conversation) => ipcRenderer.invoke('conversation:sync', conversation),
    onConversationUpdate: (callback) => ipcRenderer.on('conversation:update', (event, conversation) => callback(conversation)),
    // Tool Approval
    onApprovalRequest: (callback) => ipcRenderer.on('gemini:approval-request', (event, data) => callback(data)),
    sendApprovalResponse: (approved) => ipcRenderer.send('gemini:approval-response', { approved }),

    // System
    openExternal: (url) => ipcRenderer.invoke('shell:open', url)
});
