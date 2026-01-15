import React, { useState } from 'react';
import type { McpServer } from '../../shared/types';
import { useMcp } from '../hooks';

interface ServerModalProps {
    server?: McpServer;
    onClose: () => void;
    onSave: (server: McpServer) => void;
}

const ServerModal: React.FC<ServerModalProps> = ({ server, onClose, onSave }) => {
    const { testConfig } = useMcp();
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
  "type": "stdio",
  "command": "",
  "args": [],
  "env": {},
  "url": "",
  "token": "",
  "enabled": true
}`;
    });
    const [error, setError] = useState<string | null>(null);

    const [testPassed, setTestPassed] = useState(false);

    // Reset test passed status when content changes
    const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setJsonContent(e.target.value);
        setTestPassed(false);
    };

    const parseServerFromJSON = (): McpServer => {
        const wrappedJson = `{${jsonContent}}`;
        const parsed = JSON.parse(wrappedJson);

        const keys = Object.keys(parsed);
        if (keys.length !== 1) {
            throw new Error("JSON must contain exactly one server key (e.g. \"MyServer\": { ... })");
        }

        const name = keys[0];
        const details = parsed[name];

        if (details.type === 'sse') {
            if (!details.url) throw new Error("Field 'url' is required for SSE.");
        } else {
            if (!details.command) throw new Error("Field 'command' is required for Stdio.");
        }

        return {
            name,
            command: details.command,
            args: details.args,
            env: details.env,
            url: details.url,
            type: details.type || 'stdio',
            token: details.token,
            enabled: details.enabled !== false
        };
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!testPassed) {
            setError("Please successfully test the connection before saving.");
            return;
        }
        setError(null);

        try {
            const serverConfig = parseServerFromJSON();
            onSave(serverConfig);
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleTest = async () => {
        setError(null);
        setTestPassed(false);
        try {
            const serverConfig = parseServerFromJSON();
            const res = await testConfig(serverConfig);

            if (res.success && res.connected) {
                alert("✅ Connection successful!");
                setTestPassed(true);
            } else {
                setError(`Connection failed: ${res.error}`);
            }
        } catch (err: any) {
            setError(`Invalid JSON or config: ${err.message}`);
        }
    };

    // ... render logic same as before but imports updated ...
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
                            onChange={handleJsonChange}
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
                                {error}
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                        <button type="button" onClick={handleTest} style={{ background: '#333', border: '1px solid #555', color: 'white', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', marginRight: 'auto' }}>Test Connection</button>
                        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#9DA5B4', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" className="primary-btn" disabled={!testPassed} style={{
                            padding: '6px 12px',
                            backgroundColor: testPassed ? '#007acc' : '#555',
                            color: testPassed ? 'white' : '#aaa',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: testPassed ? 'pointer' : 'not-allowed'
                        }}>Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ServerModal;
