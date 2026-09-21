import { db } from '../db/storage.js';
import { TelegramMessage, ContentType, PolicyDecision } from './types.js';
import { TelegramMiddleware, RoleRank } from './middleware.js';
import { ContentProtectionService } from './contentProtection.js';
import { ChatbotService } from './chatbot.js';

export interface ContentPolicyEvaluation {
  decision: PolicyDecision;
  lockType?: string;
  reason?: string;
}

export class ContentPolicyEngine {
  /**
   * Evaluates whether a given message from a user in a chat is allowed or must be blocked/deleted.
   */
  public static async evaluateMessage(
    message: TelegramMessage,
    chatId: number,
    userId: number
  ): Promise<ContentPolicyEvaluation> {
    // Roxie bot itself and self messages always bypass locks
    const botId = db.getCurrentBotId();
    if ((userId && botId && userId === botId) || ChatbotService.isRoxieSelfMessage(message, null)) {
      return { decision: 'ADMIN_BYPASS' };
    }

    // Check Actor Hierarchy (Admins / Owners bypass locks)
    const ctx = {
      message,
      chatId,
      chatTitle: message.chat.title || 'Chat',
      sender: message.from || { id: userId, is_bot: false, first_name: 'User' },
      isAnonymousAdmin: Boolean(message.sender_chat && message.sender_chat.id === chatId),
      adminDisplayName: message.from?.first_name || 'User',
      args: [],
      command: ''
    };
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank >= RoleRank.MODERATOR) {
      return { decision: 'ADMIN_BYPASS' };
    }

    // Check Approved / Trusted User Status
    if (db.isUserApproved(chatId, userId)) {
      return { decision: 'EXEMPT', reason: 'approved_user' };
    }

    const settings = db.getGroupSettings(chatId);
    const locks = settings.locks || {};
    const textToCheck = `${message.text || ''} ${message.caption || ''}`.trim();

    // 0. Phase 9A: Smart Content Protection (Spam, Abusive Language, Promotion)
    if (settings.stopSpamEnabled && ContentProtectionService.isSpam(message, chatId)) {
      return { decision: 'BLOCK', lockType: 'spam', reason: 'Spam protection triggered' };
    }

    if (settings.stopAbusiveEnabled && textToCheck && ContentProtectionService.isAbusive(textToCheck, chatId)) {
      return { decision: 'BLOCK', lockType: 'abusive', reason: 'Abusive language detected' };
    }

    if (settings.stopPromotionEnabled && textToCheck && ContentProtectionService.isPromotion(message, chatId)) {
      return { decision: 'BLOCK', lockType: 'promotion', reason: 'Promotion/advertisement detected' };
    }

    // 1. Lock "all" (Chat lockdown)
    if (locks['all'] && !db.hasContentPermission(chatId, userId, 'all')) {
      return { decision: 'BLOCK', lockType: 'all', reason: 'Lock all is active' };
    }

