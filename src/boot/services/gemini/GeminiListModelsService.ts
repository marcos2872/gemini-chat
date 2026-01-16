export class GeminiListModelsService {
    async listModels(): Promise<Array<{ name: string; displayName: string }>> {
        const PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview';
        const PREVIEW_GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';
        const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
        const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
        const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

        return [
            {
                name: DEFAULT_GEMINI_FLASH_MODEL,
                displayName: DEFAULT_GEMINI_FLASH_MODEL,
            },
            { name: DEFAULT_GEMINI_MODEL, displayName: DEFAULT_GEMINI_MODEL },
            {
                name: DEFAULT_GEMINI_FLASH_LITE_MODEL,
                displayName: DEFAULT_GEMINI_FLASH_LITE_MODEL,
            },
            {
                name: PREVIEW_GEMINI_MODEL,
                displayName: PREVIEW_GEMINI_MODEL,
            },
            {
                name: PREVIEW_GEMINI_FLASH_MODEL,
                displayName: PREVIEW_GEMINI_FLASH_MODEL,
            },
        ];
    }
}
