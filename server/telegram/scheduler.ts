import { db } from '../db/storage.js';
import { telegramApi } from './api.js';
import { ScheduledMessage, ScheduledPostButton } from './types.js';
import { ModerationService } from './moderation.js';
import { TelegramMiddleware } from './middleware.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';

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

export class MessageScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isChecking: boolean = false;
  private executingScheduleIds: Set<string> = new Set();
  private executions: number = 0;
  private failures: number = 0;

  // SAFETY: Permanently disabled by default until scheduled broadcast requirements are re-audited
  public static readonly IS_ENABLED_BY_DEFAULT: boolean = false;
  public static readonly MAX_EXECUTABLE_SCHEDULES: number = 50;

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
            const freshSchedule = db.getScheduleById(schedule.id) || schedule;
            if (freshSchedule.enabled === false) continue;

            // Immediately advance nextRun in memory/storage so any concurrent check cannot pick it up
            const hasInterval = freshSchedule.intervalMs && freshSchedule.intervalMs > 0 && freshSchedule.scheduleType !== 'one_time';
            const intermediateNextRun = hasInterval ? new Date(now + freshSchedule.intervalMs!).toISOString() : '';

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

            // If auto-delete is enabled for this schedule, delete its previous message
            if (freshSchedule.autoDeletePrevious && freshSchedule.lastSentMessageId) {
              try {
                const delRes = await telegramApi.deleteMessage(freshSchedule.chatId, freshSchedule.lastSentMessageId);
                if (!delRes.ok && delRes.description) {
                  console.error(`[ERROR] Failed to delete previous scheduled message scheduleId=${freshSchedule.id} messageId=${freshSchedule.lastSentMessageId} error=${delRes.description}`);
                }
              } catch (delErr: any) {
                console.error(`[ERROR] Failed to delete previous scheduled message scheduleId=${freshSchedule.id} messageId=${freshSchedule.lastSentMessageId} error=${delErr?.message || delErr}`);
              }
            }

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

            let dynamicReplyId: number | undefined = undefined;
            if (freshSchedule.replyToLatest) {
              dynamicReplyId = db.getLatestEligibleMessageId(freshSchedule.chatId);
            }

            const sendOptions = MessageScheduler.buildSendOptions(freshSchedule, dynamicReplyId);

            let sendRes: any;
            if (freshSchedule.contentType === 'photo' && freshSchedule.mediaFileId) {
              sendRes = await telegramApi.sendPhoto(freshSchedule.chatId, freshSchedule.mediaFileId, {
                caption: textContent,
                parse_mode: 'HTML',
                ...sendOptions
              });
            } else if (freshSchedule.contentType === 'video' && freshSchedule.mediaFileId) {
              sendRes = await telegramApi.sendVideo(freshSchedule.chatId, freshSchedule.mediaFileId, {
                caption: textContent,
                parse_mode: 'HTML',
                ...sendOptions
              });
            } else if (freshSchedule.contentType === 'document' && freshSchedule.mediaFileId) {
              sendRes = await telegramApi.sendDocument(freshSchedule.chatId, freshSchedule.mediaFileId, {
                caption: textContent,
                parse_mode: 'HTML',
                ...sendOptions
              });
            } else if (freshSchedule.contentType === 'animation' && freshSchedule.mediaFileId) {
              sendRes = await telegramApi.sendAnimation(freshSchedule.chatId, freshSchedule.mediaFileId, {
                caption: textContent,
                parse_mode: 'HTML',
                ...sendOptions
              });
            } else if (freshSchedule.contentType === 'sticker' && freshSchedule.mediaFileId) {
              sendRes = await telegramApi.sendSticker(freshSchedule.chatId, freshSchedule.mediaFileId, sendOptions);
            } else {
              sendRes = await telegramApi.sendMessage(freshSchedule.chatId, textContent, {
                parse_mode: 'HTML',
                ...sendOptions
              });
            }

            if (sendRes && sendRes.ok && sendRes.result) {
              isDelivered = true;
              const newSentMessageId = sendRes.result.message_id;
              
              // FEATURE 1: Pin scheduled message after successful delivery
              if (freshSchedule.pinAfterSend && newSentMessageId) {
                try {
                  const botCheck = await TelegramMiddleware.requireBotPermission(freshSchedule.chatId, 'can_pin_messages');
                  if (botCheck.allowed) {
                    const pinRes = await telegramApi.pinChatMessage(freshSchedule.chatId, newSentMessageId, true);
                    if (!pinRes.ok) {
                      console.error(`[SCHEDULER_PIN_WARNING] Pin failed for message ${newSentMessageId} in chat ${freshSchedule.chatId}: ${pinRes.description}`);
                      errorTracker.recordError({
                        source: 'SCHEDULER',
                        severity: 'WARN',
                        message: `Pin failed for scheduled message ${freshSchedule.id}: ${pinRes.description}`,
                        chatId: freshSchedule.chatId
                      });
                    }
                  } else {
                    console.warn(`[SCHEDULER_PIN_SKIPPED] Bot lacks pin permissions in chat ${freshSchedule.chatId}: ${botCheck.reason}`);
                    errorTracker.recordError({
                      source: 'SCHEDULER',
                      severity: 'WARN',
                      message: `Bot lacks pin permission for scheduled message ${freshSchedule.id}: ${botCheck.reason}`,
                      chatId: freshSchedule.chatId
                    });
                  }
                } catch (pinErr: any) {
                  console.error(`[SCHEDULER_PIN_ERROR] Exception pinning message ${newSentMessageId}: ${pinErr?.message || pinErr}`);
                  errorTracker.recordError({
                    source: 'SCHEDULER',
                    severity: 'WARN',
                    message: `Exception pinning scheduled message ${freshSchedule.id}: ${pinErr?.message || pinErr}`,
                    chatId: freshSchedule.chatId
                  });
                }
              }

              db.addLog({
                chatId: freshSchedule.chatId,
                chatTitle: freshSchedule.chatTitle,
                adminUserId: freshSchedule.adminId,
                adminUsername: freshSchedule.adminUsername,
                action: 'schedule_sent',
                details: `Executed scheduled broadcast [${freshSchedule.id}]: "${textContent.slice(0, 30)}..."`
              });

              this.executions++;
              metricsTracker.increment('scheduler_runs');

              // Calculate next run time and update lastSentMessageId
              if (hasInterval) {
                const nextDate = new Date(now + freshSchedule.intervalMs!).toISOString();
                db.updateScheduleNextRun(freshSchedule.id, nextDate, 'success', undefined, newSentMessageId);
                if (newLastMentionedUserId !== undefined) {
                  db.updateSchedule(freshSchedule.id, { lastMentionedUserId: newLastMentionedUserId });
                }
              } else {
                db.updateScheduleNextRun(freshSchedule.id, '', 'success', undefined, newSentMessageId);
                if (newLastMentionedUserId !== undefined) {
                  db.updateSchedule(freshSchedule.id, { lastMentionedUserId: newLastMentionedUserId });
                }
                db.toggleSchedule(freshSchedule.id, false);
              }
            } else {
              const errMsg = sendRes?.description || 'Telegram send failed';
              throw new Error(errMsg);
            }
          } catch (err: any) {
            this.failures++;
            metricsTracker.increment('scheduler_failures');
            if (isDelivered) {
              // Message was already delivered! Do NOT revert nextRun or re-execute
              console.error(`[SCHEDULER] Post-delivery error for schedule ${schedule.id} (message was already delivered):`, err?.message || err);
              errorTracker.recordError({
                source: 'SCHEDULER',
                severity: 'WARN',
                message: `Post-delivery exception for schedule ${schedule.id}: ${err?.message || err}`,
                chatId: schedule.chatId
              });
            } else {
              const isDeadChat = err.message?.includes('chat not found') || err.message?.includes('chat was deleted') || err.message?.includes('PEER_ID_INVALID') || err.message?.includes('bot was kicked') || err.message?.includes('bot is not a member');
              if (isDeadChat) {
                console.warn(`[SCHEDULER] Automatically removing obsolete schedule ${schedule.id} for nonexistent chat ${schedule.chatId}: ${err.message}`);
                db.deleteSchedule(schedule.chatId, schedule.id);
              } else {
                console.error(`Error executing schedule ${schedule.id}:`, err.message);
                const hasInterval = schedule.intervalMs && schedule.intervalMs > 0 && schedule.scheduleType !== 'one_time';
                const fallbackNextRun = hasInterval ? new Date(now + schedule.intervalMs!).toISOString() : '';
                db.updateScheduleNextRun(schedule.id, fallbackNextRun, 'failure', err.message);
              }
              errorTracker.recordError({
                source: 'SCHEDULER',
                severity: 'ERROR',
                message: `Failed to execute schedule ${schedule.id}: ${err.message}`,
                chatId: schedule.chatId
              });
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
    replyToLatest?: boolean
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
      mentionMode
    });

    db.addLog({
      chatId,
      chatTitle,
      adminUserId: adminId,
      adminUsername,
      action: 'schedule_created',
      details: `Created recurring schedule [${schedule.id}] every ${parsed.formatted}${mentionMode !== 'none' ? ` (mentionMode: ${mentionMode})` : ''}${schedule.pinAfterSend ? ' [pin]' : ''}${schedule.replyToLatest ? ' [replyLatest]' : ''}${schedule.inlineKeyboard ? ` [buttons: ${schedule.inlineKeyboard.flat().length}]` : ''}`
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
