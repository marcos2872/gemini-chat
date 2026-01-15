import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { URL } from 'url';
import { MCPServer } from './McpConfigService';
import { logger } from '../lib/logger';

const log = logger.mcp;

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

export class McpConnectionManager {
    private clients: Map<string, Client>;
    private transports: Map<string, StdioClientTransport | SSEClientTransport>;

    constructor() {
        this.clients = new Map();
        this.transports = new Map();
    }

    getClient(name: string): Client | undefined {
        return this.clients.get(name);
    }

    getClients(): Map<string, Client> {
        return this.clients;
    }

    hasConnection(name: string): boolean {
        return this.clients.has(name);
    }

    async connectToServer(server: MCPServer) {
        if (server.enabled === false) return;
        if (this.clients.has(server.name)) return; // Already connected

        log.debug('Connecting', { server: server.name });

        try {
            let transport: StdioClientTransport | SSEClientTransport;
            if (server.type === 'sse') {
                const opts: any = {};
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
            log.info('Connected', { server: server.name });
        } catch (error) {
            log.error('Connection failed', { server: server.name, error });
        }
    }

    async disconnectServer(name: string) {
        log.debug('Disconnecting', { server: name });
        const transport = this.transports.get(name);
        if (transport) {
            try {
                // transport.close() if available, but SDK handling differs.
                // Assuming transport cleanup happens on GC or explicit close if supported.
                // For now, dropping references.
                // Note: StdioClientTransport usually kills the process on close/disconnect.
                // We'll rely on the SDK's behavior for now.
                // Using internal close if possible or just dereferencing.
                // Ideally: await transport.close();
                // But types definition might vary. Let's try casting to any if needed or just trusting it.
                (transport as any).close?.();
            } catch (e) {
                log.error('Disconnect error', { server: name, error: e });
            }
        }
        this.clients.delete(name);
        this.transports.delete(name);
    }

    /**
     * Test connection to server (ping)
     */
    async testConnection(server: MCPServer): Promise<boolean> {
        let client = this.clients.get(server.name);

        if (!client) {
            // Not connected context, try temporary connection? 
            // Or should we implement the logic from the old manager?
            // "if not connected, try to connect"
            try {
                await this.connectToServer(server);
                client = this.clients.get(server.name);
                if (!client) return false;
            } catch (e) {
                log.error('Test connection failed', { server: server.name, error: e });
                throw e;
            }
        }

        try {
            await client.listTools();
            return true;
        } catch (e) {
            log.error('Ping failed', { server: server.name, error: e });
            return false;
        }
    }
}
