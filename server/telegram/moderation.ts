import { telegramApi } from './api.js';
import { TelegramMessage, TelegramUser, ChatPermissions, TempActionRecord, CaptchaSession } from './types.js';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from './middleware.js';
import { ContentPolicyEngine } from './policyEngine.js';

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

export function parseDuration(input: string): { seconds: number; formatted: string } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const compoundRegex = /(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|month|months|y|yr|yrs|year|years)/gi;

  let totalSeconds = 0;
  let matchCount = 0;
  let match: RegExpExecArray | null;

  while ((match = compoundRegex.exec(trimmed)) !== null) {
    matchCount++;
    const value = parseInt(match[1], 10);
    if (isNaN(value) || value <= 0 || value > 100000) return null;

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

  if (matchCount === 0 || totalSeconds <= 0) {
    return null;
  }

  // Reject if leftover non-whitespace characters exist (e.g. "10meters", "1h-foo")
  const leftover = trimmed.replace(/(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|month|months|y|yr|yrs|year|years)/gi, '').trim();
  if (leftover.length > 0) {
    return null;
  }

  if (totalSeconds > 100 * 365 * 86400) {
    return null;
  }

  return {
    seconds: totalSeconds,
    formatted: formatDuration(totalSeconds)
  };
}

export interface ParsedModerationArgs {
  duration: { seconds: number; formatted: string } | null;
  untilDateSec?: number;
  reason?: string;
}

