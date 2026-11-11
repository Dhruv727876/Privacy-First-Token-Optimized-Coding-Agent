import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, createDefaultRegistry } from '../../src/tools/registry.js';
import type { Tool, ToolCall, ToolContext, ApprovalPolicy, ToolResult } from '../../src/tools/types.js';

const mockPolicy: ApprovalPolicy = {
  read: 'auto',
  write: 'prompt',
  shell: 'prompt',
  git: 'prompt',
};

const mockContext: ToolContext = {
  workspaceRoot: '/tmp/test-workspace',
  approvalPolicy: mockPolicy,
  sessionId: 'test-session',
};

const mockReadTool: Tool = {
  name: 'read_file',
  description: 'Read a file',
  parameters: { path: { type: 'string', description: 'Path', required: true } },
  requiresApproval: () => false,
  async execute(args: Record<string, unknown>) {
    return { success: true, output: `content of ${args.path}` };
  },
};

const mockWriteTool: Tool = {
  name: 'write_file',
  description: 'Write a file',
  parameters: { path: { type: 'string', description: 'Path', required: true }, content: { type: 'string', description: 'Content', required: true } },
  requiresApproval: (policy) => policy.write !== 'auto',
  async execute(args: Record<string, unknown>) {
    return { success: true, output: `wrote ${args.path}` };
  },
};

const mockShellTool: Tool = {
  name: 'run_command',
  description: 'Run a command',
  parameters: { command: { type: 'string', description: 'Command', required: true } },
  requiresApproval: (policy) => policy.shell !== 'auto',
  async execute(args: Record<string, unknown>) {
    return { success: true, output: { stdout: 'ok', code: 0 } };
  },
};

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    registry.register(mockReadTool);
    registry.register(mockWriteTool);
    registry.register(mockShellTool);
  });

  it('registers and retrieves tools', () => {
    expect(registry.get('read_file')).toBeDefined();
    expect(registry.get('write_file')).toBeDefined();
    expect(registry.list()).toHaveLength(3);
  });

  it('executes read tool (auto-approved)', async () => {
    const call: ToolCall = { name: 'read_file', args: { path: 'test.txt' } };
    const result = await registry.execute(call, mockContext);
    expect(result.success).toBe(true);
    expect(result.approved).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });

  it('write tool requires approval', async () => {
    const call: ToolCall = { name: 'write_file', args: { path: 'test.txt', content: 'hello' } };
    const result = await registry.execute(call, mockContext);
    expect(result.success).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.approved).toBe(false);
    expect(result.error).toContain('Approval required');
  });

  it('shell tool requires approval', async () => {
    const call: ToolCall = { name: 'run_command', args: { command: 'ls' } };
    const result = await registry.execute(call, mockContext);
    expect(result.requiresApproval).toBe(true);
    expect(result.approved).toBe(false);
  });

  it('returns error for unknown tool', async () => {
    const call: ToolCall = { name: 'unknown_tool', args: {} };
    const result = await registry.execute(call, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('executeBatch returns requiresApproval when batch policy', async () => {
    const batchContext = { ...mockContext, approvalPolicy: { ...mockPolicy, write: 'batch' as const } };
    const calls: ToolCall[] = [
      { name: 'write_file', args: { path: 'a.txt', content: '1' } },
    ];
    const result = await registry.executeBatch(calls, batchContext);
    expect(result.approved).toBe(false);
    expect(result.requiresApproval).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('executeBatch approves when all tools are auto', async () => {
    const autoContext = { ...mockContext, approvalPolicy: { read: 'auto', write: 'auto', shell: 'auto', git: 'auto' } };
    const calls: ToolCall[] = [
      { name: 'read_file', args: { path: 'a.txt' } },
      { name: 'write_file', args: { path: 'b.txt', content: '2' } },
    ];
    const result = await registry.executeBatch(calls, autoContext);
    expect(result.approved).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].success).toBe(true);
  });
});

describe('createDefaultRegistry', () => {
  it('creates registry with policy', () => {
    const registry = createDefaultRegistry(mockPolicy);
    expect(registry).toBeInstanceOf(ToolRegistry);
  });
});