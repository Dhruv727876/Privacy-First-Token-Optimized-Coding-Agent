import type { ToolCall, ToolResult, ToolContext, ApprovalPolicy } from '../tools/types.js';
import type { RouterContext } from '../router/types.js';
import type { SessionState } from '../session/types.js';

export interface AgentConfig {
  name: string;
  systemPrompt: string;
  maxIterations: number;
  maxTokens: number;
  enablePlanning: boolean;
  tokenBudget: number;
}

export interface AgentState {
  sessionId: string;
  messages: AgentMessage[];
  currentPlan?: Plan;
  iteration: number;
  totalTokens: number;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
  timestamp: number;
}

export interface Plan {
  steps: PlanStep[];
  goal: string;
  createdAt: number;
  updatedAt: number;
}

export interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

export interface AgentContext extends ToolContext {
  agentConfig: AgentConfig;
  sessionState: SessionState;
  routerContext: RouterContext;
  approvalPolicy: ApprovalPolicy;
}

export interface ExecutionResult {
  success: boolean;
  response?: string;
  toolResults?: ToolResult[];
  tokensUsed: number;
  error?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}