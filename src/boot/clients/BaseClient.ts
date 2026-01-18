/**
 * Base Client - Abstract base class for AI provider clients
 * Provides common functionality for tool loop and error handling
 *
 * Note: History is managed by the CLI (conversation.messages), not by clients.
 * Clients receive history as a parameter and convert to their specific format.
 */
import { IMcpManager, ApprovalCallback, Model, Message } from '../../shared/types';
import { createLogger } from '../lib/logger';

export interface ToolCallResult {
    approved: boolean;
    result: unknown;
}

type Logger = ReturnType<typeof createLogger>;

export abstract class BaseClient {
    public abstract modelName: string;
    protected readonly log: Logger;

    constructor(loggerName: string) {
        this.log = createLogger(loggerName);
    }

    /**
     * Execute a tool with approval flow
     */
    protected async executeToolWithApproval(
        toolName: string,
        args: Record<string, unknown>,
        mcpManager: IMcpManager,
        onApproval?: ApprovalCallback,
    ): Promise<ToolCallResult> {
        let approved = true;

        // Request approval if callback provided
        if (typeof onApproval === 'function') {
            approved = await onApproval(toolName, args);
        }

        if (!approved) {
            this.log.warn('Tool execution rejected', { tool: toolName });
            return {
                approved: false,
                result: { error: 'User denied tool execution.' },
            };
        }

        // Execute the tool
        try {
            const result = await mcpManager.callTool(toolName, args);
            this.log.debug('Tool executed', { tool: toolName });
            return { approved: true, result };
        } catch (e) {
            const err = e as Error;
            this.log.error('Tool execution failed', {
                tool: toolName,
                error: err.message,
            });
            return { approved: true, result: { error: err.message } };
        }
    }

    /**
     * Handle common API errors with user-friendly messages
     */
    protected handleApiError(error: Error): never {
        const msg = error.message.toLowerCase();

        if (msg.includes('401') || msg.includes('unauthorized')) {
            throw new Error(
                '🔒 Sessão expirada ou inválida (401). Faça login novamente com /auth.',
            );
        }
        if (msg.includes('403') || msg.includes('permission denied')) {
            throw new Error('🚫 Acesso negado (403). Verifique suas permissões.');
        }
        if (
            msg.includes('429') ||
            msg.includes('resource exhausted') ||
            msg.includes('rate limit')
        ) {
            throw new Error('⏳ Muitas requisições (429). Aguarde um momento.');
        }
        if (
            msg.includes('network') ||
            msg.includes('fetch failed') ||
            msg.includes('econnrefused')
        ) {
            throw new Error('📡 Erro de conexão. Verifique sua internet.');
        }

        throw error;
    }

    /**
     * Abstract methods that must be implemented by subclasses
     */
    abstract isConfigured(): boolean;
    abstract validateConnection(): Promise<boolean>;
    abstract setModel(model: string): Promise<void> | void;
    abstract listModels(): Promise<Model[]>;

    /**
     * Send a prompt to the AI provider
     * @param prompt - The user's message
     * @param history - Conversation history (unified format)
     * @param mcpManager - Optional MCP manager for tools
     * @param onApproval - Optional approval callback for tools
     * @param signal - Optional AbortSignal to cancel
     * @param onChunk - Optional callback for streaming (provider-specific)
     * @returns The assistant's response and any tool calls made
     */
    abstract sendPrompt(
        prompt: string,
        history: Message[],
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        signal?: AbortSignal,
        onChunk?: (chunk: string) => void,
    ): Promise<SendPromptResult>;
}

/**
 * Result from sendPrompt including response and tool interactions
 */
export interface SendPromptResult {
    /** The text response from the model */
    response: string;
    /** Tool calls made during this request (to be appended to history) */
    toolMessages?: Message[];
}

/**
 * Constants for tool loop
 */
export const MAX_TOOL_TURNS = 10;
