import React, { useState, useEffect, useRef } from 'react';
import { ProvidersFactory } from '../providers/providers.factory';
import { ProviderType } from '../providers/types';
import type { ChatMessage } from '../providers/types';
import { ModelSelector, ModelOption, ProviderGroup } from './ModelSelector';
import { GitHubAuthModal } from './auth/GitHubAuthModal';
import { ApprovalModal } from './ApprovalModal';

// Extend ChatMessage with MCP details if needed locally
interface ExtendedMessage extends ChatMessage {
    mcpCalls?: Array<{
        server: string;
        input: string;
        output: string;
        duration: number;
        error: boolean;
    }>;
}

interface ChatInterfaceProps {
    conversationId: string | null;
    models: Array<{ name: string; displayName: string }>;
    currentModel: string;
    onModelChange: (model: string) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ conversationId, models: geminiModels, currentModel, onModelChange }) => {
    // State
    const [conversation, setConversation] = useState<any>(null); // Full conversation object
    const [messages, setMessages] = useState<ExtendedMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);

    // Providers & Models
    const [activeProviderType, setActiveProviderType] = useState<ProviderType>(ProviderType.GEMINI);
    const [activeModelId, setActiveModelId] = useState<string>('gemini-2.5-flash-lite');

    const [copilotConnected, setCopilotConnected] = useState(false);
    const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);

    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

    // Approval Modal State
    const [approvalRequest, setApprovalRequest] = useState<{ toolName: string; args: any } | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const factory = ProvidersFactory.getInstance();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize Providers & Fetch Models
    // Initialize Providers & Fetch Models
    useEffect(() => {
        const initProviders = async () => {
            // 1. Initialize Gemini (Check connection)
            const geminiStatus = await window.electronAPI.checkGeminiConnection();
            const isGeminiReady = geminiStatus.connected;

            try {
                await factory.initializeProvider(ProviderType.GEMINI);
            } catch (e) { console.warn("Gemini init warning", e); }

            // 2. Initialize Copilot (Persistence check)
            let isCopilotReady = false;
            try {
                const savedToken = await window.electronAPI.getAuthToken();
                if (savedToken) {
                    await factory.initializeProvider(ProviderType.COPILOT, { accessToken: savedToken });
                    isCopilotReady = true;
                } else {
                    await factory.initializeProvider(ProviderType.COPILOT);
                }
            } catch (e) {
                await factory.initializeProvider(ProviderType.COPILOT);
            }
            setCopilotConnected(isCopilotReady);

            // 3. Build Groups
            const groups: ProviderGroup[] = [];

            // Gemini Group
            const geminiProvider = factory.getProvider(ProviderType.GEMINI);
            let gModels: string[] = [];
            if (geminiProvider && isGeminiReady) {
                try {
                    gModels = await geminiProvider.getModels();
                } catch (e) { console.error("Failed to get Gemini models", e); }
            }

            groups.push({
                provider: ProviderType.GEMINI,
                displayName: 'Google AI',
                connected: isGeminiReady,
                models: gModels.length > 0 ? gModels.map((m: any) => ({
                    provider: ProviderType.GEMINI,
                    id: m.name || m,
                    displayName: m.displayName || m.name || m
                })) : []
            });

            // Copilot Group
            const copilotProvider = factory.getProvider(ProviderType.COPILOT);
            let cModels: string[] = [];
            if (copilotProvider) {
                try {
                    cModels = await copilotProvider.getModels();
                } catch (e) { console.warn("Failed Copilot models", e); }
            }

            groups.push({
                provider: ProviderType.COPILOT,
                displayName: 'GitHub Copilot Chat',
                connected: isCopilotReady,
                models: cModels.map((m: any) => ({
                    provider: ProviderType.COPILOT,
                    id: m.name || m,
                    displayName: m.displayName || m.name || m
                }))
            });

            setProviderGroups(groups);
        };
        initProviders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [copilotConnected]); // Re-run if connected status toggles (manually or via auth)

    // Sync Active Model from Props
    useEffect(() => {
        if (currentModel && providerGroups.length > 0) {
            const allModels = providerGroups.flatMap(g => g.models);
            const found = allModels.find(m => m.id === currentModel);
            if (found) {
                console.log('[ChatInterface] Syncing active model to:', found.id);
                setActiveModelId(found.id);
                setActiveProviderType(found.provider);
                factory.setActiveProvider(found.provider);
            } else {
                // Fallback: if model is just an ID string not in list (e.g. legacy or custom)
                // We assume Gemini default? or just set ID.
                // Better to visually indicate unknown or try to preserve it
                console.warn('[ChatInterface] Model not found in groups:', currentModel);
                // Try to guess provider?
                if (currentModel.startsWith('gemini')) {
                    setActiveModelId(currentModel);
                    setActiveProviderType(ProviderType.GEMINI);
                    factory.setActiveProvider(ProviderType.GEMINI);
                }
            }
        }
    }, [currentModel, providerGroups]);

    // Separate effect for global listeners
    useEffect(() => {
        const cleanupApproval = window.electronAPI.onApprovalRequest((data: { toolName: string; args: any }) => {
            console.log('[ChatInterface] Approval requested:', data);
            setApprovalRequest(data);
        });
        // Note: The current preload implementation doesn't return an unsubscribe easily.
        // We should just accept it for now or refactor preload.
        // Assuming this component mounts once or rarely re-mounts.
    }, []);

    // Load Conversation
    useEffect(() => {
        if (!conversationId) return;

        const loadConversation = async () => {
            try {
                const conv = await window.electronAPI.conversationLoad(conversationId);
                setConversation(conv);
                // Ensure messages match ExtendedMessage (add IDs if missing)
                const msgs = (conv.messages || []).map((m: any) => ({
                    ...m,
                    id: m.id || crypto.randomUUID()
                }));
                // Try to restore provider from conversation metadata if saved? 
                // For now, we keep current provider.
                setMessages(msgs);
            } catch (err) {
                console.error('Failed to load conversation:', err);
            }
        };
        loadConversation();
    }, [conversationId]);

    // Backend Updates Listener (Primary for Gemini)
    useEffect(() => {
        const handleUpdate = (updatedConversation: any) => {
            console.log('[ChatInterface] Received conversation update:', updatedConversation.id, 'Current:', conversationId);
            if (updatedConversation.id === conversationId) {
                console.log('[ChatInterface] Updating conversation state from backend.');
                setConversation(updatedConversation);
                const msgs = (updatedConversation.messages || []).map((m: any) => ({
                    ...m,
                    id: m.id || crypto.randomUUID()
                }));
                console.log('[ChatInterface] New messages count:', msgs.length);
                setMessages(msgs);
                setLoading(false); // Assume done if update arrives (or check if last msg is assistant)
            }
        };

        if (window.electronAPI.onConversationUpdate) {
            window.electronAPI.onConversationUpdate(handleUpdate);
        }
    }, [conversationId]);


    const handleModelSelection = async (option: ModelOption) => {
        const provider = factory.getProvider(option.provider);
        if (!provider) return;

        // 1. Check Auth/Availability
        const available = await provider.isAvailable();
        if (option.provider === ProviderType.COPILOT && !available) {
            setIsAuthModalOpen(true);
            return;
        }

        // 2. Set Active States
        factory.setActiveProvider(option.provider);
        setActiveProviderType(option.provider);
        setActiveModelId(option.id);

        // 3. Propagate to parent (for all providers to handle chat switching)
        onModelChange(option.id);
    };

    const handleConnectProvider = async (provider: ProviderType, credential?: string) => {
        if (provider === ProviderType.COPILOT) {
            setIsAuthModalOpen(true);
        } else if (provider === ProviderType.GEMINI && credential) {
            // Save Key
            await window.electronAPI.setGeminiKey(credential);
            // Force re-init (toggle a state or call initProviders)
            // A simple way is to toggle copilotConnected or add a new dependency to the useEffect
            // But better to just trigger a re-render or call initProviders directly?
            // Since initProviders is inside useEffect, we can force it by updating a dummy state or moving initProviders out.
            // For now, let's just trigger a re-mount essentially or setState.
            setCopilotConnected(prev => !prev); // Hack to trigger effect re-run
        }
    };

    const handleAuthSuccess = async (config: any) => {
        await factory.initializeProvider(ProviderType.COPILOT, config);

        // Save Token
        if (config.accessToken) {
            try {
                await window.electronAPI.saveAuthToken(config.accessToken);
            } catch (e) {
                console.error("Failed to save token", e);
            }
        }

        setCopilotConnected(true);
        // Refresh 
        factory.setActiveProvider(ProviderType.COPILOT);
        setActiveProviderType(ProviderType.COPILOT);
    };

    const handleSubmit = async () => {
        if (!input.trim() || loading) return;

        const userMsg: ExtendedMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: input,
            timestamp: new Date().toISOString()
        };

        const provider = factory.getActiveProvider();
        const updatedMessages = [...messages, userMsg];

        setInput('');
        setLoading(true);

        const MANAGED_BY_BACKEND = provider.managesHistory;

        if (!MANAGED_BY_BACKEND) {
            setMessages(updatedMessages);
        } else {
            setMessages(updatedMessages);
        }

        try {
            // Create placeholder for assistant if using client-side streaming
            let currentAssistantMsg: ExtendedMessage | null = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: new Date().toISOString()
            };

            // We always append the placeholder to show typing/response immediately
            setMessages([...updatedMessages, currentAssistantMsg]);

            let collectedContent = '';

            // Handle Streaming
            // Handle Streaming
            await provider.chatStream(
                updatedMessages,
                (chunk) => {
                    console.log('[ChatInterface] Processing chunk:', chunk);
                    collectedContent += chunk;

                    if (currentAssistantMsg) {
                        currentAssistantMsg.content = collectedContent;
                        // Force update
                        setMessages(prev => {
                            console.log('[ChatInterface] Updating messages state. Prev length:', prev.length);
                            const newMsgs = [...prev];
                            // Find the assistant message to update (it should be the last one)
                            // We used to only do this if !MANAGED_BY_BACKEND, but we want to show progress
                            // for ALL providers now.
                            if (newMsgs.length > 0) {
                                // Important: We match by ID or just index?
                                // If we pushed it earlier, it's the last one.
                                if (newMsgs[newMsgs.length - 1].id === currentAssistantMsg!.id) {
                                    newMsgs[newMsgs.length - 1] = { ...currentAssistantMsg! };
                                } else {
                                    // Fallback: search for it (though it really should be last)
                                    const idx = newMsgs.findIndex(m => m.id === currentAssistantMsg!.id);
                                    if (idx !== -1) {
                                        newMsgs[idx] = { ...currentAssistantMsg! };
                                    }
                                }
                            }
                            return newMsgs;
                        });
                    }
                },
                { model: activeModelId } // Pass selected model
            );

            // Sync with backend (logic to fetch updated full convo if managed)
            if (MANAGED_BY_BACKEND) {
                // The stream finished, but we might want to refresh from source of truth
                // to catch any 'clean up' or tool outputs that happened on server.
                if (conversationId) {
                    // trigger a reload or wait for onUpdate
                    // But we already showed the content, so it's fine.
                    // The main use of sync here was if we needed to SAVE local state to backend.
                }
            } else if (conversation && currentAssistantMsg) {
                // ... legacy sync for non-managed ...
                const finalMsgs = [...updatedMessages, { ...currentAssistantMsg, content: collectedContent }];
                const newConv = { ...conversation, messages: finalMsgs, updated: Date.now() };
                setConversation(newConv);
                await window.electronAPI.conversationSync(newConv);
            }

        } catch (err: any) {
            console.error(err);
            setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: `Error: ${err.message || 'Unknown error'}`,
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
        }
    };

    const formatContent = (content: string) => {
        if (content.startsWith('✅') || content.startsWith('❌')) return content;
        if (content.startsWith('Error:')) return content; // simplified
        return content;
    };

    const CollapsibleLog = ({ content }: { content: string }) => {
        const [isExpanded, setIsExpanded] = useState(false);
        let title = content.split('\n')[0];
        let details = content.substring(title.length);
        return (
            <div style={{ textAlign: 'left', margin: '0.5rem 0' }}>
                <div onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer', color: title.startsWith('✅') ? '#4CAF50' : '#f44336' }}>
                    {isExpanded ? '▼' : '▶'} {title}
                </div>
                {isExpanded && <pre style={{ backgroundColor: '#1E1E1E', padding: '0.5rem', marginTop: '0.5rem' }}>{details}</pre>}
            </div>
        );
    };

    const handleDisconnectProvider = async (provider: ProviderType) => {
        if (provider === ProviderType.COPILOT) {
            await window.electronAPI.saveAuthToken(null);
            setCopilotConnected(false);
        } else if (provider === ProviderType.GEMINI) {
            await window.electronAPI.signOutGemini();
            // Force re-check
            const status = await window.electronAPI.checkGeminiConnection();
            // We can just force re-render/re-effect
            setCopilotConnected(prev => !prev);
        }
        // Reset to Gemini default if we disconnected active?
        // Simple logic for now.
    };

    const handleApprovalResponse = (approved: boolean) => {
        window.electronAPI.sendApprovalResponse(approved);
        setApprovalRequest(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative', backgroundColor: '#1E1E1E' }}>

            {/* Messages Area */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {messages.map((msg, idx) => (
                    <div key={idx} style={{
                        marginBottom: '1rem',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.role === 'user' ? '#2b2b2b' : 'transparent',
                        padding: msg.role === 'user' || msg.role === 'system' ? '1rem' : '0',
                        borderRadius: '8px',
                        maxWidth: '80%',
                        textAlign: 'left'
                    }}>
                        <strong style={{ color: msg.role === 'user' ? '#4B90F5' : '#9DA5B4' }}>
                            {msg.role === 'user' ? 'You' : (msg.role === 'system' ? 'System' : (activeProviderType === ProviderType.COPILOT ? 'Copilot' : 'Gemini'))}
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', lineHeight: '1.5' }}>
                            {msg.role === 'system' ? <CollapsibleLog content={msg.content} /> : msg.content}
                        </div>
                    </div>
                ))}
                {loading && <div style={{ color: '#666' }}>Typing...</div>}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div style={{ padding: '12px', borderTop: '1px solid #3E3E42', backgroundColor: '#1E1E1E' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`Message ${activeProviderType === ProviderType.COPILOT ? 'Copilot' : 'Gemini'}... (Ctrl+Enter)`}
                    style={{ width: '100%', height: '80px', backgroundColor: '#252526', border: '1px solid #3E3E42', color: '#ECECEC', padding: '0.5rem', borderRadius: '6px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', alignItems: 'center' }}>
                    {/* Model Selector Replacement */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <ModelSelector
                            groups={providerGroups}
                            currentModelId={activeModelId}
                            activeProvider={activeProviderType}
                            onSelectModel={handleModelSelection}
                            onConnect={handleConnectProvider}
                            onDisconnect={handleDisconnectProvider}
                            onConfigure={() => {
                                if (activeProviderType === ProviderType.COPILOT) setIsAuthModalOpen(true);
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        {/* Send Button */}
                        <button onClick={handleSubmit} disabled={loading} style={{
                            padding: '6px 16px',
                            backgroundColor: '#007ACC',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}>
                            Send
                        </button>
                    </div>
                </div>
            </div>

            <GitHubAuthModal
                isOpen={isAuthModalOpen}
                onClose={() => setIsAuthModalOpen(false)}
                onAuthenticated={handleAuthSuccess}
            />

            <ApprovalModal
                isOpen={!!approvalRequest}
                toolName={approvalRequest?.toolName || ''}
                args={approvalRequest?.args}
                onApprove={() => handleApprovalResponse(true)}
                onDeny={() => handleApprovalResponse(false)}
            />
        </div>
    );
};

export default ChatInterface;
