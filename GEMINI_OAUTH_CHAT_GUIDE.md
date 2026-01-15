# Guia de Implementação: Gemini CLI (Modo Interno / Secret Mode)

Este documento descreve a arquitetura atual do projeto, que replica o comportamento do Gemini CLI oficial para acessar a **API Interna do Google Cloud Code** (`cloudcode-pa`). Esta abordagem permite autenticação OAuth nativa ("Connect with Google") e suporte avançado a Tools.

## 1. Visão Geral

*   **Endpoint**: `https://cloudcode-pa.googleapis.com/v1internal`
*   **Protocolo**: REST + Server-Sent Events (SSE)
*   **Autenticação**: OAuth2 com Client ID Oficial do Gemini CLI.
*   **Recursos**: Chat, Streaming, Histórico e **Execução de Ferramentas (MCP)**.

---

## 2. Autenticação OAuth

Utilizamos o `google-auth-library` com uma configuração específica para contornar as restrições de "Restricted Client" da API pública.

*   **Client ID**: `681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com`
*   **Scopes**: Apenas `cloud-platform` e `userinfo`. O escopo `generative-language` é **proibido** neste modo.
*   **Token**: O Access Token gerado é válido apenas para a API Interna (`cloudcode-pa`), não funcina na API Pública (`generativelanguage`).

---

## 3. Inicialização (Handshake)

Antes do primeiro chat, é obrigatório realizar o Handshake para "apresentar" o usuário ao backend.

1.  **Load Code Assist**: Verifica se o usuário já possui conta/projeto interno.
2.  **Onboard User**: Se necessário, cria o vínculo (aceite de termos implícito).
3.  **Project ID**: O handshake retorna um `cloudaicompanionProject` (ex: `google-managed-project-...`). Este ID é **obrigatório** em todas as mensagens subsequentes.

---

## 4. Chat e Ferramentas (MCP Integration)

A implementação do chat (`sendPrompt`) opera em um **Loop de Execução** para suportar ferramentas (Agentic Loop).

### Fluxo do Loop

1.  **Envio**: Envia o histórico + prompt atual para a API.
2.  **Resposta**: O modelo retorna texto OU uma solicitação de execução de ferramenta (`functionCall`).
3.  **Intercepção**:
    *   Se for **Texto**: Exibe ao usuário e encerra o turno.
    *   Se for **Function Call**:
        1.  Solicita **Aprovação do Usuário** (`onApproval`).
        2.  Executa a ferramenta via **MCP Manager**.
        3.  Formata o resultado no envelope `functionResponse`.
        4.  **Reenvia** o histórico atualizado (com o resultado da tool) para a API.
        5.  O modelo processa o resultado e gera a resposta final (ou chama outra tool).

### Estrutura do Payload (Request)

```json
{
  "model": "gemini-2.0-flash-exp",
  "project": "PROJECT_ID_DO_HANDSHAKE",
  "user_prompt_id": "UUID-V4",
  "request": {
    "contents": [
      { "role": "user", "parts": [{ "text": "Qual a hora em SP?" }] }
    ],
    "tools": [
      {
        "functionDeclarations": [
          { "name": "get_time", "description": "...", "parameters": { ... } }
        ]
      }
    ]
  }
}
```

### Estrutura de Resposta da Tool (Function Response)

Quando uma ferramenta é executada, o resultado deve ser devolvido ao modelo neste formato específico da API Interna:

```json
{
  "role": "user", // A API Interna trata respostas de tools como input do usuário/client
  "parts": [
    {
      "functionResponse": {
        "name": "get_time",
        "response": {
          "name": "get_time",
          "content": { "time": "14:00" } // Resultado JSON da tool
        }
      }
    }
  ]
}
```

---

## 5. Processamento de Resposta (SSE)

O streaming da API Interna retorna eventos `data:` contendo JSON.
*   `response.candidates[0].content.parts[0].text`: Texto parcial (stream).
*   `response.candidates[0].content.parts[0].functionCall`: Solicitação de ferramenta.

O cliente deve acumular o texto e detectar a presença de `functionCall` para decidir se continua no loop ou finaliza.

---

## 6. Modelos Suportados

Na API Interna, os modelos geralmente possuem sufixos experimentais ou de preview.
A lista atual implementada no código (`src/boot/gemini-client.ts`) inclui:

*   `gemini-3-pro-preview`
*   `gemini-3-flash-preview`
*   `gemini-2.5-pro`
*   `gemini-2.5-flash`
*   `gemini-2.5-flash-lite`

*Nota: Nomes de modelos da API pública (ex: `gemini-1.5-flash`) podem não funcionar ou exigir mapeamento.*
