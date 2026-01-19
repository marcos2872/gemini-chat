import { CommandContext } from '../hooks/useChat';
import { services } from '../services';

export const handleConfigCommand = async (ctx: CommandContext, args: string[]) => {
    const [action, key, value] = args;
    const configService = services.configService;

    if (!action) {
        ctx.addSystemMessage('Usage: /config <get|set> <key> [value]');
        return;
    }

    try {
        if (action === 'get') {
            if (!key) {
                ctx.addSystemMessage('❌ Key is required. Usage: /config get <key>');
                return;
            }

            if (key === 'ollama.baseUrl') {
                const config = await configService.getOllamaConfig();
                ctx.addSystemMessage(`ollama.baseUrl = ${config.baseUrl}`);
            } else {
                ctx.addSystemMessage(`❌ Unknown configuration key: ${key}`);
            }
        } else if (action === 'set') {
            if (!key || !value) {
                ctx.addSystemMessage(
                    '❌ Key and value are required. Usage: /config set <key> <value>',
                );
                return;
            }

            if (key === 'ollama.baseUrl') {
                await configService.setOllamaUrl(value);
                ctx.addSystemMessage(`✅ Updated ollama.baseUrl to ${value}`);
                ctx.addSystemMessage('Please restart the application for changes to take effect.');
            } else {
                ctx.addSystemMessage(`❌ Unknown configuration key: ${key}`);
            }
        } else {
            ctx.addSystemMessage(`❌ Unknown action: ${action}. Use 'get' or 'set'.`);
        }
    } catch (error) {
        const err = error as Error;
        ctx.addSystemMessage(`❌ Failed to update configuration: ${err.message}`);
    }
};
