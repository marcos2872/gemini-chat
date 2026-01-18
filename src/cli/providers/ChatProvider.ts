import { storage, gemini, copilot, ollama } from '../services';
import { Provider, Model, Conversation, ApprovalCallback, Message } from '../../shared/types';
import { McpService } from '../../boot/mcp/McpService';

/**
 * Options for sending a prompt to a provider.
 * All fields except mcp and onApproval are optional for retrocompatibility.
 */
export interface SendOptions {
    /** MCP service for tools */
    mcp: McpService;
    /** Callback for tool approval */
    onApproval: ApprovalCallback;
    /** Optional: AbortSignal to cancel the request */
    signal?: AbortSignal;
    /** Optional: Callback for streaming chunks (Gemini only) */
    onChunk?: (chunk: string) => void;
}

/**
 * Unified interface for all chat providers (Gemini, Copilot, Ollama).
 * Eliminates if/else chains by providing a common API.
 */
export interface ChatProvider {
    /** Send a prompt and get a response */
    sendPrompt(text: string, options: SendOptions): Promise<string>;

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
                sendPrompt: (text, options) =>
                    gemini.sendPrompt(
                        text,
                        options.mcp,
                        options.onApproval,
                        options.signal,
                        options.onChunk,
                    ),
                isConfigured: () => gemini.isConfigured(),
                setModel: (m) => gemini.setModel(m),
                listModels: () => gemini.listModels(),
                initialize: () => gemini.initialize(),
            };
        case 'copilot':
            return {
                // Copilot doesn't support signal/onChunk yet, just pass the basics
                sendPrompt: (text, options) =>
                    copilot.sendPrompt(text, options.mcp, options.onApproval),
                isConfigured: () => copilot.isConfigured(),
                setModel: (m) => copilot.setModel(m),
                listModels: () => copilot.listModels(),
                initialize: () => copilot.initialize(),
            };
        case 'ollama':
            return {
                // Ollama doesn't support signal/onChunk yet, just pass the basics
                sendPrompt: (text, options) =>
                    ollama.sendPrompt(text, options.mcp, options.onApproval),
                isConfigured: () => ollama.isConfigured(),
                setModel: (m) => ollama.setModel(m),
                listModels: () => ollama.listModels(),
                initialize: () => ollama.validateConnection(),
            };
    }
};

/**
 * Options for handleChatSubmit
 */
export interface ChatSubmitOptions {
    /** Optional: AbortSignal to cancel the request */
    signal?: AbortSignal;
    /** Optional: Callback for streaming chunks */
    onChunk?: (chunk: string) => void;
}

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
    options?: ChatSubmitOptions,
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

    // Send to provider with all options
    const responseText = await providerImpl.sendPrompt(text, {
        mcp,
        onApproval,
        signal: options?.signal,
        onChunk: options?.onChunk,
    });

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
