import { logger } from './lib/logger';

const log = logger.ollama;

export class OllamaClient {
    public modelName: string;
    public history: any[];
    private baseUrl: string;

    constructor() {
        this.modelName = 'llama3'; // Default model
        this.history = [];
        this.baseUrl = 'http://localhost:11434';
    }

    async initialize() {
        // No explicit auth needed for local Ollama
    }

    async validateConnection(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`${this.baseUrl}/api/tags`, {
                method: 'GET',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                log.info('Ollama connection verified');
            }
            return response.ok;
        } catch (e: any) {
            log.warn('Ollama connection check failed', { error: e.message });
            return false;
        }
    }

    async setModel(model: string) {
        this.modelName = model;
        log.info('Model set', { model });
    }

    async listModels(): Promise<Array<{ name: string; displayName: string }>> {
        try {
            log.info('Fetching available models');
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return [];

            const data: any = await response.json();
            // data.models is the array

            return (data.models || []).map((m: any) => ({
                name: m.name,
                displayName: m.name,
            }));
        } catch (e: any) {
            log.error('Failed to list models', { error: e.message });
            return [];
        }
    }

    // Standardize to match other clients
    async sendPrompt(prompt: string, _mcpManager?: any, _onApproval?: any) {
        this.history.push({ role: 'user', content: prompt });

        const messages = this.history.map((h) => ({
            role: h.role,
            content: h.content,
        }));

        try {
            log.info('Sending prompt to Ollama', { model: this.modelName });
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.modelName,
                    messages: messages,
                    stream: false, // For simplicity, non-streaming first
                }),
            });

            if (!response.ok) {
                log.error('Ollama API error', { status: response.status });
                throw new Error(`Ollama API Error: ${response.statusText}`);
            }

            const data: any = await response.json();
            const responseText = data.message?.content || '';

            log.info('Received response from Ollama', { length: responseText.length });

            this.history.push({ role: 'assistant', content: responseText });

            return responseText;
        } catch (e: any) {
            log.error('Ollama request failed', { error: e.message });

            if (e.message.includes('fetch failed') || e.code === 'ECONNREFUSED') {
                throw new Error(
                    '📡 Não foi possível conectar ao Ollama. Verifique se ele está rodando (http://localhost:11434).',
                );
            }

            throw new Error(`Erro no Ollama: ${e.message}`);
        }
    }

    getHistory() {
        return this.history;
    }

    reset() {
        this.history = [];
    }
}
