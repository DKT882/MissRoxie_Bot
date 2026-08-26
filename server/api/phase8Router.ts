import { Router, Request, Response, NextFunction } from 'express';
import { authManager, OperatorRole } from '../auth/authManager.js';
import { errorTracker } from '../observability/errorService.js';
import { metricsTracker } from '../observability/metricsService.js';
import { alertManager } from '../observability/alertService.js';
import { timelineService } from '../observability/timelineService.js';
import { DisasterRecoveryService } from '../system/disasterRecovery.js';
import { db } from '../db/storage.js';
import { telegramBot } from '../telegram.js';
import { eventStreamManager } from '../events/eventStream.js';

export const phase8Router = Router();

// Helper auth middleware
function requireAuth(minRole: OperatorRole = 'VIEWER') {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    let sessionId = req.headers['x-session-id'] as string;
    if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7);
    }
    const session = authManager.getSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized. Valid session required.' });
    }

    const roleHierarchy: Record<OperatorRole, number> = {
      VIEWER: 1,
      MODERATOR: 2,
      ADMIN: 3,
      SUPER_ADMIN: 4
    };

    if (roleHierarchy[session.role] < roleHierarchy[minRole]) {
      return res.status(403).json({ error: `Forbidden. Requires role ${minRole} or higher.` });
    }

    (req as any).operator = session;
    next();
  };
}

// === 1. SYSTEM HEALTH ===
phase8Router.get('/api/system/health', requireAuth('VIEWER'), (req, res) => {
  const uptime = Math.round(process.uptime());
  const memory = process.memoryUsage();
  const tgStatus = telegramBot.getStatus();
  const openAlerts = alertManager.getAlerts('OPEN');
  
  let status = 'HEALTHY';
  if (openAlerts.some(a => a.severity === 'CRITICAL')) {
    status = 'CRITICAL';
  } else if (openAlerts.length > 0 || !tgStatus.isPolling) {
    status = 'DEGRADED';
  }

  res.json({
    status,
    uptimeSeconds: uptime,
    nodeVersion: process.version,
    telegram: {
      status: tgStatus.isPolling ? 'CONNECTED' : 'STOPPED',
      lastPoll: tgStatus.lastPolledAt || new Date().toISOString(),
      lastError: tgStatus.pollingError || null
    },
    storage: {
      status: 'HEALTHY',
      sizeBytes: 50000
    },
    memory: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024)
    },
    counters: {
      activeGroups: Object.keys((db as any).data?.settings || {}).length,
      activeOperators: authManager.getOperators().length,
      activeSubscribers: eventStreamManager.getConnectedCount()
    },
    alertsCount: openAlerts.length
  });
});

// === 2. SYSTEM METRICS ===
phase8Router.get('/api/system/metrics', requireAuth('VIEWER'), (req, res) => {
  const range = (req.query.range as any) || 'current';
  res.json(metricsTracker.getMetrics(range));
});

// === 3. ERROR MONITORING ===
phase8Router.get('/api/system/errors', requireAuth('ADMIN'), (req, res) => {
  const severity = req.query.severity as any;
  const source = req.query.source as any;
  const search = req.query.search as string;
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const result = errorTracker.getErrors({ severity, source, search, limit, offset });
  res.json(result);
});

// === 4. SYSTEM EVENT TIMELINE ===
phase8Router.get('/api/system/timeline', requireAuth('VIEWER'), (req, res) => {
  const limit = Number(req.query.limit) || 100;
  res.json(timelineService.getTimeline(limit));
});

// === 5. AUTOMATED HEALTH ALERTS ===
phase8Router.get('/api/system/alerts', requireAuth('VIEWER'), (req, res) => {
  const status = req.query.status as any;
  res.json(alertManager.getAlerts(status));
});

phase8Router.post('/api/system/alerts/:id/acknowledge', requireAuth('ADMIN'), (req, res) => {
  const { id } = req.params;
  const operator = (req as any).operator;
  const success = alertManager.acknowledgeAlert(id, operator.username);
  if (!success) return res.status(404).json({ error: 'Alert not found' });
  eventStreamManager.broadcast('ALERT_ACKNOWLEDGED', { alertId: id, operator: operator.username });
  res.json({ success: true });
});

phase8Router.post('/api/system/alerts/:id/resolve', requireAuth('ADMIN'), (req, res) => {
  const { id } = req.params;
  const operator = (req as any).operator;
  const success = alertManager.resolveAlert(id, operator.username);
  if (!success) return res.status(404).json({ error: 'Alert not found' });
  eventStreamManager.broadcast('ALERT_RESOLVED', { alertId: id, operator: operator.username });
  res.json({ success: true });
});

// === 6. ENHANCED BACKUP & RESTORE ===
phase8Router.get('/api/system/backups', requireAuth('ADMIN'), (req, res) => {
  res.json(DisasterRecoveryService.listBackups());
});

phase8Router.post('/api/system/backups', requireAuth('ADMIN'), (req, res) => {
  const operator = (req as any).operator;
  const backup = DisasterRecoveryService.createBackup('MANUAL', operator.username);
  if (!backup) return res.status(500).json({ error: 'Failed to create backup' });
  eventStreamManager.broadcast('BACKUP_CREATE', { filename: backup.filename, operator: operator.username });
  res.json(backup);
});

phase8Router.post('/api/system/backups/:id/restore', requireAuth('SUPER_ADMIN'), (req, res) => {
  const { id } = req.params;
  const confirmation = req.body.confirmationPhrase;
  const operator = (req as any).operator;

  if (confirmation !== 'RESTORE ROXIE BACKUP') {
    return res.status(400).json({ error: 'Invalid confirmation phrase. Must be exact: RESTORE ROXIE BACKUP' });
  }

  const result = DisasterRecoveryService.restoreBackup(id, operator.username);
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  eventStreamManager.broadcast('BACKUP_RESTORE', { backupId: id, operator: operator.username });
  res.json({ success: true });
});
