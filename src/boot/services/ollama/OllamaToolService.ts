import { McpTool } from '../../../shared/types';

export class OllamaToolService {
    mapToolsToOllama(mcpTools: McpTool[]) {
        return mcpTools.map((tool) => ({
            type: 'function',
            function: {
                name: this.sanitizeName(tool.name),
                description: tool.description || `Tool ${tool.name}`,
                parameters: this.sanitizeSchema(tool.inputSchema),
            },
        }));
    }

    private sanitizeName(name: string) {
        // Ollama/Llama conventions usually prefer underscores
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    private sanitizeSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') return schema;
        const clean = { ...schema };

        // Ensure type is clearly defined for fields
        if (!clean.type && clean.properties) clean.type = 'object';

        // Recursively clean properties if needed, but usually MCP schema is compatible
        // Remove potentially problematic internal fields
        delete clean.$schema;
        delete clean.title;

        return clean;
    }
}
