import open from 'open';
import { storage, gemini, copilot, copilotAuth, ollama } from '../services';
import { CommandContext, Provider, SETTINGS_KEY } from './useChat';
import { createLogger } from '../../boot/lib/logger';
import { ConfigPersistence } from '../../boot/lib/config-persistence';
const log = createLogger('CLI');

type clientType = typeof gemini | typeof copilot | typeof ollama;

export const useCommands = (ctx: CommandContext) => {
    const handleCommand = async (cmd: string, args: string[]) => {
        switch (cmd) {
            case 'help':
                ctx.addSystemMessage(`
Available Commands:
  /auth               - Authenticate current provider
  /provider [name]    - Switch provider (gemini, copilot, ollama)
  /model [name]       - Set model for current provider
  /models             - List available models
  /clear              - Clear conversation history
  /logs               - Open log file location
  /logout             - Logout from current provider
  /exit               - Exit application
				`);
                break;

            case 'auth':
                if (ctx.provider === 'gemini') {
                    ctx.setStatus('Authenticating Gemini...');
                    try {
                        await gemini.signIn();
                        ctx.setStatus('Ready');
                    } catch (e: any) {
                        ctx.setStatus('Auth Failed');
                        ctx.addSystemMessage(`Auth failed: ${e.message}`);
                    }
                } else if (ctx.provider === 'copilot') {
                    ctx.setStatus('Requesting Device Code...');
                    try {
                        log.info('Starting Copilot Auth flow');
                        const codeData = await copilotAuth.requestDeviceCode();
                        log.info('Received codeData', codeData);

                        const sysMsg = `
**Copilot Auth**
User Code: **${codeData.user_code}**

Opening browser for authorization... ${codeData.verification_uri}
`;

                        ctx.addSystemMessage(sysMsg, 'copilot');

                        ctx.forceUpdate();

                        log.info('Triggering browser open', { uri: codeData.verification_uri });
                        // No await on open to avoid blocking, and handle errors
                        open(codeData.verification_uri).catch((err) => {
                            log.error('Failed to open browser', { error: err.message });
                            ctx.addSystemMessage(
                                `Could not open browser automatically. Please go to: ${codeData.verification_uri}`,
                                'copilot',
                            );
                        });

                        log.info('Entering polling phase');
                        const tokenData = await copilotAuth.pollForToken(
                            codeData.device_code,
                            codeData.interval,
                        );
                        log.info('Token acquired');

                        await copilot.initialize(tokenData.accessToken);
                        ctx.setStatus('Ready');
                        ctx.removeSystemMessage(sysMsg, 'copilot');
                        ctx.forceUpdate();
                    } catch (e: any) {
                        log.error('Copilot Auth Error', { error: e.message });
                        ctx.setStatus('Auth Failed');
                        ctx.addSystemMessage(`Copilot Auth failed: ${e.message}`, 'copilot');
                    }
                }
                break;

            case 'provider':
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
                    ctx.addSystemMessage(
                        'Invalid provider. Use: /provider [gemini|copilot|ollama]',
                    );
                }
                break;

            case 'model':
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
                break;

            case 'models':
                ctx.setStatus('Fetching models...');
                try {
                    let client: clientType = gemini;
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
                } catch (e: any) {
                    ctx.addSystemMessage(`Failed to list models: ${e.message}`);
                    ctx.setStatus('Error');
                }
                break;

            case 'clear': {
                const newConv = storage.createConversation();
                (newConv as any).model = ctx.model;
                ctx.setConversation(newConv);
                ctx.addSystemMessage('Conversation cleared.');
                break;
            }

            case 'logout': {
                if (ctx.provider === 'gemini') {
                    try {
                        await gemini.signOut();

                        ctx.addSystemMessage('Logged out from Gemini.');
                        ctx.setStatus('Not Authenticated');
                    } catch (e: any) {
                        ctx.addSystemMessage(`Logout failed: ${e.message}`);
                    }
                } else if (ctx.provider === 'copilot') {
                    copilot.reset();
                    ctx.addSystemMessage('Logged out from Copilot.');
                    ctx.setStatus('Not Authenticated');
                } else if (ctx.provider === 'ollama') {
                    ollama.reset();
                    ctx.addSystemMessage('Ollama session reset.');
                }
                ctx.forceUpdate();
                break;
            }

            case 'logs': {
                const home = process.env.HOME || process.env.USERPROFILE;
                const logPath = `${home}/.gemini-desktop/logs/cli.log`;
                ctx.addSystemMessage(`Opening logs at: ${logPath}`);
                try {
                    await open(`${home}/.gemini-desktop/logs`);
                } catch (e: any) {
                    ctx.addSystemMessage(`Failed to open logs: ${e.message}`);
                }
                break;
            }

            case 'exit':
                log.info('###### Exiting application ######');
                process.exit(0);
                break;

            default:
                ctx.addSystemMessage(`Unknown command: /${cmd}`);
        }
    };

    return { handleCommand };
};
