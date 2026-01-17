import { useState, useEffect } from 'react';
import { storage, mcpService, gemini, copilot, ollama } from '../services';
import { ConfigPersistence } from '../../boot/lib/config-persistence';
import { createLogger } from '../../boot/lib/logger';

const log = createLogger('useChat');

export type Provider = 'gemini' | 'copilot' | 'ollama';

export const SETTINGS_KEY = 'app-settings';

export interface CommandContext {
    provider: Provider;
    model: string;
    conversation: any;
    isProcessing: boolean;
    status: string;
    mode: 'chat' | 'model-selector';
    selectionModels: any[];
    setProvider: (p: Provider) => void;
    setModel: (m: string) => void;
    setStatus: (s: string) => void;
    addSystemMessage: (msg: string, providerOverride?: string) => void;
    setConversation: (c: any) => void;
    forceUpdate: () => void;
    setMode: (mode: 'chat' | 'model-selector') => void;
    setSelectionModels: (models: any[]) => void;
    removeSystemMessage: (text: string, providerOverride?: string) => void;
    setIsProcessing: (isProcessing: boolean) => void;
    handleSubmit: (text: string) => void;
}

export const useChat = (): CommandContext => {
    // State
    const [conversation, setConversation] = useState<any>(null);
    const [status, setStatus] = useState('Initializing...');
    const [isProcessing, setIsProcessing] = useState(false);
    const [_, setTick] = useState(0);

    const [provider, setProviderState] = useState<Provider>('gemini');
    const [model, setModelState] = useState<string>('gemini-2.5-flash');

    // Wrappers to persist
    const setProvider = async (p: Provider) => {
        setProviderState(p);
    };

    const setModel = async (m: string) => {
        setModelState(m);
    };

    // UI Mode
    const [mode, setMode] = useState<'chat' | 'model-selector'>('chat');
    const [selectionModels, setSelectionModels] = useState<any[]>([]);

    // Initialization
    useEffect(() => {
        const init = async () => {
            log.info('Init: Starting chat hook initialization');
            try {
                // 1. Load settings
                log.info('Init: Loading app settings');
                const settings = await ConfigPersistence.load<{
                    provider: Provider;
                    model: string;
                }>(SETTINGS_KEY);
                let initialProvider = provider;
                let initialModel = model;

                // 2. Initialize Providers
                log.info('Init: Initializing Gemini');
                const geminiOk = await gemini.initialize();

                log.info('Init: Initializing Copilot');
                const copilotOk = await copilot.initialize();

                log.info('Init: Initializing Ollama');
                const ollamaOk = await ollama.validateConnection();

                if (settings) {
                    log.info('Init: Settings loaded from disk', settings);
                    initialProvider = settings.provider;
                    initialModel = settings.model;
                    setProviderState(settings.provider);
                    setModelState(settings.model);
                } else {
                    log.info('Init: No settings found, auto-detecting provider');
                    if (geminiOk) {
                        initialProvider = 'gemini';
                        const models = await gemini.listModels();
                        initialModel = models.length > 0 ? models[0].name : 'no models found';
                    } else if (copilotOk) {
                        initialProvider = 'copilot';
                        const models = await copilot.listModels();
                        initialModel = models.length > 0 ? models[0].name : 'no models found';
                    } else if (ollamaOk) {
                        initialProvider = 'ollama';
                        const models = await ollama.listModels();
                        initialModel = models.length > 0 ? models[0].name : 'no models found';
                    }

                    setProviderState(initialProvider);
                    setModelState(initialModel);

                    // Save initial selection
                    await ConfigPersistence.save(SETTINGS_KEY, {
                        provider: initialProvider,
                        model: initialModel,
                    });
                }

                log.info('Init: Initializing MCP');
                await mcpService.init();

                // 3. Sync model to clients
                log.info('Init: Syncing model to clients', {
                    provider: initialProvider,
                    model: initialModel,
                });
                if (initialProvider === 'gemini') gemini.setModel(initialModel);
                else if (initialProvider === 'copilot') copilot.setModel(initialModel);
                else if (initialProvider === 'ollama') ollama.setModel(initialModel);

                const newConv = storage.createConversation();
                (newConv as any).model = initialModel;
                setConversation(newConv);

                // Initial status check
                log.info('Init: Performing initial status check');
                if (initialProvider === 'gemini' && !gemini.isConfigured()) {
                    setStatus('Not Authenticated');
                } else if (initialProvider === 'copilot' && !copilot.isConfigured()) {
                    setStatus('Not Authenticated');
                } else if (initialProvider === 'ollama') {
                    const connected = await ollama.validateConnection();
                    setStatus(connected ? 'Ready' : 'Ollama Not Detected');
                } else {
                    setStatus('Ready');
                }
                log.info('Init: Initialization complete');
            } catch (err: any) {
                log.error('Init: Initialization failed', { error: err.message });
                setStatus(`Error: ${err.message}`);
            }
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Provider change effect
    useEffect(() => {
        const checkProvider = async () => {
            if (provider === 'gemini') {
                setStatus(gemini.isConfigured() ? 'Ready' : 'Not Authenticated');
            } else if (provider === 'copilot') {
                setStatus(copilot.isConfigured() ? 'Ready' : 'Not Authenticated');
            } else if (provider === 'ollama') {
                setStatus('Checking Ollama...');
                const connected = await ollama.validateConnection();
                setStatus(connected ? 'Ready' : 'Ollama Not Detected');
            }
        };
        checkProvider();
    }, [provider]);

    // Helpers
    const addSystemMessage = (text: string, providerOverride?: string) => {
        if (!conversation) return;
        const sysMsg = {
            role: 'system',
            content: text,
            timestamp: new Date().toISOString(),
            provider: providerOverride || provider,
        };
        setConversation((prev: any) => ({
            ...prev,
            messages: [...(prev.messages || []), sysMsg],
        }));
    };

    const removeSystemMessage = (text: string, providerOverride?: string) => {
        if (!conversation) return;

        setConversation((prev: any) => ({
            ...prev,
            messages: prev.messages.filter(
                (msg: any) =>
                    msg.content !== text ||
                    msg.role !== 'system' ||
                    msg.provider !== (providerOverride || provider),
            ),
        }));
    };

    const forceUpdate = () => setTick((t) => t + 1);

    // Chat Handler
    const handleSubmit = async (text: string) => {
        if (!text.trim() || isProcessing) return;

        const currentConv = conversation;
        const userMsg = {
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        };
        const updatedConv = {
            ...currentConv,
            messages: [...(currentConv.messages || []), userMsg],
        };
        setConversation(updatedConv);
        setIsProcessing(true);
        setStatus('Thinking...');

        try {
            let responseText = '';

            if (provider === 'gemini') {
                responseText = await gemini.sendPrompt(text, mcpService);
            } else if (provider === 'ollama') {
                responseText = await ollama.sendPrompt(text, mcpService);
            } else {
                if (!copilot.isConfigured()) {
                    throw new Error('Copilot not authenticated. Run /auth');
                }
                responseText = await copilot.sendPrompt(text, mcpService, async () => true);
            }

            const aiMsg = {
                role: 'model',
                content: responseText,
                timestamp: new Date().toISOString(),
                provider: provider,
            };
            const finalConv = {
                ...updatedConv,
                messages: [...updatedConv.messages, aiMsg],
            };

            setConversation(finalConv);
            await storage.saveConversation(finalConv);
            setStatus('Ready');
        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
            addSystemMessage(`Error: ${err.message}`);
            setIsProcessing(false);
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        conversation,
        setConversation,
        status,
        setStatus,
        isProcessing,
        setIsProcessing,
        provider,
        setProvider,
        model,
        setModel,
        handleSubmit,
        addSystemMessage,
        removeSystemMessage,
        forceUpdate,
        mode,
        setMode,
        selectionModels,
        setSelectionModels,
    };
};
