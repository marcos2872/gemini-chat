import { useState, useCallback, useEffect } from 'react';
import type { McpServer, McpTool, McpPrompt } from '../../shared/types';

interface UseMcpReturn {
    servers: McpServer[];
    tools: McpTool[];
    prompts: McpPrompt[];
    isLoading: boolean;
    error: string | null;
    addServer: (server: McpServer) => Promise<void>;
    updateServer: (name: string, updates: Partial<McpServer>) => Promise<void>;
    removeServer: (name: string) => Promise<void>;
    getPrompt: (
        serverName: string,
        promptName: string,
        args?: Record<string, unknown>,
    ) => Promise<any>;
    refresh: () => Promise<void>;
    testConfig: (
        server: McpServer,
    ) => Promise<{ success: boolean; connected: boolean; error?: string }>;
}

export function useMcp(): UseMcpReturn {
    const [servers, setServers] = useState<McpServer[]>([]);
    const [tools, setTools] = useState<McpTool[]>([]);
    const [prompts, setPrompts] = useState<McpPrompt[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Load servers
            const serverList = await window.electronAPI.mcpList();
            setServers(serverList);

            // Load capabilities
            try {
                const [toolList, promptList] = await Promise.all([
                    window.electronAPI.mcpListTools(),
                    window.electronAPI.mcpListPrompts(),
                ]);
                setTools(toolList);
                setPrompts(promptList);
            } catch (e) {
                console.warn('Failed to load MCP capabilities:', e);
                // Don't fail the whole hook if capabilities fail, just log
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load MCP servers');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10000);
        return () => clearInterval(interval);
    }, [refresh]);

    const addServer = useCallback(
        async (server: McpServer) => {
            try {
                const result = await window.electronAPI.mcpAdd(server);
                if (!result.success) throw new Error(result.error);
                await refresh();
            } catch (err: any) {
                setError(err.message || 'Failed to add server');
                throw err;
            }
        },
        [refresh],
    );

    const updateServer = useCallback(
        async (name: string, updates: Partial<McpServer>) => {
            try {
                const result = await window.electronAPI.mcpUpdate(name, updates);
                if (!result.success) throw new Error(result.error);
                await refresh();
            } catch (err: any) {
                setError(err.message || 'Failed to update server');
                throw err;
            }
        },
        [refresh],
    );

    const removeServer = useCallback(
        async (name: string) => {
            try {
                const result = await window.electronAPI.mcpRemove(name);
                if (!result.success) throw new Error(result.error);
                await refresh();
            } catch (err: any) {
                setError(err.message || 'Failed to remove server');
                throw err;
            }
        },
        [refresh],
    );

    const getPrompt = useCallback(
        async (serverName: string, promptName: string, args: Record<string, unknown> = {}) => {
            try {
                return await window.electronAPI.mcpGetPrompt(serverName, promptName, args);
            } catch (err: any) {
                console.error('Failed to get prompt:', err);
                throw err;
            }
        },
        [],
    );

    const testConfig = useCallback(async (server: McpServer) => {
        try {
            return await window.electronAPI.mcpTestConfig(server);
        } catch (err: any) {
            return { success: false, connected: false, error: err.message };
        }
    }, []);

    return {
        servers,
        tools,
        prompts,
        isLoading,
        error,
        addServer,
        updateServer,
        removeServer,
        getPrompt,
        refresh,
        testConfig,
    };
}
