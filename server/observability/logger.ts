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
  // In production (e.g. Render), default strictly to 'error'
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    return 'error';
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
