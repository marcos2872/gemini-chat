import { useEffect } from 'react';
import { storage, mcpService, gemini, copilot, ollama } from '../services';
import { ConfigPersistence } from '../../boot/lib/config-persistence';
import { createLogger } from '../../boot/lib/logger';
import { Provider, AppSettings, Conversation } from '../../shared/types';
import { SETTINGS_KEY } from './useChatState';

const log = createLogger('useInitialization');

export interface InitializationDeps {
    setProvider: (p: Provider) => void;
    setModel: (m: string) => void;
    setStatus: (s: string) => void;
    setConversation: (c: Conversation | null) => void;
    provider: Provider;
}

/**
 * Hook that handles application initialization on mount.
 * - Loads saved settings
 * - Initializes all providers
 * - Auto-detects provider/model if no settings saved
 * - Sets up MCP service
 */
export const useInitialization = (deps: InitializationDeps): void => {
    const { setProvider, setModel, setStatus, setConversation, provider } = deps;

    // Main initialization effect
    useEffect(() => {
        const init = async () => {
            log.info('Starting chat hook initialization');
            try {
                // 1. Load settings
                log.info('Loading app settings');
                const settings = await ConfigPersistence.load<AppSettings>(SETTINGS_KEY);
                let initialProvider: Provider = 'gemini';
                let initialModel = 'gemini-2.5-flash';

                // 2. Initialize Providers
                log.info('Initializing providers');
                const geminiOk = await gemini.initialize();
                const copilotOk = await copilot.initialize();
                const ollamaOk = await ollama.validateConnection();

                if (settings) {
                    log.info('Settings loaded from disk', settings);
                    initialProvider = settings.provider;
                    initialModel = settings.model;
                } else {
                    log.info('No settings found, auto-detecting provider');
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

                    // Save initial selection
                    await ConfigPersistence.save(SETTINGS_KEY, {
                        provider: initialProvider,
                        model: initialModel,
                    });
                }

                setProvider(initialProvider);
                setModel(initialModel);

                // 3. Initialize MCP
                log.info('Initializing MCP');
                await mcpService.init();

                // 4. Sync model to clients
                log.info('Syncing model to clients', {
                    provider: initialProvider,
                    model: initialModel,
                });
                if (initialProvider === 'gemini') gemini.setModel(initialModel);
                else if (initialProvider === 'copilot') copilot.setModel(initialModel);
                else if (initialProvider === 'ollama') ollama.setModel(initialModel);

                // 5. Create initial conversation
                const newConv = storage.createConversation();
                newConv.model = initialModel;
                setConversation(newConv);

                // 6. Initial status check
                log.info('Performing initial status check');
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
                log.info('Initialization complete');
            } catch (err) {
                const error = err as Error;
                log.error('Initialization failed', { error: error.message });
                setStatus(`Error: ${error.message}`);
            }
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Provider change effect - update status when provider changes
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
    }, [provider, setStatus]);
};
