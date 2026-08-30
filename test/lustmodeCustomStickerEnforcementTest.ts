import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { telegramApi } from '../server/telegram/api.js';
import { DEFAULT_STICKERS_BY_MOOD, getDefaultStickersForMood } from '../server/telegram/defaultStickers.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
function pass(msg: string) {
  console.log(`✅ [PASS] ${msg}`);
  passed++;
}

async function runLustmodeCustomStickerEnforcementTests() {
  console.log('====================================================');
  console.log('🧪 Starting Lust Mode Custom Stickers ONLY Enforcement Suite');
  console.log('====================================================\n');

  const groupA = -100777111000;
  const groupB = -100777222000;
  const groupEmpty = -100777333000;
  const normalGroup = -100777444000;

  const botUser = { id: 999888777, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup environment & mocks
  process.env.OPENROUTER_API_KEY = 'test_lustmode_enforce_key';
  process.env.OPENROUTER_MODEL = 'test/model';

  let simulatedAiText = 'Haan jaan, bolo!';
  const origFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: simulatedAiText
            }
          }
        ]
      })
    } as any;
  }) as any;

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; sticker: string; options?: any }> = [];

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 700000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    sentStickers.push({ chatId, sticker, options });
    return { ok: true, result: { message_id: 750000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    ChatbotService.reset();
    db.clearMediaLibrary(groupA);
    db.clearMediaLibrary(groupB);
    db.clearMediaLibrary(groupEmpty);
    db.clearMediaLibrary(normalGroup);

    // Group A settings: Lust Mode ON
    db.getGroupSettings(groupA, 'Group Alpha');
    db.updateGroupSettings(groupA, { lustMode: true });

    // Group B settings: Lust Mode ON
    db.getGroupSettings(groupB, 'Group Beta');
    db.updateGroupSettings(groupB, { lustMode: true });

    // Group Empty: Lust Mode ON, ZERO custom stickers
    db.getGroupSettings(groupEmpty, 'Group Empty');
    db.updateGroupSettings(groupEmpty, { lustMode: true });

    // Normal Group: Lust Mode OFF
    db.getGroupSettings(normalGroup, 'Normal Group');
    db.updateGroupSettings(normalGroup, { lustMode: false });

    // Register custom stickers for Group A
    const customStickerA_Romantic = 'CAACAgIAAxUAAWqCustomStickerGroupA_Romantic_001';
    const customStickerA_Flirty = 'CAACAgIAAxUAAWqCustomStickerGroupA_Flirty_002';
    const customStickerA_Playful = 'CAACAgIAAxUAAWqCustomStickerGroupA_Playful_003';
    const nowIso = new Date().toISOString();

    db.addStickerToLibrary('romantic', customStickerA_Romantic, {
      fileId: customStickerA_Romantic,
      mood: 'romantic',
      packName: 'pack_a',
      addedAt: nowIso
    }, groupA);

    db.addStickerToLibrary('flirty', customStickerA_Flirty, {
      fileId: customStickerA_Flirty,
      mood: 'flirty',
      packName: 'pack_a',
      addedAt: nowIso
    }, groupA);

    db.addStickerToLibrary('playful', customStickerA_Playful, {
      fileId: customStickerA_Playful,
      mood: 'playful',
      packName: 'pack_a',
      addedAt: nowIso
    }, groupA);

    // Register custom stickers for Group B
    const customStickerB_Only = 'CAACAgIAAxUAAWqCustomStickerGroupB_Exclusive_999';
    db.addStickerToLibrary('romantic', customStickerB_Only, {
      fileId: customStickerB_Only,
      mood: 'romantic',
      packName: 'pack_b',
      addedAt: nowIso
    }, groupB);

    // Collect all default sticker IDs across all moods
    const allDefaultStickerIds = new Set<string>();
    for (const mood of Object.keys(DEFAULT_STICKERS_BY_MOOD)) {
      for (const id of DEFAULT_STICKERS_BY_MOOD[mood] || []) {
        allDefaultStickerIds.add(id);
      }
    }

    // ----------------------------------------------------
    // TEST 1: Lust Mode ON + custom sticker exists -> custom sticker sent
    // ----------------------------------------------------
    console.log('--- TEST 1: Lust Mode ON + custom sticker exists ---');
    sentMessages = [];
    sentStickers = [];
    const msgTest1: TelegramMessage = {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupA, type: 'supergroup', title: 'Group Alpha' },
      from: { id: 1001, is_bot: false, first_name: 'Aman' },
      text: 'Roxie hey jaan, I love you so much ❤️'
    };
    await ChatbotService.handleMessage(msgTest1, botUser);

    assert(sentStickers.length > 0, 'Must send a sticker when custom stickers exist in Lust Mode');
    const sentId1 = sentStickers[0].sticker;
    assert.strictEqual(sentStickers[0].chatId, groupA, 'Sticker sent to correct group');
    assert(
      sentId1 === customStickerA_Romantic || sentId1 === customStickerA_Flirty || sentId1 === customStickerA_Playful,
      `Sent sticker (${sentId1}) must belong to Group A custom stickers`
    );
    assert(!allDefaultStickerIds.has(sentId1), 'Sent sticker must NOT be in default stickers');
    pass('TEST 1: Custom sticker sent in Lust Mode.');

    // ----------------------------------------------------
    // TEST 2: Lust Mode ON + default sticker exists -> default sticker NEVER sent
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Default sticker never sent in Lust Mode ---');
    for (const defId of allDefaultStickerIds) {
      assert.strictEqual(ChatbotService.isStickerAllowedForMode(defId, groupA, true), false, 'Default sticker must not be allowed in Lust Mode');
    }
    pass('TEST 2: Verified all default stickers are rejected in Lust Mode.');

    // ----------------------------------------------------
    // TEST 3: Lust Mode ON + no custom stickers -> default fallback NEVER happens
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Group with ZERO custom stickers never sends default sticker ---');
    sentMessages = [];
    sentStickers = [];
    const msgEmpty: TelegramMessage = {
      message_id: 102,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupEmpty, type: 'supergroup', title: 'Group Empty' },
      from: { id: 1002, is_bot: false, first_name: 'Rahul' },
      text: 'Roxie you look so hot today 😏'
    };
    await ChatbotService.handleMessage(msgEmpty, botUser);

    assert.strictEqual(sentStickers.length, 0, 'ZERO stickers must be sent when group has no custom stickers');
    assert(sentMessages.length > 0, 'Text fallback message sent');
    assert(
      sentMessages[0].text.includes('Lust Mode requires custom stickers'),
      'Text response alerts user to add custom stickers'
    );
    pass('TEST 3: No default fallback when custom sticker library is empty.');

    // ----------------------------------------------------
    // TEST 4: Lust Mode ON + custom stickers from another group -> NEVER sent
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Group isolation: Group B stickers never sent in Group A ---');
    assert.strictEqual(ChatbotService.isCustomSticker(customStickerB_Only, groupA), false, 'Group B sticker is not custom for Group A');
    assert.strictEqual(ChatbotService.isStickerAllowedForMode(customStickerB_Only, groupA, true), false, 'Group B sticker disallowed in Group A');

    for (let i = 0; i < 20; i++) {
      const selectedA = ChatbotService.selectCustomStickerForLustMode('romantic', groupA);
      assert.notStrictEqual(selectedA, customStickerB_Only, 'Must NEVER pick Group B sticker for Group A');
    }
    pass('TEST 4: Group isolation strictly enforced; another group custom sticker is rejected.');

    // ----------------------------------------------------
    // TEST 5: Lust Mode OFF -> normal/default sticker behavior remains unchanged
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Normal mode allows stickers normally ---');
    const defaultRomantic = getDefaultStickersForMood('romantic')[0];
    assert.strictEqual(ChatbotService.isStickerAllowedForMode(defaultRomantic, normalGroup, false), true, 'Default stickers allowed when Lust Mode is OFF');
    const normalSticker = ChatbotService.selectSticker('romantic', normalGroup);
    assert(normalSticker && ChatbotService.isValidFileId(normalSticker), 'Normal mode selects sticker successfully');
    pass('TEST 5: Normal mode behavior completely preserved.');

    // ----------------------------------------------------
    // TEST 6: Mood = romantic -> custom romantic sticker selected if available
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Mood = romantic selects custom romantic sticker ---');
    const romanticSticker = ChatbotService.selectCustomStickerForLustMode('romantic', groupA);
    assert.strictEqual(romanticSticker, customStickerA_Romantic, 'Direct match for romantic mood returned');
    pass('TEST 6: Custom romantic sticker selected.');

    // ----------------------------------------------------
    // TEST 7: Mood = flirty -> custom flirty sticker selected if available
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Mood = flirty selects custom flirty sticker ---');
    const flirtySticker = ChatbotService.selectCustomStickerForLustMode('flirty', groupA);
    assert.strictEqual(flirtySticker, customStickerA_Flirty, 'Direct match for flirty mood returned');
    pass('TEST 7: Custom flirty sticker selected.');

    // ----------------------------------------------------
    // TEST 8: Mood has no matching custom sticker -> no default fallback
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Mood with no direct match falls back to custom only, never default ---');
    const sadSticker = ChatbotService.selectCustomStickerForLustMode('sad', groupA);
    assert(sadSticker !== null, 'Finds custom sticker from compatible pool');
    assert(
      sadSticker === customStickerA_Romantic || sadSticker === customStickerA_Flirty || sadSticker === customStickerA_Playful,
      'Fallback sticker must be a custom sticker from Group A'
    );
    assert(!allDefaultStickerIds.has(sadSticker), 'Fallback sticker must NOT be default');
    pass('TEST 8: Fallback across moods stays strictly within Group A custom library.');

    // ----------------------------------------------------
    // TEST 9: Force selector / decision to return a default sticker -> final pre-send guard blocks it
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Final pre-send safety guard blocks default sticker ---');
    sentMessages = [];
    sentStickers = [];
    const evilDecisionTextSticker = {
      requestId: 'req_test_guard_1',
      chatId: groupA,
      messageId: 9991,
      userId: 1001,
      personality: 'LustMode-Couple',
      mood: 'romantic',
      responseType: 'text_plus_sticker' as const,
      content: 'Text response with illegal default sticker',
      mediaFileId: defaultRomantic, // ILLEGAL default sticker
      replyToMessageId: 9991
    };

    const handledGuard1 = await (ChatbotService as any).dispatchResponse(evilDecisionTextSticker);
    assert.strictEqual(handledGuard1, true, 'Dispatched safely via text-only fallback');
    assert.strictEqual(sentStickers.length, 0, 'Final guard BLOCKED the default sticker from being sent');
    assert.strictEqual(sentMessages.length, 1, 'Text portion was safely sent');
    assert.strictEqual(sentMessages[0].text, 'Text response with illegal default sticker');

    // Also test sticker-only response type with illegal default sticker
    sentMessages = [];
    sentStickers = [];
    const evilDecisionStickerOnly = {
      requestId: 'req_test_guard_2',
      chatId: groupA,
      messageId: 9992,
      userId: 1001,
      personality: 'LustMode-Couple',
      mood: 'romantic',
      responseType: 'sticker' as const,
      mediaFileId: defaultRomantic, // ILLEGAL default sticker
      replyToMessageId: 9992
    };

    const handledGuard2 = await (ChatbotService as any).dispatchResponse(evilDecisionStickerOnly);
    assert.strictEqual(handledGuard2, false, 'Blocked sticker-only dispatch');
    assert.strictEqual(sentStickers.length, 0, 'Final guard BLOCKED the sticker-only send completely');
    pass('TEST 9: Final pre-send safety guard blocked default sticker on all response paths.');

    // ----------------------------------------------------
    // TEST 10: Normal mode behavior remains unchanged
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Normal mode sticker sending unchanged ---');
    sentMessages = [];
    sentStickers = [];
    const normalDecision = {
      requestId: 'req_test_normal',
      chatId: normalGroup,
      messageId: 9993,
      userId: 1001,
      personality: 'Psychologist-style',
      mood: 'romantic',
      responseType: 'text_plus_sticker' as const,
      content: 'Normal mode text',
      mediaFileId: defaultRomantic, // Default sticker allowed in normal mode
      replyToMessageId: 9993
    };

    const handledNormal = await (ChatbotService as any).dispatchResponse(normalDecision);
    assert.strictEqual(handledNormal, true, 'Normal dispatch succeeded');
    assert.strictEqual(sentStickers.length, 1, 'Default sticker sent in normal mode');
    assert.strictEqual(sentStickers[0].sticker, defaultRomantic);
    pass('TEST 10: Normal mode continues sending default stickers as intended.');

    console.log('\n====================================================');
    console.log(`🎉 ALL 10 LUST MODE CUSTOM STICKER ENFORCEMENT TESTS PASSED! (${passed} checks)`);
    console.log('====================================================\n');
  } finally {
    global.fetch = origFetch;
  }
}

runLustmodeCustomStickerEnforcementTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
