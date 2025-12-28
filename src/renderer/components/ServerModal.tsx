import React, { useState } from 'react';

interface MCPServer {
    name: string;
    command: string;
    args?: string[];
    enabled?: boolean;
}

interface ServerModalProps {
    server?: MCPServer;
    onClose: () => void;
    onSave: (server: MCPServer) => void;
}

const ServerModal: React.FC<ServerModalProps> = ({ server, onClose, onSave }) => {
    const [jsonContent, setJsonContent] = useState(() => {
        if (server) {
            const { name, ...rest } = server;
            // Create the "Name": { ... } structure
            const obj = { [name]: rest };
            // Stringify but remove the outer braces to match user request "key": { val }
            const json = JSON.stringify(obj, null, 2);
            return json.substring(1, json.length - 1).trim();
        }
        return `"NewServer": {
  "command": "",
  "args": [],
  "env": {},
  "enabled": true
}`;
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        try {
            // Wrap in braces to make it valid JSON object
            const wrappedJson = `{${jsonContent}}`;
            const parsed = JSON.parse(wrappedJson);

            const keys = Object.keys(parsed);
            if (keys.length !== 1) {
                throw new Error("JSON must contain exactly one server key (e.g. \"MyServer\": { ... })");
            }

            const name = keys[0];
            const details = parsed[name];

            if (!details.command) {
                throw new Error("Field 'command' is required.");
            }

            onSave({
                name,
                command: details.command,
                args: details.args,
                env: details.env,
                enabled: details.enabled !== false
            });
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#252526', padding: '1.5rem', borderRadius: '8px',
                width: '600px', border: '1px solid #3E3E42', display: 'flex', flexDirection: 'column', maxHeight: '90vh'
            }}>
                <h3 style={{ marginTop: 0 }}>{server ? 'Edit Server (JSON)' : 'Add Server (JSON)'}</h3>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ marginBottom: '1rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <textarea
                            required
                            value={jsonContent}
                            onChange={e => setJsonContent(e.target.value)}
                            style={{
                                flex: 1,
                                minHeight: '300px',
                                padding: '0.5rem',
                                backgroundColor: '#1E1E1E',
                                border: '1px solid #3E3E42',
                                color: '#D4D4D4',
                                fontFamily: 'monospace',
                                resize: 'vertical'
                            }}
                        />
                        {error && (
                            <div style={{ color: '#ff6b6b', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                                Error: {error}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#9DA5B4', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" className="primary-btn" style={{
                            padding: '6px 12px', backgroundColor: '#007acc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'
                        }}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ServerModal;
