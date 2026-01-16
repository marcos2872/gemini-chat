import React from 'react';
import { ProviderType, ModelOption, ProviderGroup } from '../../hooks';
import { ModelSelector } from '../ModelSelector';

interface ChatInputProps {
    input: string;
    onInputChange: (value: string) => void;
    onSubmit: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    loading: boolean;
    activeProviderType: ProviderType;
    // Model selector props
    providerGroups: ProviderGroup[];
    activeModelId: string;
    onSelectModel: (model: ModelOption) => void;
    onConnect: (provider: ProviderType, credential?: string) => void;
    onDisconnect: (provider: ProviderType) => void;
    onConfigure: () => void;
}

/**
 * Chat input area with textarea and send button.
 * Includes model selector for switching between providers.
 */
export const ChatInput: React.FC<ChatInputProps> = ({
    input,
    onInputChange,
    onSubmit,
    onKeyDown,
    loading,
    activeProviderType,
    providerGroups,
    activeModelId,
    onSelectModel,
    onConnect,
    onDisconnect,
    onConfigure,
}) => {
    return (
        <div
            style={{
                padding: '12px',
                borderTop: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
            }}
        >
            <textarea
                value={input}
                onChange={(e) => onInputChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={`Message ${activeProviderType === ProviderType.COPILOT ? 'Copilot' : 'Gemini'}... (Ctrl+Enter)`}
                style={{
                    width: '100%',
                    height: '80px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    padding: '0.5rem',
                    borderRadius: '6px',
                    resize: 'none',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                }}
            />
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                    alignItems: 'center',
                }}
            >
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ModelSelector
                        groups={providerGroups}
                        currentModelId={activeModelId}
                        activeProvider={activeProviderType}
                        onSelectModel={onSelectModel}
                        onConnect={onConnect}
                        onDisconnect={onDisconnect}
                        onConfigure={onConfigure}
                    />
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        onClick={onSubmit}
                        disabled={loading}
                        style={{
                            padding: '6px 16px',
                            backgroundColor: loading ? 'var(--bg-hover)' : 'var(--accent)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {loading ? 'Sending...' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    );
};
