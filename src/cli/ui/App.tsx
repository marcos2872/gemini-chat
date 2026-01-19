import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import { Input } from './Input';
import { useChat } from '../hooks/useChat';
import { useCommands } from '../hooks/useCommands';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { MessageListHandle } from './MessageList';
import { HistoryModal } from './HistoryModal';
import { OllamaConfigModal } from './OllamaConfigModal';
import { ProviderOption } from './ProviderSelector';
import { CHAT_MODES } from '../../shared/types';

export const App = () => {
    const { stdout } = useStdout();
    const [dimensions, setDimensions] = useState({
        columns: stdout?.columns || 80,
        rows: stdout?.rows || 24,
    });
    const [showHistory, setShowHistory] = useState(false);
    const [showOllamaConfig, setShowOllamaConfig] = useState(false);

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

    // 4. Modal Handlers
    const handleModelSelect = async (model: { name: string }) => {
        await handleCommand('model', [model.name]);
        chat.setMode(CHAT_MODES.CHAT);
        chat.setSelectionModels([]);
        chat.setStatus('Ready');
    };

    const handleModelCancel = () => {
        chat.setMode(CHAT_MODES.CHAT);
        chat.setSelectionModels([]);
        chat.setStatus('Ready');
    };

    const handleProviderSelect = async (providerOption: ProviderOption) => {
        await handleCommand('provider', [providerOption.name]);
        chat.setMode(CHAT_MODES.CHAT);
        chat.setStatus('Ready');
    };

    const handleProviderCancel = () => {
        chat.setMode(CHAT_MODES.CHAT);
        chat.setStatus('Ready');
    };

    // 5. Scroll Handling & Global Shortcuts
    const messageListRef = React.useRef<MessageListHandle>(null);

    useInput(async (_input, key) => {
        // Scroll keys
        if (messageListRef.current) {
            if (key.upArrow) messageListRef.current.scrollUp();
            if (key.downArrow) messageListRef.current.scrollDown();
            if (key.pageUp) messageListRef.current.pageUp();
            if (key.pageDown) messageListRef.current.pageDown();
        }

        // Global Shortcuts (Alt + Key)
        if (key.meta) {
            if (_input === 'm') {
                await handleCommand('models', []);
            }
            if (_input === 'p') {
                chat.setMode(CHAT_MODES.PROVIDER_SELECTOR);
            }
            if (_input === 'a') {
                if (chat.provider === 'ollama') {
                    setShowOllamaConfig(true);
                } else {
                    await handleCommand('auth', []);
                }
            }
            if (_input === 'c') {
                setShowHistory(true);
            }
            if (_input === 'n') {
                await handleCommand('new', []);
            }
            if (_input === 'l') {
                await handleCommand('logs', []);
            }
            if (_input === 'o') {
                await handleCommand('logout', []);
            }
            if (_input === 'q') {
                await handleCommand('exit', []);
            }
            if (_input === 'h') {
                await handleCommand('help', []);
            }
            if (_input === 't') {
                await chat.refreshMcpServers();
                chat.setMode(CHAT_MODES.MCP_MANAGER);
            }
            // Alt+X: Cancel current request
            if (_input === 'x') {
                if (chat.isProcessing) {
                    chat.cancelRequest();
                }
            }
        }
    });

    if (!chat.conversation) {
        return <Text color="yellow">{chat.status}</Text>;
    }

    if (showHistory) {
        return (
            <HistoryModal
                onClose={() => setShowHistory(false)}
                onSelect={(conv) => {
                    chat.loadConversation(conv);
                    setShowHistory(false);
                }}
            />
        );
    }

    if (showOllamaConfig) {
        return (
            <OllamaConfigModal
                onClose={() => {
                    setShowOllamaConfig(false);
                    // Force re-check status in case URL changed
                    chat.checkConnection();
                }}
            />
        );
    }

    return (
        <Box flexDirection="column" height={dimensions.rows} width={dimensions.columns}>
            <Box flexShrink={0}>
                <Header provider={chat.provider} model={chat.model} status={chat.status} />
            </Box>

            <Box flexGrow={1} flexDirection="column" overflow="hidden" minHeight={0}>
                <MainContent
                    chat={chat}
                    messageListRef={messageListRef}
                    dimensions={dimensions}
                    onModelSelect={handleModelSelect}
                    onModelCancel={handleModelCancel}
                    onProviderSelect={handleProviderSelect}
                    onProviderCancel={handleProviderCancel}
                />
            </Box>

            <Box flexDirection="column" flexShrink={0}>
                <Box borderStyle="single" borderColor="gray" height={3}>
                    <Input
                        onSubmit={onInputSubmit}
                        isActive={chat.mode === CHAT_MODES.CHAT && !chat.isProcessing}
                        placeholder={chat.isProcessing ? 'Thinking...' : 'Type a message or /help'}
                    />
                </Box>
                <Box paddingX={1}>
                    <Text color="gray">
                        {chat.isProcessing
                            ? '[Alt+X]-Cancel'
                            : `[Alt+M]-Model [Alt+P]-Provider [Alt+T]-Tools [Alt+A]-${chat.provider === 'ollama' ? 'Config' : 'Auth'} [Alt+N]-New [Alt+C]-Chats [Alt+H]-Help [Alt+Q]-Quit`}
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};
