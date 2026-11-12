import { z } from 'zod';

export const BifrostConfigSchema = z.object({
  url: z.string().url().default('http://localhost:8080'),
  virtualKey: z.string().default('hackculture-default'),
  timeoutMs: z.number().int().positive().default(120000),
  retryAttempts: z.number().int().nonnegative().default(3),
  enableCodeMode: z.boolean().default(true),
  enableSemanticCache: z.boolean().default(true),
});

export const BudgetConfigSchema = z.object({
  dailyUsd: z.number().positive().default(10),
  monthlyUsd: z.number().positive().default(100),
  perTaskUsd: z.number().positive().default(5),
  alertThresholds: z.array(z.number().min(0).max(100)).default([50, 80, 100]),
  onExceed: z.enum(['pause_and_alert', 'fail', 'notify_only']).default('pause_and_alert'),
  webhookUrl: z.string().url().optional(),
});

export const PrivacyConfigSchema = z.object({
  defaultConfidential: z.boolean().default(false),
  confidentialPaths: z.array(z.string()).default([]),
  enforceLocalOnly: z.boolean().default(true),
  fallbackChain: z.array(z.string()).default(['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b']),
});

export const ApprovalConfigSchema = z.object({
  read: z.enum(['auto', 'prompt']).default('auto'),
  write: z.enum(['auto', 'prompt', 'batch', 'deny']).default('prompt'),
  shell: z.enum(['auto', 'prompt', 'batch', 'deny']).default('prompt'),
  git: z.enum(['auto', 'prompt', 'batch', 'deny']).default('prompt'),
  search: z.enum(['auto', 'prompt', 'batch', 'deny']).default('auto'),
  allowlist: z.object({
    commands: z.array(z.string()).default([]),
    paths: z.array(z.string()).default([]),
  }).optional(),
});

export const LocalModelsConfigSchema = z.object({
  ollamaUrl: z.string().url().default('http://localhost:11434'),
  maxVramGb: z.number().positive().default(4),
  preferredModels: z.object({
    coding: z.string().default('qwen2.5:3b'),
    reasoning: z.string().default('phi4-mini:3.8b'),
    basic: z.string().default('smollm2:1.7b'),
    classification: z.string().default('smollm2:1.7b'),
  }).default({
    coding: 'qwen2.5:3b',
    reasoning: 'phi4-mini:3.8b',
    basic: 'smollm2:1.7b',
    classification: 'smollm2:1.7b',
  }),
  autoPull: z.boolean().default(true),
  cpuFallback: z.boolean().default(true),
});

export const TavilyConfigSchema = z.object({
  apiKey: z.string().optional(),
  timeoutMs: z.number().int().positive().default(30000),
  maxResults: z.number().int().positive().default(5),
  searchDepth: z.enum(['basic', 'advanced']).default('advanced'),
  cacheTtlMs: z.number().int().positive().default(300000),
});

export const SessionConfigSchema = z.object({
  sessionDir: z.string().default('./sessions'),
  maxTokensBeforeCompact: z.number().int().positive().default(100000),
  compactModel: z.string().default('qwen2.5:3b'),
  retainCompactedTurns: z.number().int().positive().default(10),
});

export const AppConfigSchema = z.object({
  bifrost: BifrostConfigSchema,
  defaultModel: z.string().default('minimaxai/minimax-m3.1-flash'),
  budget: BudgetConfigSchema,
  privacy: PrivacyConfigSchema,
  approval: ApprovalConfigSchema,
  localModels: LocalModelsConfigSchema,
  tavily: TavilyConfigSchema,
  session: SessionConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type BifrostConfig = z.infer<typeof BifrostConfigSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
export type PrivacyConfig = z.infer<typeof PrivacyConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;
export type LocalModelsConfig = z.infer<typeof LocalModelsConfigSchema>;
export type TavilyConfig = z.infer<typeof TavilyConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

export interface ConfigOverrides {
  bifrostUrl?: string;
  bifrostVirtualKey?: string;
  budgetDailyUsd?: number;
  confidential?: boolean;
  ollamaUrl?: string;
  tavilyApiKey?: string;
  sessionDir?: string;
  resume?: string;
  configFile?: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  bifrost: BifrostConfigSchema.parse({}),
  defaultModel: 'minimaxai/minimax-m3.1-flash',
  budget: BudgetConfigSchema.parse({}),
  privacy: PrivacyConfigSchema.parse({}),
  approval: ApprovalConfigSchema.parse({}),
  localModels: LocalModelsConfigSchema.parse({}),
  tavily: TavilyConfigSchema.parse({}),
  session: SessionConfigSchema.parse({}),
};