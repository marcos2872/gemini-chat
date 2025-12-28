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
    const [showModal, setShowModal] = useState(false);
    const [editingServer, setEditingServer] = useState<MCPServer | undefined>(undefined);

    const loadServers = async () => {
        const list = await window.electronAPI.mcpList();
        setServers(list);
    };

    useEffect(() => {
        loadServers();
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
        const result = await window.electronAPI.mcpTest(name);
        alert(result.connected ? 'Connected!' : `Failed: ${result.error}`);
    };

    return (
        <div style={{ width: '250px', backgroundColor: '#252526', borderRight: '1px solid #3E3E42', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1rem', borderBottom: '1px solid #3E3E42', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>MCP Servers</h3>
                <button onClick={handleAddClick} style={{ background: 'none', border: '1px solid #4B90F5', color: '#4B90F5', borderRadius: '4px', cursor: 'pointer' }}>+</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {Array.isArray(servers) && servers.map(s => (
                    <div key={s.name} style={{ padding: '0.8rem', borderBottom: '1px solid #3E3E42' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <strong>{s.name}</strong>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: s.enabled !== false ? '#4CAF50' : '#666' }} title={s.enabled !== false ? 'Enabled' : 'Disabled'} />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#9DA5B4', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.command}
                        </div>
                        <div style={{ display: 'flex', gap: '5px' }}>
                            <button onClick={() => testConnection(s.name)} style={{ fontSize: '0.7rem', padding: '2px 5px' }}>Ping</button>
                            <button onClick={() => handleEditClick(s)} style={{ fontSize: '0.7rem', padding: '2px 5px' }}>Edit</button>
                            <button onClick={() => handleDelete(s.name)} style={{ fontSize: '0.7rem', padding: '2px 5px', color: '#ff4444' }}>Del</button>
                        </div>
                    </div>
                ))}
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
