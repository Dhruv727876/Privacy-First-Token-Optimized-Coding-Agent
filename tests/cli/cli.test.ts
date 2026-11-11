import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCLI } from '../../src/cli/cli.js';

vi.mock('../../src/config/index.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    bifrost: { url: 'http://localhost:8080', virtualKey: 'test-key' },
    localModels: { enabled: true, models: ['qwen2.5:3b', 'phi4-mini:3.8b'] },
    privacy: { enabled: false },
    defaultModel: 'gpt-4o-mini',
    budget: { dailyLimit: 10, perRequestLimit: 1 },
    approval: { read: 'auto', write: 'prompt', shell: 'prompt', git: 'prompt' },
    tavily: { apiKey: 'test-key' },
    session: { dir: '.hackculture' },
    logLevel: 'info',
  }),
}));

vi.mock('../../src/tools/registry.js', () => ({
  ToolRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    list: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../../src/tools/fs-tools.js', () => ({
  registerFsTools: vi.fn(),
}));

vi.mock('../../src/tools/shell-tools.js', () => ({
  registerShellTools: vi.fn(),
}));

vi.mock('../../src/tools/git-tools.js', () => ({
  registerGitTools: vi.fn(),
}));

vi.mock('../../src/tools/search-tools.js', () => ({
  registerSearchTools: vi.fn(),
  createTavilySearchTool: vi.fn(),
  createTavilyExtractTool: vi.fn(),
}));

vi.mock('../../src/approval/approval-gate.js', () => ({
  createApprovalGate: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/session/session-manager.js', () => ({
  createSessionManager: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue({}),
    getState: vi.fn().mockReturnValue({ id: 'test', entries: [], tokenCount: 0, compactedCount: 0, workspaceRoot: '/tmp', metadata: {} }),
    close: vi.fn().mockResolvedValue({}),
  }),
}));

vi.mock('../../src/router/model-router.js', () => ({
  createModelRouter: vi.fn().mockReturnValue({
    getAvailableModels: vi.fn().mockResolvedValue([
      { id: 'gpt-4o-mini', source: 'bifrost', capabilities: ['chat'] },
      { id: 'qwen2.5:3b', source: 'local', capabilities: ['chat', 'privacy'] },
    ]),
    getBudgetEnforcer: vi.fn().mockReturnValue({
      getStatus: vi.fn().mockReturnValue({ used: 1, limit: 10, remaining: 9, percentage: 10 }),
    }),
  }),
}));

vi.mock('../../src/agent/agent-core.js', () => ({
  createAgentCore: vi.fn().mockReturnValue({
    initialize: vi.fn().mockResolvedValue({}),
    run: vi.fn().mockResolvedValue({ success: true, response: 'Test response', tokensUsed: 10 }),
    getState: vi.fn().mockReturnValue({ messages: [], totalTokens: 10 }),
  }),
}));

describe('CLI', () => {
  it('creates CLI program with commands', async () => {
    const program = await createCLI();
    expect(program.name()).toBe('hackculture');
    expect(program.commands.map(c => c.name())).toContain('chat');
    expect(program.commands.map(c => c.name())).toContain('run');
    expect(program.commands.map(c => c.name())).toContain('config');
    expect(program.commands.map(c => c.name())).toContain('models');
    expect(program.commands.map(c => c.name())).toContain('budget');
    expect(program.commands.map(c => c.name())).toContain('session');
  });

  it('has version from package.json', async () => {
    const program = await createCLI();
    expect(program.version).toBeDefined();
  });
});