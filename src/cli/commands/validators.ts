import { CommandContext } from '../hooks/useChat';

/**
 * Validation helpers for command arguments
 */

export const VALID_PROVIDERS = ['gemini', 'copilot', 'ollama'] as const;
export type ValidProvider = (typeof VALID_PROVIDERS)[number];

export function isValidProvider(provider: string): provider is ValidProvider {
    return VALID_PROVIDERS.includes(provider as ValidProvider);
}

export function validateProvider(
    provider: string | undefined,
    ctx: CommandContext,
): ValidProvider | null {
    if (!provider) {
        ctx.addSystemMessage(
            '❌ Provider name is required. Usage: /provider [gemini|copilot|ollama]',
        );
        return null;
    }

    if (!isValidProvider(provider)) {
        ctx.addSystemMessage(
            `❌ Invalid provider '${provider}'. Valid options: ${VALID_PROVIDERS.join(', ')}`,
        );
        return null;
    }

    return provider;
}

export function validateModelName(
    modelName: string | undefined,
    ctx: CommandContext,
): string | null {
    if (!modelName) {
        ctx.addSystemMessage('❌ Model name is required. Usage: /model <model-name>');
        return null;
    }

    if (modelName.trim().length === 0) {
        ctx.addSystemMessage('❌ Model name cannot be empty');
        return null;
    }

    // Basic validation - model names should be alphanumeric with hyphens/dots
    // Basic validation - model names should be alphanumeric with hyphens/dots/colons
    if (!/^[a-zA-Z0-9.:_-]+$/.test(modelName)) {
        ctx.addSystemMessage(
            '❌ Invalid model name format. Use only letters, numbers, hyphens, dots, colons, and underscores',
        );
        return null;
    }

    return modelName;
}

export function validateConversationId(id: string | undefined, ctx: CommandContext): string | null {
    if (!id) {
        ctx.addSystemMessage('❌ Conversation ID is required');
        return null;
    }

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
        ctx.addSystemMessage('❌ Invalid conversation ID format');
        return null;
    }

    return id;
}
