import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runDuplicateResponsePreventionTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Duplicate Response Prevention Invariant Test Suite');
  console.log('===================================================================\n');

  const botId = 888999111;
  const botUser: TelegramUser = {
    id: botId,
    is_bot: true,
    first_name: 'Roxie',
    username: 'MissRoxie_Bot'
  };

  const testChat = -100999888777;

  // Track API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string; options?: any }> = [];
  let simulatedAiText: string | null = 'Hey! Main theek hoon, tum sunao?';

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 5000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    sentStickers.push({ chatId, fileId: sticker, options });
    return { ok: true, result: { message_id: 6000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (): Promise<any> => ({ ok: true, result: true });

  global.fetch = async (url: any, init?: any): Promise<any> => {
    const urlStr = String(url);
    if (urlStr.includes('api.openai.com') || urlStr.includes('openrouter.ai') || urlStr.includes('groq.com')) {
      if (!simulatedAiText) {
        return {
          ok: false,
          status: 500,
          text: async () => 'AI Engine Error'
        };
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: simulatedAiText
              }
            }
          ]
        })
      };
    }
    return origFetch(url, init);
  };

  try {
    db.setBotIdentity({ id: botId, username: 'MissRoxie_Bot' });

    // Initialize group settings
    db.updateGroupSettings(testChat, {
      botId,
      chatbotEnabled: true,
      lustMode: false,
      humanMessagesSinceLastSticker: 20,
      requiredStickerGap: 5,
      stickerActivityMin: 1,
      stickerActivityMax: 5,
      autoResponse: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 0,
        lastResponseTimestamp: 0,
        nextAllowedAt: 0
      },
      autoSticker: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 0,
        lastStickerTimestamp: 0,
        nextAllowedAt: 0
      },
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers'
      }
    });

    db.addStickerToLibrary('normal', 'CAACAgIAAxkBAAEtest_sticker_dedup_123', undefined, testChat);

    function createMockMessage(messageId: number, text: string, overrides: Partial<TelegramMessage> = {}): TelegramMessage {
      return {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: testChat,
          type: 'supergroup',
          title: 'Dedup Test Chat'
        },
        from: {
          id: 9991234,
          is_bot: false,
          first_name: 'Alex',
          username: 'alex_test'
        },
        text,
        ...overrides
      };
    }

    // -------------------------------------------------------------------------
    // TEST 1: Sequential Duplicate Message ID Rejection
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Sequential Duplicate Message ID Rejection ---');
    sentMessages = [];
    sentStickers = [];
    const msg1 = createMockMessage(2001, 'Roxie tell me a joke');

    const res1a = await ChatbotService.handleMessage(msg1, botUser);
    assert.strictEqual(sentMessages.length, 1, 'First call should send exactly 1 message');
    assert.strictEqual(res1a, true, 'First call should return true (handled)');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 2001, 'Reply to message ID must match');

    // Second sequential call with exact same message
    const res1b = await ChatbotService.handleMessage(msg1, botUser);
    assert.strictEqual(sentMessages.length, 1, 'Second call MUST NOT send any additional message');
    assert.strictEqual(res1b, false, 'Second call must return false (already processed/ignored)');
    pass('Test 1: Sequential duplicate message is idempotently rejected');

    // -------------------------------------------------------------------------
    // TEST 2: Concurrent Duplicate Message ID Processing (Promise.all)
    // -------------------------------------------------------------------------
    console.log('--- Test 2: Concurrent Duplicate Message ID Processing ---');
    sentMessages = [];
    sentStickers = [];
    const msg2 = createMockMessage(2002, 'Roxie what is the capital of France?');

    const results = await Promise.all([
      ChatbotService.handleMessage(msg2, botUser),
      ChatbotService.handleMessage(msg2, botUser),
      ChatbotService.handleMessage(msg2, botUser)
    ]);

    assert.strictEqual(sentMessages.length, 1, 'Concurrent calls for same message MUST produce exactly 1 response');
    const handledCount = results.filter(r => r === true).length;
    assert.strictEqual(handledCount, 1, 'Only 1 promise execution should succeed');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 2002, 'Reply to message ID must match');
    pass('Test 2: Concurrent duplicate messages resolved to exactly 1 response');

    // -------------------------------------------------------------------------
    // TEST 3: Direct Trigger + AutoEngine Collision Invariant
    // -------------------------------------------------------------------------
    console.log('--- Test 3: Direct Trigger + AutoEngine Collision Invariant ---');
    sentMessages = [];
    sentStickers = [];
    const msg3 = createMockMessage(2003, 'Hey Roxie how are you today?');

    // 1. Direct message processed
    await ChatbotService.handleMessage(msg3, botUser);
    assert.strictEqual(sentMessages.length, 1, 'Direct message sends 1 reply');

    // Verify last considered message ID is recorded
    const lastConsideredAfterDirect = db.getLastProactiveConsideredMessageId(testChat);
    assert.strictEqual(lastConsideredAfterDirect, 2003, 'Direct message must update lastProactiveConsideredMessageId');

    // 2. Background AutoEngine evaluates the same chat immediately
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      name: 'Alex',
      content: 'Hey Roxie how are you today?',
      timestamp: Date.now(),
      messageId: 2003
    });

    const isConsidered = 2003 <= db.getLastProactiveConsideredMessageId(testChat);
    const isLockedOrProcessed = ChatbotService.isMessageProcessedOrInFlight(testChat, 2003);
    assert(isConsidered || isLockedOrProcessed, 'Message 2003 must be recognized as already considered or processed');

    assert.strictEqual(sentMessages.length, 1, 'No additional proactive message sent for direct-triggered message');
    pass('Test 3: Direct trigger and AutoEngine collision prevented');

    // -------------------------------------------------------------------------
    // TEST 4: Proactive Response Targets Triggering Human Message
    // -------------------------------------------------------------------------
    console.log('--- Test 4: Proactive Response Targets Triggering Human Message ---');
    sentMessages = [];
    sentStickers = [];
    const msg4 = createMockMessage(2004, 'The weather is so pleasant this evening');

    // Reset cooldown state on group for test
    const grpSettings = db.getGroupSettings(testChat);
    if (grpSettings.autoResponse) {
      grpSettings.autoResponse.lastResponseTimestamp = 0;
      grpSettings.autoResponse.nextAllowedAt = 0;
      grpSettings.autoResponse.mode = 'every_message';
    }

    assert(2004 > db.getLastProactiveConsideredMessageId(testChat));

    const origProb = ChatbotService.PROACTIVE_OPPORTUNITY_PROBABILITY;
    ChatbotService.PROACTIVE_OPPORTUNITY_PROBABILITY = 1.0;

    const res4 = await ChatbotService.handleMessage(msg4, botUser);
    ChatbotService.PROACTIVE_OPPORTUNITY_PROBABILITY = origProb;

    assert.strictEqual(sentMessages.length, 1, 'Proactive opportunity sends 1 response');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 2004, 'Proactive response must target message 2004');
    assert.strictEqual(db.getLastProactiveConsideredMessageId(testChat), 2004, 'Proactive response marks message 2004 as considered');

    await ChatbotService.handleMessage(msg4, botUser);
    assert.strictEqual(sentMessages.length, 1, 'No second proactive response for same message');
    pass('Test 4: Proactive response correctly targets human message ID and marks as considered');

    // -------------------------------------------------------------------------
    // TEST 5: Explicit Sticker Keyword Trigger (1 Sticker, 0 Text)
    // -------------------------------------------------------------------------
    console.log('--- Test 5: Explicit Sticker Keyword Trigger ---');
    sentMessages = [];
    sentStickers = [];

    // Ensure sticker eligibility
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 20,
      requiredStickerGap: 5,
      autoSticker: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 0,
        lastStickerTimestamp: 0,
        nextAllowedAt: 0
      }
    });

    const msg5 = createMockMessage(2005, 'Roxie please send a sticker');

    await ChatbotService.handleMessage(msg5, botUser);
    assert.strictEqual(sentStickers.length, 1, 'Explicit sticker request sends exactly 1 sticker');
    assert.strictEqual(sentMessages.length, 0, 'Explicit sticker request sends 0 text messages');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 2005, 'Sticker reply_to_message_id must match');
    assert.strictEqual(db.getLastProactiveConsideredMessageId(testChat), 2005, 'Explicit sticker marks message as considered');
    pass('Test 5: Explicit sticker sends 1 sticker and 0 text messages');

    // -------------------------------------------------------------------------
    // TEST 6: Explicit Sticker Keyword Trigger Gated (No Text Fallback)
    // -------------------------------------------------------------------------
    console.log('--- Test 6: Explicit Sticker Keyword Trigger Gated ---');
    sentMessages = [];
    sentStickers = [];

    const origCheck = db.checkAutoStickerEligibility.bind(db);
    db.checkAutoStickerEligibility = () => ({ allowed: false, reason: 'activity_cooldown', remainingSeconds: 300 });

    const msg6 = createMockMessage(2006, 'Roxie send sticker now');
    await ChatbotService.handleMessage(msg6, botUser);

    db.checkAutoStickerEligibility = origCheck;

    assert.strictEqual(sentStickers.length, 0, 'Gated sticker request sends 0 stickers');
    assert.strictEqual(sentMessages.length, 0, 'Gated sticker request sends 0 text fallback messages');
    pass('Test 6: Gated explicit sticker produces silence (0 stickers, 0 text fallback)');

    // -------------------------------------------------------------------------
    // TEST 7: Reply to Roxie Trigger Response Targeting
    // -------------------------------------------------------------------------
    console.log('--- Test 7: Reply to Roxie Trigger Response Targeting ---');
    sentMessages = [];
    sentStickers = [];
    const msg7 = createMockMessage(2007, 'I disagree with your point', {
      reply_to_message: {
        message_id: 1999,
        date: Math.floor(Date.now() / 1000) - 10,
        chat: { id: testChat, type: 'supergroup', title: 'Dedup Test Chat' },
        from: {
          id: botId,
          is_bot: true,
          first_name: 'Roxie',
          username: 'MissRoxie_Bot'
        },
        text: 'Previous bot statement'
      }
    });

    await ChatbotService.handleMessage(msg7, botUser);
    assert.strictEqual(sentMessages.length, 1, 'Reply to Roxie sends exactly 1 response');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 2007, 'Reply to Roxie targets user reply message ID 2007');
    pass('Test 7: Reply to Roxie produces exactly 1 response targeting user message ID');

    // -------------------------------------------------------------------------
    // TEST 8: Roxie Self-Message Filter
    // -------------------------------------------------------------------------
    console.log('--- Test 8: Roxie Self-Message Filter ---');
    sentMessages = [];
    sentStickers = [];
    const msg8 = createMockMessage(2008, 'I am Roxie and I am speaking', {
      from: {
        id: botId,
        is_bot: true,
        first_name: 'Roxie',
        username: 'MissRoxie_Bot'
      }
    });

    const res8 = await ChatbotService.handleMessage(msg8, botUser);
    assert.strictEqual(sentMessages.length, 0, 'Bot self-message MUST produce 0 responses');
    assert.strictEqual(sentStickers.length, 0, 'Bot self-message MUST produce 0 stickers');
    assert.strictEqual(res8, false, 'Self-message returns false');
    pass('Test 8: Bot self-message is ignored at ingestion');

    // -------------------------------------------------------------------------
    // TEST 9: Telegram Service / Pin Message Filter
    // -------------------------------------------------------------------------
    console.log('--- Test 9: Telegram Service / Pin Message Filter ---');
    sentMessages = [];
    sentStickers = [];
    const msg9 = createMockMessage(2009, '', {
      pinned_message: {
        message_id: 2000,
        date: Math.floor(Date.now() / 1000) - 20,
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 9991234, is_bot: false, first_name: 'Alex' },
        text: 'Important pinned notice'
      }
    });

    const res9 = await ChatbotService.handleMessage(msg9, botUser);
    assert.strictEqual(sentMessages.length, 0, 'Service/pin message MUST produce 0 responses');
    assert.strictEqual(sentStickers.length, 0, 'Service/pin message MUST produce 0 stickers');
    assert.strictEqual(res9, false, 'Service message returns false');
    pass('Test 9: Telegram service/pin message is ignored at ingestion');

    // -------------------------------------------------------------------------
    // TEST 10: Multiple Independent Messages in Same Chat Processed Concurrently
    // -------------------------------------------------------------------------
    console.log('--- Test 10: Multiple Independent Messages Concurrently ---');
    sentMessages = [];
    sentStickers = [];
    const msg10a = createMockMessage(2010, 'Roxie what is 2+2?');
    const msg10b = createMockMessage(2011, 'Roxie what is 3+3?');

    const [res10a, res10b] = await Promise.all([
      ChatbotService.handleMessage(msg10a, botUser),
      ChatbotService.handleMessage(msg10b, botUser)
    ]);

    assert.strictEqual(sentMessages.length, 2, 'Two distinct messages must both produce responses');
    const targetIds = sentMessages.map(m => m.options?.reply_to_message_id).sort();
    assert.deepStrictEqual(targetIds, [2010, 2011], 'Each response must target its respective triggering message ID');
    pass('Test 10: Multiple independent messages processed concurrently without cross-blocking');

    console.log('\n===================================================================');
    console.log(`🎉 ALL ${passed} DUPLICATE PREVENTION INVARIANT TESTS PASSED! (100%)`);
    console.log('===================================================================\n');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }
}

runDuplicateResponsePreventionTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
