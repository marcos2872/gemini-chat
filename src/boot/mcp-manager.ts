import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile, exec } from 'child_process';
import * as util from 'util';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { URL } from 'url';

const execFilePromise = util.promisify(execFile);
const execPromise = util.promisify(exec);

// Simple Auth Provider for static tokens
class SimpleAuthProvider {
    private token: string;

    constructor(token: string) {
        this.token = token;
    }

    async tokens() {
        return {
            access_token: this.token,
            token_type: 'Bearer'
        };
    }

    get redirectUrl() { return undefined; }
    async clientInformation() { return undefined; }
    async saveClientInformation() { }
    async saveTokens() { }
    async redirectToAuthorization() { }
    async saveCodeVerifier() { }
    async codeVerifier() { return ''; }
}

interface MCPServer {
    name: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    enabled?: boolean;
    type?: 'stdio' | 'sse';
    url?: string;
    token?: string;
}

export class MCPServerManager {
    private configPath: string;
    private clients: Map<string, Client>;
    private transports: Map<string, StdioClientTransport | SSEClientTransport>;

    constructor() {
        this.configPath = path.join(os.homedir(), '.gemini-desktop', 'settings.json');
        this.ensureConfigDir();
        this.clients = new Map();
        this.transports = new Map();
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
            console.error('[MCP] Failed to load config:', error);
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

    /**
     * Start connection to a specific server
     * @param {MCPServer} server
     */
    async connectToServer(server: MCPServer) {
        if (server.enabled === false) return; // Explicitly checked for false, though undefined usually implies true? Logic in addServer says enabled default true.
        if (this.clients.has(server.name)) return; // Already connected

        console.log(`[MCP] Connecting to ${server.name}...`);

        try {
            let transport: StdioClientTransport | SSEClientTransport;
            if (server.type === 'sse') {
                const opts: any = {};
                console.log(server)
                if (server.token) {
                    opts.authProvider = new SimpleAuthProvider(server.token);
                }
                if (!server.url) throw new Error("URL missing for SSE");
                transport = new SSEClientTransport(new URL(server.url), opts);
            } else {
                transport = new StdioClientTransport({
                    command: server.command!,
                    args: server.args || [],
                    env: { ...process.env, ...(server.env || {}) } as Record<string, string>
                });
            }

            const client = new Client(
                {
                    name: "gemini-desktop-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        sampling: {},
                    },
                }
            );

            await client.connect(transport);

            this.clients.set(server.name, client);
            this.transports.set(server.name, transport);
            console.log(`[MCP] Connected to ${server.name}`);
        } catch (error) {
            console.error(`[MCP] Failed to connect to ${server.name}:`, error);
        }
    }

    async connectAll() {
        const servers = await this.loadServers();
        for (const server of servers) {
            await this.connectToServer(server);
        }
    }

    /**
     * Get all available tools from all connected servers
     */
    async getAllTools() {
        const uniqueTools = new Map();

        for (const [name, client] of this.clients.entries()) {
            try {
                const toolsResult = await client.listTools();
                for (const tool of toolsResult.tools) {
                    const uniqueName = `${name}__${tool.name}`; // Namespacing to avoid collisions
                    // Only add if not already present (prefer first encountered or handle duplicates?)
                    // For now, let's just overwrite or ignore. Since we iterate servers, 
                    // a server shouldn't declare duplicate tool names itself (MCP spec says names must be unique per server).
                    // So we only worry about collisions if the SAME client instance was added twice or logic is flawed.

                    if (!uniqueTools.has(uniqueName)) {
                        uniqueTools.set(uniqueName, {
                            ...tool,
                            name: uniqueName,
                            serverName: name,
                            originalName: tool.name
                        });
                    }
                }
            } catch (error) {
                console.error(`[MCP] Failed to list tools for ${name}:`, error);
            }
        }

        return Array.from(uniqueTools.values());
    }

    /**
     * Get all available prompts from all connected servers
     */
    async getAllPrompts() {
        const allPrompts = [];
        for (const [name, client] of this.clients.entries()) {
            try {
                const result = await client.listPrompts();
                const prompts = result.prompts.map(prompt => ({
                    ...prompt,
                    serverName: name
                }));
                allPrompts.push(...prompts);
            } catch (error) {
                // Not all servers support prompts
            }
        }
        return allPrompts;
    }

    /**
     * Get a specific prompt from a server
     * @param {string} serverName 
     * @param {string} promptName 
     * @param {Object} args 
     */
    async getPrompt(serverName: string, promptName: string, args: any = {}) {
        const client = this.clients.get(serverName);
        if (!client) throw new Error(`Server ${serverName} is not connected.`);

        const result = await client.getPrompt({
            name: promptName,
            arguments: args
        });
        return result;
    }

    /**
     * Exec tool call
     */
    async callTool(namespacedToolName: string, args: any) {
        // Parse server name from namespaced tool name (server__tool)
        const parts = namespacedToolName.split('__');
        if (parts.length < 2) throw new Error(`Invalid tool name format: ${namespacedToolName}`);

        const serverName = parts[0];
        const toolName = parts.slice(1).join('__'); // Join back just in case original had underscores, though risky.

        const client = this.clients.get(serverName);
        if (!client) throw new Error(`Server ${serverName} is not connected or not found.`);

        console.log(`[MCP] Calling tool ${toolName} on ${serverName}...`);
        return await client.callTool({
            name: toolName,
            arguments: args
        });
    }

