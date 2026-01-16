import React, { useState, useEffect } from 'react';
import { useConversation } from '../hooks';
import type { ConversationSummary } from '../../shared/types';

interface ConversationHistoryProps {
    onSelect: (id: string) => void;
    onDelete?: (id: string) => void;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({ onSelect, onDelete }) => {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const { listConversations, deleteConversation } = useConversation();

    // Removed polling (setInterval) for performance
    useEffect(() => {
        const load = async () => {
            try {
                const list = await listConversations();
                setConversations(list);
            } catch (e) {
                console.error(e);
            }
        };
        load();

        // Optional: Listen for window focus to refresh
        const handleFocus = () => load();
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [listConversations]);

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
            await deleteConversation(id);
            setConversations((prev) => prev.filter((c) => c.id !== id));
            if (onDelete) onDelete(id);
        }
    };

    return (
        <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem' }}
            role="list"
        >
            {Array.isArray(conversations) &&
                conversations.map((c) => (
                    <button
                        key={c.id}
                        onClick={() => onSelect(c.id)}
                        role="listitem"
                        aria-label={`Conversation from ${new Date(c.startTime).toLocaleDateString()}`}
                        style={{
                            padding: '0.8rem',
                            backgroundColor: 'var(--bg-tertiary)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            border: '1px solid var(--border-light)',
                            transition: 'background 0.2s',
                            textAlign: 'left',
                            width: '100%',
                            color: 'inherit',
                            display: 'block',
                        }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)')
                        }
                    >
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                marginBottom: '0.2rem',
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                {new Date(c.endTime || c.startTime).toLocaleDateString()}{' '}
                                {new Date(c.endTime || c.startTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                })}
                                {c.model && (
                                    <span
                                        style={{
                                            marginLeft: '8px',
                                            padding: '2px 6px',
                                            backgroundColor: 'var(--bg-quartary)',
                                            borderRadius: '4px',
                                            fontSize: '0.65rem',
                                            color: 'var(--text-tertiary)',
                                        }}
                                    >
                                        {c.model}
                                    </span>
                                )}
                            </span>
                            <span
                                onClick={(e) => handleDelete(e, c.id)}
                                role="button"
                                tabIndex={0}
                                aria-label="Delete conversation"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--danger)',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    lineHeight: 0.8,
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        handleDelete(e as any, c.id);
                                    }
                                }}
                            >
                                &times;
                            </span>
                        </div>
                        <div
                            style={{
                                color: 'var(--text-primary)',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {c.title || `Conversation ${new Date(c.startTime).toLocaleString()}`}
                        </div>
                    </button>
                ))}
        </div>
    );
};

export default ConversationHistory;
