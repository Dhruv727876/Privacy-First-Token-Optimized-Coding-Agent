import { Command } from 'commander';
import { loadConfig } from '../config/index.js';
import { createAgentCore } from '../agent/agent-core.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerFsTools } from '../tools/fs-tools.js';
import { registerShellTools } from '../tools/shell-tools.js';
import { registerGitTools } from '../tools/git-tools.js';
import { registerSearchTools } from '../tools/search-tools.js';
import { ApprovalGate, createApprovalGate } from '../approval/approval-gate.js';
import { SessionManager, createSessionManager } from '../session/session-manager.js';
import { createModelRouter } from '../router/model-router.js';
import { createTavilyClient } from '../tavily/tavily-client.js';
import { runTUI } from './tui/index.js';
import { createLogger, getLogger, logEvent } from '../logger.js';
import type { CLIConfig } from './types.js';
import type { AgentConfig, AgentContext, Plan } from '../agent/types.js';
import type { ApprovalPolicy } from '../tools/types.js';
import type { RouterConfig, ModelRouter } from '../router/types.js';
import type { TUIState, TUIMessage } from './types.js';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

const packageJson = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, '../../package.json'), 'utf-8'));

// Graceful shutdown handler
let shutdownInitiated = false;
let activeSessionManager: { close: () => Promise<void> } | null = null;

