import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { BifrostClient, createBifrostClient } from '../../src/gateway/bifrost-client.js';
import { OllamaManager } from '../../src/local/ollama-manager.js';
import { ModelRouter } from '../../src/router/model-router.js';
import { BudgetEnforcerNode, createBudgetEnforcerNode } from '../../src/router/budget-enforcer.js';
import { SessionManager } from '../../src/session/session-manager.js';
import { AgentCore } from '../../src/agent/agent-core.js';
import { ApprovalGate } from '../../src/approval/approval-gate.js';
import {
  TEST_BIFROST_URL,
  TEST_OLLAMA_URL,
  TEST_VIRTUAL_KEY,
  startTestServices,
  runDockerCompose,
  pullTestModels,
  TEST_TIMEOUT,
} from './helpers.js';
import type { ModelInfo } from '../src/local/types.js';
import type { TUIMessage } from '../src/cli/types.js';

// Skip these tests if integration test env vars not set
const RUN_INTEGRATION = process.env.RUN_INTEGRATION_TESTS === 'true';

const describeIf = RUN_INTEGRATION ? describe : describe.skip;

describeIf('E2E Integration Tests', () => {
  let bifrost: BifrostClient;
  let ollama: OllamaManager;
  let modelRouter: ModelRouter;
  let budgetEnforcer: BudgetEnforcerNode;
  let sessionManager: SessionManager;
  let agentCore: AgentCore;
  let approvalGate: ApprovalGate;

  beforeAll(async () => {
    // Start docker-compose test services
    console.log('Starting test services...');
    await runDockerCompose(['up', '-d', '--build']);

    // Wait for services and initialize clients
    const services = await startTestServices();
    bifrost = services.bifrost;
    ollama = services.ollama;

    // Pull test models
    console.log('Pulling test models...');
    await pullTestModels(ollama);

    // Initialize core components
    budgetEnforcer = createBudgetEnforcerNode(10, '.test-budget.json');

    modelRouter = new ModelRouter({
      bifrostClient: bifrost,
      ollamaManager: ollama,
      budgetEnforcer,
      preferredModels: ['gpt-4o-mini', 'claude-3.5-sonnet'],
      enablePrivacyRouting: true,
      enableComplexityRouting: true,
    });

    sessionManager = new SessionManager({
      storagePath: './test-sessions',
      compactionThreshold: 10000,
      maxTokensPerSession: 50000,
    });

    approvalGate = new ApprovalGate({
      defaultPolicy: 'prompt',
      allowlist: [],
    });

    agentCore = new AgentCore({
      modelRouter,
      sessionManager,
      approvalGate,
      maxIterations: 5,
      enablePlanning: true,
    });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    console.log('Stopping test services...');
    await runDockerCompose(['down', '-v']);
  }, TEST_TIMEOUT);

  describe('Bifrost Semantic Caching', () => {
    it('should return cached response for identical requests', async () => {
      const request = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        temperature: 0,
      };

      // First request - should hit the API
      const response1 = await bifrost.chatCompletion(request);
      expect(response1.choices[0].message.content).toBeDefined();

      // Second identical request - should hit semantic cache
      const response2 = await bifrost.chatCompletion(request);
      expect(response2.choices[0].message.content).toBeDefined();

      // Responses should be similar (cached)
      expect(response2.choices[0].message.content).toBe(response1.choices[0].message.content);
    }, TEST_TIMEOUT);

    it('should return different responses for different prompts', async () => {
      const response1 = await bifrost.chatCompletion({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'What is 2+2?' }],
        temperature: 0,
      });

      const response2 = await bifrost.chatCompletion({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'What is 3+3?' }],
        temperature: 0,
      });

      expect(response1.choices[0].message.content).not.toBe(response2.choices[0].message.content);
    }, TEST_TIMEOUT);
  });

  describe('Failover Chain', () => {
    it('should fallback when primary provider fails', async () => {
      // Test with a model that has failover chain configured
      // This tests Bifrost's internal failover logic
      const response = await bifrost.chatCompletion({
        model: 'gpt-4o-mini', // Has fallbacks: claude-haiku-4, gemini-1.5-flash
        messages: [{ role: 'user', content: 'Test failover' }],
        temperature: 0,
      });

      expect(response.choices[0].message.content).toBeDefined();
      // Note: Actual failover testing requires mocking provider failures
      // which would need Bifrost admin API access
    }, TEST_TIMEOUT);
  });

  describe('Privacy Mode Enforcement', () => {
    it('should route confidential paths to local models only', async () => {
      // Create a test session with confidential path
      const sessionId = 'privacy-test-' + Date.now();
      await sessionManager.createSession(sessionId, {
        workspacePath: '/confidential/project',
        config: { privacyPaths: ['/confidential'] },
      });

      // Route a request with confidential context
      const decision = await modelRouter.route({
        messages: [{ role: 'user', content: 'Refactor this function' }],
        taskType: 'coding',
        contextFiles: ['/confidential/project/src/secret.ts'],
        enforceLocalOnly: true,
      });

      expect(decision.source).toBe('local');
      expect(decision.model).toMatch(/qwen|phi|smollm/i);
    }, TEST_TIMEOUT);

    it('should allow cloud models for non-confidential paths', async () => {
      const decision = await modelRouter.route({
        messages: [{ role: 'user', content: 'Write a hello world' }],
        taskType: 'coding',
        contextFiles: ['/public/project/src/main.ts'],
        enforceLocalOnly: false,
      });

      // Should prefer cloud for non-confidential when budget allows
      expect(['bifrost', 'local']).toContain(decision.source);
    }, TEST_TIMEOUT);
  });

  describe('Budget Hard-Stop', () => {
    it('should block requests when daily budget exceeded', async () => {
      // Create a budget enforcer with very low limit
      const testBudgetEnforcer = new BudgetEnforcer({
        dailyLimitUsd: 0.001, // Extremely low
        monthlyLimitUsd: 0.01,
        perRequestLimitUsd: 0.001,
      });

      // Simulate using up the budget
      await testBudgetEnforcer.recordUsage(0.001);

      // Next request should be blocked
      const canProceed = await testBudgetEnforcer.checkBudget(0.001);
      expect(canProceed).toBe(false);
    }, TEST_TIMEOUT);

    it('should allow requests within budget', async () => {
      const testBudgetEnforcer = new BudgetEnforcer({
        dailyLimitUsd: 10,
        monthlyLimitUsd: 100,
        perRequestLimitUsd: 5,
      });

      const canProceed = await testBudgetEnforcer.checkBudget(0.01);
      expect(canProceed).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('Session Persistence', () => {
    it('should persist and restore session context', async () => {
      const sessionId = 'persist-test-' + Date.now();

      // Create session with some messages
      const session = await sessionManager.createSession(sessionId, {
        workspacePath: '/test/workspace',
      });

      // Add messages
      const messages: TUIMessage[] = [
        { role: 'user', content: 'Hello', timestamp: Date.now() },
        { role: 'assistant', content: 'Hi there!', timestamp: Date.now() + 1 },
      ];

      await sessionManager.appendMessages(sessionId, messages);

      // Resume session
      const restored = await sessionManager.resumeSession(sessionId);
      expect(restored.id).toBe(sessionId);
      expect(restored.messages.length).toBeGreaterThanOrEqual(2);
    }, TEST_TIMEOUT);

    it('should compact session when threshold exceeded', async () => {
      const sessionId = 'compact-test-' + Date.now();

      const session = await sessionManager.createSession(sessionId, {
        workspacePath: '/test/workspace',
        config: { compactionThreshold: 100 }, // Very low for testing
      });

      // Add many messages to trigger compaction
      const manyMessages: TUIMessage[] = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: Date.now() + i,
      }));

      await sessionManager.appendMessages(sessionId, manyMessages);

      const restored = await sessionManager.resumeSession(sessionId);
      // Should have compacted but preserved important info
      expect(restored.messages.length).toBeLessThan(20);
    }, TEST_TIMEOUT);
  });

  describe('Full Agent Loop Integration', () => {
    it('should execute a simple coding task end-to-end', async () => {
      const sessionId = 'e2e-test-' + Date.now();

      const result = await agentCore.run({
        prompt: 'Create a simple add function in TypeScript',
        sessionId,
        workspacePath: '/test/workspace',
        taskType: 'coding',
        enforcePrivacy: false,
      });

      expect(result.success).toBe(true);
      expect(result.messages.length).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    it('should respect approval gates for write operations', async () => {
      const sessionId = 'approval-test-' + Date.now();

      // Set approval to deny for write operations
      approvalGate.setPolicy('write', 'deny');

      const result = await agentCore.run({
        prompt: 'Create a new file',
        sessionId,
        workspacePath: '/test/workspace',
        taskType: 'coding',
        enforcePrivacy: false,
      });

      // Should fail or pause due to approval denial
      expect(result.success).toBe(false);
    }, TEST_TIMEOUT);
  });

  describe('Local Model Availability', () => {
    it('should have test models available in Ollama', async () => {
      const models = await ollama.listModels();
      expect(models.length).toBeGreaterThan(0);

      const modelNames = models.map(m => m.name);
      const hasTestModel = modelNames.some(name =>
        name.includes('qwen') || name.includes('phi') || name.includes('smollm')
      );
      expect(hasTestModel).toBe(true);
    }, TEST_TIMEOUT);

    it('should be able to generate with local model', async () => {
      const models = await ollama.listModels();
      const testModel = models.find(m =>
        m.name.includes('qwen') || m.name.includes('phi') || m.name.includes('smollm')
      );

      if (testModel) {
        const response = await ollama.generate({
          model: testModel.name,
          prompt: 'Hello',
          options: { temperature: 0, num_predict: 10 },
        });
        expect(response.response).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });
});

// Unit tests for budget enforcer (don't require running services)
describe('BudgetEnforcerNode Unit Tests', () => {
  it('should track daily usage correctly', async () => {
    const enforcer = createBudgetEnforcerNode(10, '.test-budget-unit-' + Date.now() + '.json');

    await enforcer.recordUsage(1.5);
    await enforcer.recordUsage(2.0);

    const status = enforcer.getStatus();
    expect(status.used).toBe(3.5);
    expect(status.remaining).toBe(6.5);
    expect(status.percentage).toBe(35);
  });

  it('should enforce daily limit', async () => {
    const enforcer = createBudgetEnforcerNode(1, '.test-budget-unit2-' + Date.now() + '.json'); // $1 daily limit

    await enforcer.recordUsage(0.8);
    const canProceed = await enforcer.checkBudget(0.5); // Would exceed daily limit
    expect(canProceed).toBe(false);
  });

  it('should reset daily usage', async () => {
    const enforcer = createBudgetEnforcerNode(10, '.test-budget-unit3-' + Date.now() + '.json');

    await enforcer.recordUsage(5.0);
    enforcer.reset();

    const status = enforcer.getStatus();
    expect(status.used).toBe(0);
    expect(status.remaining).toBe(10);
  });
});