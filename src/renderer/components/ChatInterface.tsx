import React, { useState, useEffect, useRef } from 'react';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
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

const ChatInterface: React.FC<ChatInterfaceProps> = ({ conversationId, models, currentModel, onModelChange }) => {
    // ... (existing state) ...
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        if (!conversationId) return;

        const loadConversation = async () => {
            try {
                const conv = await window.electronAPI.conversationLoad(conversationId);
                setMessages(conv.messages || []);
            } catch (err) {
                console.error('Failed to load conversation:', err);
            }
        };
        loadConversation();
    }, [conversationId]);

    const handleSubmit = async () => {
        // ... (existing submit logic) ...
        if (!input.trim() || loading) return;

        const userMsg: Message = {
            role: 'user',
            content: input,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const result = await window.electronAPI.sendPrompt(userMsg.content);
            if (result.success && result.data) {
                const assistantMsg: Message = {
                    role: 'assistant',
                    content: result.data,
                    timestamp: new Date().toISOString(),
                    mcpCalls: result.mcpCalls
                };
                setMessages(prev => [...prev, assistantMsg]);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Error: ${result.error || 'Unknown error'}`,
                    timestamp: new Date().toISOString()
                }]);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit();
        }
    };

    const [approvalRequest, setApprovalRequest] = useState<{ toolName: string; args: any } | null>(null);

    useEffect(() => {
        const handleApproval = (data: { toolName: string; args: any }) => {
            setApprovalRequest(data);
        };

        if (window.electronAPI.onApprovalRequest) {
            window.electronAPI.onApprovalRequest(handleApproval);
        }
    }, []);

    const handleApprovalResponse = (approved: boolean) => {
        window.electronAPI.sendApprovalResponse(approved);
        setApprovalRequest(null);
    };

    // Listen for real-time history updates (e.g. system messages from backend)
    useEffect(() => {
        if (window.electronAPI.onConversationUpdate) {
            window.electronAPI.onConversationUpdate((updatedConversation: any) => {
                if (updatedConversation.id === conversationId) {
                    // We need to trigger a re-render/update
                    // Update state directly with the payload
                    setMessages(updatedConversation.messages);
                }
            });
        }
    }, [conversationId]); // Re-bind if ID changes

    const formatContent = (content: string) => {
        // System status messages
        if (content.startsWith('✅') || content.startsWith('❌')) {
            return content;
        }

        if (content.startsWith('Error:')) {
            // Check for GoogleGenerativeAI specific errors
            if (content.includes('[GoogleGenerativeAI Error]')) {
                const match = content.match(/\[(4\d{2}[^\]]*)\] (.*?)(?:\.|$)/);
                if (match) {
                    return `⚠️ API Error (${match[1]})\n${match[2]}`;
                }
                // Fallback for simple 429
                if (content.includes('429')) return "⚠️ Quota Exceeded. Please try again later.";
            }

            try {
                // Try to see if it contains a JSON error
                const jsonPart = content.replace(/^Error:\s*/, '');
                if (jsonPart.trim().startsWith('{')) {
                    const parsed = JSON.parse(jsonPart);
                    return parsed.message || parsed.error?.message || jsonPart;
                }
                return jsonPart;
            } catch (e) {
                return content.replace(/^Error:\s*/, '');
            }
        }
        return content;
    };

    const CollapsibleLog = ({ content }: { content: string }) => {
        const [isExpanded, setIsExpanded] = useState(false);

        let title = content;
        let details = '';

        if (content.includes('\nArgs:')) {
            const parts = content.split('\nArgs:');
            title = parts[0].trim();
            details = parts[1].trim();
        }

        return (
            <div style={{ textAlign: 'left', margin: '0.5rem 0' }}>
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.9rem',
                        color: title.startsWith('✅') ? '#4CAF50' : '#f44336'
                    }}
                >
                    <span style={{ marginRight: '0.5rem' }}>{isExpanded ? '▼' : '▶'}</span>
                    {title}
                </div>
                {isExpanded && details && (
                    <pre style={{
                        marginTop: '0.5rem',
                        backgroundColor: '#1E1E1E',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        overflowX: 'auto',
                        textAlign: 'left'
                    }}>
                        {details}
                    </pre>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', position: 'relative' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {Array.isArray(messages) && messages.map((msg, idx) => (
                    <div key={idx} style={{
                        marginBottom: '1rem',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.role === 'user' ? '#2b2b2b' : (
                            msg.role === 'system' ? 'rgba(76, 175, 80, 0.1)' : // Light green tint for system? Or maybe just transparent
                                (msg.content.startsWith('Error:') ? 'rgba(255, 0, 0, 0.1)' : 'transparent')
                        ),
                        // For system messages, let's give them a subtle border or background to make them "look like a message"
                        // but distinct. User said "like a chat message".
                        // Assistant is transparent default (no bg). 
                        // Let's make system messages have a slight background to distinguish, but left aligned.

                        padding: msg.role === 'user' || msg.content.startsWith('Error:') || msg.role === 'system' ? '1rem' : '0',

                        borderRadius: '8px',
                        border: msg.content.startsWith('Error:') ? '1px solid #700' : (
                            msg.role === 'system' ? '1px solid rgba(76, 175, 80, 0.3)' : 'none'
                        ),
                        maxWidth: '80%',
                        textAlign: 'left',
                        fontStyle: 'normal',
                        opacity: 1
                    }}>
                        {msg.role !== 'system' && (
                            <strong style={{ color: msg.role === 'user' ? '#4B90F5' : (msg.content.startsWith('Error:') ? '#ff6b6b' : '#9DA5B4') }}>
                                {msg.role === 'user' ? 'You' : (msg.content.startsWith('Error:') ? 'System Error' : 'Gemini')}
                            </strong>
                        )}
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: msg.role === 'system' ? '0' : '0.5rem', lineHeight: '1.5' }}>
                            {msg.role === 'system' && (msg.content.startsWith('✅') || msg.content.startsWith('❌')) ? (
                                <CollapsibleLog content={msg.content} />
                            ) : (
                                formatContent(msg.content)
                            )}
                        </div>
                        {msg.mcpCalls && msg.mcpCalls.length > 0 && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
                                {msg.mcpCalls.map((call, i) => (
                                    <div key={i}>
                                        ⚡ Used <strong>@{call.server}</strong> ({call.duration}ms)
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
                {loading && <div style={{ padding: '1rem', fontStyle: 'italic', color: '#666' }}>Typing...</div>}
                <div ref={messagesEndRef} />
            </div>

            {/* Approval Modal */}
            {approvalRequest && (
                <div style={{
                    position: 'absolute', bottom: '80px', left: '20px', right: '20px',
                    backgroundColor: '#1E1E1E', border: '1px solid #4CAF50', borderRadius: '8px',
                    padding: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
                    zIndex: 100
                }}>
                    <strong style={{ color: '#4CAF50', display: 'block', marginBottom: '0.5rem' }}>⚡ Tool Execution Requested</strong>
                    <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                        Gemini wants to run <strong>{approvalRequest.toolName}</strong> with arguments:
                        <pre style={{ backgroundColor: '#252526', padding: '0.5rem', borderRadius: '4px', overflowX: 'auto', marginTop: '0.5rem' }}>
                            {JSON.stringify(approvalRequest.args, null, 2)}
                        </pre>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={() => handleApprovalResponse(true)} style={{
                            backgroundColor: '#4CAF50', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'
                        }}>Allow</button>
                        <button onClick={() => handleApprovalResponse(false)} style={{
                            backgroundColor: '#ff6b6b', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer'
                        }}>Deny</button>
                    </div>
                </div>
            )}

            <div style={{ padding: '1rem', borderTop: '1px solid #3E3E42', backgroundColor: '#1E1E1E' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message... (Ctrl+Enter to send)"
                    style={{
                        width: '100%',
                        height: '80px',
                        backgroundColor: '#1E1E1E',
                        border: '1px solid #3E3E42',
                        color: '#ECECEC',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'inherit'
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <select
                            value={currentModel}
                            onChange={(e) => onModelChange(e.target.value)}
                            style={{
                                backgroundColor: '#1E1E1E',
                                color: '#ECECEC',
                                border: '1px solid #3E3E42',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                outline: 'none'
                            }}
                        >
                            {models.map(m => (
                                <option key={m.name} value={m.name}>{m.displayName}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleSubmit}
                        className="primary-btn"
                        style={{ padding: '8px 24px' }}
                        disabled={loading}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ChatInterface;
