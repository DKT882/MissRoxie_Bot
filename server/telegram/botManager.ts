import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUpdate, TelegramUser, TelegramChat, TelegramChatMember, TelegramBotStatus } from './types.js';
import { db } from '../db/storage.js';
import { CommandHandler, registerBotCommands } from './commands.js';
import { ModerationService } from './moderation.js';
import { messageScheduler } from './scheduler.js';
import { TelegramMiddleware, CommandContext } from './middleware.js';
import { RateLimiterService } from './rateLimiter.js';
import { ChatbotService } from './chatbot.js';
import { SmartProtectionService } from './smartProtection.js';
import { ReactionService } from './reactionService.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export class TelegramBotManager {
  private static activeInstanceId: string | null = null;
  private isRunning: boolean = false;
  private isStarting: boolean = false;
  private shouldStop: boolean = false;
  private lastUpdateId: number = 0;
  private static processedUpdateIds: Set<number> = new Set();
  private botUser: TelegramUser | null = null;
  private totalMessagesReceived: number = 0;
  private lastPolledAt: string | null = null;
  private pollingError: string | null = null;
  private abortController: AbortController | null = null;
  private reconnectCount: number = 0;
  private lastReconnectAt: string | null = null;

  public getReconnectCount(): number {
    return this.reconnectCount;
  }

  public getLastReconnectAt(): string | null {
    return this.lastReconnectAt;
  }

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
    if (this.isRunning || this.isStarting) {
      console.log('[TELEGRAM] startPolling ignored: already running or starting');
      return;
    }

    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      this.pollingError = 'Cannot start polling: TELEGRAM_BOT_TOKEN is not set.';
      return;
    }

    this.isStarting = true;
    this.shouldStop = false;
    this.pollingError = null;

    try {
      const conn = await this.testConnection();
      if (!conn.success || !this.botUser) {
        this.pollingError = conn.error || 'Failed to authenticate bot token with Telegram.';
        this.isRunning = false;
        this.isStarting = false;
        return;
      }

      // Delete webhook to allow long polling
      await telegramApi.deleteWebhook();

      // Register admin-only command visibility with Telegram
      await registerBotCommands().catch((err) => {
        console.warn('Failed to register bot commands on startup:', err);
      });

      // Start message scheduler
      messageScheduler.start();
    } catch (err: any) {
      this.pollingError = err.message;
      this.isRunning = false;
      this.isStarting = false;
      return;
    }

    this.isRunning = true;
    this.isStarting = false;
    const instanceId = Math.random().toString(36).substring(2, 9);
    TelegramBotManager.activeInstanceId = instanceId;
    console.log(`[TELEGRAM] polling instance started instanceId=${instanceId}`);

    // Run polling loop
    this.runPollingLoop(instanceId);
  }

  private async runPollingLoop(instanceId: string) {
    let hadError = false;
    while (!this.shouldStop && TelegramBotManager.activeInstanceId === instanceId) {
      try {
        this.lastPolledAt = new Date().toISOString();
        this.abortController = new AbortController();

        metricsTracker.increment('telegram_api_requests');
        const data = await telegramApi.getUpdates(
          this.lastUpdateId ? this.lastUpdateId + 1 : undefined,
          20,
          ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member']
        );

        if (!data.ok) {
          metricsTracker.increment('telegram_api_errors');
          if (data.error_code === 409) {
            this.pollingError = 'Conflict 409: Another bot session is active.';
            hadError = true;
            await new Promise((r) => setTimeout(r, 5000));
            continue;
          }
          if (data.error_code === 429 || data.parameters?.retry_after) {
            const retryAfterSec = data.parameters?.retry_after || 5;
            this.pollingError = `Rate limit 429: Too many requests. Retrying in ${retryAfterSec}s.`;
            hadError = true;
            await new Promise((r) => setTimeout(r, retryAfterSec * 1000));
            continue;
          }
          throw new Error(data.description || `Telegram API Error`);
        }

        if (hadError) {
          this.reconnectCount++;
          this.lastReconnectAt = new Date().toISOString();
          hadError = false;
        }

        if (Array.isArray(data.result)) {
          this.pollingError = null;
          for (const update of data.result as TelegramUpdate[]) {
            if (update.update_id) {
              if (TelegramBotManager.processedUpdateIds.has(update.update_id)) {
                continue;
              }
              TelegramBotManager.processedUpdateIds.add(update.update_id);
              if (TelegramBotManager.processedUpdateIds.size > 2000) {
                const first = TelegramBotManager.processedUpdateIds.values().next().value;
                if (first) TelegramBotManager.processedUpdateIds.delete(first);
              }
              this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            }

            metricsTracker.increment('telegram_updates_received');
            try {
              if (update.message) {
                await this.handleMessage(update.message, false);
              } else if (update.edited_message) {
                await this.handleMessage(update.edited_message, true);
              } else if (update.callback_query) {
                const handledCaptcha = await ModerationService.handleCaptchaCallback(update.callback_query);
                if (!handledCaptcha) {
                  await CommandHandler.handleCallbackQuery(update.callback_query);
                }
              } else if ((update as any).chat_member) {
                await this.handleChatMemberUpdate((update as any).chat_member);
              }
              metricsTracker.increment('telegram_updates_processed');
            } catch (updateErr: any) {
              metricsTracker.increment('telegram_updates_failed');
              errorTracker.recordError({
                source: 'TELEGRAM',
                severity: 'ERROR',
                message: `Failed to process update ${update.update_id}: ${updateErr.message}`
              });
            }
          }
        }
      } catch (err: any) {
        if (this.shouldStop || TelegramBotManager.activeInstanceId !== instanceId) break;
        if (err.name === 'AbortError') break;

        metricsTracker.increment('telegram_api_errors');
        hadError = true;
        this.reconnectCount++;
        this.lastReconnectAt = new Date().toISOString();
        this.pollingError = err.message || 'Error during update polling';

        errorTracker.recordError({
          source: 'TELEGRAM',
          severity: 'WARN',
          message: `Telegram polling error / reconnect: ${err.message}`
        });

        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    if (TelegramBotManager.activeInstanceId === instanceId) {
      this.isRunning = false;
    }
  }

  private async handleMessage(message: TelegramMessage, isEdit: boolean = false) {
    this.totalMessagesReceived++;

    const chatId = message.chat?.id;
    const userId = message.from?.id;

    // Track message for group /clear purge capabilities
    if (chatId && message.message_id) {
      db.trackMessage(chatId, message.message_id, message.date, message.from?.id);
    }

    // Cache all encountered users in storage for reliable username and ID resolution
    if (message.from) {
      db.cacheUser(message.from, chatId);
    }

    if (isEdit) {
      return;
    }

    // Global per-user rate limiter check
    if (chatId && userId) {
      const rateCheck = await RateLimiterService.checkAndRecord(message, chatId, userId);
      if (!rateCheck.allowed) {
        return;
      }
    }
    if (message.reply_to_message?.from) {
      db.cacheUser(message.reply_to_message.from, chatId);
    }
    if (message.new_chat_members && Array.isArray(message.new_chat_members)) {
      for (const newMember of message.new_chat_members) {
        db.cacheUser(newMember, chatId);
      }
      const raidTriggered = await ModerationService.handleAntiRaid(chatId, message.new_chat_members, message.chat.title);
      if (!raidTriggered) {
        const me = await telegramApi.getMe();
        for (const newMember of message.new_chat_members) {
          if (newMember.id !== me.result?.id) {
            await ModerationService.handleCaptchaOnJoin(chatId, newMember, message.chat.title);
          }
        }
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

    // 0. Check Hashtag Notes Shortcuts (#notename)
    const shortcutHandled = await ModerationService.handleNotesShortcut(message);
    if (shortcutHandled) return;

    // 1. Process Welcome and Goodbye messages
    await ModerationService.handleWelcomeAndGoodbye(message);

    // 2. Check if message is a bot command (starts with '/' or '!')
    const textOrCaption = message.text || message.caption;
    if (textOrCaption) {
      const trimmed = textOrCaption.trim();
      if (trimmed.startsWith('/') || trimmed.startsWith('!')) {
        const parts = trimmed.split(/\s+/);
        const command = parts[0].startsWith('!') ? `/${parts[0].slice(1)}` : parts[0];
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

        await CommandHandler.handleCommand(ctx);
        return;
      }
    }

    // 3. Check Smart User Protection
    const smartProtected = await SmartProtectionService.handleMessage(message);
    if (smartProtected) return;

    // 4. Check Anti-Flood protection
    const floodIntercepted = await ModerationService.handleAntiFlood(message);
    if (floodIntercepted) return;

    // 4. Check Custom Text Filters
    const filterIntercepted = await ModerationService.handleCustomFilters(message);
    if (filterIntercepted) return;

    // 5. Check Content Locks & Media / Sticker / File / Forward / Poll / Location Protection
    const mediaIntercepted = await ModerationService.handleMediaAndStickerProtection(message);
    if (mediaIntercepted) return;

    // 6. Check Link Protection
    if (textOrCaption) {
      const linkIntercepted = await ModerationService.handleLinkProtection(message);
      if (linkIntercepted) return;
    }

    // 7. Check Smart Telegram Reactions (non-blocking & independent)
    ReactionService.handleMessageReaction(message).catch((err) => {
      console.error('[ReactionService] Error handling message reaction:', err);
    });

    // 8. Check Roxie AI Chatbot triggers
    const chatbotHandled = await ChatbotService.handleMessage(message, this.botUser);
    if (chatbotHandled) return;
  }

  private async handleChatMemberUpdate(chatMemberUpdate: {
    chat: TelegramChat;
    from: TelegramUser;
    date: number;
    old_chat_member: TelegramChatMember;
    new_chat_member: TelegramChatMember;
  }) {
    if (!chatMemberUpdate || !chatMemberUpdate.chat) return;
    const chatId = chatMemberUpdate.chat.id;
    const oldStatus = chatMemberUpdate.old_chat_member?.status;
    const newStatus = chatMemberUpdate.new_chat_member?.status;
    const user = chatMemberUpdate.new_chat_member?.user || chatMemberUpdate.from;

    if (user) {
      db.cacheUser(user, chatId);
    }

    const settings = db.getGroupSettings(chatId, chatMemberUpdate.chat.title);
    const chatTitle = chatMemberUpdate.chat.title || 'the group';

    // Member joined via invite link or approval
    if (newStatus === 'member' && oldStatus !== 'member' && user) {
      const me = await telegramApi.getMe();
      if (user.id !== me.result?.id) {
        const raidTriggered = await ModerationService.handleAntiRaid(chatId, [user], chatTitle);
        if (!raidTriggered) {
          await ModerationService.handleCaptchaOnJoin(chatId, user, chatTitle);
        }
      }
    }
  }

  public stopPolling() {
    this.shouldStop = true;
    TelegramBotManager.activeInstanceId = null;
    if (this.abortController) {
      this.abortController.abort();
    }
    messageScheduler.stop();
    this.isRunning = false;
    this.isStarting = false;
  }
}

export const telegramBot = new TelegramBotManager();
