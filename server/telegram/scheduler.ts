import { db } from '../db/storage.js';
import { telegramApi } from './api.js';
import { ScheduledMessage } from './types.js';
import { ModerationService } from './moderation.js';

export class MessageScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    // Check every 15 seconds
    this.timer = setInterval(() => {
      this.checkAndExecuteSchedules();
    }, 15000);

    // Initial check immediately
    this.checkAndExecuteSchedules();
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

    const schedules = db.getAllSchedules();
    const now = Date.now();

    for (const schedule of schedules) {
      const nextRunTime = new Date(schedule.nextRun).getTime();
      if (now >= nextRunTime) {
        try {
          const textContent = schedule.messageText || schedule.message || '';
          if (schedule.contentType === 'photo' && schedule.mediaFileId) {
            await telegramApi.sendPhoto(schedule.chatId, schedule.mediaFileId, {
              caption: textContent,
              parse_mode: 'HTML'
            });
          } else if (schedule.contentType === 'video' && schedule.mediaFileId) {
            await telegramApi.sendVideo(schedule.chatId, schedule.mediaFileId, {
              caption: textContent,
              parse_mode: 'HTML'
            });
          } else if (schedule.contentType === 'document' && schedule.mediaFileId) {
            await telegramApi.sendDocument(schedule.chatId, schedule.mediaFileId, {
              caption: textContent,
              parse_mode: 'HTML'
            });
          } else if (schedule.contentType === 'animation' && schedule.mediaFileId) {
            await telegramApi.sendAnimation(schedule.chatId, schedule.mediaFileId, {
              caption: textContent,
              parse_mode: 'HTML'
            });
          } else if (schedule.contentType === 'sticker' && schedule.mediaFileId) {
            await telegramApi.sendSticker(schedule.chatId, schedule.mediaFileId);
            if (textContent) {
              await telegramApi.sendMessage(schedule.chatId, textContent);
            }
          } else {
            await telegramApi.sendMessage(schedule.chatId, textContent);
          }
          
          db.addLog({
            chatId: schedule.chatId,
            chatTitle: schedule.chatTitle,
            adminUserId: schedule.adminId,
            adminUsername: schedule.adminUsername,
            action: 'schedule_sent',
            details: `Executed scheduled broadcast [${schedule.id}]: "${textContent.slice(0, 30)}..."`
          });

          // Calculate next run time
          const nextDate = new Date(now + schedule.intervalMs).toISOString();
          db.updateScheduleNextRun(schedule.id, nextDate);
        } catch (err: any) {
          console.error(`Error executing schedule ${schedule.id}:`, err.message);
        }
      }
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
    mediaFileId?: string
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
      nextRun
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
