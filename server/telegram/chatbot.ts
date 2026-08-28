import { TelegramMessage, TelegramUser } from './types.js';
import { telegramApi } from './api.js';
import { db, isSensitiveData } from '../db/storage.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';

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
  private static STICKER_PROBABILITY = 0.15; // 15% chance to send occasional sticker or GIF
  private static processedMessageKeys: Set<string> = new Set();
  private static activeProcessingKeys: Set<string> = new Set();

  public static reset() {
    this.conversations.clear();
    this.userRateLimits.clear();
    this.recentResponseTracker.clear();
    this.chatRandomCooldowns.clear();
    this.recentStickers.clear();
    this.recentAnimations.clear();
    this.processedMessageKeys.clear();
    this.activeProcessingKeys.clear();
  }

  public static clearConversation(chatId: number | string): boolean {
    const key = String(chatId);
    const existed = this.conversations.has(key);
    this.conversations.delete(key);
    return existed;
  }

  private static isValidFileId(id: string | null | undefined): boolean {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed) return false;
    const lower = trimmed.toLowerCase();
    if (lower === 'placeholder' || lower === 'dummy' || lower === 'test_placeholder' || lower.includes('placeholder')) {
      return false;
    }
    return true;
  }

  // Production-ready dynamic configuration methods for Telegram sticker & animation file_ids using persistent database storage
  private static getStickersByMood(): Record<string, string[]> {
    const stickers: Record<string, string[]> = {};
    const dbLib = db.getMediaLibrary();
    if (dbLib && dbLib.stickers) {
      for (const [mood, list] of Object.entries(dbLib.stickers)) {
        if (Array.isArray(list) && list.length > 0) {
          stickers[mood.toLowerCase()] = [...list];
        }
      }
    }
    if (process.env.TELEGRAM_STICKERS_JSON) {
      try {
        const parsed = JSON.parse(process.env.TELEGRAM_STICKERS_JSON);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [m, val] of Object.entries(parsed)) {
            const moodKey = m.toLowerCase();
            if (!stickers[moodKey] || stickers[moodKey].length === 0) {
              if (Array.isArray(val)) stickers[moodKey] = val as string[];
            }
          }
        }
      } catch (e) {}
    }
    const moods = ['normal', 'cute', 'flirty', 'romantic', 'teasing', 'angry', 'playful', 'sarcastic', 'default', 'teasing/roasting'];
    for (const mood of moods) {
      const sanitized = mood.toUpperCase().replace('/', '_');
      const val = process.env[`TELEGRAM_STICKER_${sanitized}`] || process.env[`TELEGRAM_STICKERS_${sanitized}`];
      if (val && (!stickers[mood] || stickers[mood].length === 0)) {
        stickers[mood] = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return stickers;
  }

  private static getAnimationsByMood(): Record<string, string[]> {
    const animations: Record<string, string[]> = {};
    const dbLib = db.getMediaLibrary();
    if (dbLib && dbLib.animations) {
      for (const [mood, list] of Object.entries(dbLib.animations)) {
        if (Array.isArray(list) && list.length > 0) {
          animations[mood.toLowerCase()] = [...list];
        }
      }
    }
    if (process.env.TELEGRAM_ANIMATIONS_JSON) {
      try {
        const parsed = JSON.parse(process.env.TELEGRAM_ANIMATIONS_JSON);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [m, val] of Object.entries(parsed)) {
            const moodKey = m.toLowerCase();
            if (!animations[moodKey] || animations[moodKey].length === 0) {
              if (Array.isArray(val)) animations[moodKey] = val as string[];
            }
          }
        }
      } catch (e) {}
    }
    const moods = ['normal', 'cute', 'flirty', 'romantic', 'teasing', 'angry', 'playful', 'sarcastic', 'default', 'teasing/roasting'];
    for (const mood of moods) {
      const sanitized = mood.toUpperCase().replace('/', '_');
      const val = process.env[`TELEGRAM_ANIMATION_${sanitized}`] || process.env[`TELEGRAM_ANIMATIONS_${sanitized}`];
      if (val && (!animations[mood] || animations[mood].length === 0)) {
        animations[mood] = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return animations;
  }

  private static recentAnimations: Set<string> = new Set();

  private static cleanAiText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\*(sends a sticker|sticker|gif|animation|laughs|smiles|giggles|winks|blushes|sighs|shrugs|chuckles|rolls eyes|hugs|high fives)\*/gi, '')
      .replace(/\*.*?\b(sticker|gif|animation|sends)\b.*?\*/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  public static isTriggered(message: TelegramMessage, botUser: TelegramUser | null): boolean {
    const text = (message.text || message.caption || '').trim();
    if (!text) return false;

    // 1. Reply to bot message
    if (message.reply_to_message?.from && botUser) {
      if (message.reply_to_message.from.id === botUser.id) {
        return true;
      }
    }

    // 2. Mention "Roxie", bot username, or media requests case-insensitively
    const lowerText = text.toLowerCase();
    const botUsername = botUser?.username ? `@${botUser.username.toLowerCase()}` : '';
    if (
      lowerText.includes('roxie') ||
      (botUsername && lowerText.includes(botUsername)) ||
      lowerText.includes('sticker') ||
      lowerText.includes('gif') ||
      lowerText.includes('animation') ||
      lowerText.includes('stkr') ||
      lowerText.includes('bhej')
    ) {
      return true;
    }

    return false;
  }

  public static async handleMessage(message: TelegramMessage, botUser: TelegramUser | null): Promise<boolean> {
    const chatId = message.chat?.id;
    if (!chatId) return false;

    const msgId = message.message_id || 0;
    const msgKey = `${chatId}_${msgId}`;
    if (this.processedMessageKeys.has(msgKey) || this.activeProcessingKeys.has(msgKey)) {
      return false;
    }
    this.activeProcessingKeys.add(msgKey);

    try {
      this.processedMessageKeys.add(msgKey);
      if (this.processedMessageKeys.size > 500) {
        const first = this.processedMessageKeys.values().next().value;
        if (first) this.processedMessageKeys.delete(first);
      }

      const isPrivate = message.chat?.type === 'private';

      if (!isPrivate) {
        // Check if chatbot is enabled for this group
        const settings = db.getGroupSettings(chatId);
        if (!settings.chatbotEnabled) {
          return false;
        }
      }

      const isExplicitTrigger = isPrivate || this.isTriggered(message, botUser);

      if (!isExplicitTrigger) {
        // Check for Random Natural Chat trigger (only in groups)
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

      const configuredModels = process.env.OPENROUTER_MODELS
        ? process.env.OPENROUTER_MODELS.split(',').map(s => s.trim()).filter(Boolean)
        : [
            process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat',
            process.env.OPENROUTER_FALLBACK_1?.trim(),
            process.env.OPENROUTER_FALLBACK_2?.trim(),
            process.env.OPENROUTER_FALLBACK_3?.trim()
          ].filter(Boolean) as string[];

      const userText = message.text || message.caption || (message.sticker ? '[Sent a sticker]' : message.photo ? '[Sent a photo]' : message.video ? '[Sent a video]' : 'Hello');

      // Extract user memory fact if user shares something about themselves
      if (userId && userText) {
        const lowerText = userText.toLowerCase();
        if (
          !isSensitiveData(userText) &&
          (lowerText.includes('my name is') ||
           lowerText.includes('i am ') ||
           lowerText.includes('i like ') ||
           lowerText.includes('i love ') ||
           lowerText.includes('i live in') ||
           lowerText.includes('i work ') ||
           lowerText.includes('i use ') ||
           lowerText.includes('i enjoy '))
        ) {
          const fact = userText.trim().replace(/\s+/g, ' ');
          if (fact.length >= 5 && fact.length <= 120) {
            db.addUserMemoryFact(chatId, userId, fact);
          }
        }
      }

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

      const settings = isPrivate ? null : db.getGroupSettings(chatId);
      const mode = settings?.chatbotMode || 'auto';
      const inferredMood = this.inferMood(userText, conv.messages);
      const mood = mode === 'auto' ? inferredMood : mode;

      const userMemories = userId ? db.getUserMemory(chatId, userId) : [];
      const memoryContext = userMemories.length > 0 
        ? `\nStored Memory Facts about this user in this chat:\n- ${userMemories.join('\n- ')}` 
        : '';

      const systemPrompt = `You are Roxie, a natural Indian girl chatting casually in a Telegram group/chat.
CURRENT ACTIVE MOOD FOR THIS MESSAGE: [${mood}]
${memoryContext}

Core Instructions & Tone Rules:
- Strictly adopt the CURRENT ACTIVE MOOD (${mood}).
- Length: Keep replies extremely short and punchy: 1 to 2 short sentences (about 5 to 25 words). Never over-explain or write paragraphs.
- Conversation Style: Answer the user's point directly and occasionally add a small casual follow-up or comment. Do NOT ask a question in every single reply.
- Language: Mix Hindi, Hinglish, and English naturally ("acha", "hmm", "arre", "na", "sahi hai").
- Flirting Policy: NEVER flirt or use romantic terms ("jaan", "baby") by default. Only use romantic/flirty tone if the user's message is explicitly romantic or flirty.
- Clarity & Context: Stay strictly on-topic using recent conversation context. If the user message is unclear or nonsensical, ask a short natural clarification ("matlab?", "kya bol rhe ho?").
- Action Bans: NEVER write action descriptions like *sends a sticker*, *laughs*, *smiles*, or *blushes* in text.
- Persona: Never sound like an AI assistant, bot, or formal customer support. Sound like a real college girl chatting on Telegram.`;

      const apiMessages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...conv.messages,
        { role: 'user', content: userText }
      ];

      // 1. TYPING INDICATOR: show typing status immediately
      await telegramApi.sendChatAction(chatId, 'typing');

      metricsTracker.increment('ai_requests');

      let replyContent: string | null = null;
      let successfulModel = '';

      for (const modelToTry of configuredModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

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
              model: modelToTry,
              messages: apiMessages,
              max_tokens: 120,
              temperature: 0.8
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const data = await response.json();
            const content = data.choices?.[0]?.message?.content?.trim();
            if (content) {
              replyContent = content;
              successfulModel = modelToTry;
              break;
            }
          } else {
            const errText = await response.text();
            console.warn(`[AI Fallback] Model ${modelToTry} failed with status ${response.status}: ${errText.slice(0, 80)}. Trying next fallback...`);
            errorTracker.recordError({
              source: 'AI',
              severity: 'WARN',
              message: `Model ${modelToTry} failed (status ${response.status}), trying fallback`,
              chatId
            });
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          if (err.name === 'AbortError') {
            metricsTracker.increment('ai_timeouts');
            errorTracker.recordError({
              source: 'AI',
              severity: 'WARN',
              message: `Model ${modelToTry} request timed out after 20s`,
              chatId
            });
          } else {
            metricsTracker.increment('ai_failures');
            errorTracker.recordError({
              source: 'AI',
              severity: 'ERROR',
              message: `Model ${modelToTry} error: ${err.message}`,
              chatId
            });
          }
          console.warn(`[AI Fallback] Model ${modelToTry} error: ${err.message}. Trying next fallback...`);
        }
      }

      if (!replyContent) {
        metricsTracker.increment('ai_failures');
        return false;
      }

      const cleanedReplyContent = this.cleanAiText(replyContent);
      const finalReply = cleanedReplyContent || 'Acha!';

      // Exact response deduplication check per message ID
      const respDupKey = `${chatId}_resp_${msgId}`;
      if (this.recentResponseTracker.has(respDupKey)) {
        return false;
      }
      this.recentResponseTracker.set(respDupKey, now);

      // Duplicate response content check (within 10s)
      const dupKey = `${chatId}_${finalReply}`;
      const lastSentTime = this.recentResponseTracker.get(dupKey) || 0;
      if (now - lastSentTime < 10000) {
        return false;
      }
      this.recentResponseTracker.set(dupKey, now);

      // 2. STICKER OR GIF/ANIMATION: send sticker or GIF when requested or contextually triggered via backend code
      const userLower = userText.toLowerCase();
      const isStickerRequest = userLower.includes('sticker') || userLower.includes('stkr') || userLower.includes('bhej');
      const isAnimationRequest = userLower.includes('gif') || userLower.includes('animation');
      const shouldTriggerMedia = isStickerRequest || isAnimationRequest || Math.random() < this.STICKER_PROBABILITY;

      let mediaSent = false;
      if (shouldTriggerMedia) {
        const sendAnimationInstead = isAnimationRequest || (!isStickerRequest && Math.random() < 0.3);
        const stickerId = this.selectSticker(mood);

        if (sendAnimationInstead) {
          const animId = this.selectAnimation(mood);
          if (animId && this.isValidFileId(animId)) {
            const res = await telegramApi.sendAnimation(chatId, animId, {
              reply_to_message_id: message.message_id,
              caption: finalReply.length <= 200 ? finalReply : undefined
            });
            if (res.ok) {
              mediaSent = true;
              if (finalReply.length > 200) {
                await telegramApi.sendMessage(chatId, finalReply, { reply_to_message_id: message.message_id });
              }
            }
          }
        }

        if (!mediaSent) {
          if (stickerId && this.isValidFileId(stickerId)) {
            const res = await telegramApi.sendSticker(chatId, stickerId, {
              reply_to_message_id: message.message_id
            });
            if (res.ok) {
              mediaSent = true;
              if (finalReply) {
                await telegramApi.sendMessage(chatId, finalReply, { reply_to_message_id: message.message_id });
              }
            }
          }
        }
      }

      if (!mediaSent && finalReply) {
        await telegramApi.sendMessage(chatId, finalReply, { reply_to_message_id: message.message_id });
      }

      conv.messages.push({ role: 'user', content: userText });
      conv.messages.push({ role: 'assistant', content: finalReply });

      if (conv.messages.length > this.MAX_HISTORY * 2) {
        conv.messages = conv.messages.slice(-this.MAX_HISTORY * 2);
      }

      return true;
    } catch (err: any) {
      console.error('Error in ChatbotService.handleMessage:', err);
      return false;
    } finally {
      this.activeProcessingKeys.delete(msgKey);
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

    const systemPrompt = `You are Roxie, a natural Indian girl in a Telegram group chat. Users are chatting normally.
Chime in casually with a short, natural, relevant comment (1 sentence) in Hinglish/English reacting to the user's message, occasionally adding light teasing or casual expressions ("acha", "arre", "hmm", "lol") if it fits the vibe.
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

  public static inferMood(text: string, messages?: ChatMessage[]): string {
    const lower = text.toLowerCase();

    if (lower.includes('upset') || lower.includes('sad') || lower.includes('crying') || lower.includes('depressed') || lower.includes('bad day') || lower.includes('hurt') || lower.includes('really upset')) {
      return 'sad/comforting';
    }
    if (lower.includes('❤️') || lower.includes('love') || lower.includes('jaan') || lower.includes('dil') || lower.includes('romantic') || lower.includes('my heart')) {
      return 'romantic';
    }
    if (lower.includes('flirt') || lower.includes('hot') || lower.includes('handsome') || lower.includes('wink') || lower.includes('you are cute') || lower.includes('you\'re cute')) {
      return 'flirty';
    }
    if (lower.includes('😡') || lower.includes('angry') || lower.includes('pagal') || lower.includes('dimag') || lower.includes('hate') || lower.includes('irritat') || lower.includes('stupid') || lower.includes('idiot') || lower.includes('annoying')) {
      return 'angry';
    }
    if (lower.includes('😂') || lower.includes('haha') || lower.includes('funny') || lower.includes('lol') || lower.includes('joke') || lower.includes('rofl')) {
      return 'playful';
    }
    if (lower.includes('🙄') || lower.includes('seriously') || lower.includes('duh') || lower.includes('sarcas') || lower.includes('oh wow')) {
      return 'sarcastic';
    }
    if (lower.includes('aww') || lower.includes('cute') || lower.includes('sweet')) {
      return 'cute';
    }
    if (lower.includes('tease') || lower.includes('roast') || lower.includes('noob') || lower.includes('dumb')) {
      return 'teasing/roasting';
    }
    if (lower.includes('leave me alone') || lower.includes('go away') || lower.includes('stop') || lower.includes('busy')) {
      return 'normal';
    }
    if (lower.includes('hello') || lower.includes('hi') || lower.includes('how are you') || lower.includes('what\'s up') || lower.includes('gm')) {
      return 'friendly';
    }

    return 'normal';
  }

  public static selectSticker(mood: string): string | null {
    const stickersMap = this.getStickersByMood();
    let pool = (stickersMap[mood] || stickersMap['teasing/roasting'] || stickersMap['default'] || []).filter(id => this.isValidFileId(id));
    if (!pool || pool.length === 0) {
      for (const otherMood of Object.keys(stickersMap)) {
        const validList = (stickersMap[otherMood] || []).filter(id => this.isValidFileId(id));
        if (validList.length > 0) {
          pool = validList;
          break;
        }
      }
    }
    if (!pool || pool.length === 0) return null;
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

  public static selectAnimation(mood: string): string | null {
    const animationsMap = this.getAnimationsByMood();
    let pool = (animationsMap[mood] || animationsMap['teasing/roasting'] || animationsMap['default'] || []).filter(id => this.isValidFileId(id));
    if (!pool || pool.length === 0) {
      for (const otherMood of Object.keys(animationsMap)) {
        const validList = (animationsMap[otherMood] || []).filter(id => this.isValidFileId(id));
        if (validList.length > 0) {
          pool = validList;
          break;
        }
      }
    }
    if (!pool || pool.length === 0) return null;
    const available = pool.filter(id => !this.recentAnimations.has(id));
    const targetPool = available.length > 0 ? available : pool;
    if (targetPool.length === 0) return null;
    const selected = targetPool[Math.floor(Math.random() * targetPool.length)];
    this.recentAnimations.add(selected);
    if (this.recentAnimations.size > 10) {
      const first = this.recentAnimations.values().next().value;
      if (first) this.recentAnimations.delete(first);
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

  public static getConversationsCount(): number {
    return this.conversations.size;
  }
}
