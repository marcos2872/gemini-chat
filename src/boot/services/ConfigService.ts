import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createLogger } from '../lib/logger';

const log = createLogger('ConfigService');

export interface OllamaConfig {
    baseUrl: string;
}

export interface AppConfig {
    ollama: OllamaConfig;
}

const DEFAULT_CONFIG: AppConfig = {
    ollama: {
        baseUrl: 'http://localhost:11434',
    },
};

export class ConfigService {
    private configPath: string;
    private config: AppConfig | null = null;

    constructor() {
        this.configPath = path.join(os.homedir(), '.gemini-desktop', 'config', 'ollama-auth.json');
    }

    /**
     * Ensures that the configuration directory exists.
     */
    private async ensureConfigDir() {
        const dir = path.dirname(this.configPath);
        try {
            await fs.access(dir);
        } catch {
            try {
                await fs.mkdir(dir, { recursive: true });
            } catch (error) {
                const err = error as Error;
                log.error('Failed to create config directory', { path: dir, error: err.message });
                throw new Error(`Cannot initialize config: ${err.message}`);
            }
        }
    }

    /**
     * Loads configuration from disk. Returns default config if file doesn't exist.
     */
    async loadConfig(): Promise<AppConfig> {
        if (this.config) return this.config;

        try {
            await this.ensureConfigDir();
            try {
                const content = await fs.readFile(this.configPath, 'utf8');
                const loaded = JSON.parse(content) as Partial<AppConfig>;
                // Merge with defaults to ensure all keys exist
                this.config = {
                    ...DEFAULT_CONFIG,
                    ...loaded,
                    ollama: {
                        ...DEFAULT_CONFIG.ollama,
                        ...(loaded.ollama || {}),
                    },
                };
            } catch (err) {
                const error = err as NodeJS.ErrnoException;
                if (error.code === 'ENOENT') {
                    // File doesn't exist, use defaults
                    this.config = { ...DEFAULT_CONFIG };
                } else {
                    throw err;
                }
            }
        } catch (error) {
            const err = error as Error;
            log.error('Failed to load config', { error: err.message });
            // Fallback to defaults on error
            this.config = { ...DEFAULT_CONFIG };
        }

        return this.config!;
    }

    /**
     * Saves current configuration to disk.
     */
    async saveConfig(newConfig: AppConfig) {
        try {
            await this.ensureConfigDir();
            await fs.writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
            this.config = newConfig;
            log.info('Configuration saved');
        } catch (error) {
            const err = error as Error;
            log.error('Failed to save config', { error: err.message });
            throw new Error(`Failed to save config: ${err.message}`);
        }
    }

    /**
     * Gets the Ollama configuration.
     */
    async getOllamaConfig(): Promise<OllamaConfig> {
        const config = await this.loadConfig();
        return config.ollama;
    }

    /**
     * Updates the Ollama base URL.
     */
    async setOllamaUrl(url: string) {
        const config = await this.loadConfig();
        config.ollama.baseUrl = url;
        await this.saveConfig(config);
    }
}
