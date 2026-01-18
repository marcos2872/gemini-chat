import { createLogger } from '../../lib/logger';

const log = createLogger('CopilotResponseValidator');

export class CopilotResponseValidator {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateResponse(response: Response, data: any) {
        if (!response.ok) {
            let errorMsg = `HTTP Error ${response.status}`;
            if (data?.error) {
                errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            }
            log.error('Chat API Error', { status: response.status, error: errorMsg });

            if (response.status === 401)
                throw new Error('🔒 Sessão inválida (401). Faça login novamente com /auth.');
            if (response.status === 403)
                throw new Error('🚫 Acesso negado (403). Verifique suas permissões no GitHub.');
            if (response.status === 429)
                throw new Error('⏳ Muitas requisições (429). Aguarde um momento.');

            throw new Error(`Erro na API (${response.status}): ${errorMsg}`);
        }

        if (!data) {
            log.warn('Response data is empty');
            throw new Error('No content in response');
        }

        if (!data.choices || data.choices.length === 0) {
            log.warn('Response choices array is empty');
            throw new Error('No content in response');
        }

        return data.choices[0].message;
    }
}

export const responseValidator = new CopilotResponseValidator();
