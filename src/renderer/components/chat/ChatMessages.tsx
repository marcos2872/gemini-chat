import React, { forwardRef } from 'react';
import type { Message } from '../../../shared/types';
import { ProviderType } from '../../hooks';
import { CollapsibleLog } from './CollapsibleLog';

interface ChatMessagesProps {
    messages: Message[];
    loading: boolean;
    activeProviderType: ProviderType;
}

/**
 * Chat messages display area.
 * Renders message list with proper styling for user/assistant/system messages.
 */
export const ChatMessages = forwardRef<HTMLDivElement, ChatMessagesProps>(
    ({ messages, loading, activeProviderType }, ref) => {
        return (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                {messages.map((msg, idx) => (
                    <div
                        key={msg.id || idx}
                        style={{
                            marginBottom: '1rem',
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: msg.role === 'user' ? '#2b2b2b' : 'transparent',
                            padding: msg.role === 'user' || msg.role === 'system' ? '1rem' : '0',
                            borderRadius: '8px',
                            maxWidth: '80%',
                            textAlign: 'left',
                        }}
                    >
                        <strong
                            style={{
                                color: msg.role === 'user' ? '#4B90F5' : '#9DA5B4',
                            }}
                        >
                            {msg.role === 'user'
                                ? 'You'
                                : msg.role === 'system'
                                  ? 'System'
                                  : activeProviderType === ProviderType.COPILOT
                                    ? 'Copilot'
                                    : 'Gemini'}
                        </strong>
                        <div
                            style={{
                                whiteSpace: 'pre-wrap',
                                marginTop: '0.5rem',
                                lineHeight: '1.5',
                            }}
                        >
                            {msg.role === 'system' ? (
                                <CollapsibleLog content={msg.content} />
                            ) : (
                                msg.content
                            )}
                        </div>
                    </div>
                ))}
                {loading && <div style={{ color: '#666' }}>Typing...</div>}
                <div ref={ref} />
            </div>
        );
    },
);

ChatMessages.displayName = 'ChatMessages';
