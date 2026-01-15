import { useState, useCallback, useEffect } from 'react';
import type { Conversation, ConversationSummary, Message } from '../../shared/types';

interface UseConversationReturn {
    conversation: Conversation | null;
    messages: Message[];
    isLoading: boolean;
    error: string | null;
    loadConversation: (id: string) => Promise<void>;
    createConversation: (options?: { model?: string }) => Promise<Conversation>;
    syncConversation: (conversation: Conversation) => Promise<void>;
    addMessage: (message: Message) => void;
    updateMessage: (id: string, updates: Partial<Message>) => void;
    listConversations: () => Promise<ConversationSummary[]>;
    deleteConversation: (id: string) => Promise<void>;
}

/**
 * Hook for managing conversations.
 * Handles loading, creating, and syncing conversations with the backend.
 */
export function useConversation(): UseConversationReturn {
    const [conversation, setConversation] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Listen for conversation updates from backend
    useEffect(() => {
        const cleanup = window.electronAPI.onConversationUpdate((updatedConversation) => {
            if (conversation && updatedConversation.id === conversation.id) {
                setConversation(updatedConversation);
                setMessages(updatedConversation.messages || []);
            }
        });
        return cleanup;
    }, [conversation?.id]);

    const loadConversation = useCallback(async (id: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const conv = await window.electronAPI.conversationLoad(id);
            setConversation(conv);
            setMessages(conv.messages || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load conversation');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const createConversation = useCallback(async (options?: { model?: string }): Promise<Conversation> => {
        setIsLoading(true);
        setError(null);
        try {
            const conv = await window.electronAPI.conversationNew(options);
            setConversation(conv);
            setMessages([]);
            return conv;
        } catch (err: any) {
            setError(err.message || 'Failed to create conversation');
            throw err;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const syncConversation = useCallback(async (conv: Conversation) => {
        try {
            await window.electronAPI.conversationSync(conv);
        } catch (err: any) {
            setError(err.message || 'Failed to sync conversation');
        }
    }, []);

    const addMessage = useCallback((message: Message) => {
        setMessages(prev => [...prev, message]);
        if (conversation) {
            const updated = {
                ...conversation,
                messages: [...(conversation.messages || []), message],
            };
            setConversation(updated);
        }
    }, [conversation]);

    const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
        if (conversation) {
            const updatedMsgs = (conversation.messages || []).map(m =>
                m.id === id ? { ...m, ...updates } : m
            );
            setConversation({
                ...conversation,
                messages: updatedMsgs // Note: this doesn't sync to backend yet, just local state
            });
        }
    }, [conversation]);

    const listConversations = useCallback(async (): Promise<ConversationSummary[]> => {
        try {
            return await window.electronAPI.conversationList();
        } catch (err: any) {
            setError(err.message || 'Failed to list conversations');
            return [];
        }
    }, []);

    const deleteConversation = useCallback(async (id: string) => {
        try {
            await window.electronAPI.conversationDelete(id);
        } catch (err: any) {
            setError(err.message || 'Failed to delete conversation');
            throw err;
        }
    }, []);

    return {
        conversation,
        messages,
        isLoading,
        error,
        loadConversation,
        createConversation,
        syncConversation,
        addMessage,
        updateMessage,
        listConversations,
        deleteConversation,
    };
}
