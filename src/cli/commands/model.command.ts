import { CommandContext, Provider, SETTINGS_KEY } from '../hooks/useChat';
import { gemini, copilot, ollama } from '../services';
import { ConfigPersistence } from '../../boot/lib/config-persistence';

type ClientType = typeof gemini | typeof copilot | typeof ollama;

export const handleProviderCommand = async (ctx: CommandContext, args: string[]) => {
    if (args[0] === 'gemini' || args[0] === 'copilot' || args[0] === 'ollama') {
        ctx.setProvider(args[0] as Provider);

        let defModel = 'gemini-2.5-flash';
        if (args[0] === 'ollama') {
            defModel = 'no models'; // Default fallback
            try {
                const models = await ollama.listModels();
                if (models.length > 0) {
                    defModel = models[0].name;
                    ConfigPersistence.save(SETTINGS_KEY, {
                        provider: args[0],
                        model: defModel,
                    });
                }
            } catch {
                // ignore
            }
        } else if (args[0] === 'gemini') {
            defModel = 'gemini-2.5-flash'; // Default fallback
            try {
                // Only try to list if we might be authorized, or let it fail silently
                if (gemini.isConfigured()) {
                    const models = await gemini.listModels();
                    if (models.length > 0) {
                        defModel = models[0].name;
                        ConfigPersistence.save(SETTINGS_KEY, {
                            provider: args[0],
                            model: defModel,
                        });
                    }
                }
            } catch {
                // ignore
            }
        } else if (args[0] === 'copilot') {
            defModel = 'gpt-5-mini'; // Default fallback
            try {
                // Only try to list if we might be authorized, or let it fail silently
                if (copilot.isConfigured()) {
                    const models = await copilot.listModels();
                    if (models.length > 0) {
                        defModel = models[0].name;
                        ConfigPersistence.save(SETTINGS_KEY, {
                            provider: args[0],
                            model: defModel,
                        });
                    }
                }
            } catch {
                // ignore
            }
        }

        ctx.setModel(defModel);

        if (args[0] === 'gemini') gemini.setModel(defModel);
        else if (args[0] === 'copilot') copilot.setModel(defModel);
        else if (args[0] === 'ollama') ollama.setModel(defModel);

        ctx.forceUpdate();
    } else {
        ctx.addSystemMessage('Invalid provider. Use: /provider [gemini|copilot|ollama]');
    }
};

export const handleModelCommand = async (ctx: CommandContext, args: string[]) => {
    if (args[0]) {
        ctx.setModel(args[0]);
        if (ctx.provider === 'gemini') {
            gemini.setModel(args[0]);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: args[0],
            });
        } else if (ctx.provider === 'copilot') {
            copilot.setModel(args[0]);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: args[0],
            });
        } else if (ctx.provider === 'ollama') {
            ollama.setModel(args[0]);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: args[0],
            });
        }
        ctx.addSystemMessage(`Model set to **${args[0]}**`);
        // Update conversation model metadata
        if (ctx.conversation) {
            const updated = { ...ctx.conversation, model: args[0] };
            ctx.setConversation(updated);
        }
    } else {
        ctx.addSystemMessage(`Current model: ${ctx.model}`);
    }
};

export const handleModelsCommand = async (ctx: CommandContext) => {
    ctx.setStatus('Fetching models...');
    try {
        let client: ClientType = gemini;
        if (ctx.provider === 'copilot') client = copilot;
        if (ctx.provider === 'ollama') client = ollama;

        const models = await client.listModels();

        if (models.length === 0) {
            ctx.addSystemMessage('No models found.');
            ctx.setStatus('Ready');
        } else {
            // Switch to interactive mode
            ctx.setSelectionModels(models);
            ctx.setMode('model-selector');
            ctx.setStatus('Select a Model');
        }
    } catch (e) {
        const error = e as Error;
        ctx.addSystemMessage(`Failed to list models: ${error.message}`);
        ctx.setStatus('Error');
    }
};
