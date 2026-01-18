import { CommandContext } from '../hooks/useChat';
import { storage } from '../services';
import { unifiedCompressionService } from '../../boot/services/UnifiedCompressionService';

export const handleNewCommand = (ctx: CommandContext) => {
    const newConv = storage.createConversation();
    if (newConv) {
        (newConv as { model?: string }).model = ctx.model;
    }
    ctx.setConversation(newConv);
    ctx.addSystemMessage('New conversation started.');
};

/**
 * /compress - Force compress chat history to reduce token usage
 * Works with all providers (uses unified history format)
 */
export const handleCompressCommand = (ctx: CommandContext) => {
    if (!ctx.conversation) {
        ctx.addSystemMessage('⚠️ Nenhuma conversa ativa.');
        return;
    }

    const result = unifiedCompressionService.compress(
        ctx.conversation.messages,
        ctx.model,
        true, // force
    );

    if (result.compressed) {
        // Update conversation with compressed history
        ctx.setConversation({
            ...ctx.conversation,
            messages: result.newHistory,
        });
        ctx.addSystemMessage(
            `✅ Histórico comprimido: ${result.originalTokenCount} → ${result.newTokenCount} tokens`,
        );
    } else {
        const message =
            result.status === 'SKIPPED_TOO_SHORT'
                ? 'ℹ️ Histórico muito curto para compressão.'
                : 'ℹ️ Nenhuma compressão necessária.';
        ctx.addSystemMessage(message);
    }
};

/**
 * /tokens - Show token estimate for current conversation
 * Works with all providers (uses unified compression service)
 */
export const handleTokensCommand = (ctx: CommandContext) => {
    if (!ctx.conversation) {
        ctx.addSystemMessage('⚠️ Nenhuma conversa ativa.');
        return;
    }

    const currentTokens = unifiedCompressionService.estimateTokenCount(ctx.conversation.messages);
    const modelLimit = unifiedCompressionService.getTokenLimit(ctx.model);
    const usagePercent = ((currentTokens / modelLimit) * 100).toFixed(1);

    ctx.addSystemMessage(
        `📊 Tokens: ~${currentTokens.toLocaleString()} / ${modelLimit.toLocaleString()} (${usagePercent}%)`,
    );
};
