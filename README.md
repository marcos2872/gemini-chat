# IA-Chat CLI

**IA-Chat** é uma aplicação de terminal (CLI) moderna e poderosa desenvolvida com **React** e **Ink**. Ela unifica o acesso aos modelos **Google Gemini**, **GitHub Copilot** e **Ollama** em uma única interface, permitindo alternar fluidamente entre eles.

O grande diferencial do projeto é a **integração nativa com MCP (Model Context Protocol)**. Isso permite que você conecte "servidores de ferramentas" (como acesso a arquivos, bancos de dados, terminais cmd) e dê superpoderes aos modelos de IA, tudo rodando localmente no seu computador com controle total de privacidade e segurança.

---

## Principais Funcionalidades

- 🤖 **Múltiplos Modelos**:
    - **Google Gemini**: Acesso aos modelos Flash e Pro.
    - **GitHub Copilot**: Integração com modelos GPT-4o e Claude 3.5 Sonnet.
    - **Ollama**: Suporte para rodar modelos locais (Llama 3, Mistral, etc).
- 🔄 **Histórico Unificado**: Suas conversas são salvas e mantidas independente do provedor usado. O contexto é preservado entre sessões.
- 🛠️ **MCP (Model Context Protocol)**:
    - Conecte ferramentas externas padronizadas.
    - Ferramentas de sistema (leitura de arquivos, terminal) já integradas.
    - **Toggle Rápido**: Ative/Desative ferramentas facilmente via `Alt+T`.
- 🔒 **Segurança e Privacidade**:
    - Histórico salvo localmente (`~/.gemini-desktop`).
    - **Controle de Aprovação**: Antes da IA executar qualquer comando ou ler um arquivo, o app pede sua permissão explícita em um modal dedicado.
- 🎨 **Interface TUI Premium**: Interface de texto rica com suporte a markdown, syntax highlighting, spinners animados e navegação via teclado.

---

## Atalhos e Comandos

O aplicativo é focado em produtividade via teclado. Aqui estão os principais atalhos (consulte a qualquer momento com `Alt+H`):

### Gerenciamento de Chat

| Atalho    | Ação          | Descrição                                                    |
| :-------- | :------------ | :----------------------------------------------------------- |
| **Alt+N** | Novo Chat     | Inicia uma nova conversa limpa.                              |
| **Alt+C** | Carregar Chat | Abre o modal de histórico para retomar conversas anteriores. |
| **Alt+X** | Cancelar      | Interrompe a geração da resposta atual.                      |
| **Alt+T** | Toggle MCP    | Abre modal para ativar/desativar ferramentas MCP.            |

### Navegação e Sistema

| Atalho    | Ação              | Descrição                                      |
| :-------- | :---------------- | :--------------------------------------------- |
| **Alt+P** | Trocar Provedor   | Alterna entre Gemini, Copilot e Ollama.        |
| **Alt+M** | Selecionar Modelo | Escolhe o modelo específico do provedor atual. |
| **Alt+A** | Autenticar        | Inicia fluxo de login (se necessário).         |
| **Alt+L** | Logs              | Abre visualizador de logs de debug.            |
| **Alt+O** | Logout            | Desconecta e limpa credenciais.                |
| **Alt+Q** | Sair              | Fecha a aplicação.                             |
| **Alt+H** | Ajuda             | Exibe a lista de atalhos.                      |

### Slash Commands

Digite estes comandos na caixa de entrada:

- `/compress`: Otimiza o histórico da conversa para economizar tokens.
- `/tokens`: Exibe uma estimativa de uso de tokens da conversa atual.

---

## Como Rodar

### Pré-requisitos

- **Node.js** (v18+ recomendado).
- Chaves de API conforme o uso:
    - **Gemini**: Chave do Google AI Studio.
    - **Copilot**: Conta GitHub ativa.
    - **Ollama**: Servidor Ollama rodando localmente (opcional).

### Instalação e Execução

1.  Clone o repositório e instale as dependências:

    ```bash
    npm install
    ```

2.  Para rodar a interface CLI:

    ```bash
    npm run cli
    ```

    _Este comando compila o projeto e inicia a interface no seu terminal._

3.  Para desenvolvimento (com watch mode):

    ```bash
    # Em um terminal, compile em modo watch:
    npm run build:cli -- --watch

    # Em outro, rode o app (necessário reiniciar se houver crash):
    node dist/cli.mjs
    ```

---

_Desenvolvido com React, Ink e TypeScript._
