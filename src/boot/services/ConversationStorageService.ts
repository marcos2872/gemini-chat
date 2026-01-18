import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { createLogger } from '../lib/logger';
import { Conversation, Message } from '../../shared/types';

const log = createLogger('Storage');

export class ConversationStorage {
    private storagePath: string;

    constructor() {
        this.storagePath = path.join(os.homedir(), '.gemini-desktop', 'conversations');
        this.ensureStorageDir();
    }

    /**
     * Ensures that the storage directory exists.
     * Creates the directory if it doesn't exist, handling race conditions.
     * @throws {Error} If directory creation fails.
     */
    async ensureStorageDir() {
        try {
            await fs.access(this.storagePath);
        } catch {
            try {
                await fs.mkdir(this.storagePath, { recursive: true });
                log.info('Storage directory created', { path: this.storagePath });
            } catch (error) {
                const err = error as Error;
                log.error('Failed to create storage directory', {
                    path: this.storagePath,
                    error: err.message,
                });
                throw new Error(`Cannot initialize storage: ${err.message}`);
            }
        }
    }

    _generateId() {
        return crypto.randomUUID();
    }

    createConversation(): Conversation {
        const now = new Date().toISOString();
        return {
            id: this._generateId(),
            startTime: now,
            endTime: now,
            messages: [],
            mcpServersUsed: [],
        };
    }

    /**
     * Saves a conversation to a JSON file.
     * @param conversation - The conversation object to save.
     * @throws {Error} If writing to the file fails.
     */
    async saveConversation(conversation: Conversation) {
        try {
            await this.ensureStorageDir();
            const updatedConv = { ...conversation, endTime: new Date().toISOString() };

            const filePath = path.join(this.storagePath, `${updatedConv.id}.json`);
            await fs.writeFile(filePath, JSON.stringify(updatedConv, null, 2));
            log.info('Conversation saved', { id: updatedConv.id });
        } catch (error) {
            const err = error as Error;
            log.error('Failed to save conversation', {
                id: conversation.id,
                error: err.message,
            });
            throw new Error(`Failed to save conversation: ${err.message}`);
        }
    }

    /**
     * Loads a conversation by its ID.
     * @param id - The conversation UUID.
     * @returns The conversation object.
     * @throws {Error} If the conversation is not found or file is unreadable.
     */
    async loadConversation(id: string): Promise<Conversation> {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content) as Conversation;
        } catch (err) {
            const error = err as NodeJS.ErrnoException;
            if (error.code === 'ENOENT') throw new Error('Conversation not found');
            throw err;
        }
    }

    /**
     * Lists all stored conversations.
     * @returns Array of conversation objects, sorted by most recent.
     */
    async listConversations(): Promise<Conversation[]> {
        try {
            await this.ensureStorageDir();
            const files = await fs.readdir(this.storagePath);
            const conversations: Conversation[] = [];

            for (const file of files) {
                if (!file.endsWith('.json')) continue;
                try {
                    const content = await fs.readFile(path.join(this.storagePath, file), 'utf8');
                    const conv = JSON.parse(content) as Conversation;
                    conversations.push(conv);
                } catch (err) {
                    const error = err as Error;
                    log.warn('Skipping corrupted conversation file', {
                        file,
                        error: error.message,
                    });
                }
            }

            // Sort by recent
            return conversations.sort(
                (a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime(),
            );
        } catch (error) {
            const err = error as Error;
            log.error('Failed to list conversations', { error: err.message });
            throw new Error(`Failed to list conversations: ${err.message}`);
        }
    }

    /**
     * Deletes a conversation by ID.
     * @param id - The ID of the conversation to delete.
     */
    async deleteConversation(id: string) {
        const filePath = path.join(this.storagePath, `${id}.json`);
        try {
            await fs.unlink(filePath);
        } catch (err) {
            const error = err as NodeJS.ErrnoException;
            if (error.code !== 'ENOENT') throw err;
        }
    }

    async exportConversation(id: string, format: string): Promise<string> {
        const conv = await this.loadConversation(id);
        let output = '';

        if (format === 'md') {
            output += `# Conversation ${conv.id}\n\n`;
            output += `**Started:** ${conv.startTime}\n\n`;

            conv.messages.forEach((msg: Message) => {
                output += `### ${msg.role.toUpperCase()}\n`;
                output += `*${msg.timestamp}*\n\n`;
                output += `${msg.content}\n\n`;
                output += `---\n\n`;
            });
        } else {
            // txt
            conv.messages.forEach((msg: Message) => {
                output += `[${msg.timestamp}] ${msg.role.toUpperCase()}:\n`;
                output += `${msg.content}\n\n`;
                output += `----------------------------------------\n\n`;
            });
        }

        return output;
    }
}
