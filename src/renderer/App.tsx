import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import MCPServerPanel from './components/MCPServerPanel';
import ConversationHistory from './components/ConversationHistory';

const App: React.FC = () => {
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [models, setModels] = useState<Array<{ name: string; displayName: string }>>([]);
    const [currentModel, setCurrentModel] = useState('gemini-2.5-flash-preview-09-2025');

    const handleNewConversation = async () => {
        const conv = await window.electronAPI.conversationNew();
        setCurrentConversationId(conv.id);
        setView('chat');
    };

    const handleSelectConversation = (id: string) => {
        setCurrentConversationId(id);
        setView('chat');
    };

    useEffect(() => {
        // Initialize with new conversation if none
        handleNewConversation();

        // Fetch models
        window.electronAPI.listModels().then(fetchedModels => {
            if (fetchedModels && fetchedModels.length > 0) {
                console.log('Loaded models:', fetchedModels);
                setModels(fetchedModels);
                // Set default to first model if current is invalid or unset
                // We also check if currentModel is in the list. If not, pick the first one.
                const exists = fetchedModels.find(m => m.name === currentModel);
                if (!exists) {
                    const firstModel = fetchedModels[0].name;
                    setCurrentModel(firstModel);
                    window.electronAPI.setModel(firstModel);
                }
            }
        }).catch(err => console.error('Failed to list models:', err));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className="app-container" style={{ flexDirection: 'row' }}>
            <MCPServerPanel />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100vh' }}>
                <div className="app-header">
                    <h1>Gemini Desktop</h1>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {models.length > 0 && (
                            <select
                                value={currentModel}
                                onChange={(e) => {
                                    const model = e.target.value;
                                    setCurrentModel(model);
                                    window.electronAPI.setModel(model)
                                        .then(() => console.log('Model changed to', model))
                                        .catch(err => console.error('Failed to change model', err));
                                }}
                                style={{
                                    padding: '0.4rem',
                                    borderRadius: '4px',
                                    border: '1px solid #444',
                                    backgroundColor: '#2D2D2D',
                                    color: '#fff',
                                    marginRight: '8px',
                                    maxWidth: '200px'
                                }}
                            >
                                {models.map(m => (
                                    <option key={m.name} value={m.name}>
                                        {m.displayName}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button onClick={handleNewConversation} className="primary-btn" style={{ marginRight: '8px', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>New Chat</button>
                        <button onClick={() => setView('history')} className="primary-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>History</button>
                    </div>
                </div>
                {view === 'chat' ? (
                    <ChatInterface conversationId={currentConversationId} />
                ) : (
                    <ConversationHistory onSelect={handleSelectConversation} />
                )}
            </div>
        </div >
    );
};

export default App;
