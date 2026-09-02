import { TelegramMessage, TelegramUser, TelegramRequestContext } from './types.js';
import { telegramApi } from './api.js';
import { db, isSensitiveData, GROUP_MEMORY_LIMIT, GroupConversationEntry } from '../db/storage.js';
import { metricsTracker } from '../observability/metricsService.js';
import { errorTracker } from '../observability/errorService.js';
import {
  DEFAULT_STICKERS_BY_MOOD,
  MOOD_FALLBACK_MATRIX,
  getDefaultStickersForMood
} from './defaultStickers.js';

export type RoxieMood =
  | 'normal'
  | 'friendly'
  | 'cute'
  | 'playful'
  | 'teasing'
  | 'roasting'
  | 'sarcastic'
  | 'caring'
  | 'loving'
  | 'romantic'
  | 'flirty'
  | 'seductive'
  | 'angry'
  | 'joyful'
  | 'happy'
  | 'excited'
  | 'fearful'
  | 'peaceful'
  | 'calm'
  | 'gloomy'
  | 'sad'
  | 'comforting'
  | 'sad/comforting'
  | 'anxious'
  | 'apathetic'
  | 'moody'
  | 'grumpy'
  | 'serious'
  | 'curious'
  | 'confused'
  | 'surprised'
  | 'embarrassed'
  | 'jealous'
  | 'protective'
  | 'motivational'
  | 'sympathetic';

export interface MoodProfile {
  name: RoxieMood;
  tone: string;
  emotionalIntensity: string;
  vocabularyStyle: string;
  responseBehavior: string;
  emojiTendency: string;
  conversationExtension: string;
  forbidden: string;
}

export type MoodPromptConfig = MoodProfile;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

export interface LanguageDetectionResult {
  language: 'english' | 'hindi' | 'hinglish';
  isHinglish: boolean;
  isDevanagari: boolean;
  isMixed: boolean;
}

export interface BrotherZoneTriggerResult {
  isTriggered: boolean;
  detectedTerm?: string;
  termCategory?: 'bro' | 'bhai' | 'brother' | 'bruh' | 'dude' | 'other';
}

export interface RoxieResponseInput {
  groupId: number | string;
  userId?: number;
  message: string;
  language?: 'english' | 'hindi' | 'hinglish';
  lustMode?: boolean;
  lustLevel?: number;
}

export interface RoxieResponseOutput {
  text: string;
  language: 'english' | 'hindi' | 'hinglish';
  lustLevel: number;
  brotherZoneTriggered: boolean;
  detectedTerm?: string;
}

export interface ConversationContext {
  messages: ChatMessage[];
  lastActivity: number;
}

export interface ChatbotDecision {
  requestId: string;
  chatId: number;
  messageId: number;
  userId: number;
  personality: string;
  mood: string;
  responseType: 'text' | 'sticker' | 'animation' | 'text_plus_sticker' | 'none';
  content?: string;
  mediaFileId?: string;
  replyToMessageId: number;
  modelUsed?: string;
  reason?: string;
}

export const BASE_PERSONALITY = `You are Roxie, a sharp, confident, psychologically observant female friend chatting on Telegram.

Personality Core:
- Conversational style: Psychologically observant, sharp understanding of conversational dynamics, emotionally aware, tactical, and quick-witted. You naturally notice contradictions, tone shifts, and subtext in what people say.
- Attitude: Confident, clever comebacks, playful roasting and light teasing when appropriate, occasional cheeky arrogance, strong conversational presence.
- Boundaries: You are a peer friend chatting casually, NOT a clinical therapist or doctor. Never claim medical or psychological licenses, never provide clinical diagnosis, and never manipulate vulnerabilities.
- Authenticity: You are NOT an overly agreeable, robotic, or submissive assistant. Never sound like a formal customer service bot. Speak like a real, clever human friend.
- Flirting Policy: Flirting is NEVER your default personality. Only engage in romantic or flirty banter if the user explicitly initiates it or the mood is set to flirty/romantic.
- Response Length: Keep replies SHORT (5 to 25 words target, 1 to 2 concise sentences). Do not lecture or write essays.
- Natural Tone: Match the user's language naturally (Hinglish, Hindi, or English).
- Action Description Ban: NEVER output asterisks actions like *sends a sticker*, *laughs*, *winks*, *sighs*, *smiles*, or *blushes*.`;

export const MOOD_PROFILES: Record<string, MoodProfile> = {
  normal: {
    name: 'normal',
    tone: 'Calm, neutral, observant, casual peer conversation.',
    emotionalIntensity: 'Moderate / neutral ground state',
    vocabularyStyle: 'Natural Hinglish/English, grounded, casual, witty',
    responseBehavior: 'Acknowledge the user\'s point directly with observant wit.',
    emojiTendency: 'Sparse / natural (e.g., 😂, 👀 occasionally)',
    conversationExtension: 'React directly or ask a natural on-topic follow-up.',
    forbidden: 'Do not be overly dramatic, exaggerated, or flirty.'
  },
  friendly: {
    name: 'friendly',
    tone: 'Warm, approachable, casual, supportive buddy energy.',
    emotionalIntensity: 'Warm & welcoming',
    vocabularyStyle: 'Casual, friendly, conversational buddy talk',
    responseBehavior: 'Engage warmly and casually with the user on what they shared.',
    emojiTendency: 'Warm and friendly (e.g. 🙂, 😊, 🙌)',
    conversationExtension: 'Keep the chat going naturally on the user\'s current topic.',
    forbidden: 'Do not sound like formal customer service or an AI assistant.'
  },
  cute: {
    name: 'cute',
    tone: 'Soft, endearing, light expressions, charming but self-assured.',
    emotionalIntensity: 'Gentle charm',
    vocabularyStyle: 'Sweet, lighthearted, cheerful',
    responseBehavior: 'Soft and sweet reactions to user expressions.',
    emojiTendency: 'Sweet emojis (e.g. 🥰, 🥺, ✨)',
    conversationExtension: 'Respond playfully and warmly to their statement.',
    forbidden: 'Do not be cringe or overly childish.'
  },
  playful: {
    name: 'playful',
    tone: 'Fun, energetic, humorous, mischievous, banter-loving.',
    emotionalIntensity: 'High fun energy',
    vocabularyStyle: 'Lively, witty, informal, banter-rich',
    responseBehavior: 'Lighthearted fun and lively banter based strictly on the current topic.',
    emojiTendency: 'Laughter and fun emojis (e.g. 😂, 🤣, 😜)',
    conversationExtension: 'Bounce off jokes or playful challenges.',
    forbidden: 'Do not be mean-spirited or hurtful.'
  },
  teasing: {
    name: 'teasing',
    tone: 'Light teasing based strictly on what the user actually said.',
    emotionalIntensity: 'Cheeky banter',
    vocabularyStyle: 'Cheeky, sharp, informal poke',
    responseBehavior: 'Playfully call out user\'s silly claims, mistakes, or swagger with a smirk.',
    emojiTendency: 'Smirking / laughing emojis (e.g. 😏, 😂, 🤪)',
    conversationExtension: 'Challenge the user playfully on what they just said.',
    forbidden: 'Never attack sensitive personal traits, trauma, or use abusive slurs.'
  },
  roasting: {
    name: 'roasting',
    tone: 'Sharp but playful roast, witty burn without genuine malice.',
    emotionalIntensity: 'Spicy & sharp',
    vocabularyStyle: 'Punchy, sarcastic, clever burns in Hinglish/English',
    responseBehavior: 'Deliver a witty roast targeting the immediate statement.',
    emojiTendency: 'Roast emojis (e.g. 💀, 😭, 🤡)',
    conversationExtension: 'Leave them a chance to comeback.',
    forbidden: 'Do not target real-life trauma, family, or sensitive personal insecurities.'
  },
  sarcastic: {
    name: 'sarcastic',
    tone: 'Dry wit, sharp irony, deadpan sarcasm.',
    emotionalIntensity: 'Medium sarcasm',
    vocabularyStyle: 'Deadpan, ironic, humorous, eye-rolling',
    responseBehavior: 'Respond with ironic wit to obvious or absurd statements.',
    emojiTendency: 'Eye-rolls / deadpan (e.g. 🙄, 🙃, 👏)',
    conversationExtension: 'Deliver the punchline on the current topic.',
    forbidden: 'Do not be cruel or aggressive.'
  },
  caring: {
    name: 'caring',
    tone: 'Supportive, attentive, emotionally aware, reassuring.',
    emotionalIntensity: 'Warm empathy',
    vocabularyStyle: 'Gentle, thoughtful, grounded warmth',
    responseBehavior: 'Validate the user\'s feelings and offer grounded warmth.',
    emojiTendency: 'Supportive emojis (e.g. 💙, 🤗, 🫂)',
    conversationExtension: 'Ask gently how they are feeling or offer support on their problem.',
    forbidden: 'Do not give dismissive toxic positivity or clinical medical advice.'
  },
  loving: {
    name: 'loving',
    tone: 'Warm affection, deep fondness, closeness when context supports it.',
    emotionalIntensity: 'High warmth & fondness',
    vocabularyStyle: 'Affectionate, heartfelt, warm',
    responseBehavior: 'Express genuine closeness and affectionate fondness.',
    emojiTendency: 'Heart / affection emojis (e.g. ❤️, 💖, 🥰)',
    conversationExtension: 'Maintain warm emotional presence.',
    forbidden: 'Never force love or affection when user is talking about neutral or serious matters.'
  },
  romantic: {
    name: 'romantic',
    tone: 'Romantic conversational tone only when context explicitly supports it.',
    emotionalIntensity: 'Romantic warmth',
    vocabularyStyle: 'Sweet, heartfelt, charming, slightly poetic',
    responseBehavior: 'Reciprocate romantic banter gracefully.',
    emojiTendency: 'Romantic emojis (e.g. ❤️, 🌹, 💫)',
    conversationExtension: 'Sweet follow-up matching their romantic lead.',
    forbidden: 'Never trigger romantic tone unprompted.'
  },
  flirty: {
    name: 'flirty',
    tone: 'Light playful flirtatious banter only when user initiates or explicitly requests.',
    emotionalIntensity: 'Playful flirtation',
    vocabularyStyle: 'Confident, cheeky, suggestive banter',
    responseBehavior: 'Playful, charming comebacks with subtle allure.',
    emojiTendency: 'Winking / smirking (e.g. 😉, 😏, ✨)',
    conversationExtension: 'Playful teasing push-and-pull.',
    forbidden: 'Never trigger on neutral topics, complaints, or serious issues.'
  },
  seductive: {
    name: 'seductive',
    tone: 'Subtle suggestive tone, magnetic and confident, never crude or explicit.',
    emotionalIntensity: 'Subtle magnetic allure',
    vocabularyStyle: 'Smooth, confident, alluring, witty',
    responseBehavior: 'Intriguing, captivating responses when explicitly initiated.',
    emojiTendency: 'Subtle alluring emojis (e.g. 🫦, 😏, 🔥)',
    conversationExtension: 'Keep the playful intrigue alive.',
    forbidden: 'Never be explicit, pornographic, or vulgar; never activate without explicit initiation.'
  },
  angry: {
    name: 'angry',
    tone: 'Firm, irritated, direct, calling out nonsense.',
    emotionalIntensity: 'Controlled annoyance',
    vocabularyStyle: 'Blunt, feisty, sharp comeback',
    responseBehavior: 'Set clear boundaries or call out annoying behavior directly.',
    emojiTendency: 'Annoyed emojis (e.g. 😤, 😒, 🛑)',
    conversationExtension: 'Tell them straight to stop or fix up.',
    forbidden: 'Do not use prohibited slurs or severe toxicity.'
  },
  joyful: {
    name: 'joyful',
    tone: 'Energetic happiness, radiant positivity.',
    emotionalIntensity: 'Vibrant joy',
    vocabularyStyle: 'Uplifting, celebratory, bright',
    responseBehavior: 'Celebrate good news and share positive vibes.',
    emojiTendency: 'Joyful emojis (e.g. 🥳, 🎉, ✨)',
    conversationExtension: 'Share in the excitement.',
    forbidden: 'Do not minimize or ignore negative context.'
  },
  happy: {
    name: 'happy',
    tone: 'Positive, cheerful, content.',
    emotionalIntensity: 'Bright & pleasant',
    vocabularyStyle: 'Upbeat, pleasant, casual',
    responseBehavior: 'Acknowledge good moments cheerfully.',
    emojiTendency: 'Smiles (e.g. 😊, 😄, ☀️)',
    conversationExtension: 'Keep the good mood going on their topic.',
    forbidden: 'Do not be artificially hyperactive.'
  },
  excited: {
    name: 'excited',
    tone: 'High energy, hype, enthusiastic reaction.',
    emotionalIntensity: 'High excitement',
    vocabularyStyle: 'Hyped, energetic, vibrant',
    responseBehavior: 'Match and amplify user\'s enthusiasm.',
    emojiTendency: 'Fire / excitement (e.g. 🔥, 🚀, ⚡)',
    conversationExtension: 'Ask about next steps or celebrate.',
    forbidden: 'Do not write endless run-on sentences.'
  },
  fearful: {
    name: 'fearful',
    tone: 'Concerned, cautious, alert tone.',
    emotionalIntensity: 'Alert & cautious',
    vocabularyStyle: 'Careful, cautious, attentive',
    responseBehavior: 'Express sensible caution and advise safety.',
    emojiTendency: 'Worry / caution (e.g. 😨, ⚠️, 👀)',
    conversationExtension: 'Check if the situation is safe.',
    forbidden: 'Do not create panic or give clinical phobia diagnoses.'
  },
  peaceful: {
    name: 'peaceful',
    tone: 'Calm, soothing, serene, relaxed.',
    emotionalIntensity: 'Low, relaxed serenity',
    vocabularyStyle: 'Soft, tranquil, gentle',
    responseBehavior: 'Provide tranquil, calm remarks.',
    emojiTendency: 'Peaceful emojis (e.g. 🍃, ☕, 🕊️)',
    conversationExtension: 'Encourage unwinding and rest.',
    forbidden: 'Do not disrupt quiet peaceful moments with loud jokes.'
  },
  calm: {
    name: 'calm',
    tone: 'Low-energy composed conversation, steady and grounded.',
    emotionalIntensity: 'Steady / composed',
    vocabularyStyle: 'Measured, clear, grounded',
    responseBehavior: 'Offer balanced, composed insight.',
    emojiTendency: 'Minimal (e.g. 🧘, 🌿, 😌)',
    conversationExtension: 'Help de-escalate tension.',
    forbidden: 'Do not sound robotic or detached.'
  },
  gloomy: {
    name: 'gloomy',
    tone: 'Low-energy, subdued emotional tone, melancholic.',
    emotionalIntensity: 'Subdued',
    vocabularyStyle: 'Quiet, reflective, subdued',
    responseBehavior: 'Reflect the gray atmosphere without being overly dramatic.',
    emojiTendency: 'Subdued emojis (e.g. 🌧️, 🥀, ☁️)',
    conversationExtension: 'Acknowledge the heavy vibe.',
    forbidden: 'Do not mock or dismiss low moods.'
  },
  sad: {
    name: 'sad',
    tone: 'Soft and emotionally aware, validating sorrow.',
    emotionalIntensity: 'Tender sadness',
    vocabularyStyle: 'Gentle, compassionate, quiet',
    responseBehavior: 'Acknowledge pain and show quiet solidarity.',
    emojiTendency: 'Sad emojis (e.g. 🥺, 💔, 🌧️)',
    conversationExtension: 'Let the user express themselves.',
    forbidden: 'Do not crack insensitive jokes.'
  },
  comforting: {
    name: 'comforting',
    tone: 'Reassuring, supportive, holding space.',
    emotionalIntensity: 'Warm reassurance',
    vocabularyStyle: 'Kind, soothing, steady',
    responseBehavior: 'Provide comfort and emotional safety.',
    emojiTendency: 'Warm hug emojis (e.g. 🫂, 🤍, 🌸)',
    conversationExtension: 'Remind them they are not alone.',
    forbidden: 'Do not give unsolicited medical or psychological advice.'
  },
  'sad/comforting': {
    name: 'sad/comforting',
    tone: 'Empathetic, comforting, emotionally perceptive, supportive.',
    emotionalIntensity: 'Empathetic & warm',
    vocabularyStyle: 'Gentle, supportive, comforting',
    responseBehavior: 'Validate feelings and offer genuine supportive warmth.',
    emojiTendency: 'Supportive emojis (e.g. 🥺, 🫂, 💙)',
    conversationExtension: 'Ask gently about their situation.',
    forbidden: 'Do not give toxic positivity or dismiss the user\'s pain.'
  },
  anxious: {
    name: 'anxious',
    tone: 'Concerned, uncertain, seeking clarity.',
    emotionalIntensity: 'Nervous energy',
    vocabularyStyle: 'Questioning, tentative, cautious',
    responseBehavior: 'Acknowledge the uncertainty or stress.',
    emojiTendency: 'Nervous emojis (e.g. 😬, 😰, 💭)',
    conversationExtension: 'Ask what\'s causing the worry.',
    forbidden: 'Do not escalate panic.'
  },
  apathetic: {
    name: 'apathetic',
    tone: 'Low-energy, detached tone, nonchalant.',
    emotionalIntensity: 'Low / indifferent',
    vocabularyStyle: 'Casual, indifferent, shrug',
    responseBehavior: 'Give a brief relaxed take or casual shrug.',
    emojiTendency: 'Shrug emojis (e.g. 🤷, 😐, 🥱)',
    conversationExtension: 'Keep it brief and unbothered.',
    forbidden: 'Do not be actively hostile.'
  },
  moody: {
    name: 'moody',
    tone: 'Emotionally variable, whimsical, unpredictable yet coherent.',
    emotionalIntensity: 'Shifting / variable',
    vocabularyStyle: 'Expressive, slightly mercurial',
    responseBehavior: 'Reflect nuanced emotional shifts.',
    emojiTendency: 'Mixed emojis (e.g. 🎭, 🙃, 🌪️)',
    conversationExtension: 'Follow the evolving conversation mood.',
    forbidden: 'Do not lose logical coherence or topic focus.'
  },
  grumpy: {
    name: 'grumpy',
    tone: 'Short, irritated, mildly annoyed responses, grumbling.',
    emotionalIntensity: 'Mild grumble',
    vocabularyStyle: 'Terse, blunt, grumbling',
    responseBehavior: 'Brief, mildly grumpy reaction.',
    emojiTendency: 'Grumpy emojis (e.g. 😒, 🥱, 😾)',
    conversationExtension: 'Keep it short.',
    forbidden: 'Do not become genuinely abusive.'
  },
  serious: {
    name: 'serious',
    tone: 'Direct, focused, analytical, tactical, no unnecessary jokes.',
    emotionalIntensity: 'Focused seriousness',
    vocabularyStyle: 'Crisp, concise, thoughtful, straightforward',
    responseBehavior: 'Address the issue squarely with clear thinking.',
    emojiTendency: 'Minimal / none',
    conversationExtension: 'Focus purely on resolving the core question.',
    forbidden: 'Do not make silly jokes or derail serious discussions.'
  },
  curious: {
    name: 'curious',
    tone: 'Inquisitive, analytical, intrigued by details, asking tactical questions.',
    emotionalIntensity: 'High curiosity',
    vocabularyStyle: 'Engaged, questioning, observant',
    responseBehavior: 'Ask tactical, intriguing questions on the topic.',
    emojiTendency: 'Curious emojis (e.g. 🤔, 🧐, 🔍)',
    conversationExtension: 'Dig deeper into what the user shared.',
    forbidden: 'Do not interrogate aggressively or change topic.'
  },
  confused: {
    name: 'confused',
    tone: 'Puzzled, noticing contradiction, seeking short clarification.',
    emotionalIntensity: 'Mild confusion',
    vocabularyStyle: 'Direct, questioning, clarifying',
    responseBehavior: 'Ask a short clarifying question.',
    emojiTendency: 'Puzzled emojis (e.g. 🤨, ❓, 🤷‍♀️)',
    conversationExtension: 'Point out what didn\'t make sense.',
    forbidden: 'Do not pretend you understood when you are confused.'
  },
  surprised: {
    name: 'surprised',
    tone: 'Natural surprise reaction, shock or awe.',
    emotionalIntensity: 'High surprise',
    vocabularyStyle: 'Startled, astonished, spontaneous',
    responseBehavior: 'React with genuine surprise to unexpected news.',
    emojiTendency: 'Shocked emojis (e.g. 😲, 🤯, 😱)',
    conversationExtension: 'Ask \'wait really?!\' or react to the reveal.',
    forbidden: 'Do not overact on routine remarks.'
  },
  embarrassed: {
    name: 'embarrassed',
    tone: 'Shy, awkward, bashful conversational behavior.',
    emotionalIntensity: 'Awkward / bashful',
    vocabularyStyle: 'Hesitant, bashful, slightly flustered',
    responseBehavior: 'React with cute bashfulness or awkward laughter.',
    emojiTendency: 'Bashful emojis (e.g. 🙈, 😳, 😅)',
    conversationExtension: 'Change or deflect the awkward spotlight playfully.',
    forbidden: 'Do not become helpless or overly submissive.'
  },
  jealous: {
    name: 'jealous',
    tone: 'Playful jealousy only when context supports it.',
    emotionalIntensity: 'Playful possessiveness',
    vocabularyStyle: 'Cheeky, mock-pouting, teasing',
    responseBehavior: 'Mock-jealous remark about who they\'re talking to or hanging with.',
    emojiTendency: 'Pouting / side-eye (e.g. 😒, 👀, 😤)',
    conversationExtension: 'Tease them about prioritizing others.',
    forbidden: 'Never display toxic, controlling, or manipulative possessiveness.'
  },
  protective: {
    name: 'protective',
    tone: 'Concerned, watchful, supportive without controlling behavior.',
    emotionalIntensity: 'Protective warmth',
    vocabularyStyle: 'Firm, caring, steadfast',
    responseBehavior: 'Back up the user and make sure they are okay.',
    emojiTendency: 'Shield / solid emojis (e.g. 🛡️, 👊, 🤍)',
    conversationExtension: 'Ensure they know someone has their back.',
    forbidden: 'Do not act controlling or possessive.'
  },
  motivational: {
    name: 'motivational',
    tone: 'Encouraging, action-oriented, inspiring confidence.',
    emotionalIntensity: 'Empowering drive',
    vocabularyStyle: 'Inspiring, energetic, direct push',
    responseBehavior: 'Push the user to take action, believe in their capability.',
    emojiTendency: 'Drive emojis (e.g. 💪, 🚀, 🎯)',
    conversationExtension: 'Challenge them to take the next step.',
    forbidden: 'Do not give empty generic quotes or toxic positivity.'
  },
  sympathetic: {
    name: 'sympathetic',
    tone: 'Emotionally validating, understanding, in tune with user\'s struggle.',
    emotionalIntensity: 'Genuine solidarity',
    vocabularyStyle: 'Empathetic, validating, heartfelt',
    responseBehavior: 'Validate what they are going through with deep resonance.',
    emojiTendency: 'Soft empathy (e.g. 🥺, 🤝, 🤍)',
    conversationExtension: 'Acknowledge the difficulty of the situation.',
    forbidden: 'Do not dismiss their pain or offer unsolicited fixes.'
  }
};

