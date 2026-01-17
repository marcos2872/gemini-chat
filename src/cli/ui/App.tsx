import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout, useInput } from 'ink';
import { MessageList, type MessageListHandle } from './MessageList';
import { Input } from './Input';
import { useChat } from '../hooks/useChat';
import { useCommands } from '../hooks/useCommands';
import { Header } from './Header';
import { ModelSelector } from './ModelSelector';
import { ProviderSelector, type ProviderOption } from './ProviderSelector';
import { HelpModal } from './HelpModal';
import { ApprovalModal } from './ApprovalModal';

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

    const handleProviderSelect = async (providerOption: ProviderOption) => {
        await handleCommand('provider', [providerOption.name]);
        chat.setMode('chat');
        chat.setStatus('Ready');
    };

    const handleProviderCancel = () => {
        chat.setMode('chat');
        chat.setStatus('Ready');
    };

    // 4. Scroll Handling & Global Shortcuts
    const messageListRef = React.useRef<MessageListHandle>(null);

    useInput(async (_input, key) => {
        // Scroll keys (always active if not in modal, or handle conflict?)
        // Actually, let MessageList handle scroll via ref
        if (messageListRef.current) {
            if (key.upArrow) messageListRef.current.scrollUp();
            if (key.downArrow) messageListRef.current.scrollDown();
            if (key.pageUp) messageListRef.current.pageUp();
            if (key.pageDown) messageListRef.current.pageDown();
        }

        // Global Shortcuts (Alt + Key)
        if (key.meta) {
            if (_input === 'm') {
                // Alt + M: Models
                await handleCommand('models', []);
                // Note: handleCommand('models') sets mode to 'model-selector' in useCommands logic?
                // Assuming executeCommand handles the backend call and UI state update.
                // Actually, useCommands calls executeCommand which works.
                // But wait, 'models' command just lists models. We need to trigger the UI selector.
                // Let's manually trigger the selector for now or ensure command handles it.
                // Checking logic: `models` command usually lists. If we want UI, we should verify.
                // For now, let's assume `handleCommand('models')` populates selectionModels and sets mode.
                // If not, we might need to manually call chat.setMode.
                // Let's manually invoke equivalent of /models which should setup the UI.
                await handleCommand('models', []);
            }
            if (_input === 'p') {
                // Alt + P: Provider
                chat.setMode('provider-selector');
            }
            if (_input === 'a') {
                // Alt + A: Auth
                await handleCommand('auth', []);
            }
            if (_input === 'c') {
                // Alt + C: Clear
                await handleCommand('clear', []);
            }
            if (_input === 'l') {
                // Alt + L: Logs
                await handleCommand('logs', []);
            }
            if (_input === 'o') {
                // Alt + O: Logout
                await handleCommand('logout', []);
            }
            if (_input === 'q') {
                // Alt + Q: Exit
                await handleCommand('exit', []);
            }
            if (_input === 'h') {
                // Alt + H: Help
                await handleCommand('help', []);
            }
        }
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
                {chat.mode === 'provider-selector' ? (
                    <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                        <ProviderSelector
                            currentProvider={chat.provider}
                            onSelect={handleProviderSelect}
                            onCancel={handleProviderCancel}
                        />
                    </Box>
                ) : chat.mode === 'model-selector' ? (
                    <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                        <ModelSelector
                            models={chat.selectionModels}
                            onSelect={handleModelSelect}
                            onCancel={handleModelCancel}
                        />
                    </Box>
                ) : chat.approvalRequest ? (
                    <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                        <ApprovalModal
                            toolName={chat.approvalRequest.toolName}
                            args={chat.approvalRequest.args}
                            onApprove={chat.handleApprove}
                            onReject={chat.handleReject}
                        />
                    </Box>
                ) : chat.mode === 'help' ? (
                    <Box padding={2} flexGrow={1} justifyContent="center" alignItems="center">
                        <HelpModal onClose={() => chat.setMode('chat')} />
                    </Box>
                ) : (
                    <MessageList
                        ref={messageListRef}
                        messages={chat.conversation.messages}
                        width={dimensions.columns}
                    />
                )}
            </Box>

            <Box flexDirection="column" flexShrink={0}>
                <Box borderStyle="single" borderColor="gray" height={3}>
                    <Input
                        onSubmit={onInputSubmit}
                        isActive={chat.mode === 'chat' && !chat.isProcessing}
                        placeholder={chat.isProcessing ? 'Thinking...' : 'Type a message or /help'}
                    />
                </Box>
                <Box paddingX={1}>
                    <Text color="gray">
                        [Alt+M]-Model [Alt+P]-Provider [Alt+A]-Auth [Alt+C]-Clear [Alt+H]-Help
                        [Alt+Q]-Quit
                    </Text>
                </Box>
            </Box>
        </Box>
    );
};
