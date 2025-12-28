const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');
const util = require('util');
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

const execFilePromise = util.promisify(execFile);
const execPromise = util.promisify(exec);

/**
 * @typedef {Object} MCPServer
 * @property {string} name
 * @property {string} command
 * @property {string[]} [args]
 * @property {Record<string, string>} [env]
 * @property {boolean} [enabled]
 */

class MCPServerManager {
    constructor() {
        this.configPath = path.join(os.homedir(), '.gemini-desktop', 'settings.json');
        this.ensureConfigDir();
        /** @type {Map<string, Client>} */
        this.clients = new Map();
        /** @type {Map<string, StdioClientTransport>} */
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
    async loadServers() {
        try {
            await this.ensureConfigDir();
            const content = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(content);
            return config.mcpServers.map(server => {
                const name = Object.keys(server)[0];
                const value = server[name];
                return { name, ...value };
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                const defaultConfig = { mcpServers: [] };
                await this.saveConfig(defaultConfig);
                return [];
            }
            console.error('[MCP] Failed to load config:', error);
            throw error;
        }
    }

    async saveConfig(config) {
        await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
    }

    async saveServers(servers) {
        const config = {
            mcpServers: servers.map(s => ({
                [s.name]: {
                    command: s.command,
                    args: s.args,
                    env: s.env,
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
    async connectToServer(server) {
        if (!server.enabled) return;
        if (this.clients.has(server.name)) return; // Already connected

        console.log(`[MCP] Connecting to ${server.name}...`);

        try {
            const transport = new StdioClientTransport({
                command: server.command,
                args: server.args || [],
                env: { ...process.env, ...(server.env || {}) }
            });

            const client = new Client(
                {
                    name: "gemini-desktop-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        tools: {},
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
        const allTools = [];

        for (const [name, client] of this.clients.entries()) {
            try {
                const toolsResult = await client.listTools();
                const tools = toolsResult.tools.map(tool => ({
                    ...tool,
                    name: `${name}__${tool.name}`, // Namespacing to avoid collisions
                    serverName: name,
                    originalName: tool.name
                }));
                allTools.push(...tools);
            } catch (error) {
                console.error(`[MCP] Failed to list tools for ${name}:`, error);
            }
        }

        return allTools;
    }

    /**
     * Exec tool call
     */
    async callTool(namespacedToolName, args) {
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
    async addServer(server) {
        const servers = await this.loadServers();

        // Validation
        if (servers.find(s => s.name === server.name)) {
            throw new Error(`Server with name "${server.name}" already exists.`);
        }
        if (!server.command) {
            throw new Error('Command is required.');
        }
        if (server.args && !Array.isArray(server.args)) {
            throw new Error('Args must be an array of strings.');
        }

        // Validate command existence
        await this._validateCommand(server.command);

        servers.push({
            ...server,
            args: server.args || [],
            env: server.env || {},
            enabled: server.enabled !== false
        });

        await this.saveServers(servers);
        console.log(`[MCP] Server "${server.name}" added.`);

        // Auto connect
        await this.connectToServer(server);
    }

    async removeServer(name) {
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

    async editServer(name, updates) {
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

        if (updates.command) {
            await this._validateCommand(updates.command);
        }

        servers[index] = { ...servers[index], ...updates };
        await this.saveServers(servers);
        console.log(`[MCP] Server "${name}" updated.`);
        // Note: Reconnection would be needed for changes to take effect
    }

    async _validateCommand(command) {
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
    async testConnection(name) {
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
            throw e;
        }
    }
}

module.exports = MCPServerManager;
