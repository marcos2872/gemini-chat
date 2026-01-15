import React, { useState, useEffect, useRef } from 'react';
import { ProviderType, ModelOption, ProviderGroup } from '../hooks';

interface ModelSelectorProps {
    groups: ProviderGroup[];
    currentModelId: string;
    activeProvider: ProviderType;
    onSelectModel: (model: ModelOption) => void;
    onConnect: (provider: ProviderType, credential?: string) => void;
    onDisconnect?: (provider: ProviderType) => void;
    onConfigure?: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
    groups,
    currentModelId,
    activeProvider,
    onSelectModel,
    onConnect,
    onDisconnect,
    onConfigure
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const getIcon = (provider: ProviderType) => {
        return provider === ProviderType.GEMINI ? '🔮' : '🤖';
    };

    // Find current model label
    let currentLabel = 'Select Model';
    let currentIcon = '❓';

    // Search in groups
    for (const group of groups) {
        if (group.provider === activeProvider) {
            currentIcon = getIcon(group.provider);
            const model = group.models.find(m => m.id === currentModelId);
            if (model) currentLabel = model.displayName;
            break;
        }
    }

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    backgroundColor: '#2D2D30',
                    border: '1px solid #3E3E42',
                    borderRadius: '4px',
                    color: '#CCC',
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    outline: 'none',
                    minWidth: '150px'
                }}
            >
                <span>{currentIcon}</span>
                <span style={{ flex: 1, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {currentLabel}
                </span>
                <span style={{ fontSize: '0.7rem', color: '#888' }}>▼</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: 0,
                    marginBottom: '8px',
                    backgroundColor: '#1E1E1E',
                    border: '1px solid #454545',
                    borderRadius: '6px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    width: '300px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    padding: '4px 0'
                }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
                        <input
                            type="text"
                            placeholder="Select a model..."
                            style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: '#FFF',
                                width: '100%',
                                outline: 'none',
                                fontSize: '0.9rem'
                            }}
                            autoFocus
                        />
                    </div>

                    {groups.map((group) => (
                        <div key={group.provider}>
                            <div style={{
                                padding: '8px 12px',
                                fontSize: '0.75rem',
                                color: '#888',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                marginTop: '4px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <span>{group.displayName}</span>
                                {group.connected ? (
                                    onDisconnect && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDisconnect(group.provider);
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#f44336',
                                                cursor: 'pointer',
                                                fontSize: '0.7rem',
                                                padding: '2px 6px',
                                                borderRadius: '2px',
                                            }}
                                            title="Disconnect"
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(244, 67, 54, 0.1)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            ✕
                                        </button>
                                    )
                                ) : (
                                    <span style={{ fontSize: '0.7rem', color: '#666' }}>Disconnected</span>
                                )}
                            </div>

                            {group.connected ? (
                                group.models.map(model => (
                                    <div
                                        key={`${model.provider}-${model.id}`}
                                        onClick={() => {
                                            onSelectModel(model);
                                            setIsOpen(false);
                                        }}
                                        style={{
                                            padding: '6px 16px',
                                            fontSize: '0.9rem',
                                            color: (model.id === currentModelId && model.provider === activeProvider) ? '#FFF' : '#CCC',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            backgroundColor: (model.id === currentModelId && model.provider === activeProvider) ? '#094771' : 'transparent',
                                        }}
                                        onMouseEnter={(e) => {
                                            if (model.id !== currentModelId || model.provider !== activeProvider)
                                                e.currentTarget.style.backgroundColor = '#2D2D30';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (model.id !== currentModelId || model.provider !== activeProvider)
                                                e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <span>{getIcon(model.provider)}</span>
                                        {model.displayName}
                                        {(model.id === currentModelId && model.provider === activeProvider) && (
                                            <span style={{ marginLeft: 'auto', fontSize: '0.8rem' }}>✓</span>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div style={{ padding: '8px 16px' }}>
                                    {group.provider === ProviderType.GEMINI || group.provider === ProviderType.COPILOT ? (
                                        <button
                                            onClick={() => onConnect(group.provider, 'oauth')}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                backgroundColor: '#252526',
                                                border: '1px solid #3E3E42',
                                                borderRadius: '4px',
                                                color: '#FFF',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2D2D30'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#252526'}
                                        >
                                            Connect {group.displayName}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onConnect(group.provider)}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                backgroundColor: '#252526',
                                                border: '1px solid #3E3E42',
                                                borderRadius: '4px',
                                                color: '#FFF',
                                                cursor: 'pointer',
                                                fontSize: '0.85rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2D2D30'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#252526'}
                                        >
                                            Connect {group.displayName}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}

                </div>
            )}
        </div>
    );
};
