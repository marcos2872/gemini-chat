import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

export class ConversationStorage {
    private storagePath: string;

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
            messages: [] as any[],
            mcpServersUsed: [] as any[]
        };
    }

    async saveConversation(conversation: any) {
        await this.ensureStorageDir();
        conversation.endTime = new Date().toISOString();

        // Sort messages? assume already sorted

        const filePath = path.join(this.storagePath, `${conversation.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(conversation, null, 2));
    }

    async loadConversation(id: string) {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content);
        } catch (err: any) {
            if (err.code === 'ENOENT') throw new Error('Conversation not found');
            throw err;
        }
    }

    async listConversations() {
        await this.ensureStorageDir();
        const files = await fs.readdir(this.storagePath);
        const conversations: any[] = [];

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
        return conversations.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
    }

    async deleteConversation(id: string) {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            await fs.unlink(filePath);
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
        }
    }

    async exportConversation(id: string, format: string) {
        const conv = await this.loadConversation(id);
        let output = '';

        if (format === 'md') {
            output += `# Conversation ${conv.id}\n\n`;
            output += `**Started:** ${conv.startTime}\n\n`;

            conv.messages.forEach((msg: any) => {
                output += `### ${msg.role.toUpperCase()}\n`;
                output += `*${msg.timestamp}*\n\n`;
                output += `${msg.content}\n\n`;
                output += `---\n\n`;
            });
        } else { // txt
            conv.messages.forEach((msg: any) => {
                output += `[${msg.timestamp}] ${msg.role.toUpperCase()}:\n`;
                output += `${msg.content}\n\n`;
                output += `----------------------------------------\n\n`;
            });
        }

        return output;
    }
}
