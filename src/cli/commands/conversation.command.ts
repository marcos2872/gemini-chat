import { CommandContext } from '../hooks/useChat';
import { storage, gemini } from '../services';

export const handleClearCommand = (ctx: CommandContext) => {
    const newConv = storage.createConversation();
    if (newConv) {
        (newConv as { model?: string }).model = ctx.model;
    }
    ctx.setConversation(newConv);
    ctx.addSystemMessage('Conversation cleared.');
};

/**
 * /compress - Force compress chat history to reduce token usage
 * Only works with Gemini provider
 */
export const handleCompressCommand = (ctx: CommandContext) => {
    if (ctx.provider !== 'gemini') {
        ctx.addSystemMessage('⚠️ Compressão só está disponível para o provider Gemini.');
        return;
    }

    const result = gemini.forceCompressHistory();

    if (result.compressed) {
        ctx.addSystemMessage(`✅ ${result.message}`);
    } else {
        ctx.addSystemMessage(`ℹ️ ${result.message}`);
    }
};

/**
 * /tokens - Show token estimate for current conversation
 * Only works with Gemini provider
 */
export const handleTokensCommand = (ctx: CommandContext) => {
    if (ctx.provider !== 'gemini') {
        ctx.addSystemMessage('⚠️ Estimativa de tokens só está disponível para o provider Gemini.');
        return;
    }

    const estimate = gemini.getTokenEstimate();
    const usagePercent = ((estimate.currentTokens / estimate.modelLimit) * 100).toFixed(1);

    ctx.addSystemMessage(
        `📊 Tokens: ~${estimate.currentTokens.toLocaleString()} / ${estimate.modelLimit.toLocaleString()} (${usagePercent}%)`,
    );
};
