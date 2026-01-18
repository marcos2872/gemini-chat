import { GoogleAuthService } from './auth/GoogleAuthService';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { GeminiHandshakeService } from './services/gemini/GeminiHandshakeService';
import { GeminiToolService } from './services/gemini/GeminiToolService';
import { GeminiStreamService, StreamOptions } from './services/gemini/GeminiStreamService';
import { Content, Part, GeminiTool } from './services/gemini/types';
import { GeminiListModelsService } from './services/gemini/GeminiListModelsService';
import { Model, IMcpManager, ApprovalCallback } from '../shared/types';
import { BaseClient, MAX_TOOL_TURNS } from './clients/BaseClient';
import { retryService, RetryOptions } from './services/gemini/RetryService';
import { chatCompressionService } from './services/gemini/ChatCompressionService';

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
    private geminiHistory: Content[] = [];
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
            // Silent fail expected
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
     * Main Prompt Function with Tool Loop
     * @param prompt - The user's prompt
     * @param mcpManager - Optional MCP manager for tool execution
     * @param onApproval - Optional callback for tool approval
     * @param signal - Optional AbortSignal to cancel the request
     * @param onChunk - Optional callback for streaming text chunks
     */
    async sendPrompt(
        prompt: string,
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
        signal?: AbortSignal,
        onChunk?: (chunk: string) => void,
    ): Promise<string> {
        try {
            // Check if aborted before starting
            if (signal?.aborted) {
                throw new Error('Operation aborted');
            }

            if (!this.client) await this.initialize();
            if (!this.client)
                throw new Error('Você não está autenticado. Use o comando /auth para fazer login.');

            // 1. Setup
            this.projectId = await this.handshakeService.performHandshake(
                this.client,
                this.projectId,
            );
            const promptId = uuidv4();

            // Add user message to history
            this.geminiHistory.push({ role: 'user', parts: [{ text: prompt }] });

            // Check if compression is needed
            this.maybeCompressHistory();

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

            // 2. Tool Loop with retry support
            while (turn < MAX_TOOL_TURNS) {
                // Check if aborted
                if (signal?.aborted) {
                    throw new Error('Operation aborted');
                }

                // Get curated history for API request
                const validHistory = this.getCuratedHistory();

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

                // Send request with retry logic
                const stream = await retryService.withRetry(
                    () => this.sendInternalChat(this.client!, payload),
                    { ...API_RETRY_OPTIONS, signal },
                );

                // Prepare stream options
                const streamOptions: StreamOptions = {
                    signal,
                    // Only pass onChunk for the final response (when no tool calls expected)
                    // Tool calls need to complete before streaming to UI
                    onChunk: turn === 0 ? onChunk : undefined,
                };

                // Parse Full Response with streaming callback
                const responseContent = await this.streamService.consumeStream(
                    stream,
                    streamOptions,
                );

                // Add Model Response to History
                this.geminiHistory.push(responseContent.content);

                // Check for Function Calls
                const functionCalls = responseContent.content.parts
                    .filter((p) => p.functionCall)
                    .map((p) => p.functionCall!);

                if (functionCalls.length > 0) {
                    this.log.info('Received tool calls', { count: functionCalls.length });

                    for (const call of functionCalls) {
                        // Check abort before each tool execution
                        if (signal?.aborted) {
                            throw new Error('Operation aborted');
                        }

                        let result: unknown;

                        if (!mcpManager) {
                            result = { error: 'McpManager not available' };
                        } else {
                            // Use base class method for tool execution with approval
                            const toolResult = await this.executeToolWithApproval(
                                call.name,
                                call.args as Record<string, unknown>,
                                mcpManager,
                                onApproval,
                            );
                            result = toolResult.result;
                        }

                        // Create Function Response Part
                        const toolResponsePart: Part = {
                            functionResponse: {
                                name: call.name,
                                response: {
                                    name: call.name,
                                    content: result,
                                },
                            },
                        };

                        // Add failure/success response to history
                        this.geminiHistory.push({
                            role: 'user',
                            parts: [toolResponsePart],
                        });
                    }
                    // Continue loop to get model's interpretation of tool results
                    turn++;
                } else {
                    // No function calls, this is the final text
                    finalAnswer = responseContent.content.parts
                        .filter((p) => p.text)
                        .map((p) => p.text)
                        .join('');
                    break;
                }
            }

            return finalAnswer;
        } catch (error) {
            // Don't transform abort errors
            if ((error as Error).message === 'Operation aborted') {
                throw error;
            }
            this.handleApiError(error as Error);
        }
    }

    /**
     * Check and compress history if needed
     */
    private maybeCompressHistory(): void {
        const result = chatCompressionService.compress(this.geminiHistory, this.modelName);

        if (result.compressed) {
            this.geminiHistory = result.newHistory;
            this.log.info('History compressed automatically', {
                status: result.status,
                reduction: `${result.originalTokenCount} -> ${result.newTokenCount} tokens`,
            });
        }
    }

    /**
     * Force compress history (for manual /compress command)
     */
    forceCompressHistory(): { compressed: boolean; message: string } {
        const result = chatCompressionService.compress(this.geminiHistory, this.modelName, true);

        if (result.compressed) {
            this.geminiHistory = result.newHistory;
            return {
                compressed: true,
                message: `Histórico comprimido: ${result.originalTokenCount} → ${result.newTokenCount} tokens`,
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

    /**
     * Get token estimate for current conversation
     * Used by /tokens command
     */
    getTokenEstimate(): { currentTokens: number; modelLimit: number; model: string } {
        const currentTokens = chatCompressionService.estimateTokenCount(this.geminiHistory);
        const modelLimit = chatCompressionService.getTokenLimit(this.modelName);

        return {
            currentTokens,
            modelLimit,
            model: this.modelName,
        };
    }

    /**
     * Get curated history - filters out invalid/empty content
     * Based on gemini-cli's extractCuratedHistory
     */
    private getCuratedHistory(): Content[] {
        if (this.geminiHistory.length === 0) {
            return [];
        }

        const curatedHistory: Content[] = [];
        const length = this.geminiHistory.length;
        let i = 0;

        while (i < length) {
            const content = this.geminiHistory[i];

            if (content.role === 'user') {
                // User content is always included if it has parts
                if (this.isValidContent(content)) {
                    curatedHistory.push(content);
                }
                i++;
            } else {
                // For model content, collect consecutive model messages
                const modelOutput: Content[] = [];
                let isValid = true;

                while (i < length && this.geminiHistory[i].role === 'model') {
                    modelOutput.push(this.geminiHistory[i]);
                    if (isValid && !this.isValidContent(this.geminiHistory[i])) {
                        isValid = false;
                    }
                    i++;
                }

                // Only include model output block if all parts are valid
                if (isValid) {
                    curatedHistory.push(...modelOutput);
                }
            }
        }

        return curatedHistory;
    }

    /**
     * Validate a Content object
     */
    private isValidContent(content: Content): boolean {
        if (!content.parts || content.parts.length === 0) {
            return false;
        }

        for (const part of content.parts) {
            if (!part || Object.keys(part).length === 0) {
                return false;
            }
            // Empty text is invalid (unless it's a function call/response)
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
                    temperature: 0.7, // Default
                    // Add any config params here
                },
                tools: req.tools, // Pass tools array here
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

    _addToHistory(role: string, content: string) {
        this.geminiHistory.push({
            role: role === 'assistant' ? 'model' : 'user',
            parts: [{ text: content }],
        });
    }

    override getHistory() {
        return this.geminiHistory.map((h) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts
                .map((p) => p.text || (p.functionCall ? `Using tool: ${p.functionCall.name}` : ''))
                .join(''),
        }));
    }

    override clearHistory() {
        this.geminiHistory = [];
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
