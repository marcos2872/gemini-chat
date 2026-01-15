import React, { useState, useEffect } from 'react';
import { useCopilotAuth } from '../../hooks';

interface GitHubAuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthenticated: (config: { accessToken: string; tokenType: string }) => void;
}

const steps = {
    init: 'init' as const,
    code: 'code' as const,
    success: 'success' as const,
    error: 'error' as const,
};
type stepsType = (typeof steps)[keyof typeof steps];

export const GitHubAuthModal: React.FC<GitHubAuthModalProps> = ({
    isOpen,
    onClose,
    onAuthenticated,
}) => {
    const { isAuthenticating, deviceCode, error, startAuth, cancelAuth, openVerificationUri } =
        useCopilotAuth();
    const [step, setStep] = useState<stepsType>(steps.init);
    const [isOpening, setIsOpening] = useState(false);
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen) {
            setStep(steps.init);
        }
    }

    useEffect(() => {
        if (!isOpen) {
            cancelAuth();
        }
    }, [isOpen, cancelAuth]);

    // Derive current step from props/hook state to avoid useEffect synchronization
    const currentStep = (() => {
        if (step === steps.success) return steps.success;
        if (error) return steps.error;
        if (deviceCode) return steps.code;
        return step;
    })();

    const handleStartAuth = async () => {
        const result = await startAuth();
        if (result) {
            setStep(steps.success);
            setTimeout(() => {
                onAuthenticated(result);
                onClose();
            }, 1500);
        }
    };

    const handleCancel = () => {
        cancelAuth();
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
            }}
        >
            <div
                style={{
                    backgroundColor: '#252526',
                    padding: '2rem',
                    borderRadius: '8px',
                    border: '1px solid #3E3E42',
                    width: '400px',
                    textAlign: 'center',
                    color: '#FFF',
                    position: 'relative',
                }}
            >
                <button
                    onClick={handleCancel}
                    style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'none',
                        border: 'none',
                        color: '#999',
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                    }}
                >
                    ✕
                </button>

                {currentStep === steps.init && (
                    <>
                        <h2>Authenticate with GitHub</h2>
                        <p>To use Copilot, you need to sign in with your GitHub account.</p>
                        <button
                            onClick={handleStartAuth}
                            disabled={isAuthenticating}
                            style={{
                                backgroundColor: '#4CAF50',
                                color: 'white',
                                padding: '10px 20px',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                marginTop: '1rem',
                                opacity: isAuthenticating ? 0.7 : 1,
                            }}
                        >
                            {isAuthenticating ? 'Starting...' : 'Start Authentication'}
                        </button>
                    </>
                )}

                {currentStep === steps.code && deviceCode && (
                    <>
                        <h2>Device Verification</h2>
                        <p>Copy this code:</p>
                        <div
                            style={{
                                fontSize: '2rem',
                                fontWeight: 'bold',
                                letterSpacing: '2px',
                                margin: '1rem 0',
                                padding: '1rem',
                                backgroundColor: '#1E1E1E',
                                borderRadius: '4px',
                            }}
                        >
                            {deviceCode.user_code}
                        </div>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                setIsOpening(true);
                                openVerificationUri(deviceCode.verification_uri);
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
                                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                            }}
                        >
                            {isOpening ? 'Opening Browser...' : `Open Verification Page`}
                        </button>
                        <div
                            style={{
                                fontSize: '0.8rem',
                                color: '#666',
                                marginTop: '0.5rem',
                                fontFamily: 'monospace',
                            }}
                        >
                            {deviceCode.verification_uri}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '1rem' }}>
                            Waiting for authentication...
                        </p>
                        <button
                            onClick={handleCancel}
                            style={{
                                marginTop: '1rem',
                                background: 'none',
                                border: '1px solid #555',
                                color: '#CCC',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </>
                )}

                {currentStep === steps.success && (
                    <div style={{ color: '#4CAF50' }}>
                        <h2>✅ Success!</h2>
                        <p>You are now authenticated.</p>
                    </div>
                )}

                {currentStep === steps.error && (
                    <div style={{ color: '#F44336' }}>
                        <h2>Error</h2>
                        <p>{error}</p>
                        <div
                            style={{
                                display: 'flex',
                                gap: '10px',
                                justifyContent: 'center',
                                marginTop: '1rem',
                            }}
                        >
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: 'transparent',
                                    border: '1px solid #555',
                                    color: '#CCC',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                }}
                            >
                                Close
                            </button>
                            <button
                                onClick={handleStartAuth}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: '#333',
                                    border: '1px solid #555',
                                    color: '#FFF',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                }}
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
