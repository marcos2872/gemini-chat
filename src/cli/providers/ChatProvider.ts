import { storage, gemini, copilot, ollama } from '../services';
import { Provider, Model, Conversation, ApprovalCallback, Message } from '../../shared/types';
import { McpService } from '../../boot/mcp/McpService';

/**
 * Unified interface for all chat providers (Gemini, Copilot, Ollama).
 * Eliminates if/else chains by providing a common API.
 */
export interface ChatProvider {
    /** Send a prompt and get a response */
    sendPrompt(text: string, mcp: McpService, onApproval: ApprovalCallback): Promise<string>;

    /** Check if provider is configured/authenticated */
    isConfigured(): boolean;

    /** Set the active model */
    setModel(model: string): void;

    /** List available models */
    listModels(): Promise<Model[]>;

    /** Initialize the provider */
    initialize(): Promise<boolean>;
}

/**
 * Registry mapping provider names to their implementations.
 * Note: The actual clients already implement these methods,
 * we just need to wrap them to match the interface.
 */
export const getProvider = (providerName: Provider): ChatProvider => {
    switch (providerName) {
        case 'gemini':
            return {
                sendPrompt: (text, mcp, onApproval) => gemini.sendPrompt(text, mcp, onApproval),
                isConfigured: () => gemini.isConfigured(),
                setModel: (m) => gemini.setModel(m),
                listModels: () => gemini.listModels(),
                initialize: () => gemini.initialize(),
            };
        case 'copilot':
            return {
                sendPrompt: (text, mcp, onApproval) => copilot.sendPrompt(text, mcp, onApproval),
                isConfigured: () => copilot.isConfigured(),
                setModel: (m) => copilot.setModel(m),
                listModels: () => copilot.listModels(),
                initialize: () => copilot.initialize(),
            };
        case 'ollama':
            return {
                sendPrompt: (text, mcp, onApproval) => ollama.sendPrompt(text, mcp, onApproval),
                isConfigured: () => true, // Ollama doesn't need auth
                setModel: (m) => ollama.setModel(m),
                listModels: () => ollama.listModels(),
                initialize: () => ollama.validateConnection(),
            };
    }
};

/**
 * Helper to handle chat submission with any provider.
 * Encapsulates the common flow of sending a message and handling the response.
 */
export const handleChatSubmit = async (
    text: string,
    provider: Provider,
    conversation: Conversation,
    mcp: McpService,
    onApproval: ApprovalCallback,
): Promise<{ response: string; updatedConversation: Conversation }> => {
    const providerImpl = getProvider(provider);

    // Validate auth for providers that need it
    if (provider !== 'ollama' && !providerImpl.isConfigured()) {
        throw new Error(`${provider} not authenticated. Run /auth`);
    }

    // Create user message
    const userMsg: Message = {
        role: 'user',
        content: text,
        timestamp: new Date().toISOString(),
    };

    const conversationWithUser: Conversation = {
        ...conversation,
        messages: [...conversation.messages, userMsg],
    };

    // Send to provider
    const responseText = await providerImpl.sendPrompt(text, mcp, onApproval);

    // Create AI response message
    const aiMsg: Message = {
        role: 'model',
        content: responseText,
        timestamp: new Date().toISOString(),
        provider: provider,
    };

    const finalConversation: Conversation = {
        ...conversationWithUser,
        messages: [...conversationWithUser.messages, aiMsg],
    };

    // Save conversation
    await storage.saveConversation(finalConversation);

    return {
        response: responseText,
        updatedConversation: finalConversation,
    };
};
