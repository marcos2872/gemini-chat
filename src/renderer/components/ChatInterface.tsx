import React, { useState, useEffect, useRef } from 'react';
import type { Message } from '../../shared/types';
import {
    useProviders,
    useCopilotAuth,
    useGeminiAuth,
    useConversation,
    useChat,
    useApproval,
    ProviderType,
    ModelOption
} from '../hooks';
import { GitHubAuthModal } from './auth/GitHubAuthModal';
import { ApprovalModal } from './ApprovalModal';
import { ChatMessages, ChatInput } from './chat';

interface ChatInterfaceProps {
    conversationId: string | null;
    models: Array<{ name: string; displayName: string }>;
    currentModel: string;
    onModelChange: (model: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
    conversationId,
    models,
    currentModel,
    onModelChange
}) => {
    // Hooks
    const providers = useProviders();
    const copilotAuth = useCopilotAuth();
    const geminiAuth = useGeminiAuth(); // New hook for Gemini
    const conversation = useConversation();
    const chat = useChat();
    const approval = useApproval(); // New hook for Approvals

    // UI State
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Scroll to bottom on new messages
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [conversation.messages]);

    // Initialize providers on mount
    useEffect(() => {
        const init = async () => {

            await providers.initProviders();
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [copilotAuth.isAuthenticated]);

    // Sync active model from props
    useEffect(() => {
        if (currentModel && providers.providerGroups.length > 0) {
            const allModels = providers.providerGroups.flatMap(g => g.models);
            const found = allModels.find(m => m.id === currentModel);
            if (found) {
                providers.selectModel(found);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentModel, providers.providerGroups]);

    // Listen for approval requests (replaced with useApproval hook)
    // useEffect(() => { ... }, []); -> Handled inside useApproval hook state

    // Load conversation when ID changes
    useEffect(() => {
        if (conversationId) {
            conversation.loadConversation(conversationId);
        }
    }, [conversationId]);

    // Handle model selection
    const handleModelSelection = async (option: ModelOption) => {
        if (option.provider === ProviderType.COPILOT) {
            const group = providers.providerGroups.find(g => g.provider === ProviderType.COPILOT);
            if (!group?.connected) {
                setIsAuthModalOpen(true);
                return;
            }
        }
        providers.selectModel(option);
        onModelChange(option.id);
    };

    // Handle provider connection
    const handleConnectProvider = async (provider: ProviderType) => {
        if (provider === ProviderType.COPILOT) {
            setIsAuthModalOpen(true);
        }
    };

    // Handle auth success
    const handleAuthSuccess = async (config: { accessToken: string; tokenType: string }) => {
        await providers.initProviders(config.accessToken);
    };

    // Handle disconnect
    const handleDisconnectProvider = async (provider: ProviderType) => {
        if (provider === ProviderType.COPILOT) {
            await copilotAuth.signOut();
            await providers.initProviders(null);
        } else if (provider === ProviderType.GEMINI) {
            await geminiAuth.signOut();
            await providers.initProviders();
        }
    };

    // Submit message
    const handleSubmit = async () => {
        if (!input.trim() || loading) return;

        const userMsg: Message = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input,
            timestamp: new Date().toISOString()
        };

        conversation.addMessage(userMsg);
        setInput('');
        setLoading(true);

        try {
            const assistantMsgId = crypto.randomUUID();
            const assistantMsg: Message = {
                id: assistantMsgId,
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString()
            };
            conversation.addMessage(assistantMsg);

            if (providers.activeProvider === ProviderType.GEMINI) {
                await chat.sendMessage(input, ProviderType.GEMINI, providers.activeModelId);
            } else {
                let collectedContent = '';

                const cleanupChunk = chat.onChunk((chunk: string) => {
                    collectedContent += chunk;
                    conversation.updateMessage(assistantMsgId, { content: collectedContent });
                });

                try {
                    const history = [...conversation.messages];
                    const contextMessages = history.filter(m => m.id !== assistantMsgId);

                    await chat.sendMessage(input, ProviderType.COPILOT, providers.activeModelId, contextMessages);
                } finally {
                    cleanupChunk();
                    setLoading(false);
                }

                if (conversation.conversation) {
                    const finalMsg = { ...assistantMsg, content: collectedContent };
                    const updatedConv = {
                        ...conversation.conversation,
                        messages: conversation.messages.map(m => m.id === assistantMsgId ? finalMsg : m),
                        updated: Date.now()
                    };
                    await conversation.syncConversation(updatedConv);
                }
            }
        } catch (err: any) {
            console.error(err);
            conversation.addMessage({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Error: ${err.message || 'Unknown error'}`,
                timestamp: new Date().toISOString()
            });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
        }
    };

    const handleApprovalResponse = (isApproved: boolean) => {
        if (isApproved) approval.approve();
        else approval.deny();
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            overflow: 'hidden',
            position: 'relative',
            backgroundColor: '#1E1E1E'
        }}>
            <ChatMessages
                messages={conversation.messages}
                loading={loading}
                activeProviderType={providers.activeProvider}
                ref={messagesEndRef}
            />

            <ChatInput
                input={input}
                onInputChange={setInput}
                onSubmit={handleSubmit}
                onKeyDown={handleKeyDown}
                loading={loading}
                activeProviderType={providers.activeProvider}
                providerGroups={providers.providerGroups}
                activeModelId={providers.activeModelId}
                onSelectModel={handleModelSelection}
                onConnect={handleConnectProvider}
                onDisconnect={handleDisconnectProvider}
                onConfigure={() => {
                    if (providers.activeProvider === ProviderType.COPILOT) {
                        setIsAuthModalOpen(true);
                    }
                }}
            />

            <GitHubAuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onAuthenticated={handleAuthSuccess}
            />

            <ApprovalModal
                isOpen={!!approval.approvalRequest}
                toolName={approval.approvalRequest?.toolName || ''}
                args={approval.approvalRequest?.args}
                onApprove={() => handleApprovalResponse(true)}
                onDeny={() => handleApprovalResponse(false)}
            />
        </div>
    );
};

export default ChatInterface;