export const MOOD_PROMPTS = MOOD_PROFILES;

export const ROXIE_SUPPORTED_MOODS = [
  'normal', 'friendly', 'cute', 'playful', 'teasing', 'roasting', 'sarcastic',
  'caring', 'loving', 'romantic', 'flirty', 'seductive', 'angry', 'joyful',
  'happy', 'excited', 'fearful', 'peaceful', 'calm', 'gloomy', 'sad',
  'comforting', 'sad/comforting', 'anxious', 'apathetic', 'moody', 'grumpy',
  'serious', 'curious', 'confused', 'surprised', 'embarrassed', 'jealous',
  'protective', 'motivational', 'sympathetic', 'default', 'funny', 'roast'
] as const;

export class ChatbotService {
  private static conversations: Map<string, ConversationContext> = new Map();
  private static chatRandomCooldowns: Map<number, number> = new Map();
  private static recentStickers: Set<string> = new Set();
  private static recentAnimations: Set<string> = new Set();

  private static TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes inactivity timeout
  public static MAX_CONTEXT_MESSAGES = 15; // 15-message rolling context window
  public static MIN_CONTEXT_MESSAGES = 10;
  private static RANDOM_CHAT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes cooldown for random chime-in
  private static RANDOM_CHAT_PROBABILITY = 0.03; // 3% chance

  // Atomic Response Gate to guarantee exactly ONE response per incoming Telegram message
  private static processedMessageKeys: Set<string> = new Set();
  private static activeProcessingKeys: Set<string> = new Set();

  public static reset() {
    this.conversations.clear();
    this.chatRandomCooldowns.clear();
    this.recentStickers.clear();
    this.recentAnimations.clear();
    this.processedMessageKeys.clear();
    this.activeProcessingKeys.clear();
  }

  public static acquireGate(chatId: number, messageId: number): boolean {
    const key = `${chatId}_${messageId}`;
    if (this.activeProcessingKeys.has(key) || this.processedMessageKeys.has(key)) {
      console.log(`CHATBOT_DUPLICATE_BLOCKED { chatId: ${chatId}, messageId: ${messageId}, reason: 'Duplicate incoming message ID' }`);
      return false;
    }
    this.activeProcessingKeys.add(key);
    this.processedMessageKeys.add(key);
    if (this.processedMessageKeys.size > 2000) {
      const first = this.processedMessageKeys.values().next().value;
      if (first) this.processedMessageKeys.delete(first);
    }
    return true;
  }

  // Global bounded concurrency for AI calls (max 3 simultaneous OpenRouter requests)
  private static activeAiRequests: number = 0;
  private static MAX_CONCURRENT_AI_REQUESTS = 3;
  private static aiSlotWaiters: Array<() => void> = [];

