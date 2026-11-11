import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  SessionEntry,
  SessionState,
  SessionConfig,
  SessionManagerConfig,
  CompactionResult,
} from './types.js';

const DEFAULT_CONFIG: SessionConfig = {
  maxTokens: 100000,
  compactionThreshold: 0.8,
  preservePatterns: [
    'error',
    'failed',
    'error:',
    'failed:',
    'exception',
    'traceback',
    'at ',
    'file:',
    'line:',
    'function',
    'signature',
    'export',
    'import',
    'interface',
    'type ',
    'class ',
    'const ',
    'let ',
    'var ',
    'async ',
    'await ',
    'return ',
    'throw ',
    'catch ',
    'try ',
  ],
};

export class SessionManager {
  private config: SessionManagerConfig;
  private state: SessionState | null = null;
  private sessionFile: string;
  private dirty = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(config: SessionManagerConfig) {
    this.config = {
      ...config,
      config: { ...DEFAULT_CONFIG, ...config.config },
    };
    this.sessionFile = path.join(this.config.sessionDir, 'session.jsonl');
  }

  async initialize(sessionId?: string): Promise<SessionState> {
    if (sessionId) {
      await this.load(sessionId);
    } else {
      this.state = this.createNewSession();
    }
    return this.state!;
  }

  private createNewSession(): SessionState {
    return {
      id: randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      entries: [],
      tokenCount: 0,
      compactedCount: 0,
      workspaceRoot: this.config.sessionDir,
      metadata: {},
    };
  }

