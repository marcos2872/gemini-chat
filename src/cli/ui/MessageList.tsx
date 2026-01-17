import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, Text, useInput, measureElement, useStdout } from 'ink';

interface Message {
    role: string;
    content: string;
    timestamp: string;
    provider?: string;
}

interface MessageItemProps {
    message: Message;
    index: number;
}

// Memoized message item to prevent unnecessary re-renders
const MessageItem = React.memo<MessageItemProps>(({ message }) => {
    const isUser = message.role === 'user';
    const senderName = isUser
        ? 'You'
        : message.provider
          ? message.provider.charAt(0).toUpperCase() + message.provider.slice(1)
          : 'Gemini';

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Text color={isUser ? 'blue' : 'green'} bold>
                {senderName}:
            </Text>
            <Text>{message.content}</Text>
        </Box>
    );
});

MessageItem.displayName = 'MessageItem';

export const MessageList = ({ messages }: { messages: Message[] }) => {
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = useRef(null);
    const contentRef = useRef(null);
    const [metrics, setMetrics] = useState({ viewportHeight: 0, contentHeight: 0 });
    const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
    const { stdout } = useStdout();

    const measure = useCallback(() => {
        if (containerRef.current && contentRef.current) {
            const viewport = measureElement(containerRef.current);
            const content = measureElement(contentRef.current);
            setMetrics({
                viewportHeight: viewport.height,
                contentHeight: content.height,
            });

            if (shouldStickToBottom && content.height > 0) {
                const maxScroll = Math.max(0, content.height - viewport.height);
                setScrollTop(maxScroll);
            }
        }
    }, [shouldStickToBottom]);

    // Measure content and viewport
    useEffect(() => {
        // Measure immediately and after a short delay to ensure layout is computed
        measure();
        const timer = setTimeout(measure, 50);
        return () => clearTimeout(timer);
    }, [messages, measure]);

    // Re-measure on resize
    useEffect(() => {
        const onResize = () => {
            measure();
        };
        stdout?.on('resize', onResize);
        return () => {
            stdout?.off('resize', onResize);
        };
    }, [stdout, measure]);

    // Handle scroll keys
    useInput((_input, key) => {
        const maxScroll = Math.max(0, metrics.contentHeight - metrics.viewportHeight);

        if (key.pageUp) {
            setScrollTop((prev) => {
                const newTop = Math.max(0, prev - metrics.viewportHeight);
                setShouldStickToBottom(false);
                return newTop;
            });
        }

        if (key.pageDown) {
            setScrollTop((prev) => {
                const newTop = Math.min(maxScroll, prev + metrics.viewportHeight);
                // If we hit the bottom, re-enable stickiness
                if (newTop >= maxScroll) setShouldStickToBottom(true);
                return newTop;
            });
        }

        if (key.upArrow) {
            setScrollTop((prev) => {
                const newTop = Math.max(0, prev - 1);
                setShouldStickToBottom(false);
                return newTop;
            });
        }

        if (key.downArrow) {
            setScrollTop((prev) => {
                const newTop = Math.min(maxScroll, prev + 1);
                if (newTop >= maxScroll) setShouldStickToBottom(true);
                return newTop;
            });
        }
    });

    if (!messages || messages.length === 0) {
        return (
            <Box padding={1} flexGrow={1}>
                <Text color="gray">No messages yet. Start chatting!</Text>
            </Box>
        );
    }

    return (
        <Box ref={containerRef} flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
            <Box ref={contentRef} flexDirection="column" marginTop={-scrollTop}>
                {messages.map((msg, index) => (
                    <MessageItem key={`${msg.timestamp}-${index}`} message={msg} index={index} />
                ))}
            </Box>
        </Box>
    );
};
