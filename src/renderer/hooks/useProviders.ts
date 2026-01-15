import { useState, useCallback, useEffect } from 'react';

// Provider type enum - shared across hooks
export enum ProviderType {
    GEMINI = 'GEMINI',
    COPILOT = 'COPILOT',
}

export interface ModelOption {
    provider: ProviderType;
    id: string;
    displayName: string;
}

export interface ProviderGroup {
    provider: ProviderType;
    displayName: string;
    connected: boolean;
    models: ModelOption[];
}

interface UseProvidersReturn {
    activeProvider: ProviderType;
    activeModelId: string;
    providerGroups: ProviderGroup[];
    isLoading: boolean;
    error: string | null;
    initProviders: (copilotToken?: string | null) => Promise<void>;
    selectModel: (model: ModelOption) => void;
    setActiveProvider: (provider: ProviderType) => void;
    refreshModels: () => Promise<void>;
}

/**
 * Hook for managing AI providers (Gemini and Copilot).
 * Fetches models from both providers and manages active selection.
 */
export function useProviders(): UseProvidersReturn {
    const [activeProvider, setActiveProvider] = useState<ProviderType>(ProviderType.GEMINI);
    const [activeModelId, setActiveModelId] = useState<string>('gemini-2.5-flash');
    const [providerGroups, setProviderGroups] = useState<ProviderGroup[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const initProviders = useCallback(async (copilotToken?: string | null) => {
        setIsLoading(true);
        setError(null);

        try {
            const groups: ProviderGroup[] = [];

            // 1. Check Gemini connection and get models
            let isGeminiConnected = false;
            let geminiModels: ModelOption[] = [];

            try {
                const geminiStatus = await window.electronAPI.checkGeminiConnection();
                isGeminiConnected = geminiStatus.connected;

                if (isGeminiConnected) {
                    const models = await window.electronAPI.listModels();
                    geminiModels = models.map(m => ({
                        provider: ProviderType.GEMINI,
                        id: m.name,
                        displayName: m.displayName || m.name,
                    }));
                }
            } catch (e) {
                console.warn('Failed to init Gemini:', e);
            }

            groups.push({
                provider: ProviderType.GEMINI,
                displayName: 'Google AI',
                connected: isGeminiConnected,
                models: geminiModels,
            });

            // 2. Check Copilot connection and get models
            let isCopilotConnected = false;
            let copilotModels: ModelOption[] = [];

            try {
                // If token is undefined, try to fetch it
                let tokenToUse = copilotToken;
                if (tokenToUse === undefined) {
                    tokenToUse = await window.electronAPI.getAuthToken();
                }

                if (tokenToUse) {
                    await window.electronAPI.copilotInit(tokenToUse);
                }

                const copilotStatus = await window.electronAPI.copilotCheck();
                isCopilotConnected = copilotStatus.connected;

                if (isCopilotConnected) {
                    const models = await window.electronAPI.copilotModels();
                    copilotModels = models.map(m => ({
                        provider: ProviderType.COPILOT,
                        id: m.name,
                        displayName: m.displayName || m.name,
                    }));
                }
            } catch (e) {
                console.warn('Failed to init Copilot:', e);
            }

            groups.push({
                provider: ProviderType.COPILOT,
                displayName: 'GitHub Copilot',
                connected: isCopilotConnected,
                models: copilotModels,
            });

            setProviderGroups(groups);
        } catch (err: any) {
            setError(err.message || 'Failed to initialize providers');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const refreshModels = useCallback(async () => {
        await initProviders();
    }, [initProviders]);

    const selectModel = useCallback((model: ModelOption) => {
        setActiveProvider(model.provider);
        setActiveModelId(model.id);

        // Set model on backend
        if (model.provider === ProviderType.GEMINI) {
            window.electronAPI.setModel(model.id);
        }
    }, []);

    return {
        activeProvider,
        activeModelId,
        providerGroups,
        isLoading,
        error,
        initProviders,
        selectModel,
        setActiveProvider,
        refreshModels,
    };
}
