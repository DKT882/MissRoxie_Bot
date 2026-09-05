import { db } from '../db/storage.js';
import { telegramApi } from './api.js';
import { ScheduledMessage } from './types.js';
import { ModerationService } from './moderation.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';

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

          try {
            // Read fresh schedule state to avoid stale closure state
            const freshSchedule = db.getScheduleById(schedule.id) || schedule;
            if (freshSchedule.enabled === false) continue;

            // Immediately advance nextRun in memory/storage so any concurrent check cannot pick it up
            const hasInterval = freshSchedule.intervalMs && freshSchedule.intervalMs > 0 && freshSchedule.scheduleType !== 'one_time';
            const intermediateNextRun = hasInterval ? new Date(now + freshSchedule.intervalMs!).toISOString() : '';
            db.updateSchedule(freshSchedule.id, { nextRun: intermediateNextRun });

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

            const textContent = freshSchedule.messageText || freshSchedule.message || '';
            const sendOptions: any = {};
            if (freshSchedule.replyToMessageId) {
              sendOptions.reply_to_message_id = freshSchedule.replyToMessageId;
            }

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
              sendRes = await telegramApi.sendMessage(freshSchedule.chatId, textContent, sendOptions);
            }

            if (sendRes && sendRes.ok && sendRes.result) {
              const newSentMessageId = sendRes.result.message_id;
              
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
              } else {
                db.updateScheduleNextRun(freshSchedule.id, '', 'success', undefined, newSentMessageId);
                db.toggleSchedule(freshSchedule.id, false);
              }
            } else {
              const errMsg = sendRes?.description || 'Telegram send failed';
              throw new Error(errMsg);
            }
          } catch (err: any) {
            this.failures++;
            metricsTracker.increment('scheduler_failures');
            const isDeadChat = err.message?.includes('chat not found') || err.message?.includes('chat was deleted') || err.message?.includes('PEER_ID_INVALID') || err.message?.includes('bot was kicked') || err.message?.includes('bot is not a member');
            if (isDeadChat) {
              console.warn(`[SCHEDULER] Automatically removing obsolete schedule ${schedule.id} for nonexistent chat ${schedule.chatId}: ${err.message}`);
              db.deleteSchedule(schedule.chatId, schedule.id);
            } else {
              console.error(`Error executing schedule ${schedule.id}:`, err.message);
              db.updateScheduleNextRun(schedule.id, schedule.nextRun || '', 'failure', err.message);
            }
            errorTracker.recordError({
              source: 'SCHEDULER',
              severity: 'ERROR',
              message: `Failed to execute schedule ${schedule.id}: ${err.message}`,
              chatId: schedule.chatId
            });
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
    autoDeletePrevious?: boolean
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
      autoDeletePrevious: autoDeletePrevious || false
    });

    db.addLog({
      chatId,
      chatTitle,
      adminUserId: adminId,
      adminUsername,
      action: 'schedule_created',
      details: `Created recurring schedule [${schedule.id}] every ${parsed.formatted}`
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
