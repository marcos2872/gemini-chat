import { CommandContext } from '../hooks/useChat';
import open from 'open';
import { createLogger } from '../../boot/lib/logger';

const log = createLogger('CLI');

export const handleHelpCommand = (ctx: CommandContext) => {
    ctx.setMode('help');
};

export const handleLogsCommand = async (ctx: CommandContext) => {
    const home = process.env.HOME || process.env.USERPROFILE;
    const logPath = `${home}/.gemini-desktop/logs/cli.log`;
    ctx.addSystemMessage(`Opening logs at: ${logPath}`);
    try {
        await open(`${home}/.gemini-desktop/logs`);
    } catch (e) {
        const error = e as Error;
        ctx.addSystemMessage(`Failed to open logs: ${error.message}`);
    }
};

export const handleExitCommand = () => {
    log.info('###### Exiting application ######');
    process.exit(0);
};
