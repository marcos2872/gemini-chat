import { OAuth2Client } from 'google-auth-library';
import { logger } from '../../lib/logger';

const log = logger.gemini;

const ENDPOINT = 'https://cloudcode-pa.googleapis.com/v1internal';

interface LoadResponse {
    currentTier?: { id: string };
    cloudaicompanionProject?: string;
}

interface OnboardResponse {
    done: boolean;
    name?: string;
    response?: { cloudaicompanionProject?: { id: string } };
}

export class GeminiHandshakeService {
    async performHandshake(client: OAuth2Client, existingProjectId?: string): Promise<string> {
        if (!client) throw new Error('Not authenticated');
        if (existingProjectId) return existingProjectId;

        log.debug('Performing handshake...');
        const userProjectId = undefined;
        const loadReq = {
            cloudaicompanionProject: userProjectId,
            metadata: { ideType: 'IDE_UNSPECIFIED', pluginType: 'GEMINI' },
        };

        const loadRes = await this.postRequest<LoadResponse>(client, 'loadCodeAssist', loadReq);

        if (loadRes.cloudaicompanionProject) {
            return loadRes.cloudaicompanionProject;
        }

        const tierId = loadRes.currentTier?.id || 'FREE';
        const onboardReq = {
            tierId: tierId,
            cloudaicompanionProject: tierId === 'FREE' ? undefined : userProjectId,
            metadata: { ideType: 'IDE_UNSPECIFIED', pluginType: 'GEMINI' },
        };

        let lro = await this.postRequest<OnboardResponse>(client, 'onboardUser', onboardReq);

        while (!lro.done && lro.name) {
            log.debug('Waiting for onboarding...');
            await new Promise((r) => setTimeout(r, 2000));
            const opRes = await client.request({
                url: `${ENDPOINT}/${lro.name}`,
                method: 'GET',
            });
            lro = opRes.data as OnboardResponse;
        }

        const finalProjectId = lro.response?.cloudaicompanionProject?.id;
        if (!finalProjectId && tierId !== 'FREE' && userProjectId) {
            return userProjectId!;
        }
        if (!finalProjectId) throw new Error('Failed to obtain Project ID.');

        return finalProjectId;
    }

    private async postRequest<T>(client: OAuth2Client, method: string, body: any): Promise<T> {
        const res = await client.request({
            url: `${ENDPOINT}:${method}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return res.data as T;
    }
}
