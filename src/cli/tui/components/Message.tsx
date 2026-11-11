import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { TUIMessage } from '../../types.js';

const ROLE_COLORS: Record<string, string> = {
  user: 'cyan',
  assistant: 'green',
  system: 'dim',
  tool: 'yellow',
  error: 'red',
};

const ROLE_PREFIX: Record<string, string> = {
  user: '▸',
  assistant: '▸',
  system: '◆',
  tool: '⚙',
  error: '✗',
};

// Simple syntax highlighter for common languages
const highlightCode = (code: string, lang: string): React.ReactNode[] => {
  const lines = code.split('\n');
  const elements: React.ReactNode[] = [];

  // Keywords by language
  const keywords: Record<string, string[]> = {
    typescript: ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'from', 'as', 'type', 'interface', 'class', 'extends', 'implements', 'public', 'private', 'protected', 'readonly', 'static', 'abstract', 'declare', 'namespace', 'module', 'enum', 'any', 'unknown', 'never', 'void', 'null', 'undefined', 'boolean', 'number', 'string', 'object', 'symbol', 'bigint', 'Promise', 'Array', 'Map', 'Set', 'Date', 'Error', 'JSON', 'console', 'process', 'require', 'module', 'exports', 'default', 'await', 'yield', 'constructor', 'super', 'this', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'do', 'break', 'continue', 'debugger', 'with'],
    javascript: ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'default', 'try', 'catch', 'finally', 'throw', 'import', 'export', 'from', 'as', 'class', 'extends', 'public', 'private', 'protected', 'static', 'await', 'yield', 'constructor', 'super', 'this', 'new', 'delete', 'typeof', 'instanceof', 'in', 'of', 'do', 'break', 'continue', 'debugger', 'with'],
    json: ['true', 'false', 'null'],
    python: ['def', 'class', 'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'raise', 'import', 'from', 'as', 'return', 'yield', 'lambda', 'with', 'as', 'pass', 'break', 'continue', 'del', 'global', 'nonlocal', 'assert', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False'],
    rust: ['fn', 'let', 'mut', 'const', 'struct', 'enum', 'impl', 'trait', 'mod', 'use', 'pub', 'async', 'await', 'return', 'if', 'else', 'match', 'loop', 'while', 'for', 'in', 'break', 'continue', 'move', 'ref', 'ref mut', 'Box', 'Vec', 'String', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err'],
    go: ['func', 'var', 'const', 'struct', 'interface', 'type', 'package', 'import', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'defer', 'go', 'select', 'chan', 'map', 'make', 'new', 'nil', 'true', 'false'],
  };

  const langKeywords = keywords[lang.toLowerCase()] ?? keywords.typescript ?? [];
  const keywordRegex = new RegExp(`\\b(${langKeywords.join('|')})\\b`, 'g');
  const stringRegex = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  const commentRegex = /(\/\/.*|\/\*[\s\S]*?\*\/)/g;
  const numberRegex = /\b(\d+\.?\d*)\b/g;
  const functionRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\()/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineElements: React.ReactNode[] = [];
    const remaining = line;
    let lastIndex = 0;

    // Find all matches
    const matches: Array<{ start: number; end: number; type: string; text: string }> = [];

    // Keywords
    let match: RegExpExecArray | null;
    while ((match = keywordRegex.exec(line)) !== null) {
      const m = match;
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'keyword', text: m[0] });
    }
    // Strings
    while ((match = stringRegex.exec(line)) !== null) {
      const m = match;
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'string', text: m[0] });
    }
    // Comments
    while ((match = commentRegex.exec(line)) !== null) {
      const m = match;
      matches.push({ start: m.index, end: m.index + m[0].length, type: 'comment', text: m[0] });
    }
    // Numbers
    while ((match = numberRegex.exec(line)) !== null) {
      const m = match;
      if (!matches.some(mm => mm.start <= m.index && mm.end > m.index)) {
        matches.push({ start: m.index, end: m.index + m[0].length, type: 'number', text: m[0] });
      }
    }
    // Functions
    while ((match = functionRegex.exec(line)) !== null) {
      const m = match;
      if (!matches.some(mm => mm.start <= m.index && mm.end > m.index) && !langKeywords.includes(m[1] ?? '')) {
        matches.push({ start: m.index, end: m.index + (m[1]?.length ?? 0), type: 'function', text: m[1] ?? '' });
      }
    }

    // Sort by position
    matches.sort((a, b) => a.start - b.start);

    // Remove overlapping matches (keep first)
    const filteredMatches: typeof matches = [];
    for (const m of matches) {
      if (!filteredMatches.some(fm => fm.start <= m.start && fm.end > m.start)) {
        filteredMatches.push(m);
      }
    }

    // Build highlighted line
    for (const m of filteredMatches) {
      if (m.start > lastIndex) {
        lineElements.push(<Text key={`plain-${lastIndex}`}>{remaining.slice(lastIndex, m.start)}</Text>);
      }
      const color = m.type === 'keyword' ? 'magenta' : m.type === 'string' ? 'green' : m.type === 'comment' ? 'dim' : m.type === 'number' ? 'cyan' : m.type === 'function' ? 'yellow' : 'white';
      lineElements.push(<Text key={`${m.type}-${m.start}`} color={color}>{m.text}</Text>);
      lastIndex = m.end;
    }
    if (lastIndex < line.length) {
      lineElements.push(<Text key={`plain-end`}>{remaining.slice(lastIndex)}</Text>);
    }

    if (lineElements.length === 0) {
      lineElements.push(<Text key={i}>{line}</Text>);
    }

    elements.push(<Box key={i}>{lineElements}</Box>);
  }

  return elements;
};

