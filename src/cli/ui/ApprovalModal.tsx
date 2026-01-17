import React from 'react';
import { Box, Text, useInput } from 'ink';

interface ApprovalModalProps {
    toolName: string;
    args: any;
    onApprove: () => void;
    onReject: () => void;
}

export const ApprovalModal = ({ toolName, args, onApprove, onReject }: ApprovalModalProps) => {
    useInput((input, key) => {
        if (input === 'y' || input === 'Y') {
            onApprove();
        }
        if (input === 'n' || input === 'N' || key.escape) {
            onReject();
        }
    });

    return (
        <Box
            flexDirection="column"
            padding={1}
            borderColor="yellow"
            borderStyle="double"
            minWidth={60}
        >
            <Box marginBottom={1} justifyContent="center" width="100%">
                <Text bold underline color="yellow">
                    ⚠️ Tool Execution Approval Required ⚠️
                </Text>
            </Box>

            <Box flexDirection="column" marginBottom={1}>
                <Text>
                    The model wants to execute the tool:{' '}
                    <Text bold color="cyan">
                        {toolName}
                    </Text>
                </Text>
            </Box>

            <Box
                flexDirection="column"
                marginBottom={1}
                borderStyle="single"
                borderColor="gray"
                padding={1}
            >
                <Text color="gray">Arguments:</Text>
                <Text>{JSON.stringify(args, null, 2)}</Text>
            </Box>

            <Box justifyContent="center" gap={2}>
                <Text>
                    Press{' '}
                    <Text bold color="green">
                        Y
                    </Text>{' '}
                    to Approve
                </Text>
                <Text>
                    Press{' '}
                    <Text bold color="red">
                        N
                    </Text>{' '}
                    to Reject
                </Text>
            </Box>
        </Box>
    );
};
