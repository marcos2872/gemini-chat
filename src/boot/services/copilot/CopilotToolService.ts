import { createLogger } from '../../lib/logger';
import { IMcpManager } from '../../../shared/types';

const log = createLogger('CopilotToolService');

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: Record<string, unknown>;
    };
}

export class CopilotToolService {
    async getOpenAITools(mcpManager: IMcpManager): Promise<OpenAITool[]> {
        try {
            const tools = await mcpManager.getAllTools();
            if (!tools || tools.length === 0) return [];

            const openAITools = tools.map((tool) => ({
                type: 'function' as const,
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema,
                },
            }));

            log.debug('Tools mapped for OpenAI', { count: openAITools.length });
            return openAITools;
        } catch (error) {
            log.error('Error mapping tools', { error });
            return [];
        }
    }

    parseToolArgs(functionName: string, argsString: string): Record<string, unknown> {
        try {
            return JSON.parse(argsString);
        } catch {
            log.error('Failed to parse tool args', {
                tool: functionName,
                args: argsString,
            });
            return {};
        }
    }
}
