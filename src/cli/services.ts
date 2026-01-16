// Shared services for CLI hooks
import { GeminiClient } from '../boot/gemini-client';
import { CopilotClient } from '../boot/copilot-client';
import { CopilotAuthService } from '../boot/copilot-auth-service';
import { OllamaClient } from '../boot/ollama-client';
import { ConversationStorage } from '../boot/conversation-storage';
import { McpService } from '../boot/mcp/McpService';

export const storage = new ConversationStorage();
export const mcpService = new McpService();
export const gemini = new GeminiClient();
export const copilot = new CopilotClient();
export const copilotAuth = new CopilotAuthService();
export const ollama = new OllamaClient();
