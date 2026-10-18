export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

export const getEffectiveLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()?.trim() as LogLevel;
  if (envLevel && envLevel in LOG_LEVELS) {
    return envLevel;
  }
  return 'info';
};

export const isDebugLogging = (): boolean => {
  const level = getEffectiveLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS.debug || process.env.DEBUG === 'true';
};

export const isInfoLogging = (): boolean => {
  const level = getEffectiveLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS.info;
};

export function logDebug(eventOrMessage: any): void {
  if (isDebugLogging()) {
    if (typeof eventOrMessage === 'object' && eventOrMessage !== null) {
      console.log(JSON.stringify(eventOrMessage));
    } else {
      console.log(eventOrMessage);
    }
  }
}

export function initProductionLogging(forceLevel?: LogLevel): void {
  const currentLevel = forceLevel || getEffectiveLogLevel();
  const allowedLevelValue = LOG_LEVELS[currentLevel];

  // If level is 'error' (value 0) or 'warn', suppress verbose stdout logs
  if (allowedLevelValue < LOG_LEVELS.info) {
    console.log = (..._args: any[]) => {};
    console.info = (..._args: any[]) => {};
    console.debug = (..._args: any[]) => {};

    if (allowedLevelValue < LOG_LEVELS.warn) {
      console.warn = (..._args: any[]) => {};
    }
  }
}

// Auto-initialize production logging when module is loaded
initProductionLogging();

export interface PerformanceTraceLog {
  event: 'PERFORMANCE_STAGE_DURATION';
  path: 'update_command' | 'private_autoreply' | 'group_message' | 'dashboard_api' | 'mention_all';
  stage: string;
  durationMs: number;
  operationId?: string | number;
  chatId?: number;
  handlerName?: string;
  outcome: 'success' | 'failure' | 'skipped' | 'in_progress' | 'error' | string;
  details?: Record<string, any>;
  timestamp?: string;
}

function sanitizeLogDetails(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogDetails);
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lowerKey = k.toLowerCase();
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('session') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('cookie') ||
      lowerKey.includes('message') ||
      lowerKey.includes('text') ||
      lowerKey.includes('content')
    ) {
      continue; // omit sensitive fields
    }
    if (typeof v === 'string') {
      if (/^\d{8,11}:[a-zA-Z0-9_-]{35}/.test(v) || /^1[a-zA-Z0-9+/=]{40,}/.test(v)) {
        continue;
      }
    }
    clean[k] = typeof v === 'object' && v !== null ? sanitizeLogDetails(v) : v;
  }
  return clean;
}

export function logPerformance(data: Omit<PerformanceTraceLog, 'event'>): void {
  const sanitizedDetails = data.details ? sanitizeLogDetails(data.details) : undefined;
  const payload: PerformanceTraceLog = {
    event: 'PERFORMANCE_STAGE_DURATION',
    timestamp: new Date().toISOString(),
    ...data,
    details: sanitizedDetails
  };
  console.log(JSON.stringify(payload));
}

