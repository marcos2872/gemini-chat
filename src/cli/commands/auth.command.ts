import { CommandContext } from '../hooks/useChat';
import { gemini, copilot, copilotAuth } from '../services';
import { createLogger } from '../../boot/lib/logger';
import open from 'open';

const log = createLogger('CLI');

export const handleAuthCommand = async (ctx: CommandContext) => {
    if (ctx.provider === 'gemini') {
        ctx.setStatus('Authenticating Gemini...');
        try {
            await gemini.signIn();
            ctx.setStatus('Ready');
        } catch (e) {
            const error = e as Error;
            ctx.setStatus('Auth Failed');
            ctx.addSystemMessage(`Auth failed: ${error.message}`);
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
        } catch (e) {
            const error = e as Error;
            log.error('Copilot Auth Error', { error: error.message });
            ctx.setStatus('Auth Failed');
            ctx.addSystemMessage(`Copilot Auth failed: ${error.message}`, 'copilot');
        }
    }
};

export const handleLogoutCommand = async (ctx: CommandContext) => {
    if (ctx.provider === 'gemini') {
        try {
            await gemini.signOut();
            ctx.addSystemMessage('Logged out from Gemini.');
            ctx.setStatus('Not Authenticated');
        } catch (e) {
            const error = e as Error;
            ctx.addSystemMessage(`Logout failed: ${error.message}`);
        }
    } else if (ctx.provider === 'copilot') {
        copilot.reset();
        ctx.addSystemMessage('Logged out from Copilot.');
        ctx.setStatus('Not Authenticated');
    } else if (ctx.provider === 'ollama') {
        const { ollama } = await import('../services');
        ollama.reset();
        ctx.addSystemMessage('Ollama session reset.');
    }
    ctx.forceUpdate();
};
