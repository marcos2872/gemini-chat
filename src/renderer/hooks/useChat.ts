import { useState, useCallback } from 'react';
import type { Message } from '../../shared/types';
import { ProviderType } from './useProviders';

interface UseChatReturn {
    sendMessage: (
        content: string,
        provider: ProviderType,
        model: string,
        history?: Message[],
    ) => Promise<string>;
    onChunk: (callback: (chunk: string) => void) => () => void;
    isLoading: boolean;
    error: string | null;
}

/**
 * Hook for sending chat messages to AI providers.
 * Handles both Gemini and Copilot chat.
 */
export function useChat(): UseChatReturn {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(
        async (
            content: string,
            provider: ProviderType,
            model: string,
            history: Message[] = [],
        ): Promise<string> => {
            setIsLoading(true);
            setError(null);

            try {
                if (provider === ProviderType.GEMINI) {
                    // Gemini: send prompt, backend manages history
                    const result = await window.electronAPI.sendPrompt(content);
                    if (!result.success) {
                        throw new Error(result.error || 'Gemini error');
                    }
                    return result.data || '';
                } else {
                    // Copilot: send via chat stream with full history
                    const messagesPayload = [
                        ...history.map((m) => ({ role: m.role, content: m.content })),
                        { role: 'user', content },
                    ];

                    const result = await window.electronAPI.copilotChatStream(
                        messagesPayload,
                        model,
                    );
                    if (!result.success) {
                        throw new Error(result.error || 'Copilot error');
                    }
                    // Result comes back as success, actual response comes via chunk listener
                    return '';
                }
            } catch (err: any) {
                setError(err.message || 'Failed to send message');
                throw err;
            } finally {
                setIsLoading(false);
            }
        },
        [],
    );

    const onChunk = useCallback((callback: (chunk: string) => void) => {
        return window.electronAPI.onCopilotChunk(callback);
    }, []);

    return {
        sendMessage,
        onChunk,
        isLoading,
        error,
    };
}
