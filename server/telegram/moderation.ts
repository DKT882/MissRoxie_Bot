import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUser, ChatPermissions, TempActionRecord } from './types.js';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from './middleware.js';

export const MUTED_PERMISSIONS: ChatPermissions = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false,
  can_manage_topics: false
};

export const UNMUTED_PERMISSIONS: ChatPermissions = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_invite_users: true,
  can_pin_messages: false,
  can_change_info: false,
  can_manage_topics: false
};

export function parseDuration(input: string): { seconds: number; formatted: string } | null {
  if (!input) return null;
  const regex = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|month|months|y|yr|yrs|year|years)/gi;
  let match;
  let totalSeconds = 0;
  let found = false;

  while ((match = regex.exec(input)) !== null) {
    found = true;
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (unit.startsWith('mo')) {
      totalSeconds += value * 30 * 86400;
    } else if (unit.startsWith('s')) {
      totalSeconds += value;
    } else if (unit.startsWith('m')) {
      totalSeconds += value * 60;
    } else if (unit.startsWith('h')) {
      totalSeconds += value * 3600;
    } else if (unit.startsWith('d')) {
      totalSeconds += value * 86400;
    } else if (unit.startsWith('w')) {
      totalSeconds += value * 7 * 86400;
    } else if (unit.startsWith('y')) {
      totalSeconds += value * 365 * 86400;
    }
  }

  if (!found || totalSeconds <= 0) {
    return null;
  }

  return {
    seconds: totalSeconds,
    formatted: formatDuration(totalSeconds)
  };
}

export function formatDuration(seconds: number): string {
  const parts: string[] = [];
  let rem = seconds;

  const years = Math.floor(rem / (365 * 86400));
  rem %= (365 * 86400);
  const months = Math.floor(rem / (30 * 86400));
  rem %= (30 * 86400);
  const weeks = Math.floor(rem / (7 * 86400));
  rem %= (7 * 86400);
  const days = Math.floor(rem / 86400);
  rem %= 86400;
  const hours = Math.floor(rem / 3600);
  rem %= 3600;
  const minutes = Math.floor(rem / 60);
  const secs = rem % 60;

  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (weeks > 0) parts.push(`${weeks} week${weeks === 1 ? '' : 's'}`);
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  if (secs > 0 && parts.length === 0) parts.push(`${secs} second${secs === 1 ? '' : 's'}`);

  return parts.slice(0, 2).join(' ') || `${seconds} seconds`;
}

export class ModerationService {
  private static reportCooldowns: Map<string, number> = new Map();
  private static filterNoticeCooldowns: Map<string, number> = new Map();
  private static floodTracker: Map<string, number[]> = new Map();
  private static floodActionCooldowns: Map<string, number> = new Map();

  public static clearReportCooldowns(): void {
    this.reportCooldowns.clear();
  }

  /**
   * Mute a user (permanently or temporarily)
   */
  public static async executeMute(
    chatId: number,
    userId: number,
    untilDateSec?: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return telegramApi.restrictChatMember(chatId, userId, MUTED_PERMISSIONS, {
      until_date: untilDateSec,
      use_independent_chat_permissions: true
    });
  }

  /**
   * Unmute a user (restore normal chat permissions)
   */
  public static async executeUnmute(
    chatId: number,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return telegramApi.unmuteChatMember(chatId, userId);
  }

  /**
   * Ban a user (permanently or temporarily)
   */
  public static async executeBan(
    chatId: number,
    userId: number,
    untilDateSec?: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return telegramApi.banChatMember(chatId, userId, untilDateSec ? { until_date: untilDateSec } : undefined);
  }

  /**
   * Unban a user
   */
  public static async executeUnban(
    chatId: number,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return telegramApi.unbanChatMember(chatId, userId, true);
  }

  /**
   * Kick a user (ban + unban immediately so they can rejoin via invite)
   */
  public static async executeKick(
    chatId: number,
    userId: number
  ): Promise<{ ok: boolean; description?: string; error_code?: number }> {
    return telegramApi.kickChatMember(chatId, userId);
  }

  /**
   * Sweep and process expired temporary moderation actions (tmute & tban)
   */
  public static async processExpiredTempActions(): Promise<number> {
    const expired = db.getExpiredTempActions();
    if (expired.length === 0) return 0;

    let processed = 0;
    for (const action of expired) {
      try {
        if (action.action === 'tmute') {
          await this.executeUnmute(action.chatId, action.userId);
        } else if (action.action === 'tban') {
          await this.executeUnban(action.chatId, action.userId);
        }
        db.removeTempAction(action.chatId, action.userId, action.action);
        processed++;
      } catch (err) {
        console.warn(`Failed to process expired temp action for user ${action.userId} in chat ${action.chatId}:`, err);
      }
    }
    return processed;
  }

