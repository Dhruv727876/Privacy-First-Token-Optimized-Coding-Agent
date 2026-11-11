import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { PlanStep } from '../../../agent/types.js';

interface PlanViewProps {
  plan: {
    steps: PlanStep[];
    goal: string;
    createdAt: number;
    updatedAt: number;
  };
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '✓',
  failed: '✗',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'dim',
  in_progress: 'yellow',
  completed: 'green',
  failed: 'red',
};

export const PlanView: React.FC<PlanViewProps> = ({ plan }) => {
  const [expandedSteps] = useState<Set<string>>(new Set());

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold>PLAN</Text>
        <Text color="dim">{plan.goal}</Text>
      </Box>
      <Box flexDirection="row" gap={2} marginBottom={1}>
        <Text color="dim">Created: {formatTime(plan.createdAt)}</Text>
        <Text color="dim">Updated: {formatTime(plan.updatedAt)}</Text>
        <Text color="dim">Steps: {plan.steps.length}</Text>
      </Box>
      {plan.steps.map((step, index) => (
        <Box key={index} marginBottom={1}>
          <Box flexDirection="row" gap={1} marginLeft={1}>
            <Text color={STATUS_COLORS[step.status] || 'white'}>
              {STATUS_ICONS[step.status] || '•'}
            </Text>
            <Text color={STATUS_COLORS[step.status] || 'white'}>
              {step.description}
            </Text>
            {step.tool && (
              <Text color="cyan">[{step.tool}]</Text>
            )}
            {step.error && (
              <Text color="red">({step.error})</Text>
            )}
            <Text color="dim">(click to expand)</Text>
          </Box>

          {expandedSteps.has(step.id) && (
            <Box marginLeft={4} marginTop={1} padding={1} borderStyle="single" borderColor="dim">
              {step.args && Object.keys(step.args).length > 0 && (
                <Box marginBottom={1}>
                  <Text bold>Arguments:</Text>
                  <Box marginLeft={2}>
                    <Text color="white">{JSON.stringify(step.args, null, 2)}</Text>
                  </Box>
                </Box>
              )}
              {step.result !== undefined && (
                <Box marginBottom={1}>
                  <Text bold>Result:</Text>
                  <Box marginLeft={2}>
                    <Text color="white">{JSON.stringify(step.result, null, 2)}</Text>
                  </Box>
                </Box>
              )}
              <Box flexDirection="row" gap={2}>
                <Text color="dim">Status: {step.status}</Text>
                {step.tool && <Text color="dim">Tool: {step.tool}</Text>}
              </Box>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};