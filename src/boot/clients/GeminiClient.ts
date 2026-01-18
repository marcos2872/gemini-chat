import { GoogleAuthService } from '../auth/GoogleAuthService';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { GeminiHandshakeService } from '../services/gemini/GeminiHandshakeService';
import { GeminiToolService } from '../services/gemini/GeminiToolService';
import { GeminiStreamService, StreamOptions } from '../services/gemini/GeminiStreamService';
import { Content, Part, GeminiTool } from '../services/gemini/types';
import { GeminiListModelsService } from '../services/gemini/GeminiListModelsService';
import { Model, IMcpManager, ApprovalCallback, Message } from '../../shared/types';
import { BaseClient, MAX_TOOL_TURNS, SendPromptResult } from './BaseClient';
import { retryService, RetryOptions } from '../services/RetryService';
import { HistoryConverter } from '../services/HistoryConverter';
import { unifiedCompressionService } from '../services/UnifiedCompressionService';

// Internal API Constants
const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal';

// Retry configuration for API calls
const API_RETRY_OPTIONS: Partial<RetryOptions> = {
    maxAttempts: 3,
    initialDelayMs: 500,
    maxDelayMs: 5000,
};

export class GeminiClient extends BaseClient {
    private configPath: string | undefined;
    public modelName: string;
    private authService: GoogleAuthService;
    private client: OAuth2Client | null = null;
    private projectId: string | undefined;

    // Services
    private handshakeService: GeminiHandshakeService;
    private toolService: GeminiToolService;
    private streamService: GeminiStreamService;
    private listModelsService: GeminiListModelsService;

    constructor(configPath?: string) {
        super('Gemini');
        this.configPath = configPath;
        this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        this.authService = new GoogleAuthService();

        // Initialize Services
        this.handshakeService = new GeminiHandshakeService();
        this.toolService = new GeminiToolService();
        this.streamService = new GeminiStreamService();
        this.listModelsService = new GeminiListModelsService();
    }

    async initialize(): Promise<boolean> {
        try {
            this.log.info('Initializing Gemini client...');
            this.client = await this.authService.getAuthenticatedClient(false);
            const accessToken = await this.client.getAccessToken();
            if (!accessToken.token) throw new Error('Failed to retrieve access token');
            this.log.info('Gemini client initialized successfully', { model: this.modelName });
            return true;
        } catch (e) {
            const err = e as Error;
            this.log.info('Gemini client initialization skipped or failed (not authenticated)', {
                error: err.message,
            });
            return false;
        }
    }

    async signIn() {
        this.client = await this.authService.signIn();
    }

    async setModel(model: string) {
        if (this.modelName === model) return;
        this.modelName = model;
        this.log.info('Model changed', { model });
    }

    isConfigured(): boolean {
        this.log.info('Checking if Gemini client is configured', !!this.client);
        return !!this.client;
    }

    async validateConnection(): Promise<boolean> {
        try {
            const client = await this.authService.getAuthenticatedClient();
            return !!client;
        } catch {
            return false;
        }
    }

    /**
     * Send prompt with unified history format
     */
    async sendPrompt(
        prompt: string,
        history: Message[],
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        signal?: AbortSignal,
        onChunk?: (chunk: string) => void,
    ): Promise<SendPromptResult> {
        try {
            if (signal?.aborted) {
                throw new Error('Operation aborted');
            }

            if (!this.client) await this.initialize();
            if (!this.client)
                throw new Error('Você não está autenticado. Use o comando /auth para fazer login.');

            // Setup
            this.projectId = await this.handshakeService.performHandshake(
                this.client,
                this.projectId,
            );
            const promptId = uuidv4();

            // Convert history to Gemini format
            const geminiHistory = HistoryConverter.toGeminiFormat(history);

            // Add current prompt
            geminiHistory.push({ role: 'user', parts: [{ text: prompt }] });

            // Track tool messages for response
            const toolMessages: Message[] = [];

            // Prepare Tools
            let geminiTools: GeminiTool[] | undefined = undefined;
            if (mcpManager) {
                const tools = await mcpManager.getAllTools();
                if (tools && tools.length > 0) {
                    geminiTools = this.toolService.mapToolsToGemini(tools);
                }
            }

            let turn = 0;
            let finalAnswer = '';

            // Tool Loop
            while (turn < MAX_TOOL_TURNS) {
                if (signal?.aborted) {
                    throw new Error('Operation aborted');
                }

                // Curate history (filter invalid)
                const validHistory = this.getCuratedHistory(geminiHistory);

                const payload = this.buildInternalRequestPayload(
                    {
                        model: this.modelName,
                        contents: validHistory,
                        tools: geminiTools,
                    },
                    promptId,
                    this.projectId,
                );

                this.log.debug('Sending request', { turn });

                const stream = await retryService.withRetry(
                    () => this.sendInternalChat(this.client!, payload),
                    { ...API_RETRY_OPTIONS, signal },
                );

                const streamOptions: StreamOptions = {
                    signal,
                    onChunk: turn === 0 ? onChunk : undefined,
                };

                const responseContent = await this.streamService.consumeStream(
                    stream,
                    streamOptions,
                );
                geminiHistory.push(responseContent.content);

                const functionCalls = responseContent.content.parts
                    .filter((p) => p.functionCall)
                    .map((p) => p.functionCall!);

                if (functionCalls.length > 0) {
                    this.log.info('Received tool calls', { count: functionCalls.length });

                    // Add assistant message with tool_calls to history
                    toolMessages.push({
                        role: 'assistant',
                        content: responseContent.content.parts
                            .filter((p) => p.text)
                            .map((p) => p.text)
                            .join(''),
                        timestamp: new Date().toISOString(),
                        tool_calls: functionCalls.map((fc, idx) => ({
                            id: `call_${fc.name}_${idx}`,
                            function: {
                                name: fc.name,
                                arguments: fc.args,
                            },
                        })),
                    });

                    for (let i = 0; i < functionCalls.length; i++) {
                        const call = functionCalls[i];
                        const toolCallId = `call_${call.name}_${i}`;

                        if (signal?.aborted) {
                            throw new Error('Operation aborted');
                        }

                        let result: unknown;

                        if (!mcpManager) {
                            result = { error: 'McpManager not available' };
                        } else {
                            const toolResult = await this.executeToolWithApproval(
                                call.name,
                                call.args as Record<string, unknown>,
                                mcpManager,
                                onApproval,
                            );
                            result = toolResult.result;
                        }

                        const toolResponsePart: Part = {
                            functionResponse: {
                                name: call.name,
                                response: {
                                    name: call.name,
                                    content: result,
                                },
                            },
                        };

                        geminiHistory.push({
                            role: 'user',
                            parts: [toolResponsePart],
                        });

                        // Track tool message for CLI
                        toolMessages.push({
                            role: 'tool',
                            content: JSON.stringify(result),
                            timestamp: new Date().toISOString(),
                            mcpCalls: [
                                {
                                    server: 'mcp',
                                    toolName: call.name,
                                    input: call.args as Record<string, unknown>,
                                    output: result,
                                    duration: 0,
                                    error: false,
                                    toolCallId: toolCallId,
                                },
                            ],
                        });
                    }
                    turn++;
                } else {
                    finalAnswer = responseContent.content.parts
                        .filter((p) => p.text)
                        .map((p) => p.text)
                        .join('');
                    break;
                }
            }

            return {
                response: finalAnswer,
                toolMessages: toolMessages.length > 0 ? toolMessages : undefined,
            };
        } catch (error) {
            if ((error as Error).message === 'Operation aborted') {
                throw error;
            }
            this.handleApiError(error as Error);
        }
    }

