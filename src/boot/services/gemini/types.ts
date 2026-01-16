export interface Part {
    text?: string;
    functionCall?: {
        name: string;
        args: any;
    };
    functionResponse?: {
        name: string;
        response: any;
    };
}

export interface Content {
    role: string;
    parts: Part[];
}
