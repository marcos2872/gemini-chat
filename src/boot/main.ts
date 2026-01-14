import { app, BrowserWindow, ipcMain, shell, IpcMainEvent } from 'electron';
import * as path from 'path';
import * as crypto from 'crypto';
import { GeminiClient } from './gemini-client';
import { ConversationStorage } from './conversation-storage';
import { MCPServerManager } from './mcp-manager';
import { CopilotAuthService } from './copilot-auth-service';
import { CopilotClient } from './copilot-client';

// Logging utility with prefix
const log = (scope: string, message: string) => {
    console.log(`[${scope}] ${message}`);
};

let mainWindow: BrowserWindow | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
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

// Initialize Gemini Client
const gemini = new GeminiClient();

app.whenReady().then(async () => {
    log('Electron', 'Application starting...');

    // Load key from store if available
    try {
        const { default: Store } = await import('electron-store');
        const store = new Store() as any;
        const savedKey = store.get('gemini_api_key') as string;
        if (savedKey) {
            log('Gemini', 'Found saved API Key in storage.');
            await gemini.initialize(savedKey);
        } else {
            await gemini.initialize(); // Fallback to env
        }
        log('Gemini', 'Client initialized');
    } catch (err: any) {
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

const storage = new ConversationStorage();
const mcpManager = new MCPServerManager();

// State
let activeConversation: any = storage.createConversation();

// IPC Handlers
ipcMain.handle('ping', () => 'pong');

// Gemini Handlers
ipcMain.handle('gemini:prompt', async (event, prompt: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
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

        // Ensure model is set in conversation
        if (!activeConversation.model) {
            activeConversation.model = gemini.modelName || 'gemini-2.5-flash-lite';
        }

        // Connect MCP servers if not already connected (best effort)
        await mcpManager.connectAll();

        const response = await gemini.sendPrompt(prompt, mcpManager, async (toolName: string, args: any) => {
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
                    storage.saveConversation(activeConversation).catch((err: any) => log('IPC', `Error saving intermediate state: ${err.message}`));

                    // Send real-time update to renderer
                    const win = BrowserWindow.getAllWindows()[0];
                    if (win) {
                        win.webContents.send('conversation:update', activeConversation);
                    }

                    resolve(approved);
                });
            });
        });

        console.log(`[Main] Gemini response length: ${response ? response.length : 'null'}`);
        if (!response) {
            console.warn('[Main] Gemini returned empty response!');
        }

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

        if (win) {
            win.webContents.send('conversation:update', activeConversation);
        }

        return { success: true, data: response, conversationId: activeConversation.id };
    } catch (err: any) {
        log('IPC', `Error processing prompt: ${err.message}`);

        // Add Error Message to History
        let cleanError = err.message;
        if (cleanError.includes('429') || cleanError.includes('Quota exceeded')) {
            cleanError = "⚠️ **Quota Exceeded**\nYou have reached the free tier limit for Gemini requests. The system will automatically retry, but if this persists, please try again later or switch models.";
        } else {
            cleanError = `❌ **Error**: ${cleanError}`;
        }

        const errorMsg = {
            id: crypto.randomUUID(),
            role: 'assistant', // Use assistant role so it renders in the chat flow
            content: cleanError,
            timestamp: new Date().toISOString()
        };
        activeConversation.messages.push(errorMsg);

        // Save and Notify
        await storage.saveConversation(activeConversation);

        if (win) {
            win.webContents.send('conversation:update', activeConversation);
        }

        // Return success so frontend doesn't double-render the error
        return { success: true, isError: true };
    }
});

