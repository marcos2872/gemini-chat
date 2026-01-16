/* eslint-disable @typescript-eslint/no-require-imports */
import { IpcRouter } from '../lib/IpcRouter';
import { IPC_CHANNELS } from '../ipc-events';
import { CopilotClient } from '../copilot-client';
import { CopilotAuthService } from '../copilot-auth-service';
import { McpService } from '../mcp/McpService';
import { ConversationStorage } from '../conversation-storage';
import { BrowserWindow } from 'electron';
import * as crypto from 'crypto';
import { logger } from '../lib/logger';

const log = logger.copilot;

export class CopilotController {
    constructor(
        private router: IpcRouter,
        private copilotClient: CopilotClient,
        private copilotAuth: CopilotAuthService,
        private mcpManager: McpService,
        private storage: ConversationStorage,
        private getActiveConversation: () => any,
        private setActiveConversation: (conv: any) => void,
    ) {
        this.registerRoutes();
    }

    private registerRoutes() {
        // Auth Store
        let globalStore: any;
        const getStore = async () => {
            if (!globalStore) {
                const { default: Store } = await import('electron-store');
                globalStore = new Store() as any;
            }
            return globalStore;
        };

        this.router.registerHandler(
            IPC_CHANNELS.AUTH.SAVE_TOKEN,
            async (_event, token: string | null) => {
                const store = await getStore();
                if (token) {
                    store.set('github_token', token);
                } else {
                    store.delete('github_token');
                    this.copilotClient.reset();
                }
                return true;
            },
        );

        this.router.registerHandler(IPC_CHANNELS.AUTH.GET_TOKEN, async () => {
            const store = await getStore();
            return store.get('github_token');
        });

        // Copilot Auth
        this.router.registerHandler(IPC_CHANNELS.AUTH.REQUEST_DEVICE_CODE, async () => {
            return await this.copilotAuth.requestDeviceCode();
        });

        this.router.registerHandler(
            IPC_CHANNELS.AUTH.POLL_TOKEN,
            async (event, deviceCode, interval) => {
                return await this.copilotAuth.pollForToken(deviceCode, interval);
            },
        );

        // Copilot Client
        this.router.registerHandler(IPC_CHANNELS.COPILOT.INIT, async (_event, token: string) => {
            try {
                await this.copilotClient.initialize(token);
                const isConnected = await this.copilotClient.validateConnection();
                return { success: true, connected: isConnected };
            } catch (err: any) {
                log.error('Copilot initialization failed', { error: err.message });
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.COPILOT.CHECK_CONNECTION, async () => {
            const isConnected = await this.copilotClient.validateConnection();
            return { success: true, connected: isConnected };
        });

        this.router.registerHandler(IPC_CHANNELS.COPILOT.MODELS, async () => {
            return this.copilotClient.listModels();
        });

        this.router.registerHandler(
            IPC_CHANNELS.COPILOT.CHAT_STREAM,
            this.handleChatStream.bind(this),
        );
    }

    private async handleChatStream(
        event: Electron.IpcMainInvokeEvent,
        { messages, model }: { messages: any[]; model: string },
    ) {
        const win = BrowserWindow.fromWebContents(event.sender);
        const activeConversation = this.getActiveConversation();

        try {
            if (model) {
                this.copilotClient.setModel(model);
            }

            if (!activeConversation.model) {
                activeConversation.model = model || this.copilotClient.modelName;
            }

            const lastMsg = messages[messages.length - 1];
            const context = messages.slice(0, -1);

            this.copilotClient.history = context.map((m) => ({
                role: m.role,
                content: m.content,
                timestamp: m.timestamp || new Date().toISOString(),
            }));

            log.debug('Forwarding prompt to Copilot', { prompt: lastMsg.content.substring(0, 50) });

            // Add User Message immediately so tool logs appear after it
            const userMsg = {
                id: crypto.randomUUID(),
                role: 'user',
                content: lastMsg.content,
                timestamp: new Date().toISOString(),
            };
            activeConversation.messages.push(userMsg);
            // Optional: Save here or rely on tool callback/final save
            // this.storage.saveConversation(activeConversation).catch(console.error);

            await this.mcpManager.connectAll();

            const response: string = await this.copilotClient.sendPrompt(
                lastMsg.content,
                this.mcpManager,
                async (toolName: string, args: any) => {
                    return new Promise((resolve) => {
                        const win = BrowserWindow.getAllWindows()[0];
                        if (!win) {
                            resolve(true);
                            return;
                        }

                        win.webContents.send(IPC_CHANNELS.GEMINI.APPROVAL_REQUEST, {
                            toolName,
                            args,
                        });
                        const { ipcMain } = require('electron');
                        ipcMain.once(
                            IPC_CHANNELS.GEMINI.APPROVAL_RESPONSE,
                            (event: any, { approved }: { approved: boolean }) => {
                                // Log approval
                                const statusMsg = {
                                    id: crypto.randomUUID(),
                                    role: 'system',
                                    content: approved
                                        ? `✅ Allowed: ${toolName}\nArgs: ${JSON.stringify(args, null, 2)}`
                                        : `❌ Denied: ${toolName}`,
                                    timestamp: new Date().toISOString(),
                                };
                                activeConversation.messages.push(statusMsg);
                                this.storage
                                    .saveConversation(activeConversation)
                                    .catch(console.error);

                                if (win) {
                                    win.webContents.send(
                                        IPC_CHANNELS.CONVERSATION.UPDATE,
                                        activeConversation,
                                    );
                                }
                                resolve(approved);
                            },
                        );
                    });
                },
            );

            if (win) {
                win.webContents.send(IPC_CHANNELS.COPILOT.CHUNK, response);
            }

            // User message already added

            const assistantMsg = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: response,
                timestamp: new Date().toISOString(),
            };
            activeConversation.messages.push(assistantMsg);

            await this.storage.saveConversation(activeConversation);

            if (win) {
                win.webContents.send(IPC_CHANNELS.CONVERSATION.UPDATE, activeConversation);
            }

            return { success: true };
        } catch (err: any) {
            log.error('Copilot chat error', { error: err.message });
            return { success: false, error: err.message };
        }
    }
}
