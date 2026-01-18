import { useState, useCallback } from 'react';
import { ConfigPersistence } from '../../boot/lib/config-persistence';
import { createLogger } from '../../boot/lib/logger';
import { Provider, ChatMode, Model, Message, Conversation, AppSettings } from '../../shared/types';

const log = createLogger('useChatState');

export const SETTINGS_KEY = 'app-settings';

export interface ChatState {
    // Core state
    provider: Provider;
    model: string;
    status: string;
    isProcessing: boolean;
    conversation: Conversation | null;

    // UI state
    mode: ChatMode;
    selectionModels: Model[];

    // Core setters
    setProvider: (p: Provider) => void;
    setModel: (m: string) => void;
    setStatus: (s: string) => void;
    setIsProcessing: (v: boolean) => void;
    setConversation: (c: Conversation | null) => void;

    // UI setters
    setMode: (m: ChatMode) => void;
    setSelectionModels: (models: Model[]) => void;

    // Helpers
    addSystemMessage: (text: string, providerOverride?: string) => void;
    removeSystemMessage: (text: string, providerOverride?: string) => void;
    forceUpdate: () => void;

    // Persistence
    persistSettings: () => Promise<void>;
}

export const useChatState = (): ChatState => {
    // Core state
    const [provider, setProviderState] = useState<Provider>('gemini');
    const [model, setModelState] = useState<string>('gemini-2.5-flash');
    const [status, setStatus] = useState('Initializing...');
    const [isProcessing, setIsProcessing] = useState(false);
    const [conversation, setConversation] = useState<Conversation | null>(null);

    // UI state
    const [mode, setMode] = useState<ChatMode>('chat');
    const [selectionModels, setSelectionModels] = useState<Model[]>([]);

    // Force re-render trick
    const [, setTick] = useState(0);
    const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

    // Wrapped setters for persistence
    const setProvider = useCallback((p: Provider) => {
        setProviderState(p);
    }, []);

    const setModel = useCallback((m: string) => {
        setModelState(m);
    }, []);

    // Persist current settings
    const persistSettings = useCallback(async () => {
        const settings: AppSettings = { provider, model };
        await ConfigPersistence.save(SETTINGS_KEY, settings);
        log.info('Settings persisted', settings);
    }, [provider, model]);

    // Message helpers
    const addSystemMessage = useCallback(
        (text: string, providerOverride?: string) => {
            setConversation((prev) => {
                if (!prev) return prev;
                const sysMsg: Message = {
                    role: 'system',
                    content: text,
                    timestamp: new Date().toISOString(),
                    provider: (providerOverride as Provider) || provider,
                };
                return {
                    ...prev,
                    messages: [...prev.messages, sysMsg],
                };
            });
        },
        [provider],
    );

    const removeSystemMessage = useCallback(
        (text: string, providerOverride?: string) => {
            setConversation((prev) => {
                if (!prev) return prev;
                return {
                    ...prev,
                    messages: prev.messages.filter(
                        (msg) =>
                            msg.content !== text ||
                            msg.role !== 'system' ||
                            msg.provider !== (providerOverride || provider),
                    ),
                };
            });
        },
        [provider],
    );

    return {
        // Core state
        provider,
        model,
        status,
        isProcessing,
        conversation,

        // UI state
        mode,
        selectionModels,

        // Core setters
        setProvider,
        setModel,
        setStatus,
        setIsProcessing,
        setConversation,

        // UI setters
        setMode,
        setSelectionModels,

        // Helpers
        addSystemMessage,
        removeSystemMessage,
        forceUpdate,

        // Persistence
        persistSettings,
    };
};
