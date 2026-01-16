import { useState, useEffect } from 'react';
import { storage, mcpService, gemini, copilot } from '../services';

export type Provider = 'gemini' | 'copilot';

export const useChat = () => {
    // State
    const [conversation, setConversation] = useState<any>(null);
    const [status, setStatus] = useState('Initializing...');
    const [isProcessing, setIsProcessing] = useState(false);
    const [, setTick] = useState(0);

    const [provider, setProvider] = useState<Provider>('gemini');
    const [model, setModel] = useState<string>('gemini-2.5-flash');

    // Initialization
    useEffect(() => {
        const init = async () => {
            try {
                await gemini.initialize();
                await mcpService.init();
                const newConv = storage.createConversation();
                (newConv as any).model = model;
                setConversation(newConv);

                if (provider === 'gemini' && !gemini.isConfigured()) {
                    setStatus('Not Authenticated');
                } else if (provider === 'copilot' && !copilot.isConfigured()) {
                    setStatus('Not Authenticated');
                } else {
                    setStatus('Ready');
                }
            } catch (err: any) {
                setStatus(`Error: ${err.message}`);
            }
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Helpers
    const addSystemMessage = (text: string) => {
        if (!conversation) return;
        const sysMsg = { role: 'system', content: text, timestamp: new Date().toISOString() };
        setConversation((prev: any) => ({
            ...prev,
            messages: [...(prev.messages || []), sysMsg],
        }));
    };

    const forceUpdate = () => setTick((t) => t + 1);

    // Chat Handler
    const handleSubmit = async (text: string) => {
        if (!text.trim() || isProcessing) return;

        const currentConv = conversation;
        const userMsg = {
            role: 'user',
            content: text,
            timestamp: new Date().toISOString(),
        };
        const updatedConv = {
            ...currentConv,
            messages: [...(currentConv.messages || []), userMsg],
        };
        setConversation(updatedConv);
        setIsProcessing(true);
        setStatus('Thinking...');

        try {
            let responseText = '';

            if (provider === 'gemini') {
                responseText = await gemini.sendPrompt(text, mcpService);
            } else {
                if (!copilot.isConfigured()) {
                    throw new Error('Copilot not authenticated. Run /auth');
                }
                responseText = await copilot.sendPrompt(text, mcpService, async () => true);
            }

            const aiMsg = {
                role: 'model',
                content: responseText,
                timestamp: new Date().toISOString(),
            };
            const finalConv = {
                ...updatedConv,
                messages: [...updatedConv.messages, aiMsg],
            };

            setConversation(finalConv);
            await storage.saveConversation(finalConv);
            setStatus('Ready');
        } catch (err: any) {
            setStatus(`Error: ${err.message}`);
            addSystemMessage(`Error: ${err.message}`);
            setIsProcessing(false);
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        conversation,
        setConversation,
        status,
        setStatus,
        isProcessing,
        setIsProcessing,
        provider,
        setProvider,
        model,
        setModel,
        handleSubmit,
        addSystemMessage,
        forceUpdate,
    };
};
