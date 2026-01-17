import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    forwardRef,
    useImperativeHandle,
} from 'react';
import { Box, Text, measureElement } from 'ink';
import { createLogger } from '../../boot/lib/logger';

const log = createLogger('MessageList');

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
    index: number;
    width: number;
}

// Removed React.memo to ensure accurate re-renders
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

export const MessageList = forwardRef<MessageListHandle, { messages: Message[]; width: number }>(
    ({ messages, width }, ref) => {
        const [scrollTop, setScrollTop] = useState(0);
        const containerRef = useRef(null);
        const contentRef = useRef(null);
        const [metrics, setMetrics] = useState({ viewportHeight: 0, contentHeight: 0 });
        const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
        // Debug metrics
        // const { stdout } = useStdout();
        // const dimensions = { columns: stdout?.columns || 0, rows: stdout?.rows || 0 };

        const measure = useCallback(() => {
            if (containerRef.current && contentRef.current) {
                const viewport = measureElement(containerRef.current);
                const content = measureElement(contentRef.current);

                log.info('Measure', {
                    viewportH: viewport.height,
                    contentH: content.height,
                    scrollTop,
                    shouldStick: shouldStickToBottom,
                    msgCount: messages.length,
                    width,
                });

                setMetrics({
                    viewportHeight: viewport.height,
                    contentHeight: content.height,
                });

                if (shouldStickToBottom && content.height > 0) {
                    const maxScroll = Math.max(0, content.height - viewport.height);
                    setScrollTop(maxScroll);
                }
            }
        }, [scrollTop, shouldStickToBottom, messages.length, width]); // Removed scrollTop from dep to avoid re-measure loop

        // Measure on updates
        useEffect(() => {
            measure();
            const timer = setTimeout(measure, 50);
            return () => clearTimeout(timer);
        }, [messages, measure, width]);

        // Measure on resize handled by parent providing new width

        useImperativeHandle(ref, () => ({
            scrollUp: () => {
                setScrollTop((prev) => {
                    const newTop = Math.max(0, prev - 1);
                    setShouldStickToBottom(false);
                    return newTop;
                });
            },
            scrollDown: () => {
                setScrollTop((prev) => {
                    const maxScroll = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
                    const newTop = Math.min(maxScroll, prev + 1);
                    if (newTop >= maxScroll) setShouldStickToBottom(true);
                    return newTop;
                });
            },
            pageUp: () => {
                setScrollTop((prev) => {
                    const newTop = Math.max(0, prev - metrics.viewportHeight);
                    setShouldStickToBottom(false);
                    return newTop;
                });
            },
            pageDown: () => {
                setScrollTop((prev) => {
                    const maxScroll = Math.max(0, metrics.contentHeight - metrics.viewportHeight);
                    const newTop = Math.min(maxScroll, prev + metrics.viewportHeight);
                    if (newTop >= maxScroll) setShouldStickToBottom(true);
                    return newTop;
                });
            },
        }));

        // if (!messages || messages.length === 0) {
        //     return (
        //         <Box padding={1} flexGrow={1} width={width} flexDirection="column">
        //             <Text color="gray">No messages yet. Start chatting!</Text>
        //             <Text color="red">
        //                 Debug: H={dimensions.rows} W={dimensions.columns}
        //             </Text>
        //         </Box>
        //     );
        // }

        // Ensure we subtract padding (2) from width to avoid unmeasured wrapping
        const contentWidth = width > 2 ? width - 2 : width;

        return (
            <Box
                ref={containerRef}
                flexDirection="column"
                padding={1}
                flexGrow={1}
                overflowY="hidden"
                width={width}
            >
                {/* <Text color="yellow">
                    DEBUG: VP={metrics.viewportHeight} CT={metrics.contentHeight} SC={scrollTop}{' '}
                    Stick={shouldStickToBottom ? 'T' : 'F'}
                </Text> */}
                <Box
                    ref={contentRef}
                    flexDirection="column"
                    marginTop={-scrollTop}
                    overflow="visible"
                    width={contentWidth}
                >
                    {messages.map((msg, index) => (
                        <MessageItem
                            key={`${msg.timestamp}-${index}`}
                            message={msg}
                            index={index}
                            width={contentWidth}
                        />
                    ))}
                </Box>
            </Box>
        );
    },
);

MessageList.displayName = 'MessageList';
