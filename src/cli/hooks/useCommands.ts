import { CommandContext } from './useChat';
import { executeCommand } from '../commands';

export const useCommands = (ctx: CommandContext) => {
    const handleCommand = async (cmd: string, args: string[]) => {
        await executeCommand(cmd, args, ctx);
    };

    return { handleCommand };
};