function setupGracefulShutdown(): void {
  const shutdown = async (signal: string) => {
    if (shutdownInitiated) return;
    shutdownInitiated = true;

    const logger = getLogger();
    logEvent(logger, 'system:shutdown', { reason: signal, graceful: true }, 'info');
    logger.info({ signal }, 'Shutdown signal received, cleaning up...');

    if (activeSessionManager) {
      try {
        await activeSessionManager.close();
        logger.info('Session saved successfully');
      } catch (error) {
        logger.error({ err: error }, 'Failed to save session');
      }
    }

    // Give time for logs to flush
    await new Promise(resolve => setTimeout(resolve, 100));
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGHUP', () => shutdown('SIGHUP'));
}

export async function createCLI(): Promise<Command> {
  const program = new Command();

  program
    .name('hackculture')
    .description('Privacy-first, token-optimized coding agent with Bifrost gateway integration')
    .version(packageJson.version)
    .option('-w, --workspace <path>', 'Workspace root directory', process.cwd())
    .option('-c, --config <path>', 'Config file path')
    .option('--bifrost-url <url>', 'Bifrost gateway URL')
    .option('--virtual-key <key>', 'Bifrost virtual key')
    .option('--no-local-models', 'Disable local models')
    .option('--privacy-mode', 'Enable privacy mode (local only for confidential code)')
    .option('--model <model>', 'Default model to use')
    .option('--budget <usd>', 'Daily budget in USD', '10')
    .option('--tavily-key <key>', 'Tavily API key')
    .option('--session-dir <path>', 'Session directory')
    .option('--log-level <level>', 'Log level', 'info');

  program
    .command('chat')
    .description('Start interactive chat session')
    .option('-m, --model <model>', 'Model to use for this session')
    .option('--no-planning', 'Disable planning')
    .option('--no-tui', 'Disable TUI (use readline fallback)')
    .action(async (options) => {
      await runChatMode(program.opts(), options);
    });

  program
    .command('run <prompt>')
    .description('Run a single prompt and exit')
    .option('-m, --model <model>', 'Model to use')
    .option('--no-planning', 'Disable planning')
    .action(async (prompt, options) => {
      await runSinglePrompt(program.opts(), prompt, options);
    });

  program
    .command('config')
    .description('Show current configuration')
    .action(async () => {
      const config = await loadConfig(program.opts().config);
      const logger = getLogger();
      logger.info(JSON.stringify(config, null, 2));
    });

  program
    .command('models')
    .description('List available models')
    .action(async () => {
      await listModels(program.opts());
    });

  program
    .command('budget')
    .description('Show budget status')
    .action(async () => {
      await showBudget(program.opts());
    });

  program
    .command('session <sessionId>')
    .description('Resume a previous session')
    .action(async (sessionId) => {
      await resumeSession(program.opts(), sessionId);
    });

  program
    .command('health')
    .description('Check health of Bifrost gateway and Ollama')
    .action(async () => {
      await checkHealth(program.opts());
    });

  return program;
}

interface CLIRunOptions {
  config?: string;
  workspace: string;
  bifrostUrl?: string;
  virtualKey?: string;
  model?: string;
  budget?: string;
  tavilyKey?: string;
  sessionDir?: string;
  localModels?: boolean;
  privacyMode?: boolean;
  logLevel?: string;
  tui?: boolean;
}

interface CommandExecutionOptions {
  planning?: boolean;
  tui?: boolean;
  noTui?: boolean;
}

async function buildConfig(cliOptions: CLIRunOptions): Promise<CLIConfig> {
  const fileConfig = await loadConfig(cliOptions.config ? { configFile: cliOptions.config } : {});

  const approvalPolicy: ApprovalPolicy = {
    read: fileConfig.approval?.read ?? 'auto',
    write: fileConfig.approval?.write ?? 'prompt',
    shell: fileConfig.approval?.shell ?? 'prompt',
    git: fileConfig.approval?.git ?? 'prompt',
    search: fileConfig.approval?.search ?? 'auto',
  };

  // Initialize logger with configured level
  const logLevel = (cliOptions.logLevel || 'info') as 'debug' | 'info' | 'warn' | 'error';
  createLogger({ level: logLevel, pretty: process.env.NODE_ENV !== 'production' });

  return {
    workspaceRoot: path.resolve(cliOptions.workspace),
    bifrostUrl: cliOptions.bifrostUrl || fileConfig.bifrost?.url || 'http://localhost:8080',
    virtualKey: cliOptions.virtualKey || fileConfig.bifrost?.virtualKey || 'default',
    enableLocalModels: cliOptions.localModels !== false && !!fileConfig.localModels?.preferredModels,
    privacyMode: cliOptions.privacyMode || fileConfig.privacy?.defaultConfidential || false,
    defaultModel: cliOptions.model || 'gpt-4o-mini',
    localModels: fileConfig.localModels?.preferredModels
      ? Object.values(fileConfig.localModels.preferredModels)
      : ['qwen2.5:3b', 'phi4-mini:3.8b', 'smollm2:1.7b'],
    budgetLimits: {
      dailyUsd: (cliOptions.budget ? parseFloat(cliOptions.budget) : undefined) || fileConfig.budget?.dailyUsd || 10,
      perRequestUsd: fileConfig.budget?.perTaskUsd || 1,
    },
    approvalPolicy,
    tavilyApiKey: cliOptions.tavilyKey || fileConfig.tavily?.apiKey,
    sessionDir: cliOptions.sessionDir || fileConfig.session?.sessionDir || path.join(cliOptions.workspace || process.cwd(), '.hackculture'),
    logLevel,
  };
}

async function createComponents(config: CLIConfig) {
  // Tool registry
  const toolRegistry = new ToolRegistry();
  registerFsTools(toolRegistry);
  registerShellTools(toolRegistry);
  registerGitTools(toolRegistry);

  // Tavily client and search tools
  if (config.tavilyApiKey) {
    const tavilyClient = createTavilyClient({ apiKey: config.tavilyApiKey });
    registerSearchTools(toolRegistry, tavilyClient);
  }

  // Approval gate
  const approvalGate = createApprovalGate({
    policy: config.approvalPolicy,
    allowlist: [],
  });

  // Session manager
  await fs.mkdir(config.sessionDir, { recursive: true });
  const sessionManager = createSessionManager({
    sessionDir: config.sessionDir,
    config: {
      maxTokens: 100000,
      compactionThreshold: 0.8,
      preservePatterns: ['error', 'failed', 'exception', 'file:', 'function', 'export', 'import'],
    },
  });
  await sessionManager.initialize();

  // Model router
  const routerConfig: RouterConfig = {
    bifrostUrl: config.bifrostUrl,
    virtualKey: config.virtualKey,
    enableLocalModels: config.enableLocalModels,
    privacyMode: config.privacyMode,
    defaultModel: config.defaultModel,
    localModels: config.localModels,
    budgetLimits: config.budgetLimits,
    failoverChain: [config.defaultModel, ...config.localModels],
  };
  const modelRouter = createModelRouter(routerConfig);

  return { toolRegistry, approvalGate, sessionManager, modelRouter };
}

async function createAgentContext(
  config: CLIConfig,
  toolRegistry: ToolRegistry,
  approvalGate: ApprovalGate,
  sessionManager: SessionManager,
  modelRouter: ModelRouter,
  sessionId: string
): Promise<AgentContext> {
  const approvalPolicy: ApprovalPolicy = config.approvalPolicy;

  return {
    workspaceRoot: config.workspaceRoot,
    approvalPolicy,
    sessionId,
    agentConfig: {
      name: 'hackculture-agent',
      systemPrompt: `You are a helpful coding assistant with access to tools for file operations, shell commands, git, and web search.

Workspace: ${config.workspaceRoot}
Privacy mode: ${config.privacyMode ? 'enabled' : 'disabled'}
Local models: ${config.enableLocalModels ? 'enabled' : 'disabled'}
Daily budget: $${config.budgetLimits.dailyUsd}`,
      maxIterations: 20,
      maxTokens: 100000,
      enablePlanning: true,
      tokenBudget: 50000,
    },
    sessionState: sessionManager.getState()!,
    routerContext: {
      request: { model: config.defaultModel, messages: [], max_tokens: 4096 },
      isConfidential: false,
      taskType: 'coding',
    },
  };
}

// Convert agent messages to TUI messages
function convertToTUIMessages(agentMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string; timestamp?: number; metadata?: Record<string, unknown> }>): TUIMessage[] {
  return agentMessages.map((msg) => ({
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp || Date.now(),
    metadata: msg.metadata,
  }));
}

