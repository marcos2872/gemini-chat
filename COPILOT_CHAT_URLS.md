# Integração GitHub Copilot (Gemini Desktop)

Este documento descreve a implementação do protocolo do GitHub Copilot / Copilot Chat neste projeto Electron (`gemini-chat`).

---

## 🔐 Fluxo de Autenticação e Tokens

A integração funciona em duas etapas principais de autenticação:

### 1. Device Flow (OAuth)

Obtenção do token de usuário do GitHub (`oauth_token`).

- **Responsável**: `src/boot/copilot-auth-service.ts`
- **Client ID**: Usa o ID do VSCode (`Iv1.b507a08c87ecfe98`) definido em `.env`.
- **Escopos**: `read:user` (mínimo necessário).
- **Endpoint**: `https://github.com/login/device/code`

### 2. Token Exchange (Internal API)

Troca do `oauth_token` por um `api_token` de curta duração e endpoints dinâmicos.

- **Responsável**: `src/boot/copilot-client.ts` (Método `exchangeToken`)
- **URL**: `https://api.github.com/copilot_internal/v2/token`
- **Header**: `Authorization: token <OAUTH_TOKEN>`
- **Retorno**:
    - `token`: A chave API (`api_key`) usada para inferência.
    - `endpoints.api`: A URL base dinâmica (ex: `https://api.githubcopilot.com`).
    - `expires_at`: Timestamp de expiração (o client renova automaticamente).

---

## 📡 Endpoints e Consumo (API Dinâmica)

Após o _Token Exchange_, todas as chamadas usam a `endpoints.api` retornada.

### Listar Modelos

- **Método**: `GET <api_endpoint>/models`
- **Headers**:
    - `Authorization: Bearer <API_TOKEN>`
    - `Copilot-Integration-Id: vscode-chat`
- **Filtros Aplicados (`copilot-client.ts`)**:
    - `model_picker_enabled: true`
    - `capabilities.type: "chat"`
    - `policy.state: "enabled"`

### Chat Completions

- **Método**: `POST <api_endpoint>/chat/completions`
- **Headers**:
    - `Authorization: Bearer <API_TOKEN>`
    - `Copilot-Integration-Id: vscode-chat`
    - `Content-Type: application/json`
- **Ferramentas (MCP)**:
    - O `CopilotController` injeta ferramentas MCP convertidas para o formato OpenAI Function Calling.
    - Execução de ferramentas acontece no `CopilotController.ts` e retorna via mensagens de role `tool`.

---

## 📂 Estrutura de Código

| Funcionalidade   | Arquivo                                            | Descrição                                                              |
| :--------------- | :------------------------------------------------- | :--------------------------------------------------------------------- |
| **Auth Service** | `src/boot/copilot-auth-service.ts`                 | Realiza o Device Flow e Polling inicial.                               |
| **API Client**   | `src/boot/copilot-client.ts`                       | Mantém estado (Tokens/Histórico), realiza Exchange e chamadas de Chat. |
| **Controller**   | `src/boot/controllers/CopilotController.ts`        | Ponte IPC, gerencia ciclo de vida e integração com MCP.                |
| **UI Auth**      | `src/renderer/components/auth/GitHubAuthModal.tsx` | Interface React para exibir o código de verificação.                   |

---

## 🐛 Debugging Comum

- **Erro 404 no Token Exchange**: Geralmente indica que o `Client ID` está incorreto ou não autorizado para a API Copilot. Certifique-se de usar o ID do VSCode.
- **Erro 401**: Token expirado ou formato incorreto no header (Use `token <gho_...>` para exchange e `Bearer <tid_...>` para chat).
- **Modelos Vazios**: Verifique se a conta GitHub possui assinatura ativa do Copilot.
