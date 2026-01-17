import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ProviderOption {
    name: 'gemini' | 'copilot' | 'ollama';
    displayName: string;
}

interface ProviderSelectorProps {
    currentProvider: string;
    onSelect: (provider: ProviderOption) => void;
    onCancel: () => void;
}

const PROVIDERS: ProviderOption[] = [
    { name: 'gemini', displayName: 'Google Gemini' },
    { name: 'copilot', displayName: 'GitHub Copilot' },
    { name: 'ollama', displayName: 'Ollama (Local)' },
];

export const ProviderSelector = ({
    currentProvider,
    onSelect,
    onCancel,
}: ProviderSelectorProps) => {
    const [selectedIndex, setSelectedIndex] = useState(
        PROVIDERS.findIndex((p) => p.name === currentProvider),
    );
    // Safety check if currentProvider not in list
    if (selectedIndex === -1) setSelectedIndex(0);

    useInput((_input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        }

        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(PROVIDERS.length - 1, prev + 1));
        }

        if (key.return) {
            onSelect(PROVIDERS[selectedIndex]);
        }

        if (key.escape) {
            onCancel();
        }
    });

    return (
        <Box flexDirection="column" padding={1} borderColor="magenta" borderStyle="single">
            <Box marginBottom={1}>
                <Text bold underline>
                    Select AI Provider (Arrow Keys + Enter):
                </Text>
            </Box>
            {PROVIDERS.map((provider, index) => {
                const isSelected = index === selectedIndex;
                const isCurrent = provider.name === currentProvider;
                return (
                    <Box key={provider.name}>
                        <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
                            {isSelected ? '> ' : '  '}
                            {provider.displayName}
                            {isCurrent ? ' (Current)' : ''}
                        </Text>
                    </Box>
                );
            })}
            <Box marginTop={1}>
                <Text color="gray">Press Esc to cancel</Text>
            </Box>
        </Box>
    );
};
