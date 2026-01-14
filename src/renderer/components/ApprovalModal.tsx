import React from 'react';

interface ApprovalModalProps {
    isOpen: boolean;
    toolName: string;
    args: any;
    onApprove: () => void;
    onDeny: () => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ isOpen, toolName, args, onApprove, onDeny }) => {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#252526',
                padding: '24px',
                borderRadius: '8px',
                width: '500px',
                maxWidth: '90%',
                border: '1px solid #454545',
                color: '#CCCCCC',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}>
                <h2 style={{ marginTop: 0, color: '#FFFFFF', borderBottom: '1px solid #3E3E42', paddingBottom: '12px' }}>
                    Tool Execution Request
                </h2>

                <div style={{ margin: '20px 0' }}>
                    <p>The AI wants to execute the following tool:</p>
                    <div style={{
                        backgroundColor: '#1E1E1E',
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid #3E3E42'
                    }}>
                        <div style={{ color: '#4EC9B0', fontWeight: 'bold', marginBottom: '8px' }}>
                            {toolName}
                        </div>
                        <pre style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            fontSize: '0.9em',
                            color: '#9CDCFE'
                        }}>
                            {JSON.stringify(args, null, 2)}
                        </pre>
                    </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                    <button
                        onClick={onDeny}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#3E3E42',
                            color: '#FFFFFF',
                            border: '1px solid #454545',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Deny
                    </button>
                    <button
                        onClick={onApprove}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: '#0E639C',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                        }}
                    >
                        Approve
                    </button>
                </div>
            </div>
        </div>
    );
};
