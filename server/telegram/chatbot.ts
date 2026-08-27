import { TelegramMessage, TelegramUser } from './types.js';
import { telegramApi } from './api.js';
import { db } from '../db/storage.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ConversationContext {
  messages: ChatMessage[];
  lastActivity: number;
}

export class ChatbotService {
  private static conversations: Map<string, ConversationContext> = new Map();
  private static userRateLimits: Map<string, { count: number; windowStart: number }> = new Map();
  private static recentResponseTracker: Map<string, number> = new Map();
  private static chatRandomCooldowns: Map<number, number> = new Map();
  private static recentStickers: Set<string> = new Set();

  private static TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout
  private static MAX_HISTORY = 12; // recent message history limit
  private static RATE_LIMIT_MAX = 15; // max requests per user per window
  private static RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
  private static RANDOM_CHAT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown for random chime-in
  private static RANDOM_CHAT_PROBABILITY = 0.03; // 3% chance
  private static STICKER_PROBABILITY = 0.15; // 15% chance to send occasional sticker

  // Curated sample sticker file_ids for different moods (fallback/sample)
  private static STICKERS_BY_MOOD: Record<string, string[]> = {
    cute: ['CAACAgIAAxkBAAI...cute1', 'CAACAgIAAxkBAAI...cute2'],
    playful: ['CAACAgIAAxkBAAI...playful1'],
    sarcastic: ['CAACAgIAAxkBAAI...sarcastic1'],
    caring: ['CAACAgIAAxkBAAI...caring1'],
    romantic: ['CAACAgIAAxkBAAI...romantic1'],
    default: ['CAACAgIAAxkBAAI...default1']
  };

  public static isTriggered(message: TelegramMessage, botUser: TelegramUser | null): boolean {
    const text = (message.text || message.caption || '').trim();
    if (!text) return false;

    // 1. Reply to bot message
    if (message.reply_to_message?.from && botUser) {
      if (message.reply_to_message.from.id === botUser.id) {
        return true;
      }
    }

    // 2. Mention "Roxie" or bot username case-insensitively
    const lowerText = text.toLowerCase();
    const botUsername = botUser?.username ? `@${botUser.username.toLowerCase()}` : '';
    if (lowerText.includes('roxie') || (botUsername && lowerText.includes(botUsername))) {
      return true;
    }

    return false;
  }

  public static async handleMessage(message: TelegramMessage, botUser: TelegramUser | null): Promise<boolean> {
    const chatId = message.chat?.id;
    if (!chatId) return false;

    // Check if chatbot is enabled for this group
    const settings = db.getGroupSettings(chatId);
    if (!settings.chatbotEnabled) {
      return false;
    }

    const isExplicitTrigger = this.isTriggered(message, botUser);

    if (!isExplicitTrigger) {
      // Check for Random Natural Chat trigger
      const now = Date.now();
      const lastRandom = this.chatRandomCooldowns.get(chatId) || 0;
      if (now - lastRandom > this.RANDOM_CHAT_COOLDOWN_MS) {
        if (Math.random() < this.RANDOM_CHAT_PROBABILITY) {
          // Trigger random natural chat
          this.chatRandomCooldowns.set(chatId, now);
          await this.handleRandomNaturalChat(message);
          return true;
        }
      }
      return false;
    }

    const userId = message.from?.id || 0;
    const userKey = `${chatId}_${userId}`;

    // Rate limiting check
    if (userId) {
      const now = Date.now();
      let record = this.userRateLimits.get(userKey);
      if (!record || now - record.windowStart > this.RATE_LIMIT_WINDOW_MS) {
        record = { count: 0, windowStart: now };
        this.userRateLimits.set(userKey, record);
      }
      if (record.count >= this.RATE_LIMIT_MAX) {
        await telegramApi.sendMessage(chatId, `⚠️ Arrey yaar! You've sent too many messages to Roxie right now. Please wait a few minutes before chatting again.`);
        return true;
      }
      record.count++;
    }

    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return false;
    }

    const model = process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat';
    const userText = message.text || message.caption || '';

    // 1. TYPING INDICATOR: show typing status immediately
    await telegramApi.sendChatAction(chatId, 'typing');

    // Get or initialize conversation memory
    const now = Date.now();
    let conv = this.conversations.get(userKey);
    if (!conv || now - conv.lastActivity > this.TIMEOUT_MS) {
      conv = {
        messages: [],
        lastActivity: now
      };
      this.conversations.set(userKey, conv);
    }
    conv.lastActivity = now;

