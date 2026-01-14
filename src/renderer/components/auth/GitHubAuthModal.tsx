import React, { useState, useEffect } from 'react';
import { CopilotAuth } from '../../providers/copilot/copilot.auth';
import type { AuthConfig } from '../../providers/types';

interface GitHubAuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthenticated: (config: AuthConfig) => void;
}

export const GitHubAuthModal: React.FC<GitHubAuthModalProps> = ({ isOpen, onClose, onAuthenticated }) => {
    const [step, setStep] = useState<'init' | 'code' | 'success' | 'error'>('init');
    const [authData, setAuthData] = useState<{ user_code: string; verification_uri: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isOpening, setIsOpening] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setStep('init');
            setAuthData(null);
            setError(null);
        }
    }, [isOpen]);

    const startAuth = async () => {
        try {
            const auth = new CopilotAuth();
            setStep('code'); // Loading state technically
            const data = await auth.requestDeviceCode();
            setAuthData({ user_code: data.user_code, verification_uri: data.verification_uri });

            // Start polling
            const tokenConfig = await auth.pollForToken(data.device_code, data.interval);
            if (tokenConfig) {
                setStep('success');
                setTimeout(() => {
                    onAuthenticated(tokenConfig);
                    onClose();
                }, 1500);
            }
        } catch (err: any) {
            setError(err.message || 'Authentication failed');
            setStep('error');
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000
        }}>
            <div style={{
                backgroundColor: '#252526', padding: '2rem', borderRadius: '8px',
                border: '1px solid #3E3E42', width: '400px', textAlign: 'center', color: '#FFF'
            }}>
                <button 
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: '#999',
                        fontSize: '1.2rem',
                        cursor: 'pointer'
                    }}
                >
                    ✕
                </button>

                {step === 'init' && (
                    <>
                        <h2>Authenticate with GitHub</h2>
                        <p>To use Copilot, you need to sign in with your GitHub account.</p>
                        <button
                            onClick={startAuth}
                            style={{
                                backgroundColor: '#4CAF50', color: 'white', padding: '10px 20px',
                                border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem', marginTop: '1rem'
                            }}
                        >
                            Start Authentication
                        </button>
                    </>
                )}

                {step === 'code' && authData && (
                    <>
                        <h2>Device Verification</h2>
                        <p>Copy this code:</p>
                        <div style={{
                            fontSize: '2rem', fontWeight: 'bold', letterSpacing: '2px',
                            margin: '1rem 0', padding: '1rem', backgroundColor: '#1E1E1E', borderRadius: '4px'
                        }}>
                            {authData.user_code}
                        </div>
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                setIsOpening(true);
                                window.electronAPI.openExternal(authData.verification_uri);
                                setTimeout(() => setIsOpening(false), 2000);
                            }}
                            style={{ 
                                backgroundColor: isOpening ? '#45a049' : '#007ACC',
                                color: 'white',
                                padding: '12px 24px',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '1.1rem',
                                fontWeight: 'bold',
                                marginTop: '1rem',
                                transition: 'all 0.2s',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                        >
                            {isOpening ? 'Opening Browser...' : `Open Verification Page`}
                        </button>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.5rem', fontFamily: 'monospace' }}>
                            {authData.verification_uri}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '1rem' }}>
                            Waiting for authentication...
                        </p>
                        <button onClick={onClose} style={{ marginTop: '1rem', background: 'none', border: '1px solid #555', color: '#CCC', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    </>
                )}

                {step === 'success' && (
                    <div style={{ color: '#4CAF50' }}>
                        <h2>✅ Success!</h2>
                        <p>You are now authenticated.</p>
                    </div>
                )}

                {step === 'error' && (
                    <div style={{ color: '#F44336' }}>
                        <h2>Error</h2>
                        <p>{error}</p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '1rem' }}>
                             <button onClick={onClose} style={{ padding: '0.5rem 1rem', background: 'transparent', border: '1px solid #555', color: '#CCC', cursor: 'pointer', borderRadius: '4px' }}>Close</button>
                             <button onClick={startAuth} style={{ padding: '0.5rem 1rem', background: '#333', border: '1px solid #555', color: '#FFF', cursor: 'pointer', borderRadius: '4px' }}>Try Again</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
