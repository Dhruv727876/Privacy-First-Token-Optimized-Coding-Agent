import type {
  ApprovalRequest,
  ApprovalResponse,
  ApprovalPolicy,
  AllowlistEntry,
  ApprovalGateConfig,
} from './types.js';
import type { ToolCall } from '../tools/types.js';
import { getToolCategory } from '../tools/types.js';

export class ApprovalGate {
  private config: ApprovalGateConfig;
  private sessionAllowlist: AllowlistEntry[] = [];
  private pendingRequests = new Map<string, ApprovalRequest>();

  constructor(config: ApprovalGateConfig) {
    this.config = config;
    this.sessionAllowlist = [...config.allowlist];
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
    // Check if auto-approved by policy
    const category = getToolCategory(request.toolCall.name);
    const policy = this.config.policy[category];

    if (policy === 'auto') {
      return {
        requestId: request.id,
        decision: 'allow',
      };
    }

    if (policy === 'deny') {
      return {
        requestId: request.id,
        decision: 'deny',
      };
    }

    // Check session allowlist
    if (this.matchesAllowlist(request.toolCall, this.sessionAllowlist)) {
      return {
        requestId: request.id,
        decision: 'allow',
      };
    }

    // Check global allowlist
    if (this.matchesAllowlist(request.toolCall, this.config.allowlist)) {
      return {
        requestId: request.id,
        decision: 'allow',
      };
    }

    // Store pending request for UI to handle
    this.pendingRequests.set(request.id, request);

    // In a real implementation, this would wait for UI response
    // For now, we return a pending response that the UI will resolve
    return {
      requestId: request.id,
      decision: 'allow', // Placeholder - UI will override
      rememberForSession: false,
      rememberAlways: false,
    };
  }

  resolveApproval(response: ApprovalResponse): void {
    const request = this.pendingRequests.get(response.requestId);
    if (!request) return;

    // Handle remember decisions
    if (response.rememberForSession) {
      this.sessionAllowlist.push({
        tool: request.toolCall.name,
        argsPattern: this.extractArgsPattern(request.toolCall.args),
        scope: 'session',
      });
    }

    if (response.rememberAlways) {
      this.config.allowlist.push({
        tool: request.toolCall.name,
        argsPattern: this.extractArgsPattern(request.toolCall.args),
        scope: 'always',
      });
    }

    this.pendingRequests.delete(response.requestId);
  }

  getPendingRequests(): ApprovalRequest[] {
    return Array.from(this.pendingRequests.values());
  }

  clearPending(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  private matchesAllowlist(toolCall: ToolCall, allowlist: AllowlistEntry[]): boolean {
    return allowlist.some(entry => {
      if (entry.tool !== toolCall.name) return false;
      if (!entry.argsPattern) return true;
      return this.matchArgs(toolCall.args, entry.argsPattern);
    });
  }

  private matchArgs(args: Record<string, unknown>, pattern: Record<string, string>): boolean {
    return Object.entries(pattern).every(([key, value]) => {
      const argValue = args[key];
      if (argValue === undefined) return false;
      // Simple string match or regex
      const argStr = String(argValue);
      try {
        return new RegExp(value).test(argStr);
      } catch {
        return argStr === value;
      }
    });
  }

  private extractArgsPattern(args: Record<string, unknown>): Record<string, string> {
    const pattern: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        pattern[key] = value;
      }
    }
    return pattern;
  }

  getConfig(): ApprovalGateConfig {
    return { ...this.config, allowlist: [...this.config.allowlist] };
  }

  updatePolicy(policy: Partial<ApprovalPolicy>): void {
    this.config.policy = { ...this.config.policy, ...policy };
  }
}

export function createApprovalGate(config: ApprovalGateConfig): ApprovalGate {
  return new ApprovalGate(config);
}