import clipboard from 'clipboardy';
import open from 'open';
import { storage, gemini, copilot, copilotAuth } from '../services';
import { Provider } from './useChat';

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
}

export const useCommands = (ctx: CommandContext) => {
    const handleCommand = async (cmd: string, args: string[]) => {
        switch (cmd) {
            case 'help':
                ctx.addSystemMessage(`
Available Commands:
  /auth               - Authenticate current provider
  /provider [name]    - Switch provider (gemini, copilot)
  /model [name]       - Set model for current provider
  /models             - List available models
  /clear              - Clear conversation history
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
                if (args[0] === 'gemini' || args[0] === 'copilot') {
                    ctx.setProvider(args[0]);
                    const defModel = args[0] === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o';
                    ctx.setModel(defModel);
                    if (args[0] === 'gemini') gemini.setModel(defModel);
                    else copilot.setModel(defModel);

                    ctx.addSystemMessage(`Switched to **${args[0]}** (Model: ${defModel})`);
                    ctx.forceUpdate();
                } else {
                    ctx.addSystemMessage('Invalid provider. Use: /provider [gemini|copilot]');
                }
                break;

            case 'model':
                if (args[0]) {
                    ctx.setModel(args[0]);
                    if (ctx.provider === 'gemini') gemini.setModel(args[0]);
                    else copilot.setModel(args[0]);
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
                    const client = ctx.provider === 'gemini' ? gemini : copilot;
                    if (!client.isConfigured()) {
                        ctx.addSystemMessage('Please authenticate first using /auth');
                        ctx.setStatus('Auth Required');
                        break;
                    }
                    const models = await client.listModels();
                    const list = models
                        .map((m: any) => `- ${m.displayName} (${m.name})`)
                        .join('\n');
                    ctx.addSystemMessage(`Available Models for ${ctx.provider}:\n${list}`);
                    ctx.setStatus('Ready');
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
                } else {
                    copilot.reset();
                    ctx.addSystemMessage('Logged out from Copilot.');
                }
                ctx.setStatus('Not Authenticated');
                ctx.forceUpdate();
                break;
            }

            case 'exit':
                process.exit(0);
                break;

            default:
                ctx.addSystemMessage(`Unknown command: /${cmd}`);
        }
    };

    return { handleCommand };
};
