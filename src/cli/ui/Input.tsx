import { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, type Key } from 'ink';

import { Spinner } from './Spinner';

interface InputProps {
    onSubmit: (value: string) => void;
    isActive: boolean;
    placeholder?: string;
}

export const Input = ({ onSubmit, isActive, placeholder }: InputProps) => {
    const [value, setValue] = useState('');
    const [cursorPos, setCursorPos] = useState(0);
    const [cursorVisible, setCursorVisible] = useState(true);

    // Blinking cursor effect
    useEffect(() => {
        if (!isActive) return;
        const timer = setInterval(() => {
            setCursorVisible((v) => !v);
        }, 500);
        return () => clearInterval(timer);
    }, [isActive]);

    useInput((input: string, key: Key) => {
        if (!isActive) return;

        if (key.return) {
            if (value.trim()) {
                onSubmit(value);
                setValue('');
                setCursorPos(0);
            }
            return;
        }

        if (key.leftArrow) {
            setCursorPos((prev) => Math.max(0, prev - 1));
            return;
        }

        if (key.rightArrow) {
            setCursorPos((prev) => Math.min(value.length, prev + 1));
            return;
        }

        if (key.delete || key.backspace) {
            if (cursorPos > 0) {
                setValue((prev) => prev.slice(0, cursorPos - 1) + prev.slice(cursorPos));
                setCursorPos((prev) => prev - 1);
            }
            return;
        }

        // Explicitly ignore scrolling keys to allow MessageList to handle them
        if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
            return;
        }

        // Ignore meta keys (Alt+...) to prevent them from being typed
        if (key.meta) {
            return;
        }

        setValue((prev) => prev.slice(0, cursorPos) + input + prev.slice(cursorPos));
        setCursorPos((prev) => prev + input.length);
    });

    // Memoize placeholder display to prevent unnecessary re-renders
    const showPlaceholder = useMemo(
        () => value.length === 0 && placeholder,
        [value.length, placeholder],
    );

    if (!isActive) {
        return (
            <Box>
                <Text color="gray">
                    {'> '}
                    <Spinner color="gray" /> {value || placeholder || 'Thinking...'}
                </Text>
            </Box>
        );
    }

    const preCursor = value.slice(0, cursorPos);
    const cursorChar = cursorPos < value.length ? value[cursorPos] : ' ';
    const postCursor = value.slice(cursorPos + 1);

    return (
        <Box>
            <Text color="green">{'> '}</Text>
            <Text>{preCursor}</Text>
            <Text color="green" inverse={cursorVisible}>
                {cursorChar}
            </Text>
            <Text>{postCursor}</Text>
            {showPlaceholder && <Text color="gray"> {placeholder}</Text>}
        </Box>
    );
};