    /**
     * Helper to add a new server.
     * @param {MCPServer} server 
     */
    async addServer(server: MCPServer) {
        const servers = await this.loadServers();

        // Validation
        if (servers.find(s => s.name === server.name)) {
            throw new Error(`Server with name "${server.name}" already exists.`);
        }
        // Validate based on type
        if (server.type === 'sse') {
            if (!server.url) {
                throw new Error('URL is required for SSE servers.');
            }
            try {
                new URL(server.url);
            } catch {
                throw new Error('Invalid URL format.');
            }
        } else {
            if (!server.command) {
                throw new Error('Command is required.');
            }
            // Validate command existence
            await this._validateCommand(server.command);
        }

        servers.push({
            ...server,
            args: server.args || [],
            env: server.env || {},
            url: server.url,
            type: server.type || 'stdio',
            token: server.token,
            enabled: server.enabled !== false
        });

        await this.saveServers(servers);
        console.log(`[MCP] Server "${server.name}" added.`);

        // Auto connect
        await this.connectToServer(server);
    }

    async removeServer(name: string) {
        const servers = await this.loadServers();
        const filtered = servers.filter(s => s.name !== name);
        if (filtered.length === servers.length) {
            throw new Error(`Server "${name}" not found.`);
        }

        // Disconnect if active
        if (this.clients.has(name)) {
            // In future: graceful close. SDK transport close not explicitly exposed?
            // Should ideally close transport.
        }
        this.clients.delete(name);
        this.transports.delete(name);

        await this.saveServers(filtered);
        console.log(`[MCP] Server "${name}" removed.`);
    }

    async editServer(name: string, updates: Partial<MCPServer>) {
        const servers = await this.loadServers();
        const index = servers.findIndex(s => s.name === name);
        if (index === -1) {
            throw new Error(`Server "${name}" not found.`);
        }

        // prevent duplicate name collision if renaming
        if (updates.name && updates.name !== name) {
            if (servers.find(s => s.name === updates.name)) {
                throw new Error(`Server name "${updates.name}" is already taken.`);
            }
        }

        if (updates.command && (!servers[index].type || servers[index].type === 'stdio')) {
            await this._validateCommand(updates.command);
        }

        const oldEnabled = servers[index].enabled;
        const newEnabled = updates.enabled !== undefined ? updates.enabled : oldEnabled;

        servers[index] = { ...servers[index], ...updates };
        await this.saveServers(servers);

        // Handle connection state change
        if (oldEnabled && newEnabled === false) {
            console.log(`[MCP] Disabling server ${name}, disconnecting...`);
            if (this.clients.has(name)) {
                // Try to close properly if we can, or just remove from maps
                // SDK doesn't expose easy close on Client yet? 
                // We will just remove references for now.
                this.clients.delete(name);
                this.transports.delete(name);
            }
        } else if ((!oldEnabled || !this.clients.has(name)) && newEnabled === true) {
            console.log(`[MCP] Enabling server ${name}, connecting...`);
            await this.connectToServer(servers[index]);
        }

        console.log(`[MCP] Server "${name}" updated.`);
    }

    async _validateCommand(command: string) {
        // If absolute path
        if (path.isAbsolute(command)) {
            try {
                await fs.access(command);
            } catch {
                throw new Error(`Executable not found at path: ${command}`);
            }
        } else {
            // Check PATH via 'which' (Linux)
            try {
                await execPromise(`which ${command}`);
            } catch {
                // Ignore for now or throw? Let's be lenient or check command existence differently.
                // throw new Error(`Command "${command}" not found in PATH.`);
            }
        }
    }

    /**
     * Test connection to server
     * @param {string} name 
     * @returns {Promise<boolean>}
     */
    async testConnection(name: string) {
        let client = this.clients.get(name);

        if (!client) {
            // Not connected, try to connect
            const servers = await this.loadServers();
            const server = servers.find(s => s.name === name);
            if (!server) throw new Error(`Server ${name} not found`);

            try {
                await this.connectToServer(server);
                client = this.clients.get(name);
                if (!client) return false;
            } catch (e) {
                console.error(`Failed to connect during test for ${name}:`, e);
                throw e;
            }
        }

        // Use listTools as a ping
        try {
            await client.listTools();
            return true;
        } catch (e) {
            console.error(`Ping failed for ${name}:`, e);
            return false;
        }
    }

    /**
     * Test a server configuration without saving it.
     * @param {Object} config - { command, args, env }
     * @returns {Promise<boolean>}
     */
    async testServerConfig(config: MCPServer) {
        let transport: StdioClientTransport | SSEClientTransport;
        if (config.type === 'sse') {
            if (!config.url) throw new Error('URL is required');

            const opts: any = {};
            if (config.token) {
                console.log(`[MCP] Test config using token via AuthProvider`);
                opts.authProvider = new SimpleAuthProvider(config.token);
            }

            transport = new SSEClientTransport(new URL(config.url), opts);
        } else {
            if (!config.command) throw new Error('Command is required');
            await this._validateCommand(config.command);

            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...process.env, ...(config.env || {}) } as Record<string, string>
            });
        }

        const client = new Client(
            { name: "gemini-desktop-test", version: "1.0.0" },
            { capabilities: { sampling: {} } }
        );

        try {
            await client.connect(transport);
            await client.listTools();

            // Cleanup
            await transport.close().catch(() => { });
            return true;
        } catch (e) {
            // Ensure cleanup
            try { await transport.close().catch(() => { }); } catch { }
            throw e;
        }
    }
}

