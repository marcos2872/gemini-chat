# Arquitetura do IA-Chat

Este documento descreve a arquitetura de alto nível do aplicativo **IA-Chat** e detalha os fluxos de dados para interações com múltiplos modelos (Gemini e Copilot) e o uso do Model Context Protocol (MCP).

## Visão Geral

O aplicativo é construído sobre o framework **Electron**, utilizando uma arquitetura de processos múltiplos com **TypeScript** em toda a stack:

*   **Processo Main (Node.js)**: Gerencia o ciclo de vida da aplicação, orquestra a comunicação entre serviços (Gemini, Copilot, MCP) e mantém o estado da aplicação. Foi refatorado para utilizar o padrão **Controller-Service**.
*   **Processo Renderer (React + Vite)**: Interface do usuário moderna e responsiva. Comunica-se com o Main exclusivamente através de um **IPC Bridge** tipado.

### Componentes Chave (Main Process)

A arquitetura do processo Main foi modularizada para melhor escalabilidade:

*   **`src/boot/main.ts`**: Ponto de entrada. Inicializa serviços e injeta dependências nos controladores.
*   **`src/boot/lib/IpcRouter.ts`**: Roteador central que despacha mensagens IPC para os handlers registrados.
*   **Controladores (`src/boot/controllers/`)**:
    *   **`GeminiController`**: Gerencia interações com a API do Google Gemini.
    *   **`AuthController`**: Gerencia autenticação OAuth (Copilot) e tokens.
    *   **`McpController`**: Gerencia configuração e testes de servidores MCP.
*   **Serviços de Domínio**:
    *   **`src/boot/gemini-client.ts`**: Cliente para o Google Generative AI SDK.
    *   **`src/boot/copilot-client.ts`**: Cliente reverso para a API interna do GitHub Copilot (Token Exchange, Chat).
    *   **`src/boot/mcp/McpService.ts`**: Serviço central para gerenciamento de conexões MCP (substitui o antigo `mcp-manager`).
*   **`src/boot/conversation-storage.ts`**: Persistência de dados local (arquivos JSON).

---

## Fluxos de Execução

## Fluxos de Execução

### 1. Inicialização e Autenticação

Como cada provedor lida com a conexão inicial e listagem de modelos.

#### A. GitHub Copilot (OAuth + Token Exchange)
Fluxo complexo que envolve autorização no navegador e troca de tokens para acesso à API interna.

```mermaid
sequenceDiagram
    participant User
    participant Auth as AuthController
    participant Client as CopilotClient
    participant GH as GitHub API

    Note over User, GH: Autenticação
    User->>Auth: Solicita Login
    Auth->>GH: Request Device Code
    GH-->>Auth: Retorna Código + URL
    Auth->>User: Exibe Código para colar no Browser
    
    loop Polling
        Auth->>GH: Verifica status (POST /oauth/token)
    end
    
    GH-->>Auth: Retorna OAuth Token
    Auth->>Client: initialize(oauthToken)
    
    Note over Client, GH: Listagem de Modelos
    Client->>GH: Exchange Token (OAuth -> API Token)
    GH-->>Client: Retorna API Token + Endpoints
    Client->>GH: GET /models (com API Token)
    GH-->>Client: Lista de Modelos (gpt-4o, claude-3.5, etc)
    Client-->>User: Atualiza lista na UI
```

#### B. Google Gemini (API Key)
Fluxo simplificado baseada em chave de API (arquivo `.env` ou Input do usuário).

```mermaid
sequenceDiagram
    participant User
    participant Controller as GeminiController
    participant Client as GeminiClient
    participant Google as Google AI API

    User->>Controller: Inicia App / Salva Chave
    Controller->>Client: initialize(apiKey)
    
    Client->>Google: GET /models (check connection)
    
    alt Sucesso
        Google-->>Client: Lista de Modelos (gemini-1.5, etc)
        Client-->>User: Conectado + Lista de Modelos
    else Falha
        Google-->>Client: Erro 403/400
        Client-->>User: Solicita nova chave
    end
```

### 2. Fluxo de Chat Genérico (com MCP)

Tanto o Gemini quanto o Copilot compartilham a **mesma arquitetura** para processamento de chat e uso de ferramentas (MCP). O **ChatProvider** serve como uma abstração para qualquer modelo.

```mermaid
sequenceDiagram
    actor User
    participant UI as ChatInterface
    participant Main as MainController
    participant Provider as ModelProvider (Gemini/Copilot)
    participant MCP as McpService
    participant Tool as Ferramenta (Filesystem/Browser)
    participant API as LLM API (Google/GitHub)

    User->>UI: Envia: "Analise o arquivo data.csv"
    UI->>Main: IPC: chat-stream(msg)
    Main->>Provider: sendPrompt(msg)
    
    Note over Provider, MCP: Injeção de Contexto
    Provider->>MCP: getTools()
    MCP-->>Provider: Definição das Tools (JSON Schema)
    
    Provider->>API: Envia Prompt + Definições de Tools
    
    loop Loop de Execução (ReAct / Function Calling)
        API-->>Provider: Resposta: CallTool("read_file", path="data.csv")
        
        Provider->>UI: Request Approval
        UI-->>User: "Permitir leitura de data.csv?"
        User-->>Provider: Aprovar
        
        Provider->>MCP: callTool("read_file", args)
        MCP->>Tool: Lê o arquivo no disco
        Tool-->>MCP: Conteúdo do arquivo
        MCP-->>Provider: ToolResult
        
        Provider->>API: Envia ToolResult de volta ao modelo
        
        alt Modelo decide continuar
            API-->>Provider: CallTool("analyze_data", ...)
        else Resposta Final
            API-->>Provider: Texto Final ("O arquivo contém...")
        end
    end
    
    Provider-->>UI: Stream de Resposta Final
    UI-->>User: Exibe resposta
```

## Estrutura de Diretórios Atualizada

*   `src/boot/`: Código do Processo Main (Electron/Node).
    *   `controllers/`: Lógica de orquestração IPC.
    *   `mcp/`: Implementação do Model Context Protocol.
    *   `lib/`: Utilitários (Router, etc).
*   `src/renderer/`: Código do Processo Renderer (React).
    *   `providers/`: Abstrações para diferentes modelos (Gemini/Copilot).
    *   `components/`: Componentes da UI.
*   `release/`: Artefatos de build (.AppImage, .exe).
*   `logos/`: Assets de marca.

## Build e Distribuição

O projeto utiliza `electron-builder` para gerar executáveis portáteis.

*   **Linux**: Gera `.AppImage` (Requer `libfuse2` em distros novas).
*   **Windows**: Gera `.exe` (Pode ser cross-compiled no Linux via Wine).

Para construir:
```bash
npm run dist
```
