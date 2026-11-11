export interface SessionEntry {
  id: string;
  timestamp: number;
  type: 'user' | 'assistant' | 'tool' | 'system' | 'compacted';
  content: string;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  createdAt: number;
  updatedAt: number;
  entries: SessionEntry[];
  tokenCount: number;
  compactedCount: number;
  workspaceRoot: string;
  metadata: Record<string, unknown>;
}

export interface CompactionResult {
  originalEntries: number;
  compactedEntries: number;
  tokensSaved: number;
  preservedEntries: SessionEntry[];
}

export interface SessionConfig {
  maxTokens: number;
  compactionThreshold: number;
  preservePatterns: string[];
  compactionModel?: string;
}

export interface SessionManagerConfig {
  sessionDir: string;
  config: SessionConfig;
}