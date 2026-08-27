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

  private static TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout
  private static MAX_HISTORY = 12; // recent message history limit
  private static RATE_LIMIT_MAX = 15; // max requests per user per window
  private static RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

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

    // Check if triggered
    if (!this.isTriggered(message, botUser)) {
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
      // API key not configured
      return false;
    }

    const model = process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat';
    const userText = message.text || message.caption || '';

    // Get or initialize conversation memory for this user in this group (strict group + user isolation)
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

    // System prompt embodying Roxie's personality
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
  }

  public static getConversationsCount(): number {
    return this.conversations.size;
  }
}