  /**
   * Execute Configured Action when warning threshold is reached.
   * Actions: 'ban' | 'mute' | 'kick' | 'warn_only'
   */
  public static async executeWarningThresholdAction(
    chatId: number,
    user: TelegramUser,
    chatTitle?: string,
    reason: string = 'Repeated rule violations'
  ): Promise<void> {
    const settings = db.getGroupSettings(chatId, chatTitle);
    const action = settings.warnAction || 'ban';
    const username = user.username ? `@${user.username}` : user.first_name;

    if (action === 'ban') {
      const res = await telegramApi.banChatMember(chatId, user.id);
      if (res.ok) {
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
          `🚨 <b>Warning limit reached (${settings.warnLimit}/${settings.warnLimit}).</b>\n\n` +
          `👤 <b>${username}</b> has been <b>banned</b> from the group.\n\n` +
          `<b>Reason:</b>\n${reason}`
        );
      } else {
        await telegramApi.sendMessage(
          chatId,
          `⚠️ <b>Failed to auto-ban ${username}:</b> ${res.description || 'Permission issue'}`
        );
      }
    } else if (action === 'mute') {
      const res = await this.executeMute(chatId, user.id);
      if (res.ok) {
        db.resetUserWarnings(chatId, user.id);
        db.addLog({
          chatId,
          chatTitle,
          targetUserId: user.id,
          targetUsername: user.username,
          action: 'mute',
          reason: `Warning limit reached: ${reason}`
        });
        await telegramApi.sendMessage(
          chatId,
          `🚨 <b>Warning limit reached (${settings.warnLimit}/${settings.warnLimit}).</b>\n\n` +
          `👤 <b>${username}</b> has been <b>muted</b> in the group.\n\n` +
          `<b>Reason:</b>\n${reason}`
        );
      } else {
        await telegramApi.sendMessage(
          chatId,
          `⚠️ <b>Failed to auto-mute ${username}:</b> ${res.description || 'Permission issue'}`
        );
      }
    } else if (action === 'kick') {
      const res = await this.executeKick(chatId, user.id);
      if (res.ok) {
        db.resetUserWarnings(chatId, user.id);
        db.addLog({
          chatId,
          chatTitle,
          targetUserId: user.id,
          targetUsername: user.username,
          action: 'kick',
          reason: `Warning limit reached: ${reason}`
        });
        await telegramApi.sendMessage(
          chatId,
          `🚨 <b>Warning limit reached (${settings.warnLimit}/${settings.warnLimit}).</b>\n\n` +
          `👤 <b>${username}</b> has been <b>kicked</b> from the group.\n\n` +
          `<b>Reason:</b>\n${reason}`
        );
      } else {
        await telegramApi.sendMessage(
          chatId,
          `⚠️ <b>Failed to auto-kick ${username}:</b> ${res.description || 'Permission issue'}`
        );
      }
    } else {
      // warn_only
      await telegramApi.sendMessage(
        chatId,
        `⚠️ <b>Warning limit reached (${settings.warnLimit}/${settings.warnLimit}).</b>\n\n` +
        `👤 <b>${username}</b> has accumulated maximum warnings.\n\n` +
        `<i>Group warning action is set to warn_only.</i>`
      );
    }
  }

  /**
   * Backward-compatible executeAutoBan
   */
  public static async executeAutoBan(
    chatId: number,
    user: TelegramUser,
    chatTitle?: string,
    reason: string = 'Repeated rule violations'
  ): Promise<void> {
    return this.executeWarningThresholdAction(chatId, user, chatTitle, reason);
  }

  /**
   * Automatic Link Protection Handler with Whitelist support.
   * Returns true if message was intercepted and deleted.
   */
  public static async handleLinkProtection(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    const linksLocked = db.isLocked(chatId, 'links');
    if (!settings.linksProtection && !linksLocked) return false;

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

    // Check Whitelist: If URL matches an allowed domain, allow it through
    if (settings.linksWhitelist && settings.linksWhitelist.length > 0) {
      const lowerText = textToCheck.toLowerCase();
      const isWhitelisted = settings.linksWhitelist.some((domain) => {
        const d = domain.toLowerCase().trim();
        return d && lowerText.includes(d);
      });
      if (isWhitelisted) {
        return false;
      }
    }

    // Delete the forbidden message
    await telegramApi.deleteMessage(chatId, message.message_id);
    db.untrackMessages(chatId, [message.message_id]);

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
      await this.executeWarningThresholdAction(chatId, message.from, message.chat.title, 'Repeated rule violations (Links Limit Reached)');
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
   * Automatic Image, Media, Lock & Content Protection Handler.
   * Intercepts and deletes locked items, media, stickers, files, polls, forwards, contacts, locations.
   */
  public static async handleMediaAndStickerProtection(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);

    // Detect media and content types
    const hasSticker = Boolean(message.sticker);
    const hasPhoto = Boolean(message.photo && message.photo.length > 0);
    const hasAnimation = Boolean(message.animation);
    const hasVideo = Boolean(message.video || message.video_note);
    const hasVoice = Boolean(message.voice);
    const hasAudio = Boolean(message.audio);
    const hasPoll = Boolean(message.poll);
    const hasContact = Boolean(message.contact);
    const hasLocation = Boolean(message.location || message.venue);
    const hasForward = Boolean(message.forward_date || message.forward_from || message.forward_from_chat || message.forward_origin);
    const hasDocument = Boolean(message.document);

    const isImageDoc = Boolean(
      message.document &&
      (message.document.mime_type?.startsWith('image/') ||
       message.document.mime_type?.startsWith('video/') ||
       message.document.file_name?.match(/\.(jpe?g|png|webp|gif|bmp|heic|svg|mp4|mov)$/i))
    );

    const isImage = hasPhoto || (isImageDoc && message.document?.mime_type?.startsWith('image/'));
    const isGif = hasAnimation || (isImageDoc && message.document?.mime_type?.includes('gif'));
    const isVideo = hasVideo || (isImageDoc && message.document?.mime_type?.startsWith('video/'));

    // Content lock checks
    const lockStickers = db.isLocked(chatId, 'stickers') || settings.stickerProtection;
    const lockGifs = db.isLocked(chatId, 'gifs') || settings.gifsProtection;
    const lockVideos = db.isLocked(chatId, 'videos') || settings.videosProtection;
    const lockPhotos = db.isLocked(chatId, 'photos') || settings.photosProtection;
    const lockAudio = db.isLocked(chatId, 'audio') || settings.audioProtection;
    const lockVoice = db.isLocked(chatId, 'voice') || settings.voiceProtection;
    const lockDocuments = db.isLocked(chatId, 'documents');
    const lockPolls = db.isLocked(chatId, 'polls');
    const lockForwards = db.isLocked(chatId, 'forwards');
    const lockContacts = db.isLocked(chatId, 'contacts');
    const lockLocations = db.isLocked(chatId, 'locations');
    const masterMediaLocked = settings.mediaProtection;

    let violatedType: string | null = null;
    let actionType: 'delete_sticker' | 'delete_image' | 'delete_media' = 'delete_media';

    if (hasSticker && lockStickers) {
      violatedType = 'sticker';
      actionType = 'delete_sticker';
    } else if (isGif && (lockGifs || masterMediaLocked)) {
      violatedType = 'GIF';
      actionType = 'delete_media';
    } else if (isVideo && (lockVideos || masterMediaLocked)) {
      violatedType = 'video';
      actionType = 'delete_media';
    } else if (isImage && (lockPhotos || masterMediaLocked)) {
      violatedType = 'photo / image';
      actionType = 'delete_image';
    } else if (hasVoice && (lockVoice || masterMediaLocked)) {
      violatedType = 'voice note';
      actionType = 'delete_media';
    } else if (hasAudio && (lockAudio || masterMediaLocked)) {
      violatedType = 'audio track';
      actionType = 'delete_media';
    } else if (hasDocument && !isImageDoc && lockDocuments) {
      violatedType = 'document / file';
      actionType = 'delete_media';
    } else if (hasPoll && lockPolls) {
      violatedType = 'poll';
      actionType = 'delete_media';
    } else if (hasForward && lockForwards) {
      violatedType = 'forwarded message';
      actionType = 'delete_media';
    } else if (hasContact && lockContacts) {
      violatedType = 'contact card';
      actionType = 'delete_media';
    } else if (hasLocation && lockLocations) {
      violatedType = 'location share';
      actionType = 'delete_media';
    }

    if (!violatedType) {
      return false;
    }

    // Check if sender is an admin (including anonymous admin)
    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from?.id, message);
    if (isAdmin) return false;

    if (!message.from) return false;

    // Check if sender has been freed (/free) by an admin for media/stickers
    const isFree = db.isUserMediaFree(chatId, message.from.id);
    if (isFree && (hasSticker || isImage || isGif || isVideo || hasVoice || hasAudio)) {
      return false;
    }

    // Delete the unauthorized content
    await telegramApi.deleteMessage(chatId, message.message_id);
    db.untrackMessages(chatId, [message.message_id]);

    const username = message.from.username ? `@${message.from.username}` : message.from.first_name;

    db.addLog({
      chatId,
      chatTitle: message.chat.title,
      targetUserId: message.from.id,
      targetUsername: message.from.username,
      action: actionType,
      reason: `Unauthorized ${violatedType} sent by non-admin member`
    });

    await telegramApi.sendMessage(
      chatId,
      `🚫 <b>${capitalize(violatedType)}s are restricted in this group.</b>\n` +
      `👤 ${username}, your ${violatedType} was automatically removed.\n` +
      `<i>(An administrator can grant permission using <code>/free</code> or unlock with <code>/unlock</code>)</i>`
    );

    return true;
  }

  /**
   * Backward-compatible Sticker Protection Handler.
   */
  public static async handleStickerProtection(message: TelegramMessage): Promise<boolean> {
    return this.handleMediaAndStickerProtection(message);
  }

  /**
   * Custom Text Filters Engine.
   * Matches keywords/phrases configured via /filter.
   */
  public static async handleCustomFilters(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    const filters = settings.filters || {};
    const filterKeys = Object.keys(filters);
    if (filterKeys.length === 0) return false;

    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from?.id, message);
    if (isAdmin) return false;

    if (!message.from) return false;

    const textToCheck = `${message.text || ''} ${message.caption || ''}`.toLowerCase();
    if (!textToCheck.trim()) return false;

    for (const keyword of filterKeys) {
      const kwLower = keyword.toLowerCase().trim();
      if (!kwLower) continue;

      let matched = false;
      if (kwLower.includes(' ')) {
        // Multi-word phrase exact match
        matched = textToCheck.includes(kwLower);
      } else {
        // Word boundary match
        try {
          const regex = new RegExp(`\\b${escapeRegex(kwLower)}\\b`, 'i');
          matched = regex.test(textToCheck);
        } catch {
          matched = textToCheck.includes(kwLower);
        }
      }

      if (matched) {
        // Delete message
        await telegramApi.deleteMessage(chatId, message.message_id);
        db.untrackMessages(chatId, [message.message_id]);

        db.addLog({
          chatId,
          chatTitle: message.chat.title,
          targetUserId: message.from.id,
          targetUsername: message.from.username,
          action: 'filter_match',
          reason: `Triggered filter keyword: "${keyword}"`
        });

        const customReply = filters[keyword];
        const username = message.from.username ? `@${message.from.username}` : message.from.first_name;

        if (customReply && customReply.trim()) {
          const formattedReply = customReply
            .replace(/{user}/gi, username)
            .replace(/{username}/gi, message.from.username ? `@${message.from.username}` : username)
            .replace(/{id}/gi, String(message.from.id))
            .replace(/{chat}/gi, message.chat.title || 'the group');

          await telegramApi.sendMessage(chatId, formattedReply);
        } else {
          // Rate-limited default deletion notice
          const noticeKey = `${chatId}_${message.from.id}_filter`;
          const lastNotice = this.filterNoticeCooldowns.get(noticeKey) || 0;
          if (Date.now() - lastNotice > 8000) {
            this.filterNoticeCooldowns.set(noticeKey, Date.now());
            await telegramApi.sendMessage(
              chatId,
              `⚠️ <b>Filtered Word:</b> Message from ${username} was removed.`
            );
          }
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Anti-Flood Engine.
   * Tracks message frequency per user and executes configured floodAction.
   */
  public static async handleAntiFlood(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    if (!settings.floodEnabled) return false;

    const isAdmin = await TelegramMiddleware.isAdmin(chatId, message.from?.id, message);
    if (isAdmin) return false;

    if (!message.from) return false;

    const userId = message.from.id;
    const trackerKey = `${chatId}_${userId}`;
    const now = Date.now();
    const windowMs = (settings.floodWindow || 5) * 1000;
    const maxCount = settings.floodCount || 8;

    const timestamps = this.floodTracker.get(trackerKey) || [];
    const recent = timestamps.filter((t) => now - t <= windowMs);
    recent.push(now);
    this.floodTracker.set(trackerKey, recent);

    if (recent.length > maxCount) {
      // Flood triggered
      const actionKey = `${chatId}_${userId}_flood_action`;
      const lastAction = this.floodActionCooldowns.get(actionKey) || 0;
      if (now - lastAction < 15000) {
        // Already punished in cooldown window, just delete message
        await telegramApi.deleteMessage(chatId, message.message_id);
        db.untrackMessages(chatId, [message.message_id]);
        return true;
      }
      this.floodActionCooldowns.set(actionKey, now);

      await telegramApi.deleteMessage(chatId, message.message_id);
      db.untrackMessages(chatId, [message.message_id]);

      const action = settings.floodAction || 'mute';
      const username = message.from.username ? `@${message.from.username}` : message.from.first_name;

      if (action === 'mute') {
        // Mute for 5 minutes by default or permanent
        const untilDate = Math.floor(now / 1000) + 300;
        await this.executeMute(chatId, userId, untilDate);
        db.addLog({
          chatId,
          chatTitle: message.chat.title,
          targetUserId: userId,
          targetUsername: message.from.username,
          action: 'flood_action',
          reason: `Flood detected (> ${maxCount} msgs in ${settings.floodWindow}s) - Muted for 5m`
        });
        await telegramApi.sendMessage(
          chatId,
          `🌊 <b>Anti-Flood Triggered!</b>\n\n` +
          `👤 <b>${username}</b> has been <b>muted for 5 minutes</b> for spamming messages.`
        );
      } else if (action === 'kick') {
        await this.executeKick(chatId, userId);
        db.addLog({
          chatId,
          chatTitle: message.chat.title,
          targetUserId: userId,
          targetUsername: message.from.username,
          action: 'flood_action',
          reason: `Flood detected (> ${maxCount} msgs in ${settings.floodWindow}s) - Kicked`
        });
        await telegramApi.sendMessage(
          chatId,
          `🌊 <b>Anti-Flood Triggered!</b>\n\n` +
          `👤 <b>${username}</b> has been <b>kicked</b> for spamming messages.`
        );
      } else if (action === 'ban') {
        await this.executeBan(chatId, userId);
        db.addLog({
          chatId,
          chatTitle: message.chat.title,
          targetUserId: userId,
          targetUsername: message.from.username,
          action: 'flood_action',
          reason: `Flood detected (> ${maxCount} msgs in ${settings.floodWindow}s) - Banned`
        });
        await telegramApi.sendMessage(
          chatId,
          `🌊 <b>Anti-Flood Triggered!</b>\n\n` +
          `👤 <b>${username}</b> has been <b>banned</b> for spamming messages.`
        );
      } else {
        // Delete only
        db.addLog({
          chatId,
          chatTitle: message.chat.title,
          targetUserId: userId,
          targetUsername: message.from.username,
          action: 'flood_action',
          reason: `Flood detected (> ${maxCount} msgs in ${settings.floodWindow}s) - Message removed`
        });
        await telegramApi.sendMessage(
          chatId,
          `🌊 <b>Stop spamming ${username}!</b> Please slow down your messages.`
        );
      }

      return true;
    }

    return false;
  }

  /**
   * Welcome and Goodbye Message Handler.
   */
  public static async handleWelcomeAndGoodbye(message: TelegramMessage): Promise<void> {
    if (!TelegramMiddleware.isGroup(message)) return;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    const chatTitle = message.chat.title || 'the group';

    // New chat members join
    if (message.new_chat_members && message.new_chat_members.length > 0 && settings.welcomeEnabled) {
      for (const member of message.new_chat_members) {
        // Skip welcoming the bot itself
        const me = await telegramApi.getMe();
        if (member.id === me.result?.id) continue;

        const displayName = member.first_name || (member.username ? `@${member.username}` : `User ${member.id}`);
        const username = member.username ? `@${member.username}` : displayName;
        const template = settings.welcomeMessage || 'Welcome {user} to {chat}!';

        const text = template
          .replace(/{user}/gi, displayName)
          .replace(/{username}/gi, username)
          .replace(/{id}/gi, String(member.id))
          .replace(/{chat}/gi, chatTitle);

        await telegramApi.sendMessage(chatId, text);
      }
    }

    // Member left
    if (message.left_chat_member && settings.goodbyeEnabled) {
      const member = message.left_chat_member;
      const me = await telegramApi.getMe();
      if (member.id !== me.result?.id) {
        const displayName = member.first_name || (member.username ? `@${member.username}` : `User ${member.id}`);
        const username = member.username ? `@${member.username}` : displayName;
        const template = settings.goodbyeMessage || 'Goodbye {user}!';

        const text = template
          .replace(/{user}/gi, displayName)
          .replace(/{username}/gi, username)
          .replace(/{id}/gi, String(member.id))
          .replace(/{chat}/gi, chatTitle);

        await telegramApi.sendMessage(chatId, text);
      }
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
