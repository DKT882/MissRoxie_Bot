import { telegramBot } from '../telegram.js';
import { messageScheduler } from '../telegram/scheduler.js';
import { metricsTracker } from './metricsService.js';
import { errorTracker } from './errorService.js';
import { db } from '../db/storage.js';

export class HealthDiagnosticsService {
  public static getSystemHealth() {
    const uptime = Math.round(process.uptime());
    const memory = process.memoryUsage();
    const tgStatus = telegramBot.getStatus();
    const metrics = metricsTracker.getMetrics('current');
    const recentErrors = errorTracker.getErrors({ limit: 20 }).errors;
    const activeGroupsCount = Object.keys((db as any).data?.settings || {}).length;

    const schedulerStatus = messageScheduler.getStatus();
    
    const botConfigured = tgStatus.isConfigured;
    const botPolling = tgStatus.isPolling;
    const pollingError = tgStatus.pollingError;

    let telegramPollingStatus: 'HEALTHY' | 'ERROR' | 'RECONNECTING' = 'HEALTHY';
    if (!botPolling && botConfigured) {
      telegramPollingStatus = 'RECONNECTING';
    } else if (pollingError) {
      telegramPollingStatus = 'ERROR';
    }

    const aiRequests = metrics.counters.ai_requests || 0;
    const aiFailures = metrics.counters.ai_failures || 0;
    const aiTimeouts = metrics.counters.ai_timeouts || 0;
    let aiStatus: 'HEALTHY' | 'DEGRADED' | 'ERROR' = 'HEALTHY';
    if (aiFailures > 5 || aiTimeouts > 5) {
      aiStatus = 'DEGRADED';
    }
    if (aiFailures > 20) {
      aiStatus = 'ERROR';
    }

    const schedulerFailures = schedulerStatus.failures || 0;
    let schStatus: 'HEALTHY' | 'DEGRADED' | 'ERROR' = 'HEALTHY';
    if (schedulerFailures > 0 && schedulerFailures < 5) schStatus = 'DEGRADED';
    if (schedulerFailures >= 5) schStatus = 'ERROR';

    const storageConnected = Boolean(db);

    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'ERROR' = 'HEALTHY';
    if (pollingError || schedulerFailures >= 5 || aiFailures > 20) {
      overallStatus = 'ERROR';
    } else if (!botPolling || schedulerFailures > 0 || aiTimeouts > 0 || aiFailures > 0) {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: uptime,
      nodeVersion: process.version,
      components: {
        bot: {
          configured: botConfigured,
          polling: botPolling,
          error: pollingError
        },
        telegramPolling: {
          status: telegramPollingStatus,
          lastPolledAt: tgStatus.lastPolledAt,
          error: pollingError,
          reconnectCount: telegramBot.getReconnectCount(),
          lastReconnectAt: telegramBot.getLastReconnectAt()
        },
        scheduler: {
          running: schedulerStatus.running,
          executions: schedulerStatus.executions,
          failures: schedulerFailures,
          status: schStatus
        },
        ai: {
          status: aiStatus,
          requests: aiRequests,
          failures: aiFailures,
          timeouts: aiTimeouts
        },
        storage: {
          connected: storageConnected,
          activeGroups: activeGroupsCount
        }
      },
      metrics: metrics.counters,
      memory: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
        external: Math.round(memory.external / 1024 / 1024)
      },
      recovery: {
        pollingReconnects: telegramBot.getReconnectCount(),
        schedulerFailures: schedulerFailures,
        aiTimeouts: aiTimeouts,
        aiFailures: aiFailures
      },
      recentErrors: recentErrors
    };
  }
}
