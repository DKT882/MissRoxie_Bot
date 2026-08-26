import { TelegramMessage } from './types.js';
import { db } from '../db/storage.js';

export class ContentProtectionService {
  /**
   * Normalize text safely to handle uppercase/lowercase, extra spaces, common punctuation, and obfuscation.
   */
  public static normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      // Normalize leetspeak / character obfuscation
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/7/g, 't')
      .replace(/@/g, 'a')
      .replace(/\$/g, 's')
      .replace(/!/g, 'i')
      // Remove punctuation and excess whitespace
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if text contains abusive language supporting English, Hindi, Hinglish, Unicode, and custom group words.
   */
  public static isAbusive(text: string, chatId: number): boolean {
    if (!text) return false;
    const normalized = this.normalizeText(text);
    const rawLower = text.toLowerCase();

    // 1. Check group-specific custom abusive words
    const customWords = db.getCustomAbusiveWords(chatId);
    for (const word of customWords) {
      const normWord = this.normalizeText(word);
      if (normWord && (normalized.includes(normWord) || rawLower.includes(word.toLowerCase()))) {
        return true;
      }
    }

    // 2. Built-in multilingual abusive patterns (English, Hindi, Hinglish)
    const abusivePatterns = [
      /\b(fuck|shit|bitch|cunt|bastard|asshole|dick|piss|slut|whore|motherfucker|cock)\b/i,
      /\b(madarchod|bhenchod|bhosdike|gandu|chutiya|harami|kamine|gaand|lund|chut|bhadwa|raand)\b/i,
      /मादरचोद|भेंचोद|भोसड़ीके|गांडू|चुतिया|हरामी|कमीने|गांड|लुंड|चूत|भड़वा|रंड/i
    ];

    for (const pattern of abusivePatterns) {
      if (pattern.test(text) || pattern.test(normalized) || pattern.test(rawLower)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message constitutes spam (flooding, repeated identical content, high frequency).
   */
  public static isSpam(message: TelegramMessage, chatId: number): boolean {
    if (!message.from || !chatId) return false;
    const userId = message.from.id;
    const recentMsgs = db.getMessagesByUser ? db.getMessagesByUser(chatId, userId, 15) : [];
    const now = Date.now() / 1000;

    // Check rate: 5+ messages in 10 seconds
    const last10s = recentMsgs.filter((m: any) => now - (m.date || 0) < 10);
    if (last10s.length >= 5) {
      return true;
    }

    // Check repeated identical text
    if (message.text && recentMsgs.length >= 2) {
      const txt = message.text.trim();
      const identicalCount = recentMsgs.filter((m: any) => m.text && m.text.trim() === txt).length;
      if (identicalCount >= 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if message contains promotion/advertisement using multi-signal detection.
   */
  public static isPromotion(message: TelegramMessage, chatId: number): boolean {
    const text = `${message.text || ''} ${message.caption || ''}`.trim();
    if (!text) return false;

    const settings = db.getGroupSettings(chatId);
    const whitelist = settings.linksWhitelist || [];
    const urls = text.match(/(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi) || [];

    let hasNonWhitelistedLink = false;
    if (urls.length > 0) {
      for (const url of urls) {
        const domain = url.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim();
        const allowed = whitelist.some((w) => domain === w || domain.endsWith(`.${w}`));
        if (!allowed) {
          hasNonWhitelistedLink = true;
          break;
        }
      }
    }

    const rawLower = text.toLowerCase();
    const hasInviteLink = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:joinchat\/|\+[a-zA-Z0-9_-]+|[a-zA-Z0-9_]{4,})/i.test(text);

    const promoSignals = [
      'buy now', 'earn money', 'dm me', 'join my channel', 'click here', 'subscribe now',
      'free nitro', 'crypto giveaway', 'invest now', 'passive income', 'make money online',
      'telegram channel', 'join fast', 'limited offer', '100% profit', 'airdrop', 'earn $', 'earn rs'
    ];

    let promoScore = 0;
    if (hasInviteLink) promoScore += 3;
    if (hasNonWhitelistedLink) promoScore += 2;

    for (const signal of promoSignals) {
      if (rawLower.includes(signal)) {
        promoScore += 2;
      }
    }

    return promoScore >= 3;
  }
}
