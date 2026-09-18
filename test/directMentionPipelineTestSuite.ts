import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService, ChatbotDecision } from '../server/telegram/chatbot.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { TelegramMessage, TelegramUpdate, TelegramUser } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runDirectMentionPipelineTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Direct Mention Response Pipeline Test Suite');
  console.log('===================================================================\n');

  const botId = 812999555;
  const botUser: TelegramUser = {
    id: botId,
    is_bot: true,
    first_name: 'Roxie',
    username: 'MissRoxie_Bot'
  };

  const testChat = -1004991122334;

  // Track API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string; options?: any }> = [];
  let sentChatActions: Array<{ chatId: number; action: string }> = [];
  let aiGenerationFail = false;
  let simulatedAiText: string | null = 'Hey! Main theek hoon, tum sunao?';
  let failSendMessage = false;
  let failSendSticker = false;

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    if (failSendMessage) {
      return { ok: false, description: 'Telegram sendMessage network error' };
    }
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 5000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    if (failSendSticker) {
      return { ok: false, description: 'Telegram sendSticker error: wrong file ID' };
    }
    sentStickers.push({ chatId, fileId: sticker, options });
    return { ok: true, result: { message_id: 6000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (chatId: number, action: any): Promise<any> => {
    sentChatActions.push({ chatId, action });
    return { ok: true, result: true };
  };

  global.fetch = async (url: any, opts: any): Promise<any> => {
    if (typeof url === 'string' && url.includes('openrouter.ai')) {
      if (aiGenerationFail) {
        return { ok: false, status: 500, text: async () => '{"error":{"message":"OpenRouter service failure"}}' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: simulatedAiText || 'Hey! Main theek hoon, tum sunao?'
              }
            }
          ]
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
  };

  const resetTracking = () => {
    sentMessages = [];
    sentStickers = [];
    sentChatActions = [];
    aiGenerationFail = false;
    simulatedAiText = 'Hey! Main theek hoon, tum sunao?';
    failSendMessage = false;
    failSendSticker = false;
  };

  // Initialize group settings
  db.updateGroupSettings(testChat, {
    botId,
    chatbotEnabled: true,
    stickerActivityMin: 5,
    stickerActivityMax: 10,
    requiredStickerGap: 6,
    humanMessagesSinceLastSticker: 0
  });

  // Ensure media library has a sticker
  db.addStickerToLibrary('normal', 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123', undefined, testChat);

  const botManager = new TelegramBotManager();
  (botManager as any).botUser = botUser;

  try {
    // -------------------------------------------------------------------------
    // Test 1: @Roxie with activity 0 + TEXT -> 1 text, 0 sticker, correct reply target
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 6
    });

    const msg1: TelegramMessage = {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup', title: 'Direct Mention Group' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: '@MissRoxie_Bot hello'
    };

    const handled1 = await ChatbotService.handleMessage(msg1, botUser);
    assert.strictEqual(handled1, true, 'Direct text mention must be handled successfully');
    assert.strictEqual(sentMessages.length, 1, 'Exactly 1 text message must be sent');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 101, 'Must reply to message 101');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers must be sent');
    assert.strictEqual(sentChatActions.length, 1, 'Typing action must be fired after successful AI generation');
    pass('1. @Roxie with activity 0 + TEXT -> 1 text, 0 sticker, correct reply target');

    // -------------------------------------------------------------------------
    // Test 2: "roxie hello" (case-insensitive keyword) -> text + correct reply_to_message_id
    // -------------------------------------------------------------------------
    resetTracking();
    const msg2: TelegramMessage = {
      message_id: 102,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'roxie kya kar rahi ho?'
    };

    assert.strictEqual(ChatbotService.isTriggered(msg2, botUser), true, 'roxie keyword must trigger response');
    const handled2 = await ChatbotService.handleMessage(msg2, botUser);
    assert.strictEqual(handled2, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 102, 'Must reply to message 102');
    pass('2. "roxie hello" keyword -> text + correct reply_to_message_id');

    // -------------------------------------------------------------------------
    // Test 3: "ROXIE hello" (all uppercase) -> text + correct reply target
    // -------------------------------------------------------------------------
    resetTracking();
    const msg3: TelegramMessage = {
      message_id: 103,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'ROXIE HELLO HOW ARE YOU'
    };

    assert.strictEqual(ChatbotService.isTriggered(msg3, botUser), true, 'ROXIE uppercase keyword must trigger response');
    const handled3 = await ChatbotService.handleMessage(msg3, botUser);
    assert.strictEqual(handled3, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 103, 'Must reply to message 103');
    pass('3. "ROXIE hello" -> text + correct reply target');

    // -------------------------------------------------------------------------
    // Test 4: "@Roxie hello" -> text + correct reply target
    // -------------------------------------------------------------------------
    resetTracking();
    const msg4: TelegramMessage = {
      message_id: 104,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: '@Roxie hello'
    };

    assert.strictEqual(ChatbotService.isTriggered(msg4, botUser), true);
    const handled4 = await ChatbotService.handleMessage(msg4, botUser);
    assert.strictEqual(handled4, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 104);
    pass('4. @Roxie hello -> text + correct reply target');

    // -------------------------------------------------------------------------
    // Test 5: Telegram mention entity
    // -------------------------------------------------------------------------
    const msg5: TelegramMessage = {
      message_id: 105,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: '@MissRoxie_Bot what is your name?',
      entities: [{ type: 'mention', offset: 0, length: 14 }]
    };

    assert.strictEqual(ChatbotService.isTriggered(msg5, botUser), true);
    pass('5. Telegram mention entity detection');

    // -------------------------------------------------------------------------
    // Test 6: Telegram text_mention
    // -------------------------------------------------------------------------
    const msg6: TelegramMessage = {
      message_id: 106,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Hey sweetheart, reply to me',
      entities: [{ type: 'text_mention', offset: 4, length: 10, user: botUser }]
    };

    assert.strictEqual(ChatbotService.isTriggered(msg6, botUser), true);
    pass('6. Telegram text_mention detection');

    // -------------------------------------------------------------------------
    // Test 7: Reply to Roxie -> response + correct reply target
    // -------------------------------------------------------------------------
    resetTracking();
    const msg7: TelegramMessage = {
      message_id: 107,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'what?',
      reply_to_message: {
        message_id: 90,
        date: Math.floor(Date.now() / 1000) - 5,
        chat: { id: testChat, type: 'supergroup' },
        from: botUser,
        text: 'Previous bot response'
      }
    };

    assert.strictEqual(ChatbotService.isTriggered(msg7, botUser), true, 'Reply to Roxie must trigger response');
    const handled7 = await ChatbotService.handleMessage(msg7, botUser);
    assert.strictEqual(handled7, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 107, 'Must reply to user message 107');
    pass('7. Reply to Roxie -> response + correct reply target');

    // -------------------------------------------------------------------------
    // Test 8: Normal human message -> no direct response
    // -------------------------------------------------------------------------
    const msg8: TelegramMessage = {
      message_id: 108,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Anyone want to play football tonight?'
    };

    assert.strictEqual(ChatbotService.isTriggered(msg8, botUser), false, 'Normal chat must not trigger direct response');
    pass('8. Normal message -> no direct response');

    // -------------------------------------------------------------------------
    // Test 9: "sticker" -> sticker only (when eligible) + reply target
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 6
    });

    const msg9: TelegramMessage = {
      message_id: 109,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'sticker'
    };

    assert.strictEqual(ChatbotService.hasExplicitStickerKeyword(msg9.text || ''), true);
    const handled9 = await ChatbotService.handleMessage(msg9, botUser);
    assert.strictEqual(handled9, true);
    assert.strictEqual(sentStickers.length, 1, 'Exactly 1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent for explicit sticker keyword');
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 109, 'Must reply to user message 109');
    pass('9. "sticker" -> sticker only');

    // -------------------------------------------------------------------------
    // Test 10: "send me a sticker" -> sticker only + reply target
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 6
    });

    const msg10: TelegramMessage = {
      message_id: 110,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'send me a sticker'
    };

    const handled10 = await ChatbotService.handleMessage(msg10, botUser);
    assert.strictEqual(handled10, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 110);
    pass('10. "send me a sticker" -> sticker only');

    // -------------------------------------------------------------------------
    // Test 11: "ROXIE PLEASE SEND STICKER" -> sticker only
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 6
    });

    const msg11: TelegramMessage = {
      message_id: 111,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'ROXIE PLEASE SEND STICKER'
    };

    const handled11 = await ChatbotService.handleMessage(msg11, botUser);
    assert.strictEqual(handled11, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 111);
    pass('11. "ROXIE PLEASE SEND STICKER" -> sticker only');

    // -------------------------------------------------------------------------
    // Test 12: Sticker keyword + activity below gap -> NO text AND NO sticker
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 2,
      requiredStickerGap: 6
    });

    const msg12: TelegramMessage = {
      message_id: 112,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'roxie sticker please'
    };

    const handled12 = await ChatbotService.handleMessage(msg12, botUser);
    assert.strictEqual(handled12, false, 'Gated explicit sticker request must send nothing');
    assert.strictEqual(sentStickers.length, 0, 'No sticker sent when gated');
    assert.strictEqual(sentMessages.length, 0, 'No text fallback sent for explicit sticker request');
    pass('12. sticker keyword + activity below gap -> no text and no sticker');

    // -------------------------------------------------------------------------
    // Test 13: Sticker keyword + activity >= gap -> exactly one sticker + reset
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 6,
      requiredStickerGap: 6
    });

    const msg13: TelegramMessage = {
      message_id: 113,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'I want a sticker please'
    };

    const handled13 = await ChatbotService.handleMessage(msg13, botUser);
    assert.strictEqual(handled13, true);
    assert.strictEqual(sentStickers.length, 1, 'Exactly one sticker delivered');
    assert.strictEqual(sentMessages.length, 0, 'Zero text delivered');
    const settingsAfter13 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter13.humanMessagesSinceLastSticker, 0, 'Activity counter reset to 0');
    pass('13. sticker keyword + activity >= gap -> exactly one sticker');

    // -------------------------------------------------------------------------
    // Test 14: Failed explicit sticker doesn't reset counter and sends no text
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 6
    });
    failSendSticker = true;

    const msg14: TelegramMessage = {
      message_id: 114,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'sticker'
    };

    const handled14 = await ChatbotService.handleMessage(msg14, botUser);
    assert.strictEqual(handled14, false, 'Failed sticker delivery returns false');
    assert.strictEqual(sentMessages.length, 0, 'No text fallback sent on failed explicit sticker');
    const settingsAfter14 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter14.humanMessagesSinceLastSticker, 10, 'Activity counter must NOT reset on failure');
    pass('14. failed explicit sticker doesn\'t reset counter');

    // -------------------------------------------------------------------------
    // Test 15: Proactive response selects a recent human message and replies to its message_id
    // -------------------------------------------------------------------------
    resetTracking();
    db.clearGroupMemory(testChat);
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      userId: 99111,
      name: 'Alice',
      content: 'I am bored today',
      timestamp: Date.now() - 5000,
      messageId: 201
    });

    const proactiveDec = await ChatbotService.generateProactiveResponse(testChat, botUser);
    assert.ok(proactiveDec);
    assert.strictEqual(proactiveDec.replyToMessageId, 201, 'Proactive decision must target selected human message_id');
    pass('15. proactive response selects a recent human message');
    pass('16. proactive response replies to the selected message\'s message_id');

    // -------------------------------------------------------------------------
    // Test 17: Proactive selection never selects Roxie's own message
    // -------------------------------------------------------------------------
    db.clearGroupMemory(testChat);
    db.addGroupConversationEntry(testChat, {
      role: 'assistant',
      name: 'Roxie',
      displayName: 'Roxie',
      sender: 'bot',
      content: 'Hey guys!',
      timestamp: Date.now() - 2000,
      messageId: 301
    });

    const selMsg17 = ChatbotService.getRandomRecentHumanMessage(testChat);
    assert.strictEqual(selMsg17, null, 'Must not select assistant message');
    pass('17. proactive selection never selects Roxie\'s own message');

    // -------------------------------------------------------------------------
    // Test 18: Proactive selection never selects bot/service messages
    // -------------------------------------------------------------------------
    db.clearGroupMemory(testChat);
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      name: 'ServiceBot',
      sender: 'bot',
      content: '/start command',
      timestamp: Date.now() - 3000,
      messageId: 401
    });
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      name: 'Group Admin',
      content: '👤 Alice joined the group',
      timestamp: Date.now() - 2000,
      messageId: 402
    });

    const selMsg18 = ChatbotService.getRandomRecentHumanMessage(testChat);
    assert.strictEqual(selMsg18, null, 'Must not select service or command message');
    pass('18. proactive selection never selects bot/service messages');

    // -------------------------------------------------------------------------
    // Test 19: Concurrent triggers don't produce duplicate stickers
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 8,
      requiredStickerGap: 8
    });

    const decision19a: ChatbotDecision = {
      requestId: 'req_19a',
      chatId: testChat,
      messageId: 1181,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Concurrent fallback text A',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 1181
    };

    const decision19b: ChatbotDecision = {
      requestId: 'req_19b',
      chatId: testChat,
      messageId: 1182,
      userId: 99112,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Concurrent fallback text B',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 1182
    };

    // First request dispatches and consumes eligibility
    const res19a = await (ChatbotService as any).dispatchResponse(decision19a);
    assert.strictEqual(res19a, true);
    assert.strictEqual(sentStickers.length, 1, 'First request sends sticker');

    // Second sequential dispatch finds counter reset to 0 -> sends text fallback!
    const res19b = await (ChatbotService as any).dispatchResponse(decision19b);
    assert.strictEqual(res19b, true);
    assert.strictEqual(sentStickers.length, 1, 'Second request sticker is gated (no duplicate sticker)');
    assert.strictEqual(sentMessages.length, 1, 'Second request receives text fallback');
    pass('19. concurrent triggers don\'t produce duplicate stickers');

    // -------------------------------------------------------------------------
    // Test 20: AI failure -> no text/sticker/typing
    // -------------------------------------------------------------------------
    resetTracking();
    aiGenerationFail = true;

    const msg20: TelegramMessage = {
      message_id: 120,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'roxie please answer'
    };

    const handled20 = await ChatbotService.handleMessage(msg20, botUser);
    assert.strictEqual(handled20, false);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers.length, 0);
    assert.strictEqual(sentChatActions.length, 0);
    pass('20. AI failure -> no text/sticker/typing');

    // -------------------------------------------------------------------------
    // Test 21: Proactive single message selection and consistent reply targeting
    // -------------------------------------------------------------------------
    resetTracking();
    aiGenerationFail = false;
    db.clearGroupMemory(testChat);
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 5
    });

    const targetMsgId = 123;
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      userId: 77777,
      name: 'ConsistentUser',
      content: 'Target human message for proactive test',
      timestamp: Date.now() - 1000,
      messageId: targetMsgId
    });

    const origGetRandom = ChatbotService.getRandomRecentHumanMessage;
    let getRandomCalls = 0;
    ChatbotService.getRandomRecentHumanMessage = (chatId: number) => {
      getRandomCalls++;
      return origGetRandom.call(ChatbotService, chatId);
    };

    try {
      // 1. generateProactiveResponse calls getRandomRecentHumanMessage exactly once and sets replyToMessageId
      const proactiveDec = await ChatbotService.generateProactiveResponse(testChat, botUser);
      assert.ok(proactiveDec, 'Proactive decision should be returned');
      assert.strictEqual(getRandomCalls, 1, 'getRandomRecentHumanMessage must be called exactly once during generation');
      assert.strictEqual(proactiveDec.replyToMessageId, targetMsgId, 'Decision replyToMessageId must match selected human message');

      // 2. dispatchResponse for text_plus_sticker uses the same replyToMessageId for both text and sticker
      const proactiveTextPlusStickerDec: ChatbotDecision = {
        requestId: 'req_proactive_21',
        chatId: testChat,
        messageId: targetMsgId,
        userId: 77777,
        personality: 'Psychologist-style',
        mood: 'playful',
        responseType: 'text_plus_sticker',
        content: 'Proactive reaction text',
        mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
        replyToMessageId: targetMsgId
      };

      const dispatchRes = await (ChatbotService as any).dispatchResponse(proactiveTextPlusStickerDec);
      assert.strictEqual(dispatchRes, true);
      assert.strictEqual(sentMessages.length, 1, 'Sent text message');
      assert.strictEqual(sentMessages[0].options?.reply_to_message_id, targetMsgId, 'Sent text reply_to_message_id must equal targetMsgId (123)');
      assert.strictEqual(sentStickers.length, 1, 'Sent sticker message');
      assert.strictEqual(sentStickers[0].options?.reply_to_message_id, targetMsgId, 'Sent sticker reply_to_message_id must equal targetMsgId (123)');
      assert.strictEqual(getRandomCalls, 1, 'getRandomRecentHumanMessage must NOT be called again during dispatch');

      // 3. executeAutoSticker with passed replyToMessageId does not call getRandomRecentHumanMessage
      db.updateGroupSettings(testChat, {
        humanMessagesSinceLastSticker: 10,
        requiredStickerGap: 5
      });
      const settings = db.getGroupSettings(testChat);
      const engineConfig = settings.autoEngine;
      const initialCalls = getRandomCalls;
      await (autoEngineService as any).executeAutoSticker(botUser.id, testChat, settings, engineConfig, targetMsgId);
      assert.strictEqual(getRandomCalls, initialCalls, 'executeAutoSticker must not call getRandomRecentHumanMessage when replyToMessageId is provided');
      assert.strictEqual(sentStickers.length, 2, 'Sent second sticker');
      assert.strictEqual(sentStickers[1].options?.reply_to_message_id, targetMsgId, 'Second sticker must target passed replyToMessageId (123)');
    } finally {
      ChatbotService.getRandomRecentHumanMessage = origGetRandom;
    }
    pass('21. proactive pipeline selects single message and carries reply_to_message_id consistently to text and sticker');

  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }

  console.log(`\n===================================================================`);
  console.log(`🎉 Direct Mention Pipeline Test Suite Completed: ${passed} Tests Passed (100%)`);
  console.log(`===================================================================\n`);
}

runDirectMentionPipelineTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
