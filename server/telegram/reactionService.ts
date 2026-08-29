import { telegramApi } from './api.js';
import { TelegramMessage } from './types.js';
import { db } from '../db/storage.js';

export const REACTION_POOLS = {
  FUNNY: ['😂', '🤣', '😭', '💀', '🤭'],
  HAPPY: ['❤️', '🥰', '😍', '🎉', '🥳', '✨'],
  APPROVAL: ['👍', '👌', '👏', '🙌', '💯'],
  SAD_COMFORT: ['❤️', '🥺', '😔', '🫂', '😢'],
  SURPRISE: ['😮', '😳', '🤯', '👀'],
  THINKING: ['🤔', '🧐'],
  ANGRY: ['😡', '😤', '🤬'],
  ROASTING_TEASING: ['😂', '🤣', '💀', '😏', '🙄'],
  CUTE: ['🥹', '🥰', '❤️', '🫶', '✨'],
  LOVE_ROMANTIC: ['❤️', '🥰', '😍', '💕', '🫶'],
  PLAYFUL: ['😏', '😂', '🤭', '😜'],
  CONFUSED: ['🤨', '😐', '🤔']
} as const;

export type ReactionCategory = keyof typeof REACTION_POOLS;

export class ReactionService {
  // Deduplication cache: `${chatId}_${messageId}` -> boolean
  private static processedReactionKeys: Set<string> = new Set();
  
  // Recent reaction cache per chat: chatId -> string[] (emojis)
  private static chatRecentReactions: Map<number, string[]> = new Map();

  // Maximum size for caches
  private static MAX_CACHE_KEYS = 2000;
  private static MAX_RECENT_PER_CHAT = 8;

