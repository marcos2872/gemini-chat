# AGENTS.md

> This file is a guide for AI agents (and human developers) working on the **Gemini Desktop** project. It outlines the architecture, standard operating procedures, and key context required to navigate and modify the codebase effectively.

## 1. Project Overview

**Gemini Desktop** is a desktop application wrapper for the Google Gemini AI, built with **Electron**. It sets itself apart by integrating with the **Model Context Protocol (MCP)**, allowing the Gemini model to interact with local system tools, and prompts.

### Core Capabilities
*   **Chat Interface**: Standard chat UI for interacting with Gemini models.
*   **MCP Support**: Connects to local MCP servers (e.g., `linuxMcp`, `filesystem`).
    *   **Tools**: Executes tools locally (e.g., `ls`, `read_file`, `system_info`).
    *   **Prompts**: Lists and executes prompts defined by MCP servers.
*   **Conversation Persistence**: Saves/loads chat history to local JSON files.

## 2. Technology Stack

*   **Runtime**: Node.js (Main Process) + Chromium (Renderer Process / Electron).
*   **Framework**: Electron.
*   **Frontend**: React, Vite, TypeScript/JavaScript.
*   **AI SDK**: `@google/generative-ai` (Google Gemini SDK).
*   **MCP SDK**: `@modelcontextprotocol/sdk`.

## 3. Directory Structure and Key Files

*   `src/boot/`: **Main Process** logic (Node.js environment).
    *   `main.js`: Entry point. Handles app lifecycle, IPC handlers, and initialization.
    *   `gemini-client.js`: Wrapper class for the Gemini API. Handles chat sessions, history management, and the **Tool Execution Loop**.
    *   `mcp-manager.js`: Manager for MCP connections. Handles tool discovery, prompt fetching, and execution.
    *   `preload.js`: Context Bridge exposing safe APIs to the Renderer.
    *   `conversation-storage.js`: CRUD operations for chat history (`.json` files).
*   `src/renderer/`: **Renderer Process** (React App).
    *   `App.tsx`: Main layout manager (Sidebar + Chat).
    *   `components/ChatInterface.tsx`: Chat view, handles message rendering and input events. Listens for `set-chat-input`.
    *   `components/MCPServerPanel.tsx`: Sidebar panel for managing MCP servers, checking connection status, and listing Tools/Prompts.
*   `.gemini/`: Global configuration directory (in user home).

## 4. Key Architectural Patterns

### IPC Communication (Inter-Process Communication)
*   **Pattern**: Renderer requests data -> Preload Bridge -> Main Process IPC Handlers -> Backend Logic -> Result.
*   **Key Channels**:
    *   `gemini:send-prompt`: Sends user message to LLM.
    *   `mcp:list-tools`, `mcp:list-prompts`: Fetches MCP capabilities.
    *   `mcp:get-prompt`: Fetches a prompt's content to inject into the chat input.
    *   `conversation:update`: Real-time updates of chat state (e.g., tool execution logs).

### The Tool Execution Loop (in `gemini-client.js`)
1.  User sends prompt.
2.  `GeminiClient` fetches enabled MCP tools.
3.  Model receives prompt + tool definitions.
4.  **Loop**:
    *   If model requests a tool call:
    *   UI is notified (Approval request - currently auto-approved or approved via callback).
    *   `mcpManager.callTool` is executed.
    *   Result is fed back to the model.
    *   Model continues generation.
5.  Final text response is returned to UI.

## 5. Development Workflow

### Commands
*   `npm run dev`: Starts the Vite dev server and launches Electron.
*   `npm run build`: Compiles the React app and builds the Electron executable.

### Configuration
*   `.env`: Must contain `GEMINI_API_KEY`.
*   `.env.example`: Template for environment variables.

### Best Practices for Agents
*   **Safety**: When adding new MCP servers or tools, verify security implications (e.g., file system access).
*   **State Management**: `App.tsx` handles high-level state (current conversation ID). `ChatInterface` handles local message state.
*   **Typing**: The project uses a mix of JS (backend) and TSX (frontend). Respect the existing patterns. Prefer TypeScript for new renderer components.


## 🔖 CONVENÇÃO DE COMMITS

Seguimos [Conventional Commits](https://www.conventionalcommits.org/):

## Regras Principais

1.  **Tipo**: Deve ser um dos tipos permitidos (veja abaixo).
2.  **Minúsculo**: A descrição deve começar com letra minúscula.
3.  **Sem Ponto**: Não use ponto final `.` no final da linha.
4.  **Tamanho**: Máximo de **100 caracteres**.

## Tipos Permitidos

| Tipo         | Descrição                              | Exemplo                             |
| :----------- | :------------------------------------- | :---------------------------------- |
| **feat**     | Nova funcionalidade (Feature)          | `feat: cria rota de cadastro`       |
| **fix**      | Correção de bug                        | `fix: corrige erro no upload`       |
| **docs**     | Documentação                           | `docs: atualiza readme`             |
| **style**    | Formatação (espaços, ponto e vírgula)  | `style: formata main.ts`            |
| **refactor** | Refatoração (sem mudar funcionalidade) | `refactor: simplifica auth service` |
| **test**     | Testes                                 | `test: adiciona teste e2e`          |
| **chore**    | Tarefas de build, configs, deps        | `chore: atualiza dependências`      |
| **perf**     | Melhoria de performance                | `perf: otimiza query de usuários`   |
| **ci**       | Integração Contínua                    | `ci: adiciona github actions`       |

**Exemplo**: `feat(users): adiciona endpoint de atualização de avatar`

---