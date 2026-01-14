import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import { GeminiClient } from './gemini-client';
import { ConversationStorage } from './conversation-storage';
import { MCPServerManager } from './mcp-manager';
import { CopilotAuthService } from './copilot-auth-service';
import { CopilotClient } from './copilot-client';
import { IpcRouter } from './lib/IpcRouter';
import { GeminiController } from './controllers/GeminiController';
import { AuthController } from './controllers/AuthController';
import { McpController } from './controllers/McpController';
import { IPC_CHANNELS } from './ipc-events';

// Logging utility
const log = (scope: string, message: string) => {
    console.log(`[${scope}] ${message}`);
};

let mainWindow: BrowserWindow | null = null;
const router = new IpcRouter();

// State
const storage = new ConversationStorage();
const mcpManager = new MCPServerManager();
const gemini = new GeminiClient();
const copilotAuth = new CopilotAuthService();
const copilotClient = new CopilotClient();

let activeConversation: any = storage.createConversation();

function getActiveConversation() {
    return activeConversation;
}

function setActiveConversation(conv: any) {
    activeConversation = conv;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1E1E1E',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });

    if (process.env.IS_DEV) {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        mainWindow.loadFile(path.join(__dirname, '../../../dist/renderer/index.html'));
    }
}

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

    // Init Controllers
    new GeminiController(router, gemini, mcpManager, storage, getActiveConversation, setActiveConversation);
    new AuthController(router, copilotClient, copilotAuth, mcpManager, storage, getActiveConversation, setActiveConversation);
    new McpController(router, mcpManager);

    // Register generic handlers
    router.registerHandler(IPC_CHANNELS.PING, () => 'pong');
    router.registerHandler(IPC_CHANNELS.SHELL.OPEN, async (event, url: string) => {
        await shell.openExternal(url);
        return { success: true };
    });

    // Conversation Handlers (Generic)
    router.registerHandler(IPC_CHANNELS.CONVERSATION.NEW, async (event, options: any = {}) => {
        activeConversation = storage.createConversation();
        if (options && options.model) {
            activeConversation.model = options.model;
        }
        await storage.saveConversation(activeConversation);
        return activeConversation;
    });

    router.registerHandler(IPC_CHANNELS.CONVERSATION.LOAD, async (event, id: string) => {
        activeConversation = await storage.loadConversation(id);
        return activeConversation;
    });

    router.registerHandler(IPC_CHANNELS.CONVERSATION.LIST, async () => storage.listConversations());
    router.registerHandler(IPC_CHANNELS.CONVERSATION.DELETE, async (event, id: string) => storage.deleteConversation(id));
    router.registerHandler(IPC_CHANNELS.CONVERSATION.EXPORT, async (event, id: string, format: string) => storage.exportConversation(id, format));
    router.registerHandler(IPC_CHANNELS.CONVERSATION.SYNC, async (event, conversation: any) => {
        try {
            activeConversation = conversation;
            await storage.saveConversation(activeConversation);
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    });

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
