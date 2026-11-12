import pino, { Logger, LoggerOptions, Level } from 'pino';

let loggerInstance: Logger | null = null;

export interface LogConfig {
  level: Level;
  pretty: boolean;
  name?: string;
}

const DEFAULT_CONFIG: LogConfig = {
  level: 'info',
  pretty: process.env.NODE_ENV !== 'production',
  name: 'hackculture',
};

export function createLogger(config: Partial<LogConfig> = {}): Logger {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const options: LoggerOptions = {
    name: finalConfig.name,
    level: finalConfig.level,
    base: {
      pid: process.pid,
      hostname: process.env.HOSTNAME || 'localhost',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
  };

  const logger = pino(options);

  loggerInstance = logger;
  return logger;
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    return createLogger();
  }
  return loggerInstance;
}

export function setLogLevel(level: Level): void {
  if (loggerInstance) {
    loggerInstance.level = level;
  }
}

export function getLogLevel(): Level {
  return loggerInstance?.level as Level || 'info';
}

// Child logger factory for module-specific logging
export function createChildLogger(module: string, meta?: Record<string, unknown>): Logger {
  const parent = getLogger();
  return parent.child({ module, ...meta });
}

// Standard log levels with semantic meanings for this project
export const LogLevel = {
  DEBUG: 'debug' as Level,
  INFO: 'info' as Level,
  WARN: 'warn' as Level,
  ERROR: 'error' as Level,
  FATAL: 'fatal' as Level,
} as const;

// Structured log event types for observability
export interface LogEventData {
  // Session events
  'session:created': { sessionId: string };
  'session:loaded': { sessionId: string; messageCount: number };
  'session:compacted': { sessionId: string; tokensBefore: number; tokensAfter: number };
  'session:closed': { sessionId: string };

  // Routing events
  'routing:decision': { target: 'bifrost' | 'local'; model: string; reason: string; estimatedCost: number };
  'routing:fallback': { from: string; to: string; reason: string };

  // Budget events
  'budget:check': { estimatedCost: number; allowed: boolean; remaining: number };
  'budget:recorded': { cost: number; totalUsed: number };
  'budget:alert': { threshold: number; percentage: number };
  'budget:exceeded': { limit: number; attempted: number };

  // Tool events
  'tool:start': { name: string; args: Record<string, unknown> };
  'tool:complete': { name: string; success: boolean; durationMs: number };
  'tool:approval': { name: string; decision: 'allow' | 'deny' | 'allow-session' | 'allow-always' };

  // Model events
  'model:request': { target: string; model: string; tokens: number };
  'model:response': { target: string; model: string; tokens: number; durationMs: number };
  'model:error': { target: string; model: string; error: string };

  // Config events
  'config:loaded': { configPath: string };
  'config:validation_error': { errors: string[] };

  // System events
  'system:startup': { version: string; config: Partial<LogConfig> };
  'system:shutdown': { reason: string; graceful: boolean };
  'system:error': { error: string; stack?: string };
}

export type LogEventName = keyof LogEventData;

// Type-safe event logger
export function logEvent<K extends LogEventName>(
  logger: Logger,
  event: K,
  data: LogEventData[K],
  level: Level = 'info'
): void {
  logger[level]({ event, ...data } as Record<string, unknown>, event);
}