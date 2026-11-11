import type { ToolCall, ToolContext } from '../tools/types.js';

export type ApprovalDecision = 'allow' | 'deny' | 'allow-session' | 'allow-always';

export interface ApprovalRequest {
  id: string;
  toolCall: ToolCall;
  context: ToolContext;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface ApprovalResponse {
  requestId: string;
  decision: ApprovalDecision;
  rememberForSession?: boolean;
  rememberAlways?: boolean;
}

export interface ApprovalPolicy {
  read: 'auto' | 'prompt' | 'deny' | 'batch';
  write: 'auto' | 'prompt' | 'deny' | 'batch';
  shell: 'auto' | 'prompt' | 'deny' | 'batch';
  git: 'auto' | 'prompt' | 'deny' | 'batch';
  search: 'auto' | 'prompt' | 'deny' | 'batch';
}

export interface AllowlistEntry {
  tool: string;
  argsPattern?: Record<string, string>;
  scope: 'session' | 'always';
}

export interface ApprovalGateConfig {
  policy: ApprovalPolicy;
  allowlist: AllowlistEntry[];
  autoApproveTimeout?: number;
}