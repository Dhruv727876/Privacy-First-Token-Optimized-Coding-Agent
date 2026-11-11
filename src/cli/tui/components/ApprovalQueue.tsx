import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { ApprovalRequest } from '../../../approval/types.js';

interface ApprovalQueueProps {
  pendingApproval?: ApprovalRequest;
  onApprove: (requestId: string, decision: 'allow' | 'deny' | 'allow-session' | 'allow-always') => void;
}

export const ApprovalQueue: React.FC<ApprovalQueueProps> = ({
  pendingApproval,
  onApprove: _onApprove,
}) => {
  const [rememberSession] = useState(false);
  const [rememberAlways] = useState(false);

  if (!pendingApproval) {
    return (
      <Box>
        <Text color="dim">No pending approvals (A/D/S/W to approve)</Text>
      </Box>
    );
  }

  const { toolCall } = pendingApproval;
  const argsStr = JSON.stringify(toolCall.args, null, 2);

  return (
    <Box borderStyle="round" borderColor="yellow" padding={1} marginBottom={1}>
      <Text color="yellow" bold>⚠ APPROVAL REQUIRED</Text>
      <Box marginTop={1} marginBottom={1}>
        <Text bold>Tool:</Text> <Text color="cyan">{toolCall.name}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text bold>Arguments:</Text>
      </Box>
      <Box padding={1} marginBottom={1}>
        <Text color="white">{argsStr}</Text>
      </Box>

      {/* Allowlist Options */}
      <Box marginBottom={1} padding={1} borderStyle="single" borderColor="dim">
        <Text bold>Remember this decision:</Text>
        <Box flexDirection="row" gap={2} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={rememberSession ? 'green' : 'white'}>[ ]</Text>
            <Text color={rememberSession ? 'green' : 'white'}>
              Session
            </Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            <Text color={rememberAlways ? 'green' : 'white'}>[ ]</Text>
            <Text color={rememberAlways ? 'green' : 'white'}>
              Always
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Action Buttons */}
      <Box flexDirection="row" gap={2}>
        <Text color="green">[A] Allow</Text>
        <Text color="red">[D] Deny</Text>
        <Text color="yellow">[S] Session</Text>
        <Text color="cyan">[W] Always</Text>
      </Box>
    </Box>
  );
};