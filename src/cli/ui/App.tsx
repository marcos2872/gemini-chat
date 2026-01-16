import React from 'react';
import { Box, Text } from 'ink';
import { MessageList } from './MessageList';
import { Input } from './Input';
import { useChat } from '../hooks/useChat';
import { useCommands } from '../hooks/useCommands';
import { Header } from './Header';

export const App = () => {
    // 1. Chat State & Logic
    const chat = useChat();

    // 2. Command Handling
    const { handleCommand } = useCommands(chat);

    // 3. Input Handler
    const onInputSubmit = async (text: string) => {
        if (text.startsWith('/')) {
            const parts = text.slice(1).split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);
            await handleCommand(cmd, args);
        } else {
            await chat.handleSubmit(text);
        }
    };

    if (!chat.conversation) {
        return <Text color="yellow">{chat.status}</Text>;
    }

    return (
        <Box flexDirection="column" padding={1} height="100%">
            <Header provider={chat.provider} model={chat.model} status={chat.status} />

            <Box flexGrow={1} flexDirection="column" minHeight={20}>
                <MessageList messages={chat.conversation.messages} />
            </Box>

            <Box borderStyle="single" borderColor="gray" paddingX={1} height={3}>
                <Input
                    onSubmit={onInputSubmit}
                    isActive={!chat.isProcessing}
                    placeholder={chat.isProcessing ? 'Thinking...' : 'Type a message or /help'}
                />
            </Box>
        </Box>
    );
};
