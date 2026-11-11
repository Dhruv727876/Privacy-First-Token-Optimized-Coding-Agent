export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: unknown[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  response_format?: { type: 'json_object' | 'text' };
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cached_tokens?: number;
}

export interface VirtualKeyBudget {
  virtual_key: string;
  budget: {
    daily_usd: number;
    monthly_usd: number;
    per_request_usd: number;
  };
  usage: {
    daily_usd: number;
    monthly_usd: number;
    requests_today: number;
  };
  remaining: {
    daily_usd: number;
    monthly_usd: number;
  };
  exceeded: boolean;
}

export interface HealthStatus {
  healthy: boolean;
  version: string;
  uptime_seconds: number;
  providers: Record<string, {
    healthy: boolean;
    latency_ms: number;
    last_check: string;
  }>;
}

export interface BifrostConfig {
  baseUrl: string;
  virtualKey: string;
  timeoutMs: number;
  retryAttempts: number;
}

export interface RouteResult {
  provider: 'bifrost' | 'ollama';
  model: string;
  response: ChatCompletionResponse;
  fallbackReason?: string;
  tokensUsed: number;
  costUsd: number;
}