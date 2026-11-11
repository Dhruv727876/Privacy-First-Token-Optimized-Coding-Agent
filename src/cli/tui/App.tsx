import React, { useState, useEffect, useRef, useCallback } from 'react';
import { render, Box, useInput, useStdout } from 'ink';
import { ChatHistory } from './components/ChatHistory.js';
import { ApprovalQueue } from './components/ApprovalQueue.js';
import { BudgetBar } from './components/BudgetBar.js';
import { TokenCounter } from './components/TokenCounter.js';
import { ModelSelector } from './components/ModelSelector.js';
import { PlanView } from './components/PlanView.js';
import { StatusBar } from './components/StatusBar.js';
import { InputArea } from './components/InputArea.js';
import type { TUIState } from '../types.js';

interface AppProps {
  initialState: TUIState;
  onSendMessage: (message: string) => Promise<void>;
  onApproveTool: (requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => void;
  onSwitchModel: (model: string) => void;
  onExit: () => void;
  onSlashCommand?: (command: string) => void;
  getAvailableModels?: () => Promise<Array<{ id: string; source: 'bifrost' | 'local'; capabilities: string[]; loaded?: boolean; available?: boolean }>>;
  getBudgetStatus?: () => { used: number; limit: number; remaining: number; percentage: number; monthlyUsed?: number; monthlyLimit?: number; costPerRequest?: number };
  getTokenUsage?: () => { total: number; prompt: number; completion: number; budget: number };
  getStatus?: () => { iteration: number; maxIterations: number; lastUpdate: number; bifrostLatency?: number; ollamaLatency?: number };
}

interface ModelInfo {
  id: string;
  source: 'bifrost' | 'local';
  capabilities: string[];
  loaded?: boolean;
  available?: boolean;
}

export const App: React.FC<AppProps> = ({
  initialState,
  onSendMessage,
  onApproveTool,
  onSwitchModel,
  onExit,
  onSlashCommand,
  getAvailableModels,
  getBudgetStatus,
  getTokenUsage,
  getStatus,
}) => {
  const [state, setState] = useState<TUIState>(initialState);
  const [inputValue, setInputValue] = useState('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const messagesEndRef = useRef<number>(0);
  const stdout = useStdout();

  // Load available models on mount and when selector opens
  const loadModels = useCallback(async () => {
    if (getAvailableModels) {
      try {
        const models = await getAvailableModels();
        setAvailableModels(models);
      } catch (error) {
        console.error('Failed to load models:', error);
      }
    }
  }, [getAvailableModels]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  useEffect(() => {
    if (showModelSelector) {
      loadModels();
    }
  }, [showModelSelector, loadModels]);

  // Handle input
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      if (state.isProcessing) {
        setState(prev => ({ ...prev, isProcessing: false }));
      } else {
        onExit();
      }
      return;
    }

    if (key.ctrl && input === 'd') {
      onExit();
      return;
    }

    if (key.tab) {
      if (!state.isProcessing) {
        setShowModelSelector(prevShow => {
          if (!prevShow) {
            setSelectedModelIndex(0);
          }
          return !prevShow;
        });
      }
      return;
    }

    // Handle model selector navigation
    if (showModelSelector) {
      if (key.upArrow) {
        setSelectedModelIndex(prev => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedModelIndex(prev => Math.min(availableModels.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selected = availableModels[selectedModelIndex];
        if (selected) {
          const modelId = selected.id;
          onSwitchModel(modelId);
          setShowModelSelector(false);
          setState(prevState => ({ ...prevState, currentModel: modelId }));
        }
        return;
      }
      if (key.escape) {
        setShowModelSelector(false);
        return;
      }
      // Number keys for quick selection
      if (input >= '1' && input <= '9') {
        const idx = parseInt(input, 10) - 1;
        const selected = availableModels[idx];
        if (selected) {
          const modelId = selected.id;
          onSwitchModel(modelId);
          setShowModelSelector(false);
          setState(prevState => ({ ...prevState, currentModel: modelId }));
        }
        return;
      }
    }

    // Handle approval keys (a/d/s/w) when there's a pending approval
    if (state.pendingApproval && !state.isProcessing) {
      if (input === 'a') {
        onApproveTool(state.pendingApproval.id, 'allow');
        return;
      }
      if (input === 'd') {
        onApproveTool(state.pendingApproval.id, 'deny');
        return;
      }
      if (input === 's') {
        onApproveTool(state.pendingApproval.id, 'allow-session');
        return;
      }
      if (input === 'w') {
        onApproveTool(state.pendingApproval.id, 'allow-always');
        return;
      }
    }
  });

  // Update state from external sources
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => {
        const next = { ...prev };

        if (getBudgetStatus) {
          const budget = getBudgetStatus();
          next.budgetRemaining = budget.remaining;
        }

        if (getTokenUsage) {
          const tokens = getTokenUsage();
          next.tokensUsed = tokens.total;
        }

        if (getStatus) {
          getStatus();
          // These would be passed through state updates from parent
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [getBudgetStatus, getTokenUsage, getStatus]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (stdout && messagesEndRef.current !== state.messages.length) {
      messagesEndRef.current = state.messages.length;
    }
  }, [state.messages, stdout]);

  const handleSendMessage = useCallback(async (message: string) => {
    // Check for slash commands
    const trimmed = message.trim();
    if (trimmed.startsWith('/') && onSlashCommand) {
      onSlashCommand(trimmed);
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, input: '' }));
    await onSendMessage(message);
  }, [onSendMessage, onSlashCommand]);

  const handleApproval = useCallback((requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => {
    onApproveTool(requestId, decision);
    setState(prev => ({
      ...prev,
      pendingApproval: prev.pendingApproval?.id === requestId ? undefined : prev.pendingApproval,
    }));
  }, [onApproveTool]);

  const handleModelSwitch = useCallback((model: string) => {
    onSwitchModel(model);
    setShowModelSelector(false);
    setState(prev => ({ ...prev, currentModel: model }));
  }, [onSwitchModel]);

  // Prepare model data for selector
  const modelSelectorModels: ModelInfo[] = availableModels.length > 0 ? availableModels : [
    { id: 'gpt-4o-mini', source: 'bifrost', capabilities: ['chat', 'completion'] },
    { id: 'gpt-4o', source: 'bifrost', capabilities: ['chat', 'completion', 'reasoning'] },
    { id: 'claude-3.5-sonnet', source: 'bifrost', capabilities: ['chat', 'completion', 'reasoning'] },
    { id: 'qwen2.5:3b', source: 'local', capabilities: ['chat', 'completion', 'coding', 'privacy'] },
    { id: 'phi4-mini:3.8b', source: 'local', capabilities: ['chat', 'completion', 'reasoning', 'privacy'] },
    { id: 'smollm2:1.7b', source: 'local', capabilities: ['chat', 'completion', 'basic', 'privacy'] },
  ];

  // Prepare budget data
  const budgetData = getBudgetStatus ? getBudgetStatus() : {
    used: 0,
    limit: 10,
    remaining: 10,
    percentage: 0,
  };

  // Prepare token data
  const tokenData = getTokenUsage ? getTokenUsage() : {
    total: state.tokensUsed,
    prompt: 0,
    completion: 0,
    budget: 50000,
  };

  // Prepare status data
  const statusData = getStatus ? getStatus() : {
    iteration: 0,
    maxIterations: 20,
    lastUpdate: Date.now(),
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Main content area - flex grows */}
      <Box flexDirection="row" flexGrow={1} minHeight={0}>
        {/* Left panel: Chat + Plan */}
        <Box flexDirection="column" width="70%" minWidth={60} minHeight={0}>
          <Box flexGrow={1} minHeight={0} paddingX={1}>
            <ChatHistory
              messages={state.messages}
              isProcessing={state.isProcessing}
              ref={messagesEndRef}
            />
          </Box>
          {state.plan && state.plan.steps.length > 0 && (
            <Box height="40%" minHeight={10} paddingX={1} borderStyle="single" borderColor="dim" marginTop={1}>
              <PlanView plan={state.plan} />
            </Box>
          )}
        </Box>

        {/* Right panel: Approval queue + Model selector + Budget */}
        <Box flexDirection="column" width="30%" minWidth={30} minHeight={0} paddingX={1}>
          <Box height="40%" minHeight={10} marginBottom={1}>
            <ApprovalQueue
              pendingApproval={state.pendingApproval}
              onApprove={handleApproval}
            />
          </Box>

          <Box height="20%" minHeight={6} marginBottom={1}>
            <ModelSelector
              currentModel={state.currentModel}
              availableModels={modelSelectorModels}
              onSelect={handleModelSwitch}
              isOpen={showModelSelector}
              onToggle={() => setShowModelSelector(!showModelSelector)}
            />
          </Box>

          <Box height="20%" minHeight={6} marginBottom={1}>
            <Box flexDirection="row" gap={2}>
              <BudgetBar
                used={budgetData.used}
                budgetRemaining={budgetData.remaining}
                dailyLimit={budgetData.limit}
                monthlyLimit={budgetData.monthlyLimit}
                monthlyUsed={budgetData.monthlyUsed}
                alertThresholds={[50, 80, 100]}
                costPerRequest={budgetData.costPerRequest}
              />
              <TokenCounter
                tokensUsed={tokenData.total}
                promptTokens={tokenData.prompt}
                completionTokens={tokenData.completion}
                totalBudget={tokenData.budget}
              />
            </Box>
          </Box>

          <StatusBar
            sessionId={state.mode}
            currentModel={state.currentModel}
            isProcessing={state.isProcessing}
            bifrostConnected={true}
            ollamaConnected={true}
            iteration={statusData.iteration}
            maxIterations={statusData.maxIterations}
            tokenBudget={tokenData.budget}
            tokensUsed={tokenData.total}
            lastUpdate={statusData.lastUpdate}
            bifrostLatency={statusData.bifrostLatency}
            ollamaLatency={statusData.ollamaLatency}
          />
        </Box>
      </Box>

      {/* Bottom input area */}
      <Box borderStyle="single" borderColor="dim" paddingX={1} paddingY={1}>
        <InputArea
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSendMessage}
          disabled={state.isProcessing}
          placeholder={state.isProcessing ? 'Processing...' : 'Type a message (Tab: models, Ctrl+C: cancel/exit, Ctrl+P: commands, A/D/S/W: approve)'}
        />
      </Box>
    </Box>
  );
};

export function runTUI(initialState: TUIState, handlers: {
  onSendMessage: (message: string) => Promise<void>;
  onApproveTool: (requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => void;
  onSwitchModel: (model: string) => void;
  onExit: () => void;
  onSlashCommand?: (command: string) => void;
  getAvailableModels?: () => Promise<Array<{ id: string; source: 'bifrost' | 'local'; capabilities: string[]; loaded?: boolean; available?: boolean }>>;
  getBudgetStatus?: () => { used: number; limit: number; remaining: number; percentage: number; monthlyUsed?: number; monthlyLimit?: number; costPerRequest?: number };
  getTokenUsage?: () => { total: number; prompt: number; completion: number; budget: number };
  getStatus?: () => { iteration: number; maxIterations: number; lastUpdate: number; bifrostLatency?: number; ollamaLatency?: number };
}): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <App
        initialState={initialState}
        {...handlers}
      />,
      {
        patchConsole: true,
        exitOnCtrlC: false,
      }
    );

    const cleanup = () => {
      unmount();
      resolve();
    };

    handlers.onExit = () => {
      cleanup();
    };
  });
}