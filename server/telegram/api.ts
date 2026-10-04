import { TelegramChatMember, TelegramUser, BotCommand, BotCommandScope } from './types.js';
import { logDebug } from '../observability/logger.js';

export const NON_IDEMPOTENT_TELEGRAM_METHODS = Object.freeze(new Set([
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendDocument',
  'sendAnimation',
  'sendSticker',
  'sendAudio',
  'sendVoice',
  'sendMediaGroup',
  'sendLocation',
  'sendVenue',
  'sendContact',
  'sendPoll',
  'sendDice',
  'sendInvoice',
  'sendGame'
]));

export interface TelegramApiCallOptions {
  maxRetries?: number;
  skipRateLimiter?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class TelegramApi {
  // In-flight request deduplication cache
  private inFlightStickerSets: Map<string, Promise<any>> = new Map();
  // Known permissions cache to avoid redundant setChatPermissions calls
  private knownChatPermissions: Map<string, string> = new Map();
  // Cached bot user profile
  private cachedBotInfo: { user: TelegramUser; timestamp: number } | null = null;

  // In-Memory Metadata TTL Caches (60 seconds TTL)
  private chatCache: Map<string, { data: any; expiresAt: number }> = new Map();
  private chatMemberCache: Map<string, { data: TelegramChatMember; expiresAt: number }> = new Map();
  private chatAdminsCache: Map<string, { data?: TelegramChatMember[]; description?: string; error_code?: number; expiresAt: number }> = new Map();
  private chatMemberCountCache: Map<string, { data: number; expiresAt: number }> = new Map();
  // Outbound rate limit scheduler state
  private lastRequestTimestamp: number = 0;
  private minIntervalMs: number = 35; // ~28 requests/sec max
  private maxRetries: number = 3;
  // Rate limit event statistics
  private rateLimitStats = {
    total429s: 0,
    retriesSucceeded: 0,
    retriesExhausted: 0,
    dedupedStickerRequests: 0,
    skippedPermissionUpdates: 0
  };

  private getToken(): string {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured in process.env');
    }
    return token;
  }

  public getRateLimiterStats() {
    return { ...this.rateLimitStats };
  }

  public resetRateLimiterStats() {
    this.rateLimitStats = {
      total429s: 0,
      retriesSucceeded: 0,
      retriesExhausted: 0,
      dedupedStickerRequests: 0,
      skippedPermissionUpdates: 0
    };
    this.knownChatPermissions.clear();
    this.inFlightStickerSets.clear();
    this.cachedBotInfo = null;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async paceRequest(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTimestamp;
    if (elapsed < this.minIntervalMs) {
      await this.sleep(this.minIntervalMs - elapsed);
    }
    this.lastRequestTimestamp = Date.now();
  }

  public async call<T = any>(
    method: string,
    body?: Record<string, any>,
    options?: TelegramApiCallOptions
  ): Promise<{ ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number }; skipped?: boolean }> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const rawChatId = isFormData ? (body as FormData).get('chat_id') : body?.chat_id;
    const numChatId = Number(rawChatId);
    const isDummyTarget = numChatId === -100111222333 ||
      numChatId === -100888777 ||
      numChatId === -1009876543210 ||
      numChatId === -100777888999 ||
      numChatId === -100999888101 ||
      String(rawChatId).includes('100111222333');

    // Centralized Hard Guard: Never allow HTTP requests to legacy dummy target
    if (isDummyTarget) {
      const stack = new Error().stack?.split('\n').slice(2, 6).map(s => s.trim()) || [];
      console.error(JSON.stringify({
        event: 'TELEGRAM_INVALID_LEGACY_TARGET',
        chat_id: rawChatId,
        method,
        stack
      }));
      return {
        ok: false,
        error_code: 400,
        description: `Blocked call to legacy dummy chat target (${rawChatId})`
      };
    }

