import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  sessionId: string;
  currentModel: string;
  isProcessing: boolean;
  bifrostConnected: boolean;
  ollamaConnected: boolean;
  iteration?: number;
  maxIterations?: number;
  tokenBudget?: number;
  tokensUsed?: number;
  lastUpdate?: number;
  bifrostLatency?: number;
  ollamaLatency?: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  sessionId,
  currentModel,
  isProcessing,
  bifrostConnected,
  ollamaConnected,
  iteration = 0,
  maxIterations = 20,
  tokenBudget = 50000,
  tokensUsed = 0,
  lastUpdate,
  bifrostLatency,
  ollamaLatency,
}) => {
  const budgetPercentage = tokenBudget > 0 ? (tokensUsed / tokenBudget) * 100 : 0;
  const budgetColor = budgetPercentage >= 100 ? 'red' : budgetPercentage >= 80 ? 'yellow' : budgetPercentage >= 50 ? 'cyan' : 'green';
  const timeSinceUpdate = lastUpdate ? Date.now() - lastUpdate : 0;
  const timeAgo = timeSinceUpdate < 60000
    ? `${Math.round(timeSinceUpdate / 1000)}s ago`
    : timeSinceUpdate < 3600000
    ? `${Math.round(timeSinceUpdate / 60000)}m ago`
    : 'long ago';

  return (
    <Box borderStyle="single" borderColor="dim" paddingX={1} paddingY={1}>
      <Box flexDirection="row" gap={3}>
        <Box flexDirection="row" gap={1}>
          <Text color="dim">Session:</Text>
          <Text color="white">{sessionId.slice(-8)}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="dim">Model:</Text>
          <Text color="cyan">{currentModel}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text>Bifrost:</Text>
          <Text color={bifrostConnected ? 'green' : 'red'}>
            {bifrostConnected ? '●' : '○'}
          </Text>
          {bifrostLatency && (
            <Text color="dim">({bifrostLatency}ms)</Text>
          )}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text>Ollama:</Text>
          <Text color={ollamaConnected ? 'green' : 'red'}>
            {ollamaConnected ? '●' : '○'}
          </Text>
          {ollamaLatency && (
            <Text color="dim">({ollamaLatency}ms)</Text>
          )}
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text>Iter:</Text>
          <Text color="white">{iteration}/{maxIterations}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text>Tokens:</Text>
          <Text color={budgetColor}>{tokensUsed.toLocaleString()}/{tokenBudget.toLocaleString()}</Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text>Status:</Text>
          <Text color={isProcessing ? 'yellow' : 'green'}>
            {isProcessing ? 'Processing' : 'Ready'}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="dim">Updated:</Text>
          <Text color="dim">{timeAgo}</Text>
        </Box>
      </Box>
    </Box>
  );
};