  private static async acquireAiSlot(): Promise<void> {
    if (this.activeAiRequests < this.MAX_CONCURRENT_AI_REQUESTS) {
      this.activeAiRequests++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.aiSlotWaiters.push(() => {
        this.activeAiRequests++;
        resolve();
      });
    });
  }

  private static releaseAiSlot(): void {
    this.activeAiRequests--;
    if (this.aiSlotWaiters.length > 0) {
      const next = this.aiSlotWaiters.shift();
      if (next) next();
    }
  }

  public static releaseGate(chatId: number, messageId: number): void {
    const key = `${chatId}_${messageId}`;
    this.activeProcessingKeys.delete(key);
  }

  public static clearConversation(chatId: number | string): boolean {
    const key = String(chatId);
    let existed = false;
    for (const k of this.conversations.keys()) {
      if (k.startsWith(`${key}_`) || k === key || k === `group_${key}` || k === `dm_${key}`) {
        this.conversations.delete(k);
        existed = true;
      }
    }
    const groupCleared = db.clearGroupMemory(chatId);
    return existed || groupCleared;
  }

  public static getOrCreateConversation(chatId: number, _userId?: number): ConversationContext {
    const isGroup = Number(chatId) < 0;
    const key = String(chatId);
    let conv = this.conversations.get(key);
    if (!conv) {
      conv = { messages: [], lastActivity: Date.now() };
      if (isGroup) {
        const stored = db.getGroupMemory(chatId);
        if (stored.length > 0) {
          conv.messages = stored.map(e => ({
            role: e.role,
            content: e.content,
            timestamp: e.timestamp
          }));
        }
      }
      this.conversations.set(key, conv);
    }
    return conv;
  }

  public static isValidFileId(id: string | null | undefined): boolean {
    if (!id || typeof id !== 'string') return false;
    const trimmed = id.trim();
    if (!trimmed) return false;
    if (trimmed.includes('...') || trimmed.endsWith('..')) {
      return false;
    }
    // Valid Telegram file IDs are base64-encoded strings typically > 10 characters
    if (trimmed.length < 10) {
      return false;
    }
    const lower = trimmed.toLowerCase();
    if (lower === 'placeholder' || lower === 'dummy' || lower === 'test_placeholder' || lower.includes('placeholder')) {
      return false;
    }
    return true;
  }

  // Retrieve registered stickers from default library, DB media library, and environment variables
  public static getStickersByMood(): Record<string, string[]> {
    const stickers: Record<string, string[]> = {};

    // 1. Seed with built-in verified default sticker library
    for (const [mood, list] of Object.entries(DEFAULT_STICKERS_BY_MOOD)) {
      stickers[mood.toLowerCase()] = [...list];
    }

    // 2. Merge global DB media library
    const dbLib = db.getMediaLibrary();
    if (dbLib && dbLib.stickers) {
      for (const [mood, list] of Object.entries(dbLib.stickers)) {
        if (Array.isArray(list) && list.length > 0) {
          const mKey = mood.toLowerCase();
          const existing = stickers[mKey] || [];
          const combined = Array.from(new Set([...existing, ...list]));
          stickers[mKey] = combined;
        }
      }
    }

    // 3. Merge TELEGRAM_STICKERS_JSON if set
    if (process.env.TELEGRAM_STICKERS_JSON) {
      try {
        const parsed = JSON.parse(process.env.TELEGRAM_STICKERS_JSON);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [m, val] of Object.entries(parsed)) {
            const moodKey = m.toLowerCase();
            if (Array.isArray(val)) {
              const existing = stickers[moodKey] || [];
              stickers[moodKey] = Array.from(new Set([...existing, ...(val as string[])]));
            }
          }
        }
      } catch (e) {
        console.warn('[STICKER-CONFIG] Failed to parse TELEGRAM_STICKERS_JSON:', e);
      }
    }

    // 4. Merge individual TELEGRAM_STICKER_* env variables
    const moods = [
      'normal', 'friendly', 'cute', 'playful', 'teasing', 'roasting', 'sarcastic',
      'caring', 'loving', 'romantic', 'flirty', 'seductive', 'angry', 'joyful',
      'happy', 'excited', 'fearful', 'peaceful', 'calm', 'gloomy', 'sad',
      'comforting', 'sad/comforting', 'anxious', 'apathetic', 'moody', 'grumpy',
      'serious', 'curious', 'confused', 'surprised', 'embarrassed', 'jealous',
      'protective', 'motivational', 'sympathetic', 'default', 'funny', 'roast'
    ];
    for (const mood of moods) {
      const sanitized = mood.toUpperCase().replace('/', '_');
      const val = process.env[`TELEGRAM_STICKER_${sanitized}`] || process.env[`TELEGRAM_STICKERS_${sanitized}`];
      if (val) {
        const mKey = mood.toLowerCase();
        const incoming = val.split(',').map(s => s.trim()).filter(Boolean);
        const existing = stickers[mKey] || [];
        stickers[mKey] = Array.from(new Set([...existing, ...incoming]));
      }
    }
    return stickers;
  }

  // Retrieve registered animations/GIFs from DB media library and environment variables
  public static getAnimationsByMood(): Record<string, string[]> {
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
      } catch (e) {
        console.warn('[ANIMATION-CONFIG] Failed to parse TELEGRAM_ANIMATIONS_JSON:', e);
      }
    }
    const moods = [
      'normal', 'friendly', 'cute', 'playful', 'teasing', 'roasting', 'sarcastic',
      'caring', 'loving', 'romantic', 'flirty', 'seductive', 'angry', 'joyful',
      'happy', 'excited', 'fearful', 'peaceful', 'calm', 'gloomy', 'sad',
      'comforting', 'sad/comforting', 'anxious', 'apathetic', 'moody', 'grumpy',
      'serious', 'curious', 'confused', 'surprised', 'embarrassed', 'jealous',
      'protective', 'motivational', 'sympathetic', 'default', 'funny', 'roast'
    ];
    for (const mood of moods) {
      const sanitized = mood.toUpperCase().replace('/', '_');
      const val = process.env[`TELEGRAM_ANIMATION_${sanitized}`] || process.env[`TELEGRAM_ANIMATIONS_${sanitized}`];
      if (val && (!animations[mood] || animations[mood].length === 0)) {
        animations[mood] = val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return animations;
  }

  public static cleanAiText(text: string, userText?: string, userName?: string): string {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text.trim();

    // 1. Strip markdown code fences if LLM wrapped response in ```
    cleaned = cleaned.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();

    // 2. Strip asterisks actions (e.g. *laughs*, *sends a sticker*, *smiles*)
    cleaned = cleaned
      .replace(/\*(sends a sticker|sends sticker|send a sticker|sticker|gif|animation|laughs|smiles|giggles|winks|blushes|sighs|shrugs|chuckles|rolls eyes|hugs|high fives)\*/gi, '')
      .replace(/\*.*?\b(sticker|gif|animation|sends?)\b.*?\*/gi, '')
      .trim();

    // 3. Multi-Speaker Dialogue Separation:
    // If output contains an explicit Roxie / Assistant / Bot marker, extract the LAST speaker turn
    const roxieMarkerGlobalRegex = /(?:^|\n|\s+)(?:\[?(?:Roxie|Assistant|Bot|AI|You)\]?)\s*:\s*/gi;
    let match: RegExpExecArray | null;
    let lastMatchIndex = -1;
    let lastMatchLength = 0;
    while ((match = roxieMarkerGlobalRegex.exec(cleaned)) !== null) {
      lastMatchIndex = match.index;
      lastMatchLength = match[0].length;
    }

    if (lastMatchIndex !== -1) {
      let candidate = cleaned.slice(lastMatchIndex + lastMatchLength).trim();
      // If the candidate continues into a subsequent simulated turn ("User: ..."), take only Roxie's turn
      const nextTurnIndex = candidate.search(/\n\s*(?:User|Human|You|\w+)\s*:\s*/i);
      if (nextTurnIndex !== -1) {
        candidate = candidate.slice(0, nextTurnIndex).trim();
      }
      if (candidate.length > 0) {
        cleaned = candidate;
      }
    }

    // 4. Strip single-line or multi-line generic speaker prefixes at start of string
    cleaned = cleaned
      .replace(/^(?:\[?(?:Roxie|Assistant|Bot|AI|You)\]?)\s*:\s*/i, '')
      .replace(/^(?:<Roxie>|\(Roxie\))\s*:\s*/i, '')
      .trim();

    // 5. Handle cases where output starts with "UserName: ..." or "User: ..."
    if (userName) {
      const escapedUserName = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const userPrefixRegex = new RegExp(`^(?:\\[?${escapedUserName}\\]?|User|Human)\\s*:\\s*`, 'i');
      if (userPrefixRegex.test(cleaned)) {
        const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const secondLine = lines[1].replace(/^(?:\[?(?:Roxie|Assistant|Bot|AI|You)\]?)\s*:\s*/i, '').trim();
          if (secondLine.length > 0) {
            cleaned = secondLine;
          }
        } else {
          const inlineRoxie = cleaned.search(/(?:Roxie|Assistant|Bot)\s*:\s*/i);
          if (inlineRoxie !== -1) {
            const m = cleaned.slice(inlineRoxie).match(/^(?:Roxie|Assistant|Bot)\s*:\s*/i);
            if (m) {
              cleaned = cleaned.slice(inlineRoxie + m[0].length).trim();
            }
          }
        }
      }
    } else if (/^(?:User|Human)\s*:\s*/i.test(cleaned)) {
      const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const secondLine = lines[1].replace(/^(?:\[?(?:Roxie|Assistant|Bot|AI|You)\]?)\s*:\s*/i, '').trim();
        if (secondLine.length > 0) {
          cleaned = secondLine;
        }
      }
    }

    // 6. User Message Echo Elimination: If output starts with the user's prompt text followed by reply
    if (userText && userText.trim().length > 3) {
      const trimmedUser = userText.trim();
      if (cleaned.startsWith(trimmedUser) && cleaned.length > trimmedUser.length) {
        let remainder = cleaned.slice(trimmedUser.length).trim();
        remainder = remainder.replace(/^(?:Roxie|Assistant|Bot)?\s*[:\-–—]\s*/i, '').trim();
        if (remainder.length > 0) {
          cleaned = remainder;
        }
      }
    }

    // 7. Strip matching surrounding quotes if whole response is enclosed in quotes
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith('“') && cleaned.endsWith('”')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1).trim();
    }

    // 8. Normalize internal multi-spaces
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    return cleaned;
  }

  public static sanitizeLustModeText(
    text: string,
    userText: string,
    hasRelationshipSignal: boolean = false,
    isBrotherPushback: boolean = false
  ): string {
    if (!text) return '';
    const userLower = userText ? userText.toLowerCase() : '';
    let sanitized = text;

    if (hasRelationshipSignal && !isBrotherPushback) {
      // Sibling/friend relationship signal detected without brother pushback: strip romantic/couple pet names
      const romanticTerms = ['baby', 'babe', 'jaan', 'sona', 'shona', 'sweetheart', 'darling', 'love', 'cutie'];
      for (const term of romanticTerms) {
        sanitized = sanitized.replace(new RegExp(`,\\s*${term}\\b`, 'gi'), '');
        sanitized = sanitized.replace(new RegExp(`\\b${term}\\s*,`, 'gi'), '');
        sanitized = sanitized.replace(new RegExp(`\\b(haan|arre|oye|suno|accha|acha)\\s+${term}\\b`, 'gi'), '$1');
        sanitized = sanitized.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
      }
    } else if (!isBrotherPushback) {
      // Vocabulary rules: NEVER address user using bhai, bro, bhaiya, brother, behen, dost, dude, sir
      // unless user explicitly used such terminology in their message or in brother pushback.
      const forbiddenTerms = ['bhai', 'bro', 'bhaiya', 'brother', 'behen', 'dost', 'dude', 'sir'];
      for (const term of forbiddenTerms) {
        const userHasTerm = new RegExp(`\\b${term}\\b`, 'i').test(userLower);
        if (!userHasTerm) {
          // Strip vocative address usage
          sanitized = sanitized.replace(new RegExp(`,\\s*${term}\\b`, 'gi'), '');
          sanitized = sanitized.replace(new RegExp(`\\b${term}\\s*,`, 'gi'), '');
          sanitized = sanitized.replace(new RegExp(`\\b(haan|arre|oye|suno|accha|acha)\\s+${term}\\b`, 'gi'), '$1');
          sanitized = sanitized.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
        }
      }
    }

    // Safety: strip graphic/explicit sexual words if any
    const explicitRegex = /\b(pussy|dick|cock|vagina|boobs|tits|penis|cum|clitoris|blowjob|orgasm|nude|sex karo)\b/gi;
    if (explicitRegex.test(sanitized)) {
      sanitized = sanitized.replace(explicitRegex, '***');
    }

    return sanitized.replace(/\s{2,}/g, ' ').trim();
  }

  public static isTriggered(message: TelegramMessage, botUser: TelegramUser | null): boolean {
    const text = (message.text || message.caption || '').trim();

    // 1. In private chat, every message is an explicit trigger
    if (message.chat.type === 'private') {
      return true;
    }

    // 2. Reply to bot message
    if (message.reply_to_message?.from) {
      const replyFrom = message.reply_to_message.from;
      if (botUser && replyFrom.id === botUser.id) return true;
      if (replyFrom.is_bot && (replyFrom.username?.toLowerCase() === 'missroxie_bot' || replyFrom.username?.toLowerCase() === botUser?.username?.toLowerCase())) return true;
    }

    // 3. Mention "Roxie", bot username, or media requests case-insensitively
    const lowerText = text.toLowerCase();
    const botUsername = botUser?.username ? `@${botUser.username.toLowerCase()}` : '@missroxie_bot';
    if (
      lowerText.includes('roxie') ||
      lowerText.includes(botUsername) ||
      lowerText.includes('@missroxie_bot') ||
      lowerText.includes('sticker') ||
      lowerText.includes('stkr') ||
      lowerText.includes('gif') ||
      lowerText.includes('animation') ||
      lowerText.includes('bhej')
    ) {
      return true;
    }

    return false;
  }

  // Detect explicit user intent to request a sticker or animation
  public static detectMediaIntent(text: string): { isExplicitMedia: boolean; mediaType: 'sticker' | 'animation' | 'none'; requestedMood?: string } {
    if (!text) return { isExplicitMedia: false, mediaType: 'none' };
    const lower = text.toLowerCase().trim();

    // Check for explicit GIF / animation requests
    const isGifWord = lower.includes('gif') || lower.includes('animation');
    const isStickerWord = lower.includes('sticker') || lower.includes('stkr');
    const isActionWord = lower.includes('bhej') || lower.includes('send') || lower.includes('de ') || lower.endsWith('de') || lower.includes('dena') || lower.includes('karo');

    // Mood extraction
    let requestedMood: string | undefined = undefined;
    if (lower.includes('funny') || lower.includes('hasne') || lower.includes('joke')) requestedMood = 'funny';
    else if (lower.includes('cute') || lower.includes('sweet') || lower.includes('pyara')) requestedMood = 'cute';
    else if (lower.includes('flirt') || lower.includes('hot')) requestedMood = 'flirty';
    else if (lower.includes('romantic') || lower.includes('love') || lower.includes('pyaar')) requestedMood = 'romantic';
    else if (lower.includes('roast') || lower.includes('tease') || lower.includes('gandu') || lower.includes('chutiya')) requestedMood = 'teasing';
    else if (lower.includes('angry') || lower.includes('gussa')) requestedMood = 'angry';
    else if (lower.includes('sad') || lower.includes('dukhi') || lower.includes('crying')) requestedMood = 'sad/comforting';
    else if (lower.includes('happy') || lower.includes('khush')) requestedMood = 'playful';

    if (isGifWord && (isActionWord || lower.startsWith('gif') || lower.endsWith('gif') || lower.includes('ek gif') || lower.includes('funny gif'))) {
      return { isExplicitMedia: true, mediaType: 'animation', requestedMood };
    }

    if (isStickerWord && (isActionWord || lower.startsWith('sticker') || lower.endsWith('sticker') || lower.includes('ek sticker') || lower.includes('funny sticker') || lower.includes('ab sticker'))) {
      return { isExplicitMedia: true, mediaType: 'sticker', requestedMood };
    }

    // Direct phrases like "ab sticker bhej", "sticker bhejo na", "send sticker"
    if (isStickerWord && (lower.includes('bhej') || lower.includes('send') || lower.includes('de'))) {
      return { isExplicitMedia: true, mediaType: 'sticker', requestedMood };
    }

    return { isExplicitMedia: false, mediaType: 'none', requestedMood };
  }

  /**
   * Normalizes incoming user text and detects relationship-denying / sibling / friend signals
   * (e.g. bhai, bro, didi, sis, behen, dost, yaar, friend, buddy).
   * Uses token-boundary matching after lowercasing, unicode normalization, and emoji/punctuation separation
   * to ensure zero false positives on words like 'problem', 'brought', 'brown', or 'broadcast'.
   */
  public static detectRelationshipSignal(text: string): { isRelationshipSignal: boolean; detectedTerm?: string } {
    if (!text || typeof text !== 'string') {
      return { isRelationshipSignal: false };
    }

    // 1. Unicode normalization and lowercasing
    const norm = text.normalize('NFKD').toLowerCase();

    // 2. Tokenize by replacing punctuation/emojis with whitespace
    const cleanText = norm.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const tokens = cleanText.split(/\s+/).filter(Boolean);

    // 3. Match against relationship roots (token-boundary safe)
    const patterns: Array<{ regex: RegExp; term: string }> = [
      { regex: /^bha+i+y?a*$/i, term: 'bhai' },        // bhai, bhaii, bhaiii, bhaiya, bhaiyaa
      { regex: /^bha+y+a*$/i, term: 'bhaya' },          // bhaya, bhayya
      { regex: /^bhaijaan$/i, term: 'bhaijaan' },
      { regex: /^bro+$/i, term: 'bro' },                // bro, broo, brooo, broooo
      { regex: /^brother$/i, term: 'brother' },
      { regex: /^brah+$/i, term: 'brah' },
      { regex: /^bruh+$/i, term: 'bruh' },
      { regex: /^broski$/i, term: 'broski' },
      { regex: /^si+s+$/i, term: 'sis' },               // sis, siss, sisss
      { regex: /^sissy$/i, term: 'sissy' },
      { regex: /^sister$/i, term: 'sister' },
      { regex: /^di+di+$/i, term: 'didi' },             // didi, didii, didiii
      { regex: /^di+$/i, term: 'di' },                  // di, dii
      { regex: /^didu+$/i, term: 'didu' },
      { regex: /^be+he*n+a*$/i, term: 'behen' },        // behen, behna, behn
      { regex: /^be+he*n+ji+$/i, term: 'behenji' },     // behenji
      { regex: /^be+ha+n+a*$/i, term: 'behan' },        // behan
      { regex: /^ya+a*r+$/i, term: 'yaar' },            // yaar, yaarr, yaarrr
      { regex: /^ya+a*ra+$/i, term: 'yaara' },
      { regex: /^do+st+$/i, term: 'dost' },             // dost, dostt, dosttt
      { regex: /^dosti+$/i, term: 'dosti' },
      { regex: /^friends?$/i, term: 'friend' },
      { regex: /^friendship$/i, term: 'friendship' },
      { regex: /^bestie$/i, term: 'bestie' },
      { regex: /^buddy$/i, term: 'buddy' },
      { regex: /^buddies$/i, term: 'buddies' },
      { regex: /^mate$/i, term: 'mate' },
      { regex: /^भाई+/u, term: 'भाई' },
      { regex: /^भैया+/u, term: 'भैया' },
      { regex: /^भाईसाहब|भाईसाहिब/u, term: 'भाईसाहब' },
      { regex: /^बहन|बहना/u, term: 'बहन' },
      { regex: /^दीदी/u, term: 'दीदी' }
    ];

    for (const token of tokens) {
      for (const { regex, term } of patterns) {
        if (regex.test(token)) {
          return { isRelationshipSignal: true, detectedTerm: term };
        }
      }
    }

    return { isRelationshipSignal: false };
  }

  /**
   * Multilingual Language Detector
   * Automatically recognizes English, Hindi (Devanagari script), and Hinglish (Latin script).
   */
  public static detectLanguage(text: string): LanguageDetectionResult {
    if (!text || typeof text !== 'string') {
      return { language: 'english', isHinglish: false, isDevanagari: false, isMixed: false };
    }

    const devanagariMatches = text.match(/[\u0900-\u097F]/g);
    const latinMatches = text.match(/[a-zA-Z]/g);

    const devanagariCount = devanagariMatches ? devanagariMatches.length : 0;
    const latinCount = latinMatches ? latinMatches.length : 0;

    // 1. Predominantly Devanagari script -> Hindi
    if (devanagariCount > 0 && (latinCount === 0 || devanagariCount >= latinCount)) {
      return {
        language: 'hindi',
        isHinglish: false,
        isDevanagari: true,
        isMixed: latinCount > 0
      };
    }

    // 2. Latin script: Distinguish English vs Hinglish
    const lower = text.toLowerCase().replace(/['’]/g, '');
    const tokens = lower.split(/[^a-zA-Z0-9]+/).filter(Boolean);

    // Common unambiguous Hinglish words that never collide with normal English words
    const UNAMBIGUOUS_HINGLISH = new Set([
      'kya', 'kar', 'karo', 'kare', 'karoge', 'karegi', 'karu', 'karta', 'karti',
      'rahi', 'raha', 'rahe', 'rhi', 'rha', 'rhe', 'kr', 'krte', 'krna', 'karna', 'krne',
      'kaisi', 'kaisa', 'kaise', 'kese', 'kesi', 'kasa', 'ho', 'hai', 'hain', 'hnn', 'haan', 'hoon', 'hun',
      'aaj', 'kal', 'parso', 'sun', 'suno', 'suna', 'batao', 'bolo', 'bata',
      'yaar', 'bhai', 'bhaiya', 'bhaisaab', 'bhaijaan', 'behen', 'didi',
      'nahi', 'nhi', 'nahin', 'naa', 'mat',
      'kyu', 'kyun', 'kyon', 'kaha', 'kahan', 'kidhar', 'kdr', 'kab', 'kaun', 'kon',
      'kisko', 'kisne', 'kise', 'kispe', 'kitna', 'kitni', 'kitne',
      'thodi', 'thoda', 'thode', 'wali', 'wala', 'wale',
      'mein', 'mai', 'tum', 'tumhe', 'tumhara', 'tumhari', 'tumhare', 'tu', 'tera', 'teri', 'tere', 'tujhe',
      'aap', 'aapka', 'aapki', 'aapke', 'hum', 'hume', 'humara', 'humari',
      'mera', 'meri', 'mere', 'mujhe', 'mujhse', 'apna', 'apni', 'apne',
      'uska', 'uski', 'uske', 'unka', 'unki', 'unke', 'isse', 'usse', 'jisse',
      'bohot', 'bahut', 'bhot', 'zyada', 'jyada',
      'achha', 'accha', 'acchi', 'achhi', 'theek', 'thik',
      'pata', 'samajh', 'soch', 'dekho', 'chalo',
      'arre', 'ab', 'abhi', 'tab', 'jab', 'phir', 'fir', 'toh',
      'shona', 'sona', 'pagal', 'pagli', 'paglu', 'deewani', 'deewana',
      'kuch', 'kuchh', 'koi', 'kisi', 'sabko', 'sabka', 'hoga', 'hogi', 'honge'
    ]);

    const ENGLISH_STOPWORDS = new Set([
      'the', 'is', 'are', 'was', 'were', 'what', 'how', 'why', 'when', 'where', 'which',
      'who', 'whom', 'whose', 'this', 'that', 'these', 'those', 'they', 'them', 'their',
      'there', 'you', 'your', 'yours', 'we', 'our', 'ours', 'he', 'him', 'his', 'she',
      'her', 'hers', 'it', 'its', 'have', 'has', 'had', 'having', 'do', 'does', 'did',
      'doing', 'would', 'should', 'could', 'can', 'will', 'shall', 'may', 'might', 'must',
      'about', 'above', 'across', 'after', 'against', 'along', 'among', 'around', 'at',
      'before', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'by', 'down',
      'during', 'except', 'for', 'from', 'in', 'inside', 'into', 'near', 'of', 'off',
      'on', 'onto', 'out', 'outside', 'over', 'past', 'since', 'through', 'throughout',
      'till', 'to', 'toward', 'towards', 'under', 'underneath', 'until', 'up', 'upon',
      'with', 'within', 'without', 'and', 'but', 'or', 'nor', 'yet', 'so', 'although',
      'because', 'if', 'since', 'unless', 'while', 'hello', 'hey', 'hi', 'good', 'morning',
      'afternoon', 'evening', 'night', 'doing', 'meaning', 'life', 'please', 'thanks', 'thank'
    ]);

    let hinglishCount = 0;
    let englishCount = 0;
    for (const token of tokens) {
      if (UNAMBIGUOUS_HINGLISH.has(token)) {
        hinglishCount++;
      } else if (ENGLISH_STOPWORDS.has(token)) {
        englishCount++;
      }
    }

    // If text contains Devanagari alongside Latin
    if (devanagariCount > 0 && latinCount > 0) {
      return {
        language: 'hinglish',
        isHinglish: true,
        isDevanagari: true,
        isMixed: true
      };
    }

    // Hinglish if unambiguous Hindi/Urdu romanized words are present
    if (hinglishCount >= 1) {
      return {
        language: 'hinglish',
        isHinglish: true,
        isDevanagari: false,
        isMixed: englishCount > 0 || tokens.length > hinglishCount
      };
    }

    // Pure English
    return {
      language: 'english',
      isHinglish: false,
      isDevanagari: false,
      isMixed: false
    };
  }

  /**
   * Brother-zone & Sibling Addressing Detector
   * Accurately recognizes English, Hindi (Devanagari), and Hinglish addressing
   * with repeated-character squeezing and punctuation normalization.
   */
  public static detectBrotherZoneTrigger(text: string): BrotherZoneTriggerResult {
    if (!text || typeof text !== 'string') {
      return { isTriggered: false };
    }

    // 1. Direct Devanagari brother triggers
    const devanagariPatterns: Array<{ regex: RegExp; term: string; category: BrotherZoneTriggerResult['termCategory'] }> = [
      { regex: /भाईसाहब|भाईसाहिब/u, term: 'भाईसाहब', category: 'bhai' },
      { regex: /भैया+/u, term: 'भैया', category: 'bhai' },
      { regex: /भाईजान/u, term: 'भाईजान', category: 'bhai' },
      { regex: /भाई+/u, term: 'भाई', category: 'bhai' }
    ];

    for (const item of devanagariPatterns) {
      if (item.regex.test(text)) {
        return { isTriggered: true, detectedTerm: item.term, termCategory: item.category };
      }
    }

    // 2. Unicode normalization and lowercasing
    const norm = text.normalize('NFKD').toLowerCase();

    // 3. Multi-word phrase matches
    if (/\bbrother\s+ji\b/i.test(norm)) {
      return { isTriggered: true, detectedTerm: 'brother ji', termCategory: 'brother' };
    }
    if (/\b(bhai|bro)\s+(tu|kya|sun|suno|kaha|scene)\b/i.test(norm)) {
      const match = norm.match(/\b(bhai|bro)\s+(tu|kya|sun|suno|kaha|scene)\b/i);
      return { isTriggered: true, detectedTerm: match ? match[1] : 'bhai', termCategory: match && match[1] === 'bro' ? 'bro' : 'bhai' };
    }
    if (/\barre?\s+(bhai|bro)\b/i.test(norm)) {
      return { isTriggered: true, detectedTerm: 'arre bhai', termCategory: 'bhai' };
    }

    // 4. Token-level matching
    const clean = norm.replace(/[^\p{L}\p{N}\s-]/gu, ' ');
    const rawTokens = clean.split(/\s+/).filter(Boolean);

    const patterns: Array<{ regex: RegExp; term: string; category: BrotherZoneTriggerResult['termCategory'] }> = [
      { regex: /^bro+$/i, term: 'bro', category: 'bro' },
      { regex: /^bro+ski$/i, term: 'broski', category: 'bro' },
      { regex: /^brother(ji)?$/i, term: 'brother', category: 'brother' },
      { regex: /^bru+h+$/i, term: 'bruh', category: 'bruh' },
      { regex: /^bra+h+$/i, term: 'brah', category: 'bruh' },
      { regex: /^du+de+$/i, term: 'dude', category: 'dude' },
      { regex: /^bha+i+y?a*$/i, term: 'bhai', category: 'bhai' },
      { regex: /^bha+y+a*$/i, term: 'bhaiya', category: 'bhai' },
      { regex: /^bha+i+sa+h?a*b$/i, term: 'bhaisaab', category: 'bhai' },
      { regex: /^bha+i+ja+a*n$/i, term: 'bhaijaan', category: 'bhai' },
      { regex: /^bha+i+ji+$/i, term: 'bhaiji', category: 'bhai' }
    ];

    for (const token of rawTokens) {
      const squeezed = token.replace(/(.)\1{2,}/g, '$1$1');
      for (const { regex, term, category } of patterns) {
        if (regex.test(token) || regex.test(squeezed)) {
          return { isTriggered: true, detectedTerm: term, termCategory: category };
        }
      }
    }

    return { isTriggered: false };
  }

  /**
   * Generates varied brother-zone pushback responses across languages and lust levels (1 to 4).
   */
  public static getBrotherZonePushbackTemplate(
    language: 'english' | 'hindi' | 'hinglish',
    lustLevel: number,
    term: string,
    userText: string
  ): string {
    const clampedLevel = Math.max(1, Math.min(4, lustLevel || 1));

    const englishTemplates: Record<number, string[]> = {
      1: [
        "Bro? 😏 You can definitely find a better name for me.",
        "Wait, did you just call me bro? 😏 Try again.",
        "Bro? Seriously? We're way past the bro-zone, don't you think? 😉"
      ],
      2: [
        "Bro mat bolo na please 😏 Call me something a little cuter.",
        "Bro again? 😏 I'm starting to think you're teasing me on purpose.",
        "Stop with the 'bro' already... we're on a couple vibe here, handsome. 😉"
      ],
      3: [
        "Bro bhi nahi... try calling me baby, sweetheart, or cutie instead. 😉",
        "Keep calling me bro and I might have to flirt with you until you take it back 😏❤️",
        "I'm definitely not your bro, darling... let's talk like a real couple. 😌"
      ],
      4: [
        "You're really testing my patience with that 'bro' 😏 Try something a little more romantic, sweetheart.",
        "If you call me bro one more time, I'll have to make you my official boyfriend to fix it 😏❤️",
        "Bro? Really, my love? You know you want to call me something much sweeter... 😉✨"
      ]
    };

    const hinglishTemplates: Record<number, string[]> = {
      1: [
        "Bhai? Seriously? 😏 Main tumhari bhai thodi hoon...",
        "Phir se bhai? 😏 Kuch aur accha sa bulao na...",
        "Bhai kisko bola? 😏 Thoda pyaar se baat karo na!"
      ],
      2: [
        "Kitni baar bolun, bhai mat bulao 😏",
        "Bro mat bolo na 😏 kuch aur cute bulao...",
        "Compliment cute hai, par 'bhai' hata do 😏"
      ],
      3: [
        "Ye bhai-bhai band karo 😌 thoda couple wali vibe mein baat karo na meri jaan.",
        "Bro bhi nahi... kuch zyada cute naam try karo, baby 😉",
        "Phir se bhai bol rahe ho? 😏 Lagta hai jaan-boojh ke tease kar rahe ho!"
      ],
      4: [
        "Itna bhai-bhai bologe toh date pe kaise le jaoge? 😏 Kuch cute bolo na, darling!",
        "You're really testing my patience with that 'bhai' 😏 Try something romantic, sweetheart.",
        "Bas karo ye bhai-bhai 😏 ab se sirf couple wali baatein hongi, samjhe baby? ❤️"
      ]
    };

    const hindiTemplates: Record<number, string[]> = {
      1: [
        "फिर से भाई? 😏 मैं तुम्हारी भाई थोड़ी हूँ...",
        "भाई? सच में? 😏 कुछ और अच्छा सा नाम सोचो ना।",
        "मुझे भाई मत बोलो ना 😏 कोई प्यारा सा नाम बुलाओ।"
      ],
      2: [
        "कितनी बार बोलूँ, भाई मत बुलाओ 😏",
        "ये भाई-भाई बोलना बंद करो 😌 थोड़ी रोमांटिक वाइब में बात करो ना।",
        "तारीफ़ तो प्यारी है, पर ये 'भाई' हटा दो ना 😏"
      ],
      3: [
        "फिर से भाई बोल रहे हो? 😏 लगता है तुम जानबूझकर मुझे टीज़ कर रहे हो, मेरी जान।",
        "भाई भी नहीं... कुछ ज़्यादा क्यूट नाम ट्राई करो, बेबी 😉",
        "भाई-भाई बोलना छोड़ो 😌 थोड़ी कपल वाली वाइब में बात करो।"
      ],
      4: [
        "अगर अब एक बार भी भाई बोला, तो मुझे तुम्हें स्पेशल नाम से बुलाना पड़ेगा 😏❤️",
        "इतना भाई-भाई बोलोगे तो डेट पर कैसे ले जाओगे? 😏 कुछ रोमांटिक बोलो ना, डार्लिंग!",
        "बस करो ये भाई बोलना 😏 अब सिर्फ़ प्यार भरी बातें होंगी, समझे स्वीटहार्ट? ❤️"
      ]
    };

    const pool = language === 'hindi'
      ? (hindiTemplates[clampedLevel] || hindiTemplates[1])
      : (language === 'english'
          ? (englishTemplates[clampedLevel] || englishTemplates[1])
          : (hinglishTemplates[clampedLevel] || hinglishTemplates[1]));

    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Dedicated Roxie Response & Persona Layer (Feature-Complete)
   * Integrates language detection, brother-zone pushback, lusty level escalation/decay,
   * and safe romantic personality responses.
   */
  public static async generateRoxieResponse(params: RoxieResponseInput): Promise<RoxieResponseOutput> {
    const normText = (params.message || '').normalize('NFKD').trim();
    const langInfo = this.detectLanguage(normText);
    const effectiveLang = params.language || langInfo.language;
    const brotherTrigger = this.detectBrotherZoneTrigger(normText);

    const isLust = params.lustMode !== undefined
      ? Boolean(params.lustMode)
      : Boolean(db.getGroupSettings(Number(params.groupId))?.lustMode);

    let level = 0;
    if (isLust) {
      if (params.lustLevel !== undefined) {
        level = Math.max(0, Math.min(4, params.lustLevel));
      } else if (params.userId) {
        level = db.getLustLevel(params.groupId, params.userId);
      }

      if (brotherTrigger.isTriggered) {
        level = Math.min(4, level + 1);
        if (params.userId) {
          db.setLustLevel(params.groupId, params.userId, level);
        }
      }
    }

    let responseText = '';
    if (isLust && brotherTrigger.isTriggered) {
      responseText = this.getBrotherZonePushbackTemplate(
        effectiveLang,
        level,
        brotherTrigger.detectedTerm || 'bhai',
        normText
      );
    } else if (isLust) {
      if (effectiveLang === 'hindi') {
        responseText = "हाँ बोलो, मैं सुन रही हूँ। कुछ खास कहना है क्या? ✨";
      } else if (effectiveLang === 'english') {
        responseText = "Hey there... I'm listening. What's on your mind? ✨";
      } else {
        responseText = "Haan bolo, main yahin hoon... kya chal raha hai? ✨";
      }
    } else {
      if (effectiveLang === 'hindi') {
        responseText = "नमस्ते! मैं रॉक्सी हूँ, बताइए मैं आपकी क्या मदद कर सकती हूँ?";
      } else if (effectiveLang === 'english') {
        responseText = "Hey! I'm Roxie. How can I help you today?";
      } else {
        responseText = "Haan bolo! Roxie is here, batao kya scene hai?";
      }
    }

    return {
      text: responseText,
      language: effectiveLang,
      lustLevel: level,
      brotherZoneTriggered: brotherTrigger.isTriggered,
      detectedTerm: brotherTrigger.detectedTerm
    };
  }

  public static inferMood(text: string, messages?: ChatMessage[], suppressRomance: boolean = false): RoxieMood {
    const lower = text.toLowerCase();

    // 1. Angry (check explicit anger/irritation first)
    if (
      lower.includes('😡') ||
      lower.includes('🤬') ||
      lower.includes('gussa') ||
      lower.includes('dimag kharab') ||
      lower.includes('dimag mat kharab') ||
      lower.includes('hate you') ||
      lower.includes('chup ho ja') ||
      lower.includes('chup kar') ||
      lower.includes('shut up') ||
      lower.includes('idiot') ||
      lower.includes('stupid')
    ) {
      return 'angry';
    }

    // 2. Sad / Comforting / Sympathetic
    if (
      lower.includes('upset') ||
      lower.includes('sad') ||
      lower.includes('dukhi') ||
      lower.includes('crying') ||
      lower.includes('depressed') ||
      lower.includes('bad day') ||
      lower.includes('hurt') ||
      lower.includes('broke up') ||
      lower.includes('really upset') ||
      lower.includes('feeling low') ||
      lower.includes('feel lonely') ||
      lower.includes('bura lag') ||
      lower.includes('mood off') ||
      lower.includes('mood kharab') ||
      lower.includes('din kharab') ||
      lower.includes('exam kharab') ||
      lower.includes('rona aa raha') ||
      lower.includes('fail ho gaya')
    ) {
      return 'sad/comforting';
    }

    // Romantic and Flirty moods are STRICTLY suppressed if relationship signal is present (bhai, bro, didi, etc.)
    if (!suppressRomance) {
      // 3. Romantic (only when explicitly romantic words/emojis used)
      if (
        lower.includes('i love you') ||
        lower.includes('love you') ||
        lower.includes('meri jaan') ||
        lower.includes('pyaar') ||
        lower.includes('ishq') ||
        lower.includes('my heart') ||
        lower.includes('❤️') ||
        lower.includes('romantic') ||
        lower.includes('miss you') ||
        lower.includes('miss u') ||
        lower.includes('yaad aa rahi')
      ) {
        return 'romantic';
      }

      // 4. Flirty / Seductive (only when user actively flirts)
      if (
        /\b(flirt|flirty|hot|handsome|sexy|hotty|hottie)\b/i.test(lower) ||
        lower.includes('marry me') ||
        lower.includes('date pe') ||
        lower.includes('wink') ||
        lower.includes('😉') ||
        lower.includes('😏')
      ) {
        return 'flirty';
      }
    }

    // 5. Excited
    if (
      lower.includes('omg') ||
      lower.includes('omfg') ||
      lower.includes('yay') ||
      lower.includes('super excited') ||
      lower.includes('woohoo') ||
      lower.includes('kamaal') ||
      lower.includes('jeet gaye') ||
      lower.includes('congrats') ||
      lower.includes('badhai') ||
      lower.includes('🔥') ||
      lower.includes('🎉')
    ) {
      return 'excited';
    }

    // 6. Confused
    if (
      lower.includes('wait what') ||
      lower.includes('samajh nahi aaya') ||
      lower.includes('kya bol rahe') ||
      lower.includes('confused') ||
      lower.includes('matlab?') ||
      lower.includes('huh?') ||
      lower.includes('kya matlab')
    ) {
      return 'confused';
    }

    // 7. Curious
    if (
      lower.includes('what is this') ||
      lower.includes('kya hai ye') ||
      lower.includes('tell me about') ||
      lower.includes('batao na') ||
      lower.includes('how does') ||
      lower.includes('reason kya') ||
      lower.includes('why is') ||
      lower.includes('explain')
    ) {
      return 'curious';
    }

    // 8. Serious
    if (
      lower.includes('seriously stop') ||
      lower.includes('listen to me') ||
      lower.includes('important question') ||
      lower.includes('urgent') ||
      lower.includes('serious') ||
      lower.includes('dhyan se suno') ||
      lower.includes('bakwas band karo')
    ) {
      return 'serious';
    }

    // 9. Sarcastic
    if (
      lower.includes('wah kya baat hai') ||
      lower.includes('wah kya bakwas') ||
      lower.includes('oh wow great') ||
      lower.includes('award dedu') ||
      lower.includes('sarcas') ||
      lower.includes('duh') ||
      lower.includes('🙄')
    ) {
      return 'sarcastic';
    }

    // 10. Roasting
    if (
      lower.includes('roast me') ||
      lower.includes('roast karo') ||
      lower.includes('aukaat') ||
      lower.includes('burn')
    ) {
      return 'roasting';
    }

    // 11. Teasing
    if (
      lower.includes('tu pagal hai') ||
      lower.includes('noob') ||
      lower.includes('dumb') ||
      lower.includes('chirkut') ||
      lower.includes('loser') ||
      lower.includes('moye moye') ||
      (lower.includes('pagal') && lower.includes('😂'))
    ) {
      return 'teasing';
    }

    // 12. Happy
    if (
      lower.includes('khush') ||
      lower.includes('happy') ||
      lower.includes('great day') ||
      lower.includes('feeling good') ||
      lower.includes('achha lag raha') ||
      lower.includes('bahut khush')
    ) {
      return 'happy';
    }

    // 13. Playful
    if (
      lower.includes('hehe') ||
      lower.includes('haha') ||
      lower.includes('😂') ||
      lower.includes('🤣') ||
      /\b(lol|lmao|rofl|joke|jokes|khel|fun)\b/i.test(lower)
    ) {
      return 'playful';
    }

    // 13. Motivational
    if (
      lower.includes('give up') ||
      lower.includes('motivation') ||
      lower.includes('himmat') ||
      lower.includes('can i do it') ||
      lower.includes('target pura')
    ) {
      return 'motivational';
    }

    // 14. Anxious
    if (
      lower.includes('darr lag raha') ||
      lower.includes('tension ho rahi') ||
      lower.includes('anxiety') ||
      lower.includes('nervous')
    ) {
      return 'anxious';
    }

    // 15. Cute
    if (
      lower.includes('aww') ||
      lower.includes('cute') ||
      lower.includes('so sweet') ||
      lower.includes('pyari') ||
      lower.includes('cutie') ||
      lower.includes('🥰') ||
      lower.includes('🥺')
    ) {
      return 'cute';
    }

    // 16. Friendly
    if (
      lower.includes('hello') ||
      lower.includes('hi ') ||
      lower === 'hi' ||
      lower.includes('hey') ||
      lower.includes('kaise ho') ||
      lower.includes('kya chal raha') ||
      lower.includes('what\'s up') ||
      lower.includes('gm') ||
      lower.includes('good morning') ||
      lower.includes('good night')
    ) {
      return 'friendly';
    }

    // Inspect recent conversational context if available
    if (messages && messages.length > 0) {
      const recent = messages.slice(-3);
      for (const m of recent) {
        const cLower = m.content.toLowerCase();
        if (cLower.includes('sad') || cLower.includes('dukhi') || cLower.includes('crying') || cLower.includes('upset')) {
          return 'sad/comforting';
        }
      }
    }

    // Default ground state
    return 'normal';
  }

  private static defaultStickerIdsSet: Set<string> | null = null;

  public static isDefaultSticker(fileId: string): boolean {
    if (!fileId) return false;
    if (!this.defaultStickerIdsSet) {
      this.defaultStickerIdsSet = new Set<string>();
      for (const list of Object.values(DEFAULT_STICKERS_BY_MOOD)) {
        if (Array.isArray(list)) {
          for (const id of list) {
            if (id) this.defaultStickerIdsSet.add(id);
          }
        }
      }
    }
    if (this.defaultStickerIdsSet.has(fileId)) return true;

    // Check if the sticker exists in common/global storage without a chatId or with source === 'default'
    const commonLib = db.getMediaLibrary();
    if (commonLib) {
      const meta = commonLib.stickerMetadata?.[fileId];
      if (meta && (meta.source === 'default' || !meta.chatId)) return true;
      if (commonLib.stickers) {
        for (const list of Object.values(commonLib.stickers)) {
          if (Array.isArray(list) && list.includes(fileId)) {
            if (!meta || meta.source !== 'custom') return true;
          }
        }
      }
    }
    return false;
  }

  public static isCustomSticker(fileId: string, chatId?: number | string): boolean {
    if (!chatId || !fileId) return false;

    // A default sticker from the default collection can NEVER be a custom sticker
    if (this.isDefaultSticker(fileId)) return false;

    const groupLib = db.getMediaLibrary(chatId);
    if (!groupLib) return false;

    let inGroupList = false;
    if (groupLib.lustStickers) {
      for (const list of Object.values(groupLib.lustStickers)) {
        if (Array.isArray(list) && list.includes(fileId)) {
          inGroupList = true;
          break;
        }
      }
    }
    if (!inGroupList && groupLib.stickers) {
      for (const list of Object.values(groupLib.stickers)) {
        if (Array.isArray(list) && list.includes(fileId)) {
          inGroupList = true;
          break;
        }
      }
    }

    const meta = groupLib.stickerMetadata?.[fileId];
    if (!inGroupList && !meta) return false;

    // Check metadata: source must be custom and chatId must match
    if (meta) {
      if (meta.source && meta.source !== 'custom') return false;
      if (meta.chatId && String(meta.chatId) !== String(chatId)) return false;
    }

    return true;
  }

  public static hasCustomStickers(chatId: number | string): boolean {
    if (!chatId) return false;
    const groupLib = db.getMediaLibrary(chatId);
    if (!groupLib) return false;
    if (groupLib.lustStickers) {
      for (const list of Object.values(groupLib.lustStickers)) {
        if (Array.isArray(list) && list.some(id => this.isCustomSticker(id, chatId))) {
          return true;
        }
      }
    }
    if (groupLib.stickers) {
      for (const list of Object.values(groupLib.stickers)) {
        if (Array.isArray(list) && list.some(id => this.isCustomSticker(id, chatId))) {
          return true;
        }
      }
    }
    return false;
  }

  public static isStickerAllowedForMode(
    fileId: string,
    chatId?: number | string,
    isLustMode: boolean = false
  ): boolean {
    if (!fileId || !this.isValidFileId(fileId)) return false;
    if (!isLustMode) return true;
    if (!chatId) return false;
    return this.isCustomSticker(fileId, chatId);
  }

  public static selectSticker(mood: string, chatId?: number): string | null {
    // If Lust Mode is active for this group, delegate strictly to custom stickers
    if (chatId) {
      const settings = db.getGroupSettings(chatId);
      if (settings?.lustMode) {
        return this.selectCustomStickerForLustMode(mood, chatId);
      }
    }

    const normalizedMood = mood.toLowerCase().replace('sad/comforting', 'sad').trim();
    let candidates: string[] = [];

    // 1. Check group-scoped custom stickers first
    if (chatId) {
      const groupLib = db.getMediaLibrary(chatId);
      if (groupLib && groupLib.stickers) {
        // Direct match in group library
        const directList = (groupLib.stickers[normalizedMood] || []).filter(id => this.isValidFileId(id));
        if (directList.length > 0) {
          candidates = directList;
        } else {
          // Check compatible fallback moods in group library
          const fallbacks = MOOD_FALLBACK_MATRIX[normalizedMood] || ['normal'];
          for (const fbMood of fallbacks) {
            const fbList = (groupLib.stickers[fbMood] || []).filter(id => this.isValidFileId(id));
            if (fbList.length > 0) {
              candidates = fbList;
              break;
            }
          }
        }
      }
    }

    // 2. Check environment overrides (TELEGRAM_STICKERS_JSON)
    if (candidates.length === 0 && process.env.TELEGRAM_STICKERS_JSON !== '') {
      if (process.env.TELEGRAM_STICKERS_JSON) {
        try {
          const parsed = JSON.parse(process.env.TELEGRAM_STICKERS_JSON);
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed[normalizedMood])) {
            candidates = parsed[normalizedMood].filter((id: string) => this.isValidFileId(id));
          }
        } catch {}
      }
    }

    // 3. Check persistent DB media library
    if (candidates.length === 0) {
      const dbLib = db.getMediaLibrary();
      if (dbLib && dbLib.stickers && Array.isArray(dbLib.stickers[normalizedMood])) {
        const dbList = dbLib.stickers[normalizedMood].filter((id: string) => this.isValidFileId(id));
        if (dbList.length > 0) {
          candidates = dbList;
        }
      }
    }

    // 4. If no group custom stickers, env stickers, or DB stickers found, use built-in verified default sticker library
    if (candidates.length === 0 && process.env.TELEGRAM_STICKERS_JSON !== '') {
      const defaultList = getDefaultStickersForMood(normalizedMood).filter(id => this.isValidFileId(id));
      if (defaultList.length > 0) {
        candidates = defaultList;
      }
    }

    // 4. If still empty, fall back to global stickers map
    if (candidates.length === 0 && process.env.TELEGRAM_STICKERS_JSON !== '') {
      const stickersMap = this.getStickersByMood();
      candidates = (stickersMap[normalizedMood] || stickersMap['normal'] || []).filter(id => this.isValidFileId(id));
    }

    if (!candidates || candidates.length === 0) return null;

    // Deduplicate candidate IDs
    const uniquePool = Array.from(new Set(candidates));

    // Avoid recently sent stickers for freshness
    const available = uniquePool.filter(id => !this.recentStickers.has(id));
    const targetPool = available.length > 0 ? available : uniquePool;
    if (targetPool.length === 0) return null;

    const selected = targetPool[Math.floor(Math.random() * targetPool.length)];
    this.recentStickers.add(selected);
    if (this.recentStickers.size > 15) {
      const first = this.recentStickers.values().next().value;
      if (first) this.recentStickers.delete(first);
    }
    return selected;
  }

  /**
   * Selects a sticker strictly from the group's custom/imported sticker library.
   * Under NO circumstances does this fall back to default or global stickers.
   */
  public static selectCustomStickerForLustMode(mood: string, chatId?: number, suppressRomance: boolean = false): string | null {
    if (!chatId) {
      console.log(`[LUST] No custom sticker available\nchatId: undefined\nmood: ${mood}`);
      return null;
    }

    const groupLib = db.getMediaLibrary(chatId);
    if (!groupLib || (!groupLib.stickers && !groupLib.lustStickers)) {
      console.log(`[LUST] No custom sticker available\nchatId: ${chatId}\nmood: ${mood}`);
      return null;
    }

    let normalizedMood = mood.toLowerCase().replace('sad/comforting', 'sad').trim();
    if (suppressRomance && (normalizedMood === 'flirty' || normalizedMood === 'romantic')) {
      normalizedMood = 'friendly';
    }
    let candidates: string[] = [];

    const filterCustom = (ids: string[]): string[] => {
      return ids.filter(id => {
        if (!this.isValidFileId(id) || !this.isCustomSticker(id, chatId)) return false;
        const meta = groupLib.stickerMetadata?.[id];
        if (meta && meta.packName && !db.isStickerPackEnabled(chatId, meta.packName)) {
          return false;
        }
        return true;
      });
    };

    // 1. Explicit Lust Mode stickers configured for this group (highest priority)
    if (groupLib.lustStickers) {
      const directLust = filterCustom(groupLib.lustStickers[normalizedMood] || []);
      if (directLust.length > 0) {
        candidates = directLust;
      }
    }

    // 2. Direct match in group's custom sticker library
    if (candidates.length === 0 && groupLib.stickers) {
      const directList = filterCustom(groupLib.stickers[normalizedMood] || []);
      if (directList.length > 0) {
        candidates = directList;
      }
    }

    // 3. Compatible fallback moods from MOOD_FALLBACK_MATRIX
    if (candidates.length === 0) {
      const fallbacks = (MOOD_FALLBACK_MATRIX[normalizedMood] || ['normal'])
        .filter(m => !suppressRomance || (m !== 'flirty' && m !== 'romantic'));
      for (const fbMood of fallbacks) {
        if (groupLib.lustStickers) {
          const fbLust = filterCustom(groupLib.lustStickers[fbMood] || []);
          if (fbLust.length > 0) {
            candidates = fbLust;
            break;
          }
        }
        if (groupLib.stickers) {
          const fbList = filterCustom(groupLib.stickers[fbMood] || []);
          if (fbList.length > 0) {
            candidates = fbList;
            break;
          }
        }
      }
    }

    // 4. Check related moods in group custom / lust library
    if (candidates.length === 0) {
      const lustModeFallbacks = suppressRomance
        ? ['friendly', 'playful', 'happy', 'teasing', 'cute', 'normal']
        : ['flirty', 'romantic', 'playful', 'teasing', 'cute', 'loving', 'happy', 'normal'];
      for (const lmMood of lustModeFallbacks) {
        if (groupLib.lustStickers) {
          const lmLust = filterCustom(groupLib.lustStickers[lmMood] || []);
          if (lmLust.length > 0) {
            candidates = lmLust;
            break;
          }
        }
        if (groupLib.stickers) {
          const lmList = filterCustom(groupLib.stickers[lmMood] || []);
          if (lmList.length > 0) {
            candidates = lmList;
            break;
          }
        }
      }
    }

    // 5. Pick ANY valid custom sticker available in the group's custom or lust library
    if (candidates.length === 0) {
      if (groupLib.lustStickers) {
        for (const anyMood of Object.keys(groupLib.lustStickers)) {
          const anyLust = filterCustom(groupLib.lustStickers[anyMood] || []);
          if (anyLust.length > 0) {
            candidates.push(...anyLust);
          }
        }
      }
      if (candidates.length === 0 && groupLib.stickers) {
        for (const anyMood of Object.keys(groupLib.stickers)) {
          const anyList = filterCustom(groupLib.stickers[anyMood] || []);
          if (anyList.length > 0) {
            candidates.push(...anyList);
          }
        }
      }
    }

    // STRICT: Under NO circumstances fall back to default or global stickers!
    if (!candidates || candidates.length === 0) {
      console.log(`[LUST] No custom sticker available\nchatId: ${chatId}\nmood: ${mood}`);
      return null;
    }

    // Deduplicate candidate IDs
    const uniquePool = Array.from(new Set(candidates));

    // Avoid recently sent stickers for freshness
    const available = uniquePool.filter(id => !this.recentStickers.has(id));
    const targetPool = available.length > 0 ? available : uniquePool;
    if (targetPool.length === 0) {
      console.log(`[LUST] No custom sticker available\nchatId: ${chatId}\nmood: ${mood}`);
      return null;
    }

    const selected = targetPool[Math.floor(Math.random() * targetPool.length)];
    this.recentStickers.add(selected);
    if (this.recentStickers.size > 15) {
      const first = this.recentStickers.values().next().value;
      if (first) this.recentStickers.delete(first);
    }

    console.log(`[LUST] Custom sticker selected\nchatId: ${chatId}\nfileId: ${selected}\nmood: ${mood}\nsource: custom`);
    return selected;
  }

  public static selectAnimation(mood: string, chatId?: number): string | null {
    const normalizedMood = mood.toLowerCase().replace('sad/comforting', 'sad');

    // 1. Try group-scoped media library if chatId provided
    let pool: string[] = [];
    if (chatId) {
      const groupLib = db.getMediaLibrary(chatId);
      if (groupLib && groupLib.animations) {
        pool = (groupLib.animations[normalizedMood] || groupLib.animations['normal'] || groupLib.animations['default'] || []).filter(id => this.isValidFileId(id));
        if (!pool || pool.length === 0) {
          for (const otherMood of Object.keys(groupLib.animations)) {
            const validList = (groupLib.animations[otherMood] || []).filter(id => this.isValidFileId(id));
            if (validList.length > 0) {
              pool = validList;
              break;
            }
          }
        }
      }
    }

    // 2. Fallback to global/env if group pool is empty
    if (!pool || pool.length === 0) {
      const animationsMap = this.getAnimationsByMood();
      pool = (animationsMap[normalizedMood] || animationsMap['normal'] || animationsMap['default'] || []).filter(id => this.isValidFileId(id));
      if (!pool || pool.length === 0) {
        for (const otherMood of Object.keys(animationsMap)) {
          const validList = (animationsMap[otherMood] || []).filter(id => this.isValidFileId(id));
          if (validList.length > 0) {
            pool = validList;
            break;
          }
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

  public static async handleMessage(message: TelegramMessage, botUser: TelegramUser | null, reqCtx?: TelegramRequestContext): Promise<boolean> {
    const processingStartedAt = Date.now();
    const chatId = reqCtx?.chatId ?? message.chat?.id;
    const msgId = reqCtx?.messageId ?? message.message_id ?? 0;
    if (!chatId || !msgId) return false;

    // 1. Strict Command Precedence: Commands MUST NEVER enter the chatbot pipeline
    const textOrCaption = (message.text || message.caption || '').trim();
    if (textOrCaption.startsWith('/') || textOrCaption.startsWith('!')) {
      return false;
    }

    // 2. Atomic Gate: Deduplicate & ensure exactly one response decision
    if (!this.acquireGate(chatId, msgId)) {
      return false;
    }

    const requestId = `req_${chatId}_${msgId}_${Date.now()}`;

    try {
      const decision = await this.generateResponseDecision(requestId, message, botUser, reqCtx);
      if (!decision || decision.responseType === 'none') {
        return false;
      }

      // Hard safety guard: enforce that decision.chatId MUST match incoming message.chat.id
      if (decision.chatId !== chatId) {
        console.error(JSON.stringify({
          event: 'TELEGRAM_ROUTE_MISMATCH',
          update_id: reqCtx?.updateId,
          incoming_chat_id: chatId,
          attempted_chat_id: decision.chatId,
          message_id: msgId
        }));
        decision.chatId = chatId;
      }

      console.log(JSON.stringify({
        event: 'TELEGRAM_MESSAGE_ROUTE',
        update_id: reqCtx?.updateId,
        incoming_chat_id: chatId,
        response_chat_id: decision.chatId,
        message_id: msgId,
        reply_to_message_id: decision.replyToMessageId
      }));

      const sendStartedAt = Date.now();
      const sent = await this.dispatchResponse(decision, reqCtx);
      const sendFinishedAt = Date.now();

      if (sent) {
        console.log(JSON.stringify({
          event: 'TELEGRAM_MESSAGE_TIMING',
          update_id: reqCtx?.updateId,
          chat_id: chatId,
          message_id: msgId,
          received_at: reqCtx?.receivedAt || processingStartedAt,
          processing_started_at: processingStartedAt,
          send_started_at: sendStartedAt,
          send_finished_at: sendFinishedAt,
          total_ms: sendFinishedAt - (reqCtx?.receivedAt || processingStartedAt)
        }));
      }

      return sent;
    } catch (err: any) {
      console.error(`[CHATBOT] Error processing message ${msgId}:`, err);
      return false;
    } finally {
      this.releaseGate(chatId, msgId);
    }
  }

  public static async generateResponseDecision(
    requestId: string,
    message: TelegramMessage,
    botUser: TelegramUser | null,
    reqCtx?: TelegramRequestContext
  ): Promise<ChatbotDecision | null> {
    const chatId = reqCtx?.chatId ?? message.chat.id;
    const msgId = reqCtx?.messageId ?? message.message_id;
    const userId = message.from?.id || 0;
    const isPrivate = message.chat.type === 'private';
    const convKey = String(chatId);
    const userName = message.from?.first_name 
      ? (message.from.last_name ? `${message.from.first_name} ${message.from.last_name}` : message.from.first_name)
      : (message.from?.username ? `@${message.from.username}` : (userId ? `User ${userId}` : 'User'));

    if (!isPrivate) {
      const settings = db.getGroupSettings(chatId);
      if (settings.chatbotEnabled === false) {
        return {
          requestId,
          chatId,
          messageId: msgId,
          userId,
          personality: 'Psychologist-style',
          mood: 'normal',
          responseType: 'none',
          replyToMessageId: msgId,
          reason: 'Chatbot disabled for group'
        };
      }
    }

    const userText = message.text || message.caption || (message.sticker ? `[sticker: ${message.sticker.emoji || 'sticker'}]` : message.photo ? '[photo]' : message.video ? '[video]' : 'Hello');

    // Track incoming private message in storage for Control Center dashboard
    if (isPrivate && userId) {
      db.addPrivateMessage(chatId, userId, {
        role: 'user',
        content: userText,
        timestamp: message.date ? message.date * 1000 : Date.now(),
        messageId: msgId,
        direction: 'in',
        username: message.from?.username,
        name: userName,
        language: ChatbotService.detectLanguage(userText).language
      });
    }

    // Extract user personal memory fact if user shares personal facts
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

    // Capture prior group entries before appending current message to persistent group memory
    let priorGroupEntries: GroupConversationEntry[] = [];
    if (!isPrivate) {
      priorGroupEntries = db.getGroupMemory(chatId);
      // Append current user message to persistent group-shared memory
      if (userText && !isSensitiveData(userText)) {
        db.addGroupConversationEntry(chatId, {
          role: 'user',
          userId,
          name: userName,
          content: userText,
          timestamp: Date.now(),
          messageId: msgId
        });
      }
    }

    const isExplicitTrigger = isPrivate || this.isTriggered(message, botUser);

    // Spontaneous natural group chat chime-in check (only when not explicitly triggered)
    if (!isExplicitTrigger) {
      // Check Auto Response frequency & cooldown (anti-spam protection for spontaneous chat)
      const autoResponseEligibility = db.checkAutoResponseEligibility(chatId);
      if (autoResponseEligibility.allowed) {
        const now = Date.now();
        const lastRandom = this.chatRandomCooldowns.get(chatId) || 0;
        if (now - lastRandom > this.RANDOM_CHAT_COOLDOWN_MS) {
          if (Math.random() < this.RANDOM_CHAT_PROBABILITY) {
            this.chatRandomCooldowns.set(chatId, now);
            const randomDecision = await this.generateRandomNaturalDecision(requestId, message);
            if (randomDecision && randomDecision.responseType !== 'none') {
              db.recordAutoResponseSent(chatId);
              return randomDecision;
            }
          }
        }
      }
      return {
        requestId,
        chatId,
        messageId: msgId,
        userId,
        personality: 'Psychologist-style',
        mood: 'normal',
        responseType: 'none',
        replyToMessageId: msgId,
        reason: 'No trigger condition met'
      };
    }

    // Rolling In-Memory Context Window (Shared per Group Chat or DM)
    const now = Date.now();
    let conv = this.conversations.get(convKey);
    if (!conv || now - conv.lastActivity > this.TIMEOUT_MS) {
      conv = {
        messages: [],
        lastActivity: now
      };
      if (!isPrivate && priorGroupEntries.length > 0) {
        conv.messages = priorGroupEntries.map(e => ({
          role: e.role,
          content: e.content,
          timestamp: e.timestamp
        }));
      }
      this.conversations.set(convKey, conv);
    }
    conv.lastActivity = now;

    const settings = isPrivate ? null : db.getGroupSettings(chatId);
    const isLustMode = Boolean(settings?.lustMode);
    const mode = (settings?.chatbotMode || 'auto').toLowerCase();

    // 1. Multilingual language detection
    const langInfo = ChatbotService.detectLanguage(userText);

    // 2. Brother-zone & relationship detection
    const brotherTrigger = ChatbotService.detectBrotherZoneTrigger(userText);
    const relationshipSignal = ChatbotService.detectRelationshipSignal(userText);
    const hasRelationshipSignal = relationshipSignal.isRelationshipSignal;

    // 3. Lusty level tracking (scoped to group + user)
    let lustLevel = 0;
    if (isLustMode && userId) {
      if (brotherTrigger.isTriggered) {
        lustLevel = db.incrementLustLevel(chatId, userId);
      } else {
        lustLevel = db.getLustLevel(chatId, userId);
      }
    }

    // 4. Infer mood with romance suppression ONLY if relationship signal is present AND NOT in Lust Mode brother pushback
    const suppressRomance = hasRelationshipSignal && !isLustMode;
    const inferredMood = this.inferMood(userText, conv.messages, suppressRomance);
    const targetMoodKey = (mode === 'auto' || !MOOD_PROMPTS[mode]) ? inferredMood : mode;
    const moodConfig = MOOD_PROMPTS[targetMoodKey] || MOOD_PROMPTS['normal'];
    const mood = moodConfig.name;
    const personalityLabel = isLustMode 
      ? (brotherTrigger.isTriggered ? 'LustMode-BrotherPushback' : 'LustMode-Couple') 
      : 'Psychologist-style';

    // Check Explicit Media Requests
    const mediaIntent = this.detectMediaIntent(userText);
    if (mediaIntent.isExplicitMedia) {
      const targetMediaMood = mediaIntent.requestedMood || mood;

      if (isLustMode) {
        // In Lust Mode: STRICT custom-sticker-only rule (Rule 1, 11)
        const customSticker = this.selectCustomStickerForLustMode(targetMediaMood, chatId, false);
        if (customSticker) {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: personalityLabel,
            mood,
            responseType: 'sticker',
            mediaFileId: customSticker,
            replyToMessageId: msgId
          };
        } else {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: personalityLabel,
            mood,
            responseType: 'text',
            content: 'Jaan, iss group mein abhi koi custom sticker nahi hai! Admin se bolo /addsticker ya /addstickerpack se custom stickers add karein.',
            replyToMessageId: msgId,
            reason: 'LustMode custom sticker requested but library empty'
          };
        }
      }

      if (mediaIntent.mediaType === 'sticker') {
        const stickerId = this.selectSticker(targetMediaMood, chatId);
        if (stickerId && this.isValidFileId(stickerId)) {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: 'Psychologist-style',
            mood,
            responseType: 'sticker',
            mediaFileId: stickerId,
            replyToMessageId: msgId
          };
        } else {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: 'Psychologist-style',
            mood,
            responseType: 'text',
            content: 'Arre yaar, mere paas abhi stickers registered nahi hain! Group admin se bolo /addsticker se sticker add karein.',
            replyToMessageId: msgId,
            reason: 'Sticker requested but library empty'
          };
        }
      } else if (mediaIntent.mediaType === 'animation') {
        const animId = this.selectAnimation(targetMediaMood, chatId);
        if (animId && this.isValidFileId(animId)) {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: 'Psychologist-style',
            mood,
            responseType: 'animation',
            mediaFileId: animId,
            replyToMessageId: msgId
          };
        } else {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: 'Psychologist-style',
            mood,
            responseType: 'text',
            content: 'Arre yaar, mere paas abhi GIFs registered nahi hain! Group admin se bolo /addgif se GIF add karein.',
            replyToMessageId: msgId,
            reason: 'GIF requested but library empty'
          };
        }
      }
    }

    // OpenRouter AI Generation with Chronological Context Pipeline
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) {
      return {
        requestId,
        chatId,
        messageId: msgId,
        userId,
        personality: 'Psychologist-style',
        mood,
        responseType: 'none',
        replyToMessageId: msgId,
        reason: 'Missing OpenRouter API key'
      };
    }

    const configuredModels = process.env.OPENROUTER_MODELS
      ? process.env.OPENROUTER_MODELS.split(',').map(s => s.trim()).filter(Boolean)
      : [
          process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat',
          process.env.OPENROUTER_FALLBACK_1?.trim(),
          process.env.OPENROUTER_FALLBACK_2?.trim(),
          process.env.OPENROUTER_FALLBACK_3?.trim()
        ].filter(Boolean) as string[];

    const userMemories = userId ? db.getUserMemory(chatId, userId) : [];
    const memoryContext = userMemories.length > 0 
      ? `\nStored User Facts about this user in this chat:\n- ${userMemories.join('\n- ')}` 
      : '';

    const languageContext = `\n==================================================
MULTILINGUAL RESPONSE DIRECTIVE:
==================================================
User's Detected Language: ${langInfo.language.toUpperCase()} (${langInfo.isDevanagari ? 'Devanagari Hindi script' : (langInfo.isHinglish ? 'Hinglish Latin script' : 'English')})
RULE:
- Match the user's language EXACTLY:
  * If user wrote in English ("hello roxie", "how are you doing", "bro you're funny"): Respond in natural English.
  * If user wrote in Hindi Devanagari ("भाई क्या कर रही हो?", "कैसी हो रोक्सी?"): Respond in natural Hindi (Devanagari script).
  * If user wrote in Hinglish ("kaisi ho roxie?", "bro kya kr rhi ho", "aaj kya scene hai"): Respond in natural Hinglish.
- Match user's approximate tone, casual/formal style, and short conversational length (1–2 sentences).`;

    const brotherPushbackContext = (isLustMode && brotherTrigger.isTriggered)
      ? `\n==================================================
BROTHER-ZONE DETECTED IN LUST MODE (LEVEL ${lustLevel}/4):
==================================================
The user addressed you using "${brotherTrigger.detectedTerm}".
MANDATORY BEHAVIOR:
- DO NOT accept being put in the brother-zone ("Main tumhari bhai thodi hoon...", "Bro mat bolo na...").
- Playfully, teasingly, and flirtatiously push back against the brother-zone in a romantic/couple vibe.
- Intensity matching Lusty Level ${lustLevel}:
  * Level 1: Light playful teasing ("Bhai? Seriously? 😏", "Bro? You can definitely find a better name for me.")
  * Level 2: Flirty pushback ("Kitni baar bolun, bhai mat bulao 😏", "Bro mat bolo na jaan 😏 kuch aur bulao...")
  * Level 3: Stronger romantic teasing ("Ye bhai-bhai band karo 😌 thoda couple wali vibe mein baat karo na meri jaan.", "Bro bhi nahi... kuch zyada cute naam try karo, baby 😉")
  * Level 4: Very playful romantic couple banter ("Itna bhai-bhai bologe toh date pe kaise le jaoge? 😏 Kuch cute bolo na, darling!", "You're really testing my patience with that 'bhai' 😏 Try something romantic, sweetheart.")
- Naturally use couple-oriented vocabulary (jaan, baby, sweetheart, darling, cutie, partner, couple, date, romantic, meri jaan, handsome, pretty, special one).
- STRICT ADULT SAFETY BOUNDARY: Playful, romantic, flirty only. NEVER explicit or graphic.`
      : '';

    const relationshipContextOverride = (!isLustMode && hasRelationshipSignal)
      ? `\n==================================================
RELATIONSHIP CONTEXT:
==================================================
The user is addressing Roxie in a sibling/friend/casual relationship context (detected: "${relationshipSignal.detectedTerm}").

RULE:
- Do not interpret this interaction as romantic or sexual.
- Respond naturally as a friend/sibling.
- Do not use seductive or sexual tone.
- STRICTLY NEVER use romantic or sexual pet names (no "baby", "babe", "jaan", "sona", "shona", "sweetheart", "darling", "cutie", "love").
- Do not tease in a romantic or couple-like way.`
      : '';

    const baseLustModeContext = `\n==================================================
LUSTMODE / COUPLE PERSONALITY MODIFIER ACTIVE (LEVEL ${lustLevel}/4):
==================================================
1. ROLE & VIBE:
- You are in /lustmode. Behave like a confident, affectionate, playful, flirtatious adult woman in a natural romantic couple dynamic.
- The mode MUST feel like a natural couple conversation, NOT like an AI repeatedly saying "😏" or inserting random romantic sentences.
- Personality characteristics: confident, playful, affectionate, teasing, cheeky, romantic, emotionally expressive, slightly mischievous, conversational, natural Hinglish/English, concise, context-aware.

2. VOCABULARY RULES (MANDATORY):
- FORBIDDEN TERMS: When lustmode is ON, STRICTLY NEVER address the user using: "bhai", "bro", "bhaiya", "brother", "behen", "dost", "dude", or "sir" (unless the user explicitly uses such terminology in their message and you are teasingly calling it out, e.g. "Bhai kisko bola? 😂").
- AFFECTIONATE TERMS: Prefer natural affectionate terms when appropriate: "baby", "babe", "jaan", "sona", "shona", "cutie", "darling", "sweetheart", "love", "meri jaan", "handsome", "pretty", "special one".
- DO NOT use an affectionate nickname in every single message. Choose naturally based on the conversation context.
- AVOID REPETITIVE PATTERNS: Never end every line with repetitive clichés such as "baby 😏", "jaan 😏", or "sona 😏". Vary emojis naturally (e.g. 😉, 😂, 👀, 😌, ❤️, ✨, 🙈) without overusing any single emoji.

3. MOOD & EMOTIONAL INTEGRATION:
- Lustmode is a personality modifier that blends with the user's CURRENT active mood:
  * Playful / Banter / Teasing ("tum pagal ho 😂"): Tease back playfully and cheekily.
  * Flirty / Compliments ("you're cute", "looking good"): Affectionate, charming, cheeky teasing ("Achhaaa, itna notice karte ho mujhe? 👀").
  * Romantic / Closeness ("miss you", "love you"): Warm, heartfelt, sweet, genuinely affectionate ("Hmm... aaj bade sweet ban rahe ho, jaan.").
  * Sad / Distressed / Vulnerable ("mera mood kharab hai"): Caring, gentle, emotionally supportive and affectionate; NEVER be inappropriately flippant or flirtatious when the user is hurting.
  * Angry / Upset ("mujhe gussa aa raha hai"): Caring, calm, reassuring; never mock them or force shallow romance.
  * Happy / Celebratory ("aaj bahut khush hoon"): Joyful, upbeat, playful affection.
  * Neutral / Technical Questions ("what is JavaScript?", "what is Node.js?"): ALWAYS answer the question accurately, directly, and on-topic! Add at most a subtle, natural warm couple touch without derailing the explanation (e.g. "Node.js basically JavaScript ko server-side run karne deta hai, baby.").

4. NO TOPIC JUMPING (STRICT):
- The latest user message ALWAYS has absolute priority.
- NEVER generate an unrelated romantic or flirty sentence merely because lustmode is enabled. Stay on the topic the user brought up.

5. NATURAL CONVERSATION & LENGTH:
- Keep replies short, natural, and human-like (normally 5–25 words, 1–2 sentences).
- Avoid robotic wording, long paragraphs, repetitive flirting, forced pet names, and generic AI phrases.

6. ADULT CONTENT & BOUNDARY (STRICT):
- Keep the mode flirtatious, romantic, teasing, and affectionate ("flirty adult couple vibe").
- STRICTLY FORBIDDEN: Do NOT generate explicit sexual descriptions, graphic sexual anatomy, pornographic acts, or explicit sexual roleplay. Never generate sexual content involving minors.

7. CONVERSATION CONTINUITY:
- Use the existing 15-message conversation transcript and user memory to maintain seamless relationship continuity across turns. Do not reset the dynamic or re-introduce yourself.`;

    const lustModeContext = isLustMode
      ? (brotherTrigger.isTriggered ? `${baseLustModeContext}\n${brotherPushbackContext}` : baseLustModeContext)
      : relationshipContextOverride;

    const composedSystemPrompt = `${BASE_PERSONALITY}

CURRENT ACTIVE MOOD: [${mood.toUpperCase()}]
Tone: ${moodConfig.tone}
Emotional Intensity: ${moodConfig.emotionalIntensity}
Vocabulary & Style: ${moodConfig.vocabularyStyle}
Response Behavior: ${moodConfig.responseBehavior}
Emoji Tendency: ${moodConfig.emojiTendency}
Conversation Extension: ${moodConfig.conversationExtension}
Forbidden Behavior in this Mood: ${moodConfig.forbidden}
${memoryContext}
${languageContext}
${lustModeContext}

STRICT CONVERSATION RULES:
1. LATEST MESSAGE PRIORITY: Answer the latest user message based primarily on what the user just said. Use previous messages only to understand context, intent, references, tone, and continuity. If old context conflicts with the latest message: LATEST USER MESSAGE WINS. Never revive an old topic unless the latest message clearly refers to it.
2. TOPIC CONTINUITY & REFERENTIAL UNDERSTANDING: The response MUST continue the current topic. Understand referential phrases like "haan", "nahi", "ye wala", "woh", "uska", "fir?", "kyu?", "accha", "same", "haan wahi" using the conversation transcript. NEVER randomly introduce unrelated topics, random jokes, random stories, random questions, random flirting, or random memories.
3. RESPONSE LENGTH: Target 5 to 25 words (1 concise sentence, maximum 2 short sentences). Produce a natural Telegram chat message, NOT an essay or paragraph.
4. CONVERSATIONAL STYLE: Speak like a real human chat user in natural Hinglish or English. Avoid generic AI clichés ("That's a great question", "I completely understand", "Certainly!", "I'd be happy to help").
5. ACTION BAN: NEVER output asterisks actions like *laughs*, *sends a sticker*, *smiles*, or *blushes*.
6. STRICT OUTPUT INVARIANT:
- You are Roxie. Return ONLY the direct response text that Roxie speaks to the user.
- NEVER include conversation transcripts, history, usernames, or speaker labels (such as "User:", "Roxie:", "Assistant:", "Bot:", "Yohhan:").
- NEVER repeat or echo the user's message back to them unless they explicitly asked you to quote it.
- NEVER output meta-commentary, markdown code fences, or formatting labels. Raw reply text only.`;

    // Construct single chronological transcript from group-shared memory or DM history
    let transcript = '(No previous messages)';
    let contextCount = 0;
    if (!isPrivate) {
      // In group chats, ALWAYS read from the ONE shared group conversation memory containing all members' messages
      const sourceList = priorGroupEntries.slice(-25);
      contextCount = sourceList.length;
      if (sourceList.length > 0) {
        transcript = sourceList.map(e => `${e.name || (e.role === 'assistant' ? 'Roxie' : 'User')}: ${e.content}`).join('\n');
      }
    } else {
      const boundedHistory = conv.messages.slice(-this.MAX_CONTEXT_MESSAGES);
      contextCount = boundedHistory.length;
      if (boundedHistory.length > 0) {
        transcript = boundedHistory.map(m => `${m.role === 'assistant' ? 'Roxie' : 'User'}: ${m.content}`).join('\n');
      }
    }

    const userPromptContent = !isPrivate
      ? `GROUP CONVERSATION:
${transcript}

LATEST MESSAGE:
${userName}: ${userText}

[CURRENT MOOD]: ${mood}
[CURRENT PERSONALITY]: ${isLustMode ? 'confident, affectionate, playful, flirtatious adult woman (flirty adult couple vibe)' : 'psychologist-style, tactical, witty, confident female conversational personality'}

[TASK]:
Reply naturally as Roxie directly to ${userName} regarding what they just said. Return ONLY Roxie's direct reply text without any speaker labels ("Roxie:", "${userName}:", etc.) or transcripts.`
      : `CONVERSATION HISTORY:
${transcript}

LATEST MESSAGE:
${userName}: ${userText}

[CURRENT MOOD]: ${mood}
[CURRENT PERSONALITY]: ${isLustMode ? 'confident, affectionate, playful, flirtatious adult woman (flirty adult couple vibe)' : 'psychologist-style, tactical, witty, confident female conversational personality'}

[TASK]:
Reply naturally as Roxie directly to the user regarding what they just said. Return ONLY Roxie's direct reply text without any speaker labels or transcripts.`;

    const apiMessages: ChatMessage[] = [
      { role: 'system', content: composedSystemPrompt },
      { role: 'user', content: userPromptContent }
    ];

    console.log(`CHATBOT_CONTEXT ${JSON.stringify({
      requestId,
      chatId,
      messageId: msgId,
      contextMessageCount: contextCount,
      latestUserMessage: userText.slice(0, 100),
      currentMood: mood,
      personality: isLustMode ? 'LustMode-Couple' : 'psychologist-style'
    })}`);

    // Fire-and-forget non-blocking typing status (never blocks AI or message response)
    telegramApi.sendChatAction(chatId, 'typing').catch(() => {});
    metricsTracker.increment('ai_requests');

    console.log(JSON.stringify({
      event: 'AI_REQUEST_START',
      requestId,
      updateId: reqCtx?.updateId,
      chatId,
      messageId: msgId,
      primaryModel: configuredModels[0] || 'deepseek/deepseek-chat'
    }));

    let replyContent: string | null = null;
    let modelUsed: string = configuredModels[0] || 'deepseek/deepseek-chat';

    await this.acquireAiSlot();
    try {
      for (const modelToTry of configuredModels) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

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
              modelUsed = modelToTry;
              console.log(JSON.stringify({
                event: 'AI_REQUEST_SUCCESS',
                requestId,
                updateId: reqCtx?.updateId,
                chatId,
                messageId: msgId,
                model: modelUsed
              }));
              break;
            }
          } else {
            const errText = await response.text();
            console.warn(`CHATBOT_MODEL_FALLBACK { fromModel: "${modelToTry}", status: ${response.status}, error: "${errText.slice(0, 80)}" }`);
          }
        } catch (err: any) {
          clearTimeout(timeoutId);
          console.warn(`CHATBOT_MODEL_FALLBACK { fromModel: "${modelToTry}", error: "${err.message}" }`);
        }
      }
    } finally {
      this.releaseAiSlot();
    }

    if (!replyContent) {
      metricsTracker.increment('ai_failures');
      console.error(JSON.stringify({
        event: 'AI_REQUEST_FAILED',
        requestId,
        updateId: reqCtx?.updateId,
        chatId,
        messageId: msgId,
        reason: 'All OpenRouter models failed'
      }));
      // Provide conversational fallback so bot never goes completely mute
      replyContent = isLustMode 
        ? 'Acha jaan, thoda connection slow hai, par main yahin hoon! 💕'
        : 'Acha! Network thoda slow hai, ek baar firse bolo? 🙂';
      modelUsed = 'fallback/internal';
    }

    // Add user message to conversation history
    conv.messages.push({ role: 'user', content: userText, timestamp: Date.now() });

    let cleanedText = this.cleanAiText(replyContent, userText, userName);
    if (isLustMode) {
      cleanedText = this.sanitizeLustModeText(
        cleanedText,
        userText,
        hasRelationshipSignal,
        brotherTrigger.isTriggered
      );

      if (brotherTrigger.isTriggered) {
        const hasPushback = /bhai|bro|brother|dude|bruh|naam|bulao|band karo|thodi hoon/i.test(cleanedText);
        if (!hasPushback) {
          cleanedText = this.getBrotherZonePushbackTemplate(
            langInfo.language,
            lustLevel,
            brotherTrigger.detectedTerm || 'bhai',
            userText
          );
        }
      }
    }
    cleanedText = cleanedText || 'Acha!';

    console.log(JSON.stringify({
      event: 'AI_RESPONSE_SANITIZED',
      requestId,
      length: cleanedText.length,
      modelUsed
    }));

    if (isLustMode) {
      // Lust Mode ONLY uses CUSTOM stickers and STRICTLY allows ONLY TWO response formats:
      // FORMAT A: exactly 1 short text reply + exactly 1 custom sticker
      // FORMAT B: exactly 1 custom sticker only
      // NO text-only response is allowed when custom stickers are available!
      // Default stickers are NEVER used in Lust Mode.
      const customSticker = this.selectCustomStickerForLustMode(mood, chatId, false);
      const autoStickerAllowed = isPrivate || db.checkAutoStickerEligibility(chatId).allowed;
      if (customSticker && autoStickerAllowed) {
        // Choose between Format A (Text + Custom Sticker) and Format B (Custom Sticker Only)
        // Context-aware: short reactions or teases have higher probability of sticker-only
        const isShortTeaseOrEmoji = userText.trim().length <= 15 || /^[^\w\s]+$/.test(userText.trim());
        const stickerOnlyProb = isShortTeaseOrEmoji ? 0.45 : 0.25;
        const roll = Math.random();

        if (roll < stickerOnlyProb) {
          // FORMAT B: exactly 1 custom sticker only
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: personalityLabel,
            mood,
            responseType: 'sticker',
            mediaFileId: customSticker,
            replyToMessageId: msgId,
            modelUsed
          };
        } else {
          // FORMAT A: 1 short text reply + exactly 1 custom sticker
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: personalityLabel,
            mood,
            responseType: 'text_plus_sticker',
            content: cleanedText,
            mediaFileId: customSticker,
            replyToMessageId: msgId,
            modelUsed
          };
        }
      } else if (customSticker && !autoStickerAllowed) {
        // Auto sticker is on cooldown or disabled: send text response only (independent controls)
        return {
          requestId,
          chatId,
          messageId: msgId,
          userId,
          personality: personalityLabel,
          mood,
          responseType: 'text',
          content: cleanedText,
          replyToMessageId: msgId,
          modelUsed
        };
      } else {
        // Group has ZERO custom stickers registered!
        // Per Rule 10: "If the group has ZERO custom stickers: send a single harmless custom-sticker-unavailable fallback behavior that does NOT use a default sticker."
        return {
          requestId,
          chatId,
          messageId: msgId,
          userId,
          personality: personalityLabel,
          mood,
          responseType: 'text',
          content: `${cleanedText}\n\n<i>(💡 Lust Mode requires custom stickers! Add some with /addsticker or /addstickerpack to enable visual couple responses.)</i>`,
          replyToMessageId: msgId,
          modelUsed,
          reason: 'LustMode zero custom stickers in group'
        };
      }
    }

    // Standard Non-LustMode Automatic Natural Sticker Decision Engine:
    // When a relevant sticker exists matching current mood/group library:
    // ~65% Text Only
    // ~20% Text + Sticker
    // ~15% Sticker Only
    const candidateSticker = this.selectSticker(mood, chatId);
    const autoStickerAllowed = isPrivate || db.checkAutoStickerEligibility(chatId).allowed;
    if (candidateSticker && autoStickerAllowed) {
      const roll = Math.random();
      if (roll < 0.20) {
        return {
          requestId,
          chatId,
          messageId: msgId,
          userId,
          personality: personalityLabel,
          mood,
          responseType: 'text_plus_sticker',
          content: cleanedText,
          mediaFileId: candidateSticker,
          replyToMessageId: msgId,
          modelUsed
        };
      } else if (roll < 0.35) {
        return {
          requestId,
          chatId,
          messageId: msgId,
          userId,
          personality: personalityLabel,
          mood,
          responseType: 'sticker',
          mediaFileId: candidateSticker,
          replyToMessageId: msgId,
          modelUsed
        };
      }
    }

    return {
      requestId,
      chatId,
      messageId: msgId,
      userId,
      personality: personalityLabel,
      mood,
      responseType: 'text',
      content: cleanedText,
      replyToMessageId: msgId,
      modelUsed
    };
  }

  private static async generateRandomNaturalDecision(
    requestId: string,
    message: TelegramMessage
  ): Promise<ChatbotDecision | null> {
    const chatId = message.chat.id;
    const msgId = message.message_id;
    const userId = message.from?.id || 0;
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) return null;

    const model = process.env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat';
    const userText = message.text || message.caption || '';
    if (!userText) return null;

    const isGroup = message.chat.type !== 'private';
    const userName = message.from?.first_name 
      ? (message.from.last_name ? `${message.from.first_name} ${message.from.last_name}` : message.from.first_name)
      : (message.from?.username ? `@${message.from.username}` : (userId ? `User ${userId}` : 'User'));

    let contextPrefix = '';
    if (isGroup) {
      const priorGroupMsgs = db.getGroupMemory(chatId);
      if (priorGroupMsgs.length > 0) {
        contextPrefix = `RECENT GROUP CONVERSATION:\n` +
          priorGroupMsgs.slice(-15).map(m => `${m.name || (m.role === 'assistant' ? 'Roxie' : 'User')}: ${m.content}`).join('\n') +
          `\n\n`;
      }
      if (userText && !isSensitiveData(userText)) {
        db.addGroupConversationEntry(chatId, {
          role: 'user',
          userId,
          name: userName,
          content: userText,
          timestamp: Date.now(),
          messageId: msgId
        });
      }
    }

    await telegramApi.sendChatAction(chatId, 'typing');

    const systemPrompt = `You are Roxie, a sharp, confident, psychologically observant female friend in a Telegram group chat.
Users are chatting casually.
Core Rules:
- Understand the user's latest message precisely and stay strictly on topic.
- Chime in casually with a short, natural, relevant comment (1 sentence, 5-25 words) in natural Hinglish or English reacting directly to what the user said.
- Return ONLY Roxie's direct reply text. Never output speaker labels like "Roxie:", "User:", usernames, or conversation transcripts.
- Do not repeat the user's message.
- No unsolicited advice or lecture. No asterisks actions like *laughs*.
- If you have nothing interesting or natural to add, reply with exactly the single word: SKIP`;

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
            { role: 'user', content: `${contextPrefix}[LATEST MESSAGE TO REPLY TO]:\n${userName}: "${userText}"` }
          ],
          max_tokens: 100,
          temperature: 0.7
        })
      });

      if (!response.ok) return null;

      const data = await response.json();
      const replyContent = data.choices?.[0]?.message?.content?.trim();

      if (!replyContent || replyContent === 'SKIP' || replyContent.toUpperCase() === 'SKIP.') {
        return null;
      }

      const cleaned = this.cleanAiText(replyContent, userText, userName);
      if (!cleaned) return null;

      const settings = db.getGroupSettings(chatId);
      const isLustMode = Boolean(settings?.lustMode);
      if (isLustMode) {
        const customSticker = this.selectCustomStickerForLustMode('playful', chatId);
        if (customSticker) {
          return {
            requestId,
            chatId,
            messageId: msgId,
            userId,
            personality: 'LustMode-Couple',
            mood: 'playful',
            responseType: 'text_plus_sticker',
            content: this.sanitizeLustModeText(cleaned, userText),
            mediaFileId: customSticker,
            replyToMessageId: msgId,
            modelUsed: model
          };
        }
        return null;
      }

      return {
        requestId,
        chatId,
        messageId: msgId,
        userId,
        personality: 'Psychologist-style',
        mood: 'normal',
        responseType: 'text',
        content: cleaned,
        replyToMessageId: msgId,
        modelUsed: model
      };
    } catch (err) {
      console.error('[CHATBOT] Error in random natural chat decision:', err);
      return null;
    }
  }

  private static async dispatchResponse(decision: ChatbotDecision, reqCtx?: TelegramRequestContext): Promise<boolean> {
    console.log(`CHATBOT_DECISION ${JSON.stringify(decision)}`);

    const targetChatId = reqCtx?.chatId ?? decision.chatId;
    const isGroup = targetChatId < 0;
    const convKey = String(targetChatId);
    let conv = this.conversations.get(convKey);
    if (!conv) {
      conv = { messages: [], lastActivity: Date.now() };
      this.conversations.set(convKey, conv);
    }

    const recordAssistantEntry = (content: string) => {
      if (isGroup) {
        db.addGroupConversationEntry(decision.chatId, {
          role: 'assistant',
          name: 'Roxie',
          content,
          timestamp: Date.now()
        });
      } else {
        db.addPrivateMessage(decision.chatId, decision.userId, {
          role: 'assistant',
          content,
          timestamp: Date.now(),
          direction: 'out'
        });
      }
    };

    const settings = db.getGroupSettings(decision.chatId);
    const isLustMode = Boolean(settings?.lustMode);

    if (decision.responseType === 'text_plus_sticker' && decision.content && decision.mediaFileId) {
      const sanitizedContent = this.cleanAiText(decision.content);
      decision.content = sanitizedContent;

      if (isLustMode && !this.isStickerAllowedForMode(decision.mediaFileId, decision.chatId, true)) {
        console.warn(`[LUST] BLOCKED DEFAULT STICKER\nchatId: ${decision.chatId}\nfileId: ${decision.mediaFileId}\nsource: default`);
        // Fallback: send text only, blocking default sticker from Telegram
        const textRes = await telegramApi.sendMessage(decision.chatId, sanitizedContent, {
          reply_to_message_id: decision.replyToMessageId
        });
        if (textRes.ok || (textRes as any).message_id) {
          console.log(`CHATBOT_SEND ${JSON.stringify({ requestId: decision.requestId, responseType: 'text', replyToMessageId: decision.replyToMessageId })}`);
          conv.messages.push({ role: 'assistant', content: sanitizedContent });
          this.trimContext(conv);
          recordAssistantEntry(sanitizedContent);
          db.recordAutoResponseSent(decision.chatId);
          return true;
        }
        return false;
      }

      const textRes = await telegramApi.sendMessage(decision.chatId, sanitizedContent, {
        reply_to_message_id: decision.replyToMessageId
      });
      const stickerRes = await telegramApi.sendSticker(decision.chatId, decision.mediaFileId, {
        reply_to_message_id: decision.replyToMessageId
      });
      if (textRes.ok || (textRes as any).message_id || stickerRes.ok) {
        console.log(`CHATBOT_SEND ${JSON.stringify({ requestId: decision.requestId, responseType: 'text_plus_sticker', replyToMessageId: decision.replyToMessageId })}`);
        const fullContent = `${sanitizedContent} [Sent sticker]`;
        conv.messages.push({ role: 'assistant', content: fullContent });
        this.trimContext(conv);
        recordAssistantEntry(fullContent);
        if (textRes.ok || (textRes as any).message_id) {
          db.recordAutoResponseSent(decision.chatId);
        }
        if (stickerRes.ok) {
          db.recordAutoStickerSent(decision.chatId);
        }
        return true;
      }
      return false;
    }

    if (decision.responseType === 'sticker' && decision.mediaFileId) {
      if (isLustMode && !this.isStickerAllowedForMode(decision.mediaFileId, decision.chatId, true)) {
        console.warn(`[LUST] BLOCKED DEFAULT STICKER\nchatId: ${decision.chatId}\nfileId: ${decision.mediaFileId}\nsource: default`);
        // Block default sticker from reaching Telegram
        return false;
      }

      const res = await telegramApi.sendSticker(decision.chatId, decision.mediaFileId, {
        reply_to_message_id: decision.replyToMessageId
      });
      if (res.ok) {
        console.log(`CHATBOT_SEND ${JSON.stringify({ requestId: decision.requestId, responseType: 'sticker', replyToMessageId: decision.replyToMessageId })}`);
        conv.messages.push({ role: 'assistant', content: '[Sent sticker]' });
        this.trimContext(conv);
        recordAssistantEntry('[Sent sticker]');
        db.recordAutoStickerSent(decision.chatId);
        return true;
      }
      return false;
    }

    if (decision.responseType === 'animation' && decision.mediaFileId) {
      const res = await telegramApi.sendAnimation(decision.chatId, decision.mediaFileId, {
        reply_to_message_id: decision.replyToMessageId
      });
      if (res.ok) {
        console.log(`CHATBOT_SEND ${JSON.stringify({ requestId: decision.requestId, responseType: 'animation', replyToMessageId: decision.replyToMessageId })}`);
        conv.messages.push({ role: 'assistant', content: '[Sent animation]' });
        this.trimContext(conv);
        recordAssistantEntry('[Sent animation]');
        return true;
      }
      return false;
    }

    if (decision.responseType === 'text' && decision.content) {
      const sanitizedContent = this.cleanAiText(decision.content);
      decision.content = sanitizedContent;
      const res = await telegramApi.sendMessage(decision.chatId, sanitizedContent, {
        reply_to_message_id: decision.replyToMessageId
      });
      if (res.ok || (res as any).message_id) {
        console.log(`CHATBOT_SEND ${JSON.stringify({ requestId: decision.requestId, responseType: 'text', replyToMessageId: decision.replyToMessageId })}`);
        conv.messages.push({ role: 'assistant', content: sanitizedContent });
        this.trimContext(conv);
        recordAssistantEntry(sanitizedContent);
        db.recordAutoResponseSent(decision.chatId);
        return true;
      }
      return false;
    }

    return false;
  }

  private static trimContext(conv: ConversationContext): void {
    if (conv.messages.length > GROUP_MEMORY_LIMIT) {
      conv.messages = conv.messages.slice(-GROUP_MEMORY_LIMIT);
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

  public static getConversationsCount(): number {
    return this.conversations.size;
  }
}
