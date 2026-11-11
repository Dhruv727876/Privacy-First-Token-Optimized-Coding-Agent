import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouterImpl, createModelRouter } from '../../src/router/model-router.js';
import { createBudgetEnforcerNode } from '../../src/router/budget-enforcer.js';
import type { RouterConfig, RouterContext } from '../../src/router/types.js';
import type { ChatCompletionRequest } from '../../src/gateway/types.js';

const mockBifrost = {
  healthCheck: vi.fn(),
  getVirtualKeyBudget: vi.fn(),
  chatCompletion: vi.fn(),
  getAvailableModels: vi.fn(),
};

const mockOllama = {
  listModels: vi.fn(),
  chatCompletion: vi.fn(),
  healthCheck: vi.fn(),
};

vi.mock('../../src/gateway/bifrost-client.js', () => ({
  BifrostClient: vi.fn().mockImplementation(() => mockBifrost),
}));

vi.mock('../../src/local/ollama-manager.js', () => ({
  OllamaManager: vi.fn().mockImplementation(() => mockOllama),
}));

const defaultConfig: RouterConfig = {
  bifrostUrl: 'http://localhost:8080',
  virtualKey: 'test-key',
  enableLocalModels: true,
  privacyMode: false,
  defaultModel: 'gpt-4o-mini',
  localModels: ['qwen2.5:3b', 'phi4-mini:3.8b'],
  budgetLimits: { dailyUsd: 10, perRequestUsd: 1 },
  failoverChain: ['gpt-4o-mini', 'qwen2.5:3b'],
};

const mockRequest: ChatCompletionRequest = {
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello' }],
  max_tokens: 100,
};

function createContext(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    request: mockRequest,
    isConfidential: false,
    ...overrides,
  };
}

describe('ModelRouter', () => {
  let router: ModelRouterImpl;

  beforeEach(() => {
    // Reset method mocks but not constructor mocks
    mockBifrost.healthCheck.mockReset();
    mockBifrost.getVirtualKeyBudget.mockReset();
    mockBifrost.chatCompletion.mockReset();
    mockBifrost.getAvailableModels.mockReset();
    mockOllama.listModels.mockReset();
    mockOllama.chatCompletion.mockReset();
    mockOllama.healthCheck.mockReset();

    router = new ModelRouterImpl(defaultConfig);

    mockBifrost.healthCheck.mockResolvedValue({ healthy: true });
    mockBifrost.getVirtualKeyBudget.mockResolvedValue({ used: 0, limit: 100, remaining: 100 });
    mockOllama.healthCheck.mockResolvedValue(true);
    mockOllama.listModels.mockResolvedValue([
      { id: 'qwen2.5:3b', size: 2_000_000_000, capabilities: ['coding'] },
      { id: 'phi4-mini:3.8b', size: 2_500_000_000, capabilities: ['coding', 'reasoning'] },
    ]);
  });

  it('routes to local model for confidential code', async () => {
    const context = createContext({ isConfidential: true });
    const decision = await router.route(context);

    expect(decision.target).toBe('local');
    expect(decision.reason).toContain('Privacy mode');
    expect(['qwen2.5:3b', 'phi4-mini:3.8b']).toContain(decision.model);
  });

  it('routes to bifrost for non-confidential code', async () => {
    const context = createContext({ isConfidential: false });
    const decision = await router.route(context);

    expect(decision.target).toBe('bifrost');
    expect(decision.model).toBe('gpt-4o-mini');
  });

  it('uses preferred model when specified', async () => {
    const context = createContext({ preferredModel: 'phi4-mini:3.8b' });
    const decision = await router.route(context);

    expect(decision.model).toBe('phi4-mini:3.8b');
    expect(decision.target).toBe('local');
  });

  it('falls back to local when budget exceeded', async () => {
    const noBudgetRouter = new ModelRouterImpl({ ...defaultConfig, budgetLimits: { dailyUsd: 0, perRequestUsd: 0 } });
    const context = createContext({ isConfidential: false });
    const decision = await noBudgetRouter.route(context);

    expect(decision.target).toBe('local');
    expect(decision.reason).toContain('Budget exceeded');
  });

  it('throws when budget exceeded and no local models', async () => {
    const noLocalRouter = new ModelRouterImpl({ ...defaultConfig, enableLocalModels: false, budgetLimits: { dailyUsd: 0, perRequestUsd: 0 } });
    const context = createContext({ isConfidential: false });

    await expect(noLocalRouter.route(context)).rejects.toThrow('Budget exceeded');
  });

  it('falls back to local when bifrost unhealthy', async () => {
    mockBifrost.healthCheck.mockResolvedValue({ healthy: false });
    const context = createContext({ isConfidential: false });
    const decision = await router.route(context);

    expect(decision.target).toBe('local');
    expect(decision.reason).toContain('Bifrost unavailable');
  });

  it('estimates cost correctly', async () => {
    const cost = router.estimateCost(mockRequest, 'gpt-4o-mini');
    expect(cost).toBeGreaterThan(0);
    expect(cost).toBeLessThan(1);
  });

  it('gets available models from both sources', async () => {
    mockBifrost.getAvailableModels.mockResolvedValue(['gpt-4o', 'gpt-4o-mini']);
    const models = await router.getAvailableModels();

    expect(models.some(m => m.id === 'gpt-4o-mini' && m.source === 'bifrost')).toBe(true);
    expect(models.some(m => m.id === 'qwen2.5:3b' && m.source === 'local')).toBe(true);
  });

  it('completes via bifrost', async () => {
    mockBifrost.chatCompletion.mockResolvedValue({
      id: 'test',
      choices: [{ message: { role: 'assistant', content: 'Hi' }, index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const decision = await router.route(createContext());
    const response = await router.complete(mockRequest, decision);

    expect(response.choices[0].message.content).toBe('Hi');
    expect(mockBifrost.chatCompletion).toHaveBeenCalled();
  });

  it('completes via local', async () => {
    mockOllama.chatCompletion.mockResolvedValue({
      model: 'qwen2.5:3b',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Hi from local' },
      done: true,
    });

    const context = createContext({ isConfidential: true });
    const decision = await router.route(context);
    const response = await router.complete(mockRequest, decision);

    expect(response.choices[0].message.content).toBe('Hi from local');
    expect(mockOllama.chatCompletion).toHaveBeenCalled();
  });

  it('health check returns both statuses', async () => {
    mockBifrost.healthCheck.mockResolvedValue({ healthy: true });
    mockOllama.healthCheck.mockResolvedValue(true);

    const health = await router.healthCheck();
    expect(health.bifrost).toBe(true);
    expect(health.ollama).toBe(true);
  });
});

describe('BudgetEnforcer', () => {
  it('tracks budget correctly', () => {
    const budget = createBudgetEnforcerNode(10, '.test-budget.json');
    expect(budget.checkBudget(5)).toBe(true);
    expect(budget.checkBudget(15)).toBe(false);

    budget.recordUsage(3);
    expect(budget.getStatus().used).toBe(3);
    expect(budget.getStatus().remaining).toBe(7);

    budget.reset();
    expect(budget.getStatus().used).toBe(0);
  });

  it('handles daily reset', () => {
    const budget = createBudgetEnforcerNode(10, '.test-budget-2.json');
    budget.recordUsage(5);
    budget.reset();
    expect(budget.getStatus().used).toBe(0);
  });
});