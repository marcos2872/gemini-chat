import { GoogleAuthService } from './auth/GoogleAuthService';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { logger } from './lib/logger';
import { GeminiHandshakeService } from './services/gemini/GeminiHandshakeService';
import { GeminiToolService } from './services/gemini/GeminiToolService';
import { GeminiStreamService } from './services/gemini/GeminiStreamService';
import { Content, Part } from './services/gemini/types';
import { GeminiListModelsService } from './services/gemini/GeminiListModelsService';

const log = logger.gemini;

// Internal API Constants
const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal';

export class GeminiClient {
    private configPath: string | undefined;
    public modelName: string;
    private history: Content[]; // Valid Content objects
    private authService: GoogleAuthService;
    private client: OAuth2Client | null = null;
    private projectId: string | undefined;

    // Services
    private handshakeService: GeminiHandshakeService;
    private toolService: GeminiToolService;
    private streamService: GeminiStreamService;
    private listModelsService: GeminiListModelsService;

    constructor(configPath?: string) {
        this.configPath = configPath;
        this.modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        this.history = [];
        this.authService = new GoogleAuthService();

        // Initialize Services
        this.handshakeService = new GeminiHandshakeService();
        this.toolService = new GeminiToolService();
        this.streamService = new GeminiStreamService();
        this.listModelsService = new GeminiListModelsService();
    }

    async initialize(): Promise<boolean> {
        try {
            log.info('Initializing Gemini client...');
            this.client = await this.authService.getAuthenticatedClient(false);
            const accessToken = await this.client.getAccessToken();
            if (!accessToken.token) throw new Error('Failed to retrieve access token');
            log.info('Gemini client initialized successfully', { model: this.modelName });
            return true;
        } catch (e: any) {
            log.info('Gemini client initialization skipped or failed (not authenticated)', {
                error: e.message,
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
        log.info('Model changed', { model });
    }

    isConfigured() {
        log.info('Checking if Gemini client is configured', !!this.client);
        return !!this.client;
    }

    async validateConnection() {
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
    async sendPrompt(prompt: string, mcpManager?: any, onApproval?: any) {
        if (!this.client) await this.initialize();
        if (!this.client) throw new Error('Gemini Client not authenticated');

        // 1. Setup
        this.projectId = await this.handshakeService.performHandshake(this.client, this.projectId);
        const promptId = uuidv4();

        // Add user message to history
        this.history.push({ role: 'user', parts: [{ text: prompt }] });

        // Prepare Tools
        let geminiTools: any[] | undefined = undefined;
        if (mcpManager) {
            const tools = await mcpManager.getAllTools();
            if (tools && tools.length > 0) {
                geminiTools = this.toolService.mapToolsToGemini(tools);
            }
        }

        const MAX_TURNS = 10;
        let turn = 0;
        let finalAnswer = '';

        // 2. Loop
        while (turn < MAX_TURNS) {
            // Build Payload with current history (which includes previous turns)
            // Filter out any empty contents from history to prevent INVALID_ARGUMENT
            const validHistory = this.history.filter((h) => h.parts && h.parts.length > 0);

            const payload = this.buildInternalRequestPayload(
                {
                    model: this.modelName,
                    contents: validHistory,
                    tools: geminiTools,
                },
                promptId,
                this.projectId,
            );

            log.debug('Sending request', { turn });
            const stream = await this.sendInternalChat(this.client, payload);

            // Parse Full Response
            const responseContent = await this.streamService.consumeStream(stream);

            // Add Model Response to History
            this.history.push(responseContent);

            // Check for Function Calls
            const functionCalls = responseContent.parts
                .filter((p) => p.functionCall)
                .map((p) => p.functionCall!);

            if (functionCalls.length > 0) {
                log.info('Received tool calls', { count: functionCalls.length });

                for (const call of functionCalls) {
                    let result: any;
                    let approved = true;

                    // Approval
                    if (typeof onApproval === 'function') {
                        approved = await onApproval(call.name, call.args);
                    }

                    if (!approved) {
                        log.warn('Tool execution rejected', { tool: call.name });
                        result = { error: 'User denied tool execution.' };
                    } else {
                        // Execution
                        try {
                            result = await mcpManager.callTool(call.name, call.args);
                            log.debug('Tool executed', { tool: call.name });
                        } catch (e: any) {
                            log.error('Tool execution failed', {
                                tool: call.name,
                                error: e.message,
                            });
                            result = { error: e.message };
                        }
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
                    this.history.push({
                        role: 'user', // Internal API uses 'user' (or function specific role depending on strictness, but prompt says user works)
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
    }

    private buildInternalRequestPayload(req: any, userPromptId: string, projectId?: string) {
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

    private async sendInternalChat(client: OAuth2Client, payload: any) {
        const url = `${ENDPOINT}:streamGenerateContent?alt=sse`;

        const res = await client.request({
            url: url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            responseType: 'stream',
        });
        return res.data as any;
    }

    _addToHistory(role: string, content: string) {
        // Legacy method for types that might still use it,
        // but internal logic now pushes directly to this.history array with 'parts'
        // We can adapt:
        this.history.push({
            role: role === 'assistant' ? 'model' : 'user',
            parts: [{ text: content }],
        });
    }

    getHistory() {
        // Map back to UI format if needed: { role, content }
        // Implementation depends on what the UI expects.
        // Assuming UI expects: [{ role: 'user', content: '...' }]
        return this.history.map((h) => ({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: h.parts
                .map((p) => p.text || (p.functionCall ? `Using tool: ${p.functionCall.name}` : ''))
                .join(''),
        }));
    }

    shutdown() {
        this.client = null;
        this.projectId = undefined;
        log.info('Client shut down');
    }

    async signOut() {
        await this.authService.signOut();

        this.shutdown();
    }

    async listModels(): Promise<Array<{ name: string; displayName: string }>> {
        return this.listModelsService.listModels();
    }
}
