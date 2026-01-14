import React, { useState, useEffect } from 'react';

interface Conversation {
    id: string;
    startTime: string;
    endTime: string;
    messages: any[];
}

interface ConversationHistoryProps {
    onSelect: (id: string) => void;
    onDelete?: (id: string) => void;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({ onSelect, onDelete }) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const list = await window.electronAPI.conversationList();
                setConversations(list);
            } catch (e) { console.error(e); }
        };
        // Poll for updates in case new chat is active
        const interval = setInterval(load, 2000);
        load();
        return () => clearInterval(interval);
    }, []);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
            await window.electronAPI.conversationDelete(id);
            setConversations(prev => prev.filter(c => c.id !== id));
            if (onDelete) onDelete(id);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem' }}>
            {Array.isArray(conversations) && conversations.map(c => (
                <div
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    style={{
                        padding: '0.8rem',
                        backgroundColor: '#333',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border: '1px solid #444',
                        transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#444'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#333'}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#9DA5B4' }}>
                            {new Date(c.endTime).toLocaleDateString()} {new Date(c.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {c.messages && c.messages.length > 0 && (
                                <span style={{ marginLeft: '8px', padding: '2px 6px', backgroundColor: '#444', borderRadius: '4px', fontSize: '0.65rem', color: '#ccc' }}>
                                    {(c as any).model || 'Unknown'}
                                </span>
                            )}
                        </span>
                        <button
                            onClick={(e) => handleDelete(e, c.id)}
                            style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: '1rem', lineHeight: 0.8 }}
                            title="Delete"
                        >
                            &times;
                        </button>
                    </div>
                    <div style={{ color: '#ECECEC', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.messages.find(m => m.role === 'user')?.content || 'New Conversation'}
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ConversationHistory;
