const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Logging utility with prefix
const log = (scope, message) => {
    console.log(`[${scope}] ${message}`);
};

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1E1E1E', // Dark background for premium feel
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, // Security: true
            nodeIntegration: false, // Security: false
            sandbox: true // Security: true
        }
    });

    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));

    // Open the DevTools.
    mainWindow.webContents.openDevTools();
}

const GeminiClient = require('./gemini-client');

// Initialize Gemini Client
const gemini = new GeminiClient();

app.whenReady().then(async () => {
    log('Electron', 'Application starting...');

    try {
        await gemini.initialize();
        log('Gemini', 'Client initialized');
    } catch (err) {
        log('Gemini', `Initialization failed: ${err.message}`);
    }

    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    log('Electron', 'All windows closed');
    gemini.shutdown();
    if (process.platform !== 'darwin') app.quit();
});

const ConversationStorage = require('./conversation-storage');
const storage = new ConversationStorage();

const MCPServerManager = require('./mcp-manager');
const mcpManager = new MCPServerManager();

// State
let activeConversation = storage.createConversation();

// app.whenReady().then(async () => {
//     log('Electron', 'Application starting...');

//     try {
//         await gemini.initialize();
//         log('Gemini', 'Client initialized');
//     } catch (err) {
//         log('Gemini', `Initialization failed: ${err.message}`);
//     }

//     createWindow();

//     app.on('activate', function () {
//         if (BrowserWindow.getAllWindows().length === 0) createWindow();
//     });
// });

app.on('window-all-closed', function () {
    log('Electron', 'All windows closed');
    gemini.shutdown();
    if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('ping', () => 'pong');

// Gemini Handlers
ipcMain.handle('gemini:prompt', async (event, prompt) => {
    try {
        log('IPC', `Received prompt: ${prompt.substring(0, 50)}...`);

        // Add User Message
        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user',
            content: prompt,
            timestamp: new Date().toISOString()
        };
        activeConversation.messages.push(userMsg);

        const response = await gemini.sendPrompt(prompt);

        // Add Assistant Message
        const assistantMsg = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
            // TODO: Capture MCP usage if possible
        };
        activeConversation.messages.push(assistantMsg);

        // Auto-save
        await storage.saveConversation(activeConversation);

        return { success: true, data: response, conversationId: activeConversation.id };
    } catch (err) {
        log('IPC', `Error processing prompt: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('gemini:history', () => gemini.getHistory()); // Raw client history, distinct from conversation storage

// Conversation Management Handlers
ipcMain.handle('conversation:new', async () => {
    activeConversation = storage.createConversation();
    await storage.saveConversation(activeConversation);
    return activeConversation;
});

ipcMain.handle('conversation:load', async (event, id) => {
    try {
        activeConversation = await storage.loadConversation(id);
        // Note: We might need to sync this state with GeminiClient if we want to restore context in the LLM.
        // For now, we just restore the UI state.
        return activeConversation;
    } catch (err) {
        throw err;
    }
});

ipcMain.handle('conversation:list', async () => storage.listConversations());
ipcMain.handle('conversation:delete', async (event, id) => storage.deleteConversation(id));
ipcMain.handle('conversation:export', async (event, id, format) => storage.exportConversation(id, format));


// MCP Handlers
ipcMain.handle('mcp:list', async () => {
    try {
        return await mcpManager.loadServers();
    } catch (err) {
        log('MCP', `Error listing servers: ${err.message}`);
        return [];
    }
});

ipcMain.handle('mcp:add', async (event, server) => {
    try {
        await mcpManager.addServer(server);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:remove', async (event, name) => {
    try {
        await mcpManager.removeServer(name);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:update', async (event, name, updates) => {
    try {
        await mcpManager.editServer(name, updates);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:test', async (event, name) => {
    try {
        const result = await mcpManager.testConnection(name);
        return { success: true, connected: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

