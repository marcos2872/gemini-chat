import React from 'react';
import { Box } from 'ink';
import { MessageList, type MessageListHandle } from './MessageList';
import { ModelSelector } from './ModelSelector';
import { ProviderSelector, type ProviderOption } from './ProviderSelector';
import { HelpModal } from './HelpModal';
import { ApprovalModal } from './ApprovalModal';
import { McpModal } from './McpModal';
import { CommandContext } from '../hooks/useChat';
import { CHAT_MODES } from '../../shared/types';

interface MainContentProps {
    chat: CommandContext;
    messageListRef: React.RefObject<MessageListHandle | null>;
    dimensions: { columns: number; rows: number };
    onModelSelect: (model: { name: string }) => Promise<void>;
    onModelCancel: () => void;
    onProviderSelect: (provider: ProviderOption) => Promise<void>;
    onProviderCancel: () => void;
}

/**
 * MainContent component that handles the conditional rendering
 * of different views based on chat mode.
 * Simplifies App.tsx by extracting the complex ternary chain.
 */
export const MainContent: React.FC<MainContentProps> = ({
    chat,
    messageListRef,
    dimensions,
    onModelSelect,
    onModelCancel,
    onProviderSelect,
    onProviderCancel,
}) => {
    // Provider selector
    if (chat.mode === CHAT_MODES.PROVIDER_SELECTOR) {
        return (
            <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                <ProviderSelector
                    currentProvider={chat.provider}
                    onSelect={onProviderSelect}
                    onCancel={onProviderCancel}
                />
            </Box>
        );
    }

    // Model selector
    if (chat.mode === CHAT_MODES.MODEL_SELECTOR) {
        return (
            <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                <ModelSelector
                    models={chat.selectionModels}
                    onSelect={onModelSelect}
                    onCancel={onModelCancel}
                />
            </Box>
        );
    }

    // Tool approval modal
    if (chat.approvalRequest) {
        return (
            <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                <ApprovalModal
                    toolName={chat.approvalRequest.toolName}
                    args={chat.approvalRequest.args}
                    onApprove={chat.handleApprove}
                    onReject={chat.handleReject}
                />
            </Box>
        );
    }

    // Help modal
    if (chat.mode === CHAT_MODES.HELP) {
        return (
            <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                <HelpModal onClose={() => chat.setMode('chat')} />
            </Box>
        );
    }

    // MCP manager modal
    if (chat.mode === CHAT_MODES.MCP_MANAGER) {
        return (
            <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                <McpModal
                    servers={chat.mcpServers}
                    onToggle={chat.toggleMcpServer}
                    onClose={() => chat.setMode('chat')}
                />
            </Box>
        );
    }

    // Default: message list
    return (
        <MessageList
            ref={messageListRef}
            messages={chat.conversation?.messages || []}
            width={dimensions.columns}
        />
    );
};
