import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { telegramBot } from './server/telegram.js';
import { db } from './server/db/storage.js';
import { COMMAND_CATALOG } from './server/telegram/commandCatalog.js';
import { enterpriseRouter } from './server/api/enterpriseRouter.js';
import { phase8Router } from './server/api/phase8Router.js';
import { DisasterRecoveryService } from './server/system/disasterRecovery.js';
import { HealthDiagnosticsService } from './server/observability/healthService.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Startup recovery
  const startupResult = DisasterRecoveryService.startupRecovery();
  console.log('ROXIE STARTUP DIAGNOSTICS:', startupResult);

  app.use(express.json());
  app.use(enterpriseRouter);
  app.use(phase8Router);

  // Health check route as requested
  app.get('/health', (req, res) => {
    console.log('The server is running on this port');
    res.json({ status: 'healthy', port: PORT });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    try {
      const health = HealthDiagnosticsService.getSystemHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ status: 'ERROR', error: err.message });
    }
  });

  // API Route: Check Telegram Bot status safely (never exposes token)
  app.get('/api/telegram/status', (req, res) => {
    try {
      const status = telegramBot.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error('Error getting Telegram status:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Test Telegram Bot connection via getMe
  app.post('/api/telegram/test-connection', async (req, res) => {
    try {
      const result = await telegramBot.testConnection();
      if (result.success) {
        // If polling wasn't running, start it now
        telegramBot.startPolling().catch(() => {});
        return res.json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (err: any) {
      console.error('Error testing Telegram connection:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Explicitly trigger / restart polling
  app.post('/api/telegram/polling/start', async (req, res) => {
    try {
      await telegramBot.startPolling();
      res.json(telegramBot.getStatus());
    } catch (err: any) {
      console.error('Error starting polling:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Get moderation audit logs
  app.get('/api/telegram/logs', (req, res) => {
    try {
      const status = telegramBot.getStatus();
      res.json(status.recentLogs || []);
    } catch (err: any) {
      console.error('Error getting logs:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // === PHASE 5 DASHBOARD & CONTROL CENTER APIs ===

  // 1. Get command catalog
  app.get('/api/commands', (req, res) => {
    try {
      res.json(COMMAND_CATALOG);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Get all connected groups
  app.get('/api/groups', (req, res) => {
    try {
      const settings = (db as any).data?.settings || {};
      const groups = Object.entries(settings).map(([chatIdStr, s]: [string, any]) => {
        const chatId = Number(chatIdStr);
        const groupLogs = db.getGroupLogs(chatId, 100);
        const bans = groupLogs.filter(l => l.action === 'ban' || l.action === 'auto_ban').length;
        const kicks = groupLogs.filter(l => l.action === 'kick').length;
        const mutes = groupLogs.filter(l => l.action === 'mute').length;
        const warnings = db.getUserWarnings ? 0 : 0; // calculated aggregate if needed
        const reports = groupLogs.filter(l => l.action === 'report').length;
        const schedules = db.getGroupSchedules(chatId).length;

        return {
          chatId,
          chatTitle: s.chatTitle || `Group ${chatId}`,
          chatType: chatId < 0 ? 'supergroup' : 'private',
          username: s.username || undefined,
          memberCount: s.memberCount || 1,
          status: 'Active',
          stats: {
            bans,
            kicks,
            mutes,
            reports,
            schedules
          },
          settings: s
        };
      });
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Get comprehensive details for a specific group
  app.get('/api/groups/:chatId', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const settings = db.getGroupSettings(chatId);
      const logs = db.getGroupLogs(chatId, 100);
      const schedules = db.getGroupSchedules(chatId);
      const notes = db.getAllNotes(chatId);
      const approvedUsers = db.getApprovedUsers(chatId);
      const freedUsers = db.getFreedUsers(chatId);
      const locks = db.getLocks(chatId);
      const filters = db.getFilters(chatId);
      const linksWhitelist = db.getLinkWhitelist(chatId);

      const bans = logs.filter(l => l.action === 'ban' || l.action === 'auto_ban');
      const kicks = logs.filter(l => l.action === 'kick');
      const mutes = logs.filter(l => l.action === 'mute');
      const reports = logs.filter(l => l.action === 'report');

      res.json({
        chatId,
        chatTitle: settings.chatTitle || `Group ${chatId}`,
        settings,
        locks,
        filters,
        linksWhitelist,
        bans,
        kicks,
        mutes,
        reports,
        schedules,
        notes,
        approvedUsers,
        freedUsers,
        logs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get global dashboard overview
  app.get('/api/dashboard/overview', (req, res) => {
    try {
      const stats = db.getStats();
      const recentLogs = db.getRecentLogs(50);
      const settings = (db as any).data?.settings || {};
      const groupsCount = Object.keys(settings).length;

      res.json({
        stats,
        groupsCount,
        recentLogs,
        botStatus: telegramBot.getStatus()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Automatically initiate bot polling if TELEGRAM_BOT_TOKEN is present
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    telegramBot.startPolling().catch((err) => {
      console.error('Failed to start Telegram bot polling:', err.message);
    });
  }

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown sequence...`);
    try {
      telegramBot.stopPolling();
    } catch {}
    server.close(() => {
      console.log('HTTP server closed. Exiting cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Force shutting down after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer();
