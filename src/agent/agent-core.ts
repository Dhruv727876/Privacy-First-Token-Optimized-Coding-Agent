import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  AgentState,
  AgentMessage,
  AgentContext,
  ExecutionResult,
  TokenUsage,
} from './types.js';
import type { ToolCall, ToolResult } from '../tools/types.js';
import type { ChatCompletionRequest, ChatCompletionResponse } from '../gateway/types.js';
import type { RouterContext, ModelRouter } from '../router/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { ApprovalGate } from '../approval/approval-gate.js';
import { SessionManager } from '../session/session-manager.js';

const DEFAULT_SYSTEM_PROMPT = `You are a helpful coding assistant. You have access to tools for reading, writing, and editing files, running commands, and searching the web.

When given a task:
1. Analyze the request and create a plan if needed
2. Use tools to gather information and make changes
3. Provide clear explanations of what you did

Be concise and focus on solving the user's problem.`;

export class AgentCore {
  private config: AgentConfig;
  private state: AgentState;
  private toolRegistry: ToolRegistry;
  private approvalGate: ApprovalGate;
  private sessionManager: SessionManager;
  private modelRouter: ModelRouter;
  private context: AgentContext;

  constructor(
    config: Partial<AgentConfig>,
    toolRegistry: ToolRegistry,
    approvalGate: ApprovalGate,
    sessionManager: SessionManager,
    modelRouter: ModelRouter,
    context: AgentContext
  ) {
    this.config = {
      name: 'hackculture-agent',
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      maxIterations: 20,
      maxTokens: 100000,
      enablePlanning: true,
      tokenBudget: 50000,
      ...config,
    };

    this.toolRegistry = toolRegistry;
    this.approvalGate = approvalGate;
    this.sessionManager = sessionManager;
    this.modelRouter = modelRouter;
    this.context = context;

    this.state = {
      sessionId: context.sessionId || 'unknown',
      messages: [],
      iteration: 0,
      totalTokens: 0,
      toolCalls: [],
      toolResults: [],
    };
  }

  async initialize(): Promise<void> {
    // Add system prompt
    this.state.messages.push({
      role: 'system',
      content: this.config.systemPrompt,
      timestamp: Date.now(),
    });
  }

  async run(userInput: string): Promise<ExecutionResult> {
    // Add user message
    this.addMessage('user', userInput);

    let finalResponse = '';
    let totalTokens = 0;

    for (this.state.iteration = 0; this.state.iteration < this.config.maxIterations; this.state.iteration++) {
      // Check token budget
      if (this.state.totalTokens >= this.config.tokenBudget) {
        return {
          success: false,
          error: 'Token budget exceeded',
          tokensUsed: this.state.totalTokens,
        };
      }

      // Create plan if enabled and first iteration
      if (this.config.enablePlanning && this.state.iteration === 0) {
        await this.createPlan(userInput);
      }

      // Get model response
      const result = await this.getModelResponse();
      if (!result.success) {
        return { ...result, tokensUsed: totalTokens };
      }

      const { response, toolCalls, usage } = result;
      totalTokens += usage.totalTokens;
      this.state.totalTokens = totalTokens;

      // Add assistant message
      if (response) {
        this.addMessage('assistant', response, undefined, toolCalls);
        finalResponse = response;
      }

      // Execute tool calls if any
      if (toolCalls && toolCalls.length > 0) {
        const toolResults = await this.executeTools(toolCalls);
        this.state.toolResults.push(...toolResults);

        // Add tool results as messages
        for (const toolResult of toolResults) {
          const call = toolCalls.find(c => c.name === toolResult.metadata?.tool);
          this.addMessage('tool', JSON.stringify(toolResult.output || toolResult.error), call?.name);
        }

        // Check if all tools succeeded
        const allSuccess = toolResults.every(r => r.success);
        if (!allSuccess && this.state.iteration === this.config.maxIterations - 1) {
          return {
            success: false,
            response: finalResponse,
            toolResults,
            tokensUsed: totalTokens,
            error: 'Some tools failed',
          };
        }

        // Continue loop for next iteration
        continue;
      }

      // No tool calls - we're done
      break;
    }

    return {
      success: true,
      response: finalResponse,
      tokensUsed: totalTokens,
    };
  }