    const maxRetries = options?.maxRetries ?? this.maxRetries;
    const timeoutMs = options?.timeoutMs ?? 20000;
    const reqId = `tg_${method}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    let attempt = 0;

    let token: string;
    try {
      token = this.getToken();
    } catch (err: any) {
      return {
        ok: false,
        error_code: 401,
        description: err.message || 'TELEGRAM_BOT_TOKEN not configured'
      };
    }

    while (attempt <= maxRetries) {
      const startedAt = Date.now();
      logDebug({
        event: 'TELEGRAM_REQUEST_START',
        requestId: reqId,
        method,
        chatId: rawChatId,
        startedAt,
        attempt: attempt + 1
      });

      try {
        if (!options?.skipRateLimiter) {
          await this.paceRequest();
        }

        if (method === 'setMyCommands' || method === 'deleteMyCommands') {
          const rawCommands = Array.isArray(body?.commands) ? body.commands : [];
          const uniqueNames = Array.from(new Set(rawCommands.map((c: any) => c?.command)));
          const extraFields = rawCommands.some((c: any) => Object.keys(c || {}).some(k => k !== 'command' && k !== 'description'));
          const totalNameChars = rawCommands.reduce((sum: number, c: any) => sum + (c?.command?.length || 0), 0);
          const totalDescChars = rawCommands.reduce((sum: number, c: any) => sum + (c?.description?.length || 0), 0);
          const maxDescLen = rawCommands.reduce((max: number, c: any) => Math.max(max, c?.description?.length || 0), 0);
          const avgDescLen = rawCommands.length > 0 ? Number((totalDescChars / rawCommands.length).toFixed(1)) : 0;
          const serializedBody = body ? (isFormData ? '[FormData]' : JSON.stringify(body)) : '';

          console.log(JSON.stringify({
            event: 'TELEGRAM_HTTP_PRE_FETCH_PAYLOAD',
            method,
            body_length: serializedBody.length,
            command_count: rawCommands.length,
            unique_command_count: uniqueNames.length,
            aggregate_character_budget: totalNameChars + totalDescChars,
            max_description_length: maxDescLen,
            average_description_length: avgDescLen,
            aliases_count: 0,
            has_extra_fields: extraFields,
            scope: body?.scope,
            language_code: body?.language_code
          }));
        }

        const url = `https://api.telegram.org/bot${token}/${method}`;
        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        let reqSignal: AbortSignal;
        if (options?.signal) {
          if (typeof (AbortSignal as any).any === 'function') {
            reqSignal = (AbortSignal as any).any([timeoutSignal, options.signal]);
          } else {
            reqSignal = options.signal;
          }
        } else {
          reqSignal = timeoutSignal;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
          body: isFormData ? (body as any) : (body ? JSON.stringify(body) : undefined),
          signal: reqSignal
        });

        const elapsedMs = Date.now() - startedAt;

        let data: any;
        try {
          data = await res.json();
        } catch {
          data = { ok: false, description: `Failed to parse response from Telegram API (HTTP ${res.status})`, error_code: res.status };
        }

        // Check if Telegram returned 429 Too Many Requests
        if (res.status === 429 || data.error_code === 429) {
          this.rateLimitStats.total429s++;
          const retryAfterSec = data.parameters?.retry_after ?? (Number(res.headers?.get('retry-after')) || 3);
          const backoffMs = Math.min(Math.max(retryAfterSec * 1000, 1000), 30_000) + 300; // bounded backoff with safety padding

          console.warn(`[TelegramApi] Rate limit 429 hit on ${method}. Backing off for ${(backoffMs / 1000).toFixed(1)}s (Attempt ${attempt + 1}/${maxRetries + 1}). Chat: ${body?.chat_id || 'N/A'}`);

          if (attempt < maxRetries) {
            attempt++;
            await this.sleep(backoffMs);
            continue; // Retry
          } else {
            this.rateLimitStats.retriesExhausted++;
            console.error(JSON.stringify({
              event: 'TELEGRAM_REQUEST_FAILED',
              requestId: reqId,
              method,
              chatId: rawChatId,
              elapsedMs,
              attempt: attempt + 1,
              error_code: 429,
              description: data.description || 'Rate limit exceeded'
            }));
            return {
              ok: false,
              error_code: 429,
              description: data.description || 'Telegram API rate limit exceeded after maximum retries',
              parameters: { retry_after: retryAfterSec }
            };
          }
        }

        if (data.ok) {
          if (attempt > 0) {
            this.rateLimitStats.retriesSucceeded++;
          }
          logDebug({
            event: 'TELEGRAM_REQUEST_SUCCESS',
            requestId: reqId,
            method,
            chatId: rawChatId,
            elapsedMs,
            attempt: attempt + 1
          });
        } else {
          console.error(JSON.stringify({
            event: 'TELEGRAM_REQUEST_FAILED',
            requestId: reqId,
            method,
            chatId: rawChatId,
            elapsedMs,
            attempt: attempt + 1,
            error_code: data.error_code,
            description: data.description
          }));
        }

        return data;
      } catch (err: any) {
        const elapsedMs = Date.now() - startedAt;
        if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.message?.includes('aborted') || err.message?.includes('timeout')) {
          console.warn(JSON.stringify({
            event: 'TELEGRAM_REQUEST_FAILED',
            requestId: reqId,
            method,
            chatId: rawChatId,
            elapsedMs,
            attempt: attempt + 1,
            error_code: 408,
            description: `Telegram API request timed out after ${timeoutMs}ms`
          }));
          return {
            ok: false,
            error_code: 408,
            description: `Telegram API request timed out after ${timeoutMs}ms`
          };
        }

        const isNonIdempotent = NON_IDEMPOTENT_TELEGRAM_METHODS.has(method);
        if (isNonIdempotent) {
          console.warn(JSON.stringify({
            event: 'TELEGRAM_NON_IDEMPOTENT_NETWORK_FAILURE_NO_RETRY',
            requestId: reqId,
            method,
            chatId: rawChatId,
            elapsedMs,
            attempt: attempt + 1,
            description: err.message || 'Network failure on non-idempotent send method (auto-retry suppressed to prevent duplicate messages)'
          }));
          return {
            ok: false,
            description: err.message || `Network failure on non-idempotent Telegram method ${method}`
          };
        }

        if (attempt < maxRetries && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.message?.includes('fetch failed'))) {
          attempt++;
          const backoffMs = 1000 * Math.pow(2, attempt - 1);
          await this.sleep(backoffMs);
          continue;
        }

        console.error(JSON.stringify({
          event: 'TELEGRAM_REQUEST_FAILED',
          requestId: reqId,
          method,
          chatId: rawChatId,
          elapsedMs,
          attempt: attempt + 1,
          description: err.message || 'Network request failed'
        }));

        return {
          ok: false,
          description: err.message || 'Network request failed'
        };
      }
    }

    return {
      ok: false,
      description: 'Request failed after maximum retry attempts'
    };
  }

  public async getMe(): Promise<{ ok: boolean; result?: TelegramUser; description?: string; error_code?: number }> {
    if (this.cachedBotInfo && (Date.now() - this.cachedBotInfo.timestamp < 10 * 60 * 1000)) {
      return { ok: true, result: this.cachedBotInfo.user };
    }
    const res = await this.call<TelegramUser>('getMe', undefined, { timeoutMs: 25000, maxRetries: 3, skipRateLimiter: true });
    if (res.ok && res.result) {
      this.cachedBotInfo = { user: res.result, timestamp: Date.now() };
    }
    return res;
  }

  public async getWebhookInfo(): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('getWebhookInfo', undefined, { timeoutMs: 15000, maxRetries: 2, skipRateLimiter: true });
  }

  public async deleteWebhook(): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteWebhook', { drop_pending_updates: false });
  }

  public async getUpdates(
    offset?: number,
    timeout: number = 20,
    allowed_updates: string[] = ['message', 'edited_message', 'callback_query', 'chat_member', 'my_chat_member', 'chat_join_request'],
    signal?: AbortSignal
  ): Promise<any> {
    const timeoutMs = (timeout * 1000) + 10000;
    return this.call('getUpdates', {
      offset: offset || undefined,
      timeout,
      allowed_updates
    }, { timeoutMs, maxRetries: 0, skipRateLimiter: true, signal });
  }

  public async sendMessage(
    chatId: number | string,
    text: string,
    options?: {
      reply_to_message_id?: number;
      reply_parameters?: { message_id: number; chat_id?: number | string };
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    const replyId = options?.reply_parameters?.message_id || options?.reply_to_message_id;
    const stackTrace = new Error().stack?.split('\n').slice(2, 6).map(s => s.trim()) || [];
    logDebug({
      event: 'TELEGRAM_SEND_CALLSITE',
      chatId,
      method: 'sendMessage',
      reply_to_message_id: replyId,
      stack: stackTrace
    });

    logDebug({
      event: 'TELEGRAM_SEND_START',
      chat_id: chatId,
      method: 'sendMessage',
      reply_to_message_id: replyId
    });

    let res = await this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      reply_to_message_id: replyId,
      reply_parameters: replyId ? { message_id: replyId } : undefined,
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_markup: options?.reply_markup
    }, { timeoutMs: 12000, maxRetries: 2 });

    // Fallback 1: If Telegram rejected due to deleted/missing replied message, retry without reply parameters
    if (!res.ok && replyId && (
      res.description?.toLowerCase().includes('message to be replied not found') ||
      res.description?.toLowerCase().includes('reply message not found') ||
      res.description?.toLowerCase().includes('message to reply not found') ||
      res.error_code === 400
    )) {
      const retryWithoutReply = await this.call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: options?.parse_mode || 'HTML',
        disable_web_page_preview: options?.disable_web_page_preview ?? true,
        reply_markup: options?.reply_markup
      }, { timeoutMs: 10000, maxRetries: 1 });
      if (retryWithoutReply.ok) {
        res = retryWithoutReply;
      }
    }

    // Fallback 2: If Telegram rejected due to invalid HTML entities, retry as plain text (no parse_mode)
    if (!res.ok && (
      res.description?.toLowerCase().includes('can\'t parse entities') ||
      res.description?.toLowerCase().includes('parse entities') ||
      res.description?.toLowerCase().includes('unclosed') ||
      res.description?.toLowerCase().includes('tag')
    )) {
      const retryPlainText = await this.call('sendMessage', {
        chat_id: chatId,
        text: text.replace(/<[^>]+>/g, ''),
        disable_web_page_preview: options?.disable_web_page_preview ?? true,
        reply_markup: options?.reply_markup
      }, { timeoutMs: 10000, maxRetries: 1 });
      if (retryPlainText.ok) {
        res = retryPlainText;
      }
    }

    if (res.ok) {
      logDebug({
        event: 'TELEGRAM_SEND_SUCCESS',
        chat_id: chatId,
        message_id: res.result?.message_id,
        method: 'sendMessage'
      });
    } else {
      console.error(JSON.stringify({
        event: 'TELEGRAM_SEND_FAILED',
        chat_id: chatId,
        method: 'sendMessage',
        error_code: res.error_code,
        description: res.description || 'Unknown error'
      }));
    }
    return res;
  }

  public async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options?: {
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      disable_web_page_preview?: boolean;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: options?.parse_mode || 'HTML',
      disable_web_page_preview: options?.disable_web_page_preview ?? true,
      reply_markup: options?.reply_markup
    });
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    options?: {
      text?: string;
      show_alert?: boolean;
      url?: string;
      cache_time?: number;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: options?.text,
      show_alert: options?.show_alert,
      url: options?.url,
      cache_time: options?.cache_time
    });
  }

  public async deleteMessage(chatId: number | string, messageId: number): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('deleteMessage', {
      chat_id: chatId,
      message_id: messageId
    }, { timeoutMs: 4000, maxRetries: 1 });
  }

  public async deleteMessages(chatId: number | string, messageIds: number[]): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    if (!messageIds || messageIds.length === 0) {
      return { ok: true, result: true };
    }
    return this.call('deleteMessages', {
      chat_id: chatId,
      message_ids: messageIds
    }, { timeoutMs: 6000, maxRetries: 1 });
  }

  public async banChatMember(
    chatId: number | string,
    userId: number,
    options?: { until_date?: number; revoke_messages?: boolean }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('banChatMember', {
      chat_id: chatId,
      user_id: userId,
      until_date: options?.until_date,
      revoke_messages: options?.revoke_messages
    });
  }

  public async unbanChatMember(
    chatId: number | string,
    userId: number,
    onlyIfBanned: boolean = true
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unbanChatMember', {
      chat_id: chatId,
      user_id: userId,
      only_if_banned: onlyIfBanned
    });
  }

  public async kickChatMember(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    // In Telegram Bot API, "kick" is ban followed immediately by unban so they can rejoin via invite link
    const banRes = await this.banChatMember(chatId, userId);
    if (!banRes.ok) {
      return banRes;
    }
    // Unban immediately so user is not permanently banned from re-joining
    await this.unbanChatMember(chatId, userId, false);
    return { ok: true };
  }

  public async restrictChatMember(
    chatId: number | string,
    userId: number,
    permissions: import('./types.js').ChatPermissions,
    options?: { until_date?: number; use_independent_chat_permissions?: boolean }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('restrictChatMember', {
      chat_id: chatId,
      user_id: userId,
      permissions,
      until_date: options?.until_date,
      use_independent_chat_permissions: options?.use_independent_chat_permissions ?? true
    });
  }

  public async unmuteChatMember(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    // Unmuted chat permissions: restore only normal message permission
    const unmutedPermissions: import('./types.js').ChatPermissions = {
      can_send_messages: true,
      can_send_audios: false,
      can_send_documents: false,
      can_send_photos: false,
      can_send_videos: false,
      can_send_video_notes: false,
      can_send_voice_notes: false,
      can_send_polls: false,
      can_send_other_messages: false,
      can_add_web_page_previews: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_change_info: false,
      can_manage_topics: false
    };

    return this.restrictChatMember(chatId, userId, unmutedPermissions, {
      use_independent_chat_permissions: true
    });
  }

  public async pinChatMessage(
    chatId: number | string,
    messageId: number,
    disableNotification: boolean = false
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('pinChatMessage', {
      chat_id: chatId,
      message_id: messageId,
      disable_notification: disableNotification
    });
  }

  public async unpinChatMessage(
    chatId: number | string,
    messageId?: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unpinChatMessage', {
      chat_id: chatId,
      message_id: messageId
    });
  }

  public async unpinAllChatMessages(
    chatId: number | string
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('unpinAllChatMessages', {
      chat_id: chatId
    });
  }

  public async promoteChatMember(
    chatId: number | string,
    userId: number,
    permissions: {
      is_anonymous?: boolean;
      can_manage_chat?: boolean;
      can_post_messages?: boolean;
      can_edit_messages?: boolean;
      can_delete_messages?: boolean;
      can_manage_video_chats?: boolean;
      can_restrict_members?: boolean;
      can_promote_members?: boolean;
      can_change_info?: boolean;
      can_invite_users?: boolean;
      can_pin_messages?: boolean;
      can_post_stories?: boolean;
      can_edit_stories?: boolean;
      can_delete_stories?: boolean;
      can_manage_topics?: boolean;
    }
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return this.call('promoteChatMember', {
      chat_id: chatId,
      user_id: userId,
      ...permissions
    });
  }

  public async getChatMember(
    chatId: number | string,
    userId: number,
    forceFresh: boolean = false
  ): Promise<{ ok: boolean; result?: TelegramChatMember; description?: string; error_code?: number }> {
    const key = `${chatId}_${userId}`;
    if (!forceFresh) {
      const cached = this.chatMemberCache.get(key);
      if (cached && Date.now() < cached.expiresAt) {
        return { ok: true, result: cached.data };
      }
    }

    const res = await this.call<TelegramChatMember>('getChatMember', {
      chat_id: chatId,
      user_id: userId
    }, { timeoutMs: 3500, maxRetries: 1 });

    if (res.ok && res.result) {
      this.chatMemberCache.set(key, { data: res.result, expiresAt: Date.now() + 60000 });
    }
    return res;
  }

  public clearChatMemberCache(chatId?: number | string, userId?: number): void {
    if (chatId !== undefined && userId !== undefined) {
      this.chatMemberCache.delete(`${chatId}_${userId}`);
      this.chatAdminsCache.delete(String(chatId));
    } else if (chatId !== undefined) {
      const prefix = `${chatId}_`;
      for (const k of this.chatMemberCache.keys()) {
        if (k.startsWith(prefix)) {
          this.chatMemberCache.delete(k);
        }
      }
      this.chatAdminsCache.delete(String(chatId));
    } else {
      this.chatMemberCache.clear();
      this.chatAdminsCache.clear();
    }
  }

  public async getChatAdministrators(
    chatId: number | string,
    forceFresh: boolean = false
  ): Promise<{ ok: boolean; result?: TelegramChatMember[]; description?: string; error_code?: number }> {
    const key = String(chatId);
    if (!forceFresh) {
      const cached = this.chatAdminsCache.get(key);
      if (cached && Date.now() < cached.expiresAt) {
        if (cached.data) {
          return { ok: true, result: cached.data };
        }
        return {
          ok: false,
          description: cached.description || 'Cached negative response',
          error_code: cached.error_code || 400
        };
      }
    }

    const res = await this.call<TelegramChatMember[]>('getChatAdministrators', {
      chat_id: chatId
    }, { timeoutMs: 4000, maxRetries: 1 });

    if (res.ok && res.result) {
      this.chatAdminsCache.set(key, { data: res.result, expiresAt: Date.now() + 30000 });
    } else {
      // 10-second negative/error cache to prevent repeated failing requests to Telegram
      this.chatAdminsCache.set(key, {
        description: res.description,
        error_code: res.error_code,
        expiresAt: Date.now() + 10000
      });
    }
    return res;
  }

  public async setChatSlowModeDelay(
    chatId: number | string,
    slowModeDelay: number
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('setChatSlowModeDelay', {
      chat_id: chatId,
      slow_mode_delay: slowModeDelay
    });
  }

  public async setMyCommands(
    commands: BotCommand[],
    scope?: BotCommandScope,
    language_code?: string
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('setMyCommands', {
      commands,
      scope: scope || undefined,
      language_code: language_code || undefined
    });
  }

  public async deleteMyCommands(
    scope?: BotCommandScope,
    language_code?: string
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('deleteMyCommands', {
      scope: scope || undefined,
      language_code: language_code || undefined
    });
  }

  public async getMyCommands(
    scope?: BotCommandScope,
    language_code?: string
  ): Promise<{ ok: boolean; result?: BotCommand[]; description?: string; error_code?: number }> {
    return this.call('getMyCommands', {
      scope: scope || undefined,
      language_code: language_code || undefined
    });
  }

  public async getFile(
    fileId: string
  ): Promise<{ ok: boolean; result?: { file_id: string; file_unique_id: string; file_size?: number; file_path?: string }; description?: string; error_code?: number }> {
    return this.call('getFile', { file_id: fileId });
  }

  public getFileDownloadUrl(filePath: string): string {
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!token) return '';
    return `https://api.telegram.org/file/bot${token}/${filePath}`;
  }

  public async sendChatAction(
    chatId: number | string,
    action: 'typing' | 'upload_photo' | 'record_video' | 'upload_video' | 'record_voice' | 'upload_voice' | 'upload_document' | 'choose_sticker' | 'find_location' | 'record_video_note' | 'upload_video_note'
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('sendChatAction', {
      chat_id: chatId,
      action
    }, { timeoutMs: 2500, maxRetries: 0 });
  }

  public async sendSticker(
    chatId: number | string,
    sticker: string,
    options?: {
      reply_to_message_id?: number;
      reply_markup?: any;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    let res = await this.call('sendSticker', {
      chat_id: chatId,
      sticker,
      reply_to_message_id: options?.reply_to_message_id,
      reply_markup: options?.reply_markup
    });

    // Fallback: If Telegram rejected due to deleted/missing replied message, retry without reply parameters
    if (!res.ok && options?.reply_to_message_id && (
      res.description?.toLowerCase().includes('message to be replied not found') ||
      res.description?.toLowerCase().includes('reply message not found') ||
      res.description?.toLowerCase().includes('message to reply not found') ||
      res.error_code === 400
    )) {
      const retryWithoutReply = await this.call('sendSticker', {
        chat_id: chatId,
        sticker,
        reply_markup: options?.reply_markup
      });
      if (retryWithoutReply.ok) {
        res = retryWithoutReply;
      }
    }
    if (res.ok) {
      logDebug({ event: 'TELEGRAM_SEND_SUCCESS', chat_id: chatId, message_id: res.result?.message_id, method: 'sendSticker' });
    } else {
      console.error(JSON.stringify({ event: 'TELEGRAM_SEND_FAILED', chat_id: chatId, method: 'sendSticker', error_code: res.error_code, description: res.description }));
    }
    return res;
  }

  public async sendPhoto(
    chatId: number | string,
    photo: string | { buffer: Buffer | Uint8Array; filename: string; contentType?: string },
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
      protect_content?: boolean;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    let bodyPayload: any;
    if (typeof photo === 'object' && photo && 'buffer' in photo) {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      const blob = new Blob([photo.buffer], { type: photo.contentType || 'image/jpeg' });
      formData.append('photo', blob, photo.filename || 'photo.jpg');
      if (options?.caption) formData.append('caption', options.caption);
      if (options?.parse_mode) formData.append('parse_mode', options.parse_mode);
      if (options?.reply_to_message_id) formData.append('reply_to_message_id', String(options.reply_to_message_id));
      if (options?.protect_content) formData.append('protect_content', 'true');
      if (options?.reply_markup) {
        formData.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      bodyPayload = formData;
    } else {
      bodyPayload = {
        chat_id: chatId,
        photo,
        caption: options?.caption,
        parse_mode: options?.parse_mode || 'HTML',
        reply_to_message_id: options?.reply_to_message_id,
        reply_markup: options?.reply_markup,
        protect_content: options?.protect_content
      };
    }

    const res = await this.call('sendPhoto', bodyPayload);
    if (res.ok) {
      logDebug({ event: 'TELEGRAM_SEND_SUCCESS', chat_id: chatId, message_id: res.result?.message_id, method: 'sendPhoto' });
    } else {
      console.error(JSON.stringify({ event: 'TELEGRAM_SEND_FAILED', chat_id: chatId, method: 'sendPhoto', error_code: res.error_code, description: res.description }));
    }
    return res;
  }

  public async sendVideo(
    chatId: number | string,
    video: string | { buffer: Buffer | Uint8Array; filename: string; contentType?: string },
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
      protect_content?: boolean;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    let bodyPayload: any;
    if (typeof video === 'object' && video && 'buffer' in video) {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      const blob = new Blob([video.buffer], { type: video.contentType || 'video/mp4' });
      formData.append('video', blob, video.filename || 'video.mp4');
      if (options?.caption) formData.append('caption', options.caption);
      if (options?.parse_mode) formData.append('parse_mode', options.parse_mode);
      if (options?.reply_to_message_id) formData.append('reply_to_message_id', String(options.reply_to_message_id));
      if (options?.protect_content) formData.append('protect_content', 'true');
      if (options?.reply_markup) {
        formData.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      bodyPayload = formData;
    } else {
      bodyPayload = {
        chat_id: chatId,
        video,
        caption: options?.caption,
        parse_mode: options?.parse_mode || 'HTML',
        reply_to_message_id: options?.reply_to_message_id,
        reply_markup: options?.reply_markup,
        protect_content: options?.protect_content
      };
    }

    const res = await this.call('sendVideo', bodyPayload);
    if (res.ok) {
      logDebug({ event: 'TELEGRAM_SEND_SUCCESS', chat_id: chatId, message_id: res.result?.message_id, method: 'sendVideo' });
    } else {
      console.error(JSON.stringify({ event: 'TELEGRAM_SEND_FAILED', chat_id: chatId, method: 'sendVideo', error_code: res.error_code, description: res.description }));
    }
    return res;
  }

  public async sendDocument(
    chatId: number | string,
    document: string | { buffer: Buffer | Uint8Array; filename: string; contentType?: string },
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
      protect_content?: boolean;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    let bodyPayload: any;
    if (typeof document === 'object' && document && 'buffer' in document) {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      const blob = new Blob([document.buffer], { type: document.contentType || 'application/octet-stream' });
      formData.append('document', blob, document.filename || 'document.pdf');
      if (options?.caption) formData.append('caption', options.caption);
      if (options?.parse_mode) formData.append('parse_mode', options.parse_mode);
      if (options?.reply_to_message_id) formData.append('reply_to_message_id', String(options.reply_to_message_id));
      if (options?.protect_content) formData.append('protect_content', 'true');
      if (options?.reply_markup) {
        formData.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      bodyPayload = formData;
    } else {
      bodyPayload = {
        chat_id: chatId,
        document,
        caption: options?.caption,
        parse_mode: options?.parse_mode || 'HTML',
        reply_to_message_id: options?.reply_to_message_id,
        reply_markup: options?.reply_markup,
        protect_content: options?.protect_content
      };
    }

    const res = await this.call('sendDocument', bodyPayload);
    if (res.ok) {
      logDebug({ event: 'TELEGRAM_SEND_SUCCESS', chat_id: chatId, message_id: res.result?.message_id, method: 'sendDocument' });
    } else {
      console.error(JSON.stringify({ event: 'TELEGRAM_SEND_FAILED', chat_id: chatId, method: 'sendDocument', error_code: res.error_code, description: res.description }));
    }
    return res;
  }

  public async sendAnimation(
    chatId: number | string,
    animation: string | { buffer: Buffer | Uint8Array; filename: string; contentType?: string },
    options?: {
      caption?: string;
      parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
      reply_to_message_id?: number;
      reply_markup?: any;
      protect_content?: boolean;
    }
  ): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    let bodyPayload: any;
    if (typeof animation === 'object' && animation && 'buffer' in animation) {
      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      const blob = new Blob([animation.buffer], { type: animation.contentType || 'image/gif' });
      formData.append('animation', blob, animation.filename || 'animation.gif');
      if (options?.caption) formData.append('caption', options.caption);
      if (options?.parse_mode) formData.append('parse_mode', options.parse_mode);
      if (options?.reply_to_message_id) formData.append('reply_to_message_id', String(options.reply_to_message_id));
      if (options?.protect_content) formData.append('protect_content', 'true');
      if (options?.reply_markup) {
        formData.append('reply_markup', typeof options.reply_markup === 'string' ? options.reply_markup : JSON.stringify(options.reply_markup));
      }
      bodyPayload = formData;
    } else {
      bodyPayload = {
        chat_id: chatId,
        animation,
        caption: options?.caption,
        parse_mode: options?.parse_mode || 'HTML',
        reply_to_message_id: options?.reply_to_message_id,
        reply_markup: options?.reply_markup,
        protect_content: options?.protect_content
      };
    }

    const res = await this.call('sendAnimation', bodyPayload);
    if (res.ok) {
      logDebug({ event: 'TELEGRAM_SEND_SUCCESS', chat_id: chatId, message_id: res.result?.message_id, method: 'sendAnimation' });
    } else {
      console.error(JSON.stringify({ event: 'TELEGRAM_SEND_FAILED', chat_id: chatId, method: 'sendAnimation', error_code: res.error_code, description: res.description }));
    }
    return res;
  }

  public async getStickerSet(name: string): Promise<{ ok: boolean; result?: { name?: string; title?: string; stickers: Array<{ file_id: string; emoji?: string; [key: string]: any }> }; description?: string; error_code?: number }> {
    const cleanKey = (name || '').toLowerCase().trim();
    if (this.inFlightStickerSets.has(cleanKey)) {
      this.rateLimitStats.dedupedStickerRequests++;
      return this.inFlightStickerSets.get(cleanKey)!;
    }

    const promise = (async () => {
      try {
        return await this.call('getStickerSet', { name });
      } finally {
        this.inFlightStickerSets.delete(cleanKey);
      }
    })();

    this.inFlightStickerSets.set(cleanKey, promise);
    return promise;
  }

  public async deleteStickerSet(name: string): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('deleteStickerSet', { name });
  }

  public async deleteStickerFromSet(sticker: string): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('deleteStickerFromSet', { sticker });
  }

  public async setMessageReaction(
    chatId: number | string,
    messageId: number,
    reaction?: string | Array<{ type: string; emoji: string }>,
    isBig?: boolean
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    let reactionPayload: any[] = [];
    if (typeof reaction === 'string') {
      reactionPayload = [{ type: 'emoji', emoji: reaction }];
    } else if (Array.isArray(reaction)) {
      reactionPayload = reaction;
    }
    return this.call('setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: reactionPayload,
      is_big: isBig
    }, { timeoutMs: 2500, maxRetries: 0 });
  }

  public async leaveChat(chatId: number | string): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('leaveChat', { chat_id: chatId });
  }

  public async approveChatJoinRequest(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('approveChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
  }

  public async declineChatJoinRequest(
    chatId: number | string,
    userId: number
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number }> {
    return this.call('declineChatJoinRequest', {
      chat_id: chatId,
      user_id: userId
    });
  }

  public async getChat(chatId: number | string): Promise<{ ok: boolean; result?: any; description?: string; error_code?: number }> {
    const key = String(chatId);
    const cached = this.chatCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return { ok: true, result: cached.data };
    }

    const res = await this.call('getChat', { chat_id: chatId }, { timeoutMs: 3500, maxRetries: 1 });
    if (res.ok && res.result) {
      this.chatCache.set(key, { data: res.result, expiresAt: Date.now() + 60000 });
    }
    return res;
  }

  public async getChatMemberCount(chatId: number | string): Promise<{ ok: boolean; result?: number; description?: string; error_code?: number }> {
    const key = String(chatId);
    const cached = this.chatMemberCountCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return { ok: true, result: cached.data };
    }

    const res = await this.call<number>('getChatMemberCount', { chat_id: chatId }, { timeoutMs: 3500, maxRetries: 1 });
    if (res.ok && res.result !== undefined) {
      this.chatMemberCountCache.set(key, { data: res.result, expiresAt: Date.now() + 60000 });
    }
    return res;
  }

  public async setChatPermissions(
    chatId: number | string,
    permissions: Record<string, boolean>
  ): Promise<{ ok: boolean; result?: boolean; description?: string; error_code?: number; skipped?: boolean }> {
    const key = String(chatId);
    const sortedPerms = JSON.stringify(Object.entries(permissions || {}).sort());
    const current = this.knownChatPermissions.get(key);

    if (current && current === sortedPerms) {
      this.rateLimitStats.skippedPermissionUpdates++;
      return { ok: true, result: true, skipped: true };
    }

    const res = await this.call('setChatPermissions', {
      chat_id: chatId,
      permissions
    });

    if (res.ok) {
      this.knownChatPermissions.set(key, sortedPerms);
    }
    return res;
  }
}

export const telegramApi = new TelegramApi();
