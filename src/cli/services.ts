// Shared services for CLI hooks - Lazy loaded for better startup performance
import { GeminiClient } from '../boot/gemini-client';
import { CopilotClient } from '../boot/copilot-client';
import { CopilotAuthService } from '../boot/copilot-auth-service';
import { OllamaClient } from '../boot/ollama-client';
import { ConversationStorage } from '../boot/conversation-storage';
import { McpService } from '../boot/mcp/McpService';

// Private instances - lazy initialized
let _storage: ConversationStorage | null = null;
let _mcpService: McpService | null = null;
let _gemini: GeminiClient | null = null;
let _copilot: CopilotClient | null = null;
let _copilotAuth: CopilotAuthService | null = null;
let _ollama: OllamaClient | null = null;

// Lazy getters - instantiate only when first accessed
export const getStorage = (): ConversationStorage => {
    if (!_storage) {
        _storage = new ConversationStorage();
    }
    return _storage;
};

export const getMcpService = (): McpService => {
    if (!_mcpService) {
        _mcpService = new McpService();
    }
    return _mcpService;
};

export const getGemini = (): GeminiClient => {
    if (!_gemini) {
        _gemini = new GeminiClient();
    }
    return _gemini;
};

export const getCopilot = (): CopilotClient => {
    if (!_copilot) {
        _copilot = new CopilotClient();
    }
    return _copilot;
};

export const getCopilotAuth = (): CopilotAuthService => {
    if (!_copilotAuth) {
        _copilotAuth = new CopilotAuthService();
    }
    return _copilotAuth;
};

export const getOllama = (): OllamaClient => {
    if (!_ollama) {
        _ollama = new OllamaClient();
    }
    return _ollama;
};

// Backward compatibility - use getters but maintain same API
export const storage = getStorage();
export const mcpService = getMcpService();
export const gemini = getGemini();
export const copilot = getCopilot();
export const copilotAuth = getCopilotAuth();
export const ollama = getOllama();
