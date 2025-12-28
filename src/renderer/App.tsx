import React, { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import MCPServerPanel from './components/MCPServerPanel';
import ConversationHistory from './components/ConversationHistory';

const App: React.FC = () => {
    const [view, setView] = useState<'chat' | 'history'>('chat');
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [models, setModels] = useState<Array<{ name: string; displayName: string }>>([]);
    const [currentModel, setCurrentModel] = useState('gemini-2.5-flash-lite');

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
        const init = async () => {
            // 1. Fetch models
            try {
                const fetchedModels = await window.electronAPI.listModels();
                if (fetchedModels && fetchedModels.length > 0) {
                    setModels(fetchedModels);
                    const exists = fetchedModels.find(m => m.name === currentModel);
                    if (!exists) {
                        const firstModel = fetchedModels[0].name;
                        setCurrentModel(firstModel);
                        window.electronAPI.setModel(firstModel);
                    }
                }
            } catch (err) {
                console.error('Failed to list models:', err);
            }

            // 2. Load recent conversation or create new
            try {
                const list = await window.electronAPI.conversationList();
                if (list && list.length > 0) {
                    // List is sorted by recent
                    const recent = list[0];
                    setCurrentConversationId(recent.id);
                } else {
                    await handleNewConversation();
                }
            } catch (err) {
                console.error('Failed to load recent conversation:', err);
                await handleNewConversation();
            }
        };

        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleModelChange = (model: string) => {
        setCurrentModel(model);
        window.electronAPI.setModel(model)
            .then(() => console.log('Model changed to', model))
            .catch(err => console.error('Failed to change model', err));
    };

    return (
        <div className="app-container" style={{ flexDirection: 'row', height: '100vh', display: 'flex' }}>
            {/* Sidebar */}
            <div style={{ width: '300px', display: 'flex', flexDirection: 'column', backgroundColor: '#252526', borderRight: '1px solid #3E3E42' }}>
                {/* History Section - Top */}
                <div style={{ height: '50%', borderBottom: '1px solid #3E3E42', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid #3E3E42', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}>History</h3>
                        <button onClick={handleNewConversation} style={{ background: 'none', border: '1px solid #4CAF50', color: '#4CAF50', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px', fontSize: '0.8rem' }}>+ New</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <ConversationHistory onSelect={handleSelectConversation} />
                    </div>
                </div>

                {/* MCP Section - Bottom */}
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <MCPServerPanel />
                </div>
            </div>

            {/* Main Content */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%' }}>
                <ChatInterface
                    conversationId={currentConversationId}
                    models={models}
                    currentModel={currentModel}
                    onModelChange={handleModelChange}
                />
            </div>
        </div>
    );
};

export default App;
