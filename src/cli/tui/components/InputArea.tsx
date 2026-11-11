import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';

interface InputAreaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

type SlashCommand = {
  name: string;
  description: string;
  action: () => void;
};

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/help', description: 'Show available commands', action: () => {} },
  { name: '/model', description: 'Switch model', action: () => {} },
  { name: '/budget', description: 'Show budget status', action: () => {} },
  { name: '/clear', description: 'Clear chat history', action: () => {} },
  { name: '/plan', description: 'Show current plan', action: () => {} },
  { name: '/approve', description: 'Show pending approvals', action: () => {} },
  { name: '/session', description: 'Show session info', action: () => {} },
  { name: '/exit', description: 'Exit the agent', action: () => {} },
];

export const InputArea: React.FC<InputAreaProps> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showCommands, setShowCommands] = useState(false);
  const [commandFilter, setCommandFilter] = useState('');
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  // Sync with external value
  useEffect(() => {
    setInputValue(value);
    setHistoryIndex(-1);
    setCursorPosition(value.length);
    setShowCommands(false);
  }, [value]);

  const filteredCommands = SLASH_COMMANDS.filter(cmd =>
    cmd.name.toLowerCase().includes(commandFilter.toLowerCase())
  );

  const handleSubmit = () => {
    if (inputValue.trim() && !disabled) {
      const trimmed = inputValue.trim();
      if (trimmed.startsWith('/')) {
        // Handle slash command - parent handles it
      }
      setHistory(prev => [...prev, inputValue]);
      setHistoryIndex(-1);
      onSubmit(inputValue);
      setInputValue('');
      setCursorPosition(0);
      setShowCommands(false);
    }
  };

  // Handle keyboard input
  useInput((input, key) => {
    if (disabled) return;

    // Ctrl+P for command palette
    if (key.ctrl && input === 'p') {
      setShowCommands(true);
      setCommandFilter('');
      setSelectedCommandIndex(0);
      return;
    }

    // Escape to close command palette
    if (key.escape) {
      setShowCommands(false);
      return;
    }

    // Enter to submit (or select command)
    if (key.return && !key.shift && !key.ctrl) {
      if (showCommands && filteredCommands[selectedCommandIndex]) {
        const cmd = filteredCommands[selectedCommandIndex].name + ' ';
        const newValue = inputValue + cmd;
        setInputValue(newValue);
        onChange(newValue);
        setCursorPosition(newValue.length);
        setShowCommands(false);
      } else {
        handleSubmit();
      }
      return;
    }

    // Shift+Enter for new line
    if (key.return && key.shift) {
      const newValue = inputValue.slice(0, cursorPosition) + '\n' + inputValue.slice(cursorPosition);
      setInputValue(newValue);
      onChange(newValue);
      setCursorPosition(cursorPosition + 1);
      return;
    }

    // Tab for command completion (or model selector handled by parent)
    if (key.tab) {
      if (showCommands && filteredCommands[selectedCommandIndex]) {
        const cmd = filteredCommands[selectedCommandIndex].name + ' ';
        const newValue = inputValue + cmd;
        setInputValue(newValue);
        onChange(newValue);
        setCursorPosition(newValue.length);
        setShowCommands(false);
      }
      return;
    }

    // Arrow keys for command palette navigation
    if (key.upArrow) {
      if (showCommands) {
        setSelectedCommandIndex(prev => Math.max(0, prev - 1));
      } else if (history.length > 0 && historyIndex < history.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        const newValue = history[history.length - 1 - newIndex] ?? '';
        setInputValue(newValue);
        onChange(newValue);
        setCursorPosition(newValue.length);
      }
      return;
    }

    if (key.downArrow) {
      if (showCommands) {
        setSelectedCommandIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
      } else if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const newValue = history[history.length - 1 - newIndex] ?? '';
        setInputValue(newValue);
        onChange(newValue);
        setCursorPosition(newValue.length);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
        onChange('');
        setCursorPosition(0);
      }
      return;
    }

    // Backspace
    if (key.backspace) {
      if (cursorPosition > 0) {
        const newValue = inputValue.slice(0, cursorPosition - 1) + inputValue.slice(cursorPosition);
        setInputValue(newValue);
        onChange(newValue);
        setCursorPosition(cursorPosition - 1);
        if (showCommands && newValue.startsWith('/')) {
          setCommandFilter(newValue);
          setSelectedCommandIndex(0);
        }
      }
      return;
    }

    // Delete
    if (key.delete) {
      if (cursorPosition < inputValue.length) {
        const newValue = inputValue.slice(0, cursorPosition) + inputValue.slice(cursorPosition + 1);
        setInputValue(newValue);
        onChange(newValue);
        if (showCommands && newValue.startsWith('/')) {
          setCommandFilter(newValue);
          setSelectedCommandIndex(0);
        }
      }
      return;
    }

    // Left/Right arrow for cursor movement
    if (key.leftArrow) {
      if (cursorPosition > 0) {
        setCursorPosition(cursorPosition - 1);
      }
      return;
    }

    if (key.rightArrow) {
      if (cursorPosition < inputValue.length) {
        setCursorPosition(cursorPosition + 1);
      }
      return;
    }

    // Regular character input
    if (input && input.length === 1 && !key.ctrl && !key.meta) {
      const newValue = inputValue.slice(0, cursorPosition) + input + inputValue.slice(cursorPosition);
      setInputValue(newValue);
      onChange(newValue);
      setCursorPosition(cursorPosition + 1);
      if (showCommands && newValue.startsWith('/')) {
        setCommandFilter(newValue);
        setSelectedCommandIndex(0);
      }
    }
  });

  // Render cursor
  const beforeCursor = inputValue.slice(0, cursorPosition);
  const afterCursor = inputValue.slice(cursorPosition);

  // Show command palette
  const commandPalette = showCommands ? (
    <Box marginTop={1} borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">Commands (↑/↓, Enter, Esc):</Text>
      {filteredCommands.map((cmd, index) => (
        <Box key={cmd.name} flexDirection="row" gap={1} marginTop={1}>
          <Text color={index === selectedCommandIndex ? 'green' : 'dim'}>
            {index === selectedCommandIndex ? '▸' : ' '}
          </Text>
          <Text color={index === selectedCommandIndex ? 'green' : 'white'} bold={index === selectedCommandIndex}>
            {cmd.name}
          </Text>
          <Text color="dim">{cmd.description}</Text>
        </Box>
      ))}
      {filteredCommands.length === 0 && (
        <Box marginTop={1}>
          <Text color="dim">No matching commands</Text>
        </Box>
      )}
    </Box>
  ) : null;

  // Multi-line indicator
  const lineCount = inputValue.split('\n').length;
  const multiLineIndicator = lineCount > 1 ? (
    <Text color="dim">[{lineCount} lines]</Text>
  ) : null;

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color={disabled ? 'dim' : 'cyan'} bold>{'>'} </Text>
        <Box flexDirection="row" flexGrow={1}>
          <Text color={disabled ? 'dim' : 'white'}>{beforeCursor}</Text>
          {!disabled && <Text color="white" backgroundColor="white"> </Text>}
          <Text color="dim">{afterCursor || placeholder}</Text>
        </Box>
        {multiLineIndicator}
      </Box>
      {commandPalette}
    </Box>
  );
};