// Convert agent plan to TUI plan
function convertToTUIPlan(agentPlan: Plan | undefined): Plan | undefined {
  if (!agentPlan) return undefined;
  return {
    steps: agentPlan.steps.map((step) => ({
      id: step.id,
      description: step.description,
      tool: step.tool,
      args: step.args,
      status: step.status,
      result: step.result,
      error: step.error,
    })),
    goal: agentPlan.goal,
    createdAt: agentPlan.createdAt,
    updatedAt: agentPlan.updatedAt,
  };
}

async function runChatMode(cliOptions: CLIRunOptions, cmdOptions: CommandExecutionOptions): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { toolRegistry, approvalGate, sessionManager, modelRouter } = await createComponents(config);
  const sessionId = `session-${Date.now()}`;
  const context = await createAgentContext(config, toolRegistry, approvalGate, sessionManager, modelRouter, sessionId);

  const agentConfig: AgentConfig = {
    name: 'hackculture-agent',
    systemPrompt: context.agentConfig.systemPrompt,
    maxIterations: cmdOptions.planning === false ? 1 : 20,
    maxTokens: 100000,
    enablePlanning: cmdOptions.planning !== false,
    tokenBudget: 50000,
  };

  const agent = createAgentCore(agentConfig, toolRegistry, approvalGate, sessionManager, modelRouter, context);
  await agent.initialize();

  // Check if TUI should be used
  const useTUI = !cmdOptions.noTui && process.stdin.isTTY;

  if (useTUI) {
    // TUI Mode
    let tuiState: TUIState = {
      mode: 'chat',
      messages: [],
      input: '',
      tokensUsed: 0,
      budgetRemaining: config.budgetLimits.dailyUsd,
      currentModel: config.defaultModel,
      isProcessing: false,
    };

    const budget = modelRouter.getBudgetEnforcer();

    const updateTUIState = () => {
      const agentState = agent.getState();
      const budgetStatus = budget.getStatus();
      tuiState = {
        ...tuiState,
        messages: convertToTUIMessages(agentState.messages),
        tokensUsed: agentState.totalTokens,
        budgetRemaining: budgetStatus.remaining,
        currentModel: config.defaultModel,
        plan: convertToTUIPlan(agentState.currentPlan),
        pendingApproval: (agentState.toolCalls.length > 0 && agentState.toolCalls[agentState.toolCalls.length - 1]) ? {
          id: 'temp',
          toolCall: agentState.toolCalls[agentState.toolCalls.length - 1]!,
          context,
          timestamp: Date.now(),
        } : undefined,
      };
    };

    await runTUI(tuiState, {
      onSendMessage: async (message: string) => {
        tuiState = { ...tuiState, isProcessing: true };
        updateTUIState();
        await agent.run(message);
        tuiState = { ...tuiState, isProcessing: false };
        updateTUIState();
      },
      onApproveTool: (requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => {
        const approvalGate = agent.getApprovalGate();
        approvalGate.resolveApproval({
          requestId,
          decision,
          rememberForSession: decision === 'allow-session',
          rememberAlways: decision === 'allow-always',
        });
      },
      onSwitchModel: (model: string) => {
        config.defaultModel = model;
      },
      onExit: () => {
        // Exit handled by runTUI promise resolution
      },
      onSlashCommand: (command: string) => {
        // Handle slash commands
        const trimmed = command.trim().toLowerCase();
        if (trimmed === '/help') {
          console.log('\nAvailable commands:');
          console.log('  /help     - Show this help');
          console.log('  /model    - Show model selector (or use Tab)');
          console.log('  /budget   - Show budget status');
          console.log('  /clear    - Clear chat history');
          console.log('  /plan     - Show current plan');
          console.log('  /approve  - Show pending approvals');
          console.log('  /session  - Show session info');
          console.log('  /exit     - Exit the agent\n');
        } else if (trimmed === '/budget') {
          const budgetStatus = modelRouter.getBudgetEnforcer().getStatus();
          console.log('\nBudget Status:');
          console.log(`  Used: $${budgetStatus.used.toFixed(4)}`);
          console.log(`  Limit: $${budgetStatus.limit.toFixed(2)}`);
          console.log(`  Remaining: $${budgetStatus.remaining.toFixed(4)}`);
          console.log(`  Percentage: ${budgetStatus.percentage.toFixed(1)}%\n`);
        } else if (trimmed === '/exit' || trimmed === '/quit') {
          process.exit(0);
        }
      },
      getAvailableModels: async () => {
        return await modelRouter.getAvailableModels();
      },
      getBudgetStatus: () => {
        const budget = modelRouter.getBudgetEnforcer();
        const status = budget.getStatus();
        return {
          used: status.used,
          limit: status.limit,
          remaining: status.remaining,
          percentage: status.percentage,
        };
      },
      getTokenUsage: () => {
        const agentState = agent.getState();
        return {
          total: agentState.totalTokens,
          prompt: 0,
          completion: 0,
          budget: 50000,
        };
      },
      getStatus: () => {
        const agentState = agent.getState();
        return {
          iteration: agentState.iteration,
          maxIterations: 20,
          lastUpdate: Date.now(),
        };
      },
    });

    await sessionManager.close();
  } else {
    // Readline fallback mode
    const logger = getLogger();
    logger.info('🤖 HackCulture Agent started. Type "exit" to quit.\n');

    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
      const input = await rl.question('> ');
      if (input.trim() === 'exit' || input.trim() === 'quit') break;

      const result = await agent.run(input);
      if (result.response) {
        logger.info(result.response);
      }
      if (result.error) {
        logger.error({ err: result.error }, 'Error');
      }
      logger.info(`Tokens: ${result.tokensUsed}`);
    }

    rl.close();
    await sessionManager.close();
  }
}

