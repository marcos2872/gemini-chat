import { IpcRouter } from '../lib/IpcRouter';
import { IPC_CHANNELS } from '../ipc-events';
import { GeminiClient } from '../gemini-client';
import { McpService } from '../mcp/McpService';
import { ConversationStorage } from '../conversation-storage';
import { BrowserWindow } from 'electron';
import * as crypto from 'crypto';

export class GeminiController {
    constructor(
        private router: IpcRouter,
        private gemini: GeminiClient,
        private mcpManager: McpService,
        private storage: ConversationStorage,
        private getActiveConversation: () => any, // access to main state
        private setActiveConversation: (conv: any) => void
    ) {
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.registerHandler(IPC_CHANNELS.GEMINI.PROMPT, this.handlePrompt.bind(this));
        this.router.registerHandler(IPC_CHANNELS.GEMINI.HISTORY, async () => this.gemini.getHistory());
        this.router.registerHandler(IPC_CHANNELS.GEMINI.LIST_MODELS, async () => this.gemini.listModels());

        this.router.registerHandler(IPC_CHANNELS.GEMINI.SET_MODEL, async (event, modelName: string) => {
            // This handler might be shared or strictly for Gemini models?
            // Main process logic delegated this.
            if (modelName.startsWith('gemini') || modelName.startsWith('learnlm')) {
                await this.gemini.setModel(modelName);
            }
            // Returns success, but main.ts had logic for Copilot fallback. 
            // We might need to split or handle fallback in main/router logic? 
            // Ideally Controller handles its domain.
            return { success: true };
        });

        this.router.registerHandler(IPC_CHANNELS.GEMINI.SET_KEY, async (event, key: string) => {
            try {
                const { default: Store } = await import('electron-store');
                const store = new Store() as any;
                store.set('gemini_api_key', key);
                await this.gemini.setApiKey(key);
                const valid = await this.gemini.validateConnection();
                return { success: valid, valid };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.GEMINI.CHECK_CONNECTION, async () => {
            try {
                const configured = this.gemini.isConfigured();
                if (!configured) return { success: true, connected: false };
                const valid = await this.gemini.validateConnection();
                return { success: true, connected: valid };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }

    private async handlePrompt(event: Electron.IpcMainInvokeEvent, prompt: string) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const activeConversation = this.getActiveConversation();

        try {
            console.log(`[GeminiController] Received prompt: ${prompt.substring(0, 50)}...`);

            // Add User Message
            const userMsg = {
                id: crypto.randomUUID(),
                role: 'user',
                content: prompt,
                timestamp: new Date().toISOString()
            };
            activeConversation.messages.push(userMsg);

            // Ensure model
            if (!activeConversation.model) {
                activeConversation.model = this.gemini.modelName || 'gemini-2.5-flash-lite';
            }

            // Connect MCP
            await this.mcpManager.connectAll();

            const response = await this.gemini.sendPrompt(prompt, this.mcpManager, async (toolName: string, args: any) => {
                return new Promise((resolve) => {
                    const win = BrowserWindow.getAllWindows()[0];
                    if (!win) {
                        resolve(true);
                        return;
                    }
                    // Use shared constant
                    win.webContents.send(IPC_CHANNELS.GEMINI.APPROVAL_REQUEST, { toolName, args });

                    // Listen for response
                    // Note: This needs to be robust against multiple requests.
                    // For now, mirroring existing logic.
                    const { ipcMain } = require('electron');
                    ipcMain.once(IPC_CHANNELS.GEMINI.APPROVAL_RESPONSE, (event: any, { approved }: { approved: boolean }) => {
                        // Log approval
                        const statusMsg = {
                            id: crypto.randomUUID(),
                            role: 'system',
                            content: approved
                                ? `✅ Allowed: ${toolName}\nArgs: ${JSON.stringify(args, null, 2)}`
                                : `❌ Denied: ${toolName}`,
                            timestamp: new Date().toISOString()
                        };
                        activeConversation.messages.push(statusMsg);
                        this.storage.saveConversation(activeConversation).catch(console.error);

                        if (win) {
                            win.webContents.send(IPC_CHANNELS.CONVERSATION.UPDATE, activeConversation);
                        }
                        resolve(approved);
                    });
                });
            });

            if (!response) console.warn('[GeminiController] Empty response');

            // Add Assistant Message
            const assistantMsg = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString()
            };
            activeConversation.messages.push(assistantMsg);

            await this.storage.saveConversation(activeConversation);

            if (win) {
                win.webContents.send(IPC_CHANNELS.CONVERSATION.UPDATE, activeConversation);
            }

            return { success: true, data: response, conversationId: activeConversation.id };

        } catch (err: any) {
            console.error('[GeminiController] Error:', err.message);
            // Error handling logic
            let cleanError = err.message;
            if (cleanError.includes('429')) {
                cleanError = "⚠️ **Quota Exceeded**";
            }

            const errorMsg = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: cleanError,
                timestamp: new Date().toISOString()
            };
            activeConversation.messages.push(errorMsg);
            await this.storage.saveConversation(activeConversation);
            if (win) {
                win.webContents.send(IPC_CHANNELS.CONVERSATION.UPDATE, activeConversation);
            }
            return { success: true, isError: true };
        }
    }
}
