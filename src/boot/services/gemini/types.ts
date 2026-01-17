export interface Part {
    text?: string;
    functionCall?: {
        name: string;
        args: Record<string, unknown>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, unknown>;
    };
}

export interface Content {
    role: string;
    parts: Part[];
}

export interface GeminiTool {
    functionDeclarations: Array<{
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    }>;
}
