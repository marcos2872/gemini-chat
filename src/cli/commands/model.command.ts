import { CommandContext, Provider, SETTINGS_KEY } from '../hooks/useChat';
import { gemini, copilot, ollama } from '../services';
import { ConfigPersistence } from '../../boot/lib/config-persistence';
import { validateProvider, validateModelName } from './validators';

type ClientType = typeof gemini | typeof copilot | typeof ollama;

export const handleProviderCommand = async (ctx: CommandContext, args: string[]) => {
    // Validate provider argument
    const validatedProvider = validateProvider(args[0], ctx);
    if (!validatedProvider) {
        return; // Error message already shown by validator
    }

    ctx.setProvider(validatedProvider as Provider);

    let defModel = 'gemini-2.5-flash';
    if (validatedProvider === 'ollama') {
        defModel = 'no models'; // Default fallback
        try {
            const models = await ollama.listModels();
            if (models.length > 0) {
                defModel = models[0].name;
                ConfigPersistence.save(SETTINGS_KEY, {
                    provider: validatedProvider,
                    model: defModel,
                });
            }
        } catch {
            // ignore
        }
    } else if (validatedProvider === 'gemini') {
        defModel = 'gemini-2.5-flash'; // Default fallback
        try {
            // Only try to list if we might be authorized, or let it fail silently
            if (gemini.isConfigured()) {
                const models = await gemini.listModels();
                if (models.length > 0) {
                    defModel = models[0].name;
                    ConfigPersistence.save(SETTINGS_KEY, {
                        provider: validatedProvider,
                        model: defModel,
                    });
                }
            }
        } catch {
            // ignore
        }
    } else if (validatedProvider === 'copilot') {
        defModel = 'gpt-5-mini'; // Default fallback
        try {
            // Only try to list if we might be authorized, or let it fail silently
            if (copilot.isConfigured()) {
                const models = await copilot.listModels();
                if (models.length > 0) {
                    defModel = models[0].name;
                    ConfigPersistence.save(SETTINGS_KEY, {
                        provider: validatedProvider,
                        model: defModel,
                    });
                }
            }
        } catch {
            // ignore
        }
    }

    ctx.setModel(defModel);

    if (validatedProvider === 'gemini') gemini.setModel(defModel);
    else if (validatedProvider === 'copilot') copilot.setModel(defModel);
    else if (validatedProvider === 'ollama') ollama.setModel(defModel);

    ctx.forceUpdate();
};

export const handleModelCommand = async (ctx: CommandContext, args: string[]) => {
    if (args[0]) {
        // Validate model name
        const validatedModel = validateModelName(args[0], ctx);
        if (!validatedModel) {
            return; // Error message already shown by validator
        }

        ctx.setModel(validatedModel);
        if (ctx.provider === 'gemini') {
            gemini.setModel(validatedModel);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: validatedModel,
            });
        } else if (ctx.provider === 'copilot') {
            copilot.setModel(validatedModel);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: validatedModel,
            });
        } else if (ctx.provider === 'ollama') {
            ollama.setModel(validatedModel);
            ConfigPersistence.save(SETTINGS_KEY, {
                provider: ctx.provider,
                model: validatedModel,
            });
        }
        ctx.addSystemMessage(`Model set to **${validatedModel}**`);
        // Update conversation model metadata
        if (ctx.conversation) {
            const updated = { ...ctx.conversation, model: validatedModel };
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
