import React from 'react';
import { Box, Text } from 'ink';

interface BudgetBarProps {
  used: number;
  budgetRemaining: number;
  dailyLimit: number;
  monthlyLimit?: number;
  monthlyUsed?: number;
  alertThresholds?: number[];
  costPerRequest?: number;
}

const createBar = (percentage: number, width: number = 20) => {
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;
  const filled = '█'.repeat(filledWidth);
  const empty = '░'.repeat(emptyWidth);
  return { filled, empty, percentage };
};

const getThresholdColor = (percentage: number, thresholds: number[] = [50, 80, 100]): string => {
  const t0 = thresholds[0] ?? 50;
  const t1 = thresholds[1] ?? 80;
  const t2 = thresholds[2] ?? 100;
  if (percentage >= t2 || percentage >= 100) return 'red';
  if (percentage >= t1 || percentage >= 80) return 'yellow';
  if (percentage >= t0 || percentage >= 50) return 'cyan';
  return 'green';
};

export const BudgetBar: React.FC<BudgetBarProps> = ({
  used,
  budgetRemaining,
  dailyLimit,
  monthlyLimit = 100,
  monthlyUsed = 0,
  alertThresholds = [50, 80, 100],
  costPerRequest = 0,
}) => {
  const dailyPercentage = dailyLimit > 0 ? (used / dailyLimit) * 100 : 0;
  const monthlyPercentage = monthlyLimit > 0 ? (monthlyUsed / monthlyLimit) * 100 : 0;

  const dailyColor = getThresholdColor(dailyPercentage, alertThresholds ?? [50, 80, 100]);
  const monthlyColor = getThresholdColor(monthlyPercentage, alertThresholds ?? [50, 80, 100]);

  const dailyBar = createBar(dailyPercentage, 20);
  const monthlyBar = createBar(monthlyPercentage, 20);

  const thresholds = alertThresholds ?? [50, 80, 100];

  return (
    <Box>
      {/* Daily Budget */}
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold>DAILY</Text>
        <Text color={dailyColor} bold>{dailyPercentage.toFixed(1)}%</Text>
      </Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color={dailyColor}>{dailyBar.filled}</Text>
        <Text color="dim">{dailyBar.empty}</Text>
      </Box>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text>Used: <Text color="white" bold>${used.toFixed(4)}</Text></Text>
        <Text>Remaining: <Text color="white" bold>${budgetRemaining.toFixed(4)}</Text></Text>
        <Text>Limit: <Text color="dim">${dailyLimit.toFixed(2)}</Text></Text>
      </Box>

      {/* Monthly Budget */}
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold>MONTHLY</Text>
        <Text color={monthlyColor} bold>{monthlyPercentage.toFixed(1)}%</Text>
      </Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color={monthlyColor}>{monthlyBar.filled}</Text>
        <Text color="dim">{monthlyBar.empty}</Text>
      </Box>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text>Used: <Text color="white" bold>${monthlyUsed.toFixed(4)}</Text></Text>
        <Text>Limit: <Text color="dim">${monthlyLimit.toFixed(2)}</Text></Text>
      </Box>

      {/* Alert Thresholds */}
      <Box flexDirection="row" gap={1} marginTop={1} marginBottom={1}>
        <Text color="dim">Thresholds:</Text>
        {thresholds.map((t, idx) => (
          <Text
            key={idx}
            color={dailyPercentage >= t ? (t >= 100 ? 'red' : t >= 80 ? 'yellow' : 'cyan') : 'dim'}
          >
            {t}%{' '}
          </Text>
        ))}
      </Box>

      {/* Cost per request */}
      {costPerRequest > 0 && (
        <Box flexDirection="row" gap={1}>
          <Text color="dim">Cost/req:</Text>
          <Text color="white" bold>${costPerRequest.toFixed(6)}</Text>
        </Box>
      )}
    </Box>
  );
};