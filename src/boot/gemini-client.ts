import { GoogleAuthService } from './auth/GoogleAuthService';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { GeminiHandshakeService } from './services/gemini/GeminiHandshakeService';
import { GeminiToolService } from './services/gemini/GeminiToolService';
import { GeminiStreamService } from './services/gemini/GeminiStreamService';
import { Content, Part, GeminiTool } from './services/gemini/types';
import { GeminiListModelsService } from './services/gemini/GeminiListModelsService';
import { Model, IMcpManager, ApprovalCallback } from '../shared/types';
import { BaseClient, MAX_TOOL_TURNS } from './clients/BaseClient';

// Internal API Constants
const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal';

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
     */
    async sendPrompt(
        prompt: string,
        mcpManager?: IMcpManager,
        onApproval?: ApprovalCallback,
    ): Promise<string> {
        try {
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

            // 2. Loop
            while (turn < MAX_TOOL_TURNS) {
                // Build Payload with current history (which includes previous turns)
                // Filter out any empty contents from history to prevent INVALID_ARGUMENT
                const validHistory = this.geminiHistory.filter(
                    (h) => h.parts && h.parts.length > 0,
                );

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
                const stream = await this.sendInternalChat(this.client, payload);

                // Parse Full Response
                const responseContent = await this.streamService.consumeStream(stream);

                // Add Model Response to History
                this.geminiHistory.push(responseContent);

                // Check for Function Calls
                const functionCalls = responseContent.parts
                    .filter((p) => p.functionCall)
                    .map((p) => p.functionCall!);

                if (functionCalls.length > 0) {
                    this.log.info('Received tool calls', { count: functionCalls.length });

                    for (const call of functionCalls) {
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
                    finalAnswer = responseContent.parts.map((p) => p.text).join('');
                    break;
                }
            }

            return finalAnswer;
        } catch (error) {
            this.handleApiError(error as Error);
        }
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
