# IA-Chat

## Sobre o Projeto
**IA-Chat** é uma aplicação desktop desenvolvida com Electron e React que traz o poder dos modelos Gemini do Google e Github Copilot para o seu computador. O projeto foca em oferecer uma interface de chat moderna e, principalmente, integração robusta com o **Protocolo de Contexto de Modelo (MCP)**, permitindo que o modelo execute ferramentas no seu sistema (como listar arquivos, ler documentos, etc.) de forma segura.

### Principais Funcionalidades
*   **Chat com Gemini**: Converse com diferentes modelos (Flash, Pro, etc.).
*   **Integração MCP**: Conecte servidores MCP para dar "superpoderes" ao modelo.
*   **Segurança**: Sistema de aprovação de ferramentas. Você decide se o modelo pode executar uma ação ou não.
*   **Histórico Persistente**: Suas conversas e logs de execução de ferramentas são salvos localmente.

## Como Rodar

### Pré-requisitos
*   Node.js instalado (v16 ou superior).
*   Uma chave de API do Gemini (Google AI Studio).

### Instalação

1.  Clone o repositório e instale as dependências:
    ```bash
    npm install
    ```

2.  Crie um arquivo `.env` na raiz do projeto com sua chave de API:
    ```env
    GEMINI_API_KEY=sua_chave_aqui
    ```
    *(Você pode usar o arquivo `.env.example` como base)*

### Desenvolvimento
Para rodar a aplicação em modo de desenvolvimento (com Hot Reload):

```bash
npm run dev
```

### Build
Para gerar a versão de produção (compilar o React e preparar o Electron):

```bash
npm run build
```

---
Desenvolvido com Electron, React, Vite e Google Generative AI SDK.
