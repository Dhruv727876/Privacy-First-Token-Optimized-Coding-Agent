import type {
  Tool,
  ToolCall,
  ToolResult,
  ToolContext,
  ApprovalPolicy,
  BatchToolResult,
  ToolCategory,
} from './types.js';
import { getToolCategory, requiresApproval } from './types.js';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  async execute(call: ToolCall, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${call.name}`,
        requiresApproval: false,
        approved: false,
      };
    }

    const category = getToolCategory(call.name);
    const needsApproval = requiresApproval(call.name, context.approvalPolicy);

    if (needsApproval && context.approvalPolicy[category] !== 'batch') {
      return {
        success: false,
        error: `Approval required for ${call.name}`,
        requiresApproval: true,
        approved: false,
        metadata: { tool: call.name, args: call.args, category },
      };
    }

    try {
      const result = await tool.execute(call.args, context);
      return { ...result, requiresApproval: needsApproval, approved: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        requiresApproval: needsApproval,
        approved: needsApproval,
      };
    }
  }

  async executeBatch(calls: ToolCall[], context: ToolContext): Promise<BatchToolResult> {
    // Check if any tool has 'prompt', 'deny', or 'batch' policy (requires approval)
    const needsApproval = calls.some(call => {
      const category = getToolCategory(call.name);
      const policy = context.approvalPolicy[category];
      return policy === 'prompt' || policy === 'deny' || policy === 'batch';
    });

    if (needsApproval) {
      return {
        results: [],
        approved: false,
        requiresApproval: true,
      };
    }

    // All tools are 'auto' - execute them
    const results = await Promise.all(
      calls.map(call => this.execute(call, context))
    );

    return {
      results,
      approved: true,
      requiresApproval: false,
    };
  }

  getToolsByCategory(category: ToolCategory): Tool[] {
    return this.list().filter(t => getToolCategory(t.name) === category);
  }
}

export function createDefaultRegistry(_approvalPolicy: ApprovalPolicy): ToolRegistry {
  const registry = new ToolRegistry();
  // Tools will be registered by individual modules
  return registry;
}