import { useState, useCallback, useRef } from 'react';

interface DeviceCodeData {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
}

interface AuthResult {
    accessToken: string;
    tokenType: string;
}

interface UseCopilotAuthReturn {
    isAuthenticated: boolean;
    isAuthenticating: boolean;
    deviceCode: DeviceCodeData | null;
    error: string | null;
    startAuth: () => Promise<AuthResult | null>;
    cancelAuth: () => void;
    checkAuth: () => Promise<boolean>;
    signOut: () => Promise<void>;
    openVerificationUri: (uri: string) => Promise<void>;
}

/**
 * Hook for Copilot authentication via GitHub Device Code Flow.
 * Displays a code that user enters at github.com/login/device.
 */
export function useCopilotAuth(): UseCopilotAuthReturn {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [deviceCode, setDeviceCode] = useState<DeviceCodeData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cancelledRef = useRef(false);

    const checkAuth = useCallback(async (): Promise<boolean> => {
        try {
            const token = await window.electronAPI.getAuthToken();
            if (token) {
                const status = await window.electronAPI.copilotCheck();
                setIsAuthenticated(status.connected);
                return status.connected;
            }
            setIsAuthenticated(false);
            return false;
        } catch {
            setIsAuthenticated(false);
            return false;
        }
    }, []);

    const startAuth = useCallback(async (): Promise<AuthResult | null> => {
        setIsAuthenticating(true);
        setError(null);
        cancelledRef.current = false;

        try {
            // Step 1: Request device code
            const codeData = await window.electronAPI.requestDeviceCode();
            setDeviceCode(codeData);

            // Step 2: Poll for token (backend handles polling)
            const tokenResult = await window.electronAPI.pollForToken(
                codeData.device_code,
                codeData.interval
            );

            if (cancelledRef.current) {
                return null;
            }

            if (tokenResult) {
                // Save token and initialize copilot
                await window.electronAPI.saveAuthToken(tokenResult.access_token);
                await window.electronAPI.copilotInit(tokenResult.access_token);
                setIsAuthenticated(true);
                return {
                    accessToken: tokenResult.access_token,
                    tokenType: tokenResult.token_type,
                };
            }

            setError('Authentication timed out or was cancelled');
            return null;
        } catch (err: any) {
            if (!cancelledRef.current) {
                setError(err.message || 'Authentication failed');
            }
            return null;
        } finally {
            setIsAuthenticating(false);
            setDeviceCode(null);
        }
    }, []);

    const cancelAuth = useCallback(() => {
        cancelledRef.current = true;
        setIsAuthenticating(false);
        setDeviceCode(null);
    }, []);

    const signOut = useCallback(async () => {
        try {
            await window.electronAPI.saveAuthToken(null);
            setIsAuthenticated(false);
        } catch (err: any) {
            setError(err.message || 'Sign out failed');
        }
    }, []);

    const openVerificationUri = useCallback(async (uri: string) => {
        try {
            await window.electronAPI.openExternal(uri);
        } catch (err) {
            console.error('Failed to open verification URI:', err);
        }
    }, []);

    return {
        isAuthenticated,
        isAuthenticating,
        deviceCode,
        error,
        startAuth,
        cancelAuth,
        checkAuth,
        signOut,
        openVerificationUri,
    };
}
