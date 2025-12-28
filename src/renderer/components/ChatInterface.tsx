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

    const formatContent = (content: string) => {
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {Array.isArray(messages) && messages.map((msg, idx) => (
                    <div key={idx} style={{
                        marginBottom: '1rem',
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        backgroundColor: msg.role === 'user' ? '#2b2b2b' : (msg.content.startsWith('Error:') ? 'rgba(255, 0, 0, 0.1)' : 'transparent'),
                        padding: msg.role === 'user' || msg.content.startsWith('Error:') ? '1rem' : '0',
                        borderRadius: '8px',
                        border: msg.content.startsWith('Error:') ? '1px solid #700' : 'none'
                    }}>
                        <strong style={{ color: msg.role === 'user' ? '#4B90F5' : (msg.content.startsWith('Error:') ? '#ff6b6b' : '#9DA5B4') }}>
                            {msg.role === 'user' ? 'You' : (msg.content.startsWith('Error:') ? 'System Error' : 'Gemini')}
                        </strong>
                        <div style={{ whiteSpace: 'pre-wrap', marginTop: '0.5rem', lineHeight: '1.5' }}>
                            {formatContent(msg.content)}
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
