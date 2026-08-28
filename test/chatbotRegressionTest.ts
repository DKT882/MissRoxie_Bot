import { ChatbotService } from '../server/telegram/chatbot.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';

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

async function runChatbotRegressionTests() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Chatbot Final Bug Fix Regression Test Suite...');
  console.log('====================================================');

  const chatId = -100555444333;
  const chatTitle = 'Regression Test Group';
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  ChatbotService.reset();
  db.clearMediaLibrary();
  const settings = db.getGroupSettings(chatId, chatTitle);
  settings.chatbotEnabled = true;

  const origApiKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = 'test_api_key';

  const origSendMsg = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  (telegramApi as any).sendChatAction = async () => ({ ok: true });

  // Test 1: Random response uses reply_to_message_id and is never standalone
  let lastSentOptions: any = null;
  let sentMessageCount = 0;
  (telegramApi as any).sendMessage = async (cId: number, text: string, opts: any) => {
    sentMessageCount++;
    lastSentOptions = opts;
    return { message_id: 888, chat: { id: cId, type: 'supergroup' }, date: Date.now() };
  };

  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'Haan bilkul sahi baat hai!' } }] })
  });

  // Force random trigger by mocking Math.random
  const origMathRandom = Math.random;
  Math.random = () => 0.01; // < 0.03 probability

  const randomMsg = {
    message_id: 501,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 777, is_bot: false, first_name: 'UserRandom' },
    text: 'Weather is very nice today',
    date: Math.floor(Date.now() / 1000)
  } as any;

  // Since random cooldown might apply, reset ChatbotService or mock time/cooldown
  ChatbotService.reset();
  settings.chatbotEnabled = true;

  const handledRandom = await ChatbotService.handleMessage(randomMsg, botUser);
  Math.random = origMathRandom;

  assert(sentMessageCount === 1 && lastSentOptions?.reply_to_message_id === 501, 'REGRESSION-01: Random chatbot response uses reply_to_message_id matching triggering message');

  // Test 2: Exactly one response per message (No double responses)
  ChatbotService.reset();
  settings.chatbotEnabled = true;
  sentMessageCount = 0;

  const normalMsg = {
    message_id: 502,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 777, is_bot: false, first_name: 'UserNormal' },
    text: 'Roxie, what is 2 + 2?',
    date: Math.floor(Date.now() / 1000)
  } as any;

  (global as any).fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'It is 4 yaar!' } }] })
  });

  await ChatbotService.handleMessage(normalMsg, botUser);
  // Duplicate call with same message_id should be ignored
  await ChatbotService.handleMessage(normalMsg, botUser);

  assert(sentMessageCount === 1, 'REGRESSION-02: Exactly one response sent for an incoming message; duplicate update ignored');

  // Test 3: Sticker request sends exactly one response (sticker), no separate text message
  ChatbotService.reset();
  db.addStickerToLibrary('normal', 'STICKER_TEST_123');
  settings.chatbotEnabled = true;

  let stickerCallCount = 0;
  let textCallCount = 0;
  (telegramApi as any).sendSticker = async () => {
    stickerCallCount++;
    return { ok: true };
  };
  (telegramApi as any).sendMessage = async () => {
    textCallCount++;
    return { message_id: 999, chat: { id: chatId, type: 'supergroup' }, date: Date.now() };
  };

  const stickerMsg = {
    message_id: 503,
    chat: { id: chatId, type: 'supergroup', title: chatTitle },
    from: { id: 777, is_bot: false, first_name: 'UserSticker' },
    text: 'Roxie send a sticker please',
    date: Math.floor(Date.now() / 1000)
  } as any;

  await ChatbotService.handleMessage(stickerMsg, botUser);

  assert(stickerCallCount === 1 && textCallCount === 0, 'REGRESSION-03: Sticker selection sends exactly one sticker message without a separate duplicate text response');

  // Cleanup mocks
  telegramApi.sendMessage = origSendMsg;
  telegramApi.sendSticker = origSendSticker;
  telegramApi.sendChatAction = origSendChatAction;
  global.fetch = origFetch;
  process.env.OPENROUTER_API_KEY = origApiKey;
  ChatbotService.reset();
  db.clearMediaLibrary();

  console.log('====================================================');
  console.log(`🎉 Chatbot Regression Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runChatbotRegressionTests().catch(err => {
  console.error('Chatbot regression test suite failed:', err);
  process.exit(1);
});
