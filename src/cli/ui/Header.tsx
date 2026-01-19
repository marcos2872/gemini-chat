import React from 'react';
import { Box, Text } from 'ink';

import { Spinner } from './Spinner';

interface HeaderProps {
    provider: 'gemini' | 'copilot' | 'ollama';
    model: string;
    status: string;
}

export const Header: React.FC<HeaderProps> = ({ provider, model, status }) => {
    const isAuth =
        status !== 'Not Authenticated' &&
        status !== 'Ollama Not Detected' &&
        !status.startsWith('Error:');
    // Only show model if Ready/Thinking
    const isReady = status === 'Ready' || status === 'Thinking...';

    // Check if status indicates loading
    const isLoading =
        status.includes('Thinking') ||
        status.includes('Initializing') ||
        status.includes('Checking') ||
        status.includes('Authenticating');

    const statusText = isAuth ? status : 'Prevented';
    const modelText = isReady ? model : 'no models';
    const providerText = provider.toUpperCase();

    return (
        <Box borderStyle="round" borderColor="cyan" justifyContent="space-between" width="100%">
            <Text bold>IA Chat CLI</Text>
            <Text color={isAuth ? 'green' : 'red'} bold>
                {' '}
                {providerText}{' '}
            </Text>
            <Text color={isAuth ? 'white' : 'red'}> {modelText} </Text>
            <Text>
                │ {isLoading && <Spinner color="yellow" />} {statusText}
            </Text>
        </Box>
    );
};
