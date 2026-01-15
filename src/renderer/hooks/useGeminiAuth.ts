import { useState, useCallback } from 'react';

interface UseGeminiAuthReturn {
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    checkConnection: () => Promise<boolean>;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
}

/**
 * Hook for Gemini authentication via Google OAuth.
 * OAuth flow happens in main process (opens browser automatically).
 */
export function useGeminiAuth(): UseGeminiAuthReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const checkConnection = useCallback(async (): Promise<boolean> => {
        setIsLoading(true);
        setError(null);
        try {
            const status = await window.electronAPI.checkGeminiConnection();
            setIsConnected(status.connected);
            return status.connected;
        } catch (err: any) {
            setError(err.message || 'Failed to check connection');
            setIsConnected(false);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signIn = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        setError(null);
        try {
            // This triggers OAuth flow in main process (opens browser)
            // This triggers OAuth flow in main process (opens browser)
            await window.electronAPI.setGeminiKey(''); // Triggers auth via SET_KEY handler
            const status = await window.electronAPI.checkGeminiConnection();
            setIsConnected(status.connected);
        } catch (err: any) {
            setError(err.message || 'Sign in failed');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const signOut = useCallback(async (): Promise<void> => {
        setIsLoading(true);
        setError(null);
        try {
            await window.electronAPI.signOutGemini();
            setIsConnected(false);
        } catch (err: any) {
            setError(err.message || 'Sign out failed');
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        isConnected,
        isLoading,
        error,
        checkConnection,
        signIn,
        signOut,
    };
}
