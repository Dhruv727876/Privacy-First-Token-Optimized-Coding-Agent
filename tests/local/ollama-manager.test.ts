import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaManager, createOllamaManager } from '../../src/local/ollama-manager.js';
import { createModelSelector } from '../../src/local/model-selector.js';
import type { ModelInfo, TaskType } from '../../src/local/types.js';

describe('Model Selector', () => {
  const mockModels: ModelInfo[] = [
    { id: 'qwen2.5:3b', size: 2_000_000_000, capabilities: ['coding', 'reasoning'], vramRequired: 2.5 },
    { id: 'phi4-mini:3.8b', size: 2_500_000_000, capabilities: ['reasoning'], vramRequired: 3.0 },
    { id: 'smollm2:1.7b', size: 1_000_000_000, capabilities: ['basic'], vramRequired: 1.5 },
    { id: 'gemma3:4b', size: 3_000_000_000, capabilities: ['coding', 'reasoning', 'basic'], vramRequired: 3.5 },
  ];

  const config = {
    maxVramGb: 4,
    preferredModels: {
      coding: 'qwen2.5:3b',
      reasoning: 'phi4-mini:3.8b',
      basic: 'smollm2:1.7b',
      classification: 'smollm2:1.7b',
    },
    fallbackChain: ['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b'],
  };

  it('returns coding model for code tasks', () => {
    const selector = createModelSelector(mockModels, config);
    expect(selector('coding')).toBe('qwen2.5:3b');
  });

  it('returns reasoning model for reasoning tasks', () => {
    const selector = createModelSelector(mockModels, config);
    expect(selector('reasoning')).toBe('phi4-mini:3.8b');
  });

  it('returns basic model for basic tasks', () => {
    const selector = createModelSelector(mockModels, config);
    expect(selector('basic')).toBe('smollm2:1.7b');
  });

  it('returns classification model for classification tasks', () => {
    const selector = createModelSelector(mockModels, config);
    expect(selector('classification')).toBe('smollm2:1.7b');
  });

  it('filters by VRAM limit', () => {
    const lowVramConfig = { ...config, maxVramGb: 2 };
    const selector = createModelSelector(mockModels, lowVramConfig);
    // Only smollm2:1.7b fits in 2GB (with 10% headroom = 1.8GB)
    expect(selector('coding')).toBe('smollm2:1.7b');
  });

  it('falls back to fallback chain when preferred unavailable', () => {
    const limitedModels = mockModels.slice(2); // Only smollm2:1.7b, gemma3:4b
    const selector = createModelSelector(limitedModels, config);
    expect(selector('coding')).toBe('gemma3:4b'); // Has coding capability
  });

  it('returns null when no models available', () => {
    const selector = createModelSelector([], config);
    expect(selector('coding')).toBeNull();
  });
});

describe('OllamaManager', () => {
  let manager: OllamaManager;

  beforeEach(() => {
    manager = new OllamaManager('http://mock-ollama:11434');
  });

  it('infers capabilities from model name', () => {
    const qwenCaps = (manager as any).inferCapabilities('qwen2.5:3b', '3B');
    expect(qwenCaps).toContain('coding');
    expect(qwenCaps).toContain('reasoning');

    const phiCaps = (manager as any).inferCapabilities('phi4-mini:3.8b', '3.8B');
    expect(phiCaps).toContain('reasoning');

    const smolCaps = (manager as any).inferCapabilities('smollm2:1.7b', '1.7B');
    expect(smolCaps).toContain('basic');
  });

  it('getBestModel returns model for task type', async () => {
    const mockModels: ModelInfo[] = [
      { id: 'qwen2.5:3b', size: 2_000_000_000, capabilities: ['coding', 'reasoning'], vramRequired: 2.5 },
      { id: 'smollm2:1.7b', size: 1_000_000_000, capabilities: ['basic'], vramRequired: 1.5 },
    ];
    manager.setModels(mockModels);

    expect(manager.getBestModel('coding')).toBe('qwen2.5:3b');
    expect(manager.getBestModel('basic')).toBe('smollm2:1.7b');
  });

  it('healthCheck returns false when unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
    const healthy = await manager.healthCheck();
    expect(healthy).toBe(false);
  });

  it('chatCompletion throws on error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error'),
    } as Response);

    await expect(manager.chatCompletion({
      model: 'qwen2.5:3b',
      messages: [{ role: 'user', content: 'test' }],
    })).rejects.toThrow('Ollama chat error');
  });

  it('createOllamaManager uses defaults', () => {
    const m = createOllamaManager();
    expect(m.getBaseUrl()).toBe('http://localhost:11434');
  });
});