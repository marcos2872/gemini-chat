import { useState, forwardRef, useImperativeHandle, useMemo, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';

export interface MessageListHandle {
    scrollUp: () => void;
    scrollDown: () => void;
    pageUp: () => void;
    pageDown: () => void;
}

interface Message {
    role: string;
    content: string;
    timestamp: string;
    provider?: string;
}

interface MessageItemProps {
    message: Message;
    width: number;
}

interface MessageListProps {
    messages: Message[];
    width: number;
    /** Text being streamed from the AI (Gemini only) */
    streamingText?: string;
    /** Whether a request is currently processing */
    isProcessing?: boolean;
}

const MessageItem = ({ message, width }: MessageItemProps) => {
    const isUser = message.role === 'user';
    const senderName = isUser
        ? 'You'
        : message.provider
          ? message.provider.charAt(0).toUpperCase() + message.provider.slice(1)
          : 'Gemini';

    return (
        <Box flexDirection="column" marginBottom={1} width={width} flexShrink={0}>
            <Text color={isUser ? 'blue' : 'green'} bold>
                {senderName}:
            </Text>
            <Text wrap="wrap">{message.content}</Text>
        </Box>
    );
};

MessageItem.displayName = 'MessageItem';

/**
 * Streaming message component - shows text being typed with a cursor
 */
const StreamingMessage = ({ text, width }: { text: string; width: number }) => {
    return (
        <Box flexDirection="column" marginBottom={1} width={width} flexShrink={0}>
            <Text color="green" bold>
                Gemini:
            </Text>
            <Text wrap="wrap">
                {text}
                <Text color="cyan">▌</Text>
            </Text>
        </Box>
    );
};

StreamingMessage.displayName = 'StreamingMessage';

// Calculate how many lines a message will take
const calculateMessageLines = (message: Message, width: number): number => {
    const senderLine = 1; // "You:" or "Gemini:" line
    const contentWidth = width > 4 ? width - 4 : width; // Account for padding
    const content = message.content || '';

    // Split content by newlines first
    const paragraphs = content.split('\n');
    let totalLines = senderLine;

    for (const paragraph of paragraphs) {
        if (paragraph.length === 0) {
            totalLines += 1; // Empty line
        } else {
            // Estimate wrapped lines
            totalLines += Math.ceil(paragraph.length / contentWidth);
        }
    }

    totalLines += 1; // marginBottom
    return totalLines;
};

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(
    ({ messages, width, streamingText, isProcessing }, ref) => {
        const { stdout } = useStdout();
        const [scrollOffset, setScrollOffset] = useState(0);
        const [shouldStickToBottom, setShouldStickToBottom] = useState(true);

        // Calculate available height for messages (total rows - header - input - footer)
        // Header: ~2 lines, Input: 3 lines, Footer shortcuts: 1 line, Padding: 2 lines
        const terminalHeight = stdout?.rows || 24;
        const viewportHeight = Math.max(5, terminalHeight - 8);

        // Calculate total content height in lines
        const contentWidth = width > 4 ? width - 4 : width;
        const messageHeights = useMemo(() => {
            return messages.map((msg) => calculateMessageLines(msg, contentWidth));
        }, [messages, contentWidth]);

        const totalContentHeight = useMemo(() => {
            return messageHeights.reduce((sum, h) => sum + h, 0);
        }, [messageHeights]);

        const maxScrollOffset = Math.max(0, totalContentHeight - viewportHeight);

        // Auto-scroll to bottom when new messages arrive or streaming
        // This pattern is intentional for chat auto-scroll behavior
        useEffect(() => {
            if (shouldStickToBottom && maxScrollOffset !== scrollOffset) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setScrollOffset(maxScrollOffset);
            }
        }, [messages.length, maxScrollOffset, shouldStickToBottom, scrollOffset, streamingText]);

        // Calculate which messages to show based on scroll offset
        const visibleMessages = useMemo(() => {
            if (messages.length === 0) return [];

            let currentLine = 0;
            let startIdx = 0;
            let endIdx = messages.length;
            let skipLines = 0;

            // Find start message based on scroll offset
            for (let i = 0; i < messages.length; i++) {
                const msgHeight = messageHeights[i];
                if (currentLine + msgHeight > scrollOffset) {
                    startIdx = i;
                    skipLines = scrollOffset - currentLine;
                    break;
                }
                currentLine += msgHeight;
            }

            // Find end message based on viewport
            currentLine = 0;
            for (let i = startIdx; i < messages.length; i++) {
                currentLine += messageHeights[i];
                if (currentLine >= viewportHeight + skipLines) {
                    endIdx = i + 1;
                    break;
                }
            }

            return messages.slice(startIdx, endIdx);
        }, [messages, messageHeights, scrollOffset, viewportHeight]);

        useImperativeHandle(
            ref,
            () => ({
                scrollUp: () => {
                    setScrollOffset((prev) => {
                        const newOffset = Math.max(0, prev - 1);
                        setShouldStickToBottom(false);
                        return newOffset;
                    });
                },
                scrollDown: () => {
                    setScrollOffset((prev) => {
                        const newOffset = Math.min(maxScrollOffset, prev + 1);
                        if (newOffset >= maxScrollOffset) setShouldStickToBottom(true);
                        return newOffset;
                    });
                },
                pageUp: () => {
                    setScrollOffset((prev) => {
                        const newOffset = Math.max(0, prev - viewportHeight);
                        setShouldStickToBottom(false);
                        return newOffset;
                    });
                },
                pageDown: () => {
                    setScrollOffset((prev) => {
                        const newOffset = Math.min(maxScrollOffset, prev + viewportHeight);
                        if (newOffset >= maxScrollOffset) setShouldStickToBottom(true);
                        return newOffset;
                    });
                },
            }),
            [maxScrollOffset, viewportHeight],
        );

        return (
            <Box
                flexDirection="column"
                padding={1}
                flexGrow={1}
                width={width}
                height={viewportHeight + 2} // +2 for padding
            >
                <Box flexDirection="column" width={contentWidth} flexGrow={1}>
                    {visibleMessages.map((msg, index) => (
                        <MessageItem
                            key={`${msg.timestamp}-${index}`}
                            message={msg}
                            width={contentWidth}
                        />
                    ))}
                    {/* Show streaming message when processing and there's streaming text */}
                    {isProcessing && streamingText && (
                        <StreamingMessage text={streamingText} width={contentWidth} />
                    )}
                </Box>
                <Box justifyContent="flex-end" width={contentWidth}>
                    <Text color="gray">
                        [{scrollOffset}/{maxScrollOffset}] {shouldStickToBottom ? '▼' : '↕'}
                    </Text>
                </Box>
            </Box>
        );
    },
);

MessageList.displayName = 'MessageList';
