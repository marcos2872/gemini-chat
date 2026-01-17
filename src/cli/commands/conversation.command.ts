import { CommandContext } from '../hooks/useChat';
import { storage } from '../services';

export const handleClearCommand = (ctx: CommandContext) => {
    const newConv = storage.createConversation();
    if (newConv) {
        (newConv as { model?: string }).model = ctx.model;
    }
    ctx.setConversation(newConv);
    ctx.addSystemMessage('Conversation cleared.');
};
