import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.gemini-desktop', 'config');

export class ConfigPersistence {
    private static writeQueue: Map<string, Promise<void>> = new Map();

    private static async ensureDir() {
        try {
            await fs.access(CONFIG_PATH);
        } catch {
            await fs.mkdir(CONFIG_PATH, { recursive: true });
        }
    }

    static async save(key: string, data: any) {
        // Enforce sequential writes for the same key
        const previousWrite = this.writeQueue.get(key) || Promise.resolve();
        const currentWrite = (async () => {
            await previousWrite;
            await this.ensureDir();
            const filePath = path.join(CONFIG_PATH, `${key}.json`);
            const tempPath = `${filePath}.tmp`;

            // Atomic write pattern: write to tmp, then rename
            const content = JSON.stringify(data, null, 2);
            await fs.writeFile(tempPath, content, 'utf8');
            await fs.rename(tempPath, filePath);
        })();

        this.writeQueue.set(key, currentWrite);

        try {
            await currentWrite;
        } finally {
            // Cleanup queue if this was the last write
            if (this.writeQueue.get(key) === currentWrite) {
                this.writeQueue.delete(key);
            }
        }
    }

    static async load<T>(key: string): Promise<T | null> {
        const filePath = path.join(CONFIG_PATH, `${key}.json`);
        try {
            const content = await fs.readFile(filePath, 'utf8');
            return JSON.parse(content) as T;
        } catch (err: any) {
            if (err.code === 'ENOENT') return null;
            throw err;
        }
    }

    static async delete(key: string) {
        const filePath = path.join(CONFIG_PATH, `${key}.json`);
        try {
            await fs.unlink(filePath);
        } catch (err: any) {
            if (err.code !== 'ENOENT') throw err;
        }
    }
}
