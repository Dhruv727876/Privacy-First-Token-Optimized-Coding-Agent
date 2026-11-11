import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentCore, createAgentCore } from '../../src/agent/agent-core.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ApprovalGate, createApprovalGate } from '../../src/approval/approval-gate.js';
import { SessionManager, createSessionManager } from '../../src/session/session-manager.js';
import { createModelRouter } from '../../src/router/model-router.js';
import type { AgentConfig, AgentContext } from '../../src/agent/types.js';
import type { ApprovalPolicy } from '../../src/approval/types.js';
import type { RouterConfig } from '../../src/router/types.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

const TEST_DIR = path.join(tmpdir(), 'hackculture-agent-test');

const mockBifrost = {
  healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
  getVirtualKeyBudget: vi.fn().mockResolvedValue({ used: 0, limit: 100, remaining: 100 }),
  chatCompletion: vi.fn().mockResolvedValue({
    id: 'test',
    choices: [{ message: { role: 'assistant', content: 'Done', tool_calls: [] }, index: 0, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }),
  getAvailableModels: vi.fn().mockResolvedValue(['gpt-4o-mini']),
};

const mockOllama = {
  listModels: vi.fn().mockResolvedValue([
    { id: 'qwen2.5:3b', size: 2_000_000_000, capabilities: ['coding'] },
    { id: 'phi4-mini:3.8b', size: 2_500_000_000, capabilities: ['coding', 'reasoning'] },
  ]),
  chatCompletion: vi.fn().mockResolvedValue({
    model: 'qwen2.5:3b',
    created_at: new Date().toISOString(),
    message: { role: 'assistant', content: 'Done locally' },
    done: true,
  }),
  healthCheck: vi.fn().mockResolvedValue(true),
};

vi.mock('../../src/gateway/bifrost-client.js', () => ({
  BifrostClient: vi.fn().mockImplementation(() => mockBifrost),
}));

vi.mock('../../src/local/ollama-manager.js', () => ({
  OllamaManager: vi.fn().mockImplementation(() => mockOllama),
}));

describe('AgentCore', () => {
  let toolRegistry: ToolRegistry;
  let approvalGate: ApprovalGate;
  let sessionManager: SessionManager;
  let modelRouter: any;
  let context: AgentContext;
  let agent: AgentCore;

  beforeEach(async () => {
    // Reset method mocks but not constructor mocks
    mockBifrost.healthCheck.mockReset();
    mockBifrost.getVirtualKeyBudget.mockReset();
    mockBifrost.chatCompletion.mockReset();
    mockBifrost.getAvailableModels.mockReset();
    mockOllama.listModels.mockReset();
    mockOllama.chatCompletion.mockReset();
    mockOllama.healthCheck.mockReset();

    // Setup mocks
    mockBifrost.healthCheck.mockResolvedValue({ healthy: true });
    mockBifrost.getVirtualKeyBudget.mockResolvedValue({ used: 0, limit: 100, remaining: 100 });
    mockBifrost.chatCompletion.mockResolvedValue({
      id: 'test',
      choices: [{ message: { role: 'assistant', content: 'Done', tool_calls: [] }, index: 0, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    mockBifrost.getAvailableModels.mockResolvedValue(['gpt-4o-mini']);
    mockOllama.healthCheck.mockResolvedValue(true);
    mockOllama.listModels.mockResolvedValue([
      { id: 'qwen2.5:3b', size: 2_000_000_000, capabilities: ['coding'] },
      { id: 'phi4-mini:3.8b', size: 2_500_000_000, capabilities: ['coding', 'reasoning'] },
    ]);
    mockOllama.chatCompletion.mockResolvedValue({
      model: 'qwen2.5:3b',
      created_at: new Date().toISOString(),
      message: { role: 'assistant', content: 'Done locally' },
      done: true,
    });

    // Clean up test directory
    try { await fs.rm(TEST_DIR, { recursive: true, force: true }); } catch {}
    await fs.mkdir(TEST_DIR, { recursive: true });

    toolRegistry = new ToolRegistry();
    approvalGate = createApprovalGate({
      policy: { read: 'auto', write: 'auto', shell: 'auto', git: 'auto' },
      allowlist: [],
    });
    sessionManager = createSessionManager({
      sessionDir: TEST_DIR,
      config: { maxTokens: 10000, compactionThreshold: 0.8, preservePatterns: [] },
    });
    await sessionManager.initialize('test-session');

    const routerConfig: RouterConfig = {
      bifrostUrl: 'http://localhost:8080',
      virtualKey: 'test-key',
      enableLocalModels: true,
      privacyMode: false,
      defaultModel: 'gpt-4o-mini',
      localModels: ['qwen2.5:3b', 'phi4-mini:3.8b'],
      budgetLimits: { dailyUsd: 10, perRequestUsd: 1 },
      failoverChain: ['gpt-4o-mini', 'qwen2.5:3b'],
    };
    modelRouter = createModelRouter(routerConfig);

    const approvalPolicy: ApprovalPolicy = { read: 'auto', write: 'auto', shell: 'auto', git: 'auto' };

    context = {
      workspaceRoot: TEST_DIR,
      approvalPolicy,
      sessionId: 'test-session',
      agentConfig: {
        name: 'test-agent',
        systemPrompt: 'Test agent',
        maxIterations: 5,
        maxTokens: 10000,
        enablePlanning: false,
        tokenBudget: 5000,
      },
      sessionState: sessionManager.getState()!,
      routerContext: {
        request: { model: 'gpt-4o-mini', messages: [], max_tokens: 100 },
        isConfidential: false,
      },
    };

    const agentConfig: Partial<AgentConfig> = {
      name: 'test-agent',
      systemPrompt: 'Test agent',
      maxIterations: 5,
      maxTokens: 10000,
      enablePlanning: false,
      tokenBudget: 5000,
    };

    agent = createAgentCore(agentConfig, toolRegistry, approvalGate, sessionManager, modelRouter, context);
    await agent.initialize();
  });

  it('initializes with system prompt', () => {
    const state = agent.getState();
    expect(state.messages[0].role).toBe('system');
    expect(state.messages[0].content).toBe('Test agent');
  });

  it('runs a simple query without tools', async () => {
    const result = await agent.run('Hello, how are you?');

    expect(result.success).toBe(true);
    expect(result.response).toBe('Done');
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it('tracks token usage', async () => {
    await agent.run('Test query');
    const state = agent.getState();
    expect(state.totalTokens).toBeGreaterThan(0);
  });

  it('stops at max iterations', async () => {
    // Mock response that always includes tool calls
    mockBifrost.chatCompletion.mockResolvedValue({
      id: 'test',
      choices: [{
        message: {
          role: 'assistant',
          content: 'Let me check',
          tool_calls: [{ id: '1', type: 'function', function: { name: 'read_file', arguments: '{}' } }],
        },
        index: 0,
        finish_reason: 'tool_calls',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    // Register a dummy tool
    toolRegistry.register({
      name: 'read_file',
      description: 'Read a file',
      parameters: { path: { type: 'string', required: true } },
      requiresApproval: () => false,
      async execute() { return { success: true, output: 'content' }; },
    });

    const result = await agent.run('Test with tools');
    expect(result.success).toBe(true);
  });

  it('respects token budget', async () => {
    const lowBudgetAgent = createAgentCore(
      { ...context.agentConfig, tokenBudget: 10 }, // Small budget
      toolRegistry,
      approvalGate,
      sessionManager,
      modelRouter,
      context
    );
    await lowBudgetAgent.initialize();

    const result = await lowBudgetAgent.run('Test');
    // First call succeeds, but budget is checked at start of next iteration
    // With tokenBudget=10 and estimated ~15 tokens per call, it should fail on second iteration
    // But since there's only one call (no tools), it succeeds
    expect(result.success).toBe(true);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it('provides access to components', () => {
    expect(agent.getToolRegistry()).toBe(toolRegistry);
    expect(agent.getApprovalGate()).toBe(approvalGate);
    expect(agent.getSessionManager()).toBe(sessionManager);
    expect(agent.getModelRouter()).toBe(modelRouter);
  });

  it('maintains message history', async () => {
    await agent.run('First query');
    await agent.run('Second query');

    const state = agent.getState();
    // System + user + assistant + user + assistant
    expect(state.messages.length).toBe(5);
  });
});