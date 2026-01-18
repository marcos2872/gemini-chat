export interface Part {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: {
            name: string;
            content: unknown;
        };
    };
}

export interface Content {
    role: 'user' | 'model';
    parts: Part[];
}

export interface GeminiTool {
    functionDeclarations: Array<{
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    }>;
}
