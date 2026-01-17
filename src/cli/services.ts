// Shared services for CLI hooks - using Dependency Injection for testability
import { GeminiClient } from '../boot/gemini-client';
import { CopilotClient } from '../boot/copilot-client';
import { CopilotAuthService } from '../boot/copilot-auth-service';
import { OllamaClient } from '../boot/ollama-client';
import { ConversationStorage } from '../boot/conversation-storage';
import { McpService } from '../boot/mcp/McpService';

/**
 * ServiceContainer manages dependency injection for the application.
 * It allows registering mocks for testing and ensures singletons for production.
 */
export class ServiceContainer {
    private static instance: ServiceContainer;

    private _storage: ConversationStorage | null = null;
    private _mcpService: McpService | null = null;
    private _gemini: GeminiClient | null = null;
    private _copilot: CopilotClient | null = null;
    private _copilotAuth: CopilotAuthService | null = null;
    private _ollama: OllamaClient | null = null;

    private constructor() {}

    static getInstance(): ServiceContainer {
        if (!ServiceContainer.instance) {
            ServiceContainer.instance = new ServiceContainer();
        }
        return ServiceContainer.instance;
    }

    // Getters with lazy initialization
    get storage(): ConversationStorage {
        if (!this._storage) this._storage = new ConversationStorage();
        return this._storage;
    }

    get mcpService(): McpService {
        if (!this._mcpService) this._mcpService = new McpService();
        return this._mcpService;
    }

    get gemini(): GeminiClient {
        if (!this._gemini) this._gemini = new GeminiClient();
        return this._gemini;
    }

    get copilot(): CopilotClient {
        if (!this._copilot) this._copilot = new CopilotClient();
        return this._copilot;
    }

    get copilotAuth(): CopilotAuthService {
        if (!this._copilotAuth) this._copilotAuth = new CopilotAuthService();
        return this._copilotAuth;
    }

    get ollama(): OllamaClient {
        if (!this._ollama) this._ollama = new OllamaClient();
        return this._ollama;
    }

    // Dependency Injection methods for testing
    setStorage(mock: ConversationStorage) {
        this._storage = mock;
    }
    setMcpService(mock: McpService) {
        this._mcpService = mock;
    }
    setGemini(mock: GeminiClient) {
        this._gemini = mock;
    }
    setCopilot(mock: CopilotClient) {
        this._copilot = mock;
    }
    setCopilotAuth(mock: CopilotAuthService) {
        this._copilotAuth = mock;
    }
    setOllama(mock: OllamaClient) {
        this._ollama = mock;
    }

    // Reset all services (useful for cleanup between tests)
    reset() {
        this._storage = null;
        this._mcpService = null;
        this._gemini = null;
        this._copilot = null;
        this._copilotAuth = null;
        this._ollama = null;
    }
}

// Export singleton instance
export const services = ServiceContainer.getInstance();

// Backward compatibility exports - delegating to container
export const getStorage = () => services.storage;
export const getMcpService = () => services.mcpService;
export const getGemini = () => services.gemini;
export const getCopilot = () => services.copilot;
export const getCopilotAuth = () => services.copilotAuth;
export const getOllama = () => services.ollama;

// Direct access exports (still supported but getters are preferred)
export const storage = services.storage;
export const mcpService = services.mcpService;
export const gemini = services.gemini;
export const copilot = services.copilot;
export const copilotAuth = services.copilotAuth;
export const ollama = services.ollama;
