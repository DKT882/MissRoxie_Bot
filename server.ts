import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';

dotenv.config();

function getTelegramBotToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN?.trim();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Check Telegram Bot configuration status safely (never reveals token)
  app.get('/api/telegram/status', (req, res) => {
    const token = getTelegramBotToken();
    const isConfigured = Boolean(token && token.length > 0);
    
    // Basic format check for Telegram Bot Token (format: <number>:<string>)
    const isValidFormat = isConfigured && token ? /^\d+:[A-Za-z0-9_-]{20,}$/.test(token) : false;

    res.json({
      variableName: 'TELEGRAM_BOT_TOKEN',
      isConfigured,
      isValidFormat,
      configuredLength: isConfigured && token ? token.length : 0,
      maskedPreview: isConfigured && token 
        ? `${token.slice(0, 4)}...${token.slice(-4)}` 
        : null,
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // API Route: Verify Telegram Bot connection server-side
  app.post('/api/telegram/test-connection', async (req, res) => {
    const token = getTelegramBotToken();
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured on the server.'
      });
    }

    try {
      const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await telegramResponse.json();

      if (data.ok) {
        return res.json({
          success: true,
          bot: {
            id: data.result.id,
            username: data.result.username,
            firstName: data.result.first_name,
            canJoinGroups: data.result.can_join_groups,
            canReadGroupMessages: data.result.can_read_all_group_messages,
            supportsInlineQueries: data.result.supports_inline_queries
          }
        });
      } else {
        return res.status(400).json({
          success: false,
          error: data.description || 'Telegram API returned an error'
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to contact Telegram API: ${err.message}`
      });
    }
  });

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
