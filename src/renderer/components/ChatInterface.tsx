import React, { useState, useEffect, useRef } from 'react';

interface Message {
    role: 'user' | 'assistant';
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
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ conversationId }) => {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {Array.isArray(messages) && messages.map((msg, idx) => (
                    <div key={idx} style={{
                        marginBottom: '1rem',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.role === 'user' ? '#2b2b2b' : 'transparent',
                        padding: msg.role === 'user' ? '1rem' : '0',
                        borderRadius: '8px'
                    }}>
                        <strong style={{ color: msg.role === 'user' ? '#4B90F5' : '#9DA5B4' }}>
                            {msg.role === 'user' ? 'You' : 'Gemini'}
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', lineHeight: '1.5' }}>
                            {msg.content}
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

            <div style={{ padding: '1rem', borderTop: '1px solid #3E3E42', backgroundColor: '#252526' }}>
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
                <button
                    onClick={handleSubmit}
                    className="primary-btn"
                    style={{ marginTop: '0.5rem', float: 'right' }}
                    disabled={loading}
                >
                    Send
                </button>
            </div>
        </div>
    );
};

export default ChatInterface;
