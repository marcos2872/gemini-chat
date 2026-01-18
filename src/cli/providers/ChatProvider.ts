import { storage, gemini, copilot, ollama } from '../services';
import { Provider, Model, Conversation, ApprovalCallback, Message } from '../../shared/types';
import { McpService } from '../../boot/mcp/McpService';
import { SendPromptResult } from '../../boot/clients/BaseClient';

/**
 * Options for sending a prompt to a provider.
 */
export interface SendOptions {
    /** Conversation history (unified format) */
    history: Message[];
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
    sendPrompt(text: string, options: SendOptions): Promise<SendPromptResult>;

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
 */
export const getProvider = (providerName: Provider): ChatProvider => {
    switch (providerName) {
        case 'gemini':
            return {
                sendPrompt: (text, options) =>
                    gemini.sendPrompt(
                        text,
                        options.history,
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
                sendPrompt: (text, options) =>
                    copilot.sendPrompt(
                        text,
                        options.history,
                        options.mcp,
                        options.onApproval,
                        options.signal,
                        options.onChunk,
                    ),
                isConfigured: () => copilot.isConfigured(),
                setModel: (m) => copilot.setModel(m),
                listModels: () => copilot.listModels(),
                initialize: () => copilot.initialize(),
            };
        case 'ollama':
            return {
                sendPrompt: (text, options) =>
                    ollama.sendPrompt(
                        text,
                        options.history,
                        options.mcp,
                        options.onApproval,
                        options.signal,
                        options.onChunk,
                    ),
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

    // Send to provider with history
    const result = await providerImpl.sendPrompt(text, {
        history: conversation.messages, // Pass existing history (without current prompt)
        mcp,
        onApproval,
        signal: options?.signal,
        onChunk: options?.onChunk,
    });

    // Build final messages list
    const newMessages: Message[] = [...conversationWithUser.messages];

    // Add tool messages if any
    if (result.toolMessages && result.toolMessages.length > 0) {
        newMessages.push(...result.toolMessages);
    }

    // Add AI response
    const aiMsg: Message = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString(),
        provider: provider,
    };
    newMessages.push(aiMsg);

    const finalConversation: Conversation = {
        ...conversationWithUser,
        messages: newMessages,
    };

    // Save conversation
    await storage.saveConversation(finalConversation);

    return {
        response: result.response,
        updatedConversation: finalConversation,
    };
};
