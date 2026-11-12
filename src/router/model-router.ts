import type {
  RouterConfig,
  RouteDecision,
  RouterContext,
  ModelRouter,
  BudgetEnforcer,
} from './types.js';
import type { ChatCompletionRequest, ChatCompletionResponse } from '../gateway/types.js';
import type { TaskType, OllamaChatRequest, OllamaChatResponse } from '../local/types.js';
import { BifrostClient } from '../gateway/bifrost-client.js';
import { OllamaManager } from '../local/ollama-manager.js';
import { createModelSelector } from '../local/model-selector.js';
import { createBudgetEnforcerNode } from './budget-enforcer.js';

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-3.5-sonnet': { input: 3.00, output: 15.00 },
  'claude-3.5-haiku': { input: 0.25, output: 1.25 },
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  'gemini-1.5-flash': { input: 0.075, output: 0.30 },
  'qwen2.5:3b': { input: 0, output: 0 },
  'phi4-mini:3.8b': { input: 0, output: 0 },
  'smollm2:1.7b': { input: 0, output: 0 },
};

export class ModelRouterImpl implements ModelRouter {
  private config: RouterConfig;
  private bifrost: BifrostClient;
  private ollama: OllamaManager;
  private budget: BudgetEnforcer;

  constructor(config: RouterConfig) {
    this.config = config;
    this.bifrost = new BifrostClient({
      baseUrl: config.bifrostUrl,
      virtualKey: config.virtualKey,
      timeoutMs: 120000,
      retryAttempts: 3,
    });
    this.ollama = new OllamaManager();
    this.budget = createBudgetEnforcerNode(config.budgetLimits.dailyUsd);
  }

  private async getModelSelector() {
    const models = await this.ollama.listModels();
    return createModelSelector(models, {
      maxVramGb: 4,
      preferredModels: {
        coding: 'qwen2.5:3b',
        reasoning: 'phi4-mini:3.8b',
        basic: 'qwen2.5:3b',
        classification: 'qwen2.5:3b',
      },
      fallbackChain: ['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b'],
    });
  }

  async route(context: RouterContext): Promise<RouteDecision> {
    const { request, isConfidential, taskType, preferredModel } = context;

    // Privacy check - confidential code must use local models
    if (isConfidential && this.config.enableLocalModels) {
      const localModel = await this.selectLocalModel(taskType, preferredModel);
      if (localModel) {
        return {
          target: 'local',
          model: localModel,
          reason: 'Privacy mode: confidential code requires local model',
          fallback: await this.getBifrostFallback(request),
        };
      }
    }

    // Budget check
    const estimatedCost = this.estimateCost(request, preferredModel || this.config.defaultModel);
    if (!this.budget.checkBudget(estimatedCost)) {
      if (this.config.enableLocalModels) {
        const localModel = await this.selectLocalModel(taskType, preferredModel);
        if (localModel) {
          return {
            target: 'local',
            model: localModel,
            reason: 'Budget exceeded, falling back to local model',
            fallback: undefined,
          };
        }
      }
      throw new Error('Budget exceeded and no local models available');
    }

    // Preferred model routing
    if (preferredModel) {
      const isLocal = this.config.localModels.includes(preferredModel);
      if (isLocal && this.config.enableLocalModels) {
        const available = await this.ollama.listModels();
        if (available.some(m => m.id === preferredModel)) {
          return {
            target: 'local',
            model: preferredModel,
            reason: `Using preferred local model: ${preferredModel}`,
            fallback: await this.getBifrostFallback(request),
          };
        }
      }
      // Check if preferred model is available via Bifrost
      return {
        target: 'bifrost',
        model: preferredModel,
        reason: `Using preferred model: ${preferredModel}`,
        estimatedCost,
        fallback: await this.getBifrostFallback(request),
      };
    }

    // Default: try Bifrost first with complexity routing
    const bifrostDecision = await this.getBifrostDecision(request);
    if (bifrostDecision) {
      return bifrostDecision;
    }

    // Fallback to local
    if (this.config.enableLocalModels) {
      const localModel = await this.selectLocalModel(taskType);
      if (localModel) {
        return {
          target: 'local',
          model: localModel,
          reason: 'Bifrost unavailable, using local model',
        };
      }
    }

    throw new Error('No available models');
  }

