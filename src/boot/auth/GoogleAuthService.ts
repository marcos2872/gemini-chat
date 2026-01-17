import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import open from 'open';
import { logger } from '../lib/logger';
import { ConfigPersistence } from '../lib/config-persistence';
import { SETTINGS_KEY } from '../../cli/hooks/useChat';

const log = logger.auth;
const CONFIG_KEY = 'google-auth';

// Credenciais do cliente OAuth (Idealmente viriam de variáveis de ambiente seguras ou build time)
const CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
];

export class GoogleAuthService {
    private client: OAuth2Client;

    constructor() {
        this.client = new OAuth2Client(
            CLIENT_ID,
            CLIENT_SECRET,
            'http://localhost:3003/oauth2callback',
        );
    }

    /**
     * Obtém um cliente autenticado.
     * @param autoLogin Se true, inicia fluxo de login se não houver token. Se false, lança erro.
     */
    async getAuthenticatedClient(autoLogin = false): Promise<OAuth2Client> {
        // 1. Tenta carregar tokens salvos
        if (await this.loadSavedTokens()) {
            return this.client;
        }

        // 2. Se não tiver tokens, inicia novo login SE solicitado
        if (autoLogin) {
            await this.startNewLoginFlow();
            return this.client;
        }

        throw new Error('Usuário não autenticado. Faça login.');
    }

    async signIn() {
        return this.getAuthenticatedClient(true);
    }

    async signOut() {
        try {
            await ConfigPersistence.delete(CONFIG_KEY);
            await ConfigPersistence.delete(SETTINGS_KEY);
            this.client.setCredentials({});
        } catch (e) {
            log.error('Sign out error', { error: e });
        }
    }

    /**
     * Tenta carregar e validar tokens salvos no disco
     */
    private async loadSavedTokens(): Promise<boolean> {
        try {
            const tokens = await ConfigPersistence.load<any>(CONFIG_KEY);
            if (!tokens) return false;

            this.client.setCredentials(tokens);
            return true;
        } catch (error) {
            log.error('Failed to load saved tokens', { error });
            return false;
        }
    }

    /**
     * Inicia o fluxo de login com servidor local
     */
    private async startNewLoginFlow(): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = http.createServer(async (req, res) => {
                try {
                    if (req.url?.startsWith('/oauth2callback')) {
                        const qs = new url.URL(req.url, 'http://localhost:3003').searchParams;
                        const code = qs.get('code');

                        if (code) {
                            res.end('Authentication successful! You can close this window.');
                            server.close();

                            // Troca código por tokens
                            const { tokens } = await this.client.getToken(code);
                            this.client.setCredentials(tokens);
                            await ConfigPersistence.save(CONFIG_KEY, tokens);
                            log.info('Login successful');
                            resolve();
                        } else {
                            res.end('Authentication failed: No code found.');
                            server.close();
                            reject(new Error('No code found in callback'));
                        }
                    }
                } catch (e) {
                    res.end('Authentication failed.');
                    server.close();
                    reject(e);
                }
            });

            server.listen(3003, async () => {
                const authorizeUrl = this.client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                });

                log.info('Opening browser for login');
                await open(authorizeUrl);
            });
        });
    }

    async getAccessToken() {
        return this.client.getAccessToken();
    }
}