  private async createPlan(goal: string): Promise<void> {
    const planPrompt = `Create a step-by-step plan to accomplish: ${goal}

Available tools: ${this.toolRegistry.list().map(t => t.name).join(', ')}

Respond with a JSON plan:
{
  "steps": [
    {"id": "1", "description": "...", "tool": "tool_name", "args": {...}},
    ...
  ]
}`;

    this.addMessage('user', planPrompt);

    const result = await this.getModelResponse();
    if (result.success && result.response) {
      try {
        const planData = JSON.parse(result.response);
        this.state.currentPlan = {
          steps: (planData.steps as Array<{ id?: string; description: string; tool?: string; args?: Record<string, unknown> }>).map((s, i: number) => ({
            id: s.id || String(i + 1),
            description: s.description,
            tool: s.tool,
            args: s.args,
            status: 'pending' as const,
          })),
          goal,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      } catch {
        // Ignore parse errors, continue without plan
      }
    }
  }

  private async getModelResponse(): Promise<{
    success: boolean;
    response?: string;
    toolCalls?: ToolCall[];
    usage: TokenUsage;
  }> {
    // Build standard OpenAI function tool schemas
    const tools = this.toolRegistry.list().map(t => {
      const required: string[] = [];
      const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
      for (const [key, param] of Object.entries(t.parameters)) {
        if (param.required) {
          required.push(key);
        }
        properties[key] = {
          type: param.type,
          description: param.description,
          ...(param.enum ? { enum: param.enum } : {}),
        };
      }
      return {
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: {
            type: 'object' as const,
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        },
      };
    });

    const request: ChatCompletionRequest = {
      model: this.context.routerContext.request.model || 'auto',
      messages: this.state.messages.map(m => ({
        role: m.role,
        content: m.content,
        tool_calls: m.toolCalls?.map(tc => ({
          id: tc.id || tc.name,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
        tool_call_id: m.toolCallId,
      })),
      max_tokens: 4096,
      temperature: 0.2,
      tools,
    };

    // Route through model router
    const routerContext: RouterContext = {
      request,
      isConfidential: this.context.workspaceRoot.includes('confidential') || false,
      taskType: 'coding',
    };

    const decision = await this.modelRouter.route(routerContext);
    const response = await this.modelRouter.complete(request, decision);

    // Parse tool calls from response
    const toolCalls = this.parseToolCalls(response);

    // Estimate token usage
    const usage: TokenUsage = {
      promptTokens: this.estimateTokens(JSON.stringify(request.messages)),
      completionTokens: this.estimateTokens(response.choices[0]?.message?.content || ''),
      totalTokens: 0,
      estimatedCost: 0,
    };
    usage.totalTokens = usage.promptTokens + usage.completionTokens;
    usage.estimatedCost = decision.estimatedCost || 0;

    return {
      success: true,
      response: response.choices[0]?.message?.content ?? undefined,
      toolCalls,
      usage,
    };
  }

  private parseToolCalls(response: ChatCompletionResponse): ToolCall[] {
    const message = response.choices[0]?.message;
    if (!message?.tool_calls) return [];

    return message.tool_calls.map(tc => ({
      name: tc.function.name,
      args: JSON.parse(tc.function.arguments || '{}'),
    }));
  }

  private async executeTools(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const call of toolCalls) {
      // Check approval
      const approval = await this.approvalGate.requestApproval({
        id: randomUUID(),
        toolCall: call,
        context: this.context,
        timestamp: Date.now(),
      });

      if (approval.decision === 'deny') {
        results.push({
          success: false,
          error: 'Tool execution denied by user',
          requiresApproval: true,
          approved: false,
          metadata: { tool: call.name, args: call.args },
        });
        continue;
      }

      // Execute tool
      const result = await this.toolRegistry.execute(call, this.context);
      results.push(result);
      this.state.toolCalls.push(call);
    }

    return results;
  }

  private addMessage(role: AgentMessage['role'], content: string, toolCallId?: string, toolCalls?: ToolCall[]): void {
    this.state.messages.push({
      role,
      content,
      toolCallId,
      toolCalls,
      timestamp: Date.now(),
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  getState(): AgentState {
    return { ...this.state, messages: [...this.state.messages] };
  }

  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  getApprovalGate(): ApprovalGate {
    return this.approvalGate;
  }

  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  getModelRouter(): ModelRouter {
    return this.modelRouter;
  }
}

export function createAgentCore(
  config: Partial<AgentConfig>,
  toolRegistry: ToolRegistry,
  approvalGate: ApprovalGate,
  sessionManager: SessionManager,
  modelRouter: ModelRouter,
  context: AgentContext
): AgentCore {
  return new AgentCore(config, toolRegistry, approvalGate, sessionManager, modelRouter, context);
}