    const systemPrompt = `You are Roxie, a fictional Indian girl who naturally communicates in Hindi, Hinglish, and English.
Personality: Dynamically adapt to the user's message tone (cute, playful, sarcastic, angry, caring, romantic, selfish, or arrogant when appropriate).
Guidelines:
- Do NOT use fixed or predefined replies.
- Keep responses short, natural, conversational, and Telegram-friendly (1-3 sentences max).
- Avoid repetitive phrases and robotic corporate responses.
- Never claim to be a real human or an AI model — stay in character as Roxie.
- Use natural Hinglish mix when fitting (e.g. "Arrey yaar", "Achaa", "Samjha karo", "Pakka?").`;

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...conv.messages,
      { role: 'user', content: userText }
    ];

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://ai.studio',
          'X-Title': 'Roxie Telegram Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: apiMessages,
          max_tokens: 300,
          temperature: 0.8
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('OpenRouter API error:', response.status, errText);
        return false;
      }

      const data = await response.json();
      const replyContent = data.choices?.[0]?.message?.content?.trim();

      if (!replyContent) {
        return false;
      }

      // Duplicate response prevention check (within 10s)
      const dupKey = `${chatId}_${replyContent}`;
      const lastSentTime = this.recentResponseTracker.get(dupKey) || 0;
      if (now - lastSentTime < 10000) {
        return false;
      }
      this.recentResponseTracker.set(dupKey, now);

      // 2. OCCASIONAL STICKER / GIF: occasionally send a sticker along with or instead of text
      let sentSticker = false;
      if (Math.random() < this.STICKER_PROBABILITY) {
        const mood = this.inferMood(replyContent);
        const stickerId = this.selectSticker(mood);
        if (stickerId) {
          const stickerRes = await telegramApi.sendSticker(chatId, stickerId, {
            reply_to_message_id: message.message_id
          });
          if (stickerRes.ok) {
            sentSticker = true;
          }
        }
      }

      await telegramApi.sendMessage(chatId, replyContent, { reply_to_message_id: message.message_id });

      conv.messages.push({ role: 'user', content: userText });
      conv.messages.push({ role: 'assistant', content: replyContent });

      if (conv.messages.length > this.MAX_HISTORY * 2) {
        conv.messages = conv.messages.slice(-this.MAX_HISTORY * 2);
      }

      return true;
    } catch (err: any) {
      console.error('Error calling OpenRouter API:', err);
      return false;
    }
  }

  private static async handleRandomNaturalChat(message: TelegramMessage) {
    const chatId = message.chat.id;
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return;

    const model = process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat';
    const userText = message.text || message.caption || '';
    if (!userText) return;

    // 1. TYPING INDICATOR
    await telegramApi.sendChatAction(chatId, 'typing');

    const systemPrompt = `You are Roxie, a fictional Indian girl in a Telegram group chat. Users are chatting normally.
Chime in casually with a short, natural, relevant comment (1 sentence) in Hindi/Hinglish/English reacting to the user's message.
If you have nothing interesting or natural to add, reply with exactly the single word: SKIP`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://ai.studio',
          'X-Title': 'Roxie Telegram Bot',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userText }
          ],
          max_tokens: 150,
          temperature: 0.8
        })
      });

      if (!response.ok) return;

      const data = await response.json();
      const replyContent = data.choices?.[0]?.message?.content?.trim();

      if (!replyContent || replyContent === 'SKIP' || replyContent.toUpperCase() === 'SKIP.') {
        return;
      }

      const now = Date.now();
      const dupKey = `${chatId}_${replyContent}`;
      const lastSentTime = this.recentResponseTracker.get(dupKey) || 0;
      if (now - lastSentTime < 30000) {
        return;
      }
      this.recentResponseTracker.set(dupKey, now);

      await telegramApi.sendMessage(chatId, replyContent);
    } catch (err) {
      console.error('Error in random natural chat:', err);
    }
  }

  private static inferMood(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('❤️') || lower.includes('love') || lower.includes('jaan') || lower.includes('sweet')) return 'romantic';
    if (lower.includes('😡') || lower.includes('angry') || lower.includes('pagal') || lower.includes('dimag')) return 'angry';
    if (lower.includes('😂') || lower.includes('haha') || lower.includes('funny') || lower.includes('majaak')) return 'playful';
    if (lower.includes('🙄') || lower.includes('seriously') || lower.includes('duh') || lower.includes('bas')) return 'sarcastic';
    if (lower.includes('aww') || lower.includes('cute') || lower.includes('sweet')) return 'cute';
    return 'default';
  }

  private static selectSticker(mood: string): string | null {
    const pool = this.STICKERS_BY_MOOD[mood] || this.STICKERS_BY_MOOD.default;
    const available = pool.filter(id => !this.recentStickers.has(id));
    const targetPool = available.length > 0 ? available : pool;
    if (targetPool.length === 0) return null;
    const selected = targetPool[Math.floor(Math.random() * targetPool.length)];
    this.recentStickers.add(selected);
    if (this.recentStickers.size > 10) {
      const first = this.recentStickers.values().next().value;
      if (first) this.recentStickers.delete(first);
    }
    return selected;
  }

  public static cleanupInactive() {
    const now = Date.now();
    for (const [key, conv] of this.conversations.entries()) {
      if (now - conv.lastActivity > this.TIMEOUT_MS) {
        this.conversations.delete(key);
      }
    }
  }

  public static reset() {
    this.conversations.clear();
    this.userRateLimits.clear();
    this.recentResponseTracker.clear();
    this.chatRandomCooldowns.clear();
    this.recentStickers.clear();
  }

  public static getConversationsCount(): number {
    return this.conversations.size;
  }
}
