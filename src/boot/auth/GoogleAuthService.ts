import { OAuth2Client } from 'google-auth-library';
import http from 'http';
import url from 'url';
import open from 'open';
import fs from 'fs';
import path from 'path';
import * as os from 'os';
// import { app } from 'electron'; // Removed to support CLI
import { logger } from '../lib/logger';

const log = logger.auth;

// Credenciais do cliente OAuth (Idealmente viriam de variáveis de ambiente seguras ou build time)
// Estes são os mesmos do guia para Desktop
const CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
// OAuth Secret value used to initiate OAuth2Client class.
// Note: It's ok to save this in git because this is an installed application
// as described here: https://developers.google.com/identity/protocols/oauth2#installed
// "The process results in a client ID and, in some cases, a client secret,
// which you embed in the source code of your application. (In this context,
// the client secret is obviously not treated as a secret.)"
const CLIENT_SECRET = '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';
const SCOPES = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    // "https://www.googleapis.com/auth/generative-language",
];

export class GoogleAuthService {
    private client: OAuth2Client;
    private tokenPath: string;

    constructor() {
        this.client = new OAuth2Client(
            CLIENT_ID,
            CLIENT_SECRET,
            'http://localhost:3003/oauth2callback',
        );

        // Determine storage path based on environment
        const userDataPath = path.join(os.homedir(), '.gemini-desktop');

        // Ensure directory exists
        if (!fs.existsSync(userDataPath)) {
            fs.mkdirSync(userDataPath, { recursive: true });
        }

        this.tokenPath = path.join(userDataPath, 'google-tokens.json');
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
            if (fs.existsSync(this.tokenPath)) fs.unlinkSync(this.tokenPath);
            this.client.setCredentials({});
        } catch (e) {
            log.error('Sign out error', { error: e });
        }
    }

    isArgsConfigured() {
        // Helper to check if we have token file
        return fs.existsSync(this.tokenPath);
    }

    /**
     * Tenta carregar e validar tokens salvos no disco
     */
    private async loadSavedTokens(): Promise<boolean> {
        if (!fs.existsSync(this.tokenPath)) return false;

        try {
            const tokens = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
            this.client.setCredentials(tokens);

            // Verifica se o refresh token funciona tentando obter headers (ou validando expiração)
            // O google-auth-library faz refresh automático se tiver refresh_token
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
                            this.saveTokens(tokens);
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

    private saveTokens(tokens: any) {
        try {
            fs.writeFileSync(this.tokenPath, JSON.stringify(tokens));
        } catch (error) {
            log.error('Failed to save tokens', { error });
        }
    }

    async getAccessToken() {
        return this.client.getAccessToken();
    }
}
