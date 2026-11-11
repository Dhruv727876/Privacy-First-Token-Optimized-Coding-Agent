import React, { useState } from 'react';
import { Box, Text } from 'ink';

interface ModelInfo {
  id: string;
  source: 'bifrost' | 'local';
  capabilities: string[];
  loaded?: boolean;
  available?: boolean;
}

interface ModelSelectorProps {
  currentModel: string;
  availableModels: ModelInfo[];
  onSelect: (model: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  currentModel,
  availableModels,
  onSelect: _onSelect,
  isOpen,
  onToggle: _onToggle,
}) => {
  const [selectedIndex] = useState(0);

  const sourceColors: Record<string, string> = {
    bifrost: 'blue',
    local: 'green',
  };

  const capabilityColors: Record<string, string> = {
    chat: 'dim',
    completion: 'dim',
    reasoning: 'yellow',
    coding: 'cyan',
    privacy: 'green',
    basic: 'dim',
  };

  // We need to use useInput for key handling, but for now we'll rely on the parent App's key handling
  // The parent handles Tab to toggle, and we'll add number keys for quick selection

  return (
    <Box borderStyle="round" borderColor={isOpen ? 'green' : 'dim'} padding={1}>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text bold>MODEL</Text>
        <Text color={isOpen ? 'green' : 'dim'}>[Tab]</Text>
      </Box>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text>Current:</Text>
        <Text color="cyan" bold>{currentModel}</Text>
        <Text color="dim">(Tab to change)</Text>
      </Box>

      {isOpen && (
        <Box marginTop={1}>
          <Text color="dim">Available models (↑/↓, Enter to select, Esc to close):</Text>
          {availableModels.map((model, index) => (
            <Box key={model.id} flexDirection="row" gap={1} marginTop={1}>
              <Text
                color={index === selectedIndex ? 'green' : model.id === currentModel ? 'cyan' : 'white'}
                bold={model.id === currentModel || index === selectedIndex}
                backgroundColor={index === selectedIndex ? 'blue' : undefined}
              >
                {model.id === currentModel ? '●' : index === selectedIndex ? '▸' : '○'} {model.id}
              </Text>
              <Text color={sourceColors[model.source]}>[{model.source}]</Text>
              {model.loaded && <Text color="green">[loaded]</Text>}
              {model.available === false && <Text color="red">[unavailable]</Text>}
              <Box flexDirection="row" gap={1} marginLeft={1}>
                {model.capabilities.map((cap) => (
                  <Text key={cap} color={capabilityColors[cap] || 'dim'}>
                    {cap}
                  </Text>
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};