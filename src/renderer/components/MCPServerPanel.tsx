import React, { useState, useEffect } from 'react';
import ServerModal from './ServerModal';

interface MCPServer {
    name: string;
    command: string;
    args?: string[];
    enabled?: boolean;
}

const CollapsibleSection = ({ title, count, children }: { title: string, count: number, children: React.ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);
    if (count === 0) return null;
    return (
        <div style={{ marginBottom: '0.5rem' }}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    color: '#9DA5B4',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: '4px',
                    userSelect: 'none'
                }}
            >
                <span style={{ marginRight: '5px', fontSize: '0.6rem' }}>{isOpen ? '▼' : '▶'}</span>
                {title} <span style={{ marginLeft: '4px', opacity: 0.6 }}>{count}</span>
            </div>
            {isOpen && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', paddingLeft: '8px' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

const MCPServerPanel: React.FC = () => {
    const [servers, setServers] = useState<MCPServer[]>([]);
    const [tools, setTools] = useState<any[]>([]);
    const [prompts, setPrompts] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingServer, setEditingServer] = useState<MCPServer | undefined>(undefined);

    const loadServers = async () => {
        const list = await window.electronAPI.mcpList();
        setServers(list);

        try {
            const [t, p] = await Promise.all([
                window.electronAPI.mcpListTools(),
                window.electronAPI.mcpListPrompts()
            ]);
            setTools(t);
            setPrompts(p);
        } catch (e) {
            console.error('Failed to load MCP capabilities', e);
        }
    };

    useEffect(() => {
        loadServers();
        // Poll for tool updates every few seconds? Or just on mount/action.
        const interval = setInterval(loadServers, 10000); // 10s refresh
        return () => clearInterval(interval);
    }, []);

    const handleAddClick = () => {
        setEditingServer(undefined);
        setShowModal(true);
    };

    const handleEditClick = (server: MCPServer) => {
        setEditingServer(server);
        setShowModal(true);
    };

    const handleDelete = async (name: string) => {
        if (confirm(`Remove server ${name}?`)) {
            await window.electronAPI.mcpRemove(name);
            loadServers();
        }
    };

    const handleSave = async (server: MCPServer) => {
        if (editingServer) {
            // Rename handling logic required if name changes, but keep simple for now
            await window.electronAPI.mcpUpdate(editingServer.name, server);
        } else {
            await window.electronAPI.mcpAdd(server);
        }
        setShowModal(false);
        loadServers();
    };

    const handleToggleEnabled = async (server: MCPServer) => {
        try {
            const newEnabled = !(server.enabled !== false);
            await window.electronAPI.mcpUpdate(server.name, { enabled: newEnabled });
            await loadServers(); // Reload to reflect connection status and tools
        } catch (e) {
            alert(`Failed to toggle server: ${e}`);
        }
    };

    const handlePromptClick = async (serverName: string, promptName: string) => {
        try {
            // Fetch the prompt content from the server
            // For now, we assume no arguments or use default
            const result = await window.electronAPI.mcpGetPrompt(serverName, promptName, {});

            // Format messages into a single string to put in the chat input
            if (result && result.messages) {
                const text = result.messages.map((m: any) => m.content.type === 'text' ? m.content.text : '').join('\n\n');

                // Dispatch event to ChatInterface
                const event = new CustomEvent('set-chat-input', { detail: text });
                window.dispatchEvent(event);
            }
        } catch (e) {
            console.error('Failed to get prompt:', e);
            // Fallback: just insert the name/command style?
            // alert(`Failed to get prompt content: ${e}`);
        }
    };

    return (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#252526', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #3E3E42', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>MCP Servers</h3>
                <button onClick={handleAddClick} style={{ background: 'none', border: '1px solid #4B90F5', color: '#4B90F5', borderRadius: '4px', cursor: 'pointer' }}>+</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {Array.isArray(servers) && servers.map(s => {
                    const serverTools = tools.filter(t => t.serverName === s.name);
                    const serverPrompts = prompts.filter(p => p.serverName === s.name);
                    const isEnabled = s.enabled !== false;

                    return (
                        <div key={s.name} style={{ padding: '0.8rem', borderBottom: '1px solid #3E3E42' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                <strong>{s.name}</strong>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '0.8rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={isEnabled}
                                        onChange={() => handleToggleEnabled(s)}
                                        style={{ marginRight: '5px' }}
                                    />
                                    {isEnabled ? 'On' : 'Off'}
                                </label>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#9DA5B4', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.command || 'No Command'} {s.args?.join(' ')}
                            </div>

                            <CollapsibleSection title="Tools" count={serverTools.length}>
                                {serverTools.map(t => (
                                    <span key={t.name} title={t.description} style={{
                                        fontSize: '0.7rem',
                                        backgroundColor: '#333',
                                        padding: '2px 4px',
                                        borderRadius: '3px',
                                        border: '1px solid #444'
                                    }}>
                                        {t.originalName}
                                    </span>
                                ))}
                            </CollapsibleSection>

                            <CollapsibleSection title="Prompts" count={serverPrompts.length}>
                                {serverPrompts.map((p, i) => (
                                    <span
                                        key={i}
                                        onClick={() => handlePromptClick(s.name, p.name)}
                                        title={p.description}
                                        style={{
                                            fontSize: '0.7rem',
                                            backgroundColor: '#3B2D3B',
                                            padding: '2px 4px',
                                            borderRadius: '3px',
                                            border: '1px solid #444',
                                            color: '#C586C0',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {p.name}
                                    </span>
                                ))}
                            </CollapsibleSection>

                            < div style={{ display: 'flex', gap: '5px' }}>
                                <button onClick={() => handleEditClick(s)} style={{ fontSize: '0.7rem', padding: '2px 5px' }}>Edit</button>
                                <button onClick={() => handleDelete(s.name)} style={{ fontSize: '0.7rem', padding: '2px 5px', color: '#ff4444' }}>Del</button>
                            </div>
                        </div>
                    );
                })}
            </div >

            {showModal && (
                <ServerModal
                    server={editingServer}
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                />
            )}
        </div >
    );
};

export default MCPServerPanel;
