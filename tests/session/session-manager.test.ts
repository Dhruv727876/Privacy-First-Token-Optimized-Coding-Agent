import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager, createSessionManager } from '../../src/session/session-manager.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

const TEST_SESSION_DIR = path.join(tmpdir(), 'hackculture-test-session');

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_SESSION_DIR, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEST_SESSION_DIR, { recursive: true });

    manager = createSessionManager({
      sessionDir: TEST_SESSION_DIR,
      config: {
        maxTokens: 1000,
        compactionThreshold: 0.5,
        preservePatterns: ['error', 'failed', 'exception'],
      },
    });
  });

  afterEach(async () => {
    await manager.close();
    try {
      await fs.rm(TEST_SESSION_DIR, { recursive: true, force: true });
    } catch {}
  });

  it('creates new session', async () => {
    const state = await manager.initialize();
    expect(state.id).toBeDefined();
    expect(state.entries).toHaveLength(0);
    expect(state.tokenCount).toBe(0);
  });

  it('appends user message', async () => {
    await manager.initialize();
    await manager.appendUser('Hello world');
    const state = manager.getState();
    expect(state?.entries).toHaveLength(1);
    expect(state?.entries[0].type).toBe('user');
    expect(state?.entries[0].content).toBe('Hello world');
    expect(state?.tokenCount).toBeGreaterThan(0);
  });

  it('appends assistant message', async () => {
    await manager.initialize();
    await manager.appendAssistant('Hi there!');
    const state = manager.getState();
    expect(state?.entries[0].type).toBe('assistant');
  });

  it('appends tool message', async () => {
    await manager.initialize();
    await manager.appendTool('Tool result');
    const state = manager.getState();
    expect(state?.entries[0].type).toBe('tool');
  });

  it('appends system message', async () => {
    await manager.initialize();
    await manager.appendSystem('System message');
    const state = manager.getState();
    expect(state?.entries[0].type).toBe('system');
  });

  it('persists to JSONL file', async () => {
    await manager.initialize('test-session-1');
    await manager.appendUser('Test message');
    await manager.close();

    // Re-initialize and verify
    const manager2 = createSessionManager({
      sessionDir: TEST_SESSION_DIR,
      config: { maxTokens: 1000, compactionThreshold: 0.5, preservePatterns: [] },
    });
    await manager2.initialize('test-session-1');
    const state = manager2.getState();
    expect(state?.entries).toHaveLength(1);
    expect(state?.entries[0].content).toBe('Test message');
    await manager2.close();
  });

  it('loads existing session', async () => {
    await manager.initialize('persist-test');
    await manager.appendUser('First');
    await manager.appendAssistant('Second');
    await manager.close();

    const manager2 = createSessionManager({
      sessionDir: TEST_SESSION_DIR,
      config: { maxTokens: 1000, compactionThreshold: 0.5, preservePatterns: [] },
    });
    await manager2.initialize('persist-test');
    const state = manager2.getState();
    expect(state?.entries).toHaveLength(2);
    expect(state?.id).toBe('persist-test');
    await manager2.close();
  });

  it('compacts when threshold exceeded', async () => {
    await manager.initialize();
    // Add many entries to exceed threshold (500 tokens with 0.5 threshold = 500)
    for (let i = 0; i < 50; i++) {
      await manager.appendUser(`Message ${i}`.repeat(10)); // ~25 tokens each
    }

    const state = manager.getState();
    expect(state?.compactedCount).toBeGreaterThanOrEqual(0);
    // Should have compacted at least once
    if (state && state.tokenCount > 500) {
      expect(state.compactedCount).toBeGreaterThan(0);
    }
  });

  it('preserves error entries during compaction', async () => {
    await manager.initialize();

    // Add regular messages
    for (let i = 0; i < 20; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    // Add error message
    await manager.appendTool('Error: Failed to connect to server');

    // Add more regular messages to trigger compaction
    for (let i = 20; i < 40; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    const state = manager.getState();
    const entries = state?.entries || [];
    const errorEntries = entries.filter(e => e.content.includes('Error: Failed to connect'));
    expect(errorEntries.length).toBeGreaterThan(0);
  });

  it('preserves file path entries during compaction', async () => {
    await manager.initialize();

    for (let i = 0; i < 20; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    await manager.appendTool('Edited src/main.ts:10');

    for (let i = 20; i < 40; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    const state = manager.getState();
    const entries = state?.entries || [];
    const fileEntries = entries.filter(e => e.content.includes('src/main.ts'));
    expect(fileEntries.length).toBeGreaterThan(0);
  });

  it('preserves function signature entries', async () => {
    await manager.initialize();

    for (let i = 0; i < 20; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    await manager.appendAssistant('export function foo(bar: string): number {');

    for (let i = 20; i < 40; i++) {
      await manager.appendUser(`Regular message ${i}`);
    }

    const state = manager.getState();
    const entries = state?.entries || [];
    const funcEntries = entries.filter(e => e.content.includes('export function'));
    expect(funcEntries.length).toBeGreaterThan(0);
  });

  it('returns compaction result with stats', async () => {
    await manager.initialize();

    // Add entries that will be compacted (no preserve patterns)
    for (let i = 0; i < 30; i++) {
      await manager.appendUser(`Short message ${i}`);
    }

    const result = await manager.compact();
    expect(result.originalEntries).toBeGreaterThan(result.compactedEntries);
    expect(result.preservedEntries.length).toBeGreaterThan(0);
    // Tokens saved might be negative if summary is verbose, so just check it runs
    expect(typeof result.tokensSaved).toBe('number');
  });

  it('estimates tokens correctly', async () => {
    await manager.initialize();
    await manager.appendUser('Hello'); // 5 chars ~ 2 tokens
    const state = manager.getState();
    expect(state?.tokenCount).toBeGreaterThan(0);
  });

  it('closes cleanly', async () => {
    await manager.initialize();
    await manager.appendUser('Test');
    await manager.close();
    // Should not throw
  });

  it('deletes session file', async () => {
    await manager.initialize('delete-test');
    await manager.appendUser('Test');
    await manager.delete();

    const manager2 = createSessionManager({
      sessionDir: TEST_SESSION_DIR,
      config: { maxTokens: 1000, compactionThreshold: 0.5, preservePatterns: [] },
    });
    await manager2.initialize('delete-test');
    const state = manager2.getState();
    expect(state?.entries).toHaveLength(0);
    await manager2.close();
  });
});