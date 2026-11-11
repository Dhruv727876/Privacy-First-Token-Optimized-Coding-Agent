import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { loadConfig, AppConfig } from '../src/config/index.js';

describe('Config Loading', () => {
  const testConfigDir = path.join(process.cwd(), 'config');
  const defaultConfigPath = path.join(testConfigDir, 'default.yaml');
  const userConfigPath = path.join(testConfigDir, 'user.yaml');

  beforeEach(async () => {
    // Clean up any test user config
    try { await fs.unlink(userConfigPath); } catch {}
  });

  it('loads default config when no user config exists', async () => {
    const config = await loadConfig({});
    expect(config.bifrost.url).toBe('http://localhost:8080');
    expect(config.budget.dailyUsd).toBe(10);
    expect(config.privacy.defaultConfidential).toBe(false);
    expect(config.approval.read).toBe('auto');
    expect(config.approval.write).toBe('prompt');
  });

  it('merges user config over defaults', async () => {
    await fs.writeFile(userConfigPath, 'budget:\n  dailyUsd: 50\n', 'utf-8');
    const config = await loadConfig({});
    expect(config.budget.dailyUsd).toBe(50);
    expect(config.bifrost.url).toBe('http://localhost:8080');
  });

  it('CLI args override user config', async () => {
    await fs.writeFile(userConfigPath, 'bifrost:\n  url: "http://custom:9000"\n', 'utf-8');
    const config = await loadConfig({ bifrostUrl: 'http://cli:9999' });
    expect(config.bifrost.url).toBe('http://cli:9999');
  });

  it('validates config schema', async () => {
    await fs.writeFile(userConfigPath, 'budget:\n  dailyUsd: -5\n', 'utf-8');
    await expect(loadConfig({})).rejects.toThrow('Configuration validation failed');
  });

  it('handles confidential flag from CLI', async () => {
    const config = await loadConfig({ confidential: true });
    expect(config.privacy.defaultConfidential).toBe(true);
  });

  it('handles ollama URL override', async () => {
    const config = await loadConfig({ ollamaUrl: 'http://custom:11435' });
    expect(config.localModels.ollamaUrl).toBe('http://custom:11435');
  });
});