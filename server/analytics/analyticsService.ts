import { db } from '../db/storage.js';
import { COMMAND_CATALOG } from '../telegram/commandCatalog.js';

export class AnalyticsService {
  public static getGlobalAnalytics(range: string = '7d') {
    const stats = db.getStats();
    const allLogs = db.getRecentLogs(10000);
    const settings = (db as any).data?.settings || {};
    const groupCount = Object.keys(settings).length;

    // Filter logs by date range if needed
    const now = Date.now();
    let cutoff = now - 7 * 86400000;
    if (range === 'today') cutoff = now - 86400000;
    else if (range === '30d') cutoff = now - 30 * 86400000;
    else if (range === '90d') cutoff = now - 90 * 86400000;
    else if (range === 'all') cutoff = 0;

    const filteredLogs = allLogs.filter(l => {
      const t = new Date(l.timestamp || Date.now()).getTime();
      return t >= cutoff;
    });

    const bans = filteredLogs.filter(l => l.action === 'ban' || l.action === 'auto_ban').length;
    const kicks = filteredLogs.filter(l => l.action === 'kick').length;
    const mutes = filteredLogs.filter(l => l.action === 'mute').length;
    const warnings = filteredLogs.filter(l => l.action === 'warn').length;
    const reports = filteredLogs.filter(l => l.action === 'report').length;
    const filters = filteredLogs.filter(l => (l.action as string) === 'filter_trigger').length;
    const captchaFails = filteredLogs.filter(l => (l.action as string) === 'captcha_fail').length;
    const antiRaidEvents = filteredLogs.filter(l => (l.action as string) === 'antiraid_trigger').length;
    const rateLimits = filteredLogs.filter(l => (l.action as string) === 'rate_limit_block').length;

    return {
      range,
      groupCount,
      totals: {
        bans,
        kicks,
        mutes,
        warnings,
        reports,
        filters,
        captchaFails,
        antiRaidEvents,
        rateLimits
      },
      rawStats: stats
    };
  }

  public static getModerationTrends(granularity: 'daily' | 'hourly' | 'weekly' = 'daily') {
    const logs = db.getRecentLogs(5000);
    const buckets: Record<string, { bans: number; kicks: number; mutes: number; warnings: number; reports: number }> = {};

    for (const l of logs) {
      const d = new Date(l.timestamp || Date.now());
      let key = d.toISOString().split('T')[0]; // daily YYYY-MM-DD
      if (granularity === 'hourly') {
        key = `${d.toISOString().split('T')[0]} ${String(d.getHours()).padStart(2, '0')}:00`;
      } else if (granularity === 'weekly') {
        // approximate week bucket
        key = `Week of ${d.toISOString().split('T')[0]}`;
      }

      if (!buckets[key]) {
        buckets[key] = { bans: 0, kicks: 0, mutes: 0, warnings: 0, reports: 0 };
      }

      if (l.action === 'ban' || l.action === 'auto_ban') buckets[key].bans++;
      else if (l.action === 'kick') buckets[key].kicks++;
      else if (l.action === 'mute') buckets[key].mutes++;
      else if (l.action === 'warn') buckets[key].warnings++;
      else if (l.action === 'report') buckets[key].reports++;
    }

    return Object.entries(buckets).map(([time, data]) => ({ time, ...data })).sort((a, b) => a.time.localeCompare(b.time));
  }

  public static getGroupHealth(chatId: number) {
    const settings = db.getGroupSettings(chatId);
    const logs = db.getGroupLogs(chatId, 200);
    const reports = logs.filter(l => l.action === 'report').length;
    const bans = logs.filter(l => l.action === 'ban' || l.action === 'auto_ban').length;
    const telegramErrors = logs.filter(l => l.result === 'error').length;

    // Calculation logic:
    // Start at 100
    // Deduct for telegram errors, high reports/bans ratio, disabled security settings
    let score = 100;
    if (!settings.captchaEnabled) score -= 15;
    if (!settings.raidEnabled) score -= 15;
    score -= Math.min(25, telegramErrors * 5);
    score -= Math.min(20, Math.floor(reports / 3));

    score = Math.max(20, Math.min(100, score));

    return {
      chatId,
      chatTitle: settings.chatTitle || `Group ${chatId}`,
      score,
      breakdown: {
        moderation: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : 'Needs Attention',
        security: settings.captchaEnabled && settings.raidEnabled ? 'Good' : 'Partial',
        telegram: telegramErrors === 0 ? 'Healthy' : 'Degraded',
        spam: reports < 5 ? 'Low' : 'Elevated',
        raidRisk: settings.raidEnabled ? 'Low' : 'High'
      },
      metrics: { reports, bans, telegramErrors }
    };
  }

  public static getHeatmap() {
    // 7 days (0=Sun to 6=Sat) x 24 hours
    const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    const logs = db.getRecentLogs(5000);

    for (const l of logs) {
      const d = new Date(l.timestamp || Date.now());
      const day = d.getDay();
      const hour = d.getHours();
      heatmap[day][hour]++;
    }

    return heatmap;
  }

  public static getCommandAnalytics() {
    const logs = db.getRecentLogs(5000);
    const counts: Record<string, { count: number; success: number; failure: number }> = {};

    for (const cmd of COMMAND_CATALOG) {
      counts[cmd.command] = { count: 0, success: 0, failure: 0 };
    }

    for (const l of logs) {
      if (l.command) {
        if (!counts[l.command]) {
          counts[l.command] = { count: 0, success: 0, failure: 0 };
        }
        counts[l.command].count++;
        if (l.result === 'success') counts[l.command].success++;
        else counts[l.command].failure++;
      }
    }

    return Object.entries(counts).map(([command, data]) => ({
      command,
      ...data,
      successRate: data.count > 0 ? Math.round((data.success / data.count) * 100) : 100
    })).sort((a, b) => b.count - a.count);
  }
}
