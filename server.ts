import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { telegramBot } from './server/telegram.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Check Telegram Bot status safely (never exposes token)
  app.get('/api/telegram/status', (req, res) => {
    const status = telegramBot.getStatus();
    res.json(status);
  });

  // API Route: Test Telegram Bot connection via getMe
  app.post('/api/telegram/test-connection', async (req, res) => {
    const result = await telegramBot.testConnection();
    if (result.success) {
      // If polling wasn't running, start it now
      telegramBot.startPolling().catch(() => {});
      return res.json(result);
    } else {
      return res.status(400).json(result);
    }
  });

  // API Route: Explicitly trigger / restart polling
  app.post('/api/telegram/polling/start', async (req, res) => {
    await telegramBot.startPolling();
    res.json(telegramBot.getStatus());
  });

  // API Route: Get moderation audit logs
  app.get('/api/telegram/logs', (req, res) => {
    const status = telegramBot.getStatus();
    res.json(status.recentLogs);
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