  /**
   * Determine the reaction category based on message content, stickers, captions, or mood.
   */
  public static classifyReactionCategory(message: TelegramMessage): ReactionCategory | null {
    // 1. Guard against commands
    const textOrCaption = (message.text || message.caption || '').trim();
    if (textOrCaption.startsWith('/') || textOrCaption.startsWith('!')) {
      return null;
    }

    // 2. If incoming message is a sticker, classify by sticker emoji
    if (message.sticker) {
      const stickerEmoji = message.sticker.emoji || '';
      if (stickerEmoji) {
        if (/😂|🤣|💀|🤭|😹/.test(stickerEmoji)) return 'FUNNY';
        if (/❤️|🥰|😍|😘|💕|💖|💗|💓/.test(stickerEmoji)) return 'LOVE_ROMANTIC';
        if (/🥺|😭|😢|😿|💔|😔|😞/.test(stickerEmoji)) return 'SAD_COMFORT';
        if (/😮|😳|🤯|👀|😱/.test(stickerEmoji)) return 'SURPRISE';
        if (/😡|🤬|😤|👿|💢/.test(stickerEmoji)) return 'ANGRY';
        if (/🤔|🧐/.test(stickerEmoji)) return 'THINKING';
        if (/🤨|😐|😶/.test(stickerEmoji)) return 'CONFUSED';
        if (/😏|😜|😝|🤪/.test(stickerEmoji)) return 'PLAYFUL';
        if (/🎉|🥳|🎊|🎈/.test(stickerEmoji)) return 'HAPPY';
        if (/👍|👌|👏|🙌|💯|🔥|💪/.test(stickerEmoji)) return 'APPROVAL';
        if (/🥹|✨|🌸|🐶|🐱|🐰|🐻|🐼|🫶/.test(stickerEmoji)) return 'CUTE';
      }
      return 'CUTE';
    }

    if (!textOrCaption) {
      // Photo/Video/Doc without caption - can occasionally get approval or null
      return 'APPROVAL';
    }

    const lower = textOrCaption.toLowerCase();

    // 3. Content-aware text analysis

    // Funny / Laughing / Roasting
    if (
      /😂|🤣|💀|🤭/.test(textOrCaption) ||
      /\b(lol|lmao|rofl|kya bakchodi|haste|haso|joke|jokes|chutkula|comedy|funny|meme)\b/i.test(lower) ||
      lower.includes('haha') ||
      lower.includes('hehe')
    ) {
      if (/\b(roast|noob|chomu|bot|chal nikal|aukat|chapri|kiddo)\b/i.test(lower) || /😏|🙄/.test(textOrCaption)) {
        return 'ROASTING_TEASING';
      }
      return 'FUNNY';
    }

    // Surprise / Shock
    if (
      /😮|😳|🤯|👀|😱/.test(textOrCaption) ||
      /\b(omg|whattt|what the|wtf|kya hua|shock|sachi|unbelievable|are you serious|wait what|damn)\b/i.test(lower)
    ) {
      return 'SURPRISE';
    }

    // Sad / Distress / Comfort
    if (
      /🥺|😭|😢|💔|😔|😞|😿/.test(textOrCaption) ||
      /\b(sad|bura lag|dard|crying|upset|depression|breakup|heartbreak|mood kharab|pareshaan|tension|rona|chinta|dukh|hurt|cry)\b/i.test(lower)
    ) {
      return 'SAD_COMFORT';
    }

    // Love / Romantic
    if (
      /❤️|🥰|😍|💕|🫶|😘|💖|💗/.test(textOrCaption) ||
      /\b(love you|i love you|pyaar|mohabbat|dil|kiss|muah|miss you|jaan|babu|shona|marry me|date pe|romantic)\b/i.test(lower)
    ) {
      return 'LOVE_ROMANTIC';
    }

    // Cute / Wholesome / Gratitude
    if (
      /🥹|✨|🌸/.test(textOrCaption) ||
      /\b(cute|aww|sweet|thank you|thanks|shukriya|dhanyawad|wholesome|pyara|pyari|so sweet)\b/i.test(lower)
    ) {
      return 'CUTE';
    }

    // Happy / Celebratory
    if (
      /🎉|🥳|🎊|🎈/.test(textOrCaption) ||
      /\b(congrats|congratulations|badhai|party|mubarak|hurray|yay|jeeta|pass ho gaya|promotion|celebrate|happy)\b/i.test(lower)
    ) {
      return 'HAPPY';
    }

    // Angry / Frustrated
    if (
      /😡|🤬|😤|💢/.test(textOrCaption) ||
      /\b(gussa|bakwas|chup|shutup|shut up|hate|irritate|irritating|pagal hai kya|fuming|angry)\b/i.test(lower)
    ) {
      return 'ANGRY';
    }

    // Roasting / Teasing
    if (
      /😏|🙄|😒/.test(textOrCaption) ||
      /\b(roast|noob|chomu|bot|chal nikal|aukat|jaldi bol|chapri|kiddo)\b/i.test(lower)
    ) {
      return 'ROASTING_TEASING';
    }

    // Thinking / Philosophical / Inquisitive
    if (
      /🤔|🧐/.test(textOrCaption) ||
      /\b(kyun|why|kaise|how|kya lagta hai|soch|deep|logic|theory|idea|thinking|ponder|wonder)\b/i.test(lower)
    ) {
      return 'THINKING';
    }

    // Confused / Skeptical
    if (
      /🤨|😐|😶/.test(textOrCaption) ||
      /\b(kya matlab|samajh nahi|confused|sus|suspicious|weird|ajab|ajeeb)\b/i.test(lower)
    ) {
      return 'CONFUSED';
    }

    // Playful
    if (
      /😜|😝|🤪/.test(textOrCaption) ||
      /\b(masti|prank|khel|chhed|tease|timepass|playful)\b/i.test(lower)
    ) {
      return 'PLAYFUL';
    }

    // Approval / Agreement / Compliments
    if (
      /👍|👌|👏|🙌|💯|🔥|💪/.test(textOrCaption) ||
      /\b(sahi hai|great|good job|shabash|done|ok|theek hai|perfect|agree|nice|superb|badiya|mast|wah|good|cool|awesome|legend)\b/i.test(lower)
    ) {
      return 'APPROVAL';
    }

    // Neutral / General
    return 'APPROVAL';
  }

