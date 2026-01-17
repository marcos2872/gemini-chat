import { CommandContext } from '../hooks/useChat';
import { handleAuthCommand, handleLogoutCommand } from './auth.command';
import { handleProviderCommand, handleModelCommand, handleModelsCommand } from './model.command';
import { handleClearCommand } from './conversation.command';
import { handleHelpCommand, handleLogsCommand, handleExitCommand } from './help.command';

export type CommandHandler = (ctx: CommandContext, args: string[]) => Promise<void> | void;

export const commands: Record<string, CommandHandler> = {
    help: (ctx) => handleHelpCommand(ctx),
    auth: (ctx) => handleAuthCommand(ctx),
    logout: (ctx) => handleLogoutCommand(ctx),
    provider: (ctx, args) => handleProviderCommand(ctx, args),
    model: (ctx, args) => handleModelCommand(ctx, args),
    models: (ctx) => handleModelsCommand(ctx),
    clear: (ctx) => handleClearCommand(ctx),
    logs: (ctx) => handleLogsCommand(ctx),
    exit: () => handleExitCommand(),
};

export const executeCommand = async (
    cmd: string,
    args: string[],
    ctx: CommandContext,
): Promise<void> => {
    const handler = commands[cmd];
    if (handler) {
        await handler(ctx, args);
    } else {
        ctx.addSystemMessage(`Unknown command: /${cmd}`);
    }
};
