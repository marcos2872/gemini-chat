import { useState, useEffect, useCallback } from 'react';

interface ApprovalRequest {
    toolName: string;
    args: any;
}

interface UseApprovalReturn {
    approvalRequest: ApprovalRequest | null;
    approve: () => void;
    deny: () => void;
}

export function useApproval(): UseApprovalReturn {
    const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);

    useEffect(() => {
        const cleanup = window.electronAPI.onApprovalRequest((data) => {
            setApprovalRequest(data);
        });
        return cleanup;
    }, []);

    const approve = useCallback(() => {
        window.electronAPI.sendApprovalResponse(true);
        setApprovalRequest(null);
    }, []);

    const deny = useCallback(() => {
        window.electronAPI.sendApprovalResponse(false);
        setApprovalRequest(null);
    }, []);

    return {
        approvalRequest,
        approve,
        deny,
    };
}
