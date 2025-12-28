const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class ConversationStorage {
    constructor() {
        this.storagePath = path.join(os.homedir(), '.gemini-desktop', 'conversations');
        this.ensureStorageDir();
    }

    async ensureStorageDir() {
        try {
            await fs.access(this.storagePath);
        } catch {
            await fs.mkdir(this.storagePath, { recursive: true });
        }
    }

    _generateId() {
        return crypto.randomUUID();
    }

    createConversation() {
        const now = new Date().toISOString();
        return {
            id: this._generateId(),
            startTime: now,
            endTime: now,
            messages: [],
            mcpServersUsed: []
        };
    }

    async saveConversation(conversation) {
        await this.ensureStorageDir();
        conversation.endTime = new Date().toISOString();

        // Sort messages? assume already sorted

        const filePath = path.join(this.storagePath, `${conversation.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    }

    async loadConversation(id) {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (err) {
            if (err.code === 'ENOENT') throw new Error('Conversation not found');
            throw err;
        }
    }

    async listConversations() {
        await this.ensureStorageDir();
        const files = await fs.readdir(this.storagePath);
        const conversations = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = await fs.readFile(path.join(this.storagePath, file), 'utf8');
                const conv = JSON.parse(content);
                conversations.push(conv);
            } catch (err) {
                console.error(`Error reading conversation ${file}:`, err);
            }
        }

        // Sort by recent
        return conversations.sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
    }

    async deleteConversation(id) {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
    }

    async exportConversation(id, format) {
        const conv = await this.loadConversation(id);
        let output = '';

        if (format === 'md') {
            output += `# Conversation ${conv.id}\n\n`;
            output += `**Started:** ${conv.startTime}\n\n`;

            conv.messages.forEach(msg => {
                output += `### ${msg.role.toUpperCase()}\n`;
                output += `*${msg.timestamp}*\n\n`;
                output += `${msg.content}\n\n`;
                output += `---\n\n`;
            });
        } else { // txt
            conv.messages.forEach(msg => {
                output += `[${msg.timestamp}] ${msg.role.toUpperCase()}:\n`;
                output += `${msg.content}\n\n`;
                output += `----------------------------------------\n\n`;
            });
        }

        return output;
    }
}

module.exports = ConversationStorage;
