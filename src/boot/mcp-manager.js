const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');
const util = require('util');

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
        this.configPath = path.join(os.homedir(), '.gemini', 'settings.json');
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
    async loadServers() {
        try {
            await this.ensureConfigDir();
            const content = await fs.readFile(this.configPath, 'utf8');
            const config = JSON.parse(content);
            return Array.isArray(config.mcpServers) ? config.mcpServers : [];
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
        const config = { mcpServers: servers };
        await this.saveConfig(config);
    }

    /**
     * Add a new server.
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
    }

    async removeServer(name) {
        const servers = await this.loadServers();
        const filtered = servers.filter(s => s.name !== name);
        if (filtered.length === servers.length) {
            throw new Error(`Server "${name}" not found.`);
        }
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
                throw new Error(`Command "${command}" not found in PATH.`);
            }
        }
    }

    /**
     * Test connection to server (simple execution check)
     * @param {string} name 
     * @returns {Promise<boolean>}
     */
    async testConnection(name) {
        const servers = await this.loadServers();
        const server = servers.find(s => s.name === name);
        if (!server) throw new Error('Server not found');

        console.log(`[MCP] Testing connection to "${name}" (${server.command})...`);

        try {
            // Trying to execute with --help or --version to verify it runs
            // Timeout 5s
            await execFilePromise(server.command, ['--help'], {
                timeout: 5000,
                env: { ...process.env, ...server.env }
            });
            return true;
        } catch (err) {
            // Some servers might exit with code != 0 on help, or might not support --help
            // If it's a timeout, it's definitely an issue.
            // If it's 'ENOENT', it's bad.
            console.warn(`[MCP] Test failed for "${name}":`, err.message);

            // If the error contains stdout that looks like help, we might consider it success?
            // For now, robust failure.

            // Attempting a simpler check: just spawn and kill?
            // No, let's stick to returning false and letting the user know.
            return false;
        }
    }
}

module.exports = MCPServerManager;