async function runSinglePrompt(cliOptions: CLIRunOptions, prompt: string, cmdOptions: CommandExecutionOptions): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { toolRegistry, approvalGate, sessionManager, modelRouter } = await createComponents(config);
  const sessionId = `session-${Date.now()}`;
  const context = await createAgentContext(config, toolRegistry, approvalGate, sessionManager, modelRouter, sessionId);

  const agentConfig: AgentConfig = {
    name: 'hackculture-agent',
    systemPrompt: context.agentConfig.systemPrompt,
    maxIterations: cmdOptions.planning === false ? 1 : 20,
    maxTokens: 100000,
    enablePlanning: cmdOptions.planning !== false,
    tokenBudget: 50000,
  };

  const agent = createAgentCore(agentConfig, toolRegistry, approvalGate, sessionManager, modelRouter, context);
  await agent.initialize();

  activeSessionManager = sessionManager;

  const logger = getLogger();
  const result = await agent.run(prompt);
  if (result.response) {
    logger.info(result.response);
  }
  if (result.error) {
    logger.error({ err: result.error }, 'Error');
    process.exit(1);
  }
  logger.info(`Tokens used: ${result.tokensUsed}`);
  await sessionManager.close();
}

async function listModels(cliOptions: CLIRunOptions): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { modelRouter } = await createComponents(config);
  const models = await modelRouter.getAvailableModels();
  const logger = getLogger();
  logger.info('Available models:');
  for (const m of models) {
    logger.info(`  ${m.id} (${m.source}) - ${m.capabilities.join(', ')}`);
  }
}

