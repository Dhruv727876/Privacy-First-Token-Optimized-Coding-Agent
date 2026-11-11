import React from 'react';
import { Box, Text } from 'ink';

interface TokenCounterProps {
  tokensUsed: number;
  promptTokens?: number;
  completionTokens?: number;
  totalBudget?: number;
}

export const TokenCounter: React.FC<TokenCounterProps> = ({
  tokensUsed,
  promptTokens = 0,
  completionTokens = 0,
  totalBudget = 50000,
}) => {
  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  const budgetPercentage = totalBudget > 0 ? (tokensUsed / totalBudget) * 100 : 0;
  const budgetColor = budgetPercentage >= 100 ? 'red' : budgetPercentage >= 80 ? 'yellow' : budgetPercentage >= 50 ? 'cyan' : 'green';
  const barWidth = 15;
  const filledWidth = Math.round((budgetPercentage / 100) * barWidth);
  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(barWidth - filledWidth);

  return (
    <Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold>TOKENS</Text>
        <Text color={budgetColor} bold>{budgetPercentage.toFixed(1)}%</Text>
      </Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color={budgetColor}>{filled}</Text>
        <Text color="dim">{empty}</Text>
      </Box>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text>Total: <Text color="cyan" bold>{formatTokens(tokensUsed)}</Text></Text>
        <Text>Budget: <Text color="dim">{formatTokens(totalBudget)}</Text></Text>
      </Box>
      <Box flexDirection="row" gap={2}>
        <Text>Prompt: <Text color="white">{formatTokens(promptTokens)}</Text></Text>
        <Text>Completion: <Text color="white">{formatTokens(completionTokens)}</Text></Text>
      </Box>
    </Box>
  );
};