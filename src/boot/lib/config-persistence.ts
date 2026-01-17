import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from './logger';

const log = createLogger('ConfigPersistence');
const CONFIG_PATH = path.join(os.homedir(), '.gemini-desktop', 'config');

export class ConfigPersistence {
    private static writeQueue: Map<string, Promise<void>> = new Map();

    private static async ensureDir() {
        try {
            await fs.access(CONFIG_PATH);
        } catch {
            try {
                await fs.mkdir(CONFIG_PATH, { recursive: true });
                log.info('Config directory created', { path: CONFIG_PATH });
            } catch (error) {
                const err = error as Error;
                log.error('Failed to create config directory', {
                    path: CONFIG_PATH,
                    error: err.message,
                });
                throw new Error(`Cannot initialize config directory: ${err.message}`);
            }
        }
    }

    static async save(key: string, data: unknown) {
        // Enforce sequential writes for the same key
        const previousWrite = this.writeQueue.get(key) || Promise.resolve();
        const currentWrite = (async () => {
            try {
                await previousWrite;
                await this.ensureDir();
                const filePath = path.join(CONFIG_PATH, `${key}.json`);
                const tempPath = `${filePath}.tmp`;

                // Atomic write pattern: write to tmp, then rename
                const content = JSON.stringify(data, null, 2);
                await fs.writeFile(tempPath, content, 'utf8');
                await fs.rename(tempPath, filePath);
                log.info('Config saved', { key });
            } catch (error) {
                const err = error as Error;
                log.error('Failed to save config', { key, error: err.message });
                throw new Error(`Failed to save config '${key}': ${err.message}`);
            }
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
            const data = JSON.parse(content) as T;
            log.info('Config loaded', { key });
            return data;
        } catch (err) {
            const error = err as NodeJS.ErrnoException;
            if (error.code === 'ENOENT') {
                log.debug('Config not found', { key });
                return null;
            }
            log.error('Failed to load config', { key, error: error.message });
            throw new Error(`Failed to load config '${key}': ${error.message}`);
        }
    }

    static async delete(key: string) {
        const filePath = path.join(CONFIG_PATH, `${key}.json`);
        try {
            await fs.unlink(filePath);
            log.info('Config deleted', { key });
        } catch (err) {
            const error = err as NodeJS.ErrnoException;
            if (error.code !== 'ENOENT') {
                log.error('Failed to delete config', { key, error: error.message });
                throw new Error(`Failed to delete config '${key}': ${error.message}`);
            }
        }
    }
}
