import { telegramApi } from './api.js';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from './middleware.js';
import { PostPayload, SendPostResult, ScheduledMessage, ScheduledPostButton } from './types.js';
import { errorTracker } from '../observability/errorService.js';

export function isValidHttpUrl(stringUrl?: string): boolean {
  if (!stringUrl || typeof stringUrl !== 'string') return false;
  const trimmed = stringUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const hostname = parsed.hostname?.toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return false;
    }
    // Must contain a valid domain (e.g. example.com, t.me) with a dot
    if (!hostname.includes('.')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validateMediaReference(ref?: string): { valid: boolean; error?: string; normalized?: string } {
  if (!ref || typeof ref !== 'string') {
    return { valid: false, error: 'Media reference (file_id or HTTPS URL) is required.' };
  }
  const trimmed = ref.trim();
  if (!trimmed) {
    return { valid: false, error: 'Media reference cannot be empty.' };
  }
  if (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('local_preview_')
  ) {
    return {
      valid: false,
      error: 'Local browser files or blob/data URLs cannot be delivered to Telegram. Please provide a valid Telegram file_id or a public https:// URL.'
    };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (!isValidHttpUrl(trimmed)) {
      return {
        valid: false,
        error: 'Invalid media URL. Media links must be a valid public http:// or https:// address (e.g. https://example.com/image.jpg).'
      };
    }
    try {
      const parsed = new URL(trimmed);
      return { valid: true, normalized: parsed.href };
    } catch {
      return { valid: false, error: 'Malformed media URL format.' };
    }
  }
  // If not HTTP/HTTPS URL, must be a Telegram file_id
  if (trimmed.length < 5 || trimmed.includes(' ') || trimmed.includes('\\')) {
    return {
      valid: false,
      error: 'Invalid Telegram file_id format. File IDs cannot contain spaces or invalid characters.'
    };
  }
  return { valid: true, normalized: trimmed };
}

export function sanitizeInlineButtons(buttons?: ScheduledPostButton[][]): ScheduledPostButton[][] | undefined {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined;
  const sanitized = buttons
    .map(row =>
      (Array.isArray(row) ? row : [])
        .filter(btn => btn && typeof btn.text === 'string' && btn.text.trim() && isValidHttpUrl(btn.url))
        .map(btn => ({ text: btn.text.trim(), url: btn.url.trim() }))
    )
    .filter(row => row.length > 0);
  return sanitized.length > 0 ? sanitized : undefined;
}

export class PostSender {
  /**
   * Adapts a ScheduledMessage record into a normalized PostPayload.
   */
  public static scheduleToPayload(schedule: ScheduledMessage, resolvedText?: string): PostPayload {
    return {
      contentType: schedule.contentType || 'text',
      text: resolvedText !== undefined ? resolvedText : (schedule.messageText || schedule.message || ''),
      mediaFileId: schedule.mediaFileId,
      buttons: schedule.inlineKeyboard,
      pinAfterSend: schedule.pinAfterSend,
      replyToLatest: schedule.replyToLatest,
      replyToMessageId: schedule.replyToMessageId,
      autoDeletePrevious: schedule.autoDeletePrevious,
      protectContent: (schedule as any).protectContent
    };
  }

  /**
   * Centralized sending engine for rich Telegram posts (text, photos, videos, GIFs, docs, stickers, buttons, pinning).
   */
  public static async send(chatId: number, payload: PostPayload): Promise<SendPostResult> {
    try {
      // 1. Resolve Reply Target (replyToLatest takes precedence over static replyToMessageId)
      let replyToMessageId: number | undefined = undefined;
      if (payload.replyToLatest) {
        const resolvedLatestId = db.getLatestEligibleMessageId(chatId);
        if (resolvedLatestId !== undefined && resolvedLatestId > 0) {
          replyToMessageId = resolvedLatestId;
        }
      } else if (payload.replyToMessageId && payload.replyToMessageId > 0) {
        replyToMessageId = payload.replyToMessageId;
      }

      // 2. Build Send Options
      const options: any = {};
      if (replyToMessageId !== undefined) {
        options.reply_to_message_id = replyToMessageId;
      }
      if (payload.protectContent) {
        options.protect_content = true;
      }

      const sanitizedKeyboard = sanitizeInlineButtons(payload.buttons);
      if (sanitizedKeyboard) {
        options.reply_markup = { inline_keyboard: sanitizedKeyboard };
      }

      const textContent = payload.text || '';
      const contentType = payload.contentType || 'text';
      let mediaFileId: string | undefined = payload.mediaFileId;

      if (contentType !== 'text') {
        const mediaCheck = validateMediaReference(payload.mediaFileId);
        if (!mediaCheck.valid) {
          return {
            ok: false,
            chatId,
            error: mediaCheck.error || `Invalid media reference for ${contentType} post.`
          };
        }
        mediaFileId = mediaCheck.normalized;
      }

      let sendRes: any;

      // 3. Dispatch to Telegram based on contentType via TelegramApi
      if (contentType === 'photo' && mediaFileId) {
        sendRes = await telegramApi.sendPhoto(chatId, mediaFileId, {
          caption: textContent,
          parse_mode: 'HTML',
          ...options
        });
      } else if (contentType === 'video' && mediaFileId) {
        sendRes = await telegramApi.sendVideo(chatId, mediaFileId, {
          caption: textContent,
          parse_mode: 'HTML',
          ...options
        });
      } else if (contentType === 'document' && mediaFileId) {
        sendRes = await telegramApi.sendDocument(chatId, mediaFileId, {
          caption: textContent,
          parse_mode: 'HTML',
          ...options
        });
      } else if (contentType === 'animation' && mediaFileId) {
        sendRes = await telegramApi.sendAnimation(chatId, mediaFileId, {
          caption: textContent,
          parse_mode: 'HTML',
          ...options
        });
      } else if (contentType === 'sticker' && mediaFileId) {
        sendRes = await telegramApi.sendSticker(chatId, mediaFileId, options);
      } else {
        sendRes = await telegramApi.sendMessage(chatId, textContent, {
          parse_mode: 'HTML',
          ...options
        });
      }

      if (!sendRes || !sendRes.ok || !sendRes.result) {
        const errorMsg = sendRes?.description || 'Telegram send failed';
        return {
          ok: false,
          chatId,
          error: errorMsg
        };
      }

      const newSentMessageId = sendRes.result.message_id;
      let pinSuccess: boolean | undefined = undefined;

      // 4. Pin newly sent message if requested
      if (payload.pinAfterSend && newSentMessageId) {
        try {
          const botCheck = await TelegramMiddleware.requireBotPermission(chatId, 'can_pin_messages');
          if (botCheck.allowed) {
            const pinRes = await telegramApi.pinChatMessage(chatId, newSentMessageId, true);
            if (pinRes.ok) {
              pinSuccess = true;
            } else {
              pinSuccess = false;
              console.error(`[POST_SENDER_PIN_WARNING] Pin failed for message ${newSentMessageId} in chat ${chatId}: ${pinRes.description}`);
              errorTracker.recordError({
                source: 'TELEGRAM',
                severity: 'WARN',
                message: `Pin failed for message ${newSentMessageId} in chat ${chatId}: ${pinRes.description}`,
                chatId
              });
            }
          } else {
            pinSuccess = false;
            console.warn(`[POST_SENDER_PIN_SKIPPED] Bot lacks pin permissions in chat ${chatId}: ${botCheck.reason}`);
            errorTracker.recordError({
              source: 'TELEGRAM',
              severity: 'WARN',
              message: `Bot lacks pin permission in chat ${chatId}: ${botCheck.reason}`,
              chatId
            });
          }
        } catch (pinErr: any) {
          pinSuccess = false;
          console.error(`[POST_SENDER_PIN_ERROR] Exception pinning message ${newSentMessageId} in chat ${chatId}: ${pinErr?.message || pinErr}`);
          errorTracker.recordError({
            source: 'TELEGRAM',
            severity: 'WARN',
            message: `Exception pinning message ${newSentMessageId} in chat ${chatId}: ${pinErr?.message || pinErr}`,
            chatId
          });
        }
      }

      return {
        ok: true,
        messageId: newSentMessageId,
        chatId,
        pinSuccess,
        result: sendRes.result
      };
    } catch (err: any) {
      return {
        ok: false,
        chatId,
        error: err?.message || String(err)
      };
    }
  }
}