  private async getBifrostDecision(request: ChatCompletionRequest): Promise<RouteDecision | null> {
    try {
      const health = await this.bifrost.healthCheck();
      if (!health.healthy) return null;

      // Use Bifrost's complexity routing
      const model = request.model || this.config.defaultModel;
      const estimatedCost = this.estimateCost(request, model);

      if (!this.budget.checkBudget(estimatedCost)) return null;

      return {
        target: 'bifrost',
        model,
        reason: 'Bifrost complexity routing',
        estimatedCost,
        fallback: await this.getBifrostFallback(request),
      };
    } catch {
      return null;
    }
  }

  private async getBifrostFallback(_request: ChatCompletionRequest): Promise<RouteDecision | undefined> {
    try {
      const models = await this.ollama.listModels();
      if (models.length === 0) return undefined;

      const selector = await this.getModelSelector();
      const localModel = selector('coding');
      if (localModel) {
        return {
          target: 'local',
          model: localModel,
          reason: 'Bifrost failover to local',
        };
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  private async selectLocalModel(taskType?: TaskType, preferredModel?: string): Promise<string | null> {
    try {
      const models = await this.ollama.listModels();
      if (models.length === 0) return null;

      if (preferredModel && models.some(m => m.id === preferredModel)) {
        return preferredModel;
      }

      const selector = await this.getModelSelector();
      const selected = selector(taskType || 'coding');
      return selected || null;
    } catch {
      return null;
    }
  }

  async complete(request: ChatCompletionRequest, decision: RouteDecision): Promise<ChatCompletionResponse> {
    if (decision.target === 'bifrost') {
      const response = await this.bifrost.chatCompletion({
        ...request,
        model: decision.model,
      });
      this.budget.recordUsage(decision.estimatedCost || 0);
      return response;
    } else {
      // Convert to Ollama format
      const ollamaRequest: OllamaChatRequest = {
        model: decision.model,
        messages: request.messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        options: {
          temperature: request.temperature,
          num_predict: request.max_tokens,
        },
      };
      const ollamaResponse = await this.ollama.chatCompletion(ollamaRequest);
      this.budget.recordUsage(decision.estimatedCost || 0);
      // Convert Ollama response to ChatCompletionResponse format
      return this.convertOllamaToChatCompletion(ollamaResponse);
    }
  }

  private convertOllamaToChatCompletion(response: OllamaChatResponse): ChatCompletionResponse {
    const toolCalls = response.message.tool_calls as Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }> | undefined;
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: response.message.content,
          tool_calls: toolCalls,
        },
        finish_reason: response.done ? 'stop' : 'length',
      }],
      usage: {
        prompt_tokens: response.prompt_eval_count || 0,
        completion_tokens: response.eval_count || 0,
        total_tokens: (response.prompt_eval_count || 0) + (response.eval_count || 0),
      },
    };
  }

  async getAvailableModels(): Promise<Array<{ id: string; source: 'bifrost' | 'local'; capabilities: string[] }>> {
    const models: Array<{ id: string; source: 'bifrost' | 'local'; capabilities: string[] }> = [];

    // Get Bifrost models (placeholder - would need actual API)
    try {
      // Bifrost doesn't expose a models list API, so we use defaults
      const bifrostModels = ['gpt-4o', 'gpt-4o-mini', 'claude-3.5-sonnet', 'claude-3.5-haiku', 'gemini-1.5-pro', 'gemini-1.5-flash'];
      for (const m of bifrostModels) {
        models.push({ id: m, source: 'bifrost', capabilities: ['chat', 'completion'] });
      }
    } catch {
      // Ignore
    }

    // Get local models
    try {
      const localModels = await this.ollama.listModels();
      for (const m of localModels) {
        models.push({ id: m.id, source: 'local', capabilities: ['chat', 'completion', 'privacy'] });
      }
    } catch {
      // Ignore
    }

    return models;
  }

  estimateCost(request: ChatCompletionRequest, model: string): number {
    const costs = MODEL_COSTS[model] ?? MODEL_COSTS['gpt-4o-mini']!;
    const inputTokens = this.estimateTokens(JSON.stringify(request.messages));
    const outputTokens = request.max_tokens || 4096;
    return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getBudgetEnforcer(): BudgetEnforcer {
    return this.budget;
  }

  async healthCheck(): Promise<{ bifrost: boolean; ollama: boolean }> {
    const [bifrostHealth, ollamaHealth] = await Promise.all([
      this.bifrost.healthCheck().catch(() => ({ healthy: false })),
      this.ollama.healthCheck().catch(() => false),
    ]);
    return {
      bifrost: bifrostHealth.healthy,
      ollama: ollamaHealth,
    };
  }
}

export function createModelRouter(config: RouterConfig): ModelRouter {
  return new ModelRouterImpl(config);
}