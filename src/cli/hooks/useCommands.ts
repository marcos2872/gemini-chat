import clipboard from 'clipboardy';
import open from 'open';
import { storage, gemini, copilot, copilotAuth, ollama } from '../services';
import { Provider } from './useChat';
import { createLogger } from '../../boot/lib/logger';
const log = createLogger('CLI');

export interface CommandContext {
    provider: Provider;
    setProvider: (p: Provider) => void;
    model: string;
    setModel: (m: string) => void;
    setStatus: (s: string) => void;
    addSystemMessage: (msg: string) => void;
    setConversation: (c: any) => void;
    conversation: any;
    forceUpdate: () => void;
    setMode: (mode: 'chat' | 'model-selector') => void;
    setSelectionModels: (models: any[]) => void;
}

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
                        ctx.addSystemMessage('Gemini authentication successful.');
                    } catch (e: any) {
                        ctx.setStatus('Auth Failed');
                        ctx.addSystemMessage(`Auth failed: ${e.message}`);
                    }
                } else if (ctx.provider === 'copilot') {
                    ctx.setStatus('Requesting Device Code...');
                    try {
                        const codeData = await copilotAuth.requestDeviceCode();
                        await clipboard.write(codeData.user_code);
                        ctx.addSystemMessage(`
**Action Required**
1. Copy code: ${codeData.user_code} (Copied to clipboard!)
2. Go to: ${codeData.verification_uri}
3. Authorizing...
                        `);
                        await open(codeData.verification_uri);

                        const tokenData = await copilotAuth.pollForToken(
                            codeData.device_code,
                            codeData.interval,
                        );
                        await copilot.initialize(tokenData.accessToken);
                        ctx.setStatus('Ready');
                        ctx.addSystemMessage('Copilot authentication successful.');
                        ctx.forceUpdate();
                    } catch (e: any) {
                        ctx.setStatus('Auth Failed');
                        ctx.addSystemMessage(`Copilot Auth failed: ${e.message}`);
                    }
                }
                break;

            case 'provider':
                if (args[0] === 'gemini' || args[0] === 'copilot' || args[0] === 'ollama') {
                    ctx.setProvider(args[0] as Provider);

                    let defModel = 'gemini-2.5-flash';
                    if (args[0] === 'copilot') defModel = 'gpt-4o';
                    if (args[0] === 'ollama') {
                        defModel = 'no models'; // Default fallback
                        try {
                            const models = await ollama.listModels();
                            if (models.length > 0) {
                                defModel = models[0].name;
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

                    ctx.addSystemMessage(`Switched to **${args[0]}** (Model: ${defModel})`);
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
                    if (ctx.provider === 'gemini') gemini.setModel(args[0]);
                    else if (ctx.provider === 'copilot') copilot.setModel(args[0]);
                    else if (ctx.provider === 'ollama') ollama.setModel(args[0]);
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
                    let client: any = gemini;
                    if (ctx.provider === 'copilot') client = copilot;
                    if (ctx.provider === 'ollama') client = ollama;

                    if (ctx.provider !== 'ollama' && !client.isConfigured()) {
                        ctx.addSystemMessage('Please authenticate first using /auth');
                        ctx.setStatus('Auth Required');
                        break;
                    }
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
                    } catch (e: any) {
                        ctx.addSystemMessage(`Logout failed: ${e.message}`);
                    }
                } else if (ctx.provider === 'copilot') {
                    copilot.reset();
                    ctx.addSystemMessage('Logged out from Copilot.');
                } else if (ctx.provider === 'ollama') {
                    ollama.reset();
                    ctx.addSystemMessage('Ollama session reset.');
                }
                ctx.setStatus('Not Authenticated');
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
                log.info('Exiting application');
                process.exit(0);
                break;

            default:
                ctx.addSystemMessage(`Unknown command: /${cmd}`);
        }
    };

    return { handleCommand };
};
