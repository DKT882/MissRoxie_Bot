import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService, ChatbotDecision } from '../server/telegram/chatbot.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
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
    // Test 1: @Roxie with activity 0 + TEXT → 1 text, 0 sticker
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
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers must be sent');
    assert.strictEqual(sentChatActions.length, 1, 'Typing action must be fired after successful AI generation');
    pass('1. @Roxie with activity 0 + TEXT -> 1 text, 0 sticker');

    // -------------------------------------------------------------------------
    // Test 2: @Roxie with activity >= gap + TEXT → 1 text, 0 sticker
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 6
    });

    const msg2: TelegramMessage = {
      message_id: 102,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup', title: 'Direct Mention Group' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Roxie kaise ho aap?'
    };

    const decision2: ChatbotDecision = {
      requestId: 'req_2',
      chatId: testChat,
      messageId: 102,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text',
      content: 'Main mast hoon!',
      replyToMessageId: 102
    };

    const dispatched2 = await (ChatbotService as any).dispatchResponse(decision2);
    assert.strictEqual(dispatched2, true, 'Text dispatch must succeed');
    assert.strictEqual(sentMessages.length, 1, '1 text message sent');
    assert.strictEqual(sentStickers.length, 0, '0 stickers sent for text-only decision');
    pass('2. @Roxie with activity >= gap + TEXT -> 1 text, 0 sticker');

    // -------------------------------------------------------------------------
    // Test 3: @Roxie with activity 0 + STICKER → 1 text fallback, 0 sticker
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 6
    });

    const decision3: ChatbotDecision = {
      requestId: 'req_3',
      chatId: testChat,
      messageId: 103,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Abhi sticker nahi bhej sakti, par main yahi hoon!',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 103
    };

    const dispatched3 = await (ChatbotService as any).dispatchResponse(decision3);
    assert.strictEqual(dispatched3, true, 'Gated sticker must successfully deliver fallback text');
    assert.strictEqual(sentStickers.length, 0, 'Sticker MUST be blocked due to activity gating');
    assert.strictEqual(sentMessages.length, 1, 'Fallback text message MUST be delivered');
    assert.strictEqual(sentMessages[0].text, 'Abhi sticker nahi bhej sakti, par main yahi hoon!');
    pass('3. @Roxie with activity 0 + STICKER -> 1 text fallback, 0 sticker');

    // -------------------------------------------------------------------------
    // Test 4: @Roxie with activity >= gap + STICKER → 1 sticker + reset
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 8,
      requiredStickerGap: 6
    });

    const decision4: ChatbotDecision = {
      requestId: 'req_4',
      chatId: testChat,
      messageId: 104,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Fallback text not needed since sticker succeeds',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 104
    };

    const dispatched4 = await (ChatbotService as any).dispatchResponse(decision4);
    assert.strictEqual(dispatched4, true, 'Eligible sticker dispatch must succeed');
    assert.strictEqual(sentStickers.length, 1, '1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, '0 fallback text sent since sticker succeeded');
    const settingsAfter4 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter4.humanMessagesSinceLastSticker, 0, 'Counter must reset to 0');
    assert.ok(settingsAfter4.requiredStickerGap >= 5 && settingsAfter4.requiredStickerGap <= 10, 'New gap generated');
    pass('4. @Roxie with activity >= gap + STICKER -> 1 sticker + reset');

    // -------------------------------------------------------------------------
    // Test 5: @Roxie with activity 0 + BOTH → 1 text, 0 sticker
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 6
    });

    const decision5: ChatbotDecision = {
      requestId: 'req_5',
      chatId: testChat,
      messageId: 105,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text_plus_sticker',
      content: 'Ye lo mera jawab!',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 105
    };

    const dispatched5 = await (ChatbotService as any).dispatchResponse(decision5);
    assert.strictEqual(dispatched5, true, 'Both decision must succeed via text delivery');
    assert.strictEqual(sentMessages.length, 1, 'Text message sent immediately');
    assert.strictEqual(sentMessages[0].text, 'Ye lo mera jawab!');
    assert.strictEqual(sentStickers.length, 0, 'Sticker blocked due to activity gating');
    pass('5. @Roxie with activity 0 + BOTH -> 1 text, 0 sticker');

    // -------------------------------------------------------------------------
    // Test 6: @Roxie with activity >= gap + BOTH → 1 text + 1 sticker + reset
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 7,
      requiredStickerGap: 6
    });

    const decision6: ChatbotDecision = {
      requestId: 'req_6',
      chatId: testChat,
      messageId: 106,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text_plus_sticker',
      content: 'Double reply for you!',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 106
    };

    const dispatched6 = await (ChatbotService as any).dispatchResponse(decision6);
    assert.strictEqual(dispatched6, true, 'Both dispatch must succeed');
    assert.strictEqual(sentMessages.length, 1, 'Text message sent first');
    assert.strictEqual(sentStickers.length, 1, 'Sticker sent second');
    const settingsAfter6 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter6.humanMessagesSinceLastSticker, 0, 'Counter reset to 0');
    pass('6. @Roxie with activity >= gap + BOTH -> 1 text + 1 sticker + reset');

    // -------------------------------------------------------------------------
    // Test 7: AI failure → 0 text + 0 sticker + 0 typing
    // -------------------------------------------------------------------------
    resetTracking();
    aiGenerationFail = true;

    const msg7: TelegramMessage = {
      message_id: 107,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup', title: 'Direct Mention Group' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: '@MissRoxie_Bot please answer me'
    };

    const handled7 = await ChatbotService.handleMessage(msg7, botUser);
    assert.strictEqual(handled7, false, 'AI failure must return false');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent on AI failure');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent on AI failure');
    assert.strictEqual(sentChatActions.length, 0, 'Zero typing actions fired on AI failure');
    pass('7. AI failure -> 0 text + 0 sticker + 0 typing');

    // -------------------------------------------------------------------------
    // Test 8: sendMessage Telegram failure → error handled and no false success
    // -------------------------------------------------------------------------
    resetTracking();
    failSendMessage = true;

    const decision8: ChatbotDecision = {
      requestId: 'req_8',
      chatId: testChat,
      messageId: 108,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text',
      content: 'This will fail to send',
      replyToMessageId: 108
    };

    const dispatched8 = await (ChatbotService as any).dispatchResponse(decision8);
    assert.strictEqual(dispatched8, false, 'Telegram send failure must return false');
    assert.strictEqual(sentMessages.length, 0, 'No false success recorded');
    pass('8. sendMessage Telegram failure -> error handled and no false success');

    // -------------------------------------------------------------------------
    // Test 9: Telegram `mention` entity detection
    // -------------------------------------------------------------------------
    const msg9: TelegramMessage = {
      message_id: 109,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: '@MissRoxie_Bot what is your name?',
      entities: [{ type: 'mention', offset: 0, length: 14 }]
    };

    const isTrig9 = ChatbotService.isTriggered(msg9, botUser);
    assert.strictEqual(isTrig9, true, 'Telegram mention entity must trigger response');
    pass('9. Telegram mention entity detection');

    // -------------------------------------------------------------------------
    // Test 10: Telegram `text_mention` detection
    // -------------------------------------------------------------------------
    const msg10: TelegramMessage = {
      message_id: 110,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Hey sweetheart, reply to me',
      entities: [{ type: 'text_mention', offset: 4, length: 10, user: botUser }]
    };

    const isTrig10 = ChatbotService.isTriggered(msg10, botUser);
    assert.strictEqual(isTrig10, true, 'Telegram text_mention entity must trigger response');
    pass('10. Telegram text_mention detection');

    // -------------------------------------------------------------------------
    // Test 11: Caption mention detection
    // -------------------------------------------------------------------------
    const msg11: TelegramMessage = {
      message_id: 111,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      photo: [{ file_id: 'photo_1', file_unique_id: 'p1', width: 100, height: 100 }],
      caption: '@MissRoxie_Bot look at this photo',
      caption_entities: [{ type: 'mention', offset: 0, length: 14 }]
    };

    const isTrig11 = ChatbotService.isTriggered(msg11, botUser);
    assert.strictEqual(isTrig11, true, 'Caption mention must trigger response');
    pass('11. Caption mention detection where supported');

    // -------------------------------------------------------------------------
    // Test 12: Reply to Roxie triggers response
    // -------------------------------------------------------------------------
    const msg12: TelegramMessage = {
      message_id: 112,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Yes exactly what you said!',
      reply_to_message: {
        message_id: 99,
        date: Math.floor(Date.now() / 1000) - 10,
        chat: { id: testChat, type: 'supergroup' },
        from: botUser,
        text: 'Previous message from Roxie'
      }
    };

    const isTrig12 = ChatbotService.isTriggered(msg12, botUser);
    assert.strictEqual(isTrig12, true, 'Reply to Roxie must trigger response');
    pass('12. Reply to Roxie triggers response');

    // -------------------------------------------------------------------------
    // Test 13: Normal human message does not enter direct-response path
    // -------------------------------------------------------------------------
    const msg13: TelegramMessage = {
      message_id: 113,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: { id: 99111, is_bot: false, first_name: 'Alice' },
      text: 'Anyone want to play football tonight?'
    };

    const isTrig13 = ChatbotService.isTriggered(msg13, botUser);
    assert.strictEqual(isTrig13, false, 'Non-mention message must not trigger direct response');
    pass('13. Normal human message does not enter direct-response path');

    // -------------------------------------------------------------------------
    // Test 14: Bot message cannot trigger response
    // -------------------------------------------------------------------------
    const msg14: TelegramMessage = {
      message_id: 114,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChat, type: 'supergroup' },
      from: botUser,
      text: '@MissRoxie_Bot self message'
    };

    // Intake in botManager
    db.updateGroupSettings(testChat, { humanMessagesSinceLastSticker: 2 });
    const update14: TelegramUpdate = { update_id: 7014, message: msg14 };
    await botManager.processUpdate(update14);
    const settingsAfter14 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter14.humanMessagesSinceLastSticker, 2, 'Bot messages must never increment counter');
    pass('14. Bot own message cannot recursively trigger response or increment counter');

    // -------------------------------------------------------------------------
    // Test 15: Gated sticker decision with valid decision.content → text fallback
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 1,
      requiredStickerGap: 8
    });

    const decision15: ChatbotDecision = {
      requestId: 'req_15',
      chatId: testChat,
      messageId: 115,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Main text reply from AI generation',
      mediaFileId: 'CAACAgIAAxkBAAEtest_sticker_direct_mention_123',
      replyToMessageId: 115
    };

    const dispatched15 = await (ChatbotService as any).dispatchResponse(decision15);
    assert.strictEqual(dispatched15, true, 'Must succeed with text fallback');
    assert.strictEqual(sentStickers.length, 0, 'Sticker blocked');
    assert.strictEqual(sentMessages.length, 1, 'Text fallback delivered');
    assert.strictEqual(sentMessages[0].text, 'Main text reply from AI generation');
    pass('15. Gated sticker decision with valid decision.content -> text fallback');

    // -------------------------------------------------------------------------
    // Test 16: Failed sticker delivery with valid decision.content → text fallback
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 10,
      requiredStickerGap: 8
    });
    failSendSticker = true;

    const decision16: ChatbotDecision = {
      requestId: 'req_16',
      chatId: testChat,
      messageId: 116,
      userId: 99111,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'AI text fallback when sticker send fails',
      mediaFileId: 'invalid_sticker_id',
      replyToMessageId: 116
    };

    const dispatched16 = await (ChatbotService as any).dispatchResponse(decision16);
    assert.strictEqual(dispatched16, true, 'Failed sticker must trigger text fallback');
    assert.strictEqual(sentMessages.length, 1, 'Text fallback sent on sticker delivery failure');
    assert.strictEqual(sentMessages[0].text, 'AI text fallback when sticker send fails');
    pass('16. Failed sticker delivery with valid decision.content -> text fallback');

    // -------------------------------------------------------------------------
    // Test 17: Failed sticker delivery does NOT reset activity counter
    // -------------------------------------------------------------------------
    const settingsAfter16 = db.getGroupSettings(testChat);
    assert.strictEqual(settingsAfter16.humanMessagesSinceLastSticker, 10, 'Failed sticker must NOT reset counter');
    pass('17. Failed sticker delivery does NOT reset activity counter');

    // -------------------------------------------------------------------------
    // Test 18: Concurrent direct requests cannot create duplicate sticker sends
    // -------------------------------------------------------------------------
    resetTracking();
    db.updateGroupSettings(testChat, {
      humanMessagesSinceLastSticker: 8,
      requiredStickerGap: 8
    });

    const decision18a: ChatbotDecision = {
      requestId: 'req_18a',
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

    const decision18b: ChatbotDecision = {
      requestId: 'req_18b',
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
    const resA = await (ChatbotService as any).dispatchResponse(decision18a);
    assert.strictEqual(resA, true);
    assert.strictEqual(sentStickers.length, 1, 'First request sends sticker');

    // Second sequential dispatch finds counter reset to 0 -> sends text fallback!
    const resB = await (ChatbotService as any).dispatchResponse(decision18b);
    assert.strictEqual(resB, true);
    assert.strictEqual(sentStickers.length, 1, 'Second request sticker is gated (no duplicate sticker)');
    assert.strictEqual(sentMessages.length, 1, 'Second request receives text fallback');
    assert.strictEqual(sentMessages[0].text, 'Concurrent fallback text B');
    pass('18. Concurrent direct requests cannot create duplicate sticker sends');

  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }

  console.log(`\n===================================================================`);
  console.log(`🎉 Direct Mention Pipeline Test Suite Completed: ${passed}/18 Passed (100%)`);
  console.log(`===================================================================\n`);
}

runDirectMentionPipelineTestSuite().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
