import { useCallback, useState, useRef } from 'react';
import { mcpService, ollama, gemini, copilot } from '../services';
import { createLogger } from '../../boot/lib/logger';
import {
    Provider,
    ChatMode,
    Model,
    Conversation,
    McpServer,
    ToolApprovalRequest,
} from '../../shared/types';
import { useChatState, ChatState, SETTINGS_KEY } from './useChatState';
import { useInitialization } from './useInitialization';
import { useApproval, ApprovalState } from './useApproval';
import { useMcpManager, McpManagerState } from './useMcpManager';
import { handleChatSubmit } from '../providers/ChatProvider';

const log = createLogger('useChat');

export { SETTINGS_KEY };
export type { Provider };

/**
 * CommandContext is the interface exposed to commands and UI components.
 * It aggregates all state and actions from sub-hooks.
 */
export interface CommandContext {
    // From useChatState
    provider: Provider;
    model: string;
    conversation: Conversation | null;
    isProcessing: boolean;
    status: string;
    mode: ChatMode;
    selectionModels: Model[];
    setProvider: (p: Provider) => void;
    setModel: (m: string) => void;
    setStatus: (s: string) => void;
    addSystemMessage: (msg: string, providerOverride?: string) => void;
    loadConversation: (conversation: Conversation) => void;
    setConversation: (c: Conversation | null) => void;
    forceUpdate: () => void;
    setMode: (mode: ChatMode) => void;
    setSelectionModels: (models: Model[]) => void;
    removeSystemMessage: (text: string, providerOverride?: string) => void;
    setIsProcessing: (isProcessing: boolean) => void;

    // Chat action
    handleSubmit: (text: string) => void;

    // Cancel/Streaming support
    cancelRequest: () => void;
    streamingText: string;

    // From useApproval
    approvalRequest: Omit<ToolApprovalRequest, 'resolve'> | null;
    handleApprove: () => void;
    handleReject: () => void;

    // From useMcpManager
    mcpServers: McpServer[];
    refreshMcpServers: () => Promise<void>;
    toggleMcpServer: (name: string) => Promise<void>;

    // Helpers
    checkConnection: () => Promise<void>;
}

/**
 * Main chat hook that composes smaller hooks.
 * This is the primary hook used by the App component.
 */
export const useChat = (): CommandContext => {
    // Compose sub-hooks
    const state: ChatState = useChatState();
    const approval: ApprovalState = useApproval();
    const mcpManager: McpManagerState = useMcpManager();

    // Streaming and cancellation state
    const [streamingText, setStreamingText] = useState('');
    const abortControllerRef = useRef<AbortController | null>(null);

    // Initialize app on mount
    useInitialization({
        setProvider: state.setProvider,
        setModel: state.setModel,
        setStatus: state.setStatus,
        setConversation: state.setConversation,
        provider: state.provider,
    });

    // Cancel current request
    const cancelRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
            state.setIsProcessing(false);
            state.setStatus('Cancelled');
            setStreamingText('');
            log.info('Request cancelled by user');
        }
    }, [state]);

    // Chat submit handler using unified provider interface
    const handleSubmit = useCallback(
        async (text: string) => {
            if (!text.trim() || state.isProcessing || !state.conversation) return;

            // Create AbortController for this request
            abortControllerRef.current = new AbortController();
            setStreamingText('');

            state.setIsProcessing(true);
            state.setStatus('Thinking...');

            // Optimistically update conversation with user message
            const userMsg = {
                role: 'user' as const,
                content: text,
                timestamp: new Date().toISOString(),
            };
            state.setConversation({
                ...state.conversation,
                messages: [...state.conversation.messages, userMsg],
            });

            try {
                const { updatedConversation } = await handleChatSubmit(
                    text,
                    state.provider,
                    state.conversation,
                    mcpService,
                    approval.onApproval,
                    {
                        signal: abortControllerRef.current.signal,
                        onChunk: (chunk) => {
                            setStreamingText((prev) => prev + chunk);
                        },
                    },
                );

                state.setConversation(updatedConversation);
                state.setStatus('Ready');
                setStreamingText('');
            } catch (err) {
                const error = err as Error;

                // Don't show error for cancelled requests
                if (error.message === 'Operation aborted') {
                    log.info('Request was cancelled');
                    return;
                }

                log.error('Chat submit failed', { error: error.message });
                state.setStatus(`Error: ${error.message}`);
                state.addSystemMessage(`Error: ${error.message}`);
            } finally {
                state.setIsProcessing(false);
                abortControllerRef.current = null;
            }
        },
        [state, approval.onApproval],
    );

    // Return aggregated context
    return {
        // From state
        provider: state.provider,
        model: state.model,
        conversation: state.conversation,
        isProcessing: state.isProcessing,
        status: state.status,
        mode: state.mode,
        selectionModels: state.selectionModels,
        setProvider: state.setProvider,
        setModel: state.setModel,
        setStatus: state.setStatus,
        setIsProcessing: state.setIsProcessing,
        setConversation: state.setConversation,
        setMode: state.setMode,
        setSelectionModels: state.setSelectionModels,
        addSystemMessage: state.addSystemMessage,
        loadConversation: (conv: Conversation) => {
            state.setConversation(conv);
            // Optionally restore model if it's saved in conversation
            if ((conv as { model?: string }).model) {
                state.setModel((conv as { model?: string }).model!);
            }
            log.info('Conversation loaded', { id: conv.id });
        },
        removeSystemMessage: state.removeSystemMessage,
        forceUpdate: state.forceUpdate,

        // Chat action
        handleSubmit,

        // Cancel/Streaming
        cancelRequest,
        streamingText,

        // From approval
        approvalRequest: approval.approvalRequest,
        handleApprove: approval.handleApprove,
        handleReject: approval.handleReject,

        // From MCP manager
        mcpServers: mcpManager.mcpServers,
        refreshMcpServers: mcpManager.refreshMcpServers,
        toggleMcpServer: mcpManager.toggleMcpServer,

        checkConnection: useCallback(async () => {
            if (state.provider === 'ollama') {
                state.setStatus('Checking Ollama...');
                const connected = await ollama.validateConnection();
                state.setStatus(connected ? 'Ready' : 'Ollama Not Detected');
            } else if (state.provider === 'gemini') {
                state.setStatus(gemini.isConfigured() ? 'Ready' : 'Not Authenticated');
            } else if (state.provider === 'copilot') {
                state.setStatus(copilot.isConfigured() ? 'Ready' : 'Not Authenticated');
            }
        }, [state]),
    };
};
