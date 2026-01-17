import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import { MessageList, type MessageListHandle } from './MessageList';
import { Input } from './Input';
import { useChat } from '../hooks/useChat';
import { useCommands } from '../hooks/useCommands';
import { Header } from './Header';
import { ModelSelector } from './ModelSelector';

export const App = () => {
    const { stdout } = useStdout();
    const [dimensions, setDimensions] = useState({
        columns: stdout?.columns || 80,
        rows: stdout?.rows || 24,
    });

    useEffect(() => {
        const onResize = () => {
            setDimensions({
                columns: stdout?.columns || 80,
                rows: stdout?.rows || 24,
            });
        };
        stdout?.on('resize', onResize);
        return () => {
            stdout?.off('resize', onResize);
        };
    }, [stdout]);

    // 1. Chat State & Logic
    const chat = useChat();

    // 2. Command Handling
    const { handleCommand } = useCommands(chat);

    // 3. Input Handler
    const onInputSubmit = async (text: string) => {
        if (text.startsWith('/')) {
            const parts = text.slice(1).split(' ');
            const cmd = parts[0].toLowerCase();
            const args = parts.slice(1);
            await handleCommand(cmd, args);
        } else {
            await chat.handleSubmit(text);
        }
    };

    const handleModelSelect = async (model: any) => {
        await handleCommand('model', [model.name]);
        chat.setMode('chat');
        chat.setSelectionModels([]);
        chat.setStatus('Ready');
    };

    const handleModelCancel = () => {
        chat.setMode('chat');
        chat.setSelectionModels([]);
        chat.setStatus('Ready');
    };

    // 4. Scroll Handling
    const messageListRef = React.useRef<MessageListHandle>(null);

    useInput((_input, key) => {
        if (!messageListRef.current) return;

        if (key.upArrow) messageListRef.current.scrollUp();
        if (key.downArrow) messageListRef.current.scrollDown();
        if (key.pageUp) messageListRef.current.pageUp();
        if (key.pageDown) messageListRef.current.pageDown();
    });

    if (!chat.conversation) {
        return <Text color="yellow">{chat.status}</Text>;
    }

    return (
        <Box flexDirection="column" height={dimensions.rows} width={dimensions.columns}>
            <Box flexShrink={0}>
                <Header provider={chat.provider} model={chat.model} status={chat.status} />
            </Box>

            <Box flexGrow={1} flexDirection="column" overflow="hidden" minHeight={0}>
                <MessageList
                    ref={messageListRef}
                    messages={chat.conversation.messages}
                    width={dimensions.columns}
                />
            </Box>

            {chat.mode === 'model-selector' && (
                <Box paddingX={2} flexShrink={0}>
                    <ModelSelector
                        models={chat.selectionModels}
                        onSelect={handleModelSelect}
                        onCancel={handleModelCancel}
                    />
                </Box>
            )}

            <Box borderStyle="single" borderColor="gray" height={3} flexShrink={0}>
                <Input
                    onSubmit={onInputSubmit}
                    isActive={chat.mode === 'chat' && !chat.isProcessing}
                    placeholder={chat.isProcessing ? 'Thinking...' : 'Type a message or /help'}
                />
            </Box>
        </Box>
    );
};
