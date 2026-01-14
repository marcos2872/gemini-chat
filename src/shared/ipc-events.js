"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    PING: 'ping',
    GEMINI: {
        PROMPT: 'gemini:prompt',
        HISTORY: 'gemini:history',
        SET_MODEL: 'gemini:set-model',
        LIST_MODELS: 'gemini:list-models',
        SET_KEY: 'gemini:set-key',
        CHECK_CONNECTION: 'gemini:check-connection',
        APPROVAL_REQUEST: 'gemini:approval-request',
        APPROVAL_RESPONSE: 'gemini:approval-response',
    },
    MCP: {
        LIST: 'mcp:list',
        LIST_TOOLS: 'mcp:list-tools',
        LIST_PROMPTS: 'mcp:list-prompts',
        GET_PROMPT: 'mcp:get-prompt',
        ADD: 'mcp:add',
        REMOVE: 'mcp:remove',
        UPDATE: 'mcp:update',
        TEST: 'mcp:test',
        TEST_CONFIG: 'mcp:test-config',
        CALL_TOOL: 'mcp:call-tool',
    },
    AUTH: {
        SAVE_TOKEN: 'auth:save-token',
        GET_TOKEN: 'auth:get-token',
        REQUEST_DEVICE_CODE: 'auth:request-device-code',
        POLL_TOKEN: 'auth:poll-token',
    },
    COPILOT: {
        INIT: 'copilot:init',
        CHECK_CONNECTION: 'copilot:check-connection',
        MODELS: 'copilot:models',
        CHAT_STREAM: 'copilot:chat-stream',
        CHUNK: 'copilot:chunk',
    },
    CONVERSATION: {
        NEW: 'conversation:new',
        LOAD: 'conversation:load',
        LIST: 'conversation:list',
        DELETE: 'conversation:delete',
        EXPORT: 'conversation:export',
        SYNC: 'conversation:sync',
        UPDATE: 'conversation:update',
    },
    SHELL: {
        OPEN: 'shell:open',
    }
};
