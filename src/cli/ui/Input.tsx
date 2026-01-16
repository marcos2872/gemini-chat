import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

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

    useInput((input: string, key: any) => {
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

        setValue((prev) => prev + input);
    });

    const cursor = isActive && cursorVisible ? '█' : ' ';

    if (!isActive) {
        return (
            <Box>
                <Text color="gray">
                    {'> '}
                    {value || placeholder || 'Thinking...'}
                </Text>
            </Box>
        );
    }

    return (
        <Box>
            <Text color="green">{'> '}</Text>
            <Text>{value}</Text>
            <Text color="green">{cursor}</Text>
            {value.length === 0 && placeholder && <Text color="gray"> {placeholder}</Text>}
        </Box>
    );
};
