import React, { useState, useEffect } from 'react';
import ServerModal from './ServerModal';

interface MCPServer {
    name: string;
    command: string;
    args?: string[];
    enabled?: boolean;
}

const MCPServerPanel: React.FC = () => {
    const [servers, setServers] = useState<MCPServer[]>([]);
    const [tools, setTools] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingServer, setEditingServer] = useState<MCPServer | undefined>(undefined);

    const loadServers = async () => {
        const list = await window.electronAPI.mcpList();
        setServers(list);

        // Also load tools
        try {
            const t = await window.electronAPI.mcpListTools();
            setTools(t);
        } catch (e) {
            console.error('Failed to load tools', e);
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

    const testConnection = async (name: string) => {
        try {
            const result = await window.electronAPI.mcpTest(name);
            if (result.connected) {
                // If we successfully connected/pinged, refresh state to show new status/tools
                await loadServers();
            } else {
                alert(`Failed: ${result.error}`);
            }
        } catch (e) {
            alert(`Error: ${e}`);
        }
    };

    return (
        <div style={{ width: '250px', backgroundColor: '#252526', borderRight: '1px solid #3E3E42', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #3E3E42', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>MCP Servers</h3>
                <button onClick={handleAddClick} style={{ background: 'none', border: '1px solid #4B90F5', color: '#4B90F5', borderRadius: '4px', cursor: 'pointer' }}>+</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {Array.isArray(servers) && servers.map(s => {
                    const serverTools = tools.filter(t => t.serverName === s.name);
                    return (
                        <div key={s.name} style={{ padding: '0.8rem', borderBottom: '1px solid #3E3E42' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <strong>{s.name}</strong>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.enabled !== false ? '#4CAF50' : '#666' }} title={s.enabled !== false ? 'Enabled' : 'Disabled'} />
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#9DA5B4', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {s.command}
                            </div>

                            {serverTools.length > 0 && (
                                <div style={{ marginBottom: '0.5rem' }}>
                                    <div style={{ fontSize: '0.7em', textTransform: 'uppercase', color: '#666', marginBottom: '2px' }}>Tools</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
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
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button onClick={() => testConnection(s.name)} style={{ fontSize: '0.7rem', padding: '2px 5px' }}>Ping</button>
                                <button onClick={() => handleEditClick(s)} style={{ fontSize: '0.7rem', padding: '2px 5px' }}>Edit</button>
                                <button onClick={() => handleDelete(s.name)} style={{ fontSize: '0.7rem', padding: '2px 5px', color: '#ff4444' }}>Del</button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {showModal && (
                <ServerModal
                    server={editingServer}
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

export default MCPServerPanel;
