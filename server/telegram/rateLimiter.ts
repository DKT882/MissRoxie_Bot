import { TelegramMessage } from './types.js';
import { TelegramMiddleware, RoleRank } from './middleware.js';
import { telegramApi } from './api.js';

export interface RateLimitConfig {
  windowMs: number;
  maxMessages: number;
  cooldownMs: number;
}

export class RateLimiterService {
  private static userTimestamps: Map<string, number[]> = new Map(); // `${chatId}_${userId}` -> timestamps
  private static cooldowns: Map<string, number> = new Map(); // `${chatId}_${userId}` -> expiry timestamp
  private static notifiedCooldowns: Map<string, number> = new Map(); // `${chatId}_${userId}` -> last notification timestamp

  private static config: RateLimitConfig = {
    windowMs: 10_000,    // 10 seconds
    maxMessages: 25,     // 25 messages per 10s window
    cooldownMs: 15_000   // 15 seconds temporary cooldown after violation
  };

  public static setConfig(config: Partial<RateLimitConfig>) {
    this.config = { ...this.config, ...config };
  }

  public static getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  public static async checkAndRecord(
    message: TelegramMessage,
    chatId: number,
    userId: number
  ): Promise<{ allowed: boolean; reason?: string; action?: 'ignore' | 'delete' }> {
    if (!chatId || !userId || userId === 0) {
      return { allowed: true };
    }

    // 1. Check admin / owner / anonymous admin exemption using existing middleware actor resolution
    const ctx = {
      message,
      chatId,
      chatTitle: message.chat?.title || 'Chat',
      sender: message.from || { id: userId, is_bot: false, first_name: 'User' },
      isAnonymousAdmin: Boolean(message.sender_chat && message.sender_chat.id === chatId),
      adminDisplayName: message.from?.first_name || 'User',
      args: [],
      command: ''
    };

    try {
      const actor = await TelegramMiddleware.resolveActor(ctx);
      if (actor.actorRank >= RoleRank.MODERATOR) {
        return { allowed: true }; // Admins and owners are exempt from rate limiting
      }
    } catch {
      // If actor resolution fails transiently, default to allowing or fallback safely
    }

    const key = `${chatId}_${userId}`;
    const now = Date.now();

    // Clean stale entries periodically during checks
    this.cleanupStaleEntries();

    // 2. Check if user is currently in rate-limit cooldown
    const cooldownExpiry = this.cooldowns.get(key) || 0;
    if (now < cooldownExpiry) {
      if (message.message_id) {
        try {
          await telegramApi.deleteMessage(chatId, message.message_id);
        } catch {
          // Ignore deletion failures (bot might lack delete permissions)
        }
      }

      // Avoid notification spam: send at most one notification per cooldown period
      const lastNotified = this.notifiedCooldowns.get(key) || 0;
      if (now - lastNotified > 10_000) {
        this.notifiedCooldowns.set(key, now);
        try {
          const name = message.from?.username ? `@${message.from.username}` : (message.from?.first_name || 'User');
          await telegramApi.sendMessage(
            chatId,
            `⚠️ <b>Rate limit exceeded.</b> Please slow down, <code>${name}</code>.`,
            { reply_to_message_id: message.message_id }
          );
        } catch {
          // Ignore messaging failures
        }
      }

      return { allowed: false, reason: 'Rate limit cooldown active', action: 'delete' };
    }

    // 3. Sliding window message tracking
    let timestamps = this.userTimestamps.get(key) || [];
    timestamps = timestamps.filter(t => now - t < this.config.windowMs);
    timestamps.push(now);
    this.userTimestamps.set(key, timestamps);

    if (timestamps.length > this.config.maxMessages) {
      this.cooldowns.set(key, now + this.config.cooldownMs);
      this.userTimestamps.set(key, []); // reset tracker

      if (message.message_id) {
        try {
          await telegramApi.deleteMessage(chatId, message.message_id);
        } catch {
          // Ignore
        }
      }

      this.notifiedCooldowns.set(key, now);
      try {
        await telegramApi.sendMessage(
          chatId,
          `⚠️ <b>Rate limit exceeded.</b> Too many messages too quickly. Please wait a moment.`,
          { reply_to_message_id: message.message_id }
        );
      } catch {
        // Ignore
      }

      return { allowed: false, reason: 'Max messages exceeded in time window', action: 'delete' };
    }

    return { allowed: true };
  }

  public static cleanupStaleEntries() {
    const now = Date.now();
    for (const [key, timestamps] of this.userTimestamps.entries()) {
      const active = timestamps.filter(t => now - t < this.config.windowMs);
      if (active.length === 0) {
        this.userTimestamps.delete(key);
      } else {
        this.userTimestamps.set(key, active);
      }
    }

    for (const [key, expiry] of this.cooldowns.entries()) {
      if (now >= expiry) {
        this.cooldowns.delete(key);
      }
    }

    for (const [key, lastNotified] of this.notifiedCooldowns.entries()) {
      if (now - lastNotified > 30_000) {
        this.notifiedCooldowns.delete(key);
      }
    }
  }

  public static reset(chatId?: number, userId?: number) {
    if (chatId !== undefined && userId !== undefined) {
      const key = `${chatId}_${userId}`;
      this.userTimestamps.delete(key);
      this.cooldowns.delete(key);
      this.notifiedCooldowns.delete(key);
    } else {
      this.userTimestamps.clear();
      this.cooldowns.clear();
      this.notifiedCooldowns.clear();
    }
  }
}
