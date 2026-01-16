export class GeminiToolService {
    mapToolsToGemini(mcpTools: any[]) {
        // Map to { function_declarations: [...] }
        const tools = mcpTools.map((tool) => ({
            name: this.sanitizeName(tool.name),
            description: tool.description || `Tool ${tool.name}`,
            parameters: this.sanitizeSchema(tool.inputSchema),
        }));
        // User snippet uses: tools: [ { function_declarations: [...] } ]
        return [
            {
                functionDeclarations: tools,
            },
        ];
    }

    private sanitizeName(name: string) {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    private sanitizeSchema(schema: any): any {
        if (!schema || typeof schema !== 'object') return schema;
        const clean = { ...schema };
        if (!clean.type && clean.properties) clean.type = 'OBJECT';
        if (clean.type && typeof clean.type === 'string') clean.type = clean.type.toUpperCase();
        delete clean.$schema;
        delete clean.title;
        // Gemini doesn't like some standard json schema keywords?
        // Usually fine, keeping existing sanitization
        return clean;
    }
}
