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
    mcpAdd: (server) => ipcRenderer.invoke('mcp:add', server),
    mcpRemove: (name) => ipcRenderer.invoke('mcp:remove', name),
    mcpUpdate: (name, updates) => ipcRenderer.invoke('mcp:update', name, updates),
    mcpTest: (name) => ipcRenderer.invoke('mcp:test', name),

    // Conversation Management
    conversationNew: () => ipcRenderer.invoke('conversation:new'),
    conversationLoad: (id) => ipcRenderer.invoke('conversation:load', id),
    conversationList: () => ipcRenderer.invoke('conversation:list'),
    conversationDelete: (id) => ipcRenderer.invoke('conversation:delete', id),
    conversationExport: (id, format) => ipcRenderer.invoke('conversation:export', id, format)
});
