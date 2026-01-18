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
            paddingX={1}
            paddingY={0}
            borderColor="green"
            borderStyle="single"
            minWidth={70}
        >
            <Box marginBottom={1} justifyContent="center" width="100%">
                <Text bold underline color="green">
                    Keyboard Shortcuts & Commands
                </Text>
            </Box>

            <Box flexDirection="row" gap={4}>
                {/* Column 1: Chat & Navigation */}
                <Box flexDirection="column" gap={0}>
                    <Text bold color="white" underline>
                        Chat Management
                    </Text>
                    <Box marginY={0.5} flexDirection="column">
                        <Text>
                            <Text bold>Alt+N</Text> : New Conversation
                        </Text>
                        <Text>
                            <Text bold>Alt+C</Text> : Chats / Load
                        </Text>
                        <Text>
                            <Text bold>Alt+X</Text> : Cancel Request
                        </Text>
                        <Text>
                            <Text bold>Alt+T</Text> : Toggle Tools
                        </Text>
                    </Box>

                    <Text bold color="white" underline>
                        Navigation
                    </Text>
                    <Box marginY={0.5} flexDirection="column">
                        <Text>
                            <Text bold>Alt+P</Text> : Switch Provider
                        </Text>
                        <Text>
                            <Text bold>Alt+M</Text> : Select Model
                        </Text>
                        <Text>
                            <Text bold>Alt+A</Text> : Authenticate
                        </Text>
                    </Box>
                </Box>

                {/* Column 2: System & Commands */}
                <Box flexDirection="column" gap={0}>
                    <Text bold color="white" underline>
                        System
                    </Text>
                    <Box marginY={0.5} flexDirection="column">
                        <Text>
                            <Text bold>Alt+L</Text> : Open Logs
                        </Text>
                        <Text>
                            <Text bold>Alt+O</Text> : Logout
                        </Text>
                        <Text>
                            <Text bold>Alt+Q</Text> : Quit App
                        </Text>
                        <Text>
                            <Text bold>Alt+H</Text> : Help
                        </Text>
                    </Box>

                    <Text bold color="white" underline>
                        Slash Commands
                    </Text>
                    <Box marginY={0.5} flexDirection="column">
                        <Text>
                            <Text bold color="cyan">
                                /compress
                            </Text>{' '}
                            : Compress History
                        </Text>
                        <Text>
                            <Text bold color="cyan">
                                /tokens
                            </Text>{' '}
                            : Token Estimate
                        </Text>
                    </Box>
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
