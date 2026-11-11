export type ApprovalAction = 'auto' | 'prompt' | 'batch' | 'deny';

export interface ApprovalPolicy {
  read: ApprovalAction;
  write: ApprovalAction;
  shell: ApprovalAction;
  git: ApprovalAction;
  search: ApprovalAction;
  allowlist?: {
    commands: string[];
    paths: string[];
  };
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  requiresApproval: (policy: ApprovalPolicy) => boolean;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ToolContext {
  workspaceRoot: string;
  approvalPolicy: ApprovalPolicy;
  sessionId?: string;
  isConfidential?: boolean;
}

export interface BatchToolResult {
  results: ToolResult[];
  approved: boolean;
  requiresApproval: boolean;
}

export type ToolCategory = 'read' | 'write' | 'shell' | 'git' | 'search';

export function getToolCategory(name: string): ToolCategory {
  if (name.startsWith('read_') || name.startsWith('list_') || name === 'glob' || name === 'grep') {
    return 'read';
  }
  if (name.startsWith('write_') || name.startsWith('edit_') || name === 'delete_file') {
    return 'write';
  }
  if (name === 'run_command') return 'shell';
  if (name.startsWith('git_')) return 'git';
  if (name.startsWith('tavily_')) return 'search';
  return 'read';
}

export function requiresApproval(name: string, policy: ApprovalPolicy): boolean {
  const category = getToolCategory(name);
  const action = policy[category];
  return action !== 'auto';
}