import { useState, useCallback } from 'react';
import { mcpService } from '../services';
import { McpServer } from '../../shared/types';

export interface McpManagerState {
    mcpServers: McpServer[];
    refreshMcpServers: () => Promise<void>;
    toggleMcpServer: (name: string) => Promise<void>;
}

export const useMcpManager = (): McpManagerState => {
    const [mcpServers, setMcpServers] = useState<McpServer[]>([]);

    const refreshMcpServers = useCallback(async () => {
        const servers = await mcpService.getServers();
        setMcpServers(servers);
    }, []);

    const toggleMcpServer = useCallback(
        async (name: string) => {
            await mcpService.toggleServer(name);
            await refreshMcpServers();
        },
        [refreshMcpServers],
    );

    return {
        mcpServers,
        refreshMcpServers,
        toggleMcpServer,
    };
};
