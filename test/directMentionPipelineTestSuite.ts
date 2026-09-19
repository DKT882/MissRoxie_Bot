import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService, ChatbotDecision } from '../server/telegram/chatbot.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { ReactionService } from '../server/telegram/reactionService.js';
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
  let sentReactions: Array<{ chatId: number; messageId: number; reaction: string }> = [];
  let aiGenerationFail = false;
  let simulatedAiText: string | null = 'Hey! Main theek hoon, tum sunao?';
  let failSendMessage = false;
  let failSendSticker = false;

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origSetMessageReaction = telegramApi.setMessageReaction;
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

  telegramApi.setMessageReaction = async (chatId: number, messageId: number, reaction: string): Promise<any> => {
    sentReactions.push({ chatId, messageId, reaction });
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
    sentReactions = [];
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

    // -------------------------------------------------------------------------
    // Test 22: Strict word boundary \broxie\b does NOT trigger on unrelated substrings
    // -------------------------------------------------------------------------
    resetTracking();
    const unrelatedSubstrings = [
      'pyroxie is a mineral',
      'hydroxie compound',
      'proxie server configuration',
      'roxieeee is elongated',
      'approxie mate value'
    ];

    for (const text of unrelatedSubstrings) {
      const msg: TelegramMessage = {
        message_id: 2200 + Math.floor(Math.random() * 1000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 99111, is_bot: false, first_name: 'Alice' },
        text
      };
      assert.strictEqual(
        ChatbotService.isTriggered(msg, botUser),
        false,
        `"${text}" must NOT trigger Roxie due to strict word boundary`
      );
    }

    const validKeywords = [
      'hey roxie',
      'roxie kya kar rahi ho?',
      'kaha ho roxie',
      'are roxie suno na',
      'what is roxie doing',
      'ROXIE 😂',
      'hello @Roxie how are you',
      'tell me roxie please',
      'hey roxy kaise ho',
      'रॉक्सी कैसी हो?',
      'रोक्सी सुनो',
      'रॉक्सी क्या हाल है'
    ];

    for (const text of validKeywords) {
      const msg: TelegramMessage = {
        message_id: 2300 + Math.floor(Math.random() * 1000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 99111, is_bot: false, first_name: 'Alice' },
        text
      };
      assert.strictEqual(
        ChatbotService.isTriggered(msg, botUser),
        true,
        `"${text}" MUST trigger Roxie`
      );
    }
    pass('22. strict word boundary \\broxie\\b triggers only on actual keyword/mention, not on substrings');

    // -------------------------------------------------------------------------
    // Test 23: Direct replies to Roxie's messages trigger response
    // -------------------------------------------------------------------------
    resetTracking();
    const replyToRoxieMsg: TelegramMessage = {
      message_id: 301,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'what do you mean by that?',
      reply_to_message: {
        message_id: 300,
        date: Math.floor(Date.now() / 1000) - 10,
        chat: { id: testChat, type: 'supergroup' },
        from: { id: botUser.id, is_bot: true, first_name: 'Roxie', username: botUser.username },
        text: 'Main yahi thi!'
      }
    };

    assert.strictEqual(ChatbotService.isTriggered(replyToRoxieMsg, botUser), true, 'Reply to Roxie message must trigger response');
    const handled23 = await ChatbotService.handleMessage(replyToRoxieMsg, botUser);
    assert.strictEqual(handled23, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 301, 'Must reply to user message 301');
    pass('23. direct reply to message sent by Roxie triggers response to user\'s message_id');

    // -------------------------------------------------------------------------
    // Test 24: Proactive opportunity deduplication per human message
    // -------------------------------------------------------------------------
    resetTracking();
    db.clearGroupMemory(testChat);
    db.setLastProactiveConsideredMessageId(testChat, 0);
    ChatbotService.setProactiveOpportunityProbability(1.0);

    const s24 = db.getGroupSettings(testChat);
    if (s24.autoResponse) {
      s24.autoResponse.lastResponseTimestamp = 0;
      s24.autoResponse.nextAllowedAt = 0;
    }

    // Step A: When group is empty, executeAutoResponse skips
    await (autoEngineService as any).executeAutoResponse(botUser.id, testChat, s24, s24.autoEngine);
    assert.strictEqual(sentMessages.length, 0, 'Empty chat must produce 0 proactive responses');

    // Step B: User sends message 401
    db.addGroupConversationEntry(testChat, {
      role: 'user',
      userId: 8888,
      name: 'Bob',
      content: 'Any plans for the weekend?',
      timestamp: Date.now(),
      messageId: 401
    });

    if (s24.autoResponse) {
      s24.autoResponse.lastResponseTimestamp = 0;
      s24.autoResponse.nextAllowedAt = 0;
    }

    // First execution considers message 401 and sends 1 proactive reply
    await (autoEngineService as any).executeAutoResponse(botUser.id, testChat, s24, s24.autoEngine);
    assert.strictEqual(sentMessages.length, 1, 'New message 401 must trigger proactive response');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 401, 'Proactive response must target message 401');
    assert.strictEqual(db.getLastProactiveConsideredMessageId(testChat), 401);

    // Step C: Second execution without new messages skips because 401 <= lastProactiveConsideredMessageId
    if (s24.autoResponse) {
      s24.autoResponse.lastResponseTimestamp = 0;
      s24.autoResponse.nextAllowedAt = 0;
    }
    await (autoEngineService as any).executeAutoResponse(botUser.id, testChat, s24, s24.autoEngine);
    assert.strictEqual(sentMessages.length, 1, 'No additional message should be sent without new human messages');

    pass('24. proactive auto response deduplication prevents repeated spam on silent chats');

    // -------------------------------------------------------------------------
    // Test 25 (Edge Case A): Roxie's own text message -> ignored, 0 AI, 0 sticker, 0 reaction, 0 activity count
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    db.clearGroupMemory(testChat);
    db.updateGroupSettings(testChat, { humanMessagesSinceLastSticker: 0 });

    const roxieOwnTextMsg: TelegramMessage = {
      message_id: 501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: botUser.id, is_bot: true, first_name: 'Roxie', username: botUser.username },
      text: 'Main theek hoon! roxie'
    };

    assert.strictEqual(ChatbotService.isRoxieSelfMessage(roxieOwnTextMsg, botUser), true);
    assert.strictEqual(ChatbotService.isGenuineHumanMessage(roxieOwnTextMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(roxieOwnTextMsg, botUser), false);

    const handledSelfText = await ChatbotService.handleMessage(roxieOwnTextMsg, botUser);
    assert.strictEqual(handledSelfText, false, 'handleMessage must return false for Roxie self text');

    const reactionSelfText = await ReactionService.handleMessageReaction(roxieOwnTextMsg, botUser);
    assert.strictEqual(reactionSelfText, false, 'handleMessageReaction must return false for Roxie self text');

    const botMgrRes25 = await (botManager as any).handleMessage(roxieOwnTextMsg, false);
    assert.strictEqual(botMgrRes25.shouldTriggerAi, false, 'shouldTriggerAi must be false for Roxie self text');

    const groupSettings25 = db.getGroupSettings(testChat);
    assert.strictEqual(groupSettings25.humanMessagesSinceLastSticker, 0, 'Self message must NOT increment humanMessagesSinceLastSticker');
    assert.strictEqual(sentMessages.length, 0, 'Zero messages sent');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent');
    assert.strictEqual(sentReactions.length, 0, 'Zero reactions sent');
    assert.strictEqual(ChatbotService.getLatestRecentHumanMessage(testChat), null, 'Self message must not be returned as recent human message');
    pass('25. (Edge Case A) Roxie\'s own text message is completely ignored (0 AI, 0 stickers, 0 reactions, 0 activity increment, not a proactive target)');

    // -------------------------------------------------------------------------
    // Test 26 (Edge Case B): Roxie's own sticker -> ignored, 0 AI, 0 sticker, 0 reaction, 0 activity count
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const roxieOwnStickerMsg: TelegramMessage = {
      message_id: 502,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: botUser.id, is_bot: true, first_name: 'Roxie', username: botUser.username },
      sticker: { file_id: 'CAACAgIAAxkBAAEtest_roxie_sticker', file_unique_id: 'u502', width: 512, height: 512, is_animated: false, is_video: false }
    };

    assert.strictEqual(ChatbotService.isRoxieSelfMessage(roxieOwnStickerMsg, botUser), true);
    assert.strictEqual(ChatbotService.isGenuineHumanMessage(roxieOwnStickerMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(roxieOwnStickerMsg, botUser), false);

    const handledSelfSticker = await ChatbotService.handleMessage(roxieOwnStickerMsg, botUser);
    assert.strictEqual(handledSelfSticker, false);

    const botMgrRes26 = await (botManager as any).handleMessage(roxieOwnStickerMsg, false);
    assert.strictEqual(botMgrRes26.shouldTriggerAi, false);
    assert.strictEqual(db.getGroupSettings(testChat).humanMessagesSinceLastSticker, 0);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers.length, 0);
    assert.strictEqual(sentReactions.length, 0);
    pass('26. (Edge Case B) Roxie\'s own sticker is completely ignored (0 AI, 0 sticker, 0 reaction, 0 activity increment)');

    // -------------------------------------------------------------------------
    // Test 27 (Edge Case C): Other bot message -> ignored, 0 AI, 0 reaction, 0 activity count
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const otherBotMsg: TelegramMessage = {
      message_id: 503,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 7771234, is_bot: true, first_name: 'SpamBot', username: 'other_spam_bot' },
      text: 'hello roxie check out our crypto bot!'
    };

    assert.strictEqual(ChatbotService.isGenuineHumanMessage(otherBotMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(otherBotMsg, botUser), false);

    const handledOtherBot = await ChatbotService.handleMessage(otherBotMsg, botUser);
    assert.strictEqual(handledOtherBot, false);

    const reactionOtherBot = await ReactionService.handleMessageReaction(otherBotMsg, botUser);
    assert.strictEqual(reactionOtherBot, false);

    const botMgrRes27 = await (botManager as any).handleMessage(otherBotMsg, false);
    assert.strictEqual(botMgrRes27.shouldTriggerAi, false);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentReactions.length, 0);
    pass('27. (Edge Case C) Other bot messages are ignored (0 AI, 0 reaction, 0 activity count, not proactive target)');

    // -------------------------------------------------------------------------
    // Test 28 (Edge Case D): Telegram pin service message (pinned_message) -> ignored
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const pinServiceMsg: TelegramMessage = {
      message_id: 504,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      pinned_message: {
        message_id: 500,
        date: Math.floor(Date.now() / 1000) - 100,
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 99111, is_bot: false, first_name: 'Alice' },
        text: 'Important announcement!'
      }
    } as any;

    assert.strictEqual(ChatbotService.isTelegramServiceMessage(pinServiceMsg), true);
    assert.strictEqual(ChatbotService.isGenuineHumanMessage(pinServiceMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(pinServiceMsg, botUser), false);

    const handledPinService = await ChatbotService.handleMessage(pinServiceMsg, botUser);
    assert.strictEqual(handledPinService, false);

    const reactionPinService = await ReactionService.handleMessageReaction(pinServiceMsg, botUser);
    assert.strictEqual(reactionPinService, false);

    const botMgrRes28 = await (botManager as any).handleMessage(pinServiceMsg, false);
    assert.strictEqual(botMgrRes28.shouldTriggerAi, false);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentReactions.length, 0);
    pass('28. (Edge Case D) Telegram pin service message (pinned_message) is ignored');

    // -------------------------------------------------------------------------
    // Test 29 (Edge Case E): Telegram unpin service message -> ignored
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const unpinServiceMsg: TelegramMessage = {
      message_id: 505,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      unpinned_message: {
        message_id: 500,
        date: Math.floor(Date.now() / 1000) - 100,
        chat: { id: testChat, type: 'supergroup' }
      }
    } as any;

    assert.strictEqual(ChatbotService.isTelegramServiceMessage(unpinServiceMsg), true);
    assert.strictEqual(ChatbotService.isGenuineHumanMessage(unpinServiceMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(unpinServiceMsg, botUser), false);
    pass('29. (Edge Case E) Telegram unpin service message is ignored');

    // -------------------------------------------------------------------------
    // Test 30 (Edge Case F): "The message was pinned" text notification -> ignored
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const pinTextMsg: TelegramMessage = {
      message_id: 506,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'The message was pinned'
    };

    assert.strictEqual(ChatbotService.isTelegramServiceText('The message was pinned'), true);
    assert.strictEqual(ChatbotService.isTelegramServiceMessage(pinTextMsg), true);
    assert.strictEqual(ChatbotService.isGenuineHumanMessage(pinTextMsg, botUser), false);
    assert.strictEqual(ChatbotService.isTriggered(pinTextMsg, botUser), false);

    const handledPinText = await ChatbotService.handleMessage(pinTextMsg, botUser);
    assert.strictEqual(handledPinText, false);

    const reactionPinText = await ReactionService.handleMessageReaction(pinTextMsg, botUser);
    assert.strictEqual(reactionPinText, false);

    const botMgrRes30 = await (botManager as any).handleMessage(pinTextMsg, false);
    assert.strictEqual(botMgrRes30.shouldTriggerAi, false);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentReactions.length, 0);
    pass('30. (Edge Case F) "The message was pinned" text notification produces 0 AI, 0 sticker, 0 reaction, 0 activity count');

    // -------------------------------------------------------------------------
    // Test 31 (Edge Case G): Equivalent pin notifications ("📌 The message was pinned", "Message pinned") -> ignored
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const pinVariations = [
      'the message was pinned',
      'Message was pinned',
      'Message pinned',
      'The message was unpinned',
      'Message unpinned',
      '📌 The message was pinned',
      '📌 Message pinned',
      '👤 Alice joined the group',
      '🚪 Bob left the group',
      '⚠️ Group settings updated'
    ];

    for (let i = 0; i < pinVariations.length; i++) {
      const text = pinVariations[i];
      assert.strictEqual(ChatbotService.isTelegramServiceText(text), true, `"${text}" must be recognized as service text`);
      const vMsg: TelegramMessage = {
        message_id: 520 + i,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 99111, is_bot: false, first_name: 'Alice' },
        text
      };
      assert.strictEqual(ChatbotService.isGenuineHumanMessage(vMsg, botUser), false);
      assert.strictEqual(ChatbotService.isTriggered(vMsg, botUser), false);
    }
    pass('31. (Edge Case G) All equivalent pin/unpin/service variations are recognized and ignored');

    // -------------------------------------------------------------------------
    // Test 32 (Edge Case H): Genuine human "hello" -> valid human message & proactive opportunity
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    db.clearGroupMemory(testChat);
    db.updateGroupSettings(testChat, { humanMessagesSinceLastSticker: 0 });

    const humanHelloMsg: TelegramMessage = {
      message_id: 550,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'hello everyone how are you today?'
    };

    assert.strictEqual(ChatbotService.isGenuineHumanMessage(humanHelloMsg, botUser), true);
    const botMgrRes32 = await (botManager as any).handleMessage(humanHelloMsg, false);
    assert.strictEqual(botMgrRes32.shouldTriggerAi, true, 'Human message must have shouldTriggerAi = true');
    assert.strictEqual(db.getGroupSettings(testChat).humanMessagesSinceLastSticker, 1, 'Increments human activity count');

    const latestHuman32 = ChatbotService.getLatestRecentHumanMessage(testChat);
    assert.ok(latestHuman32);
    assert.strictEqual(latestHuman32?.messageId, 550);
    pass('32. (Edge Case H) Genuine human "hello" is accepted, increments human activity, and is available for proactive response');

    // -------------------------------------------------------------------------
    // Test 33 (Edge Case I): Genuine human "roxie" -> immediate response with reply_to_message_id
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const humanRoxieMsg: TelegramMessage = {
      message_id: 560,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'roxie what are you doing today?'
    };

    assert.strictEqual(ChatbotService.isGenuineHumanMessage(humanRoxieMsg, botUser), true);
    assert.strictEqual(ChatbotService.isTriggered(humanRoxieMsg, botUser), true);

    const handled33 = await ChatbotService.handleMessage(humanRoxieMsg, botUser);
    assert.strictEqual(handled33, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 560);
    pass('33. (Edge Case I) Genuine human "roxie" triggers immediate reply to triggering message_id');

    // -------------------------------------------------------------------------
    // Test 34 (Edge Case J): Genuine human reply to Roxie -> immediate response with reply_to_message_id
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const humanReplyToRoxieMsg: TelegramMessage = {
      message_id: 570,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'really? tell me more!',
      reply_to_message: {
        message_id: 569,
        date: Math.floor(Date.now() / 1000) - 5,
        chat: { id: testChat, type: 'supergroup' },
        from: { id: botUser.id, is_bot: true, first_name: 'Roxie', username: botUser.username },
        text: 'I was just thinking about you!'
      }
    };

    assert.strictEqual(ChatbotService.isGenuineHumanMessage(humanReplyToRoxieMsg, botUser), true);
    assert.strictEqual(ChatbotService.isTriggered(humanReplyToRoxieMsg, botUser), true);

    const handled34 = await ChatbotService.handleMessage(humanReplyToRoxieMsg, botUser);
    assert.strictEqual(handled34, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 570);
    pass('34. (Edge Case J) Genuine human reply to Roxie triggers immediate reply to user\'s message_id');

    // -------------------------------------------------------------------------
    // Test 35 (Edge Case K): Genuine human "sticker" -> explicit sticker response behavior
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 5
    });

    const humanStickerKeywordMsg: TelegramMessage = {
      message_id: 580,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'send sticker please roxie'
    };

    assert.strictEqual(ChatbotService.isGenuineHumanMessage(humanStickerKeywordMsg, botUser), true);
    assert.strictEqual(ChatbotService.isTriggered(humanStickerKeywordMsg, botUser), true);

    const handled35 = await ChatbotService.handleMessage(humanStickerKeywordMsg, botUser);
    assert.strictEqual(handled35, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(sentStickers[0].options?.reply_to_message_id, 580);
    pass('35. (Edge Case K) Genuine human "sticker" request triggers explicit sticker response');

    // -------------------------------------------------------------------------
    // Test 36 (Edge Case L): Human message containing normal word "pinned" -> NOT treated as service message
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    const normalPinnedMessages = [
      'I pinned the photo yesterday',
      'did you pin the note on the board?',
      'pin this please when you get a chance',
      'we pinned our vacation plans on the fridge',
      'maine message pinned kiya tha kal'
    ];

    for (let i = 0; i < normalPinnedMessages.length; i++) {
      const text = normalPinnedMessages[i];
      assert.strictEqual(ChatbotService.isTelegramServiceText(text), false, `"${text}" must NOT be recognized as service text`);
      const humanPinnedMsg: TelegramMessage = {
        message_id: 590 + i,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChat, type: 'supergroup' },
        from: { id: 99111, is_bot: false, first_name: 'Alice' },
        text
      };
      assert.strictEqual(ChatbotService.isGenuineHumanMessage(humanPinnedMsg, botUser), true, `"${text}" must be recognized as genuine human message`);
    }
    pass('36. (Edge Case L) Human messages containing the normal word "pinned" or "pin" are NOT treated as service messages');

    // -------------------------------------------------------------------------
    // Test 37 (Edge Case M): Duplicate processing deduplication
    // -------------------------------------------------------------------------
    resetTracking();
    ReactionService.resetCaches();
    db.clearGroupMemory(testChat);
    db.setLastProactiveConsideredMessageId(testChat, 0);

    const s37 = db.getGroupSettings(testChat);
    if (s37.autoResponse) {
      s37.autoResponse.lastResponseTimestamp = 0;
      s37.autoResponse.nextAllowedAt = 0;
    }

    db.addGroupConversationEntry(testChat, {
      role: 'user',
      userId: 99111,
      name: 'Alice',
      content: 'Any updates on the project?',
      timestamp: Date.now(),
      messageId: 777
    });

    // Run proactive once
    await (autoEngineService as any).executeAutoResponse(botUser.id, testChat, s37, s37.autoEngine);
    assert.strictEqual(sentMessages.length, 1, 'First run delivers proactive response');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 777);
    assert.strictEqual(db.getLastProactiveConsideredMessageId(testChat), 777);

    // Run proactive again without new messages
    if (s37.autoResponse) {
      s37.autoResponse.lastResponseTimestamp = 0;
      s37.autoResponse.nextAllowedAt = 0;
    }
    await (autoEngineService as any).executeAutoResponse(botUser.id, testChat, s37, s37.autoEngine);
    assert.strictEqual(sentMessages.length, 1, 'Second run must skip (deduplicated by considered messageId)');
    pass('37. (Edge Case M) Duplicate processing deduplication guarantees at most 1 proactive opportunity per human message');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    telegramApi.setMessageReaction = origSetMessageReaction;
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
