import React, { useState } from 'react';

interface CollapsibleLogProps {
    content: string;
}

/**
 * Collapsible log display for system messages.
 * Shows title with expand/collapse functionality.
 */
export const CollapsibleLog: React.FC<CollapsibleLogProps> = ({ content }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const title = content.split('\n')[0];
    const details = content.substring(title.length);

    return (
        <div style={{ textAlign: 'left', margin: '0.5rem 0' }}>
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    cursor: 'pointer',
                    color: title.startsWith('✅') ? '#4CAF50' : '#f44336'
                }}
            >
                {isExpanded ? '▼' : '▶'} {title}
            </div>
            {isExpanded && (
                <pre style={{
                    backgroundColor: '#1E1E1E',
                    padding: '0.5rem',
                    marginTop: '0.5rem'
                }}>
                    {details}
                </pre>
            )}
        </div>
    );
};
