import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUser } from './types.js';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from './middleware.js';

export class ModerationService {
  private static reportCooldowns: Map<string, number> = new Map();

  /**
   * Automatic Link Protection Handler.
   * Returns true if message was intercepted and deleted.
   */
  public static async handleLinkProtection(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    if (!settings.linksProtection) return false;

    // Check if sender is an admin (including anonymous admin)
    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from?.id, message);
    if (isAdmin) return false;

    if (!message.from) return false;

    // Detect links in text, caption, or message entities
    const textToCheck = `${message.text || ''} ${message.caption || ''}`.trim();
    const hasUrlEntity = message.entities?.some((e) => e.type === 'url' || e.type === 'text_link') ||
      message.caption_entities?.some((e) => e.type === 'url' || e.type === 'text_link');

    const linkRegex = /(?:https?:\/\/|www\.|t\.me\/|telegram\.me\/|[a-zA-Z0-9-]+\.(?:com|org|net|io|me|xyz|info|app|cc|co|ru|gg|link|top|site|online|live)\b)/i;
    const hasLink = hasUrlEntity || linkRegex.test(textToCheck);

    if (!hasLink) return false;

    // Delete the forbidden message
    await telegramApi.deleteMessage(chatId, message.message_id);

    // Issue a warning to the user
    const username = message.from.username ? `@${message.from.username}` : message.from.first_name;
    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id || 0;

    const { totalWarnings } = db.addWarning({
      chatId,
      userId: message.from.id,
      userUsername: message.from.username,
      userFirstName: message.from.first_name,
      adminId: botId,
      adminUsername: meRes.result?.username || 'System',
      reason: 'Posting unwanted links'
    });

    db.addLog({
      chatId,
      chatTitle: message.chat.title,
      targetUserId: message.from.id,
      targetUsername: message.from.username,
      adminUserId: botId,
      adminUsername: 'Bot/AutoMod',
      action: 'delete_link',
      reason: 'Posting unauthorized links in group'
    });

    const warnLimit = settings.warnLimit || 3;

    if (totalWarnings >= warnLimit) {
      // Auto ban the user
      await this.executeAutoBan(chatId, message.from, message.chat.title, 'Repeated rule violations (Links Limit Reached)');
    } else {
      await telegramApi.sendMessage(
        chatId,
        `🚫 <b>Links are not allowed in this group.</b>\n\n` +
        `👤 ${username} received warning <b>${totalWarnings}/${warnLimit}</b>.`
      );
    }

    return true;
  }

  /**
   * Automatic Sticker Protection Handler.
   * Returns true if sticker was intercepted and deleted.
   */
  public static async handleStickerProtection(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;
    if (!message.sticker) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    if (!settings.stickerProtection) return false;

    // Check if sender is admin (including anonymous admin)
    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from?.id, message);
    if (isAdmin) return false;

    if (!message.from) return false;

    // Check if sender has been /free-d
    const isFree = db.isUserStickerFree(chatId, message.from.id);
    if (isFree) return false;

    // Delete the sticker
    await telegramApi.deleteMessage(chatId, message.message_id);

    const username = message.from.username ? `@${message.from.username}` : message.from.first_name;

    db.addLog({
      chatId,
      chatTitle: message.chat.title,
      targetUserId: message.from.id,
      targetUsername: message.from.username,
      action: 'delete_sticker',
      reason: 'Unauthorized sticker sent'
    });

    await telegramApi.sendMessage(
      chatId,
      `🚫 <b>Stickers are disabled for normal members in this group.</b>\n` +
      `👤 ${username}, your sticker was removed. (Admins can enable with <code>/free</code>)`
    );

    return true;
  }

  /**
   * Execute Automatic Ban when warning threshold is reached.
   */
  public static async executeAutoBan(
    chatId: number,
    user: TelegramUser,
    chatTitle?: string,
    reason: string = 'Repeated rule violations'
  ): Promise<void> {
    const banRes = await telegramApi.banChatMember(chatId, user.id);
    const username = user.username ? `@${user.username}` : user.first_name;

    if (banRes.ok) {
      // Reset/archive user's warning count after ban
      db.resetUserWarnings(chatId, user.id);

      db.addLog({
        chatId,
        chatTitle,
        targetUserId: user.id,
        targetUsername: user.username,
        action: 'auto_ban',
        reason
      });

      await telegramApi.sendMessage(
        chatId,
        `🚨 <b>Warning limit reached.</b>\n\n` +
        `👤 <b>${username}</b> has been automatically banned.\n\n` +
        `<b>Reason:</b>\n${reason}`
      );
    } else {
      await telegramApi.sendMessage(
        chatId,
        `⚠️ <b>Failed to auto-ban ${username}:</b> ${banRes.description || 'Permission issue'}`
      );
    }
  }

  /**
   * Handle user report
   */
  public static async handleReport(
    message: TelegramMessage,
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    if (!TelegramMiddleware.isGroup(message)) {
      return { success: false, message: 'Reports can only be filed inside a group.' };
    }

    if (!message.reply_to_message?.from) {
      return { success: false, message: 'Please reply to the message you wish to report using <code>/report [reason]</code>.' };
    }

    const reporter = message.from;
    const reportedUser = message.reply_to_message.from;
    const chatId = message.chat.id;
    const cooldownKey = `${chatId}_${reporter?.id}`;

    // Rate limit: 20 seconds between reports per user
    const lastReport = this.reportCooldowns.get(cooldownKey) || 0;
    if (Date.now() - lastReport < 20000) {
      return { success: false, message: '⏳ Please wait a moment before submitting another report.' };
    }
    this.reportCooldowns.set(cooldownKey, Date.now());

    const reportedUsername = reportedUser.username ? `@${reportedUser.username}` : reportedUser.first_name;
    const reporterUsername = reporter?.username ? `@${reporter.username}` : reporter?.first_name || 'Anonymous';
    const originalText = message.reply_to_message.text || message.reply_to_message.caption || '[Media content]';
    const preview = originalText.length > 120 ? originalText.slice(0, 117) + '...' : originalText;
    const reportReason = reason.trim() || 'Not specified';
    const groupName = message.chat.title || 'Telegram Group';

    db.addLog({
      chatId,
      chatTitle: groupName,
      targetUserId: reportedUser.id,
      targetUsername: reportedUser.username,
      adminUserId: reporter?.id,
      adminUsername: reporter?.username,
      action: 'report',
      reason: reportReason,
      details: `Reported message: "${preview}"`
    });

    const reportMessage =
      `🚨 <b>NEW REPORT</b>\n\n` +
      `<b>Reported user:</b>\n${reportedUsername} (ID: <code>${reportedUser.id}</code>)\n\n` +
      `<b>Reported by:</b>\n${reporterUsername}\n\n` +
      `<b>Message:</b>\n<i>"${escapeHtml(preview)}"</i>\n\n` +
      `<b>Reason:</b>\n${escapeHtml(reportReason)}\n\n` +
      `<b>Chat:</b>\n${escapeHtml(groupName)}`;

    await telegramApi.sendMessage(chatId, reportMessage, {
      reply_to_message_id: message.reply_to_message.message_id
    });

    return { success: true, message: 'Report submitted to administrators.' };
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
