import { ChatProvider, ProviderType, AuthConfig } from "./types";
import { GeminiProvider } from "./gemini/gemini.provider";
import { CopilotProvider } from "./copilot/copilot.provider";

export class ProvidersFactory {
  private static instance: ProvidersFactory;
  private providers: Map<ProviderType, ChatProvider> = new Map();
  private activeProviderType: ProviderType = ProviderType.GEMINI;

  private constructor() {
    // Register known providers
    this.providers.set(ProviderType.GEMINI, new GeminiProvider());
    this.providers.set(ProviderType.COPILOT, new CopilotProvider());
  }

  static getInstance(): ProvidersFactory {
    if (!ProvidersFactory.instance) {
      ProvidersFactory.instance = new ProvidersFactory();
    }
    return ProvidersFactory.instance;
  }

  async initializeProvider(
    type: ProviderType,
    authConfig?: AuthConfig
  ): Promise<void> {
    const provider = this.providers.get(type);
    if (provider) {
      await provider.initialize(authConfig);
    }
  }

  getProvider(type: ProviderType): ChatProvider | undefined {
    return this.providers.get(type);
  }

  getActiveProvider(): ChatProvider {
    const provider = this.providers.get(this.activeProviderType);
    if (!provider) {
      // Fallback
      return this.providers.get(ProviderType.GEMINI)!;
    }
    return provider;
  }

  setActiveProvider(type: ProviderType) {
    if (this.providers.has(type)) {
      this.activeProviderType = type;
    }
  }

  async getAvailableProviders(): Promise<ChatProvider[]> {
    const available: ChatProvider[] = [];
    for (const provider of this.providers.values()) {
      const isReady = await provider.isAvailable();
      if (isReady) {
        available.push(provider);
      }
    }
    return available;
  }
}
