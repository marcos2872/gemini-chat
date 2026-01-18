import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Conversation } from '../../shared/types';
import { storage } from '../services';
import { Spinner } from './Spinner';

interface HistoryModalProps {
    onClose: () => void;
    onSelect: (conversation: Conversation) => void;
}

export const HistoryModal = ({ onClose, onSelect }: HistoryModalProps) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadHistory = async () => {
            try {
                const list = await storage.listConversations();
                setConversations(list);
                if (list.length > 0) {
                    setSelectedIndex(0);
                }
            } catch (err) {
                const e = err as Error;
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        loadHistory();
    }, []);

    useInput((_input, key) => {
        if (key.escape) {
            onClose();
            return;
        }

        if (loading || conversations.length === 0) return;

        if (key.upArrow) {
            setSelectedIndex((prev) => Math.max(0, prev - 1));
        }

        if (key.downArrow) {
            setSelectedIndex((prev) => Math.min(conversations.length - 1, prev + 1));
        }

        if (key.return) {
            onSelect(conversations[selectedIndex]);
        }

        if (key.delete || _input === 'd') {
            const convToDelete = conversations[selectedIndex];
            if (convToDelete) {
                storage.deleteConversation(convToDelete.id).then(() => {
                    setConversations((prev) => prev.filter((c) => c.id !== convToDelete.id));
                    if (selectedIndex >= conversations.length - 1) {
                        setSelectedIndex(Math.max(0, conversations.length - 2));
                    }
                });
            }
        }
    });

    if (loading) {
        return (
            <Box flexDirection="column" padding={1} borderColor="blue" borderStyle="single">
                <Text>
                    <Spinner /> Loading history...
                </Text>
            </Box>
        );
    }

    if (error) {
        return (
            <Box flexDirection="column" padding={1} borderColor="red" borderStyle="single">
                <Text color="red">Error loading history: {error}</Text>
                <Text color="gray">Press Esc to close</Text>
            </Box>
        );
    }

    if (conversations.length === 0) {
        return (
            <Box flexDirection="column" padding={1} borderColor="blue" borderStyle="single">
                <Text>No history found.</Text>
                <Text color="gray">Press Esc to close</Text>
            </Box>
        );
    }

    // Calculate pagination window
    const windowSize = 8;
    let startIdx = 0;
    if (selectedIndex > windowSize / 2) {
        startIdx = Math.min(
            selectedIndex - Math.floor(windowSize / 2),
            conversations.length - windowSize,
        );
    }
    startIdx = Math.max(0, startIdx);
    const visibleConversations = conversations.slice(startIdx, startIdx + windowSize);

    return (
        <Box
            flexDirection="column"
            padding={1}
            borderColor="blue"
            borderStyle="single"
            minWidth={60}
        >
            <Box marginBottom={1} justifyContent="center" width="100%">
                <Text bold underline color="blue">
                    Conversation History
                </Text>
            </Box>

            <Box flexDirection="column" gap={0}>
                {visibleConversations.map((conv, idx) => {
                    const actualIdx = startIdx + idx;
                    const isSelected = actualIdx === selectedIndex;

                    // Find last user message for context
                    const lastUserMsg = [...conv.messages].reverse().find((m) => m.role === 'user');
                    const preview = lastUserMsg
                        ? lastUserMsg.content.length > 50
                            ? lastUserMsg.content.substring(0, 50) + '...'
                            : lastUserMsg.content
                        : '(Empty conversation)';

                    const date = new Date(conv.startTime).toLocaleString();

                    return (
                        <Box key={conv.id}>
                            <Text color={isSelected ? 'green' : 'white'} bold={isSelected}>
                                {isSelected ? '> ' : '  '}
                                {date} - {preview}
                            </Text>
                        </Box>
                    );
                })}
            </Box>

            <Box
                marginTop={1}
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                justifyContent="center"
            >
                <Text color="gray">
                    Use Up/Down to Navigate, Enter to Select, Delete/d to remove, Esc to Close
                </Text>
            </Box>
        </Box>
    );
};
