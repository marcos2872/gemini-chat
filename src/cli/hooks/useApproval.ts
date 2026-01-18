import { useState, useCallback } from 'react';
import { ToolApprovalRequest } from '../../shared/types';

export interface ApprovalState {
    approvalRequest: Omit<ToolApprovalRequest, 'resolve'> | null;
    handleApprove: () => void;
    handleReject: () => void;
    onApproval: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
}

export const useApproval = (): ApprovalState => {
    const [approvalRequest, setApprovalRequest] = useState<ToolApprovalRequest | null>(null);

    const handleApprove = useCallback(() => {
        if (approvalRequest) {
            approvalRequest.resolve(true);
            setApprovalRequest(null);
        }
    }, [approvalRequest]);

    const handleReject = useCallback(() => {
        if (approvalRequest) {
            approvalRequest.resolve(false);
            setApprovalRequest(null);
        }
    }, [approvalRequest]);

    // Callback passed to providers - creates a Promise that resolves when user approves/rejects
    const onApproval = useCallback(
        async (toolName: string, args: Record<string, unknown>): Promise<boolean> => {
            return new Promise((resolve) => {
                setApprovalRequest({ toolName, args, resolve });
            });
        },
        [],
    );

    return {
        approvalRequest,
        handleApprove,
        handleReject,
        onApproval,
    };
};