export const Message: React.FC<{ message: TUIMessage }> = ({ message }) => {
  const color = ROLE_COLORS[message.role] || 'white';
  const prefix = ROLE_PREFIX[message.role] || '•';
  const timestamp = new Date(message.timestamp).toLocaleTimeString();
  const [expanded] = useState(false);

  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockLang = '';
    let codeLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockLang = trimmed.slice(3).trim() || 'typescript';
          codeLines = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <Box key={`code-${i}`} marginLeft={2} marginTop={1} marginBottom={1} padding={1} borderStyle="round" borderColor="dim">
              <Box flexDirection="row" gap={1} marginBottom={1}>
                <Text color="dim">{codeBlockLang}</Text>
                <Text color="dim">
                  {expanded ? '▼' : '▶'} {codeLines.length} lines
                </Text>
              </Box>
              {expanded && (
                <Box>
                  {highlightCode(codeLines.join('\n'), codeBlockLang)}
                </Box>
              )}
              {!expanded && <Text color="dim">(click to expand)</Text>}
            </Box>
          );
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Regular line - handle inline code
      if (line.includes('`')) {
        const parts = line.split(/(`[^`]+`)/);
        elements.push(
          <Box key={i}>
            {parts.map((part, idx) => (
              <Text key={idx} color={part.startsWith('`') && part.endsWith('`') ? 'yellow' : 'white'}>
                {part.startsWith('`') && part.endsWith('`') ? part.slice(1, -1) : part}
              </Text>
            ))}
          </Box>
        );
      } else {
        elements.push(<Text key={i}>{line}</Text>);
      }
    }

    return elements;
  };

  return (
    <Box marginBottom={1}>
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color={color} bold>{prefix}</Text>
        <Text color={color} bold>{message.role.toUpperCase()}</Text>
        <Text color="dim">{timestamp}</Text>
      </Box>
      <Box marginLeft={3}>
        {renderContent(message.content)}
        {message.metadata && (
          <Box marginTop={1}>
            <Text color="dim" italic>
              {JSON.stringify(message.metadata, null, 2)}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};