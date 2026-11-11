import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { AppConfig, AppConfigSchema, DEFAULT_CONFIG, ConfigOverrides } from './schema.js';
import { createLogger, logEvent } from '../logger.js';

const configLogger = createLogger({ name: 'hackculture:config' });

async function readYamlFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return yaml.load(content, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    configLogger.error({ err: error, path: filePath }, 'Failed to read config file');
    throw error;
  }
}

function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        (result as Record<string, unknown>)[key] = deepMerge(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      } else {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

function applyCliOverrides(config: AppConfig, overrides: ConfigOverrides): AppConfig {
  let result = { ...config };

  if (overrides.bifrostUrl) {
    result = { ...result, bifrost: { ...result.bifrost, url: overrides.bifrostUrl } };
  }
  if (overrides.bifrostVirtualKey) {
    result = { ...result, bifrost: { ...result.bifrost, virtualKey: overrides.bifrostVirtualKey } };
  }
  if (overrides.budgetDailyUsd) {
    result = { ...result, budget: { ...result.budget, dailyUsd: overrides.budgetDailyUsd } };
  }
  if (overrides.confidential !== undefined) {
    result = { ...result, privacy: { ...result.privacy, defaultConfidential: overrides.confidential } };
  }
  if (overrides.ollamaUrl) {
    result = { ...result, localModels: { ...result.localModels, ollamaUrl: overrides.ollamaUrl } };
  }
  if (overrides.tavilyApiKey) {
    result = { ...result, tavily: { ...result.tavily, apiKey: overrides.tavilyApiKey } };
  }
  if (overrides.sessionDir) {
    result = { ...result, session: { ...result.session, sessionDir: overrides.sessionDir } };
  }

  return result;
}

function validateConfig(config: AppConfig): string[] {
  const errors: string[] = [];

  // Validate Bifrost URL
  try {
    new URL(config.bifrost.url);
  } catch {
    errors.push('bifrost.url: must be a valid URL');
  }

  // Validate Ollama URL
  try {
    new URL(config.localModels.ollamaUrl);
  } catch {
    errors.push('localModels.ollamaUrl: must be a valid URL');
  }

  // Validate budget limits
  if (config.budget.dailyUsd <= 0) {
    errors.push('budget.dailyUsd: must be positive');
  }
  if (config.budget.monthlyUsd <= 0) {
    errors.push('budget.monthlyUsd: must be positive');
  }
  if (config.budget.perTaskUsd <= 0) {
    errors.push('budget.perTaskUsd: must be positive');
  }
  if (config.budget.perTaskUsd > config.budget.dailyUsd) {
    errors.push('budget.perTaskUsd: cannot exceed dailyUsd');
  }
  if (config.budget.dailyUsd > config.budget.monthlyUsd) {
    errors.push('budget.dailyUsd: cannot exceed monthlyUsd');
  }

  // Validate alert thresholds
  for (const threshold of config.budget.alertThresholds) {
    if (threshold < 0 || threshold > 100) {
      errors.push('budget.alertThresholds: must be between 0 and 100');
    }
  }

  // Validate VRAM limit
  if (config.localModels.maxVramGb <= 0 || config.localModels.maxVramGb > 80) {
    errors.push('localModels.maxVramGb: must be between 1 and 80');
  }

  // Validate session config
  if (config.session.maxTokensBeforeCompact <= 0) {
    errors.push('session.maxTokensBeforeCompact: must be positive');
  }
  if (config.session.retainCompactedTurns <= 0) {
    errors.push('session.retainCompactedTurns: must be positive');
  }

  // Validate Tavily config
  if (config.tavily.timeoutMs <= 0) {
    errors.push('tavily.timeoutMs: must be positive');
  }
  if (config.tavily.maxResults <= 0) {
    errors.push('tavily.maxResults: must be positive');
  }
  if (config.tavily.cacheTtlMs <= 0) {
    errors.push('tavily.cacheTtlMs: must be positive');
  }

  return errors;
}

export async function loadConfig(cliOverrides: ConfigOverrides = {}): Promise<AppConfig> {
  const configDir = path.resolve(process.cwd(), 'config');
  const defaultConfigPath = path.join(configDir, 'default.yaml');
  const userConfigPath = cliOverrides.configFile ? path.resolve(cliOverrides.configFile) : path.join(configDir, 'user.yaml');

  configLogger.debug({ defaultConfigPath, userConfigPath }, 'Loading configuration');

  const defaultConfig = await readYamlFile(defaultConfigPath);
  const userConfig = await readYamlFile(userConfigPath);

  const merged = deepMerge(DEFAULT_CONFIG, defaultConfig as Partial<AppConfig>);
  const withUser = deepMerge(merged, userConfig as Partial<AppConfig>);
  const withCli = applyCliOverrides(withUser, cliOverrides);

  const parsed = AppConfigSchema.safeParse(withCli);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    const error = new Error(`Configuration validation failed:\n${issues}`);
    logEvent(configLogger, 'config:validation_error', { errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, 'error');
    throw error;
  }

  const validatedConfig = parsed.data;

  // Additional semantic validation
  const validationErrors = validateConfig(validatedConfig);
  if (validationErrors.length > 0) {
    const error = new Error(`Configuration validation failed:\n${validationErrors.join('\n')}`);
    logEvent(configLogger, 'config:validation_error', { errors: validationErrors }, 'error');
    throw error;
  }

  logEvent(configLogger, 'config:loaded', { configPath: userConfigPath });
  configLogger.info({ config: validatedConfig }, 'Configuration loaded successfully');

  return validatedConfig;
}

export { DEFAULT_CONFIG } from './schema.js';
export type { AppConfig } from './schema.js';
export type { ConfigOverrides } from './schema.js';