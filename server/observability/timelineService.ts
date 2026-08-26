import { db } from '../db/storage.js';
import { errorTracker } from './errorService.js';
import { authManager } from '../auth/authManager.js';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  category: 'AUTH' | 'TELEGRAM' | 'MODERATION' | 'SCHEDULER' | 'BACKUP' | 'ERROR' | 'SYSTEM' | 'DASHBOARD';
  action: string;
  description: string;
  chatId?: number;
  operatorId?: string;
  severity?: string;
}

class TimelineService {
  public getTimeline(limit: number = 100): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    // 1. Get recent moderation logs
    const logs = db.getRecentLogs(limit);
    for (const l of logs) {
      events.push({
        id: `log_${l.id || Math.random()}`,
        timestamp: l.timestamp || new Date().toISOString(),
        category: 'MODERATION',
        action: l.action,
        description: `Moderation action '${l.action}' executed in chat ${l.chatId} by ${l.adminUsername || 'Bot'} on user ${l.targetUsername || l.targetUserId || 'unknown'}`,
        chatId: l.chatId
      });
    }

    // 2. Get recent system errors
    const errs = errorTracker.getErrors({ limit: 50 }).errors;
    for (const e of errs) {
      events.push({
        id: `err_${e.id}`,
        timestamp: e.timestamp,
        category: 'ERROR',
        action: `${e.source}_ERROR`,
        description: `[${e.severity}] ${e.message}`,
        chatId: e.chatId,
        operatorId: e.operatorId,
        severity: e.severity
      });
    }

    // Sort by timestamp descending
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
  }
}

export const timelineService = new TimelineService();
