# Guia de Implementação: Gemini CLI (Modo Interno / Secret Mode)

Este documento descreve como este projeto implementa a integração com o Gemini utilizando o **Client ID oficial do Gemini CLI** e acessando a **API Interna do Google Cloud Code** (`cloudcode-pa`). Esta abordagem permite usar o login "Connect with Google" nativo sem cair nas restrições de "Restricted Client" da API pública.

## 1. Visão Geral da Arquitetura

Ao contrário da implementação padrão que usa o SDK `@google/genai` apontando para `generativelanguage.googleapis.com` (API Pública), esta implementação simula o comportamento do binário oficial `gemini` CLI.

*   **Endpoint**: `https://cloudcode-pa.googleapis.com/v1internal`
*   **Protocolo**: REST + Server-Sent Events (SSE)
*   **SDK de Chat**: **Nenhum** (Implementação manual via `google-auth-library` para autenticação e requisições HTTP).

---

## 2. Autenticação OAuth Especial

Para "enganar" (ou se conformar com) as restrições do Client ID oficial, usamos uma configuração específica.

### Configuração do OAuth2Client
*   **Client ID**: `681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com` (O mesmo do CLI oficial)
*   **Scopes**:
    *   `https://www.googleapis.com/auth/cloud-platform` (Crucial: Único escopo de permissão ampla aceito)
    *   `https://www.googleapis.com/auth/userinfo.email`
    *   `https://www.googleapis.com/auth/userinfo.profile`
    *   **PROIBIDO**: `generative-language` (Causa erro 403 Restricted Client)

### Fluxo de Login
O fluxo de login permanece o padrão Authorization Code Flow (navegador -> callback local). A diferença é que o token gerado (com escopo `cloud-platform`) **não funciona** na API pública do Gemini, apenas na API interna do Cloud Code.

---

## 3. Fluxo de Handshahe (Inicialização)

A API interna exige que o usuário seja "apresentado" e um projeto seja alocado antes de qualquer chat. Se tentarmos enviar mensagem direto, recebemos `500 Internal Error`.

### Passos do Handshake (replicados em `GeminiClient.performHandshake`)

1.  **Load Code Assist** (`POST :loadCodeAssist`):
    *   Verifica o estado atual do usuário.
    *   Resposta identifica se o usuário já tem um `cloudaicompanionProject` ou qual o Tier dele.

2.  **Onboard User** (`POST :onboardUser`):
    *   Se não houver projeto, chamamos este endpoint para "aceitar os termos" e criar o vínculo.
    *   Este endpoint retorna o `Project ID` (ex: `google-managed-project-xyz` para usuários free).
    *   Obs: Pode ser uma operação longa (LRO - Long Running Operation), exigindo polling.

O **Project ID** obtido aqui deve ser guardado e enviado em **todas** as requisições de chat.

---

## 4. Estrutura do Chat (`:streamGenerateContent`)

O envio de mensagens não usa o formato padrão do SDK. Ele exige um "envelope" que encapsula o prompt.

### Payload
```json
{
  "model": "gemini-2.0-flash-exp",
  "project": "PROJECT_ID_DO_HANDSHAKE",
  "user_prompt_id": "UUID-V4-ALEATORIO",
  "request": {
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "Olá Gemini" }]
      }
    ],
    "generationConfig": { ... }
  }
}
```

### Processamento da Resposta (SSE)
A resposta vem em stream no formato Server-Sent Events (`data: {JSON}`).
*   O retorno não é apenas texto, é uma estrutura JSON complexa.
*   O texto da resposta se encontra em: `response.candidates[0].content.parts[0].text`.
*   O cliente acumula esses fragmentos para formar a resposta completa.

---

## 5. Diferenças Principais para o Modo Padrão

| Característica | Modo Padrão (SDK Público) | Modo Interno (Gemini CLI) |
| :--- | :--- | :--- |
| **Endpoint** | `generativelanguage.googleapis.com` | `cloudcode-pa.googleapis.com` |
| **Scope Necessário** | `generative-language` | `cloud-platform` |
| **Client ID** | Qualquer um (próprio) | Apenas o Oficial do Google (Whitelist) |
| **Inicialização** | Direta (Simples API Call) | Handshake Complexo (Load + Onboard) |
| **Libs** | `@google/genai` | `google-auth-library` + `fetch` manual |
