import { db } from '../db/storage.js';
import { telegramApi } from './api.js';
import { ScheduledMessage, ScheduledPostButton, TelegramMessage } from './types.js';
import { PostSender } from './postSender.js';
import { ModerationService } from './moderation.js';
import { TelegramMiddleware } from './middleware.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';

export type DeletionClassification = 'SUCCESS' | 'ALREADY_ABSENT' | 'PERMANENT_FAILURE' | 'TRANSIENT_FAILURE';

export function isValidHttpUrl(stringUrl?: string): boolean {
  if (!stringUrl || typeof stringUrl !== 'string') return false;
  try {
    const parsed = new URL(stringUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const MENTION_EMOJIS = Object.freeze([
  '👤', '😂', '🔥', '😎', '💀', '✨', '⚡', '🎉', '🌟', '🚀',
  '🥳', '💫', '🦁', '👑', '💎', '🎯', '🍀', '🌈', '🍕', '🐱',
  '🐼', '🦊', '🦋', '🎈', '❤️', '🤩', '🤙', '💯', '🌸', '🪄'
]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Predictable, case-insensitive keyword or phrase matching.
 * - Leading/trailing whitespace trimmed
 * - Phrase matched in normalized message text
 * - Prevents partial-word accidental matches via Unicode-aware boundaries (?<![\p{L}\p{N}]) and (?![\p{L}\p{N}])
 */
/**
 * Splits a comma-separated trigger keyword/phrase string into distinct, trimmed, non-empty phrases.
 * Handles repeated commas, leading/trailing commas, and surrounding whitespace.
 */
export function parseTriggerPhrases(trigger?: string | null): string[] {
  if (!trigger || typeof trigger !== 'string') return [];
  return trigger
    .split(',')
    .map(p => p.trim())
    .filter(p => p.length > 0);
}

/**
 * Standardizes a comma-separated trigger string: trims phrases, drops empty entries,
 * and joins with standard comma-space (', ').
 */
export function normalizeTriggerKeyword(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const phrases = parseTriggerPhrases(raw);
  if (phrases.length === 0) return undefined;
  return phrases.join(', ');
}

/**
 * Tests whether a single phrase matches within the text with Unicode-aware whole-word/phrase boundaries.
 */
export function matchesSinglePhrase(text: string, phrase: string): boolean {
  if (!text || !phrase) return false;
  const trimmedText = text.trim();
  const trimmedPhrase = phrase.trim();
  if (!trimmedText || !trimmedPhrase) return false;

  const triggerWords = trimmedPhrase.split(/\s+/).filter(Boolean);
  if (triggerWords.length === 0) return false;

  const escapedWords = triggerWords.map(w => w.replace(/[\^$*+?.()|[\]{}\\]/g, '\\$&'));
  const pattern = escapedWords.join('\\s+');

  try {
    const regex = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, 'iu');
    return regex.test(trimmedText);
  } catch {
    return false;
  }
}

/**
 * Finds the longest matching trigger phrase from a configured (potentially comma-separated) trigger string.
 * Returns null if no phrases match.
 */
export function getLongestMatchingPhrase(text?: string | null, trigger?: string | null): string | null {
  if (!text || !trigger) return null;
  const phrases = parseTriggerPhrases(trigger);
  if (phrases.length === 0) return null;

  let longestMatch: string | null = null;
  for (const phrase of phrases) {
    if (matchesSinglePhrase(text, phrase)) {
      if (!longestMatch || phrase.length > longestMatch.length) {
        longestMatch = phrase;
      }
    }
  }
  return longestMatch;
}

/**
 * Tests whether an incoming message text or caption matches a configured schedule trigger.
 * Supports single phrases or multiple comma-separated phrases (e.g. "hii, good morning, rules, help me").
 * Any matching phrase triggers the schedule.
 */
export function matchesTrigger(text?: string | null, trigger?: string | null): boolean {
  return getLongestMatchingPhrase(text, trigger) !== null;
}

/**
 * Deterministically finds the single best matching scheduled message for an incoming text or caption.
 * Selection priority:
 * 1. Longest matched trigger phrase length first (more specific trigger wins)
 * 2. Earliest createdAt timestamp (oldest configured schedule wins)
 * 3. Alphabetical schedule id as tie-breaker
 */
export function findMatchingSchedule(
  schedules: ScheduledMessage[],
  textOrCaption: string
): ScheduledMessage | null {
  if (!textOrCaption || !textOrCaption.trim() || !Array.isArray(schedules) || schedules.length === 0) {
    return null;
  }

  const eligible = schedules.filter(
    s => s && s.enabled !== false && typeof s.triggerKeyword === 'string' && s.triggerKeyword.trim().length > 0
  );

  if (eligible.length === 0) {
    return null;
  }

  const matches: Array<{ schedule: ScheduledMessage; matchedPhrase: string }> = [];

  for (const s of eligible) {
    const matchedPhrase = getLongestMatchingPhrase(textOrCaption, s.triggerKeyword!);
    if (matchedPhrase) {
      matches.push({ schedule: s, matchedPhrase });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length === 1) {
    return matches[0].schedule;
  }

  matches.sort((a, b) => {
    // 1. Longest matched trigger phrase length wins
    const lenA = a.matchedPhrase.length;
    const lenB = b.matchedPhrase.length;
    if (lenB !== lenA) {
      return lenB - lenA;
    }
    // 2. Earliest createdAt timestamp wins
    const createdA = new Date(a.schedule.createdAt || 0).getTime();
    const createdB = new Date(b.schedule.createdAt || 0).getTime();
    if (createdA !== createdB) {
      return createdA - createdB;
    }
    // 3. Alphabetical id tie-breaker
    return a.schedule.id.localeCompare(b.schedule.id);
  });

  return matches[0].schedule;
}

export interface ScheduleExportCode {
  command: string;
  jsonConfig: Record<string, any>;
  summary: string;
}

export function generateScheduleExportCode(s: any): ScheduleExportCode {
  let interval = s.intervalFormatted || s.intervalStr;
  if (!interval && s.intervalMs) {
    const hours = Math.floor(s.intervalMs / 3600000);
    const minutes = Math.floor((s.intervalMs % 3600000) / 60000);
    if (hours > 0 && minutes === 0) interval = hours + 'h';
    else if (hours === 0 && minutes > 0) interval = minutes + 'm';
    else if (hours > 0 && minutes > 0) interval = hours + 'h ' + minutes + 'm';
  }
  if (!interval) interval = '1h';
  const delTag = s.autoDeletePrevious ? ' delOn' : '';
  const pinTag = s.pinAfterSend ? ' pin' : '';
  const replyTag = s.replyToLatest ? ' replyOn' : '';
  const message = s.message || s.messageText || '';
  const command = `/schedule ${interval}${delTag}${pinTag}${replyTag} ${message}`.trim();

  const jsonConfig: Record<string, any> = {
    name: s.name || 'Schedule',
    scheduleType: s.scheduleType || 'interval',
    interval,
    message,
    contentType: s.contentType || 'text',
    pinAfterSend: Boolean(s.pinAfterSend),
    replyToLatest: Boolean(s.replyToLatest),
    autoDeletePrevious: Boolean(s.autoDeletePrevious),
    targetChatId: '<REPLACE_WITH_DESTINATION_CHAT_ID>'
  };
  if (s.mediaFileId) {
    jsonConfig.mediaFileId = s.mediaFileId;
  }
  if (s.timezone) {
    jsonConfig.timezone = s.timezone;
  }

  const summary = `Schedule "${s.name || s.id}" (${interval})`;

  return { command, jsonConfig, summary };
}

export class MessageScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isChecking: boolean = false;
  private static readonly globalExecutingScheduleIds: Set<string> = new Set();
  private executingScheduleIds: Set<string> = MessageScheduler.globalExecutingScheduleIds;
  private executions: number = 0;
  private failures: number = 0;

  /**
   * Resets executing schedule IDs in-flight lock (useful for testing).
   */
  public static resetExecutingScheduleIds(): void {
    MessageScheduler.globalExecutingScheduleIds.clear();
  }

  // SAFETY: Permanently disabled by default until scheduled broadcast requirements are re-audited
  public static readonly IS_ENABLED_BY_DEFAULT: boolean = false;
  public static readonly MAX_EXECUTABLE_SCHEDULES: number = 50;
  public static readonly MAX_PENDING_DELETE_IDS: number = 10;

  /**
   * Classify Telegram deleteMessage responses according to failure characteristics:
   * - SUCCESS: HTTP 200 ok
   * - ALREADY_ABSENT: Message does not exist or was already deleted (resolved)
   * - PERMANENT_FAILURE: Message cannot be deleted (>48h), bot lacks permissions, chat deactivated (terminal for this ID)
   * - TRANSIENT_FAILURE: Rate limit (429), timeout (408), 5xx, or network disconnect (retryable)
   */
  public static classifyDeletionResult(res: { ok: boolean; description?: string; error_code?: number }): DeletionClassification {
    if (res.ok) {
      return 'SUCCESS';
    }

    const desc = (res.description || '').toLowerCase();
    const code = res.error_code;

    // 1. Already Absent: Telegram reports message is already gone or invalid (resolved)
    if (
      desc.includes('message to delete not found') ||
      desc.includes('message not found') ||
      desc.includes('message_id_invalid')
    ) {
      return 'ALREADY_ABSENT';
    }

    // 2. Permanent Failures: Terminal conditions where retrying this message ID will never succeed
    if (
      code === 403 ||
      desc.includes("message can't be deleted") ||
      desc.includes("can't be deleted") ||
      desc.includes('not enough rights') ||
      desc.includes('chat_admin_required') ||
      desc.includes('need administrator rights') ||
      desc.includes('not an administrator') ||
      desc.includes('chat not found') ||
      desc.includes('peer_id_invalid') ||
      desc.includes('group chat was deactivated') ||
      desc.includes('bot was kicked') ||
      desc.includes('bot is not a member')
    ) {
      return 'PERMANENT_FAILURE';
    }

    // 3. Transient Failures: Timeouts, 429s, 5xx, network drops, etc.
    return 'TRANSIENT_FAILURE';
  }

  public static classifyExecutionError(err: any): {
    category: 'DEAD_CHAT' | 'PERMISSION_DENIED' | 'RATE_LIMITED' | 'TRANSIENT';
    isPermanentPermission: boolean;
    isDeadChat: boolean;
    retryAfterMs?: number;
    cleanMessage: string;
  } {
    const rawMsg = err?.message || String(err || '');
    const cleanMsg = rawMsg
      .replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED_BOT_TOKEN]')
      .replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED_BOT_TOKEN]');
    const desc = cleanMsg.toLowerCase();

    // 1. Terminal dead chat conditions: chat deleted, bot kicked/not a member, peer invalid
    if (
      desc.includes('chat not found') ||
      desc.includes('chat was deleted') ||
      desc.includes('peer_id_invalid') ||
      desc.includes('bot was kicked') ||
      desc.includes('bot is not a member') ||
      desc.includes('group chat was deactivated') ||
      desc.includes('bot was removed')
    ) {
      return {
        category: 'DEAD_CHAT',
        isPermanentPermission: false,
        isDeadChat: true,
        cleanMessage: cleanMsg
      };
    }

    // 2. Permission / Admin / Restriction conditions:
    // Bot is in group or user in private chat, but bot lacks permissions to send message/media/pin
    if (
      desc.includes('not enough rights') ||
      desc.includes('chat_admin_required') ||
      desc.includes('need administrator rights') ||
      desc.includes('not an administrator') ||
      desc.includes('bot is not an admin') ||
      desc.includes('have no rights') ||
      desc.includes('rights are not sufficient') ||
      desc.includes('user is restricted') ||
      desc.includes('bot is restricted') ||
      desc.includes('bot_chats_disabled') ||
      desc.includes('forbidden: bot was blocked by the user') ||
      desc.includes("can't send messages to the chat") ||
      desc.includes("cannot send messages to the chat") ||
      desc.includes('rights to send text messages')
    ) {
      return {
        category: 'PERMISSION_DENIED',
        isPermanentPermission: true,
        isDeadChat: false,
        cleanMessage: cleanMsg
      };
    }

    // 3. Rate limiting (429 / retry after)
    const structuredRetry = typeof err?.parameters?.retry_after === 'number'
      ? err.parameters.retry_after
      : (typeof err?.response?.parameters?.retry_after === 'number'
          ? err.response.parameters.retry_after
          : (typeof err?.retry_after === 'number' ? err.retry_after : undefined));
    const is429 = err?.error_code === 429 || err?.response?.error_code === 429;

    if (desc.includes('retry after') || desc.includes('429') || desc.includes('too many requests') || structuredRetry !== undefined || is429) {
      const match = desc.match(/retry\s+after\s+(\d+)/i);
      const retrySec = structuredRetry !== undefined ? structuredRetry : (match ? parseInt(match[1], 10) : 30);
      return {
        category: 'RATE_LIMITED',
        isPermanentPermission: false,
        isDeadChat: false,
        retryAfterMs: Math.max(5000, (retrySec + 5) * 1000),
        cleanMessage: cleanMsg
      };
    }

    // 4. Default: Transient network / API error
    return {
      category: 'TRANSIENT',
      isPermanentPermission: false,
      isDeadChat: false,
      cleanMessage: cleanMsg
    };
  }

  public static calculateFailureNextRun(
    schedule: ScheduledMessage,
    classified: { category: string; isPermanentPermission: boolean; isDeadChat: boolean; retryAfterMs?: number },
    now: number = Date.now()
  ): string {
    const currentFailures = (schedule.consecutiveFailures || 0) + 1;
    const isRecurring = ((schedule.intervalMs && schedule.intervalMs > 0) || schedule.scheduleType === 'daily' || schedule.scheduleType === 'weekly') && schedule.scheduleType !== 'one_time';
    const baseIntervalMs = schedule.intervalMs && schedule.intervalMs > 0
      ? schedule.intervalMs
      : (schedule.scheduleType === 'daily' ? 86400000 : (schedule.scheduleType === 'weekly' ? 604800000 : 0));

    if (classified.isDeadChat) {
      return '';
    }

    if (classified.isPermanentPermission) {
      // Progressive backoff for permission errors:
      // Attempt 1: max(baseInterval, 5 minutes)
      // Attempt 2: max(baseInterval, 15 minutes)
      // Attempt 3: max(baseInterval, 30 minutes)
      // Attempt 4+: max(baseInterval, 60 minutes)
      let backoffMs = 5 * 60 * 1000;
      if (currentFailures === 2) backoffMs = 15 * 60 * 1000;
      else if (currentFailures === 3) backoffMs = 30 * 60 * 1000;
      else if (currentFailures >= 4) backoffMs = 60 * 60 * 1000;

      const delayMs = Math.max(baseIntervalMs, backoffMs);
      if (isRecurring) {
        return new Date(now + delayMs).toISOString();
      }
      // For one-time schedules: allow up to 5 backoff attempts before halting auto-retries,
      // preserving schedule content, enabled flag, and state in place for manual recovery.
      if (currentFailures <= 5) {
        return new Date(now + backoffMs).toISOString();
      }
      return '';
    }

    if (classified.category === 'RATE_LIMITED') {
      const retryDelay = classified.retryAfterMs || 30000;
      if (isRecurring) {
        return new Date(now + Math.max(baseIntervalMs, retryDelay)).toISOString();
      }
      return currentFailures <= 5 ? new Date(now + retryDelay).toISOString() : '';
    }

    // Transient network or server failure: Exponential backoff
    const transientBackoffMs = Math.min(300000, 30000 * Math.pow(2, Math.min(3, currentFailures - 1)));
    if (isRecurring) {
      return new Date(now + Math.max(baseIntervalMs, transientBackoffMs)).toISOString();
    }
    return currentFailures <= 5 ? new Date(now + transientBackoffMs).toISOString() : '';
  }

  private static failureDiagnosticsMap = new Map<string, { lastMessage: string; lastLoggedAt: number }>();

  public static logFailureDiagnostic(scheduleId: string, chatId: number, errorMsg: string, isPermanentPermission: boolean): void {
    const now = Date.now();
    const existing = MessageScheduler.failureDiagnosticsMap.get(scheduleId);
    const minIntervalMs = isPermanentPermission ? 15 * 60 * 1000 : 60 * 1000; // 15 mins for permission, 1 min for transient

    if (existing && existing.lastMessage === errorMsg && (now - existing.lastLoggedAt) < minIntervalMs) {
      return;
    }

    MessageScheduler.failureDiagnosticsMap.set(scheduleId, {
      lastMessage: errorMsg,
      lastLoggedAt: now
    });

    const prefix = isPermanentPermission ? '[SCHEDULER_PERMISSION_ERROR]' : '[SCHEDULER_EXECUTION_ERROR]';
    console.error(`${prefix} Schedule ${scheduleId} (chat ${chatId}): ${errorMsg}`);

    errorTracker.recordError({
      source: 'SCHEDULER',
      severity: isPermanentPermission ? 'WARN' : 'ERROR',
      message: `Failed to execute schedule ${scheduleId}: ${errorMsg}`,
      chatId
    });
  }

  public static clearFailureDiagnostic(scheduleId: string): void {
    MessageScheduler.failureDiagnosticsMap.delete(scheduleId);
  }

  /**
   * Process all candidate message deletions for a schedule:
   * - Collects candidate IDs from pendingDeleteMessageIds and lastSentMessageId
   * - Deletes each message via telegramApi.deleteMessage
   * - Resolved messages (SUCCESS, ALREADY_ABSENT) and terminal messages (PERMANENT_FAILURE) are pruned
   * - Transient failures are kept in pendingDeleteMessageIds bounded to MAX_PENDING_DELETE_IDS
   */
  public static async processScheduleDeletions(
    schedule: ScheduledMessage
  ): Promise<{ remainingPendingIds: number[]; lastSentMessageIdDeleted: boolean }> {
    if (!schedule.autoDeletePrevious) {
      return {
        remainingPendingIds: Array.isArray(schedule.pendingDeleteMessageIds) ? [...schedule.pendingDeleteMessageIds] : [],
        lastSentMessageIdDeleted: false
      };
    }

    const candidateIds = new Set<number>();
    if (Array.isArray(schedule.pendingDeleteMessageIds)) {
      for (const rawId of schedule.pendingDeleteMessageIds) {
        const id = typeof rawId === 'number' ? rawId : Number(rawId);
        if (!isNaN(id) && Number.isInteger(id) && id > 0) {
          candidateIds.add(id);
        }
      }
    }
    const rawLastSent = typeof schedule.lastSentMessageId === 'number' ? schedule.lastSentMessageId : Number(schedule.lastSentMessageId);
    if (!isNaN(rawLastSent) && Number.isInteger(rawLastSent) && rawLastSent > 0) {
      candidateIds.add(rawLastSent);
    }

    if (candidateIds.size === 0) {
      return { remainingPendingIds: [], lastSentMessageIdDeleted: false };
    }

    const remainingPendingIds: number[] = [];
    let lastSentMessageIdDeleted = false;

    for (const messageId of candidateIds) {
      let delRes: { ok: boolean; description?: string; error_code?: number };
      try {
        delRes = await telegramApi.deleteMessage(schedule.chatId, messageId);
      } catch (err: any) {
        delRes = { ok: false, description: err?.message || String(err) };
      }

      const classification = MessageScheduler.classifyDeletionResult(delRes);

      if (classification === 'SUCCESS' || classification === 'ALREADY_ABSENT') {
        if (Number(schedule.lastSentMessageId) === messageId) {
          lastSentMessageIdDeleted = true;
        }
        if (classification === 'ALREADY_ABSENT') {
          console.log(`[SCHEDULER_AUTO_DELETE] Message ${messageId} in chat ${schedule.chatId} was already deleted or absent. Resolved.`);
        }
      } else if (classification === 'PERMANENT_FAILURE') {
        if (Number(schedule.lastSentMessageId) === messageId) {
          lastSentMessageIdDeleted = true;
        }
        console.warn(`[SCHEDULER_AUTO_DELETE] Permanent deletion failure for schedule ${schedule.id} messageId ${messageId} in chat ${schedule.chatId}: ${delRes.description || 'Unknown error'}`);
        errorTracker.recordError({
          source: 'SCHEDULER',
          severity: 'WARN',
          message: `Permanent deletion failure for message ${messageId} in schedule ${schedule.id}: ${delRes.description || 'Unknown error'}`,
          chatId: schedule.chatId
        });
      } else {
        // TRANSIENT_FAILURE: Keep ID for future retry
        remainingPendingIds.push(messageId);
        console.warn(`[SCHEDULER_AUTO_DELETE] Transient deletion failure for schedule ${schedule.id} messageId ${messageId} in chat ${schedule.chatId}: ${delRes.description || 'Unknown error'}. Preserving for future retry.`);
      }
    }

    // Bounded queue policy: keep at most MAX_PENDING_DELETE_IDS
    let boundedPendingIds = remainingPendingIds;
    if (boundedPendingIds.length > MessageScheduler.MAX_PENDING_DELETE_IDS) {
      const overflowCount = boundedPendingIds.length - MessageScheduler.MAX_PENDING_DELETE_IDS;
      const evictedIds = boundedPendingIds.slice(0, overflowCount);
      boundedPendingIds = boundedPendingIds.slice(overflowCount);

      for (const evictedId of evictedIds) {
        console.warn(`[SCHEDULER_AUTO_DELETE] Pending delete queue exceeded maximum limit (${MessageScheduler.MAX_PENDING_DELETE_IDS}). Evicting oldest message ID ${evictedId} for schedule ${schedule.id}`);
        errorTracker.recordError({
          source: 'SCHEDULER',
          severity: 'WARN',
          message: `Pending delete queue reached limit (${MessageScheduler.MAX_PENDING_DELETE_IDS}). Evicting message ID ${evictedId} without deletion.`,
          chatId: schedule.chatId
        });
      }
    }

    return {
      remainingPendingIds: boundedPendingIds,
      lastSentMessageIdDeleted
    };
  }

  public static buildSendOptions(schedule: ScheduledMessage, dynamicReplyId?: number): {
    reply_to_message_id?: number;
    reply_markup?: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
  } {
    const options: any = {};
    if (schedule.replyToLatest) {
      const resolvedReplyId = dynamicReplyId !== undefined ? dynamicReplyId : db.getLatestEligibleMessageId(schedule.chatId);
      if (resolvedReplyId !== undefined && resolvedReplyId > 0) {
        options.reply_to_message_id = resolvedReplyId;
      }
    } else if (schedule.replyToMessageId) {
      options.reply_to_message_id = schedule.replyToMessageId;
    }
    if (schedule.inlineKeyboard && Array.isArray(schedule.inlineKeyboard) && schedule.inlineKeyboard.length > 0) {
      const sanitized = schedule.inlineKeyboard
        .map(row =>
          (Array.isArray(row) ? row : [])
            .filter(btn => btn && typeof btn.text === 'string' && btn.text.trim() && isValidHttpUrl(btn.url))
            .map(btn => ({ text: btn.text.trim(), url: btn.url.trim() }))
        )
        .filter(row => row.length > 0);
      if (sanitized.length > 0) {
        options.reply_markup = { inline_keyboard: sanitized };
      }
    }
    return options;
  }

  public getStatus() {
    return {
      running: this.isRunning,
      executions: this.executions,
      failures: this.failures
    };
  }

  public start() {
    if (this.isRunning) return;

    // Hard requirement: Scheduler execution is disabled in production
    const isExplicitlyEnabled = process.env.ENABLE_SCHEDULER === 'true';
    if (!isExplicitlyEnabled) {
      this.isRunning = false;
      console.log(JSON.stringify({
        event: 'SCHEDULER_STATE',
        enabled: false,
        loadedScheduleCount: 0,
        activeTimerCount: 0
      }));
      return;
    }

    this.isRunning = true;
    const initialSchedules = db.getAllSchedules().filter(s => {
      const cid = Number(s.chatId);
      return cid !== -100111222333 && cid !== -100888777 && cid !== -1009876543210 && cid !== -100777888999 && cid !== -100999888101;
    }).slice(0, MessageScheduler.MAX_EXECUTABLE_SCHEDULES);

    console.log(JSON.stringify({
      event: 'SCHEDULER_STATE',
      enabled: true,
      loadedScheduleCount: initialSchedules.length,
      activeTimerCount: 1,
      scheduleIds: initialSchedules.map(s => s.id),
      targetChatIds: Array.from(new Set(initialSchedules.map(s => s.chatId)))
    }));

    // Check every 15 seconds
    this.timer = setInterval(() => {
      this.checkAndExecuteSchedules();
    }, 15000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }

  public parseInterval(durationStr: string): { ms: number; formatted: string } | null {
    const match = durationStr.trim().toLowerCase().match(/^(\d+)(m|h|d)$/);
    if (!match) return null;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (value <= 0) return null;

    let ms = 0;
    let formatted = '';

    if (unit === 'm') {
      ms = value * 60 * 1000;
      formatted = `${value} minute${value > 1 ? 's' : ''}`;
    } else if (unit === 'h') {
      ms = value * 60 * 60 * 1000;
      formatted = `${value} hour${value > 1 ? 's' : ''}`;
    } else if (unit === 'd') {
      ms = value * 24 * 60 * 60 * 1000;
      formatted = `${value} day${value > 1 ? 's' : ''}`;
    }

    return { ms, formatted };
  }

  public async checkAndExecuteSchedules() {
    if (process.env.ENABLE_SCHEDULER !== 'true') {
      return;
    }

    if (this.isChecking) {
      return;
    }
    this.isChecking = true;

    try {
      // Process any expired temporary moderation actions (tmute & tban)
      try {
        await ModerationService.processExpiredTempActions();
      } catch (err) {
        console.warn('Error processing expired temp actions in scheduler:', err);
      }

      // Process any expired CAPTCHA sessions
      try {
        await ModerationService.processExpiredCaptchaSessions();
      } catch (err) {
        console.warn('Error processing expired captcha sessions in scheduler:', err);
      }

      const allSchedules = db.getAllSchedules();
      const schedules = allSchedules.filter(s => 
        s.chatId && 
        s.chatId !== -100111222333 && 
        String(s.chatId) !== '-100111222333' && 
        s.enabled !== false
      );
      const now = Date.now();

      for (const schedule of schedules) {
        if (!schedule.nextRun) continue;
        const nextRunTime = new Date(schedule.nextRun).getTime();
        if (isNaN(nextRunTime) || now >= nextRunTime) {
          if (this.executingScheduleIds.has(schedule.id)) {
            continue;
          }
          this.executingScheduleIds.add(schedule.id);

          let isDelivered = false;
          try {
            // Read fresh schedule state to avoid stale closure state
            const freshSchedule = db.getScheduleById(schedule.id);
            if (!freshSchedule || freshSchedule.enabled === false) {
              continue;
            }

            // Verify freshSchedule.nextRun has not been updated into the future by a recent edit
            if (freshSchedule.nextRun) {
              const freshNextRunTime = new Date(freshSchedule.nextRun).getTime();
              if (!isNaN(freshNextRunTime) && freshNextRunTime > now) {
                continue;
              }
            }

            // Immediately advance nextRun in memory/storage so any concurrent check cannot pick it up
            const hasInterval = ((freshSchedule.intervalMs && freshSchedule.intervalMs > 0) || freshSchedule.scheduleType === 'daily') && freshSchedule.scheduleType !== 'one_time';
            const effectiveIntervalMs = freshSchedule.intervalMs && freshSchedule.intervalMs > 0 ? freshSchedule.intervalMs : (freshSchedule.scheduleType === 'daily' ? 86400000 : 0);
            const intermediateNextRun = hasInterval ? new Date(now + effectiveIntervalMs).toISOString() : '';

            // Distributed & in-memory atomic claim before Telegram dispatch
            const claimed = await db.claimScheduleExecution(
              freshSchedule.id,
              freshSchedule.nextRun,
              intermediateNextRun,
              `instance_${process.pid}_${Math.random().toString(36).slice(2, 6)}`
            );
            if (!claimed) {
              console.log(`[SCHEDULER_CLAIM] Schedule ${freshSchedule.id} was already claimed by another process. Skipping execution.`);
              continue;
            }

            // If auto-delete is enabled for this schedule, delete its previous message(s)
            let pendingDeleteIds: number[] = Array.isArray(freshSchedule.pendingDeleteMessageIds)
              ? [...freshSchedule.pendingDeleteMessageIds]
              : [];

            if (freshSchedule.autoDeletePrevious) {
              const delResult = await MessageScheduler.processScheduleDeletions(freshSchedule);
              pendingDeleteIds = delResult.remainingPendingIds;
              const numericLastSent = Number(freshSchedule.lastSentMessageId);
              if (delResult.lastSentMessageIdDeleted && !pendingDeleteIds.includes(numericLastSent)) {
                freshSchedule.lastSentMessageId = undefined;
                freshSchedule.pendingDeleteMessageIds = pendingDeleteIds.length > 0 ? pendingDeleteIds : undefined;
                db.updateSchedule(freshSchedule.id, {
                  lastSentMessageId: undefined,
                  pendingDeleteMessageIds: pendingDeleteIds.length > 0 ? pendingDeleteIds : undefined
                });
              } else if (pendingDeleteIds.length > 0) {
                freshSchedule.pendingDeleteMessageIds = pendingDeleteIds;
                db.updateSchedule(freshSchedule.id, {
                  pendingDeleteMessageIds: pendingDeleteIds
                });
              } else if (Array.isArray(freshSchedule.pendingDeleteMessageIds) && freshSchedule.pendingDeleteMessageIds.length > 0 && pendingDeleteIds.length === 0) {
                freshSchedule.pendingDeleteMessageIds = undefined;
                db.updateSchedule(freshSchedule.id, {
                  pendingDeleteMessageIds: undefined
                });
              }
            }

            const { textContent, newLastMentionedUserId } = MessageScheduler.resolveScheduleText(freshSchedule);

            const payload = PostSender.scheduleToPayload(freshSchedule, textContent);
            const sendRes = await PostSender.send(freshSchedule.chatId, payload);

            if (sendRes && sendRes.ok && sendRes.messageId) {
              isDelivered = true;
              const newSentMessageId = sendRes.messageId;

              // Immediately update schedule state to 'success' so post-delivery exceptions cannot leave it in failure state
              const latest = db.getScheduleById(freshSchedule.id) || freshSchedule;
              const latestHasInterval = ((latest.intervalMs && latest.intervalMs > 0) || latest.scheduleType === 'daily') && latest.scheduleType !== 'one_time';
              const latestIntervalMs = latest.intervalMs && latest.intervalMs > 0 ? latest.intervalMs : (latest.scheduleType === 'daily' ? 86400000 : 0);
              if (latestHasInterval) {
                const nextDate = new Date(now + latestIntervalMs).toISOString();
                db.updateScheduleNextRun(latest.id, nextDate, 'success', undefined, newSentMessageId, pendingDeleteIds);
                if (newLastMentionedUserId !== undefined) {
                  db.updateSchedule(latest.id, { lastMentionedUserId: newLastMentionedUserId });
                }
              } else {
                db.updateScheduleNextRun(latest.id, '', 'success', undefined, newSentMessageId, pendingDeleteIds);
                if (newLastMentionedUserId !== undefined) {
                  db.updateSchedule(latest.id, { lastMentionedUserId: newLastMentionedUserId });
                }
                db.toggleSchedule(latest.id, false);
              }
              MessageScheduler.clearFailureDiagnostic(freshSchedule.id);

              this.executions++;
              metricsTracker.increment('scheduler_runs');

              // Best-effort audit logging - failure to write log must never mark delivered message as failed
              try {
                db.addLog({
                  chatId: freshSchedule.chatId,
                  chatTitle: freshSchedule.chatTitle,
                  adminUserId: freshSchedule.adminId,
                  adminUsername: freshSchedule.adminUsername,
                  action: 'schedule_sent',
                  details: `Executed scheduled broadcast [${freshSchedule.id}]: "${textContent.slice(0, 30)}..."`
                });
              } catch (logErr: any) {
                console.warn(`[SCHEDULER] Non-fatal log write failure for schedule ${freshSchedule.id}:`, logErr?.message || logErr);
              }
            } else {
              const errMsg = sendRes?.error || (sendRes as any)?.description || 'Telegram send failed';
              throw new Error(errMsg);
            }
          } catch (err: any) {
            this.failures++;
            metricsTracker.increment('scheduler_failures');
            if (isDelivered) {
              // Message was already delivered! Ensure status remains success
              const latest = db.getScheduleById(schedule.id);
              if (latest && latest.lastStatus !== 'success') {
                const latestHasInterval = ((latest.intervalMs && latest.intervalMs > 0) || latest.scheduleType === 'daily') && latest.scheduleType !== 'one_time';
                const latestIntervalMs = latest.intervalMs && latest.intervalMs > 0 ? latest.intervalMs : (latest.scheduleType === 'daily' ? 86400000 : 0);
                const nextDate = latestHasInterval ? new Date(now + latestIntervalMs).toISOString() : '';
                db.updateScheduleNextRun(latest.id, nextDate, 'success');
              }
              console.error(`[SCHEDULER] Post-delivery error for schedule ${schedule.id} (message was already delivered):`, err?.message || err);
              errorTracker.recordError({
                source: 'SCHEDULER',
                severity: 'WARN',
                message: `Post-delivery exception for schedule ${schedule.id}: ${err?.message || err}`,
                chatId: schedule.chatId
              });
            } else {
              const classified = MessageScheduler.classifyExecutionError(err);
              if (classified.isDeadChat) {
                console.warn(`[SCHEDULER] Automatically removing obsolete schedule ${schedule.id} for nonexistent chat ${schedule.chatId}: ${classified.cleanMessage}`);
                db.deleteSchedule(schedule.chatId, schedule.id);
              } else {
                const latest = db.getScheduleById(schedule.id) || schedule;
                const fallbackNextRun = MessageScheduler.calculateFailureNextRun(latest, classified, now);
                db.updateScheduleNextRun(latest.id, fallbackNextRun, 'failure', classified.cleanMessage);
                MessageScheduler.logFailureDiagnostic(schedule.id, schedule.chatId, classified.cleanMessage, classified.isPermanentPermission);
              }
            }
          } finally {
            this.executingScheduleIds.delete(schedule.id);
          }
        }
      }
    } finally {
      this.isChecking = false;
    }
  }

  public static resolveScheduleText(freshSchedule: ScheduledMessage): {
    textContent: string;
    newLastMentionedUserId?: number;
  } {
    let textContent = freshSchedule.messageText || freshSchedule.message || '';
    let newLastMentionedUserId: number | undefined = freshSchedule.lastMentionedUserId;

    // Resolve dynamic mentions if schedule has mentionMode or placeholder tokens
    const hasMemberToken = /@(?:member|random)|\[(?:member|random)\]/i.test(textContent);
    const hasAllToken = /@all|\/all|\[all\]/i.test(textContent);
    const shouldMentionRandom = freshSchedule.mentionMode === 'random_member' || hasMemberToken;
    const shouldMentionAll = freshSchedule.mentionMode === 'all_members' || hasAllToken;

    if (shouldMentionRandom) {
      const allMembers = db.getGroupMembersList(freshSchedule.chatId);
      const botId = db.getCurrentBotId();
      const eligible = allMembers.filter(m => {
        if (!m || !m.userId) return false;
        if (botId && m.userId === botId) return false;
        const uname = (m.username || '').toLowerCase();
        if (uname.includes('bot') || uname.endsWith('bot') || (m as any).is_bot) return false;
        return true;
      });

      if (eligible.length > 0) {
        // Member mention rotation: Avoid repeating the same member consecutively
        let candidates = eligible.filter(m => m.userId !== freshSchedule.lastMentionedUserId);
        if (candidates.length === 0) {
          candidates = eligible;
        }
        const selected = candidates[Math.floor(Math.random() * candidates.length)];
        newLastMentionedUserId = selected.userId;

        const rawUname = (selected.username || '').trim().replace(/^@/, '');
        const mentionTag = rawUname.length > 0
          ? `@${rawUname}`
          : `<a href="tg://user?id=${selected.userId}">${escapeHtml(selected.firstName || 'Member')}</a>`;

        if (hasMemberToken) {
          textContent = textContent.replace(/@(?:member|random)|\[(?:member|random)\]/gi, mentionTag);
        } else if (textContent) {
          textContent = `${textContent} ${mentionTag}`;
        } else {
          textContent = mentionTag;
        }
      }
    } else if (shouldMentionAll) {
      const allMembers = db.getGroupMembersList(freshSchedule.chatId);
      const botId = db.getCurrentBotId();
      const seenUserIds = new Set<number>();
      const mentions: string[] = [];

      for (const m of allMembers) {
        if (!m || !m.userId) continue;
        if (botId && m.userId === botId) continue;
        if (seenUserIds.has(m.userId)) continue;

        const rawUname = (m.username || '').trim().replace(/^@/, '');
        const lowerUname = rawUname.toLowerCase();
        if (lowerUname.includes('bot') || lowerUname.endsWith('bot') || (m as any).is_bot) continue;

        seenUserIds.add(m.userId);
        const emoji = MENTION_EMOJIS[Math.floor(Math.random() * MENTION_EMOJIS.length)];
        if (rawUname.length > 0) {
          mentions.push(`${emoji} → @${rawUname}`);
        } else {
          const displayName = m.firstName?.trim() || 'Member';
          mentions.push(`${emoji} → <a href="tg://user?id=${m.userId}">${escapeHtml(displayName)}</a>`);
        }
      }

      const allMentionsText = mentions.join('\n');
      if (hasAllToken) {
        textContent = textContent.replace(/@all|\/all|\[all\]/gi, allMentionsText);
      } else if (textContent) {
        textContent = `${textContent}\n\n${allMentionsText}`;
      } else {
        textContent = allMentionsText;
      }
    }

    return { textContent, newLastMentionedUserId };
  }

  // Deduplication cache to prevent duplicate triggered sends on the same incoming message
  private static processedTriggerMessageKeys: Set<string> = new Set();

  /**
   * Resets trigger deduplication cache (useful for testing).
   */
  public static resetTriggerDeduplicationCache(): void {
    MessageScheduler.processedTriggerMessageKeys.clear();
  }

  // Configurable internal cooldown per schedule (default 30 seconds)
  public static readonly TRIGGER_COOLDOWN_MS: number = 30000;
  private static scheduleTriggerCooldowns: Map<string, number> = new Map();

  /**
   * Resets trigger cooldown cache (useful for testing).
   */
  public static resetTriggerCooldownCache(): void {
    MessageScheduler.scheduleTriggerCooldowns.clear();
  }

  /**
   * Evaluates incoming message text or caption against configured schedule triggers in the target chat.
   * Returns true if a matching schedule was found and successfully triggered.
   */
  public async handleIncomingMessageTrigger(
    message: TelegramMessage,
    chatId: number,
    textOrCaption: string
  ): Promise<boolean> {
    if (!message || !chatId || !textOrCaption) return false;

    // Prevent duplicate responses to the same incoming Telegram message
    const triggerKey = `${chatId}:${message.message_id}`;
    if (MessageScheduler.processedTriggerMessageKeys.has(triggerKey)) {
      return false;
    }

    const groupSchedules = db.getGroupSchedules(chatId);
    if (!groupSchedules || groupSchedules.length === 0) return false;

    const matched = findMatchingSchedule(groupSchedules, textOrCaption);
    if (!matched) return false;

    // Record processed trigger key
    MessageScheduler.processedTriggerMessageKeys.add(triggerKey);
    if (MessageScheduler.processedTriggerMessageKeys.size > 2000) {
      const first = MessageScheduler.processedTriggerMessageKeys.values().next().value;
      if (first) MessageScheduler.processedTriggerMessageKeys.delete(first);
    }

    const matchedPhrase = getLongestMatchingPhrase(textOrCaption, matched.triggerKeyword) || matched.triggerKeyword;
    console.log(`[SCHEDULE_TRIGGER] Matched trigger keyword "${matchedPhrase}" for schedule [${matched.id}] in chat ${chatId}`);

    return await this.executeTriggeredSchedule(matched, message, matchedPhrase);
  }

  /**
   * Executes a scheduled message immediately via PostSender upon trigger keyword match.
   * Preserves time-based schedule nextRun, recurring interval calculations, and distributed claims.
   */
  public async executeTriggeredSchedule(
    freshSchedule: ScheduledMessage,
    triggerMessage?: TelegramMessage,
    matchedPhrase?: string
  ): Promise<boolean> {
    // 1. Fetch latest schedule from storage. Abort if no longer exists or is disabled (no fallback to stale snapshot)
    const schedule = db.getScheduleById(freshSchedule.id);
    if (!schedule || schedule.enabled === false) {
      console.log(`[SCHEDULE_TRIGGER] Schedule [${freshSchedule.id}] does not exist in storage or is disabled. Aborting trigger.`);
      return false;
    }

    // 2. Prevent concurrent execution: shared with checkAndExecuteSchedules timer loop
    if (this.executingScheduleIds.has(schedule.id)) {
      console.log(`[SCHEDULE_TRIGGER] Schedule [${schedule.id}] is currently executing. Skipping concurrent trigger.`);
      return false;
    }

    // 3. Check per-schedule trigger cooldown (30 seconds)
    const now = Date.now();
    const lastTriggeredAt = MessageScheduler.scheduleTriggerCooldowns.get(schedule.id) || 0;
    if (lastTriggeredAt > 0 && now - lastTriggeredAt < MessageScheduler.TRIGGER_COOLDOWN_MS) {
      const remainingSec = Math.ceil((MessageScheduler.TRIGGER_COOLDOWN_MS - (now - lastTriggeredAt)) / 1000);
      console.log(`[SCHEDULE_TRIGGER] Schedule [${schedule.id}] is on cooldown (${remainingSec}s remaining). Skipping.`);
      return false;
    }

    // 4. Acquire in-flight lock before any asynchronous operations (auto-delete or send)
    this.executingScheduleIds.add(schedule.id);

    try {
      // Re-verify schedule state after lock acquisition to guard against race conditions
      const latestSchedule = db.getScheduleById(schedule.id);
      if (!latestSchedule || latestSchedule.enabled === false) {
        return false;
      }

      // Auto-delete previous scheduled broadcast message(s) if configured
      let pendingDeleteIds: number[] = Array.isArray(latestSchedule.pendingDeleteMessageIds)
        ? [...latestSchedule.pendingDeleteMessageIds]
        : [];

      if (latestSchedule.autoDeletePrevious) {
        const delResult = await MessageScheduler.processScheduleDeletions(latestSchedule);
        pendingDeleteIds = delResult.remainingPendingIds;
        const numericLastSent = Number(latestSchedule.lastSentMessageId);
        if (delResult.lastSentMessageIdDeleted && !pendingDeleteIds.includes(numericLastSent)) {
          latestSchedule.lastSentMessageId = undefined;
          latestSchedule.pendingDeleteMessageIds = pendingDeleteIds.length > 0 ? pendingDeleteIds : undefined;
          db.updateSchedule(latestSchedule.id, {
            lastSentMessageId: undefined,
            pendingDeleteMessageIds: pendingDeleteIds.length > 0 ? pendingDeleteIds : undefined
          });
        } else if (pendingDeleteIds.length > 0) {
          latestSchedule.pendingDeleteMessageIds = pendingDeleteIds;
          db.updateSchedule(latestSchedule.id, {
            pendingDeleteMessageIds: pendingDeleteIds
          });
        } else if (Array.isArray(latestSchedule.pendingDeleteMessageIds) && latestSchedule.pendingDeleteMessageIds.length > 0 && pendingDeleteIds.length === 0) {
          latestSchedule.pendingDeleteMessageIds = undefined;
          db.updateSchedule(latestSchedule.id, {
            pendingDeleteMessageIds: undefined
          });
        }
      }

      const { textContent, newLastMentionedUserId } = MessageScheduler.resolveScheduleText(latestSchedule);
      const payload = PostSender.scheduleToPayload(latestSchedule, textContent);

      const sendRes = await PostSender.send(latestSchedule.chatId, payload);

      if (sendRes && sendRes.ok && sendRes.messageId) {
        const newSentMessageId = sendRes.messageId;

        // Record cooldown timestamp only upon successful delivery
        MessageScheduler.scheduleTriggerCooldowns.set(latestSchedule.id, Date.now());
        if (MessageScheduler.scheduleTriggerCooldowns.size > 1000) {
          const cutoff = Date.now() - MessageScheduler.TRIGGER_COOLDOWN_MS;
          for (const [sId, sTs] of MessageScheduler.scheduleTriggerCooldowns.entries()) {
            if (sTs < cutoff) {
              MessageScheduler.scheduleTriggerCooldowns.delete(sId);
            }
          }
        }

        db.addLog({
          chatId: latestSchedule.chatId,
          chatTitle: latestSchedule.chatTitle,
          adminUserId: latestSchedule.adminId,
          adminUsername: latestSchedule.adminUsername,
          action: 'schedule_sent',
          details: `Triggered broadcast [${latestSchedule.id}] via keyword "${matchedPhrase || latestSchedule.triggerKeyword}": "${textContent.slice(0, 30)}..."`
        });

        this.executions++;
        metricsTracker.increment('scheduler_runs');

        // Update lastRun, lastStatus, lastSentMessageId, pendingDeleteMessageIds using latest fresh state without modifying nextRun
        const latest = db.getScheduleById(latestSchedule.id) || latestSchedule;
        const cleanSentMessageId = typeof newSentMessageId === 'number' ? newSentMessageId : Number(newSentMessageId) || newSentMessageId;
        db.updateSchedule(latest.id, {
          lastRun: new Date().toISOString(),
          lastStatus: 'success',
          lastSentMessageId: cleanSentMessageId,
          pendingDeleteMessageIds: pendingDeleteIds.length > 0 ? pendingDeleteIds : undefined,
          runsCount: (latest.runsCount || 0) + 1,
          ...(newLastMentionedUserId !== undefined ? { lastMentionedUserId: newLastMentionedUserId } : {})
        });

        return true;
      } else {
        const errMsg = sendRes?.error || (sendRes as any)?.description || 'Telegram send failed';
        console.error(`[SCHEDULE_TRIGGER] Failed to deliver triggered schedule [${latestSchedule.id}] in chat ${latestSchedule.chatId}: ${errMsg}`);

        db.updateSchedule(latestSchedule.id, {
          lastStatus: 'failure',
          lastError: errMsg,
          ...(pendingDeleteIds.length > 0 ? { pendingDeleteMessageIds: pendingDeleteIds } : {})
        });

        errorTracker.recordError({
          source: 'SCHEDULER',
          severity: 'ERROR',
          message: `Failed to execute triggered schedule ${latestSchedule.id}: ${errMsg}`,
          chatId: latestSchedule.chatId
        });

        return false;
      }
    } catch (err: any) {
      console.error(`[SCHEDULE_TRIGGER] Exception delivering triggered schedule [${schedule.id}]:`, err?.message || err);
      db.updateSchedule(schedule.id, {
        lastStatus: 'failure',
        lastError: err?.message || 'Delivery error'
      });
      errorTracker.recordError({
        source: 'SCHEDULER',
        severity: 'ERROR',
        message: `Exception delivering triggered schedule ${schedule.id}: ${err?.message || err}`,
        chatId: schedule.chatId
      });
      return false;
    } finally {
      // Release in-flight lock
      this.executingScheduleIds.delete(schedule.id);
    }
  }

  public createSchedule(
    chatId: number,
    chatTitle: string | undefined,
    adminId: number,
    adminUsername: string | undefined,
    intervalStr: string,
    messageText: string,
    contentType?: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'animation',
    mediaFileId?: string,
    autoDeletePrevious?: boolean,
    explicitMentionMode?: 'none' | 'random_member' | 'all_members',
    pinAfterSend?: boolean,
    inlineKeyboard?: ScheduledPostButton[][],
    replyToLatest?: boolean,
    triggerKeyword?: string
  ): { success: boolean; schedule?: ScheduledMessage; error?: string } {
    const parsed = this.parseInterval(intervalStr);
    if (!parsed) {
      return {
        success: false,
        error: 'Invalid time format. Use format like <code>30m</code>, <code>2h</code>, or <code>1d</code>.'
      };
    }

    const trimmedText = messageText.trim();
    if (!trimmedText && !mediaFileId) {
      return {
        success: false,
        error: 'Please provide a message body or reply to a message/media for the schedule.'
      };
    }

    let mentionMode: 'none' | 'random_member' | 'all_members' = explicitMentionMode || 'none';
    if (mentionMode === 'none') {
      if (/@(?:member|random)|\[(?:member|random)\]/i.test(trimmedText)) {
        mentionMode = 'random_member';
      } else if (/@all|\/all|\[all\]/i.test(trimmedText)) {
        mentionMode = 'all_members';
      }
    }

    const nextRun = new Date(Date.now() + parsed.ms).toISOString();
    const normalizedTrigger = typeof triggerKeyword === 'string' && triggerKeyword.trim().length > 0
      ? normalizeTriggerKeyword(triggerKeyword)
      : undefined;

    const schedule = db.addSchedule({
      chatId,
      chatTitle,
      adminId,
      adminUsername,
      message: trimmedText || (contentType ? `[${contentType.toUpperCase()}]` : 'Scheduled content'),
      messageText: trimmedText,
      contentType: contentType || 'text',
      mediaFileId,
      intervalMs: parsed.ms,
      intervalFormatted: parsed.formatted,
      nextRun,
      autoDeletePrevious: autoDeletePrevious || false,
      pinAfterSend: pinAfterSend || false,
      replyToLatest: replyToLatest || false,
      inlineKeyboard: inlineKeyboard && inlineKeyboard.length > 0 ? inlineKeyboard : undefined,
      mentionMode,
      triggerKeyword: normalizedTrigger
    });

    db.addLog({
      chatId,
      chatTitle,
      adminUserId: adminId,
      adminUsername,
      action: 'schedule_created',
      details: `Created recurring schedule [${schedule.id}] every ${parsed.formatted}${mentionMode !== 'none' ? ` (mentionMode: ${mentionMode})` : ''}${schedule.pinAfterSend ? ' [pin]' : ''}${schedule.replyToLatest ? ' [replyLatest]' : ''}${schedule.inlineKeyboard ? ` [buttons: ${schedule.inlineKeyboard.flat().length}]` : ''}${schedule.triggerKeyword ? ` [trigger: "${schedule.triggerKeyword}"]` : ''}`
    });

    return { success: true, schedule };
  }

  public deleteSchedule(chatId: number, scheduleId: string, adminId: number, adminUsername?: string): boolean {
    const deleted = db.deleteSchedule(chatId, scheduleId);
    if (deleted) {
      db.addLog({
        chatId,
        adminUserId: adminId,
        adminUsername,
        action: 'schedule_deleted',
        details: `Deleted scheduled message [${scheduleId.toUpperCase()}]`
      });
    }
    return deleted;
  }
}

export const messageScheduler = new MessageScheduler();

export const classifyScheduleExecutionError = MessageScheduler.classifyExecutionError;
export const calculateScheduleFailureNextRun = MessageScheduler.calculateFailureNextRun;