    // 2. Stickers
    if (message.sticker) {
      const isLocked = Boolean(locks['stickers'] || locks['sticker'] || settings.stickerProtection === true);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'stickers')) {
        return { decision: 'BLOCK', lockType: 'stickers', reason: 'Stickers are locked' };
      }
    }

    // 3. GIFs / Animations
    if (message.animation) {
      const isLocked = Boolean(locks['gifs'] || locks['gif'] || settings.gifProtection || settings.gifsProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'gifs') && !db.hasContentPermission(chatId, userId, 'media')) {
        return { decision: 'BLOCK', lockType: 'gifs', reason: 'GIFs are locked' };
      }
    }

    // 4. Photos
    if (message.photo && message.photo.length > 0) {
      const isLocked = Boolean(locks['photos'] || locks['photo'] || locks['images'] || locks['image'] || settings.imageProtection || settings.photosProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'photos') && !db.hasContentPermission(chatId, userId, 'media')) {
        return { decision: 'BLOCK', lockType: 'photos', reason: 'Photos are locked' };
      }
    }

    // 5. Videos & Video Notes
    if (message.video || message.video_note) {
      const isLocked = Boolean(locks['videos'] || locks['video'] || settings.videosProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'videos') && !db.hasContentPermission(chatId, userId, 'media')) {
        return { decision: 'BLOCK', lockType: 'videos', reason: 'Videos are locked' };
      }
    }

    // 6. Voice Notes
    if (message.voice) {
      const isLocked = Boolean(locks['voice'] || settings.voiceProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'voice') && !db.hasContentPermission(chatId, userId, 'media')) {
        return { decision: 'BLOCK', lockType: 'voice', reason: 'Voice messages are locked' };
      }
    }

    // 7. Audio / Music
    if (message.audio) {
      const isLocked = Boolean(locks['audio'] || settings.audioProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'audio') && !db.hasContentPermission(chatId, userId, 'media')) {
        return { decision: 'BLOCK', lockType: 'audio', reason: 'Audio files are locked' };
      }
    }

    // 8. Documents / Files
    if (message.document && !message.animation) {
      const isLocked = Boolean(locks['files'] || locks['file'] || locks['documents'] || locks['document'] || settings.fileProtection);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'files')) {
        return { decision: 'BLOCK', lockType: 'files', reason: 'Files/Documents are locked' };
      }
    }

    // 9. Contacts
    if (message.contact) {
      const isLocked = Boolean(locks['contacts'] || locks['contact']);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'contacts', reason: 'Contacts sharing is locked' };
      }
    }

    // 10. Locations
    if (message.location || message.venue) {
      const isLocked = Boolean(locks['locations'] || locks['location']);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'locations', reason: 'Location sharing is locked' };
      }
    }

    // 11. Polls
    if (message.poll) {
      const isLocked = Boolean(locks['polls'] || locks['poll']);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'polls', reason: 'Polls are locked' };
      }
    }

    // 12. Forwards
    if (message.forward_date || message.forward_from || message.forward_from_chat || message.forward_sender_name) {
      const isLocked = Boolean(locks['forwards'] || locks['forward']);
      if (isLocked && !db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'forwards', reason: 'Forwarded messages are locked' };
      }
    }

    // 13. Inline Buttons / Games
    if (message.reply_markup && (locks['buttons'] || locks['button'])) {
      if (!db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'buttons', reason: 'Messages with buttons are locked' };
      }
    }

    // 14. Commands Lock (blocks non-admins from running / commands if commands are locked)
    if (message.text && message.text.startsWith('/') && (locks['commands'] || locks['command'])) {
      if (!db.hasContentPermission(chatId, userId, 'all')) {
        return { decision: 'BLOCK', lockType: 'commands', reason: 'Commands are locked' };
      }
    }

    // 15. Links & Invite Links
    if (textToCheck) {
      const hasInviteLink = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:joinchat\/|\+[a-zA-Z0-9_-]+|[a-zA-Z0-9_]{4,})/i.test(textToCheck);
      const isInviteLocked = Boolean(locks['invitelinks'] || locks['invitelink'] || locks['invites']);
      if (hasInviteLink && isInviteLocked && !db.hasContentPermission(chatId, userId, 'links')) {
        return { decision: 'BLOCK', lockType: 'invitelinks', reason: 'Telegram invite links are locked' };
      }

      const hasGeneralLink = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi.test(textToCheck);
      const isLinkLocked = Boolean(locks['links'] || locks['link']);
      if (hasGeneralLink && isLinkLocked) {
        if (!db.hasContentPermission(chatId, userId, 'links')) {
          // Check whitelist
          const whitelist = settings.linksWhitelist || [];
          const matchedUrls = textToCheck.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi) || [];
          let allWhitelisted = matchedUrls.length > 0;
          for (const url of matchedUrls) {
            const domain = url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim();
            const allowed = whitelist.some((w) => domain === w || domain.endsWith(`.${w}`));
            if (!allowed) {
              allWhitelisted = false;
              break;
            }
          }
          if (!allWhitelisted) {
            return { decision: 'BLOCK', lockType: 'links', reason: 'Links are locked' };
          }
        }
      }
    }

    return { decision: 'ALLOW' };
  }
}
