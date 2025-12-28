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

    if (process.env.IS_DEV) {
        mainWindow.loadURL('http://localhost:3000');
        // mainWindow.webContents.openDevTools();

    } else {
        mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
    }
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

    // Connect to MCP servers on startup
    console.log('[Main] Connecting to MCP servers...');
    mcpManager.connectAll().then(() => {
        console.log('[Main] MCP servers connected.');
    }).catch(err => {
        console.error('[Main] Failed to connect to MCP servers:', err);
    });

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

        // Connect MCP servers if not already connected (best effort)
        await mcpManager.connectAll();

        const response = await gemini.sendPrompt(prompt, mcpManager, async (toolName, args) => {
            // Approval Callback
            return new Promise((resolve) => {
                const win = BrowserWindow.getAllWindows()[0];
                if (!win) {
                    resolve(true); // Default to allow if no window? Or deny?
                    return;
                }

                // unique ID for this request? For now assume sequential
                log('IPC', `Asking approval for ${toolName}`);
                win.webContents.send('gemini:approval-request', { toolName, args });

                // One-time listener for response
                ipcMain.once('gemini:approval-response', (event, { approved }) => {
                    log('IPC', `Approval received: ${approved}`);

                    // Log the event to history
                    const statusMsg = {
                        id: crypto.randomUUID(),
                        role: 'system',
                        content: approved
                            ? `✅ Allowed: ${toolName}\nArgs: ${JSON.stringify(args, null, 2)}`
                            : `❌ Denied: ${toolName}`,
                        timestamp: new Date().toISOString()
                    };
                    activeConversation.messages.push(statusMsg);

                    // Save conversation immediately to persist the decision
                    storage.saveConversation(activeConversation).catch(err => log('IPC', `Error saving intermediate state: ${err.message}`));

                    // Send real-time update to renderer
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win) {
                        win.webContents.send('conversation:update', activeConversation);
                    }

                    resolve(approved);
                });
            });
        });

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

        // Add Error Message to History
        const errorMsg = {
            id: crypto.randomUUID(),
            role: 'assistant', // Use assistant role so it renders in the chat flow
            content: `Error: ${err.message}`, // Prefix with Error: for styling
            timestamp: new Date().toISOString()
        };
        activeConversation.messages.push(errorMsg);

        // Save and Notify
        await storage.saveConversation(activeConversation);

        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('conversation:update', activeConversation);
        }

        // Return false so UI knows it failed (though it might just re-render via update)
        return { success: false, error: err.message };
    }
});

ipcMain.handle('gemini:set-model', async (event, modelName) => {
    try {
        await gemini.setModel(modelName);
        return { success: true };
    } catch (err) {
        log('IPC', `Error setting model: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('gemini:list-models', async () => {
    return await gemini.listModels();
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

ipcMain.handle('mcp:list-tools', async () => mcpManager.getAllTools());
ipcMain.handle('mcp:list-prompts', async () => mcpManager.getAllPrompts());
ipcMain.handle('mcp:get-prompt', async (event, serverName, promptName, args) => {
    try {
        return await mcpManager.getPrompt(serverName, promptName, args);
    } catch (err) {
        log('MCP', `Error getting prompt ${promptName} from ${serverName}: ${err.message}`);
        throw err;
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

ipcMain.handle('mcp:test-config', async (event, config) => {
    try {
        const result = await mcpManager.testServerConfig(config);
        return { success: true, connected: result };
    } catch (err) {
        return { success: false, error: err.message };
    }
});



