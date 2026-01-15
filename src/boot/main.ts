import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron';
import * as path from 'path';
import { GeminiClient } from './gemini-client';
import { ConversationStorage } from './conversation-storage';
import { McpService } from './mcp/McpService';
import { CopilotAuthService } from './copilot-auth-service';
import { CopilotClient } from './copilot-client';
import { IpcRouter } from './lib/IpcRouter';
import { GeminiController } from './controllers/GeminiController';
import { AuthController } from './controllers/AuthController';
import { McpController } from './controllers/McpController';
import { IPC_CHANNELS } from './ipc-events';
import type { Conversation } from '../shared/types';

// Logging utility
const log = (scope: string, message: string) => {
    console.log(`[${scope}] ${message}`);
};

let mainWindow: BrowserWindow | null = null;
const router = new IpcRouter();

// State
const storage = new ConversationStorage();
const mcpService = new McpService();
const gemini = new GeminiClient();
const copilotAuth = new CopilotAuthService();
const copilotClient = new CopilotClient();

let activeConversation: Conversation = storage.createConversation();

function getActiveConversation(): Conversation {
    return activeConversation;
}

function setActiveConversation(conv: Conversation): void {
    activeConversation = conv;
}

function createWindow() {
    const iconPath = process.platform === 'win32'
        ? path.join(__dirname, '../../../logos/logo.ico')
        : path.join(__dirname, '../../../logos/logo.png');

    const appIcon = nativeImage.createFromPath(iconPath);

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        backgroundColor: '#1E1E1E',
        icon: appIcon,
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

    // Initialize Gemini client (OAuth-based, no API key needed)
    try {
        await gemini.initialize();
        log('Gemini', 'Client initialized (OAuth mode)');
    } catch (err: any) {
        log('Gemini', `Initialization skipped - will prompt for sign-in: ${err.message}`);
    }

    // Set App User Model ID for Windows/Linux icon association
    if (process.platform === 'linux' || process.platform === 'win32') {
        app.setAppUserModelId('com.iachat.app');
    }

    createWindow();

    // Init Controllers
    new GeminiController(router, gemini, mcpService, storage, getActiveConversation, setActiveConversation);
    new AuthController(router, copilotClient, copilotAuth, mcpService, storage, getActiveConversation, setActiveConversation);
    new McpController(router, mcpService);

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
    mcpService.init().then(() => {
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
