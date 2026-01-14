import React, { useState, useEffect, useRef } from 'react';
import { ProvidersFactory } from '../providers/providers.factory';
import { ProviderType } from '../providers/types';
import type { ChatMessage } from '../providers/types';
import { ModelSelector, ModelOption, ProviderGroup } from './ModelSelector';
import { GitHubAuthModal } from './auth/GitHubAuthModal';

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

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const factory = ProvidersFactory.getInstance();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Initialize Providers & Fetch Models
    useEffect(() => {
        const initProviders = async () => {
             // 1. Initialize Gemini (Check connection)
             const geminiStatus = await window.electronAPI.checkGeminiConnection();
             const isGeminiReady = geminiStatus.connected;

             // Only initialize provider if ready (or maybe initialize anyway but it will be limited?)
             // The factory initialize might fail if no key? 
             // We'll initialize it, but the UI will show disconnected if not ready.
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
            
            // Fallback models if disconnected but we want to show options (optional)
            // Or just empty if disconnected.
            
            groups.push({
                provider: ProviderType.GEMINI,
                displayName: 'Google AI',
                connected: isGeminiReady,
                models: gModels.length > 0 ? gModels.map(m => ({
                    provider: ProviderType.GEMINI,
                    id: m,
                    displayName: m
                })) : []
            });

            // Copilot Group
            const copilotProvider = factory.getProvider(ProviderType.COPILOT);
            
            let cModels: string[] = [];
            if (copilotProvider) {
                 cModels = await copilotProvider.getModels();
            }
            
            groups.push({
                provider: ProviderType.COPILOT,
                displayName: 'GitHub Copilot Chat',
                connected: isCopilotReady,
                models: cModels.map(m => ({
                     provider: ProviderType.COPILOT,
                     id: m,
                     displayName: m === 'gpt-4' ? 'GPT-4' : (m === 'gpt-3.5-turbo' ? 'GPT-3.5 Turbo' : m)
                }))
            });
            
            setProviderGroups(groups);
            
            // Set initial active model from props
            if (currentModel) {
                 // Check if it's gemini
                 // We need to flatten to find
                 const allModels = groups.flatMap(g => g.models);
                 const found = allModels.find(m => m.id === currentModel);
                 if (found) {
                     setActiveModelId(found.id);
                     setActiveProviderType(found.provider);
                     factory.setActiveProvider(found.provider);
                 }
            }
        };
        initProviders();
    }, [currentModel, copilotConnected]); // Re-run if status changes

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
            if (updatedConversation.id === conversationId) {
                setConversation(updatedConversation);
                 const msgs = (updatedConversation.messages || []).map((m: any) => ({
                    ...m,
                    id: m.id || crypto.randomUUID()
                }));
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
        
        // 3. Propagate to parent if Gemini (for compatibility)
        if (option.provider === ProviderType.GEMINI) {
            onModelChange(option.id);
        }
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
            let currentAssistantMsg: ExtendedMessage | null = null;
            
            if (!MANAGED_BY_BACKEND) {
                 currentAssistantMsg = {
                    id: crypto.randomUUID(),
                    role: 'assistant',
                    content: '',
                    timestamp: new Date().toISOString()
                };
                setMessages([...updatedMessages, currentAssistantMsg]);
            }

            let collectedContent = '';

            // Handle Streaming
            await provider.chatStream(
                updatedMessages, 
                (chunk) => {
                    collectedContent += chunk;
                    
                    if (!MANAGED_BY_BACKEND && currentAssistantMsg) {
                        currentAssistantMsg.content = collectedContent;
                        // Force update
                         setMessages(prev => {
                            const newMsgs = [...prev];
                            newMsgs[newMsgs.length - 1] = { ...currentAssistantMsg! };
                            return newMsgs;
                        });
                    }
                },
                { model: activeModelId } // Pass selected model
            );
            
            // Sync with backend ONLY if NOT managed by backend
            if (!MANAGED_BY_BACKEND && conversation) {
                if (currentAssistantMsg) {
                    const finalMsgs = [...updatedMessages, { ...currentAssistantMsg, content: collectedContent }];
                    const newConv = { ...conversation, messages: finalMsgs, updated: Date.now() };
                    // Sync
                    setConversation(newConv);
                    await window.electronAPI.conversationSync(newConv);
                }
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
        </div>
    );
};

export default ChatInterface;
