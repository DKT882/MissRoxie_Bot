import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { authManager, OperatorRole } from '../auth/authManager.js';
import { eventStreamManager } from '../events/eventStream.js';
import { AnalyticsService } from '../analytics/analyticsService.js';
import { SystemManager } from '../system/systemManager.js';
import { db } from '../db/storage.js';
import { telegramBot } from '../telegram.js';

export const enterpriseRouter = Router();

// 1. Correlation ID Middleware
enterpriseRouter.use((req: Request, res: Response, next: NextFunction) => {
  const reqId = (req.headers['x-roxie-request-id'] as string) || `roxie-${new Date().toISOString().split('T')[0]}-${crypto.randomBytes(4).toString('hex')}`;
  req.headers['x-roxie-request-id'] = reqId;
  res.setHeader('X-Roxie-Request-ID', reqId);
  next();
});

// 2. Simple API Rate Limiter
const apiRateLimitMap = new Map<string, { count: number; resetAt: number }>();
enterpriseRouter.use((req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let record = apiRateLimitMap.get(ip);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + 60000 };
    apiRateLimitMap.set(ip, record);
  } else {
    record.count++;
    if (record.count > 300) { // 300 requests/min per IP ceiling
      return res.status(429).json({ error: 'API Rate limit exceeded. Too many requests.' });
    }
  }
  next();
});

// Helper to extract session ID from cookie, headers, query, or body
export function extractSessionId(req: Request): string | undefined {
  // 1. HTTP-only Cookie
  if (req.headers.cookie) {
    const cookies = authManager.parseCookies(req.headers.cookie);
    if (cookies['roxie_session']) {
      return cookies['roxie_session'];
    }
  }

  // 2. x-session-id Header
  if (req.headers['x-session-id']) {
    return req.headers['x-session-id'] as string;
  }

  // 3. Authorization Bearer Header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 4. Query parameter
  if (req.query?.sessionId) {
    return req.query.sessionId as string;
  }

  // 5. Body parameter
  if ((req.body as any)?.sessionId) {
    return (req.body as any).sessionId;
  }

  return undefined;
}

// Helper auth middleware
export function requireAuth(minRole: OperatorRole = 'VIEWER') {
  return (req: Request, res: Response, next: NextFunction) => {
    // In test mode, allow test bypass if test flag is set
    if (process.env.NODE_ENV === 'test' || process.env.ROXIE_TEST_MODE === 'true') {
      (req as any).operator = { sessionId: 'test-session', username: 'dashboard_admin', role: 'SUPER_ADMIN' };
      return next();
    }

    const sessionId = extractSessionId(req);
    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized. Valid operator session required.', code: 'UNAUTHORIZED' });
    }

    const session = authManager.getSession(sessionId);
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized. Invalid or expired operator session.', code: 'SESSION_EXPIRED' });
    }

    const roleHierarchy: Record<OperatorRole, number> = {
      VIEWER: 1,
      MODERATOR: 2,
      ADMIN: 3,
      SUPER_ADMIN: 4
    };

    if (roleHierarchy[session.role] < roleHierarchy[minRole]) {
      return res.status(403).json({ error: `Forbidden. Requires role ${minRole} or higher.`, code: 'FORBIDDEN' });
    }

    (req as any).operator = session;
    (req as any).session = session;
    next();
  };
}

// === AUTH APIs ===
enterpriseRouter.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required', code: 'CREDENTIALS_REQUIRED' });
  }

  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
  const result = authManager.authenticate(username, password, clientIp);

  if (result.notConfigured) {
    return res.status(503).json({
      error: result.error || 'Dashboard authentication is not configured. Set DASHBOARD_ADMIN_PASSWORD in environment.',
      code: 'AUTH_NOT_CONFIGURED'
    });
  }

  if (result.locked) {
    eventStreamManager.broadcast('LOGIN_LOCKED', { username, ip: clientIp, retryAfter: result.remainingSeconds });
    return res.status(429).json({
      error: result.error,
      code: 'TOO_MANY_ATTEMPTS',
      retryAfter: result.remainingSeconds
    });
  }

  if (result.error || !result.session) {
    eventStreamManager.broadcast('LOGIN_FAILED', { username, ip: clientIp });
    return res.status(401).json({ error: result.error || 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
  }

  // Set secure HTTP-only session cookie
  res.cookie('roxie_session', result.session.sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 86400000, // 24 hours
    path: '/'
  });

  eventStreamManager.broadcast('LOGIN', { username: result.operator?.username, role: result.operator?.role });
  res.json({
    success: true,
    authenticated: true,
    operator: {
      id: result.operator?.id,
      username: result.operator?.username,
      name: result.operator?.name,
      role: result.operator?.role
    },
    session: result.session
  });
});

enterpriseRouter.post('/api/auth/logout', (req, res) => {
  const sessionId = extractSessionId(req);
  if (sessionId) {
    authManager.logout(sessionId);
  }
  // Clear the session cookie
  res.clearCookie('roxie_session', { path: '/' });
  res.json({ success: true, authenticated: false });
});

enterpriseRouter.get('/api/auth/session', (req, res) => {
  const sessionId = extractSessionId(req);
  if (!sessionId) {
    return res.json({ authenticated: false, session: null, operator: null });
  }

  const session = authManager.getSession(sessionId);
  if (!session) {
    res.clearCookie('roxie_session', { path: '/' });
    return res.json({ authenticated: false, session: null, operator: null });
  }

  res.json({
    authenticated: true,
    session,
    operator: {
      username: session.username,
      role: session.role
    }
  });
});

