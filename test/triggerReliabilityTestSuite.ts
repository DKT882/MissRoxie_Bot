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

async function runTriggerReliabilityTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting "roxie" and "sticker/stickers" Trigger Reliability Test Suite');
  console.log('===================================================================\n');

  const botId = 888999111;
  const botUser: TelegramUser = {
    id: botId,
    is_bot: true,
    first_name: 'Roxie',
    username: 'MissRoxie_Bot'
  };

  const testChat = -100999888555;

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

  const resetTracking = () => {
    sentMessages = [];
    sentStickers = [];
    simulatedAiText = 'Hey! Main theek hoon, tum sunao?';
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

    db.addStickerToLibrary('normal', 'CAACAgIAAxkBAAEtest_sticker_trigger_123', undefined, testChat);

    function createMockMessage(messageId: number, text: string, overrides: Partial<TelegramMessage> = {}): TelegramMessage {
      return {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: testChat,
          type: 'supergroup',
          title: 'Trigger Test Chat'
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
    // TEST 1: lowercase "roxie" -> exactly one response
    // -------------------------------------------------------------------------
    console.log('--- Test 1: Lowercase "roxie" ---');
    resetTracking();
    const msg1 = createMockMessage(3001, 'roxie');
    assert.strictEqual(ChatbotService.isTriggered(msg1, botUser), true, 'Lowercase "roxie" must be triggered');
    const res1 = await ChatbotService.handleMessage(msg1, botUser);
    assert.strictEqual(res1, true);
    assert.strictEqual(sentMessages.length, 1, 'Exactly 1 text message sent');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 3001, 'Reply to message ID must match');
    pass('Test 1: Lowercase "roxie" triggers exactly one AI text response');

    // -------------------------------------------------------------------------
    // TEST 2: uppercase "ROXIE HELP" -> exactly one response
    // -------------------------------------------------------------------------
    console.log('--- Test 2: Uppercase "ROXIE HELP" ---');
    resetTracking();
    const msg2 = createMockMessage(3002, 'ROXIE HELP');
    assert.strictEqual(ChatbotService.isTriggered(msg2, botUser), true, 'Uppercase "ROXIE HELP" must be triggered');
    const res2 = await ChatbotService.handleMessage(msg2, botUser);
    assert.strictEqual(res2, true);
    assert.strictEqual(sentMessages.length, 1, 'Exactly 1 text message sent');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 3002, 'Reply to message ID must match');
    pass('Test 2: Uppercase "ROXIE HELP" triggers exactly one AI text response');

    // -------------------------------------------------------------------------
    // TEST 3: Roxie with punctuation ("hey, roxie!", "roxie?", "roxie.")
    // -------------------------------------------------------------------------
    console.log('--- Test 3: Roxie with punctuation ---');
    const puncMsgs = [
      createMockMessage(3003, 'hey, roxie!'),
      createMockMessage(3004, 'roxie?'),
      createMockMessage(3005, 'roxie.')
    ];
    for (const pm of puncMsgs) {
      assert.strictEqual(ChatbotService.isTriggered(pm, botUser), true, `Punctuation variant "${pm.text}" must be triggered`);
    }
    pass('Test 3: Roxie with punctuation variants ("hey, roxie!", "roxie?", "roxie.") detected');

    // -------------------------------------------------------------------------
    // TEST 4: Roxie as substring should NOT trigger ("proxy", "roxiebot", "roxie123")
    // -------------------------------------------------------------------------
    console.log('--- Test 4: Substring false positive rejection ---');
    const falsePositives = [
      createMockMessage(3006, 'use a proxy server'),
      createMockMessage(3007, 'hello roxiebot'),
      createMockMessage(3008, 'my user is roxie123')
    ];
    for (const fp of falsePositives) {
      assert.strictEqual(ChatbotService.isTriggered(fp, botUser), false, `Substring variant "${fp.text}" must NOT trigger`);
    }
    pass('Test 4: Substrings like "proxy", "roxiebot", "roxie123" are correctly rejected');

    // -------------------------------------------------------------------------
    // TEST 5: Telegram @mention ("@MissRoxie_Bot help")
    // -------------------------------------------------------------------------
    console.log('--- Test 5: Telegram @mention ---');
    resetTracking();
    const msg5 = createMockMessage(3009, '@MissRoxie_Bot help', {
      entities: [{ type: 'mention', offset: 0, length: 14 }]
    });
    assert.strictEqual(ChatbotService.isTriggered(msg5, botUser), true, '@MissRoxie_Bot mention must trigger');
    const res5 = await ChatbotService.handleMessage(msg5, botUser);
    assert.strictEqual(res5, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 3009);
    pass('Test 5: Telegram @mention "@MissRoxie_Bot help" triggers exactly one response');

    // -------------------------------------------------------------------------
    // TEST 6: Reply to Roxie -> exactly one response
    // -------------------------------------------------------------------------
    console.log('--- Test 6: Reply to Roxie ---');
    resetTracking();
    const msg6 = createMockMessage(3010, 'I totally agree with this point', {
      reply_to_message: {
        message_id: 2999,
        date: Math.floor(Date.now() / 1000) - 10,
        chat: { id: testChat, type: 'supergroup', title: 'Trigger Test Chat' },
        from: botUser,
        text: 'Previous message from Roxie'
      }
    });
    assert.strictEqual(ChatbotService.isTriggered(msg6, botUser), true, 'Reply to Roxie must trigger');
    const res6 = await ChatbotService.handleMessage(msg6, botUser);
    assert.strictEqual(res6, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 3010);
    pass('Test 6: Reply to Roxie produces exactly one response targeting user reply message ID');

    // -------------------------------------------------------------------------
    // TEST 7: "sticker" -> explicit sticker path
    // -------------------------------------------------------------------------
    console.log('--- Test 7: "sticker" keyword ---');
    resetTracking();
    const msg7 = createMockMessage(3011, 'sticker');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg7.text!), true);
    const res7 = await ChatbotService.handleMessage(msg7, botUser);
    assert.strictEqual(res7, true);
    assert.strictEqual(sentStickers.length, 1, 'Exactly 1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3011, 'Reply to message ID must match');
    pass('Test 7: "sticker" produces exactly 1 sticker and 0 text');

    // -------------------------------------------------------------------------
    // TEST 8: "send me stickers" (plural) -> explicit sticker path
    // -------------------------------------------------------------------------
    console.log('--- Test 8: "send me stickers" (plural) ---');
    resetTracking();
    const msg8 = createMockMessage(3012, 'send me stickers');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg8.text!), true);
    const res8 = await ChatbotService.handleMessage(msg8, botUser);
    assert.strictEqual(res8, true);
    assert.strictEqual(sentStickers.length, 1, 'Exactly 1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3012);
    pass('Test 8: "send me stickers" (plural) produces exactly 1 sticker and 0 text');

    // -------------------------------------------------------------------------
    // TEST 9: uppercase "STICKER PLEASE" -> explicit sticker path
    // -------------------------------------------------------------------------
    console.log('--- Test 9: Uppercase "STICKER PLEASE" ---');
    resetTracking();
    const msg9 = createMockMessage(3013, 'STICKER PLEASE');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg9.text!), true);
    const res9 = await ChatbotService.handleMessage(msg9, botUser);
    assert.strictEqual(res9, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3013);
    pass('Test 9: Uppercase "STICKER PLEASE" produces exactly 1 sticker and 0 text');

    // -------------------------------------------------------------------------
    // TEST 10: "can you send me a sticker?" in normal sentence
    // -------------------------------------------------------------------------
    console.log('--- Test 10: "can you send me a sticker?" ---');
    resetTracking();
    const msg10 = createMockMessage(3014, 'can you send me a sticker?');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg10.text!), true);
    const res10 = await ChatbotService.handleMessage(msg10, botUser);
    assert.strictEqual(res10, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3014);
    pass('Test 10: "can you send me a sticker?" in sentence produces exactly 1 sticker and 0 text');

    // -------------------------------------------------------------------------
    // TEST 11: sticker substring false positive ("stickerbot", "stickerized")
    // -------------------------------------------------------------------------
    console.log('--- Test 11: Sticker substring false positive rejection ---');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword('stickerbot'), false, 'stickerbot must NOT be explicit sticker');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword('stickerized'), false, 'stickerized must NOT be explicit sticker');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword('mystickerpack'), false, 'mystickerpack must NOT be explicit sticker');
    pass('Test 11: Substring false positives ("stickerbot", "stickerized") correctly rejected');

    // -------------------------------------------------------------------------
    // TEST 12: Roxie + sticker ("roxie send me a sticker") -> Priority 1 (1 sticker, 0 text)
    // -------------------------------------------------------------------------
    console.log('--- Test 12: Roxie + sticker priority ---');
    resetTracking();
    const msg12 = createMockMessage(3015, 'roxie send me a sticker');
    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg12.text!), true);
    assert.strictEqual(ChatbotService.isTriggered(msg12, botUser), true);
    const res12 = await ChatbotService.handleMessage(msg12, botUser);
    assert.strictEqual(res12, true);
    assert.strictEqual(sentStickers.length, 1, 'Priority 1: Exactly 1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Priority 1: Zero text messages sent (NO text+sticker)');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3015);
    pass('Test 12: "roxie send me a sticker" resolves to Priority 1 (1 sticker, 0 text)');

    // -------------------------------------------------------------------------
    // TEST 13: Photo caption ("send me a sticker")
    // -------------------------------------------------------------------------
    console.log('--- Test 13: Photo caption with sticker request ---');
    resetTracking();
    const msg13 = createMockMessage(3016, '', {
      caption: 'send me a sticker',
      photo: [{ file_id: 'photo_123', file_unique_id: 'u123', width: 100, height: 100 }]
    });
    const res13 = await ChatbotService.handleMessage(msg13, botUser);
    assert.strictEqual(res13, true);
    assert.strictEqual(sentStickers.length, 1, 'Caption with sticker request sends 1 sticker');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3016);
    pass('Test 13: Photo caption with sticker request produces exactly 1 sticker');

    // -------------------------------------------------------------------------
    // TEST 14: Exact reply target assertion
    // -------------------------------------------------------------------------
    console.log('--- Test 14: Exact reply target assertion ---');
    resetTracking();
    const msg14Text = createMockMessage(3017, 'roxie help');
    await ChatbotService.handleMessage(msg14Text, botUser);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 3017, 'Text response must target message 3017');

    resetTracking();
    const msg14Sticker = createMockMessage(3018, 'send me a sticker');
    await ChatbotService.handleMessage(msg14Sticker, botUser);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 3018, 'Sticker response must target message 3018');
    pass('Test 14: Exact reply target verified for both text and sticker responses');

    // -------------------------------------------------------------------------
    // TEST 15: Duplicate protection regression
    // -------------------------------------------------------------------------
    console.log('--- Test 15: Duplicate protection regression ---');
    resetTracking();
    const msg15 = createMockMessage(3019, 'roxie tell me something');
    const results15 = await Promise.all([
      ChatbotService.handleMessage(msg15, botUser),
      ChatbotService.handleMessage(msg15, botUser),
      ChatbotService.handleMessage(msg15, botUser)
    ]);
    assert.strictEqual(sentMessages.length, 1, 'Concurrent trigger requests produce exactly ONE response');
    assert.strictEqual(results15.filter(r => r === true).length, 1, 'Only 1 execution completes successfully');
    pass('Test 15: Concurrent duplicate triggers produce exactly ONE response');

    console.log('\n===================================================================');
    console.log(`🎉 ALL ${passed} TRIGGER RELIABILITY TESTS PASSED! (100%)`);
    console.log('===================================================================\n');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }
}

runTriggerReliabilityTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
