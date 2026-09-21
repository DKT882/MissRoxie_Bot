import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { ChatbotService, ChatbotDecision } from '../server/telegram/chatbot.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runStickersOnlyAndPromptSafetySuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Stickers Only & Prompt Safety Regression Suite');
  console.log('===================================================================\n');

  const botId = 812999444;
  const testChatId = -1004223070652;
  const mockBotUser: TelegramUser = { id: botId, is_bot: true, first_name: 'Roxie', username: 'missroxie_bot' };

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string; options?: any }> = [];

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    sentStickers.push({ chatId, fileId: sticker, options });
    return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (_chatId: number, _action: any): Promise<any> => {
    return { ok: true, result: true };
  };

  try {
    // Helper to reset group state
    const setupGroup = (mode: 'off' | 'messages_only' | 'stickers_only' | 'messages_and_stickers', stickerAllowed: boolean = true) => {
      db.updateGroupSettings(testChatId, {
        botId,
        chatbotEnabled: true,
        autoEngine: {
          enabled: mode !== 'off',
          mode,
          humanMessagesSinceLastSticker: stickerAllowed ? 50 : 0,
          stickerActivityMin: 5,
          stickerActivityMax: 10,
          requiredStickerGap: 5,
          messages: { preset: 'normal', minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120, randomize: false },
          stickers: { preset: 'normal', minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120, randomize: false }
        },
        autoSticker: {
          enabled: mode === 'stickers_only' || mode === 'messages_and_stickers',
          mode: (mode === 'stickers_only' || mode === 'messages_and_stickers') ? 'cooldown' : 'disabled',
          cooldownSeconds: 0,
          lastStickerTimestamp: stickerAllowed ? 0 : Date.now(),
          nextAllowedAt: stickerAllowed ? 0 : Date.now() + 100000
        }
      });
      if (!stickerAllowed) {
        // Force human count to 0 in storage
        const s = db.getGroupSettings(testChatId);
        s.humanMessagesSinceLastSticker = 0;
        if (s.autoEngine) s.autoEngine.humanMessagesSinceLastSticker = 0;
      }
    };

    // Helper for fake dispatchResponse
    const dispatch = async (decision: ChatbotDecision) => {
      return (ChatbotService as any).dispatchResponse(decision);
    };

    // =========================================================================
    // TEST 1: AutoEngine stickers_only + sticker eligible -> sticker sent, no text
    // =========================================================================
    setupGroup('stickers_only', true);
    sentMessages = [];
    sentStickers = [];

    const stickerDecisionEligible: ChatbotDecision = {
      requestId: `proactive_${testChatId}_${Date.now()}`,
      chatId: testChatId,
      messageId: 101,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Here is fallback text that should never be sent',
      mediaFileId: 'CAACAgIAAxkBAAIB_mock_sticker_id_12345',
      replyToMessageId: 101
    };

    const res1 = await dispatch(stickerDecisionEligible);
    assert.strictEqual(res1, true, 'Eligible sticker should be dispatched successfully');
    assert.strictEqual(sentStickers.length, 1, 'Exactly 1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent');
    pass('Test 1: AutoEngine stickers_only + sticker eligible sends sticker and zero text');

    // =========================================================================
    // TEST 2: AutoEngine stickers_only + sticker gated -> no sticker, NO text fallback
    // =========================================================================
    setupGroup('stickers_only', false);
    sentMessages = [];
    sentStickers = [];

    const stickerDecisionGated: ChatbotDecision = {
      requestId: `proactive_${testChatId}_${Date.now()}`,
      chatId: testChatId,
      messageId: 102,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      content: 'Here is fallback text that must be suppressed in stickers_only',
      mediaFileId: 'CAACAgIAAxkBAAIB_mock_sticker_id_12345',
      replyToMessageId: 102
    };

    const res2 = await dispatch(stickerDecisionGated);
    assert.strictEqual(res2, false, 'Gated sticker should return false without fallback');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent when gated');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent (NO text fallback in stickers_only)');
    pass('Test 2: AutoEngine stickers_only + sticker gated sends nothing and NO text fallback');

    // =========================================================================
    // TEST 3: AutoEngine messages_only -> existing text behavior preserved
    // =========================================================================
    setupGroup('messages_only', true);
    sentMessages = [];
    sentStickers = [];

    const textDecision: ChatbotDecision = {
      requestId: `proactive_${testChatId}_${Date.now()}`,
      chatId: testChatId,
      messageId: 103,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text',
      content: 'Arre kaise ho sab log?',
      replyToMessageId: 103
    };

    const res3 = await dispatch(textDecision);
    assert.strictEqual(res3, true, 'Text decision dispatched successfully in messages_only');
    assert.strictEqual(sentMessages.length, 1, 'Exactly 1 text message sent');
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent');
    pass('Test 3: AutoEngine messages_only preserves proactive text dispatch');

    // =========================================================================
    // TEST 4: AutoEngine messages_and_stickers -> existing behavior preserved
    // =========================================================================
    setupGroup('messages_and_stickers', true);
    sentMessages = [];
    sentStickers = [];

    const textPlusStickerDecision: ChatbotDecision = {
      requestId: `proactive_${testChatId}_${Date.now()}`,
      chatId: testChatId,
      messageId: 104,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text_plus_sticker',
      content: 'Suno na!',
      mediaFileId: 'CAACAgIAAxkBAAIB_mock_sticker_id_12345',
      replyToMessageId: 104
    };

    const res4 = await dispatch(textPlusStickerDecision);
    assert.strictEqual(res4, true, 'text_plus_sticker dispatched in messages_and_stickers');
    assert.strictEqual(sentMessages.length, 1, '1 text message sent');
    assert.strictEqual(sentStickers.length, 1, '1 sticker sent');
    pass('Test 4: AutoEngine messages_and_stickers preserves text + sticker behavior');

    // =========================================================================
    // TEST 5: Direct "roxie" in a stickers_only group -> AI text preserved
    // =========================================================================
    setupGroup('stickers_only', false);
    sentMessages = [];
    sentStickers = [];

    const directRoxieDecision: ChatbotDecision = {
      requestId: `req_${testChatId}_105_${Date.now()}`,
      chatId: testChatId,
      messageId: 105,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text',
      content: 'Haan bolo, main yahin hoon! 😊',
      replyToMessageId: 105
    };

    const res5 = await dispatch(directRoxieDecision);
    assert.strictEqual(res5, true, 'Direct roxie AI text response dispatched in stickers_only group');
    assert.strictEqual(sentMessages.length, 1, 'Direct roxie sends 1 text response');
    assert.strictEqual(sentMessages[0].text, 'Haan bolo, main yahin hoon! 😊');
    pass('Test 5: Direct roxie in stickers_only group preserves AI text response');

    // =========================================================================
    // TEST 6: Explicit "sticker" -> existing explicit sticker behavior preserved
    // =========================================================================
    setupGroup('stickers_only', true);
    sentMessages = [];
    sentStickers = [];

    const explicitStickerDecision: ChatbotDecision = {
      requestId: `req_${testChatId}_106_${Date.now()}`,
      chatId: testChatId,
      messageId: 106,
      userId: 42,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'sticker',
      mediaFileId: 'CAACAgIAAxkBAAIB_mock_sticker_id_12345',
      replyToMessageId: 106,
      explicitStickerRequest: true
    };

    const res6 = await dispatch(explicitStickerDecision);
    assert.strictEqual(res6, true, 'Explicit sticker dispatched when eligible');
    assert.strictEqual(sentStickers.length, 1, '1 sticker sent');
    assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent');
    pass('Test 6: Explicit sticker preserves sticker dispatch');

    // =========================================================================
    // TEST 7: Proactive normal AI response -> normal response delivered
    // =========================================================================
    const normalResponse = ChatbotService.cleanAiText(
      'Arre Rohit, aaj office ka kaam kaisa chal raha hai?',
      'aaj bohot kaam hai',
      'Rohit'
    );
    assert.strictEqual(normalResponse, 'Arre Rohit, aaj office ka kaam kaisa chal raha hai?');
    assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(normalResponse), false);
    pass('Test 7: Proactive normal AI response is delivered cleanly');

    // =========================================================================
    // TEST 8: Model output: "the user say /help..." -> blocked / suppressed
    // =========================================================================
    const leakOutput1 = 'the user say /help and Roxie should explain rules';
    assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(leakOutput1), true, 'the user say /help must be detected as leak');
    const cleanedLeak1 = ChatbotService.cleanAiText(leakOutput1, '/help', 'User');
    assert.strictEqual(cleanedLeak1, '', 'cleanAiText must completely suppress "the user say /help"');
    pass('Test 8: Model output "the user say /help..." is blocked and suppressed');

    // =========================================================================
    // TEST 9: Model output: "the user said /rules..." -> blocked / suppressed
    // =========================================================================
    const leakOutput2 = 'the user said /rules so I will chime in with a comment';
    assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(leakOutput2), true, 'the user said /rules must be detected as leak');
    const cleanedLeak2 = ChatbotService.cleanAiText(leakOutput2, '/rules', 'User');
    assert.strictEqual(cleanedLeak2, '', 'cleanAiText must completely suppress "the user said /rules"');
    pass('Test 9: Model output "the user said /rules..." is blocked and suppressed');

    // =========================================================================
    // TEST 10: Normal response: "You asked me about that earlier..." -> NOT incorrectly blocked
    // =========================================================================
    const conversationalText1 = 'You asked me about that earlier, remember?';
    const conversationalText2 = "I understand what you're saying, let's talk about it!";
    assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(conversationalText1), false);
    assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(conversationalText2), false);
    assert.strictEqual(ChatbotService.cleanAiText(conversationalText1), 'You asked me about that earlier, remember?');
    assert.strictEqual(ChatbotService.cleanAiText(conversationalText2), "I understand what you're saying, let's talk about it!");
    pass('Test 10: Normal conversational responses are NOT incorrectly blocked');

    // =========================================================================
    // TEST 11: Proactive response with target-message context -> echo removal works
    // =========================================================================
    const echoedOutput = 'Rohit: kal trip pe jaa rahe hain Roxie: Mast plan hai, mujhe bhi le chalo!';
    const cleanedEcho = ChatbotService.cleanAiText(
      echoedOutput,
      'kal trip pe jaa rahe hain',
      'Rohit'
    );
    assert.strictEqual(cleanedEcho, 'Mast plan hai, mujhe bhi le chalo!', 'Echoed speaker prefix and turn must be stripped');
    pass('Test 11: Proactive response with actual target message cleans echoed input');

    // =========================================================================
    // TEST 12: Internal prompt/template-like output -> never sent to Telegram
    // =========================================================================
    const templateLeaks = [
      'reacting to the user message with a witty remark',
      'TARGET MESSAGE TO REACT TO: "Rohit": "hello"',
      'as instructed, here is my response: Hey',
      'system prompt instruction: reply naturally',
      'reply to the user regarding what they just said'
    ];
    for (const tl of templateLeaks) {
      assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(tl), true, `Template leak "${tl}" must be detected`);
    }
    pass('Test 12: Internal prompt and template-like outputs are detected and blocked');

    // =========================================================================
    // TEST 13: Direct "roxie" -> existing working AI response preserved
    // =========================================================================
    // Test with mocked fetch
    (global as any).fetch = async (_url: string, _opts: any) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                role: 'assistant',
                content: 'Arre bilkul, main toh hamesha ready hoon! 😏'
              }
            }
          ]
        })
      };
    };

    process.env.OPENROUTER_API_KEY = 'test_mock_key';
    const directMsg: TelegramMessage = {
      message_id: 301,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup' },
      from: { id: 555, is_bot: false, first_name: 'Aman' },
      text: 'roxie kya chal raha hai?'
    };

    const directDecision = await ChatbotService.generateResponseDecision('req_direct_test_13', directMsg, mockBotUser);
    assert.ok(directDecision, 'Direct roxie message generates a decision');
    assert.strictEqual(directDecision.responseType, 'text', 'Direct roxie response type is text');
    assert.strictEqual(directDecision.content, 'Arre bilkul, main toh hamesha ready hoon! 😏');

    sentMessages = [];
    const directSent = await dispatch(directDecision);
    assert.strictEqual(directSent, true, 'Direct decision dispatched to Telegram');
    assert.strictEqual(sentMessages.length, 1, 'Exactly 1 message sent');
    assert.strictEqual(sentMessages[0].text, 'Arre bilkul, main toh hamesha ready hoon! 😏');
    pass('Test 13: Direct "roxie" generates and dispatches AI text response successfully');

    console.log('\n===================================================================');
    console.log(`🎉 ALL ${passed} STICKERS-ONLY & PROMPT SAFETY TESTS PASSED!`);
    console.log('===================================================================');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }
}

runStickersOnlyAndPromptSafetySuite().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
