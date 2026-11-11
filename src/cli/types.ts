import type { ApprovalRequest } from '../approval/types.js';
import type { Plan } from '../agent/types.js';

export interface CLIConfig {
  workspaceRoot: string;
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
  approvalPolicy: {
    read: 'auto' | 'prompt' | 'deny' | 'batch';
    write: 'auto' | 'prompt' | 'deny' | 'batch';
    shell: 'auto' | 'prompt' | 'deny' | 'batch';
    git: 'auto' | 'prompt' | 'deny' | 'batch';
    search: 'auto' | 'prompt' | 'deny' | 'batch';
  };
  tavilyApiKey?: string;
  sessionDir: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export interface CLICommand {
  name: string;
  description: string;
  options?: CLICommandOption[];
  action: (args: Record<string, unknown>, config: CLIConfig) => Promise<void>;
}

export interface CLICommandOption {
  flags: string;
  description: string;
  defaultValue?: unknown;
}

export interface TUIState {
  mode: 'chat' | 'approval' | 'plan' | 'settings';
  messages: TUIMessage[];
  input: string;
  pendingApproval?: ApprovalRequest;
  plan?: Plan;
  tokensUsed: number;
  budgetRemaining: number;
  currentModel: string;
  isProcessing: boolean;
}

export interface TUIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool' | 'error';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}