import { TelegramMessage, GroupSettings, PromotionalSpamAnalysis } from './types.js';
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

  /**
   * Multi-signal promotional spam analyzer.
   * Evaluates forwarded status, Telegram table layouts, inline URL buttons,
   * multiple links, promotional calls to action, and adult advertising.
   */
  public static analyzePromotionalSpam(
    message: TelegramMessage,
    chatId?: number,
    settings?: Partial<GroupSettings>
  ): PromotionalSpamAnalysis {
    const reasons: string[] = [];
    let score = 0;

    // A. Forwarded Message Detection
    const isForwarded = Boolean(
      message.forward_from ||
      message.forward_from_chat ||
      message.forward_sender_name ||
      (message as any).forward_origin ||
      message.forward_date
    );

    // B. Text, Caption, and Entity Extraction
    const text = message.text || '';
    const caption = message.caption || '';
    const combinedText = `${text}\n${caption}`.trim();
    const rawLower = combinedText.toLowerCase();
    const allEntities = [...(message.entities || []), ...(message.caption_entities || [])];

    // C. Inline Keyboard Buttons Inspection
    const inlineKeyboard: any[][] = message.reply_markup?.inline_keyboard || [];
    let buttonCount = 0;
    const buttonTexts: string[] = [];
    const buttonUrls: string[] = [];

    if (Array.isArray(inlineKeyboard)) {
      for (const row of inlineKeyboard) {
        if (Array.isArray(row)) {
          for (const btn of row) {
            buttonCount++;
            if (btn.text) buttonTexts.push(String(btn.text));
            if (btn.url) buttonUrls.push(String(btn.url));
          }
        }
      }
    }

    const hasMultiRowButtons = inlineKeyboard.length >= 2 || (buttonCount >= 2 && inlineKeyboard.some((r) => r.length >= 2));

    // D. Safe URL Extraction and Normalization
    const extractedUrls = new Set<string>();

    // Entity URLs
    for (const ent of allEntities) {
      if (ent.type === 'url' && combinedText) {
        const urlStr = combinedText.substring(ent.offset, ent.offset + ent.length).trim();
        if (urlStr) extractedUrls.add(urlStr);
      } else if (ent.type === 'text_link' && ent.url) {
        extractedUrls.add(ent.url.trim());
      }
    }

    // Regex URLs from text
    const textUrlMatches = combinedText.match(
      /(?:https?:\/\/|ftp:\/\/|tg:\/\/|www\.)[^\s]+|\b(?:[a-zA-Z0-9-]+\.)+(?:com|net|org|io|me|xyz|top|club|vip|site|online|live|info|app|cc|ru|link|click|space|pw|pro|cam|tv|sex|xxx|porn|adult)\b(?:\/[^\s]*)?/gi
    ) || [];
    for (const u of textUrlMatches) {
      extractedUrls.add(u.trim());
    }

    // Button URLs
    for (const u of buttonUrls) {
      extractedUrls.add(u.trim());
    }

    const allUrls = Array.from(extractedUrls);
    const urlCount = allUrls.length;

    let telegramDestinationCount = 0;
    let externalDestinationCount = 0;
    for (const u of allUrls) {
      const lowerU = u.toLowerCase();
      if (
        lowerU.includes('t.me/') ||
        lowerU.includes('telegram.me/') ||
        lowerU.includes('telegram.dog/') ||
        lowerU.startsWith('tg://') ||
        lowerU.includes('joinchat')
      ) {
        telegramDestinationCount++;
      } else {
        externalDestinationCount++;
      }
    }

    // Also check for Telegram @mentions that act as channel/bot links
    const mentionEntities = allEntities.filter((e) => e.type === 'mention');
    telegramDestinationCount += mentionEntities.length;

    // E. Telegram-style Table Layout & Visual Grid Detection
    const tableIndicators: string[] = [];
    const boxDrawingRegex = /[┌┐└┘├┤┼═╔╗╚╝╠╣╦╩╬│─]/;
    const hasBoxChars = boxDrawingRegex.test(combinedText);

    // Multi-column row separators (e.g. lines with '|' or '│' separating columns)
    const lines = combinedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const tableSplitLines = lines.filter((l) => {
      const pipeCount = (l.match(/\|/g) || []).length;
      const boxPipeCount = (l.match(/│/g) || []).length;
      return pipeCount >= 1 || boxPipeCount >= 1;
    });

    const hasAsciiTableBorder = lines.some((l) => /^\+[-=+]+\+$/.test(l) || /^[-=_]{3,}$/.test(l));
    const hasPreOrCode = allEntities.some((e) => e.type === 'pre' || e.type === 'code');
    const hasBlockquote = allEntities.some((e) => (e.type as any) === 'blockquote' || (e.type as any) === 'expandable_blockquote');

    if (hasBoxChars) {
      tableIndicators.push('box_drawing_characters');
    }
    if (tableSplitLines.length >= 2) {
      tableIndicators.push(`multi_column_rows_${tableSplitLines.length}`);
    }
    if (hasAsciiTableBorder) {
      tableIndicators.push('ascii_table_borders');
    }
    if (hasPreOrCode && tableSplitLines.length >= 1) {
      tableIndicators.push('preformatted_table_block');
    }

    const hasTableFormatting = tableIndicators.length > 0;

    // F. Promotional Calls to Action (CTA) Detection
    const CTA_KEYWORDS = [
      'open now',
      'join club',
      'enter now',
      'get access',
      'explore',
      'tap here',
      'tap to enter',
      'click here',
      'click to enter',
      'join now',
      'access now',
      'watch now',
      'view now',
      'unlock now',
      'start bot',
      'join channel',
      'join group',
      'join vip',
      'free access',
      'vip access',
      'limited access',
      'enter here',
      'claim now'
    ];

    const callToActionMatches: string[] = [];
    const searchableTargets = [rawLower, ...buttonTexts.map((t) => t.toLowerCase())];

    for (const target of searchableTargets) {
      for (const cta of CTA_KEYWORDS) {
        if (target.includes(cta) && !callToActionMatches.includes(cta)) {
          callToActionMatches.push(cta);
        }
      }
    }

    const hasDirectionalIndicator = /[⤵️⬇️👇↘️↙️↗️⚡️🪽👉]/.test(combinedText) || buttonTexts.some((t) => /[⚡️🪽↗️👉]/.test(t));
    const hasCallToAction = callToActionMatches.length > 0;

    // G. Adult & Sexually Explicit Content Detection
    const ADULT_PATTERNS = [
      /\badult\s+mix\b/i,
      /\bxxx\s+archive\b/i,
      /\bxxx\b/i,
      /\bkiss\s+compilation\b/i,
      /\buncensored\b/i,
      /\bhot\s+(?:\d{4}\s+)?drop\b/i,
      /\bnew\s+(?:\d{4}\s+)?drop\b/i,
      /\bonly\s+for\s+you\b/i,
      /\b18\+\b/i,
      /\bporn\b/i,
      /\bleaks\b/i,
      /\bnsfw\b/i,
      /\berotic\b/i,
      /\bsexy\b/i,
      /\bnude\b/i,
      /\bsex\s+tape\b/i,
      /\bhardcore\b/i,
      /\bonlyfans\b/i,
      /\bdesi\s+mms\b/i,
      /\bbhabhi\b/i,
      /\bngắm\s+gái(?:\s+xinh)?\b/i,
      /\bgái\s+xinh\b/i,
      /\blộ\s+clip\b/i,
      /\bsex\s+video\b/i,
      /\bprivate\s+video\b/i
    ];

    const adultMatches: string[] = [];
    const allSearchableText = `${combinedText} ${buttonTexts.join(' ')}`;
    for (const pat of ADULT_PATTERNS) {
      const match = allSearchableText.match(pat);
      if (match) {
        adultMatches.push(match[0].toLowerCase());
      }
    }

    const hasAdultEmojis = /[🔞💦💋🥵🍑🍆👅👙]/.test(allSearchableText);
    const hasAdultContent = adultMatches.length > 0 || (hasAdultEmojis && (urlCount > 0 || buttonCount > 0));

    // H. Multi-Signal Combined Scoring
    const hasPromotionalContext = urlCount > 0 || buttonCount > 0 || hasCallToAction || hasAdultContent || hasTableFormatting;

    // 1. Forwarded status points (only counts if promotional context is present)
    if (isForwarded && hasPromotionalContext) {
      score += 2.5;
      reasons.push('forwarded_promotional_content (+2.5)');
    }

    // 2. Table / layout points
    if (hasTableFormatting) {
      score += 3.0;
      reasons.push(`table_layout_formatting [${tableIndicators.join(', ')}] (+3.0)`);
    }

    // 3. Button points
    if (buttonCount >= 6) {
      score += 4.5;
      reasons.push(`high_button_count_${buttonCount} (+4.5)`);
    } else if (buttonCount >= 3) {
      score += 3.0;
      reasons.push(`medium_button_count_${buttonCount} (+3.0)`);
    } else if (buttonCount >= 1) {
      score += 1.5;
      reasons.push(`inline_buttons_${buttonCount} (+1.5)`);
    }

    if (hasMultiRowButtons && buttonCount >= 2) {
      score += 1.5;
      reasons.push('multi_row_button_grid (+1.5)');
    }

    // 4. Calls to action points
    if (callToActionMatches.length >= 3) {
      score += 4.0;
      reasons.push(`repeated_calls_to_action [${callToActionMatches.slice(0, 4).join(', ')}] (+4.0)`);
    } else if (callToActionMatches.length >= 1) {
      score += 2.0;
      reasons.push(`call_to_action [${callToActionMatches.join(', ')}] (+2.0)`);
    }

    if (hasDirectionalIndicator && (hasCallToAction || buttonCount > 0)) {
      score += 1.0;
      reasons.push('directional_cta_indicators (+1.0)');
    }

    // 5. Multiple links & Telegram destinations
    if (urlCount >= 5) {
      score += 4.0;
      reasons.push(`heavy_url_count_${urlCount} (+4.0)`);
    } else if (urlCount >= 2) {
      score += 2.5;
      reasons.push(`multiple_urls_${urlCount} (+2.5)`);
    } else if (urlCount === 1 && (buttonCount > 0 || hasCallToAction || hasAdultContent)) {
      score += 1.0;
      reasons.push('promotional_destination_url (+1.0)');
    }

    if (telegramDestinationCount >= 2) {
      score += 2.0;
      reasons.push(`telegram_destinations_${telegramDestinationCount} (+2.0)`);
    } else if (telegramDestinationCount === 1 && (buttonCount > 0 || isForwarded)) {
      score += 1.0;
      reasons.push('telegram_channel_or_bot_link (+1.0)');
    }

    if (externalDestinationCount > 0 && telegramDestinationCount > 0) {
      score += 1.5;
      reasons.push('mixed_external_and_telegram_destinations (+1.5)');
    }

    // Link density check: many links/buttons with minimal normal conversation text (< 120 chars)
    if ((urlCount >= 2 || buttonCount >= 2) && lines.length <= 4 && combinedText.length < 120) {
      score += 1.5;
      reasons.push('high_link_density_low_conversation (+1.5)');
    }

    // 6. Adult content advertising points
    if (adultMatches.length >= 2) {
      score += 4.0;
      reasons.push(`adult_content_advertising [${adultMatches.slice(0, 3).join(', ')}] (+4.0)`);
    } else if (adultMatches.length === 1) {
      score += 2.0;
      reasons.push(`adult_keyword [${adultMatches[0]}] (+2.0)`);
    }

    if (hasAdultEmojis) {
      score += 1.5;
      reasons.push('adult_emojis (+1.5)');
    }

    if (hasAdultContent && (urlCount > 0 || buttonCount > 0)) {
      score += 2.0;
      reasons.push('adult_content_combined_with_links_or_buttons (+2.0)');
    }

    // Configurable threshold: default 6.0
    const threshold = settings?.promotionalSpamThreshold ?? 6.0;
    const isSpam = score >= threshold;

    return {
      isSpam,
      score,
      threshold,
      reasons,
      signals: {
        isForwarded,
        hasTableFormatting,
        buttonCount,
        urlCount,
        telegramDestinationCount,
        hasCallToAction,
        hasAdultContent,
        callToActionMatches,
        adultMatches,
        tableIndicators
      }
    };
  }
}
