import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUpdate, TelegramUser, TelegramChat, TelegramChatMember, TelegramBotStatus, TelegramRequestContext, TelegramChatJoinRequest } from './types.js';
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
import { logDebug } from '../observability/logger.js';

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
  private lastUpdateTimestamp: string | null = null;
  private lastProcessedMessageTimestamp: string | null = null;
  private lastStoredMessageTimestamp: string | null = null;
  private lastResponseTimestamp: string | null = null;

  // Per-chat sequential serialization queue
  private static chatQueues: Map<number, Promise<void>> = new Map();
  // Global concurrency semaphore for active expensive message processing
  private static activeProcessingCount: number = 0;
  public static readonly MAX_CONCURRENT_GLOBAL_PROCESSING = 4;
  private static globalSlotWaiters: Array<() => void> = [];

  public static async acquireGlobalSlot(): Promise<void> {
    if (this.activeProcessingCount < this.MAX_CONCURRENT_GLOBAL_PROCESSING) {
      this.activeProcessingCount++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.globalSlotWaiters.push(() => {
        this.activeProcessingCount++;
        resolve();
      });
    });
  }

  public static releaseGlobalSlot(): void {
    this.activeProcessingCount--;
    if (this.globalSlotWaiters.length > 0) {
      const next = this.globalSlotWaiters.shift();
      if (next) next();
    }
  }

  public static resetQueues(): void {
    this.chatQueues.clear();
    this.activeProcessingCount = 0;
    this.globalSlotWaiters = [];
  }

  public getReconnectCount(): number {
    return this.reconnectCount;
  }

  public getLastReconnectAt(): string | null {
    return this.lastReconnectAt;
  }

  public getDiagnosticsTimestamps() {
    return {
      lastUpdateTimestamp: this.lastUpdateTimestamp,
      lastProcessedMessageTimestamp: this.lastProcessedMessageTimestamp,
      lastStoredMessageTimestamp: this.lastStoredMessageTimestamp,
      lastResponseTimestamp: this.lastResponseTimestamp
    };
  }

  public recordResponseSent(): void {
    this.lastResponseTimestamp = new Date().toISOString();
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

  public async testConnection(maxAttempts: number = 3): Promise<{ success: boolean; bot?: TelegramUser; error?: string }> {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const tokenPresent = Boolean(token && token.length > 0);
    console.log(JSON.stringify({
      event: 'TELEGRAM_TOKEN_PRESENT',
      present: tokenPresent
    }));

    if (!tokenPresent) {
      console.error(JSON.stringify({
        event: 'TELEGRAM_GETME_FAILED',
        error_code: 401,
        description: 'TELEGRAM_BOT_TOKEN is not configured on the server.'
      }));
      return { success: false, error: 'TELEGRAM_BOT_TOKEN is not configured on the server.' };
    }

    let lastError = 'Unknown error';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();
      console.log(JSON.stringify({
        event: 'TELEGRAM_GETME_START',
        attempt,
        maxAttempts
      }));

      try {
        const res = await telegramApi.getMe();
        const elapsedMs = Date.now() - startTime;

        if (res.ok && res.result) {
          this.botUser = res.result;
          console.log(JSON.stringify({
            event: 'TELEGRAM_GETME_SUCCESS',
            username: res.result.username || res.result.first_name,
            bot_id: res.result.id,
            elapsed_ms: elapsedMs,
            attempt
          }));
          return { success: true, bot: res.result };
        } else {
          lastError = res.description || 'Telegram API returned an error';
          console.error(JSON.stringify({
            event: 'TELEGRAM_GETME_FAILED',
            error_code: res.error_code || 500,
            description: res.description || 'Telegram API returned an error',
            elapsed_ms: elapsedMs,
            attempt
          }));
        }
      } catch (err: any) {
        const elapsedMs = Date.now() - startTime;
        lastError = err.message || 'Failed to contact Telegram API';
        console.error(JSON.stringify({
          event: 'TELEGRAM_GETME_FAILED',
          error_code: 502,
          description: err.message || 'Failed to contact Telegram API',
          elapsed_ms: elapsedMs,
          attempt
        }));
      }

      if (attempt < maxAttempts) {
        const backoffMs = attempt * 2000;
        console.log(`[TELEGRAM] Retrying getMe in ${backoffMs / 1000}s (attempt ${attempt + 1}/${maxAttempts})...`);
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    return { success: false, error: lastError };
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
      const conn = await this.testConnection(5);
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
    console.log(JSON.stringify({
      event: 'TELEGRAM_POLLING_START',
      bot: this.botUser?.username || this.botUser?.first_name || 'Roxie',
      instanceId
    }));

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
        const offset = this.lastUpdateId ? this.lastUpdateId + 1 : undefined;
        const pollReqStart = Date.now();
        logDebug({
          event: 'POLLING_REQUEST_START',
          offset,
          timeout: 20
        });

        const data = await telegramApi.getUpdates(
          offset,
          20,
          ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member']
        );

        const pollElapsed = Date.now() - pollReqStart;
        logDebug({
          event: 'POLLING_RESPONSE',
          ok: data.ok,
          update_count: Array.isArray(data.result) ? data.result.length : 0,
          elapsedMs: pollElapsed
        });

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
          const updatesToProcess: TelegramUpdate[] = [];

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
              this.lastUpdateTimestamp = new Date().toISOString();
            }
            updatesToProcess.push(update);
          }

          if (updatesToProcess.length > 0) {
            logDebug({
              event: 'POLLING_UPDATE_RECEIVED_AT',
              received_count: updatesToProcess.length,
              oldest_update_id: updatesToProcess[0]?.update_id,
              newest_update_id: updatesToProcess[updatesToProcess.length - 1]?.update_id,
              active_chats_queued: TelegramBotManager.chatQueues.size
            });

            logDebug({
              event: 'TELEGRAM_CONCURRENCY',
              active_updates: TelegramBotManager.activeProcessingCount,
              queued_chats: TelegramBotManager.chatQueues.size,
              max_concurrency: TelegramBotManager.MAX_CONCURRENT_GLOBAL_PROCESSING
            });

            // CRITICAL: Immediately enqueue into background queues without blocking the next getUpdates polling request
            for (const u of updatesToProcess) {
              this.processUpdate(u).catch((err) => {
                console.error('[POLLING] Unhandled error processing update:', err);
              });
            }

            logDebug({
              event: 'POLLING_NEXT_REQUEST',
              next_offset: this.lastUpdateId ? this.lastUpdateId + 1 : undefined
            });
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

        console.error(JSON.stringify({
          event: 'TELEGRAM_POLLING_ERROR',
          error: err.message || 'Error during update polling'
        }));

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

  public async processUpdate(update: TelegramUpdate) {
    metricsTracker.increment('telegram_updates_received');
    const receivedAt = Date.now();
    const msg = update.message || update.edited_message;
    const textOrCap = msg ? (msg.text || msg.caption || '') : '';
    const isCmd = Boolean(textOrCap.trim().startsWith('/') || textOrCap.trim().startsWith('!'));
    const hasMedia = Boolean(msg && (msg.photo || msg.video || msg.sticker || msg.animation || msg.document || msg.voice || msg.audio));

    const traceId = `tr_${update.update_id || '0'}_${msg?.chat?.id || '0'}_${msg?.message_id || '0'}_${Date.now()}`;
    const telegramReceiveDelayMs = msg?.date ? Math.max(0, receivedAt - msg.date * 1000) : 0;

    logDebug({
      event: 'MESSAGE_TRACE_RECEIVED',
      traceId,
      updateId: update.update_id,
      chatId: msg?.chat?.id,
      messageId: msg?.message_id,
      userId: msg?.from?.id,
      telegram_receive_delay_ms: telegramReceiveDelayMs,
      elapsedMs: 0
    });

    if (msg) {
      logDebug({
        event: 'TELEGRAM_UPDATE_RECEIVED',
        update_id: update.update_id,
        chat_id: msg.chat?.id,
        chat_type: msg.chat?.type,
        message_id: msg.message_id,
        is_command: isCmd,
        has_text: Boolean(textOrCap),
        has_media: hasMedia
      });
    }

    const reqCtx: TelegramRequestContext = {
      traceId,
      updateId: update.update_id,
      chatId: msg?.chat?.id || 0,
      messageId: msg?.message_id || 0,
      userId: msg?.from?.id,
      chatType: msg?.chat?.type || 'unknown',
      isCommand: isCmd,
      receivedAt
    };

    const targetChatId = reqCtx.chatId;

    logDebug({
      event: 'MESSAGE_TRACE_QUEUE_ENTER',
      traceId,
      updateId: update.update_id,
      chatId: reqCtx.chatId,
      messageId: reqCtx.messageId,
      elapsedMs: Date.now() - receivedAt
    });

    const executeTask = async () => {
      const queueWaitMs = Date.now() - receivedAt;
      const pipelineStart = Date.now();

      logDebug({
        event: 'MESSAGE_TRACE_QUEUE_START',
        traceId,
        updateId: update.update_id,
        chatId: reqCtx.chatId,
        messageId: reqCtx.messageId,
        queue_wait_ms: queueWaitMs,
        elapsedMs: queueWaitMs
      });

      logDebug({
        event: 'MESSAGE_PIPELINE_START',
        update_id: update.update_id,
        chat_id: reqCtx.chatId,
        message_id: reqCtx.messageId,
        queue_wait_ms: queueWaitMs
      });

      await TelegramBotManager.acquireGlobalSlot();
      try {
        logDebug({
          event: 'TELEGRAM_UPDATE_PROCESSING',
          update_id: update.update_id,
          chat_id: reqCtx.chatId,
          message_id: reqCtx.messageId
        });

        if (update.message) {
          await this.handleMessage(update.message, false, reqCtx);
        } else if (update.edited_message) {
          await this.handleMessage(update.edited_message, true, reqCtx);
        } else if (update.callback_query) {
          const handledCaptcha = await ModerationService.handleCaptchaCallback(update.callback_query);
          if (!handledCaptcha) {
            await CommandHandler.handleCallbackQuery(update.callback_query);
          }
        } else if (update.chat_join_request) {
          await this.handleChatJoinRequest(update.chat_join_request);
        } else if ((update as any).chat_member) {
          await this.handleChatMemberUpdate((update as any).chat_member);
        } else if ((update as any).my_chat_member) {
          await this.handleChatMemberUpdate((update as any).my_chat_member);
        }

        const totalPipelineMs = Date.now() - pipelineStart;
        metricsTracker.increment('telegram_updates_processed');
        logDebug({
          event: 'MESSAGE_PIPELINE_END',
          update_id: update.update_id,
          chat_id: reqCtx.chatId,
          message_id: reqCtx.messageId,
          queue_wait_ms: queueWaitMs,
          pipeline_ms: totalPipelineMs,
          total_ms: Date.now() - receivedAt
        });
      } catch (updateErr: any) {
        metricsTracker.increment('telegram_updates_failed');
        errorTracker.recordError({
          source: 'TELEGRAM',
          severity: 'ERROR',
          message: `Failed to process update ${update.update_id}: ${updateErr.message}`
        });
      } finally {
        TelegramBotManager.releaseGlobalSlot();
      }
    };

    // Per-chat serialization: sequential queue for same chat, independent across different chats
    if (targetChatId !== 0) {
      const previous = TelegramBotManager.chatQueues.get(targetChatId) ?? Promise.resolve();
      const current = previous
        .catch(() => {})
        .then(() => executeTask())
        .finally(() => {
          if (TelegramBotManager.chatQueues.get(targetChatId) === current) {
            TelegramBotManager.chatQueues.delete(targetChatId);
          }
        });
      TelegramBotManager.chatQueues.set(targetChatId, current);
      return current;
    } else {
      return executeTask();
    }
  }

  private async handleMessage(message: TelegramMessage, isEdit: boolean = false, reqCtx?: TelegramRequestContext) {
    this.totalMessagesReceived++;
    this.lastProcessedMessageTimestamp = new Date().toISOString();

    const chatId = reqCtx?.chatId ?? message.chat?.id;
    const userId = reqCtx?.userId ?? message.from?.id;

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

    const authStart = Date.now();
    if (reqCtx) {
      logDebug({
        event: 'MESSAGE_TRACE_AUTH_START',
        traceId: reqCtx.traceId,
        updateId: reqCtx.updateId,
        chatId,
        messageId: reqCtx.messageId,
        elapsedMs: Date.now() - reqCtx.receivedAt
      });
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
        const me = await telegramApi.getMe().catch(() => null);
        for (const newMember of message.new_chat_members) {
          if (newMember.id !== me?.result?.id) {
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

    if (reqCtx) {
      logDebug({
        event: 'MESSAGE_TRACE_AUTH_END',
        traceId: reqCtx.traceId,
        updateId: reqCtx.updateId,
        chatId,
        messageId: reqCtx.messageId,
        auth_ms: Date.now() - authStart,
        elapsedMs: Date.now() - reqCtx.receivedAt
      });
    }

    // 0. Check Hashtag Notes Shortcuts (#notename)
    const shortcutHandled = await ModerationService.handleNotesShortcut(message);
    if (shortcutHandled) {
      this.recordResponseSent();
      return;
    }

    // 1. Process Welcome and Goodbye messages
    await ModerationService.handleWelcomeAndGoodbye(message);

    // 2. Check if message is a bot command (starts with '/' or '!')
    const textOrCaption = message.text || message.caption;
    if (textOrCaption) {
      const trimmed = textOrCaption.trim();
      if (trimmed.startsWith('/') || trimmed.startsWith('!')) {
        // Extract raw command and raw remainder preserving all line breaks, paragraphs, and indentation
        const cmdMatch = textOrCaption.match(/^([\/!][^\s]+)([\s\S]*)$/);
        const rawCmd = cmdMatch ? cmdMatch[1] : trimmed.split(/\s+/)[0];
        const rawRemainder = cmdMatch ? cmdMatch[2] : '';
        // Strip only the single leading separator (space or newline) immediately following the command token
        const rawArgs = rawRemainder.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');

        const parts = trimmed.split(/\s+/);
        const command = rawCmd.startsWith('!') ? `/${rawCmd.slice(1)}` : rawCmd;
        const args = parts.slice(1);

        // If command is explicitly addressed to a specific bot (e.g. /help@OtherBot), ignore if not for this bot
        if (rawCmd.includes('@')) {
          const targetBot = rawCmd.split('@')[1];
          if (this.botUser?.username && targetBot.toLowerCase() !== this.botUser.username.toLowerCase()) {
            return;
          }
        }

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
          command,
          rawArgs
        };

        console.log(JSON.stringify({
          event: 'TELEGRAM_COMMAND_RECEIVED',
          chat_id: message.chat.id,
          user_id: message.from?.id,
          command
        }));

        const handled = await CommandHandler.handleCommand(ctx);
        if (handled) {
          this.recordResponseSent();
        }
        console.log(JSON.stringify({
          event: 'TELEGRAM_MESSAGE_PROCESSED',
          chat_id: message.chat.id,
          message_id: message.message_id,
          is_command: true
        }));
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

    const mediaType = message.sticker ? 'sticker' :
      message.photo ? 'photo' :
      message.video ? 'video' :
      message.animation ? 'animation' :
      message.document ? 'document' :
      message.voice ? 'voice' :
      'text';

    const stickerSummary = message.sticker ? (
      `🎨 Sticker ${message.sticker.emoji || ''} ${message.sticker.set_name ? `(${message.sticker.set_name})` : ''} ${message.sticker.is_animated ? '[Animated]' : ''} ${message.sticker.is_video ? '[Video]' : ''}`.replace(/\s+/g, ' ').trim()
    ) : null;

    const content = textOrCaption || stickerSummary || (
      message.photo ? '📷 Photo' :
      message.video ? '📹 Video' :
      message.animation ? '🎬 GIF' :
      message.document ? '📄 Document' :
      message.voice ? '🎤 Voice' :
      'Media'
    );

    const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(' ') ||
      message.from?.username ||
      (userId ? `User ${userId}` : 'User');

    const storageStart = Date.now();
    if (reqCtx) {
      logDebug({
        event: 'MESSAGE_TRACE_STORAGE_START',
        traceId: reqCtx.traceId,
        updateId: reqCtx.updateId,
        chatId,
        messageId: reqCtx.messageId,
        elapsedMs: Date.now() - reqCtx.receivedAt
      });
    }

    // Record incoming group message in persistent memory for Group Messages dashboard & real replies
    if (chatId && chatId < 0 && message.message_id) {
      db.addGroupConversationEntry(chatId, {
        role: 'user',
        userId: message.from?.id,
        name: displayName,
        displayName,
        username: message.from?.username,
        content,
        timestamp: message.date ? message.date * 1000 : Date.now(),
        messageId: message.message_id,
        chatId,
        mediaType,
        direction: 'incoming',
        source: 'telegram',
        replyToMessageId: message.reply_to_message?.message_id
      });
      this.lastStoredMessageTimestamp = new Date().toISOString();
      logDebug({
        event: 'STORAGE_MESSAGE_SAVED',
        chat_id: chatId,
        message_id: message.message_id,
        chat_type: 'group'
      });
    } else if (chatId && chatId > 0 && userId && message.message_id) {
      // Record incoming private chat message in persistent memory for Control Center dashboard
      db.addPrivateMessage(chatId, userId, {
        role: 'user',
        content,
        timestamp: message.date ? message.date * 1000 : Date.now(),
        messageId: message.message_id,
        mediaType,
        mediaFileId: message.sticker?.file_id,
        direction: 'in',
        username: message.from?.username,
        name: displayName,
        language: ChatbotService.detectLanguage(content).language
      });
      this.lastStoredMessageTimestamp = new Date().toISOString();
      logDebug({
        event: 'STORAGE_MESSAGE_SAVED',
        chat_id: chatId,
        message_id: message.message_id,
        chat_type: 'private'
      });
    }

    if (reqCtx) {
      logDebug({
        event: 'MESSAGE_TRACE_STORAGE_END',
        traceId: reqCtx.traceId,
        updateId: reqCtx.updateId,
        chatId,
        messageId: reqCtx.messageId,
        storage_ms: Date.now() - storageStart,
        elapsedMs: Date.now() - reqCtx.receivedAt
      });
    }

    // 7. Check Smart Telegram Reactions (non-blocking & independent)
    ReactionService.handleMessageReaction(message).catch((err) => {
      console.error('[ReactionService] Error handling message reaction:', err);
    });

    // 8. Check Roxie AI Chatbot triggers
    const chatbotHandled = await ChatbotService.handleMessage(message, this.botUser, reqCtx);
    if (chatbotHandled) {
      this.recordResponseSent();
    }

    logDebug({
      event: 'TELEGRAM_MESSAGE_PROCESSED',
      chat_id: chatId,
      message_id: message.message_id,
      is_command: false
    });
  }

  private async handleChatJoinRequest(joinRequest: TelegramChatJoinRequest) {
    if (!joinRequest || !joinRequest.chat || !joinRequest.from) return;
    const chatId = joinRequest.chat.id;
    const user = joinRequest.from;
    const chatTitle = joinRequest.chat.title || 'the group';

    db.cacheUser(user, chatId);

    const settings = db.getGroupSettings(chatId, chatTitle);
    if (settings.autoAcceptEnabled) {
      try {
        const res = await telegramApi.approveChatJoinRequest(chatId, user.id);
        if (res.ok) {
          db.addLog({
            chatId,
            chatTitle,
            targetUserId: user.id,
            targetUsername: user.username,
            action: 'auto_accept',
            details: `Auto-approved join request for user ${user.first_name || user.id}`
          });

          // If anti-raid not triggered, process captcha/welcome
          const raidTriggered = await ModerationService.handleAntiRaid(chatId, [user], chatTitle);
          if (!raidTriggered) {
            const captchaSent = await ModerationService.handleCaptchaOnJoin(chatId, user, chatTitle);
            if (!captchaSent) {
              await ModerationService.sendWelcome(chatId, user, chatTitle);
            }
          }
        } else {
          console.error(`[AutoAccept] Failed to approve join request for user ${user.id} in chat ${chatId}:`, res.description);
        }
      } catch (err: any) {
        console.error(`[AutoAccept] Exception approving join request for user ${user.id}:`, err.message);
      }
    }
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

    // Member joined via invite link, join request, or direct addition
    if (newStatus === 'member' && oldStatus !== 'member' && user) {
      const me = await telegramApi.getMe().catch(() => null);
      if (user.id !== me?.result?.id) {
        const raidTriggered = await ModerationService.handleAntiRaid(chatId, [user], chatTitle);
        if (!raidTriggered) {
          const captchaSent = await ModerationService.handleCaptchaOnJoin(chatId, user, chatTitle);
          // If CAPTCHA was not triggered/enabled, send welcome immediately
          if (!captchaSent) {
            await ModerationService.sendWelcome(chatId, user, chatTitle);
          }
        }
      }
    } else if ((newStatus === 'left' || newStatus === 'kicked') && oldStatus === 'member' && user) {
      await ModerationService.sendGoodbye(chatId, user, chatTitle);
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

  public getBotUser(): TelegramUser | null {
    return this.botUser;
  }
}

export const telegramBot = new TelegramBotManager();
