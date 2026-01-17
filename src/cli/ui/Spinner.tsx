import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface SpinnerProps {
    color?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ color = 'cyan' }) => {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setFrame((prev) => (prev + 1) % SPINNERS.length);
        }, 80);

        return () => clearInterval(timer);
    }, []);

    return <Text color={color}>{SPINNERS[frame]}</Text>;
};
