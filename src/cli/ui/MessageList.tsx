import React from 'react';
import { Box, Text } from 'ink';

interface Message {
    role: string;
    content: string;
    timestamp: string;
}

export const MessageList = ({ messages }: { messages: Message[] }) => {
    if (!messages || messages.length === 0) {
        return (
            <Box padding={1}>
                <Text color="gray">No messages yet. Start chatting!</Text>
            </Box>
        );
    }

    return (
        <Box flexDirection="column" padding={1}>
            {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                        <Text color={isUser ? 'blue' : 'green'} bold>
                            {isUser ? 'You' : 'Gemini'}:
                        </Text>
                        <Text>{msg.content}</Text>
                    </Box>
                );
            })}
        </Box>
    );
};