  /**
   * Select a reaction emoji from a category pool while minimizing repetition.
   */
  public static selectReactionEmoji(chatId: number, category: ReactionCategory): string {
    const pool = REACTION_POOLS[category] || REACTION_POOLS.APPROVAL;
    const recent = this.chatRecentReactions.get(chatId) || [];

    // Filter out emojis that were used recently in this chat if alternatives exist
    const filteredPool = pool.filter((emoji) => !recent.slice(-3).includes(emoji));
    const candidatePool = filteredPool.length > 0 ? filteredPool : pool;

    const selected = candidatePool[Math.floor(Math.random() * candidatePool.length)];

    // Update recent cache
    const updatedRecent = [...recent, selected];
    if (updatedRecent.length > this.MAX_RECENT_PER_CHAT) {
      updatedRecent.shift();
    }
    this.chatRecentReactions.set(chatId, updatedRecent);

    return selected;
  }

  /**
   * Process and potentially dispatch a smart Telegram reaction for an incoming message.
   */
  public static async handleMessageReaction(message: TelegramMessage): Promise<boolean> {
    if (!message || !message.chat || !message.message_id) {
      return false;
    }

    const chatId = message.chat.id;
    const messageId = message.message_id;
    const dedupKey = `${chatId}_${messageId}`;

    // 1. Guard against duplicate updates for the same message
    if (this.processedReactionKeys.has(dedupKey)) {
      console.log('REACTION_SKIPPED', { chatId, messageId, reason: 'Duplicate message ID' });
      return false;
    }

    // Mark as processed immediately
    this.processedReactionKeys.add(dedupKey);
    if (this.processedReactionKeys.size > this.MAX_CACHE_KEYS) {
      const first = this.processedReactionKeys.values().next().value;
      if (first) this.processedReactionKeys.delete(first);
    }

    // 2. Guard against commands
    const textOrCaption = (message.text || message.caption || '').trim();
    const isCommand = textOrCaption.startsWith('/') || textOrCaption.startsWith('!');
    if (isCommand) {
      console.log('REACTION_SKIPPED', { chatId, messageId, reason: 'Command message' });
      return false;
    }

    // 3. Check group / DM configuration
    const isPrivate = message.chat.type === 'private';
    const settings = db.getGroupSettings(chatId, message.chat.title);
    
    // Group reaction toggle check (defaults to true)
    const isReactionEnabled = isPrivate ? true : (settings.reactionEnabled !== false);
    if (!isReactionEnabled) {
      console.log('REACTION_SKIPPED', { chatId, messageId, reason: 'Reactions disabled in chat settings' });
      return false;
    }

    console.log('REACTION_CHECKED', { chatId, messageId, isCommand: false, hasContent: Boolean(textOrCaption || message.sticker) });

    // 4. Configurable reaction probability (default 15% / 0.15)
    const probability = isPrivate ? 0.30 : (settings.reactionProbability ?? 0.15);
    const diceRoll = Math.random();
    if (diceRoll > probability) {
      console.log('REACTION_SKIPPED', { chatId, messageId, reason: `Probability roll ${diceRoll.toFixed(3)} > ${probability}` });
      return false;
    }

    // 5. Content-aware categorization
    const category = this.classifyReactionCategory(message);
    if (!category) {
      console.log('REACTION_SKIPPED', { chatId, messageId, reason: 'No matching category' });
      return false;
    }

    // 6. Select emoji with anti-repetition
    const selectedEmoji = this.selectReactionEmoji(chatId, category);
    console.log('REACTION_SELECTED', { chatId, messageId, mood: category, reaction: selectedEmoji, probability });

    // 7. Dispatch reaction to Telegram
    try {
      const res = await telegramApi.setMessageReaction(chatId, messageId, selectedEmoji);
      if (res && res.ok) {
        console.log('REACTION_SENT', { chatId, messageId, mood: category, reaction: selectedEmoji, ok: true });
        return true;
      } else {
        console.log('REACTION_FAILED', { chatId, messageId, reaction: selectedEmoji, error: res?.description || 'Telegram API returned not ok' });
        return false;
      }
    } catch (err: any) {
      console.log('REACTION_FAILED', { chatId, messageId, reaction: selectedEmoji, error: err.message });
      return false;
    }
  }

  /**
   * Helper to clear caches for testing
   */
  public static resetCaches() {
    this.processedReactionKeys.clear();
    this.chatRecentReactions.clear();
  }
}