export function parseModerationArgs(
  args: string[],
  isTargetInArgs: boolean
): ParsedModerationArgs {
  const remaining = isTargetInArgs ? args.slice(1) : args.slice(0);
  if (!remaining || remaining.length === 0) {
    return { duration: null, reason: undefined };
  }

  const firstToken = remaining[0].trim();
  const parsedDur = parseDuration(firstToken);

  if (parsedDur) {
    const reasonText = remaining.slice(1).join(' ').trim();
    return {
      duration: parsedDur,
      untilDateSec: Math.floor(Date.now() / 1000) + parsedDur.seconds,
      reason: reasonText || undefined
    };
  } else {
    const reasonText = remaining.join(' ').trim();
    return {
      duration: null,
      reason: reasonText || undefined
    };
  }
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
  private static inFlightWelcomes: Set<string> = new Set();
  private static welcomedUsersCache: Map<string, number> = new Map();

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
    const action = settings.warnAction || 'mute';
    const username = user.username ? `@${user.username}` : user.first_name;
    const warnLimit = settings.warnLimit || 3;

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
          `🚨 <b>Warning limit reached (${warnLimit}/${warnLimit}).</b>\n\n` +
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
      const untilDateSec = Math.floor(Date.now() / 1000) + 3600; // Exactly 1 hour
      const res = await this.executeMute(chatId, user.id, untilDateSec);
      if (res.ok) {
        db.resetUserWarnings(chatId, user.id);
        db.addTempAction({
          chatId,
          chatTitle,
          userId: user.id,
          username: user.username,
          userFirstName: user.first_name,
          action: 'tmute',
          durationSeconds: 3600,
          durationFormatted: '1 hour',
          expiresAt: untilDateSec,
          reason: `Warning limit reached (${warnLimit}/${warnLimit}): 1-hour mute for ${reason}`,
          adminId: 0,
          adminUsername: 'Bot/AutoMod'
        });
        db.addLog({
          chatId,
          chatTitle,
          targetUserId: user.id,
          targetUsername: user.username,
          action: 'mute',
          reason: `Warning limit reached (${warnLimit}/${warnLimit}): 1-hour mute for ${reason}`
        });
        await telegramApi.sendMessage(
          chatId,
          `🚨 <b>Warning limit reached (${warnLimit}/${warnLimit}).</b>\n\n` +
          `👤 <b>${username}</b> has been <b>muted for 1 hour</b>.\n\n` +
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
          `🚨 <b>Warning limit reached (${warnLimit}/${warnLimit}).</b>\n\n` +
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
        `⚠️ <b>Warning limit reached (${warnLimit}/${warnLimit}).</b>\n\n` +
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
   * Automatic Link & Contact-Bait Protection Handler with Whitelist & Owner bypass support.
   * Returns true if message was intercepted and deleted.
   */
  public static async handleLinkProtection(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;
    if (!message.from) return false;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    const linksLocked = db.isLocked(chatId, 'links');

    const meRes = await telegramApi.getMe().catch(() => null);
    const botId = meRes?.result?.id || 0;

    // Detect links & contact-bait in text, caption, or message entities
    const textToCheck = `${message.text || ''}\n${message.caption || ''}`.trim();
    const allEntities = [...(message.entities || []), ...(message.caption_entities || [])];
    const hasUrlEntity = allEntities.some((e) => e.type === 'url' || e.type === 'text_link');

    // Comprehensive link regex (multi-line, bare domains with any TLD, www., https?://, ftp://, tg://, t.me/)
    const linkRegex = /(?:https?:\/\/|ftp:\/\/|tg:\/\/|www\.|t\.me\/|telegram\.me\/|telegram\.dog\/|\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:[a-zA-Z]{2,24}|co\.[a-zA-Z]{2}|com\.[a-zA-Z]{2}|org\.[a-zA-Z]{2}|net\.[a-zA-Z]{2}|edu\.[a-zA-Z]{2}|gov\.[a-zA-Z]{2})(?::\d+)?(?:\/[^\s]*)?)/i;
    const hasLink = hasUrlEntity || (textToCheck.length > 0 && linkRegex.test(textToCheck));

    if (!hasLink) {
      return false;
    }

    let isLinkViolation = false;

    // Fetch sender member info (with fresh fallback to eliminate stale cache false negatives)
    const isBot = message.from.id === botId;
    let member = await TelegramMiddleware.getTargetMember(chatId, message.from.id);
    let isOwner = member?.status === 'creator';
    let isAdmin = isOwner || member?.status === 'administrator';

    if (!isAdmin && !isOwner) {
      if (TelegramMiddleware.isAnonymousAdminMessage(message, chatId)) {
        isAdmin = true;
      } else {
        const freshMember = await TelegramMiddleware.getTargetMember(chatId, message.from.id, true);
        if (freshMember) {
          member = freshMember;
          isOwner = freshMember.status === 'creator';
          isAdmin = isOwner || freshMember.status === 'administrator';
        }
      }
    }

    if (hasLink && (settings.linksProtection || linksLocked)) {
      // LINK PERMISSIONS: Group Owner and Roxie/Bot ONLY (Regular admins/mods do NOT bypass link protection).
      let isWhitelisted = false;
      if (settings.linksWhitelist && settings.linksWhitelist.length > 0) {
        const lowerText = textToCheck.toLowerCase();
        isWhitelisted = settings.linksWhitelist.some((domain) => {
          const d = domain.toLowerCase().trim();
          return d && lowerText.includes(d);
        });
      }

      if (!isBot && !isOwner && !isWhitelisted) {
        isLinkViolation = true;
      }
    }

    if (!isLinkViolation) {
      return false;
    }

    // Delete the forbidden message
    await telegramApi.deleteMessage(chatId, message.message_id).catch(() => {});
    db.untrackMessages(chatId, [message.message_id]);

    const username = message.from.username ? `@${message.from.username}` : (message.from.first_name || `User ${message.from.id}`);
    const reason = 'Posting unauthorized links';

    db.addLog({
      chatId,
      chatTitle: message.chat.title,
      targetUserId: message.from.id,
      targetUsername: message.from.username,
      adminUserId: botId,
      adminUsername: 'Bot/AutoMod',
      action: 'delete_link',
      reason: `${reason} in group`
    });

    // Requirement 1: Immediate Permanent Mute (no until_date / expiration)
    const muteRes = await this.executeMute(chatId, message.from.id);

    if (muteRes.ok) {
      db.addLog({
        chatId,
        chatTitle: message.chat.title,
        targetUserId: message.from.id,
        targetUsername: message.from.username,
        adminUserId: botId,
        adminUsername: 'Bot/AutoMod',
        action: 'mute',
        reason: `${reason} (permanent mute)`
      });

      const sentNotice = await telegramApi.sendMessage(
        chatId,
        `🚫 <b>Links are not allowed in this group.</b>\n\n` +
        `👤 <b>${username}</b> has been <b>permanently muted</b> for posting unauthorized links.`
      ).catch(() => null);
      if (sentNotice?.ok && sentNotice.result?.message_id) {
        const noticeId = sentNotice.result.message_id;
        setTimeout(() => {
          telegramApi.deleteMessage(chatId, noticeId).catch(() => {});
          db.untrackMessages(chatId, [noticeId]);
        }, 10000);
      }
    } else {
      const sentErr = await telegramApi.sendMessage(
        chatId,
        `⚠️ <b>Failed to mute ${username}:</b> ${muteRes.description || 'Permission issue'}`
      ).catch(() => null);
      if (sentErr?.ok && sentErr.result?.message_id) {
        const errId = sentErr.result.message_id;
        setTimeout(() => {
          telegramApi.deleteMessage(chatId, errId).catch(() => {});
          db.untrackMessages(chatId, [errId]);
        }, 10000);
      }
    }

    return true;
  }

  /**
   * Unified Content Policy & Locks Interceptor.
   * Leverages ContentPolicyEngine for exhaustive lock evaluation.
   */
  public static async handleContentPolicy(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;
    if (!message.from) return false;

    const chatId = message.chat.id;
    const userId = message.from.id;

    const evalResult = await ContentPolicyEngine.evaluateMessage(message, chatId, userId);
    if (evalResult.decision === 'BLOCK') {
      // Delete message
      await telegramApi.deleteMessage(chatId, message.message_id);
      db.untrackMessages(chatId, [message.message_id]);

      const username = message.from.username ? `@${message.from.username}` : message.from.first_name;
      const lockType = evalResult.lockType || 'content';

      db.addLog({
        chatId,
        chatTitle: message.chat.title,
        targetUserId: userId,
        targetUsername: message.from.username,
        action: 'delete_media',
        reason: evalResult.reason || `Blocked ${lockType} due to active lock`
      });

      return true;
    }

    return false;
  }

  /**
   * Automatic Image, Media, Lock & Content Protection Handler.
   * Intercepts and deletes locked items, media, stickers, files, polls, forwards, contacts, locations.
   */
  public static async handleMediaAndStickerProtection(message: TelegramMessage): Promise<boolean> {
    return this.handleContentPolicy(message);
  }

  /**
   * Backward-compatible Sticker Protection Handler.
   */
  public static async handleStickerProtection(message: TelegramMessage): Promise<boolean> {
    return this.handleContentPolicy(message);
  }

  /**
   * Anti-Raid Join Handler.
   * Checks join frequency against configured threshold and takes defensive action.
   */
  public static async handleAntiRaid(
    chatId: number,
    newMembers: TelegramUser[],
    chatTitle?: string
  ): Promise<boolean> {
    const settings = db.getGroupSettings(chatId, chatTitle);
    if (!settings.raidEnabled) return false;

    let raidTriggered = false;
    for (const member of newMembers) {
      const { isRaid } = db.trackJoinAndCheckRaid(chatId);
      if (isRaid) {
        raidTriggered = true;
        const action = settings.raidAction || 'kick';
        try {
          if (action === 'kick') {
            await this.executeKick(chatId, member.id);
          } else if (action === 'ban') {
            await this.executeBan(chatId, member.id);
          } else if (action === 'mute' || action === 'restrict') {
            const untilDate = Math.floor(Date.now() / 1000) + (settings.raidDuration || 300);
            await this.executeMute(chatId, member.id, untilDate);
          }

          db.addLog({
            chatId,
            chatTitle,
            targetUserId: member.id,
            targetUsername: member.username,
            action: 'kick',
            reason: `Anti-raid trigger (${action})`
          });
        } catch (err) {
          console.warn(`Anti-raid action failed for user ${member.id}:`, err);
        }
      }
    }

    if (raidTriggered) {
      const noticeKey = `${chatId}_raid_alert`;
      const lastNotice = this.filterNoticeCooldowns.get(noticeKey) || 0;
      if (Date.now() - lastNotice > 30000) {
        this.filterNoticeCooldowns.set(noticeKey, Date.now());
        await telegramApi.sendMessage(
          chatId,
          `🚨 <b>ANTI-RAID MODE ACTIVATED</b>\n\n` +
          `⚠️ High join velocity detected! Incoming joins are automatically <b>${settings.raidAction || 'kicked'}</b> for the next ${Math.round((settings.raidDuration || 300) / 60)} minutes.`
        );
      }
      return true;
    }

    return false;
  }

  /**
   * CAPTCHA / Join Verification Handler.
   * Restricts new joiners and issues an interactive challenge button.
   */
  public static async handleCaptchaOnJoin(
    chatId: number,
    member: TelegramUser,
    chatTitle?: string
  ): Promise<boolean> {
    const settings = db.getGroupSettings(chatId, chatTitle);
    if (!settings.captchaEnabled) return false;

    // Check if user is already approved or admin
    if (db.isUserApproved(chatId, member.id)) return false;

    // Restrict member from speaking until captcha is solved
    await this.executeMute(chatId, member.id);

    const mode = settings.captchaMode || 'button';
    let question = 'Please click the button below within 2 minutes to prove you are human:';
    let correctAnswer = 'pass';
    let buttons: Array<Array<{ text: string; callback_data: string }>> = [];

    const timeout = settings.captchaTimeout || 120;
    const session = db.createCaptchaSession(chatId, member.id, question, correctAnswer, timeout);

    if (mode === 'math') {
      const a = Math.floor(Math.random() * 8) + 1;
      const b = Math.floor(Math.random() * 8) + 1;
      const sum = a + b;
      correctAnswer = String(sum);
      question = `Solve this math problem: <b>${a} + ${b} = ?</b>`;
      session.question = question;
      session.correctAnswer = correctAnswer;

      const options = [sum, sum + 1, Math.max(1, sum - 1), sum + 2].sort(() => Math.random() - 0.5);
      buttons = [
        options.map((opt) => ({
          text: String(opt),
          callback_data: `c_ans:${session.token}:${opt}`
        }))
      ];
    } else {
      buttons = [
        [
          {
            text: '✅ I am Human (Click to Verify)',
            callback_data: `c_btn:${session.token}`
          }
        ]
      ];
    }

    const username = member.username ? `@${member.username}` : member.first_name;
    const challengeText =
      `🛡️ <b>Join Verification Required</b>\n\n` +
      `Welcome ${username}!\n` +
      `${question}\n\n` +
      `<i>⏱️ You have ${timeout} seconds to verify.</i>`;

    const msgRes = await telegramApi.sendMessage(chatId, challengeText, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });

    if (msgRes.ok && msgRes.result) {
      db.setCaptchaMessageId(session.id, msgRes.result.message_id);
    }

    return true;
  }

  /**
   * Process CAPTCHA Callback Query.
   */
  public static async handleCaptchaCallback(callbackQuery: any): Promise<boolean> {
    const data = callbackQuery.data || '';
    if (!data.startsWith('c_btn:') && !data.startsWith('c_ans:')) {
      return false;
    }

    const parts = data.split(':');
    const token = parts[1];
    const answer = parts[2]; // for math mode

    const session = db.getCaptchaSessionByToken(token);
    if (!session) {
      await telegramApi.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ This verification challenge has expired.',
        show_alert: true
      });
      return true;
    }

    // Verify actor is the targeted joiner
    if (callbackQuery.from.id !== session.userId) {
      await telegramApi.answerCallbackQuery(callbackQuery.id, {
        text: '⚠️ This verification challenge is only for the joining user.',
        show_alert: true
      });
      return true;
    }

    // Check answer in math mode
    if (data.startsWith('c_ans:')) {
      if (answer !== session.correctAnswer) {
        await telegramApi.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Incorrect answer! Try again before time runs out.',
          show_alert: true
        });
        return true;
      }
    }

    // Challenge passed! Restore permissions
    await this.executeUnmute(session.chatId, session.userId);
    db.removeCaptchaSession(session.chatId, session.userId);

    // Delete verification prompt
    if (session.messageId) {
      await telegramApi.deleteMessage(session.chatId, session.messageId).catch(() => {});
    }

    await telegramApi.answerCallbackQuery(callbackQuery.id, {
      text: '✅ Verified successfully! You can now chat.'
    });

    // Send welcome message if enabled (deferred until verification)
    await this.sendWelcome(session.chatId, callbackQuery.from);

    return true;
  }

  /**
   * Periodically sweep expired CAPTCHA sessions.
   */
  public static async processExpiredCaptchaSessions(): Promise<number> {
    const expired = db.getExpiredCaptchaSessions();
    if (expired.length === 0) return 0;

    let processed = 0;
    for (const session of expired) {
      try {
        const settings = db.getGroupSettings(session.chatId);
        const action = settings.captchaAction || 'kick';

        if (action === 'kick') {
          await this.executeKick(session.chatId, session.userId);
        } else if (action === 'ban') {
          await this.executeBan(session.chatId, session.userId);
        }

        if (session.messageId) {
          await telegramApi.deleteMessage(session.chatId, session.messageId).catch(() => {});
        }

        db.removeCaptchaSession(session.chatId, session.userId);
        processed++;
      } catch (err) {
        console.warn(`Failed to process expired captcha for user ${session.userId}:`, err);
      }
    }
    return processed;
  }

  /**
   * Handle hashtag note shortcuts (#notename).
   */
  public static async handleNotesShortcut(message: TelegramMessage): Promise<boolean> {
    if (!TelegramMiddleware.isGroup(message)) return false;
    const text = message.text || '';
    if (!text.startsWith('#')) return false;

    const notename = text.slice(1).split(/\s+/)[0].toLowerCase().trim();
    if (!notename) return false;

    const note = db.getNote(message.chat.id, notename);
    if (!note) return false;

    const formattedContent = note.content
      .replace(/{user}/gi, message.from?.first_name || 'User')
      .replace(/{chat}/gi, message.chat.title || 'Chat');

    await telegramApi.sendMessage(message.chat.id, formattedContent, {
      reply_to_message_id: message.message_id
    });
    return true;
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
   * Send Welcome Greeting to a specific member with deduplication and placeholder formatting.
   */
  public static async sendWelcome(
    chatId: number,
    member: TelegramUser,
    chatTitle?: string
  ): Promise<boolean> {
    if (!chatId || !member) return false;

    const settings = db.getGroupSettings(chatId, chatTitle);
    if (!settings.welcomeEnabled) return false;

    // Skip welcoming the bot itself
    if (member.is_bot) {
      const me = await telegramApi.getMe().catch(() => null);
      if (member.id === me?.result?.id) return false;
    }

    const cacheKey = `${chatId}:${member.id}`;
    if (ModerationService.inFlightWelcomes.has(cacheKey)) {
      return false; // deduplicate concurrent in-flight welcome requests for same user
    }

    const now = Date.now();
    const lastWelcomed = ModerationService.welcomedUsersCache.get(cacheKey) || 0;
    if (now - lastWelcomed < 15000) {
      return false; // deduplicate within 15 seconds
    }
    ModerationService.inFlightWelcomes.add(cacheKey);
    ModerationService.welcomedUsersCache.set(cacheKey, now);

    try {
      const title = chatTitle || settings.chatTitle || 'the group';
      const firstName = member.first_name || 'Member';
      const lastName = member.last_name || '';
      const displayName = member.first_name || (member.username ? `@${member.username}` : `User ${member.id}`);
      const username = member.username ? `@${member.username}` : displayName;
      const mention = `<a href="tg://user?id=${member.id}">${escapeHtml(displayName)}</a>`;
      const template = settings.welcomeMessage || 'Welcome {user} to {chat}!';

      const text = template
        .replace(/{first_name}/gi, firstName)
        .replace(/{last_name}/gi, lastName)
        .replace(/{user}/gi, displayName)
        .replace(/{name}/gi, displayName)
        .replace(/{username}/gi, username)
        .replace(/{mention}/gi, mention)
        .replace(/{chat_title}/gi, title)
        .replace(/{chat}/gi, title)
        .replace(/{id}/gi, String(member.id));

      const sendRes = await telegramApi.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => null);
      if (sendRes?.ok && sendRes.result?.message_id) {
        const sentMsgId = sendRes.result.message_id;
        setTimeout(() => {
          telegramApi.deleteMessage(chatId, sentMsgId).catch(() => {});
          db.untrackMessages(chatId, [sentMsgId]);
        }, 10000); // exactly 10,000ms auto-delete
      }
      return true;
    } finally {
      ModerationService.inFlightWelcomes.delete(cacheKey);
    }
  }

  /**
   * Send Goodbye Farewell when a member leaves with deduplication and placeholder formatting.
   */
  public static async sendGoodbye(
    chatId: number,
    member: TelegramUser,
    chatTitle?: string
  ): Promise<boolean> {
    if (!chatId || !member) return false;

    const settings = db.getGroupSettings(chatId, chatTitle);
    if (!settings.goodbyeEnabled) return false;

    // Skip goodbye for the bot itself
    if (member.is_bot) {
      const me = await telegramApi.getMe().catch(() => null);
      if (member.id === me?.result?.id) return false;
    }

    const title = chatTitle || settings.chatTitle || 'the group';
    const firstName = member.first_name || 'Member';
    const lastName = member.last_name || '';
    const displayName = member.first_name || (member.username ? `@${member.username}` : `User ${member.id}`);
    const username = member.username ? `@${member.username}` : displayName;
    const mention = `<a href="tg://user?id=${member.id}">${escapeHtml(displayName)}</a>`;
    const template = settings.goodbyeMessage || 'Goodbye {user}!';

    const text = template
      .replace(/{first_name}/gi, firstName)
      .replace(/{last_name}/gi, lastName)
      .replace(/{user}/gi, displayName)
      .replace(/{name}/gi, displayName)
      .replace(/{username}/gi, username)
      .replace(/{mention}/gi, mention)
      .replace(/{chat_title}/gi, title)
      .replace(/{chat}/gi, title)
      .replace(/{id}/gi, String(member.id));

    const sendRes = await telegramApi.sendMessage(chatId, text, { parse_mode: 'HTML' }).catch(() => null);
    if (sendRes?.ok && sendRes.result?.message_id) {
      const sentMsgId = sendRes.result.message_id;
      setTimeout(() => {
        telegramApi.deleteMessage(chatId, sentMsgId).catch(() => {});
        db.untrackMessages(chatId, [sentMsgId]);
      }, 10000); // exactly 10,000ms auto-delete
    }
    return true;
  }

  /**
   * Welcome and Goodbye Message Handler.
   */
  public static async handleWelcomeAndGoodbye(message: TelegramMessage): Promise<void> {
    if (!TelegramMiddleware.isGroup(message)) return;

    const chatId = message.chat.id;
    const settings = db.getGroupSettings(chatId, message.chat.title);
    const chatTitle = message.chat.title || 'the group';

    // Check if autoDeleteJoinLeave is enabled and this message is a join or leave system service message
    if (settings.autoDeleteJoinLeave) {
      if ((message.new_chat_members && message.new_chat_members.length > 0) || message.left_chat_member) {
        setTimeout(() => {
          telegramApi.deleteMessage(chatId, message.message_id).catch(() => {});
        }, 3500); // delete after 3.5 seconds
      }
    }

    // New chat members join (if CAPTCHA is enabled, welcome is deferred until CAPTCHA verification)
    if (message.new_chat_members && message.new_chat_members.length > 0 && !settings.captchaEnabled) {
      for (const member of message.new_chat_members) {
        await this.sendWelcome(chatId, member, chatTitle);
      }
    }

    // Member left
    if (message.left_chat_member) {
      await this.sendGoodbye(chatId, message.left_chat_member, chatTitle);
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
