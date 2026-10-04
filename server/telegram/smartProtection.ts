import { telegramApi } from './api.js';
import { TelegramMessage } from './types.js';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from './middleware.js';
import { ModerationService } from './moderation.js';

export class SmartProtectionService {
  private static floodTracker: Map<string, number[]> = new Map();
  private static duplicateTracker: Map<string, Array<{ text: string; timestamp: number }>> = new Map();
  private static linkBurstTracker: Map<string, number[]> = new Map();
  private static actionCooldowns: Map<string, number> = new Map();

  public static reset(): void {
    this.floodTracker.clear();
    this.duplicateTracker.clear();
    this.linkBurstTracker.clear();
    this.actionCooldowns.clear();
  }

  public static async handleMessage(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;
    if (!message.from) return false;

    // 1. Chatbot & Bot & Scheduled & Admin Compatibility Safeguards
    if (message.from.is_bot) return false;

    const textOrCaption = message.text || message.caption || '';
    const trimmed = textOrCaption.trim();
    if (trimmed.startsWith('/') || trimmed.startsWith('!')) return false;

    // Check if scheduled message or bot metadata
    if ((message as any).isScheduled || (message as any).isBotReply) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    if (settings.protectionEnabled === false) return false;

    // 2. Admin / Owner / Moderator / Approved User Exemption
    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from.id, message);
    if (isAdmin) return false;

    const userId = message.from.id;
    if (db.hasContentPermission(chatId, userId, 'all') || db.hasContentPermission(chatId, userId, 'links')) {
      return false;
    }

    const now = Date.now();

    // 3. Smart Flood Detection
    const floodWindow = (settings.protectionFloodWindow || 5) * 1000;
    const floodCount = settings.protectionFloodCount || 5;
    const floodKey = `flood_${chatId}_${userId}`;
    const floodTimestamps = this.floodTracker.get(floodKey) || [];
    const recentFlood = floodTimestamps.filter((t) => now - t <= floodWindow);
    recentFlood.push(now);
    this.floodTracker.set(floodKey, recentFlood);

    if (recentFlood.length >= floodCount) {
      const triggered = await this.triggerProtection(message, 'flood', `Rapid message frequency (${recentFlood.length} msgs in ${settings.protectionFloodWindow || 5}s)`);
      if (triggered) return true;
    }

    // 4. Duplicate Message Detection
    if (trimmed.length >= 3) {
      const dupLimit = settings.protectionDuplicateLimit || 3;
      const dupKey = `dup_${chatId}_${userId}`;
      const dupHistory = this.duplicateTracker.get(dupKey) || [];
      const recentDup = dupHistory.filter((item) => now - item.timestamp <= 30000);
      recentDup.push({ text: trimmed.toLowerCase(), timestamp: now });
      this.duplicateTracker.set(dupKey, recentDup);

      const sameCount = recentDup.filter((item) => item.text === trimmed.toLowerCase()).length;
      if (sameCount >= dupLimit) {
        const triggered = await this.triggerProtection(message, 'duplicate', `Repeated duplicate messages (${sameCount} identical messages within 30s)`);
        if (triggered) return true;
      }
    }

    // 5. Link / Spam Burst Detection
    const linkRegex = /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|[a-zA-Z0-9-]+\.(?:com|org|net|io|me|xyz|info|app|cc|co|ru|gg|link|top|site|online|live)\b)/i;
    const hasUrlEntity = message.entities?.some((e) => e.type === 'url' || e.type === 'text_link') ||
      message.caption_entities?.some((e) => e.type === 'url' || e.type === 'text_link');
    const hasLink = hasUrlEntity || linkRegex.test(textOrCaption);

    if (hasLink) {
      const linkBurstLimit = settings.protectionLinkBurstLimit || 3;
      const burstKey = `link_${chatId}_${userId}`;
      const linkTimestamps = this.linkBurstTracker.get(burstKey) || [];
      const recentLinks = linkTimestamps.filter((t) => now - t <= 15000);
      recentLinks.push(now);
      this.linkBurstTracker.set(burstKey, recentLinks);

      if (recentLinks.length >= linkBurstLimit) {
        const triggered = await this.triggerProtection(message, 'link_burst', `Suspicious burst of links/promotional messages (${recentLinks.length} links in 15s)`);
        if (triggered) return true;
      }
    }

    return false;
  }

  private static async triggerProtection(
    message: TelegramMessage,
    detectionType: 'flood' | 'duplicate' | 'link_burst',
    reason: string
  ): Promise<boolean> {
    const chatId = message.chat.id;
    if (!message.from) return false;
    const userId = message.from.id;
    const now = Date.now();

    // 1. Delete message
    await telegramApi.deleteMessage(chatId, message.message_id).catch(() => {});
    db.untrackMessages(chatId, [message.message_id]);

    // 2. Issue warning and handle escalation
    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id || 0;
    const username = message.from.username ? `@${message.from.username}` : message.from.first_name;

    const { totalWarnings } = db.addWarning({
      chatId,
      userId,
      userUsername: message.from.username,
      userFirstName: message.from.first_name,
      adminId: botId,
      adminUsername: meRes.result?.username || 'RoxieProtection',
      reason: `Smart Protection: ${detectionType} - ${reason}`
    });

    const settings = db.getGroupSettings(chatId, message.chat.title);
    const warnLimit = settings.warnLimit || 3;

    let actionTaken = 'warn';
    const notifKey = `notif_${chatId}_${userId}_${detectionType}`;
    const lastNotif = this.actionCooldowns.get(notifKey) || 0;
    const shouldNotify = now - lastNotif >= 10000;
    if (shouldNotify) {
      this.actionCooldowns.set(notifKey, now);
    }

    if (totalWarnings >= warnLimit) {
      actionTaken = settings.warnAction || 'mute';
      await ModerationService.executeWarningThresholdAction(
        chatId,
        message.from,
        message.chat.title,
        `Smart Protection threshold reached (${detectionType}: ${reason})`
      );
    } else {
      actionTaken = 'warn';
      if (shouldNotify) {
        await telegramApi.sendMessage(
          chatId,
          `🛡️ <b>Smart User Protection Warning</b>\n\n` +
          `👤 <b>${username}</b> received warning <b>${totalWarnings}/${warnLimit}</b>.\n` +
          `<b>Violation:</b> <code>${detectionType}</code>`
        );
      }
    }

    // 3. Log automatic action recording chatId, userId, detection type, action, timestamp, reason
    db.addLog({
      chatId,
      chatTitle: message.chat.title,
      targetUserId: userId,
      targetUsername: message.from.username,
      adminUserId: botId,
      adminUsername: 'RoxieSmartProtection',
      action: totalWarnings >= warnLimit ? (actionTaken === 'ban' ? 'auto_ban' : 'mute') : 'warn',
      result: 'success',
      reason: `Smart protection detection type [${detectionType}] triggered action [${actionTaken}]: ${reason}`
    });

    return true;
  }
}
