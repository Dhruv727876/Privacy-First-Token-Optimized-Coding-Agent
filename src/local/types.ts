export interface ModelInfo {
  id: string;
  size: number;
  capabilities: ModelCapability[];
  quantization?: string;
  contextLength?: number;
  vramRequired?: number;
}

export type ModelCapability = 'coding' | 'reasoning' | 'basic' | 'classification';

export type TaskType = 'coding' | 'reasoning' | 'basic' | 'classification';

export interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: unknown[];
    tool_call_id?: string;
  }>;
  stream?: boolean;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
    stop?: string[];
  };
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: unknown[];
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModelList {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      format: string;
      family: string;
      families: string[];
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

export interface ModelSelectorConfig {
  maxVramGb: number;
  preferredModels: {
    coding: string;
    reasoning: string;
    basic: string;
    classification: string;
  };
  fallbackChain: string[];
}