  private async load(sessionId: string): Promise<void> {
    try {
      const content = await fs.readFile(this.sessionFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      if (lines.length === 0) {
        this.state = this.createNewSession();
        this.state.id = sessionId;
        return;
      }

      const entries: SessionEntry[] = lines.map(line => JSON.parse(line));
      const tokenCount = this.estimateTokens(entries.map(e => e.content).join('\n'));

      this.state = {
        id: sessionId,
        createdAt: entries[0]?.timestamp || Date.now(),
        updatedAt: entries[entries.length - 1]?.timestamp || Date.now(),
        entries,
        tokenCount,
        compactedCount: entries.filter(e => e.type === 'compacted').length,
        workspaceRoot: this.config.sessionDir,
        metadata: {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.state = this.createNewSession();
        this.state.id = sessionId;
      } else {
        throw error;
      }
    }
  }

  async append(entry: Omit<SessionEntry, 'id' | 'timestamp'>): Promise<void> {
    if (!this.state) throw new Error('Session not initialized');

    const newEntry: SessionEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    this.state.entries.push(newEntry);
    this.state.tokenCount += this.estimateTokens(entry.content);
    this.state.updatedAt = Date.now();
    this.dirty = true;

    await this.persist();
    await this.checkCompaction();
  }

  async appendUser(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.append({ type: 'user', content, metadata });
  }

  async appendAssistant(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.append({ type: 'assistant', content, metadata });
  }

  async appendTool(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.append({ type: 'tool', content, metadata });
  }

  async appendSystem(content: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.append({ type: 'system', content, metadata });
  }

  private async persist(): Promise<void> {
    if (!this.state || !this.dirty) return;

    this.writeQueue = this.writeQueue.then(async () => {
      try {
        const lines = this.state!.entries.map(e => JSON.stringify(e)).join('\n') + '\n';
        await fs.mkdir(path.dirname(this.sessionFile), { recursive: true });
        await fs.writeFile(this.sessionFile, lines, 'utf-8');
        this.dirty = false;
      } catch (error) {
        console.error('Failed to persist session:', error);
      }
    });

    await this.writeQueue;
  }

  private async checkCompaction(): Promise<void> {
    if (!this.state) return;

    const threshold = this.config.config.maxTokens * this.config.config.compactionThreshold;
    if (this.state.tokenCount > threshold) {
      await this.compact();
    }
  }

  async compact(): Promise<CompactionResult> {
    if (!this.state) throw new Error('Session not initialized');

    const originalEntries = this.state.entries.length;
    const originalTokens = this.state.tokenCount;

    // Separate entries to preserve vs compact
    const { preserve, compact } = this.partitionEntries(this.state.entries);

    // Compact the compactable entries
    const compactedContent = await this.compactEntries(compact);
    const compactedTokens = this.estimateTokens(compactedContent);

    // Create compacted entry
    const compactedEntry: SessionEntry = {
      id: randomUUID(),
      timestamp: Date.now(),
      type: 'compacted',
      content: compactedContent,
      metadata: {
        originalEntries: compact.length,
        compactedTokens,
        originalTokens: compact.reduce((sum, e) => sum + this.estimateTokens(e.content), 0),
      },
    };

    // New state with preserved + compacted
    const newEntries = [...preserve, compactedEntry];
    const newTokenCount = preserve.reduce((sum, e) => sum + this.estimateTokens(e.content), 0) + compactedTokens;

    this.state.entries = newEntries;
    this.state.tokenCount = newTokenCount;
    this.state.compactedCount += 1;
    this.state.updatedAt = Date.now();
    this.dirty = true;

    await this.persist();

    return {
      originalEntries,
      compactedEntries: newEntries.length,
      tokensSaved: originalTokens - newTokenCount,
      preservedEntries: preserve,
    };
  }

  private partitionEntries(entries: SessionEntry[]): { preserve: SessionEntry[]; compact: SessionEntry[] } {
    const preserve: SessionEntry[] = [];
    const compact: SessionEntry[] = [];

    for (const entry of entries) {
      // Always preserve recent entries (last 20)
      // Always preserve errors, file paths, function signatures
      // Compact the rest
      if (this.shouldPreserve(entry)) {
        preserve.push(entry);
      } else {
        compact.push(entry);
      }
    }

    // Ensure we keep at least the last 10 entries uncompacted
    const recentCount = 10;
    if (preserve.length < recentCount && compact.length > 0) {
      const toMove = compact.splice(-(recentCount - preserve.length));
      preserve.push(...toMove);
    }

    return { preserve, compact };
  }

  private shouldPreserve(entry: SessionEntry): boolean {
    // Preserve compacted entries
    if (entry.type === 'compacted') return true;

    // Preserve errors and failures
    const content = entry.content.toLowerCase();
    for (const pattern of this.config.config.preservePatterns) {
      if (content.includes(pattern.toLowerCase())) {
        return true;
      }
    }

    // Preserve entries with file paths
    if (content.match(/\.(ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|json|yaml|yml|md|txt)(\s|$|:)/)) {
      return true;
    }

    // Preserve entries with line numbers or stack traces
    if (content.match(/at\s+\S+\(|\s+\d+:\d+/)) {
      return true;
    }

    return false;
  }

  private async compactEntries(entries: SessionEntry[]): Promise<string> {
    if (entries.length === 0) return '';

    // Group by type and summarize
    const byType = new Map<string, SessionEntry[]>();
    for (const entry of entries) {
      const type = entry.type;
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type)!.push(entry);
    }

    const summaries: string[] = [];
    for (const [type, typeEntries] of byType) {
      if (typeEntries.length <= 3) {
        // Just include them directly if few
        summaries.push(...typeEntries.map(e => `[${type}] ${e.content}`));
      } else {
        // Summarize - we know length > 3 so indices 0 and -1 exist
        const first = typeEntries[0]!.content.substring(0, 200);
        const last = typeEntries[typeEntries.length - 1]!.content.substring(0, 200);
        summaries.push(`[${type}] ${typeEntries.length} entries compacted. First: ${first}... Last: ${last}...`);
      }
    }

    return summaries.join('\n');
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  getState(): SessionState | null {
    return this.state ? { ...this.state, entries: [...this.state.entries] } : null;
  }

  getEntries(): SessionEntry[] {
    return this.state ? [...this.state.entries] : [];
  }

  getTokenCount(): number {
    return this.state?.tokenCount || 0;
  }

  async close(): Promise<void> {
    await this.writeQueue;
  }

  async delete(): Promise<void> {
    try {
      await fs.unlink(this.sessionFile);
    } catch {
      // Ignore
    }
    this.state = null;
  }
}

export function createSessionManager(config: SessionManagerConfig): SessionManager {
  return new SessionManager(config);
}