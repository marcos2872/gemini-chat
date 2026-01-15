import { McpConfigService, MCPServer } from "./McpConfigService";
import { McpConnectionManager } from "./McpConnectionManager";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { URL } from "url";

export class McpService {
  private configService: McpConfigService;
  private connectionManager: McpConnectionManager;

  constructor() {
    this.configService = new McpConfigService();
    this.connectionManager = new McpConnectionManager();
  }

  async init() {
    await this.connectAll();
  }

  async connectAll() {
    const servers = await this.configService.loadServers();
    for (const server of servers) {
      await this.connectionManager.connectToServer(server);
    }
  }

  async getServers() {
    return this.configService.loadServers();
  }

  async testConnection(name: string) {
    const servers = await this.configService.loadServers();
    const server = servers.find((s) => s.name === name);
    if (!server) throw new Error(`Server ${name} not found`);
    return this.connectionManager.testConnection(server);
  }

  async getAllTools() {
    const uniqueTools = new Map();
    const clients = this.connectionManager.getClients();

    for (const [name, client] of clients.entries()) {
      try {
        const toolsResult = await client.listTools();
        for (const tool of toolsResult.tools) {
          const uniqueName = `${name}__${tool.name}`;
          if (!uniqueTools.has(uniqueName)) {
            uniqueTools.set(uniqueName, {
              ...tool,
              name: uniqueName,
              serverName: name,
              originalName: tool.name,
            });
          }
        }
      } catch (error) {
        console.error(`[MCP] Failed to list tools for ${name}:`, error);
      }
    }
    return Array.from(uniqueTools.values());
  }

  async getAllPrompts() {
    const allPrompts = [];
    const clients = this.connectionManager.getClients();

    for (const [name, client] of clients.entries()) {
      try {
        const result = await client.listPrompts();
        const prompts = result.prompts.map((prompt) => ({
          ...prompt,
          serverName: name,
        }));
        allPrompts.push(...prompts);
      } catch (error) {
        // Not all servers support prompts
      }
    }
    return allPrompts;
  }

  async getPrompt(serverName: string, promptName: string, args: any = {}) {
    const client = this.connectionManager.getClient(serverName);
    if (!client) throw new Error(`Server ${serverName} is not connected.`);

    return await client.getPrompt({
      name: promptName,
      arguments: args,
    });
  }

  async callTool(namespacedToolName: string, args: any) {
    const parts = namespacedToolName.split("__");
    if (parts.length < 2)
      throw new Error(`Invalid tool name format: ${namespacedToolName}`);

    const serverName = parts[0];
    const toolName = parts.slice(1).join("__");

    const client = this.connectionManager.getClient(serverName);
    if (!client)
      throw new Error(`Server ${serverName} is not connected or not found.`);

    console.log(`[MCP] Calling tool ${toolName} on ${serverName}...`);
    const result = await client.callTool({
      name: toolName,
      arguments: args,
    });
    return this.sanitizeResponse(result);
  }

  private sanitizeResponse(obj: any): any {
    // Security check: ensure content exists and is text
    if (!obj?.content?.[0]?.text) return obj;

    try {
      const innerText = obj.content[0].text;
      // Try to parse and minify (remove JSON whitespace)
      // If not valid JSON (e.g. simple text), it will error and fall into catch
      const parsed = JSON.parse(innerText);
      obj.content[0].text = JSON.stringify(parsed);
    } catch (e) {
      console.error("[MCP] Failed to parse JSON:", e);
    }
    return obj;
  }

  // --- Configuration Management ---

  async addServer(server: MCPServer) {
    const servers = await this.configService.loadServers();

    if (servers.find((s) => s.name === server.name)) {
      throw new Error(`Server with name "${server.name}" already exists.`);
    }

    // Validate
    if (server.type === "sse") {
      if (!server.url) throw new Error("URL is required for SSE servers.");
      try {
        new URL(server.url);
      } catch {
        throw new Error("Invalid URL format.");
      }
    } else {
      if (!server.command) throw new Error("Command is required.");
      // Basic validation delegated to simple checks or assumed mostly valid by manager but could verify path execution here if we moved _validateCommand logic.
      // For now, let's keep it simple or implement _validateCommand in helper/config service?
      // ConnectionManager will fail to connect if invalid, which is "ok" but better to fail early.
      // Let's assume ConfigService could have validation static methods?
      // Or just check here.
    }

    servers.push({
      ...server,
      args: server.args || [],
      env: server.env || {},
      url: server.url,
      type: server.type || "stdio",
      token: server.token,
      enabled: server.enabled !== false,
    });

    await this.configService.saveServers(servers);
    console.log(`[MCP] Server "${server.name}" added.`);

    // Auto connect
    await this.connectionManager.connectToServer(server);
  }

  async removeServer(name: string) {
    const servers = await this.configService.loadServers();
    const filtered = servers.filter((s) => s.name !== name);
    if (filtered.length === servers.length) {
      throw new Error(`Server "${name}" not found.`);
    }

    await this.connectionManager.disconnectServer(name);
    await this.configService.saveServers(filtered);
    console.log(`[MCP] Server "${name}" removed.`);
  }

  async updateServer(name: string, updates: Partial<MCPServer>) {
    const servers = await this.configService.loadServers();
    const index = servers.findIndex((s) => s.name === name);
    if (index === -1) {
      throw new Error(`Server "${name}" not found.`);
    }

    if (updates.name && updates.name !== name) {
      if (servers.find((s) => s.name === updates.name)) {
        throw new Error(`Server name "${updates.name}" is already taken.`);
      }
    }

    const oldEnabled = servers[index].enabled;
    const newEnabled =
      updates.enabled !== undefined ? updates.enabled : oldEnabled;

    servers[index] = { ...servers[index], ...updates };
    await this.configService.saveServers(servers);

    if (oldEnabled && newEnabled === false) {
      await this.connectionManager.disconnectServer(name);
    } else if (
      (!oldEnabled || !this.connectionManager.hasConnection(name)) &&
      newEnabled === true
    ) {
      console.log(`[MCP] Enabling server ${name}, connecting...`);
      await this.connectionManager.connectToServer(servers[index]);
    }

    console.log(`[MCP] Server "${name}" updated.`);
  }

  async testConfig(config: MCPServer) {
    let transport: StdioClientTransport | SSEClientTransport;
    if (config.type === "sse") {
      if (!config.url) throw new Error("URL is required");
      const opts: any = {};
      if (config.token) {
        // Simple auth provider usage (re-implemented inline for now or we could export it)
        opts.authProvider = {
          tokens: async () => ({
            access_token: config.token!,
            token_type: "Bearer",
          }),
          redirectUrl: undefined,
          clientInformation: async () => undefined,
          saveClientInformation: async () => {},
          saveTokens: async () => {},
          redirectToAuthorization: async () => {},
          saveCodeVerifier: async () => {},
          codeVerifier: async () => "",
        };
      }
      transport = new SSEClientTransport(new URL(config.url), opts);
    } else {
      if (!config.command) throw new Error("Command is required");
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args || [],
        env: { ...process.env, ...(config.env || {}) } as Record<
          string,
          string
        >,
      });
    }

    const client = new Client(
      { name: "gemini-desktop-test", version: "1.0.0" },
      { capabilities: { sampling: {} } }
    );

    try {
      await client.connect(transport);
      await client.listTools();
      await transport.close().catch(() => {});
      return true;
    } catch (e) {
      try {
        await transport.close().catch(() => {});
      } catch {}
      throw e;
    }
  }
}
