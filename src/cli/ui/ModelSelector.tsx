import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { UI_CONFIG } from '../../shared/constants';

interface Model {
    name: string;
    displayName: string;
}

interface ModelSelectorProps {
    models: Model[];
    onSelect: (model: Model) => void;
    onCancel: () => void;
}

export const ModelSelector = ({ models, onSelect, onCancel }: ModelSelectorProps) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((_input, key) => {
        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        }

        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(models.length - 1, prev + 1));
        }

        if (key.return) {
            onSelect(models[selectedIndex]);
        }

        if (key.escape) {
            onCancel();
        }
    });

    if (models.length === 0) {
        return (
            <Box flexDirection="column" padding={1} borderColor="red" borderStyle="single">
                <Text color="red">No models available to select.</Text>
                <Text color="gray">Press Esc to cancel</Text>
            </Box>
        );
    }

    // Calculate window to keep selected item in view if list is long
    // Simple version: just show all, relying on terminal scrolling if needed.
    // Enhanced version: slice the array. Let's start simple as 'ink' handles some layout.
    // Actually, for a CLI menu, usually we want a fixed window. Let's just show 10 items around the cursor.

    const WINDOW_SIZE = UI_CONFIG.MODEL_SELECTOR_WINDOW_SIZE;
    let start = 0;
    if (selectedIndex >= WINDOW_SIZE) {
        start = selectedIndex - WINDOW_SIZE + 1;
    }
    const visibleModels = models.slice(start, start + WINDOW_SIZE);

    return (
        <Box flexDirection="column" padding={1} borderColor="blue" borderStyle="single">
            <Box marginBottom={1}>
                <Text bold underline>
                    Select a Model (Use Arrow Keys + Enter):
                </Text>
            </Box>
            {visibleModels.map((model, index) => {
                const actualIndex = start + index;
                const isSelected = actualIndex === selectedIndex;
                return (
                    <Box key={model.name}>
                        <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
                            {isSelected ? '> ' : '  '}
                            {model.displayName}
                        </Text>
                    </Box>
                );
            })}
            <Box marginTop={1}>
                <Text color="gray">
                    {models.length > WINDOW_SIZE
                        ? `... and ${models.length - visibleModels.length - start} more`
                        : ''}
                </Text>
            </Box>
        </Box>
    );
};
