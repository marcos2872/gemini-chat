import { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { configService } from '../services';

interface OllamaConfigModalProps {
    onClose: () => void;
}

export const OllamaConfigModal = ({ onClose }: OllamaConfigModalProps) => {
    const [url, setUrl] = useState('');
    const [cursorPos, setCursorPos] = useState(0);
    const [loading, setLoading] = useState(true);
    const [cursorVisible, setCursorVisible] = useState(true);

    useEffect(() => {
        const loadConfig = async () => {
            const config = await configService.getOllamaConfig();
            setUrl(config.baseUrl);
            setCursorPos(config.baseUrl.length);
            setLoading(false);
        };
        loadConfig();
    }, []);

    // Blinking cursor
    useEffect(() => {
        const timer = setInterval(() => {
            setCursorVisible((v) => !v);
        }, 500);
        return () => clearInterval(timer);
    }, []);

    useInput(async (input, key) => {
        if (loading) return;

        if (key.escape) {
            onClose();
            return;
        }

        if (key.return) {
            try {
                await configService.setOllamaUrl(url);
                onClose();
            } catch {
                // Should show error feedback
            }
            return;
        }

        if (key.leftArrow) {
            setCursorPos((prev) => Math.max(0, prev - 1));
            return;
        }

        if (key.rightArrow) {
            setCursorPos((prev) => Math.min(url.length, prev + 1));
            return;
        }

        if (key.delete || key.backspace) {
            if (cursorPos > 0) {
                setUrl((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
                setCursorPos((prev) => prev - 1);
            }
            return;
        }

        // Ignore other control keys
        if (key.upArrow || key.downArrow || key.meta || key.ctrl) {
            return;
        }

        // Insert at cursor position
        setUrl((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
        setCursorPos((prev) => prev + input.length);
    });

    if (loading) {
        return (
            <Box
                flexDirection="column"
                padding={1}
                borderColor="yellow"
                borderStyle="single"
                minWidth={50}
            >
                <Text>Loading config...</Text>
            </Box>
        );
    }

    const preCursor = url.slice(0, cursorPos);
    const cursorChar = cursorPos < url.length ? url[cursorPos] : ' ';
    const postCursor = url.slice(cursorPos + 1);

    return (
        <Box
            flexDirection="column"
            padding={1}
            borderColor="yellow"
            borderStyle="single"
            minWidth={50}
        >
            <Box marginBottom={1} justifyContent="center">
                <Text bold color="yellow">
                    Ollama Configuration
                </Text>
            </Box>

            <Box flexDirection="column">
                <Text>Enter Ollama Base URL:</Text>
                <Box borderStyle="single" borderColor="gray" marginY={1}>
                    <Text>{preCursor}</Text>
                    <Text color="green" inverse={cursorVisible}>
                        {cursorChar}
                    </Text>
                    <Text>{postCursor}</Text>
                </Box>
            </Box>

            <Box marginTop={1} justifyContent="center">
                <Text color="gray">Enter Save | Esc Cancel</Text>
            </Box>
        </Box>
    );
};
