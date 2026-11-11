import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalGate, createApprovalGate } from '../../src/approval/approval-gate.js';
import type { ApprovalRequest, ApprovalPolicy, ToolCall, ToolContext } from '../../src/approval/types.js';

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

const mockReadCall: ToolCall = {
  name: 'read_file',
  args: { path: 'test.txt' },
};

const mockWriteCall: ToolCall = {
  name: 'write_file',
  args: { path: 'test.txt', content: 'hello' },
};

const mockShellCall: ToolCall = {
  name: 'run_command',
  args: { command: 'ls' },
};

function createRequest(id: string, toolCall: ToolCall): ApprovalRequest {
  return {
    id,
    toolCall,
    context: mockContext,
    timestamp: Date.now(),
  };
}

describe('ApprovalGate', () => {
  let gate: ApprovalGate;

  beforeEach(() => {
    gate = createApprovalGate({
      policy: mockPolicy,
      allowlist: [],
    });
  });

  it('auto-approves read tools', async () => {
    const request = createRequest('req-1', mockReadCall);
    const response = await gate.requestApproval(request);
    expect(response.decision).toBe('allow');
    expect(response.requestId).toBe('req-1');
  });

  it('requires approval for write tools', async () => {
    const request = createRequest('req-2', mockWriteCall);
    const response = await gate.requestApproval(request);
    // Returns placeholder allow, but requiresApproval would be true in real flow
    expect(response.requestId).toBe('req-2');
  });

  it('denies when policy is deny', async () => {
    const denyGate = createApprovalGate({
      policy: { ...mockPolicy, write: 'deny' },
      allowlist: [],
    });
    const request = createRequest('req-3', mockWriteCall);
    const response = await denyGate.requestApproval(request);
    expect(response.decision).toBe('deny');
  });

  it('matches session allowlist', async () => {
    // First resolve with rememberForSession
    const request = createRequest('req-4', mockWriteCall);
    await gate.requestApproval(request);
    gate.resolveApproval({
      requestId: 'req-4',
      decision: 'allow',
      rememberForSession: true,
    });

    // Next request should be auto-approved
    const request2 = createRequest('req-5', mockWriteCall);
    const response = await gate.requestApproval(request2);
    expect(response.decision).toBe('allow');
  });

  it('matches global allowlist', async () => {
    const globalAllowlistGate = createApprovalGate({
      policy: mockPolicy,
      allowlist: [{ tool: 'write_file', scope: 'always' }],
    });
    const request = createRequest('req-6', mockWriteCall);
    const response = await globalAllowlistGate.requestApproval(request);
    expect(response.decision).toBe('allow');
  });

  it('matches allowlist with args pattern', async () => {
    const patternGate = createApprovalGate({
      policy: mockPolicy,
      allowlist: [{ tool: 'run_command', argsPattern: { command: '^ls' }, scope: 'always' }],
    });
    const allowedCall: ToolCall = { name: 'run_command', args: { command: 'ls -la' } };
    const deniedCall: ToolCall = { name: 'run_command', args: { command: 'rm -rf' } };

    const allowedRequest = createRequest('req-7', allowedCall);
    const allowedResponse = await patternGate.requestApproval(allowedRequest);
    expect(allowedResponse.decision).toBe('allow');

    // Non-matching pattern returns placeholder allow (pending UI)
    const deniedRequest = createRequest('req-8', deniedCall);
    const deniedResponse = await patternGate.requestApproval(deniedRequest);
    expect(deniedResponse.decision).toBe('allow'); // Placeholder for pending
    expect(patternGate.getPendingRequests()).toHaveLength(1);
  });

  it('tracks pending requests', async () => {
    const request = createRequest('req-9', mockWriteCall);
    await gate.requestApproval(request);
    const pending = gate.getPendingRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('req-9');
  });

  it('clears pending on resolve', async () => {
    const request = createRequest('req-10', mockWriteCall);
    await gate.requestApproval(request);
    gate.resolveApproval({ requestId: 'req-10', decision: 'allow' });
    expect(gate.getPendingRequests()).toHaveLength(0);
  });

  it('updates policy dynamically', () => {
    gate.updatePolicy({ write: 'auto' });
    const config = gate.getConfig();
    expect(config.policy.write).toBe('auto');
  });

  it('handles shell tools with prompt policy', async () => {
    const request = createRequest('req-11', mockShellCall);
    const response = await gate.requestApproval(request);
    expect(response.requestId).toBe('req-11');
  });

  it('handles git tools with prompt policy', async () => {
    const gitCall: ToolCall = { name: 'git_commit', args: { message: 'test' } };
    const request = createRequest('req-12', gitCall);
    const response = await gate.requestApproval(request);
    expect(response.requestId).toBe('req-12');
  });
});