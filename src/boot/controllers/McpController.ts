import { IpcRouter } from '../lib/IpcRouter';
import { IPC_CHANNELS } from '../ipc-events';
import { McpService } from '../mcp/McpService';

export class McpController {
    constructor(
        private router: IpcRouter,
        private mcpManager: McpService
    ) {
        this.registerRoutes();
    }

    private registerRoutes() {
        this.router.registerHandler(IPC_CHANNELS.MCP.LIST, async () => {
            try {
                return await this.mcpManager.getServers();
            } catch (err: any) {
                console.error(`Error listing servers: ${err.message}`);
                return [];
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.LIST_TOOLS, async () => this.mcpManager.getAllTools());
        this.router.registerHandler(IPC_CHANNELS.MCP.LIST_PROMPTS, async () => this.mcpManager.getAllPrompts());

        this.router.registerHandler(IPC_CHANNELS.MCP.GET_PROMPT, async (event, serverName: string, promptName: string, args: any) => {
            return await this.mcpManager.getPrompt(serverName, promptName, args);
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.ADD, async (event, server: any) => {
            try {
                await this.mcpManager.addServer(server);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.REMOVE, async (event, name: string) => {
            try {
                await this.mcpManager.removeServer(name);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.UPDATE, async (event, name: string, updates: any) => {
            try {
                await this.mcpManager.updateServer(name, updates);
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.TEST, async (event, name: string) => {
            try {
                const result = await this.mcpManager.testConnection(name);
                return { success: true, connected: result };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.TEST_CONFIG, async (event, config: any) => {
            try {
                const result = await this.mcpManager.testConfig(config);
                return { success: true, connected: result };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        this.router.registerHandler(IPC_CHANNELS.MCP.CALL_TOOL, async (event, name: string, args: any) => {
            try {
                const result = await this.mcpManager.callTool(name, args);
                return { success: true, result };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });
    }
}
