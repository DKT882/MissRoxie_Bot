export const isDebugLogging = (): boolean => {
  return process.env.LOG_LEVEL === 'debug' || process.env.DEBUG === 'true';
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