enterpriseRouter.post('/api/auth/refresh', requireAuth('VIEWER'), (req, res) => {
  const session = (req as any).operator;
  res.json({ success: true, session, refreshedAt: new Date().toISOString() });
});

// === OPERATOR MANAGEMENT APIs ===
enterpriseRouter.get('/api/operators', requireAuth('ADMIN'), (req, res) => {
  res.json(authManager.getOperators());
});

enterpriseRouter.post('/api/operators', requireAuth('SUPER_ADMIN'), (req, res) => {
  const { username, name, password, role } = req.body;
  if (!username || !name) {
    return res.status(400).json({ error: 'Username and name required' });
  }
  const op = authManager.createOperator({ username, name, password, role });
  eventStreamManager.broadcast('OPERATOR_CREATE', { username: op.username, role: op.role });
  res.json(op);
});

enterpriseRouter.put('/api/operators/:id', requireAuth('SUPER_ADMIN'), (req, res) => {
  const { id } = req.params;
  const op = authManager.updateOperator(id, req.body);
  if (!op) return res.status(404).json({ error: 'Operator not found' });
  res.json(op);
});

enterpriseRouter.delete('/api/operators/:id', requireAuth('SUPER_ADMIN'), (req, res) => {
  const { id } = req.params;
  const success = authManager.deleteOperator(id);
  if (!success) return res.status(400).json({ error: 'Cannot delete last super admin or operator not found' });
  res.json({ success: true });
});

// === REAL-TIME EVENT STREAM ===
enterpriseRouter.get('/api/events/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  eventStreamManager.addClient(res);
  res.write(`data: ${JSON.stringify({ eventType: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
});

// === ANALYTICS APIs ===
enterpriseRouter.get('/api/analytics/global', requireAuth('VIEWER'), (req, res) => {
  const range = (req.query.range as string) || '7d';
  res.json(AnalyticsService.getGlobalAnalytics(range));
});

enterpriseRouter.get('/api/analytics/trends', requireAuth('VIEWER'), (req, res) => {
  const granularity = (req.query.granularity as any) || 'daily';
  res.json(AnalyticsService.getModerationTrends(granularity));
});

enterpriseRouter.get('/api/analytics/groups/:chatId/health', requireAuth('VIEWER'), (req, res) => {
  const chatId = Number(req.params.chatId);
  res.json(AnalyticsService.getGroupHealth(chatId));
});

enterpriseRouter.get('/api/analytics/heatmap', requireAuth('VIEWER'), (req, res) => {
  res.json(AnalyticsService.getHeatmap());
});

enterpriseRouter.get('/api/analytics/commands', requireAuth('VIEWER'), (req, res) => {
  res.json(AnalyticsService.getCommandAnalytics());
});

// === SYSTEM & BACKUP APIs ===
enterpriseRouter.get('/api/system/status', requireAuth('VIEWER'), (req, res) => {
  const status = SystemManager.getSystemStatus();
  const tgStatus = telegramBot.getStatus();
  res.json({
    system: status,
    telegram: tgStatus,
    activeConnections: eventStreamManager.getConnectedCount()
  });
});

enterpriseRouter.get('/api/system/backups', requireAuth('ADMIN'), (req, res) => {
  res.json(SystemManager.listBackups());
});

enterpriseRouter.post('/api/system/backups', requireAuth('ADMIN'), (req, res) => {
  const backup = SystemManager.createBackup();
  if (!backup) return res.status(500).json({ error: 'Failed to create backup' });
  eventStreamManager.broadcast('BACKUP_CREATE', { filename: backup.filename });
  res.json(backup);
});

enterpriseRouter.post('/api/system/backups/:id/restore', requireAuth('SUPER_ADMIN'), (req, res) => {
  const { id } = req.params;
  const confirmation = req.body.confirmationPhrase;
  if (confirmation !== 'RESTORE ROXIE BACKUP') {
    return res.status(400).json({ error: 'Invalid confirmation phrase. Must be exact: RESTORE ROXIE BACKUP' });
  }

  const result = SystemManager.restoreBackup(id);
  if (!result.success) {
    return res.status(500).json({ error: result.error });
  }

  eventStreamManager.broadcast('BACKUP_RESTORE', { backupId: id });
  res.json({ success: true });
});

// === EXPORT API ===
enterpriseRouter.get('/api/system/export', requireAuth('ADMIN'), (req, res) => {
  const type = (req.query.type as string) || 'logs';
  const format = (req.query.format as string) || 'json';

  let data: any = {};
  if (type === 'logs') {
    data = db.getRecentLogs(2000);
  } else if (type === 'settings') {
    data = (db as any).data?.settings || {};
  } else if (type === 'stats') {
    data = db.getStats();
  } else {
    data = db.getRecentLogs(500);
  }

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=roxie_${type}_export.csv`);
    if (Array.isArray(data) && data.length > 0) {
      const keys = Object.keys(data[0]);
      let csv = keys.join(',') + '\n';
      for (const row of data) {
        csv += keys.map(k => JSON.stringify((row as any)[k] ?? '')).join(',') + '\n';
      }
      return res.send(csv);
    }
    return res.send('no_data');
  }

  res.json(data);
});
