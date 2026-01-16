import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
    provider: 'gemini' | 'copilot';
    model: string;
    status: string;
}

export const Header: React.FC<HeaderProps> = ({ provider, model, status }) => {
    const isAuth = status !== 'Not Authenticated';
    // Only show model if Ready/Thinking
    const isReady = status === 'Ready' || status === 'Thinking...';

    const statusText = isAuth ? status : 'Prevented';
    const modelText = isReady ? model : 'no models';
    const providerText = provider.toUpperCase();

    return (
        <Box borderStyle="round" borderColor="cyan" paddingX={1} justifyContent="space-between">
            <Text bold>IA Chat CLI</Text>
            <Text color={isAuth ? 'green' : 'red'} bold>
                {' '}
                {providerText}{' '}
            </Text>
            <Text color={isAuth ? 'white' : 'red'}> {modelText} </Text>
            <Text> │ {statusText}</Text>
        </Box>
    );
};
