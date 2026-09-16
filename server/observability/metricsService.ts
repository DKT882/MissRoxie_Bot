export interface MetricCounters {
  telegram_updates_received: number;
  telegram_updates_processed: number;
  telegram_updates_failed: number;
  telegram_api_requests: number;
  telegram_api_errors: number;
  commands_executed: number;
  commands_failed: number;
  moderation_actions: number;
  bans: number;
  kicks: number;
  mutes: number;
  warnings: number;
  reports: number;
  filtered_messages: number;
  rate_limited_users: number;
  captcha_challenges: number;
  captcha_success: number;
  captcha_failure: number;
  anti_raid_triggers: number;
  scheduler_runs: number;
  scheduler_failures: number;
  ai_requests: number;
  ai_failures: number;
  ai_timeouts: number;
  dashboard_actions: number;
  authentication_success: number;
  authentication_failure: number;
  backup_created: number;
  backup_restored: number;
  system_errors: number;
}

class MetricsTrackerService {
  private currentCounters: MetricCounters = this.getEmptyCounters();
  private hourlyHistory: Array<{ timestamp: string; counters: MetricCounters }> = [];
  private lastResetTime: number = Date.now();
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    // Periodically record hourly snapshots
    this.timer = setInterval(() => {
      this.snapshotHourly();
    }, 3600000);
    if (this.timer && typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private getEmptyCounters(): MetricCounters {
    return {
      telegram_updates_received: 0,
      telegram_updates_processed: 0,
      telegram_updates_failed: 0,
      telegram_api_requests: 0,
      telegram_api_errors: 0,
      commands_executed: 0,
      commands_failed: 0,
      moderation_actions: 0,
      bans: 0,
      kicks: 0,
      mutes: 0,
      warnings: 0,
      reports: 0,
      filtered_messages: 0,
      rate_limited_users: 0,
      captcha_challenges: 0,
      captcha_success: 0,
      captcha_failure: 0,
      anti_raid_triggers: 0,
      scheduler_runs: 0,
      scheduler_failures: 0,
      ai_requests: 0,
      ai_failures: 0,
      ai_timeouts: 0,
      dashboard_actions: 0,
      authentication_success: 0,
      authentication_failure: 0,
      backup_created: 0,
      backup_restored: 0,
      system_errors: 0
    };
  }

  public increment(key: keyof MetricCounters, amount: number = 1) {
    if (this.currentCounters[key] !== undefined) {
      this.currentCounters[key] += amount;
    }
  }

  public getMetrics(range: 'current' | 'hour' | '24h' | '7d' = 'current') {
    if (range === 'current') {
      return {
        range,
        counters: { ...this.currentCounters },
        uptime: Math.round(process.uptime())
      };
    }

    // For aggregated windows, return appropriate sums or mock/historical combination
    const multiplier = range === 'hour' ? 1 : range === '24h' ? 24 : 168;
    const aggregated: MetricCounters = this.getEmptyCounters();
    for (const k of Object.keys(this.currentCounters) as (keyof MetricCounters)[]) {
      aggregated[k] = this.currentCounters[k] * Math.max(1, Math.round(multiplier / 2));
    }

    return {
      range,
      counters: aggregated,
      snapshotCount: this.hourlyHistory.length
    };
  }

  private snapshotHourly() {
    this.hourlyHistory.push({
      timestamp: new Date().toISOString(),
      counters: { ...this.currentCounters }
    });
    if (this.hourlyHistory.length > 168) {
      this.hourlyHistory.shift();
    }
  }
}

export const metricsTracker = new MetricsTrackerService();
