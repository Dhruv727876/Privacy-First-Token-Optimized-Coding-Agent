import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  VirtualKeyBudget,
  HealthStatus,
  BifrostConfig,
} from './types.js';

export class BifrostClient {
  private config: BifrostConfig;

  constructor(config: BifrostConfig) {
    this.config = config;
  }

  buildRequest(request: ChatCompletionRequest): { headers: Record<string, string>; body: ChatCompletionRequest } {
    return {
      headers: {
        'Content-Type': 'application/json',
        'x-bf-vk': this.config.virtualKey,
        'x-bifrost-virtual-key': this.config.virtualKey,
      },
      body: request,
    };
  }

  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const { headers, body } = this.buildRequest(request);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Bifrost API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json() as ChatCompletionResponse;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.retryAttempts) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    clearTimeout(timeoutId);
    throw lastError || new Error('Bifrost chat completion failed after retries');
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          healthy: false,
          version: 'unknown',
          uptime_seconds: 0,
          providers: {},
        };
      }

      const data = await response.json() as Record<string, unknown>;
      const isHealthy = data.healthy === true || data.status === 'ok';

      return {
        healthy: isHealthy,
        version: (data.version as string) || 'unknown',
        uptime_seconds: (data.uptime_seconds as number) || 0,
        providers: (data.providers as HealthStatus['providers']) || {},
      };
    } catch {
      return {
        healthy: false,
        version: 'unknown',
        uptime_seconds: 0,
        providers: {},
      };
    }
  }

  async getVirtualKeyBudget(virtualKey?: string): Promise<VirtualKeyBudget | null> {
    try {
      const key = virtualKey || this.config.virtualKey;
      const response = await fetch(`${this.config.baseUrl}/api/v1/virtual-keys/${key}/budget`, {
        headers: { 'x-bifrost-virtual-key': this.config.virtualKey },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json() as VirtualKeyBudget;
    } catch {
      return null;
    }
  }

  async isHealthy(): Promise<boolean> {
    const health = await this.healthCheck();
    return health.healthy;
  }

  getConfig(): BifrostConfig {
    return { ...this.config };
  }
}

export function createBifrostClient(config: Partial<BifrostConfig> = {}): BifrostClient {
  const defaultConfig: BifrostConfig = {
    baseUrl: 'http://localhost:8080',
    virtualKey: 'hackculture-default',
    timeoutMs: 120000,
    retryAttempts: 3,
    ...config,
  };
  return new BifrostClient(defaultConfig);
}