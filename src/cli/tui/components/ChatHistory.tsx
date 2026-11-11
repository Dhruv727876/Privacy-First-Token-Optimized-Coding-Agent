import React, { useRef, useEffect, useMemo } from 'react';
import { Box, Text, Static } from 'ink';
import { Message } from './Message.js';
import type { TUIMessage } from '../../types.js';

interface ChatHistoryProps {
  messages: TUIMessage[];
  isProcessing: boolean;
  ref?: React.RefObject<number>;
}

interface StaticItem extends TUIMessage {
  isProcessingIndicator?: boolean;
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  isProcessing,
}) => {
  const messageCountRef = useRef(messages.length);

  useEffect(() => {
    if (messages.length > messageCountRef.current) {
      messageCountRef.current = messages.length;
    }
  }, [messages.length]);

  // Create items array with processing indicator if needed
  const items = useMemo<StaticItem[]>(() => {
    const allItems: StaticItem[] = [...messages];
    if (isProcessing) {
      allItems.push({
        role: 'tool',
        content: '▌ Processing...',
        timestamp: Date.now(),
        isProcessingIndicator: true
      });
    }
    return allItems;
  }, [messages, isProcessing]);

  return (
    <Box flexGrow={1} minHeight={0}>
      <Static<StaticItem>
        items={items}
        children={(item, index) => {
          if (item.isProcessingIndicator) {
            return (
              <Box key="processing" marginTop={1}>
                <Text color="yellow">▌ Processing...</Text>
              </Box>
            );
          }
          return <Message key={index} message={item} />;
        }}
      />
    </Box>
  );
};