async function showBudget(cliOptions: CLIRunOptions): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { modelRouter } = await createComponents(config);
  const budget = modelRouter.getBudgetEnforcer();
  const status = budget.getStatus();
  const logger = getLogger();
  logger.info('Budget Status:');
  logger.info(`  Used: $${status.used.toFixed(4)}`);
  logger.info(`  Limit: $${status.limit.toFixed(2)}`);
  logger.info(`  Remaining: $${status.remaining.toFixed(4)}`);
  logger.info(`  Percentage: ${status.percentage.toFixed(1)}%`);
}

async function checkHealth(cliOptions: CLIRunOptions): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { modelRouter } = await createComponents(config);
  const logger = getLogger();

  logger.info('Checking service health...');
  const health = await modelRouter.healthCheck();

  logger.info({ bifrost: health.bifrost, ollama: health.ollama }, 'Health check results');

  if (health.bifrost && health.ollama) {
    logger.info('All services healthy ✓');
    process.exit(0);
  } else {
    logger.warn('Some services unhealthy ⚠');
    process.exit(1);
  }
}

async function resumeSession(cliOptions: CLIRunOptions, sessionId: string): Promise<void> {
  const config = await buildConfig(cliOptions);
  const { toolRegistry, approvalGate, sessionManager, modelRouter } = await createComponents(config);
  await sessionManager.initialize(sessionId);
  const context = await createAgentContext(config, toolRegistry, approvalGate, sessionManager, modelRouter, sessionId);

  const agentConfig: AgentConfig = {
    name: 'hackculture-agent',
    systemPrompt: context.agentConfig.systemPrompt,
    maxIterations: 20,
    maxTokens: 100000,
    enablePlanning: true,
    tokenBudget: 50000,
  };

  const agent = createAgentCore(agentConfig, toolRegistry, approvalGate, sessionManager, modelRouter, context);
  await agent.initialize();

  // Check if TUI should be used
  const useTUI = process.stdin.isTTY;

  if (useTUI) {
    // TUI Mode
    let tuiState: TUIState = {
      mode: 'chat',
      messages: [],
      input: '',
      tokensUsed: 0,
      budgetRemaining: config.budgetLimits.dailyUsd,
      currentModel: config.defaultModel,
      isProcessing: false,
    };

    const budget = modelRouter.getBudgetEnforcer();

    const updateTUIState = () => {
      const agentState = agent.getState();
      const budgetStatus = budget.getStatus();
      tuiState = {
        ...tuiState,
        messages: convertToTUIMessages(agentState.messages),
        tokensUsed: agentState.totalTokens,
        budgetRemaining: budgetStatus.remaining,
        currentModel: config.defaultModel,
        plan: convertToTUIPlan(agentState.currentPlan),
        pendingApproval: (agentState.toolCalls.length > 0 && agentState.toolCalls[agentState.toolCalls.length - 1]) ? {
          id: 'temp',
          toolCall: agentState.toolCalls[agentState.toolCalls.length - 1]!,
          context,
          timestamp: Date.now(),
        } : undefined,
      };
    };

    await runTUI(tuiState, {
      onSendMessage: async (message: string) => {
        tuiState = { ...tuiState, isProcessing: true };
        updateTUIState();
        await agent.run(message);
        tuiState = { ...tuiState, isProcessing: false };
        updateTUIState();
      },
      onApproveTool: (requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => {
        const approvalGate = agent.getApprovalGate();
        approvalGate.resolveApproval({
          requestId,
          decision,
          rememberForSession: decision === 'allow-session',
          rememberAlways: decision === 'allow-always',
        });
      },
      onSwitchModel: (model: string) => {
        config.defaultModel = model;
      },
      onExit: () => {
        // Exit handled by runTUI promise resolution
      },
      onSlashCommand: (command: string) => {
        const trimmed = command.trim().toLowerCase();
        if (trimmed === '/help') {
          console.log('\nAvailable commands:');
          console.log('  /help     - Show this help');
          console.log('  /model    - Show model selector (or use Tab)');
          console.log('  /budget   - Show budget status');
          console.log('  /clear    - Clear chat history');
          console.log('  /plan     - Show current plan');
          console.log('  /approve  - Show pending approvals');
          console.log('  /session  - Show session info');
          console.log('  /exit     - Exit the agent\n');
        } else if (trimmed === '/budget') {
          const budgetStatus = modelRouter.getBudgetEnforcer().getStatus();
          console.log('\nBudget Status:');
          console.log(`  Used: $${budgetStatus.used.toFixed(4)}`);
          console.log(`  Limit: $${budgetStatus.limit.toFixed(2)}`);
          console.log(`  Remaining: $${budgetStatus.remaining.toFixed(4)}`);
          console.log(`  Percentage: ${budgetStatus.percentage.toFixed(1)}%\n`);
        } else if (trimmed === '/exit' || trimmed === '/quit') {
          process.exit(0);
        }
      },
      getAvailableModels: async () => {
        return await modelRouter.getAvailableModels();
      },
      getBudgetStatus: () => {
        const budget = modelRouter.getBudgetEnforcer();
        const status = budget.getStatus();
        return {
          used: status.used,
          limit: status.limit,
          remaining: status.remaining,
          percentage: status.percentage,
        };
      },
      getTokenUsage: () => {
        const agentState = agent.getState();
        return {
          total: agentState.totalTokens,
          prompt: 0,
          completion: 0,
          budget: 50000,
        };
      },
      getStatus: () => {
        const agentState = agent.getState();
        return {
          iteration: agentState.iteration,
          maxIterations: 20,
          lastUpdate: Date.now(),
        };
      },
    });

    await sessionManager.close();
  } else {
    // Readline fallback mode
    const logger = getLogger();
    logger.info(`Resumed session: ${sessionId}`);

    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    while (true) {
      const input = await rl.question('> ');
      if (input.trim() === 'exit' || input.trim() === 'quit') break;

      const result = await agent.run(input);
      if (result.response) {
        logger.info(result.response);
      }
      if (result.error) {
        logger.error({ err: result.error }, 'Error');
      }
      logger.info(`Tokens: ${result.tokensUsed}`);
    }

    rl.close();
    await sessionManager.close();
  }
}

export async function main(): Promise<void> {
  // Set up graceful shutdown handlers early
  setupGracefulShutdown();

  // Initialize default logger
  createLogger({ level: 'info', pretty: process.env.NODE_ENV !== 'production' });
  const logger = getLogger();
  logEvent(logger, 'system:startup', { version: packageJson.version, config: { level: 'info', pretty: process.env.NODE_ENV !== 'production' } });

  const program = await createCLI();
  await program.parseAsync(process.argv);
}