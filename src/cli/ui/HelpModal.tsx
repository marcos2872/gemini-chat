import React from 'react';
import { Box, Text, useInput } from 'ink';

interface HelpModalProps {
    onClose: () => void;
}

export const HelpModal = ({ onClose }: HelpModalProps) => {
    useInput((_input, key) => {
        if (key.escape || key.return) {
            onClose();
        }
    });

    return (
        <Box
            flexDirection="column"
            padding={1}
            borderColor="green"
            borderStyle="single"
            minWidth={60}
        >
            <Box marginBottom={1} justifyContent="center" width="100%">
                <Text bold underline color="green">
                    Keyboard Shortcuts & Commands
                </Text>
            </Box>

            <Box flexDirection="column" gap={1}>
                <Box>
                    <Text bold>Alt + P</Text>
                    <Text> : Switch Provider (Gemini / Copilot / Ollama)</Text>
                </Box>
                <Box>
                    <Text bold>Alt + M</Text>
                    <Text> : Select Model</Text>
                </Box>
                <Box>
                    <Text bold>Alt + C</Text>
                    <Text> : Clear Conversation</Text>
                </Box>
                <Box>
                    <Text bold>Alt + A</Text>
                    <Text> : Authenticate current provider</Text>
                </Box>
                <Box>
                    <Text bold>Alt + L</Text>
                    <Text> : Open Logs</Text>
                </Box>
                <Box>
                    <Text bold>Alt + O</Text>
                    <Text> : Logout</Text>
                </Box>
                <Box>
                    <Text bold>Alt + Q</Text>
                    <Text> : Quit Application</Text>
                </Box>
                <Box>
                    <Text bold>Alt + H</Text>
                    <Text> : Show this Help</Text>
                </Box>
            </Box>

            <Box
                marginTop={1}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                justifyContent="center"
            >
                <Text color="gray">Press Esc or Enter to close</Text>
            </Box>
        </Box>
    );
};
