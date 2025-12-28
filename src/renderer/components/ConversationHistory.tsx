import React, { useState, useEffect } from 'react';

interface Conversation {
    id: string;
    startTime: string;
    endTime: string;
    messages: any[];
}

interface ConversationHistoryProps {
    onSelect: (id: string) => void;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({ onSelect }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);

    useEffect(() => {
        const load = async () => {
            const list = await window.electronAPI.conversationList();
            setConversations(list);
        };
        load();
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
            await window.electronAPI.conversationDelete(id);
            setConversations(prev => prev.filter(c => c.id !== id));
        }
    };

    return (
        <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
            <h2>History</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {Array.isArray(conversations) && conversations.map(c => (
                    <div
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        style={{
                            padding: '1rem',
                            backgroundColor: '#252526',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            border: '1px solid #3E3E42'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: '#9DA5B4' }}>
                                {new Date(c.endTime).toLocaleString()}
                            </span>
                            <button
                                onClick={(e) => handleDelete(e, c.id)}
                                style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 0 }}
                            >
                                &times;
                            </button>
                        </div>
                        <div style={{ color: '#ECECEC', fontSize: '0.9rem' }}>
                            {c.messages.find(m => m.role === 'user')?.content.substring(0, 60) || 'Empty conversation'}...
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ConversationHistory;
