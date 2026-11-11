import type { ChatCompletionRequest, ChatCompletionResponse } from '../gateway/types.js';
import type { TaskType } from '../local/types.js';

export interface RouterConfig {
  bifrostUrl: string;
  virtualKey: string;
  enableLocalModels: boolean;
  privacyMode: boolean;
  defaultModel: string;
  localModels: string[];
  budgetLimits: {
    dailyUsd: number;
    perRequestUsd: number;
  };
  failoverChain: string[];
}

export interface RouteDecision {
  target: 'bifrost' | 'local';
  model: string;
  reason: string;
  estimatedCost?: number;
  fallback?: RouteDecision;
}

export interface RouterContext {
  request: ChatCompletionRequest;
  isConfidential: boolean;
  taskType?: TaskType;
  preferredModel?: string;
  userBudget?: number;
}

export interface ModelRouter {
  route(context: RouterContext): Promise<RouteDecision>;
  complete(request: ChatCompletionRequest, decision: RouteDecision): Promise<ChatCompletionResponse>;
  getAvailableModels(): Promise<Array<{ id: string; source: 'bifrost' | 'local'; capabilities: string[] }>>;
  estimateCost(request: ChatCompletionRequest, model: string): number;
  getBudgetEnforcer(): BudgetEnforcer;
  healthCheck(): Promise<{ bifrost: boolean; ollama: boolean }>;
}

export interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
}

export interface BudgetEnforcer {
  checkBudget(estimatedCost: number): boolean;
  recordUsage(cost: number): void;
  getStatus(): BudgetStatus;
  reset(): void;
}