import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface MCPServer {
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
    type?: 'stdio' | 'sse';
    url?: string;
    token?: string;
}

export class McpConfigService {
    private configPath: string;

    constructor() {
        this.configPath = path.join(os.homedir(), '.gemini-desktop', 'settings.json');
        this.ensureConfigDir();
    }

    async ensureConfigDir() {
        const dir = path.dirname(this.configPath);
        try {
            await fs.access(dir);
        } catch {
            await fs.mkdir(dir, { recursive: true });
        }
    }

    /**
     * Load servers from config file.
     * @returns {Promise<MCPServer[]>}
     */
    async loadServers(): Promise<MCPServer[]> {
        try {
            await this.ensureConfigDir();
            const content = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(content);
            return config.mcpServers.map((server: any) => {
                const name = Object.keys(server)[0];
                const value = server[name];
                return { name, ...value };
            });
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                const defaultConfig = { mcpServers: [] };
                await this.saveConfig(defaultConfig);
                return [];
            }
            console.error('[MCP Config] Failed to load config:', error);
            throw error;
        }
    }

    async saveConfig(config: any) {
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    }

    async saveServers(servers: MCPServer[]) {
        const config = {
            mcpServers: servers.map(s => ({
                [s.name]: {
                    command: s.command,
                    args: s.args,
                    env: s.env,
                    url: s.url,
                    type: s.type,
                    token: s.token,
                    enabled: s.enabled
                }
            }))
        };
        await this.saveConfig(config);
    }
}
