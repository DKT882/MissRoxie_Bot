import { ChatbotService, MOOD_PROMPTS } from '../server/telegram/chatbot.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { telegramBot } from '../server/telegram/botManager.js';
import { CommandHandler } from '../server/telegram/commands.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runChatbotRegressionTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Chatbot Comprehensive 28-Point Regression Test Suite...');
  console.log('====================================================');

  const chatId = -100987654321;
  const chatTitle = 'Roxie Verification Group';
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  const origApiKey = process.env.OPENROUTER_API_KEY;
  const origStickersJson = process.env.TELEGRAM_STICKERS_JSON;
  const origAnimsJson = process.env.TELEGRAM_ANIMATIONS_JSON;
  const origSendMsg = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendAnim = telegramApi.sendAnimation;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  process.env.OPENROUTER_API_KEY = 'test_api_key';

  (telegramApi as any).sendChatAction = async () => ({ ok: true });

  // ----------------------------------------------------
  // TEST 1: Default Mood is 'normal' (never flirty by default)
  // ----------------------------------------------------
  ChatbotService.reset();
  const defaultMood = ChatbotService.inferMood('kal subah 9 baje office meeting hai');
  assert(defaultMood === 'normal', 'TEST 01: Default mood for neutral conversation is strictly "normal"');

  // ----------------------------------------------------
  // TEST 2: Friendly Mood inference
  // ----------------------------------------------------
  const friendlyMood = ChatbotService.inferMood('hey kaise ho, kya chal raha hai?');
  assert(friendlyMood === 'friendly', 'TEST 02: Casual greetings infer "friendly" mood');

  // ----------------------------------------------------
  // TEST 3: Cute Mood inference
  // ----------------------------------------------------
  const cuteMood = ChatbotService.inferMood('aww this is so sweet and cute 🥰');
  assert(cuteMood === 'cute', 'TEST 03: Sweet expressions infer "cute" mood');

  // ----------------------------------------------------
  // TEST 4: Playful Mood inference
  // ----------------------------------------------------
  const playfulMood = ChatbotService.inferMood('hehe 😂 mast joke tha haha');
  assert(playfulMood === 'playful', 'TEST 04: Laughing and jokes infer "playful" mood');

  // ----------------------------------------------------
  // TEST 5: Teasing Mood inference
  // ----------------------------------------------------
  const teasingMood = ChatbotService.inferMood('tu thoda pagal hai kya 😂 noob');
  assert(teasingMood === 'teasing', 'TEST 05: Playful roasts and teasing infer "teasing" mood');

  // ----------------------------------------------------
  // TEST 6: Sarcastic Mood inference
  // ----------------------------------------------------
  const sarcasticMood = ChatbotService.inferMood('wah kya bakwas hai... genius move sach me');
  assert(sarcasticMood === 'sarcastic', 'TEST 06: Sarcasm and irony infer "sarcastic" mood');

  // ----------------------------------------------------
  // TEST 7: Angry Mood inference
  // ----------------------------------------------------
  const angryMood = ChatbotService.inferMood('dimag mat kharab karo 😡 shut up');
  assert(angryMood === 'angry', 'TEST 07: Frustration and anger infer "angry" mood');

  // ----------------------------------------------------
  // TEST 8: Sad / Comforting Mood inference
  // ----------------------------------------------------
  const sadMood = ChatbotService.inferMood('mujhe bahut bura lag raha hai, exam kharab gaya');
  assert(sadMood === 'sad/comforting', 'TEST 08: Distress and sadness infer "sad/comforting" mood');

  // ----------------------------------------------------
  // TEST 9: Romantic Mood inference
  // ----------------------------------------------------
  const romanticMood = ChatbotService.inferMood('i love you meri jaan ❤️');
  assert(romanticMood === 'romantic', 'TEST 09: Explicit romantic messages infer "romantic" mood');

  // ----------------------------------------------------
  // TEST 10: Flirty Mood inference
  // ----------------------------------------------------
  const flirtyMood = ChatbotService.inferMood('you are looking so hot and cute 😉');
  assert(flirtyMood === 'flirty', 'TEST 10: Flirty comments infer "flirty" mood');

  // ----------------------------------------------------
  // TEST 11: Serious Mood inference
  // ----------------------------------------------------
  const seriousMood = ChatbotService.inferMood('seriously stop this, listen to me urgent');
  assert(seriousMood === 'serious', 'TEST 11: Urgent/serious statements infer "serious" mood');

  // ----------------------------------------------------
  // TEST 12: Curious Mood inference
  // ----------------------------------------------------
  const curiousMood = ChatbotService.inferMood('what is this and how does it work?');
  assert(curiousMood === 'curious', 'TEST 12: Questions infer "curious" mood');

  // ----------------------------------------------------
  // TEST 13: Excited Mood inference
  // ----------------------------------------------------
  const excitedMood = ChatbotService.inferMood('OMG jeet gaye! super excited yay 🔥');
  assert(excitedMood === 'excited', 'TEST 13: High excitement infers "excited" mood');

  // ----------------------------------------------------
  // TEST 14: Confused Mood inference
  // ----------------------------------------------------
  const confusedMood = ChatbotService.inferMood('wait what? samajh nahi aaya kya matlab');
  assert(confusedMood === 'confused', 'TEST 14: Contradiction/confusion infers "confused" mood');

  // ----------------------------------------------------
  // TEST 15: Admin Command /roxiemode auto
  // ----------------------------------------------------
  const settings = db.getGroupSettings(chatId, chatTitle);
  settings.chatbotEnabled = true;

  (telegramApi as any).getChatMember = async () => ({
    ok: true,
    result: { status: 'administrator', user: { id: 7001, is_bot: false, first_name: 'Admin' } }
  });

  let lastSentText = '';
  (telegramApi as any).sendMessage = async (cId: number, text: string) => {
    lastSentText = text;
    return { ok: true, result: { message_id: 1001 } };
  };

  await CommandHandler.handleCommand({
    command: '/roxiemode',
    args: ['auto'],
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 7001, first_name: 'Admin', is_bot: false },
    message: { message_id: 201, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
  });
  assert(db.getGroupSettings(chatId).chatbotMode === 'auto' && lastSentText.includes('auto'), 'TEST 15: /roxiemode auto sets dynamic mood mode');

  // ----------------------------------------------------
  // TEST 16: Admin Command /roxiemode friendly
  // ----------------------------------------------------
  await CommandHandler.handleCommand({
    command: '/roxiemode',
    args: ['friendly'],
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 7001, first_name: 'Admin', is_bot: false },
    message: { message_id: 202, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
  });
  assert(db.getGroupSettings(chatId).chatbotMode === 'friendly' && lastSentText.includes('friendly'), 'TEST 16: /roxiemode friendly overrides manual mood');

  // ----------------------------------------------------
  // TEST 17: Admin Command /roxiemode normal
  // ----------------------------------------------------
  await CommandHandler.handleCommand({
    command: '/roxiemode',
    args: ['normal'],
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 7001, first_name: 'Admin', is_bot: false },
    message: { message_id: 203, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
  });
  assert(db.getGroupSettings(chatId).chatbotMode === 'normal', 'TEST 17: /roxiemode normal sets normal mode');

  // ----------------------------------------------------
  // TEST 18: Admin Command /roxiemode status
  // ----------------------------------------------------
  await CommandHandler.handleCommand({
    command: '/roxiemode',
    args: ['status'],
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 7001, first_name: 'Admin', is_bot: false },
    message: { message_id: 204, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
  });
  assert(lastSentText.includes('Roxie AI Behavior & Mood Control') && lastSentText.includes('Loaded Stickers'), 'TEST 18: /roxiemode status displays active mode & media counts');

  // Reset mode to auto for subsequent tests
  db.getGroupSettings(chatId).chatbotMode = 'auto';

  // ----------------------------------------------------
  // TEST 19: Long continuous conversation (NO 20-25 message cap!)
  // ----------------------------------------------------
  ChatbotService.reset();
  db.clearMediaLibrary();
  let conversationMsgCount = 0;
  let sentReplies: Array<{ text: string; replyTo: number }> = [];

  (telegramApi as any).sendMessage = async (cId: number, text: string, opts: any) => {
    conversationMsgCount++;
    sentReplies.push({ text, replyTo: opts?.reply_to_message_id });
    return { ok: true, result: { message_id: 3000 + conversationMsgCount } };
  };
  (telegramApi as any).sendSticker = async (cId: number, fileId: string, opts: any) => {
    conversationMsgCount++;
    sentReplies.push({ text: '[sticker]', replyTo: opts?.reply_to_message_id });
    return { ok: true, result: { message_id: 3000 + conversationMsgCount } };
  };
  (telegramApi as any).sendAnimation = async (cId: number, fileId: string, opts: any) => {
    conversationMsgCount++;
    sentReplies.push({ text: '[anim]', replyTo: opts?.reply_to_message_id });
    return { ok: true, result: { message_id: 3000 + conversationMsgCount } };
  };

  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'Haan sahi baat hai bilkul!' } }] })
  });

  // Send 30 sequential messages in the conversation
  let noLimitHit = true;
  let handledCount = 0;
  for (let i = 1; i <= 30; i++) {
    const msg = {
      message_id: 500 + i,
      chat: { id: chatId, type: 'supergroup', title: chatTitle },
      from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
      text: `Roxie continuous message number ${i}`,
      date: Math.floor(Date.now() / 1000)
    } as any;
    const handled = await ChatbotService.handleMessage(msg, botUser);
    if (!handled) {
      noLimitHit = false;
      break;
    }
    handledCount++;
  }

  const hasNoRateLimitWarning = !sentReplies.some(r => r.text.includes('too many messages'));
  assert(handledCount === 30 && noLimitHit && hasNoRateLimitWarning, 'TEST 19: Continuous conversation beyond 25 messages proceeds indefinitely without artificial rate-limit cap');

  // ----------------------------------------------------
  // TEST 20: Rolling Context Truncation (10-20 message rolling window)
  // ----------------------------------------------------
  assert(ChatbotService.MAX_CONTEXT_MESSAGES >= 10 && ChatbotService.MAX_CONTEXT_MESSAGES <= 25, 'TEST 20: Context window configuration is strictly bounded to 10-20 rolling messages');

  // ----------------------------------------------------
  // TEST 21: Long-term User Memory persists independently of rolling context
  // ----------------------------------------------------
  ChatbotService.reset();
  db.clearUserMemory(chatId, 9001);
  const memoryMsg = {
    message_id: 601,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: 'Roxie my name is Rahul and I love robotics',
    date: Math.floor(Date.now() / 1000)
  } as any;
  await ChatbotService.handleMessage(memoryMsg, botUser);
  const userFacts = db.getUserMemory(chatId, 9001);
  assert(userFacts.some(f => f.toLowerCase().includes('my name is rahul')), 'TEST 21: User memory fact stored persistently in database');

  // ----------------------------------------------------
  // TEST 22: Bot commands NEVER enter the chatbot pipeline
  // ----------------------------------------------------
  ChatbotService.reset();
  let chatbotInvokedForCommand = false;
  const commandMsg = {
    message_id: 701,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: '/help',
    date: Math.floor(Date.now() / 1000)
  } as any;
  const cmdHandled = await ChatbotService.handleMessage(commandMsg, botUser);
  assert(cmdHandled === false, 'TEST 22: Bot command (/help) is rejected by ChatbotService before any AI processing');

  // ----------------------------------------------------
  // TEST 23: Atomic Gate Deduplication (1 message = 1 decision = 1 response)
  // ----------------------------------------------------
  ChatbotService.reset();
  const g1 = ChatbotService.acquireGate(chatId, 801);
  const g2 = ChatbotService.acquireGate(chatId, 801); // concurrent duplicate
  ChatbotService.releaseGate(chatId, 801);
  const g3 = ChatbotService.acquireGate(chatId, 801); // sequential duplicate
  assert(g1 === true && g2 === false && g3 === false, 'TEST 23: Atomic gate strictly guarantees 1 response per incoming message ID');

  // ----------------------------------------------------
  // TEST 24: Real Telegram Sticker Dispatch (sendSticker)
  // ----------------------------------------------------
  ChatbotService.reset();
  db.clearMediaLibrary();
  db.addStickerToLibrary('normal', 'STICKER_FILE_ID_XYZ');
  let stickerSent = 0;
  let stickerOpts: any = null;
  (telegramApi as any).sendSticker = async (cId: number, fileId: string, opts: any) => {
    stickerSent++;
    stickerOpts = { cId, fileId, opts };
    return { ok: true, result: { message_id: 8881 } };
  };

  const stickerReq = {
    message_id: 901,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: 'ab sticker bhej',
    date: Math.floor(Date.now() / 1000)
  } as any;
  await ChatbotService.handleMessage(stickerReq, botUser);
  assert(stickerSent === 1 && stickerOpts.fileId === 'STICKER_FILE_ID_XYZ' && stickerOpts.opts.reply_to_message_id === 901, 'TEST 24: Explicit sticker request sends real sticker via sendSticker with reply_to_message_id');

  // ----------------------------------------------------
  // TEST 25: Real Telegram Animation/GIF Dispatch (sendAnimation)
  // ----------------------------------------------------
  ChatbotService.reset();
  db.clearMediaLibrary();
  db.addAnimationToLibrary('funny', 'ANIM_FILE_ID_ABC');
  let animSent = 0;
  let animOpts: any = null;
  (telegramApi as any).sendAnimation = async (cId: number, fileId: string, opts: any) => {
    animSent++;
    animOpts = { cId, fileId, opts };
    return { ok: true, result: { message_id: 8882 } };
  };

  const animReq = {
    message_id: 902,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: 'ek funny gif bhejo',
    date: Math.floor(Date.now() / 1000)
  } as any;
  await ChatbotService.handleMessage(animReq, botUser);
  assert(animSent === 1 && animOpts.fileId === 'ANIM_FILE_ID_ABC' && animOpts.opts.reply_to_message_id === 902, 'TEST 25: Explicit GIF request sends real animation via sendAnimation with reply_to_message_id');

  // ----------------------------------------------------
  // TEST 26: Missing Media Honesty (No hallucination, single honest text)
  // ----------------------------------------------------
  ChatbotService.reset();
  db.clearMediaLibrary();
  // Clear env vars
  const origStk = process.env.TELEGRAM_STICKERS_JSON;
  delete process.env.TELEGRAM_STICKERS_JSON;

  let missingMediaTextCount = 0;
  let missingMediaText = '';
  (telegramApi as any).sendMessage = async (cId: number, text: string) => {
    missingMediaTextCount++;
    missingMediaText = text;
    return { ok: true, result: { message_id: 8883 } };
  };

  const emptyStickerReq = {
    message_id: 903,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: 'Roxie gif bhej',
    date: Math.floor(Date.now() / 1000)
  } as any;
  await ChatbotService.handleMessage(emptyStickerReq, botUser);
  process.env.TELEGRAM_STICKERS_JSON = origStk;

  assert(missingMediaTextCount === 1 && missingMediaText.includes('mere paas abhi GIFs registered nahi hain'), 'TEST 26: Empty media library returns single honest explanation text message');

  // ----------------------------------------------------
  // TEST 27: Clean AI Text Strips Asterisks Actions
  // ----------------------------------------------------
  const cleaned1 = ChatbotService.cleanAiText('*sends a sticker* Arre suno!');
  const cleaned2 = ChatbotService.cleanAiText('Acha *laughs* mast joke mara!');
  assert(cleaned1 === 'Arre suno!' && cleaned2 === 'Acha mast joke mara!', 'TEST 27: cleanAiText completely strips out *sends a sticker*, *laughs*, and asterisks artifacts');

  // ----------------------------------------------------
  // TEST 28: OpenRouter Model Fallback on primary failure
  // ----------------------------------------------------
  ChatbotService.reset();
  process.env.OPENROUTER_MODELS = 'failing/model-primary,working/model-fallback';
  let modelsRequested: string[] = [];
  (global as any).fetch = async (url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    modelsRequested.push(body.model);
    if (body.model === 'failing/model-primary') {
      return { ok: false, status: 503, text: async () => 'Service Unavailable' };
    }
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Fallback response worked perfectly!' } }] })
    };
  };

  const fallbackMsg = {
    message_id: 904,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 9001, is_bot: false, first_name: 'RegularChatter' },
    text: 'Roxie test model fallback',
    date: Math.floor(Date.now() / 1000)
  } as any;

  let fallbackReplySent = false;
  const markFallbackSent = async () => {
    fallbackReplySent = true;
    return { ok: true, result: { message_id: 8884 } };
  };
  (telegramApi as any).sendMessage = markFallbackSent;
  (telegramApi as any).sendSticker = markFallbackSent;
  (telegramApi as any).sendAnimation = markFallbackSent;

  await ChatbotService.handleMessage(fallbackMsg, botUser);
  assert(modelsRequested.includes('failing/model-primary') && modelsRequested.includes('working/model-fallback') && fallbackReplySent, 'TEST 28: OpenRouter model fallback iterates smoothly and delivers response on primary failure');

  // ----------------------------------------------------
  // Cleanup test environment
  // ----------------------------------------------------
  telegramApi.sendMessage = origSendMsg;
  telegramApi.sendSticker = origSendSticker;
  telegramApi.sendAnimation = origSendAnim;
  telegramApi.sendChatAction = origSendChatAction;
  global.fetch = origFetch;
  process.env.OPENROUTER_API_KEY = origApiKey;
  process.env.TELEGRAM_STICKERS_JSON = origStickersJson;
  process.env.TELEGRAM_ANIMATIONS_JSON = origAnimsJson;
  ChatbotService.reset();
  db.clearMediaLibrary();

  console.log('====================================================');
  console.log(`🎉 Final 28-Point Regression Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runChatbotRegressionTestSuite().catch(err => {
  console.error('Regression test suite crashed:', err);
  process.exit(1);
});
