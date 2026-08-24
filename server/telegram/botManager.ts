import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUpdate, TelegramUser, TelegramBotStatus } from './types.js';
import { db } from '../db/storage.js';
import { CommandHandler } from './commands.js';
import { ModerationService } from './moderation.js';
import { messageScheduler } from './scheduler.js';
import { TelegramMiddleware, CommandContext } from './middleware.js';

export class TelegramBotManager {
  private isRunning: boolean = false;
  private shouldStop: boolean = false;
  private lastUpdateId: number = 0;
  private botUser: TelegramUser | null = null;
  private totalMessagesReceived: number = 0;
  private lastPolledAt: string | null = null;
  private pollingError: string | null = null;
  private abortController: AbortController | null = null;

  public getStatus(): TelegramBotStatus {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const isConfigured = Boolean(token && token.length > 0);
    const isValidFormat = isConfigured && token ? /^\d+:[A-Za-z0-9_-]{20,}$/.test(token) : false;

    return {
      variableName: 'TELEGRAM_BOT_TOKEN',
      isConfigured,
      isValidFormat,
      isPolling: this.isRunning,
      botInfo: this.botUser,
      totalMessagesReceived: this.totalMessagesReceived,
      lastPolledAt: this.lastPolledAt,
      pollingError: this.pollingError,
      stats: db.getStats(),
      recentLogs: db.getRecentLogs(25)
    };
  }

  public async testConnection(): Promise<{ success: boolean; bot?: TelegramUser; error?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured on the server.' };
    }

    try {
      const res = await telegramApi.getMe();
      if (res.ok && res.result) {
        this.botUser = res.result;
        return { success: true, bot: res.result };
      } else {
        return { success: false, error: res.description || 'Telegram API returned an error' };
      }
    } catch (err: any) {
      return { success: false, error: `Failed to contact Telegram API: ${err.message}` };
    }
  }

  public async startPolling() {
    if (this.isRunning) return;

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.pollingError = 'Cannot start polling: TELEGRAM_BOT_TOKEN is not set.';
      return;
    }

    this.shouldStop = false;
    this.isRunning = true;
    this.pollingError = null;

    try {
      const conn = await this.testConnection();
      if (!conn.success || !this.botUser) {
        this.pollingError = conn.error || 'Failed to authenticate bot token with Telegram.';
        this.isRunning = false;
        return;
      }

      // Delete webhook to allow long polling
      await telegramApi.deleteWebhook();

      // Start message scheduler
      messageScheduler.start();
    } catch (err: any) {
      this.pollingError = err.message;
      this.isRunning = false;
      return;
    }

    // Run polling loop
    this.runPollingLoop();
  }

  private async runPollingLoop() {
    while (!this.shouldStop) {
      try {
        this.lastPolledAt = new Date().toISOString();
        this.abortController = new AbortController();

        const data = await telegramApi.getUpdates(
          this.lastUpdateId ? this.lastUpdateId + 1 : undefined,
          20,
          ['message', 'edited_message']
        );

        if (!data.ok) {
          if (data.error_code === 409) {
            this.pollingError = 'Conflict 409: Another bot session is active.';
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          throw new Error(data.description || `Telegram API Error`);
        }

        if (Array.isArray(data.result)) {
          this.pollingError = null;
          for (const update of data.result as TelegramUpdate[]) {
            if (update.update_id) {
              this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            }

            if (update.message) {
              await this.handleMessage(update.message);
            } else if (update.edited_message) {
              await this.handleMessage(update.edited_message);
            }
          }
        }
      } catch (err: any) {
        if (this.shouldStop) break;
        if (err.name === 'AbortError') break;

        this.pollingError = err.message || 'Error during update polling';
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    this.isRunning = false;
  }

  private async handleMessage(message: TelegramMessage) {
    this.totalMessagesReceived++;

    const chatId = message.chat?.id;

    // Cache all encountered users in storage for reliable username and ID resolution
    if (message.from) {
      db.cacheUser(message.from, chatId);
    }
    if (message.reply_to_message?.from) {
      db.cacheUser(message.reply_to_message.from, chatId);
    }
    if (message.new_chat_members && Array.isArray(message.new_chat_members)) {
      for (const newMember of message.new_chat_members) {
        db.cacheUser(newMember, chatId);
      }
    }
    if (message.left_chat_member) {
      db.cacheUser(message.left_chat_member, chatId);
    }
    if (message.entities) {
      for (const entity of message.entities) {
        if (entity.user) {
          db.cacheUser(entity.user, chatId);
        }
      }
    }
    if (message.caption_entities) {
      for (const entity of message.caption_entities) {
        if (entity.user) {
          db.cacheUser(entity.user, chatId);
        }
      }
    }

    // Check sticker protection first if message contains sticker
    if (message.sticker) {
      const intercepted = await ModerationService.handleStickerProtection(message);
      if (intercepted) return;
    }

    // Check link protection on text or captions
    const textOrCaption = message.text || message.caption;
    if (textOrCaption) {
      // 1. Check if message is a bot command (starts with '/')
      const trimmed = textOrCaption.trim();
      if (trimmed.startsWith('/')) {
        const parts = trimmed.split(/\s+/);
        const command = parts[0];
        const args = parts.slice(1);

        const isAnonymousAdmin = TelegramMiddleware.isAnonymousAdminMessage(message, message.chat.id);
        const authorSignature = message.author_signature;
        
        let adminDisplayName = 'Admin';
        if (isAnonymousAdmin) {
          adminDisplayName = authorSignature ? `${authorSignature} (Anonymous Admin)` : 'Anonymous Admin';
        } else if (message.from?.username) {
          adminDisplayName = `@${message.from.username}`;
        } else if (message.from?.first_name) {
          adminDisplayName = message.from.first_name;
        }

        const ctx: CommandContext = {
          message,
          chatId: message.chat.id,
          chatTitle: message.chat.title || message.chat.first_name || 'Chat',
          sender: message.from || { id: 0, is_bot: false, first_name: 'Unknown' },
          isAnonymousAdmin,
          authorSignature,
          adminDisplayName,
          args,
          command
        };

        const handled = await CommandHandler.handleCommand(ctx);
        if (handled) return;
      }

      // 2. Check for unwanted links
      const linkIntercepted = await ModerationService.handleLinkProtection(message);
      if (linkIntercepted) return;
    }
  }

  public stopPolling() {
    this.shouldStop = true;
    if (this.abortController) {
      this.abortController.abort();
    }
    messageScheduler.stop();
    this.isRunning = false;
  }
}

export const telegramBot = new TelegramBotManager();
