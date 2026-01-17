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
            }
            return;
        }

        if (key.delete) {
            setValue((prev) => prev.slice(0, -1));
            return;
        }

        if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
            return;
        }

        setValue((prev) => prev + input);
    });

    // Memoize cursor to prevent unnecessary re-renders
    const cursor = useMemo(
        () => (isActive && cursorVisible ? '█' : ' '),
        [isActive, cursorVisible],
    );

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

    return (
        <Box>
            <Text color="green">{'> '}</Text>
            <Text>{value}</Text>
            <Text color="green">{cursor}</Text>
            {showPlaceholder && <Text color="gray"> {placeholder}</Text>}
        </Box>
    );
};
