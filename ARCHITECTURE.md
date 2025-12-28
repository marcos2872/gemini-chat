# Arquitetura do Gemini Desktop

Este documento descreve a arquitetura de alto nível do aplicativo **Gemini Desktop** e detalha os fluxos de dados para interações de chat padrão e interações envolvendo o Model Context Protocol (MCP).

## Visão Geral

O aplicativo é construído sobre o framework **Electron**, utilizando uma arquitetura de processos múltiplos:

*   **Processo Main (Node.js)**: Gerencia o ciclo de vida da aplicação, interações com o sistema operacional, persistência de dados (armazenamento de conversas), e orquestra as comunicações com a API do Gemini e servidores MCP.
*   **Processo Renderer (React + Vite)**: Responsável pela interface do usuário (UI), exibindo o chat, histórico e painel de controle MCP. A comunicação com o processo Main ocorre via **IPC** (Inter-Process Communication).

### Componentes Chave

*   **`src/boot/main.js`**: Ponto de entrada do processo Main. Configura os handlers IPC.
*   **`src/boot/gemini-client.js`**: Wrapper em torno do Google Generative AI SDK. Gerencia sessões de chat e o loop de execução de ferramentas.
*   **`src/boot/mcp-manager.js`**: Gerencia conexões com servidores MCP, descoberta de ferramentas/recursos e execução de chamadas.
*   **`src/renderer/components/ChatInterface.tsx`**: Componente principal da UI de chat.

---

## Fluxos de Execução

### 1. Fluxo de Chat Padrão (Sem Ferramentas)

Este é o fluxo básico quando o usuário envia uma mensagem e o modelo responde apenas com seu conhecimento interno.

```mermaid
sequenceDiagram
    actor User as Usuário
    participant UI as ChatInterface (Renderer)
    participant IPC as IPC Bridge
    participant Main as Main Process
    participant Gemini as GeminiClient
    participant API as Google Gemini API

    User->>UI: Digita mensagem e envia
    UI->>IPC: send-prompt (mensagem)
    IPC->>Main: ipcMain.handle('gemini:send-prompt')
    Main->>Gemini: sendPrompt(mensagem)
    Gemini->>API: chat.sendMessage(mensagem)
    API-->>Gemini: Gerar Resposta (Texto)
    Gemini-->>Main: Retorna texto
    Main->>IPC: Retorna sucesso + dados
    IPC-->>UI: Atualiza estado (exibe resposta)
    UI-->>User: Vê a resposta
```

### 2. Fluxo de Chat com MCP (Tool Use)

Este fluxo ocorre quando o Gemini decide que precisa usar uma ferramenta (ex: listar arquivos, ler recursos) para responder à solicitação do usuário. O aplicativo implementa um "loop de execução" para processar chamadas de função sequencialmente.

```mermaid
sequenceDiagram
    actor User as Usuário
    participant UI as ChatInterface (Renderer)
    participant Main as Main Process
    participant Gemini as GeminiClient
    participant API as Google Gemini API
    participant MCP as MCPServerManager
    participant Server as Servidor MCP (ex: Filesystem)

    User->>+UI: "Liste os arquivos na minha pasta"
    UI->>+Main: send-prompt
    Main->>+Gemini: sendPrompt(prompt, tools)
    
    Note over Gemini, API: Envia prompt + definições de ferramentas MCP
    Gemini->>+API: chat.sendMessage(prompt)
    
    API-->>-Gemini: FunctionCallRequest (nome: "ls", args: {path: "."})
    
    loop Tool Execution Loop
        Gemini->>UI: Solicita Aprovação (Optional)
        UI-->>Gemini: Aprovado
        
        Gemini->>+MCP: callTool("filesystem__ls", args)
        MCP->>+Server: Executa comando/ferramenta
        Server-->>-MCP: Retorna Resultado (JSON/Texto)
        MCP-->>-Gemini: Resultado da Ferramenta
        
        Note over Gemini, API: Envia resultado da ferramenta de volta ao modelo
        Gemini->>+API: chat.sendMessage(toolResult)
        
        alt Modelo precisa de mais ferramentas?
            API-->>Gemini: FunctionCallRequest (Outra ferramenta...)
            Note over Gemini: O loop continua...
        else Resposta Final
            API-->>-Gemini: Resposta em Texto Natural
        end
    end
    
    Gemini-->>-Main: Resposta Final Processada
    Main-->>-UI: Exibe resposta final
    UI-->>-User: Vê a lista de arquivos formatada
```

## Estrutura de Diretórios Importante

*   `.gemini/`: Armazena configurações globais e logs.
*   `src/conversation-storage`: Persistência de histórico de chat (arquivos JSON locais).
*   `src/boot/`: Lógica do lado do servidor (Main Process).
*   `src/renderer/`: Código da aplicação React.

## Visualização

Para visualizar os diagramas acima graficamente, você pode copiar o código dos blocos `mermaid` e colar no [Mermaid Live Editor](https://mermaid.live).
