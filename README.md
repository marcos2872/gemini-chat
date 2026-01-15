# IA-Chat

**IA-Chat** é uma aplicação desktop moderna e poderosa desenvolvida com Electron e React. Ela unifica o acesso aos modelos **Google Gemini** e **GitHub Copilot** em uma única interface, permitindo alternar fluidamente entre eles.

O grande diferencial do projeto é a **integração nativa com MCP (Model Context Protocol)**. Isso permite que você conecte "servidores de ferramentas" (como acesso a arquivos, bancos de dados, terminais cmd) e dê superpoderes aos modelos de IA, tudo rodando localmente no seu computador com controle total de privacidade e segurança.

## Principais Funcionalidades

*   🤖 **Múltiplos Modelos**: Suporte nativo ao Google Gemini (Flash, Pro) e GitHub Copilot (GPT-4o, Claude 3.5 Sonnet, etc).
*   🛠️ **MCP (Model Context Protocol)**: Conecte ferramentas externas padronizadas. O app já vem com ferramentas de sistema (leitura de arquivos, terminal) prontas para uso.
*   🔒 **Segurança e Privacidade**:
    *   Todo o histórico é salvo localmente no seu disco.
    *   **Controle de Aprovação**: Antes da IA executar qualquer comando ou ler um arquivo, o app pede sua permissão explícita.
*   🎨 **Interface Premium**: Design moderno, responsivo e com suporte a markdown, syntax highlighting e visualização de diffs.

---

## Como Rodar (Desenvolvimento)

### Pré-requisitos
*   **Node.js** (v18 ou superior recomendado).
*   Uma chave de API do **Gemini** (Google AI Studio).
*   *(Opcional)* Conta GitHub com acesso ao Copilot (autenticação feita via navegador).

### Instalação

1.  Clone o repositório e instale as dependências:
    ```bash
    npm install
    ```

2.  Inicie em modo de desenvolvimento:
    ```bash
    npm run dev
    ```
    *Isso abrirá a janela do app com Hot Reload ativo.*

---

## Como Gerar o Executável (AppImage / .exe)

O projeto está configurado para gerar um arquivo **AppImage** (Linux) portátil, que roda na maioria das distribuições sem instalação.

### Gerando o Build

Rode o comando:

```bash
npm run dist
```

Isso criará uma pasta `release/` na raiz do projeto contendo:
*   **Linux**: Um arquivo `.AppImage` (ex: `IA-Chat-1.0.0.AppImage`).
*   **Windows**: Um instalador `.exe` (se rodado no Windows ou com Wine configurado).

### Rodando o AppImage (Linux)

Após gerar o arquivo:
1.  Vá até a pasta release: `cd release`
2.  Dê permissão de execução: `chmod +x IA-Chat-*.AppImage`
3.  Execute: `./IA-Chat-*.AppImage`

> **Nota para usuários Ubuntu 22.04+**:
> O AppImage precisa da biblioteca FUSE. Se não rodar, instale:
> `sudo apt install libfuse2`

### Gerando Instalador Windows (.exe)

Para gerar o instalador do Windows estando no Linux, você precisa ter o **Wine** instalado (`sudo dnf install wine`).

Execute:
```bash
npm run dist -- --win
```

O arquivo de instalação (ex: `IA-Chat Setup 1.0.0.exe`) será gerado na pasta `release/`. Você pode copiar esse arquivo para um computador Windows e instalá-lo normalmente.

---
*Desenvolvido com Electron, React, Vite, Google Generative AI e GitHub Copilot.*
