import type {
  ModelInfo,
  TaskType,
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaModelList,
  ModelSelectorConfig,
} from './types.js';
import { createModelSelector, estimateVramRequired } from './model-selector.js';

export class OllamaManager {
  private baseUrl: string;
  private modelSelector: (taskType: TaskType) => string | null;
  private modelCache: ModelInfo[] | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 60000;

  constructor(
    baseUrl: string = 'http://localhost:11434',
    config: Partial<ModelSelectorConfig> = {}
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelSelector = createModelSelector(
      [],
      {
        maxVramGb: 4,
        preferredModels: {
          coding: 'qwen2.5:3b',
          reasoning: 'phi4-mini:3.8b',
          basic: 'smollm2:1.7b',
          classification: 'smollm2:1.7b',
        },
        fallbackChain: ['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b'],
        ...config,
      }
    );
  }

  async listModels(): Promise<ModelInfo[]> {
    const now = Date.now();
    if (this.modelCache && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.modelCache;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }
      const data = await response.json() as OllamaModelList;

      this.modelCache = data.models.map(m => ({
        id: m.name,
        size: m.size,
        capabilities: this.inferCapabilities(m.name, m.details?.parameter_size),
        quantization: m.details?.quantization_level,
        vramRequired: estimateVramRequired(m.name, m.size),
      }));
      this.cacheTimestamp = now;
      return this.modelCache;
    } catch (error) {
      console.warn('Failed to list Ollama models:', error);
      return this.modelCache || [];
    }
  }

  private inferCapabilities(name: string, paramSize?: string): ModelInfo['capabilities'] {
    const lower = name.toLowerCase();
    const caps: ModelInfo['capabilities'] = [];

    if (lower.includes('code') || lower.includes('qwen') || lower.includes('coder')) {
      caps.push('coding');
    }
    if (lower.includes('phi') || lower.includes('reasoning') || (paramSize && parseInt(paramSize) >= 3)) {
      caps.push('reasoning');
    }
    if (lower.includes('smollm') || lower.includes('tiny') || (paramSize && parseInt(paramSize) <= 2)) {
      caps.push('basic');
    }
    if (lower.includes('classif') || lower.includes('bert') || lower.includes('embed')) {
      caps.push('classification');
    }

    if (caps.length === 0) caps.push('basic');
    return caps;
  }

  async ensureModel(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    if (models.some(m => m.id === modelId)) {
      return true;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId, stream: false }),
      });
      if (!response.ok) {
        throw new Error(`Pull failed: ${response.status}`);
      }
      this.modelCache = null; // Invalidate cache
      return true;
    } catch (error) {
      console.error(`Failed to pull model ${modelId}:`, error);
      return false;
    }
  }

  async chatCompletion(request: OllamaChatRequest): Promise<OllamaChatResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama chat error: ${response.status} - ${errorText}`);
      }

      return await response.json() as OllamaChatResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  getBestModel(taskType: TaskType): string | null {
    // Refresh model list if cache is stale
    if (!this.modelCache || Date.now() - this.cacheTimestamp >= this.CACHE_TTL_MS) {
      // Async refresh in background, use cached for now
      this.listModels().catch(() => {});
    }
    return this.modelSelector(taskType);
  }

  getModelSelector(): (taskType: TaskType) => string | null {
    return this.modelSelector;
  }

  setModels(models: ModelInfo[]): void {
    this.modelCache = models;
    this.cacheTimestamp = Date.now();
    this.modelSelector = createModelSelector(models, {
      maxVramGb: 4,
      preferredModels: {
        coding: 'qwen2.5:3b',
        reasoning: 'phi4-mini:3.8b',
        basic: 'smollm2:1.7b',
        classification: 'smollm2:1.7b',
      },
      fallbackChain: ['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b'],
    });
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}

export function createOllamaManager(
  baseUrl?: string,
  config?: Partial<ModelSelectorConfig>
): OllamaManager {
  return new OllamaManager(baseUrl || 'http://localhost:11434', config);
}