ipcMain.handle('gemini:set-model', async (event, modelName: string) => {
    try {
        if (modelName.startsWith('gemini') || modelName.startsWith('learnlm')) {
            await gemini.setModel(modelName);
        } else {
            // Assume Copilot/Other
            await copilotClient.setModel(modelName);
        }
        return { success: true };
    } catch (err: any) {
        log('IPC', `Error setting model: ${err.message}`);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('gemini:list-models', async () => {
    return await gemini.listModels();
});

ipcMain.handle('gemini:history', () => gemini.getHistory()); // Raw client history, distinct from conversation storage

ipcMain.handle('gemini:set-key', async (event, key: string) => {
    try {
        const { default: Store } = await import('electron-store');
        const store = new Store() as any;
        store.set('gemini_api_key', key);

        await gemini.setApiKey(key);
        const valid = await gemini.validateConnection();
        return { success: valid, valid };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('gemini:check-connection', async () => {
    try {
        const configured = gemini.isConfigured();
        if (!configured) return { success: true, connected: false };
        const valid = await gemini.validateConnection();
        return { success: true, connected: valid };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Conversation Management Handlers
ipcMain.handle('conversation:new', async (event, options: any = {}) => {
    activeConversation = storage.createConversation();
    if (options && options.model) {
        activeConversation.model = options.model;
    }
    await storage.saveConversation(activeConversation);
    return activeConversation;
});

ipcMain.handle('conversation:load', async (event, id: string) => {
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
ipcMain.handle('conversation:delete', async (event, id: string) => storage.deleteConversation(id));
ipcMain.handle('conversation:export', async (event, id: string, format: string) => storage.exportConversation(id, format));

ipcMain.handle('conversation:sync', async (event, conversation: any) => {
    try {
        activeConversation = conversation;
        await storage.saveConversation(activeConversation);
        return { success: true };
    } catch (err: any) {
        log('IPC', `Error syncing conversation: ${err.message}`);
        return { success: false, error: err.message };
    }
});


// MCP Handlers
ipcMain.handle('mcp:list', async () => {
    try {
        return await mcpManager.loadServers();
    } catch (err: any) {
        log('MCP', `Error listing servers: ${err.message}`);
        return [];
    }
});

ipcMain.handle('mcp:list-tools', async () => mcpManager.getAllTools());
ipcMain.handle('mcp:list-prompts', async () => mcpManager.getAllPrompts());
ipcMain.handle('mcp:get-prompt', async (event, serverName: string, promptName: string, args: any) => {
    try {
        return await mcpManager.getPrompt(serverName, promptName, args);
    } catch (err: any) {
        log('MCP', `Error getting prompt ${promptName} from ${serverName}: ${err.message}`);
        throw err;
    }
});

ipcMain.handle('mcp:add', async (event, server: any) => {
    try {
        await mcpManager.addServer(server);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:remove', async (event, name: string) => {
    try {
        await mcpManager.removeServer(name);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:update', async (event, name: string, updates: any) => {
    try {
        await mcpManager.editServer(name, updates);
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:test', async (event, name: string) => {
    try {
        const result = await mcpManager.testConnection(name);
        return { success: true, connected: result };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('mcp:test-config', async (event, config: any) => {
    try {
        const result = await mcpManager.testServerConfig(config);
        return { success: true, connected: result };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

// Auth / Store
let globalStore: any;

ipcMain.handle('auth:save-token', async (event, token: string) => {
    if (!globalStore) {
        const { default: Store } = await import('electron-store');
        globalStore = new Store() as any;
    }
    globalStore.set('github_token', token);
    return true;
});

ipcMain.handle('auth:get-token', async () => {
    if (!globalStore) {
        const { default: Store } = await import('electron-store');
        globalStore = new Store() as any;
    }
    return globalStore.get('github_token');
});

// Copilot Auth Handlers
const copilotAuth = new CopilotAuthService();
const copilotClient = new CopilotClient();

ipcMain.handle('auth:request-device-code', async (event, clientId: string) => {
    try {
        log('Auth', 'Requesting device code...');
        return await copilotAuth.requestDeviceCode(clientId);
    } catch (err: any) {
        log('Auth', `Error requesting device code: ${err.message}`);
        throw err;
    }
});

ipcMain.handle('auth:poll-token', async (event, clientId: string, deviceCode: string, interval: number) => {
    try {
        log('Auth', 'Polling for token...');
        return await copilotAuth.pollForToken(clientId, deviceCode, interval);
    } catch (err: any) {
        log('Auth', `Error polling for token: ${err.message}`);
        throw err;
    }
});

// Copilot Client Handlers
ipcMain.handle('copilot:init', async (event, token: string) => {
    copilotClient.initialize(token);
    const isConnected = await copilotClient.validateConnection();
    return { success: true, connected: isConnected };
});

ipcMain.handle('copilot:check-connection', async () => {
    const isConnected = await copilotClient.validateConnection();
    return { success: true, connected: isConnected };
});

ipcMain.handle('copilot:models', async () => {
    return copilotClient.listModels();
});

ipcMain.handle('copilot:chat-stream', async (event, { messages, model }: { messages: any[], model: string }) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender);

        // Sync model if provided
        if (model) {
            copilotClient.setModel(model);
        }

        // Ensure model is set
        if (!activeConversation.model) {
            activeConversation.model = model || copilotClient.modelName;
        }

        // Extract prompt and context
        // messages format from frontend: [{role, content}, ...]
        const lastMsg = messages[messages.length - 1];
        const context = messages.slice(0, -1);

        // Sync history to client to ensure context is aware
        // We directly overwrite history to match the requested context
        copilotClient.history = context.map(m => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp || new Date().toISOString()
        }));

        console.log(`[Main] Forwarding prompt to Copilot: ${lastMsg.content.substring(0, 50)}...`);

        // Connect MCP servers if not already connected (best effort)
        await mcpManager.connectAll();

        // Use sendPrompt (non-streaming for now, but simulating stream for frontend compatibility)
        const response: string = await copilotClient.sendPrompt(lastMsg.content, mcpManager, async (toolName: string, args: any) => {
            // Approval Callback (Reused from Gemini logic)
            return new Promise((resolve) => {
                const win = BrowserWindow.getAllWindows()[0];
                if (!win) {
                    resolve(true);
                    return;
                }

                log('IPC', `Asking approval for ${toolName} (Copilot)`);
                win.webContents.send('gemini:approval-request', { toolName, args });

                // One-time listener for response
                ipcMain.once('gemini:approval-response', (event, { approved }) => {
                    log('IPC', `Approval received: ${approved}`);
                    resolve(approved);
                });
            });
        });

        console.log(`[Main] Copilot response length: ${response ? response.length : 'null'}`);

        // Send as one chunk since we are not streaming in the new client yet
        if (win) {
            win.webContents.send('copilot:chunk', response);
        }

        // --- Persistence Update ---
        // 1. Add User Message to activeConversation
        const userMsg = {
            id: crypto.randomUUID(),
            role: 'user',
            content: lastMsg.content,
            timestamp: new Date().toISOString()
        };
        activeConversation.messages.push(userMsg);

        // 2. Add Assistant Message
        const assistantMsg = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString()
        };
        activeConversation.messages.push(assistantMsg);

        // 3. Save
        await storage.saveConversation(activeConversation);

        // 4. Notify UI of full update (so history sidebar updates too)
        if (win) {
            win.webContents.send('conversation:update', activeConversation);
        }
        // --------------------------

        return { success: true };
    } catch (err: any) {
        console.error('[Main] Copilot chat error:', err);
        return { success: false, error: err.message };
    }
});


ipcMain.handle('mcp:call-tool', async (event, name, args) => {
    try {
        const result = await mcpManager.callTool(name, args);
        return { success: true, result };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('shell:open', async (event, url) => {
    await shell.openExternal(url);
    return { success: true };
});