    /**
     * Get curated history - filters out invalid/empty content
     */
    private getCuratedHistory(history: Content[]): Content[] {
        if (history.length === 0) return [];

        const curatedHistory: Content[] = [];
        const length = history.length;
        let i = 0;

        while (i < length) {
            const content = history[i];

            if (content.role === 'user') {
                if (this.isValidContent(content)) {
                    curatedHistory.push(content);
                }
                i++;
            } else {
                const modelOutput: Content[] = [];
                let isValid = true;

                while (i < length && history[i].role === 'model') {
                    modelOutput.push(history[i]);
                    if (isValid && !this.isValidContent(history[i])) {
                        isValid = false;
                    }
                    i++;
                }

                if (isValid) {
                    curatedHistory.push(...modelOutput);
                }
            }
        }

        return curatedHistory;
    }

    private isValidContent(content: Content): boolean {
        if (!content.parts || content.parts.length === 0) {
            return false;
        }

        for (const part of content.parts) {
            if (!part || Object.keys(part).length === 0) {
                return false;
            }
            if (
                part.text !== undefined &&
                part.text === '' &&
                !part.functionCall &&
                !part.functionResponse
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get token estimate for current model (used by /tokens command)
     */
    getTokenEstimate(history: Message[]): {
        currentTokens: number;
        modelLimit: number;
        model: string;
    } {
        const currentTokens = unifiedCompressionService.estimateTokenCount(history);
        const modelLimit = unifiedCompressionService.getTokenLimit(this.modelName);

        return {
            currentTokens,
            modelLimit,
            model: this.modelName,
        };
    }

    /**
     * Force compress history (used by /compress command)
     */
    forceCompressHistory(history: Message[]): {
        compressed: boolean;
        message: string;
        newHistory?: Message[];
    } {
        const result = unifiedCompressionService.compress(history, this.modelName, true);

        if (result.compressed) {
            return {
                compressed: true,
                message: `Histórico comprimido: ${result.originalTokenCount} → ${result.newTokenCount} tokens`,
                newHistory: result.newHistory,
            };
        }

        return {
            compressed: false,
            message:
                result.status === 'SKIPPED_TOO_SHORT'
                    ? 'Histórico muito curto para compressão.'
                    : 'Nenhuma compressão necessária.',
        };
    }

    private buildInternalRequestPayload(
        req: { model: string; contents: Content[]; tools?: GeminiTool[] },
        userPromptId: string,
        projectId?: string,
    ) {
        return {
            model: req.model,
            project: projectId,
            user_prompt_id: userPromptId,
            request: {
                contents: req.contents,
                generationConfig: {
                    temperature: 0.7,
                },
                tools: req.tools,
            },
        };
    }

    private async sendInternalChat(client: OAuth2Client, payload: Record<string, unknown>) {
        const url = `${ENDPOINT}:streamGenerateContent?alt=sse`;

        const res = await client.request({
            url: url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            responseType: 'stream',
        });
        return res.data as NodeJS.ReadableStream;
    }

    shutdown() {
        this.client = null;
        this.projectId = undefined;
        this.log.info('Client shut down');
    }

    async signOut() {
        await this.authService.signOut();
        this.shutdown();
    }

    async listModels(): Promise<Model[]> {
        return this.listModelsService.listModels();
    }
}
