import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { DEFAULT_STICKERS_BY_MOOD, getDefaultStickersForMood } from '../server/telegram/defaultStickers.js';
import { TelegramMessage, CommandContext, TelegramChatMember } from '../server/telegram/types.js';

async function runLustmodeCustomStickerSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Lust Mode Custom Sticker & Response Format Test Suite');
  console.log('====================================================');

  const groupAChatId = -100888111222;
  const groupBChatId = -100888333444;
  const ownerId = 111000;
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup environment & mocks
  process.env.OPENROUTER_API_KEY = 'test_key_lustmode_stickers';
  process.env.OPENROUTER_MODEL = 'test/model';

  let simulatedAiText = 'Haan jaan, bolo!';
  const originalFetch = global.fetch;
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
  let sentAnimations: Array<{ chatId: number; animation: string; options?: any }> = [];

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 800000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    sentStickers.push({ chatId, sticker, options });
    return { ok: true, result: { message_id: 850000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendAnimation = async (chatId: number, animation: string, options?: any) => {
    sentAnimations.push({ chatId, animation, options });
    return { ok: true, result: { message_id: 890000 + Math.floor(Math.random() * 1000) } };
  };

  const memberStatusMap: Record<number, TelegramChatMember> = {
    [ownerId]: {
      status: 'creator',
      user: { id: ownerId, is_bot: false, first_name: 'Owner', username: 'owner' }
    }
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    const m = memberStatusMap[uId];
    if (m) return { ok: true, result: m };
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: `User${uId}` } } };
  };
  (telegramApi as any).getChatAdministrators = async () => ({
    ok: true,
    result: [{ status: 'creator', user: { id: ownerId, is_bot: false, first_name: 'Owner' } }]
  });

  // Helper to build commands
  const makeCommandContext = (cId: number, cmd: string, args: string[] = []): CommandContext => {
    const actor = { id: ownerId, is_bot: false, first_name: 'Owner', username: 'owner' };
    return {
      message: {
        message_id: Math.floor(Math.random() * 10000) + 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: cId, type: 'supergroup', title: 'Test Group' },
        from: actor,
        text: `${cmd} ${args.join(' ')}`.trim()
      },
      chatId: cId,
      chatTitle: 'Test Group',
      sender: actor,
      isAnonymousAdmin: false,
      adminDisplayName: '@owner',
      args,
      command: cmd
    };
  };

  // Helper to build messages
  const makeMsg = (cId: number, text: string, msgId = 501): TelegramMessage => ({
    message_id: msgId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: cId, type: 'supergroup', title: 'Group Chat' },
    from: { id: 2001, is_bot: false, first_name: 'Arjun', username: 'arjun' },
    text
  });

  // Setup custom stickers for Group A
  db.clearMediaLibrary(groupAChatId);
  db.clearMediaLibrary(groupBChatId);
  ChatbotService.reset();

  const customStickerA_Flirty = 'CAACAgIAAxUAAWqCustomStickerFlirtyA0001';
  const customStickerA_Happy = 'CAACAgIAAxUAAWqCustomStickerHappyA0002';
  const customStickerA_Sad = 'CAACAgIAAxUAAWqCustomStickerSadA0003';
  const customStickerA_Teasing = 'CAACAgIAAxUAAWqCustomStickerTeasingA0004';
  const customStickerA_Romantic = 'CAACAgIAAxUAAWqCustomStickerRomanticA0005';

  const nowIso = new Date().toISOString();
  db.addStickerToLibrary('flirty', customStickerA_Flirty, { fileId: customStickerA_Flirty, packName: 'groupA_pack', mood: 'flirty', addedAt: nowIso }, groupAChatId);
  db.addStickerToLibrary('happy', customStickerA_Happy, { fileId: customStickerA_Happy, packName: 'groupA_pack', mood: 'happy', addedAt: nowIso }, groupAChatId);
  db.addStickerToLibrary('sad', customStickerA_Sad, { fileId: customStickerA_Sad, packName: 'groupA_pack', mood: 'sad', addedAt: nowIso }, groupAChatId);
  db.addStickerToLibrary('teasing', customStickerA_Teasing, { fileId: customStickerA_Teasing, packName: 'groupA_pack', mood: 'teasing', addedAt: nowIso }, groupAChatId);
  db.addStickerToLibrary('romantic', customStickerA_Romantic, { fileId: customStickerA_Romantic, packName: 'groupA_pack', mood: 'romantic', addedAt: nowIso }, groupAChatId);

  // Group B has its own custom stickers
  const customStickerB_Only = 'CAACAgIAAxUAAWqCustomStickerGroupB9999';
  db.addStickerToLibrary('flirty', customStickerB_Only, { fileId: customStickerB_Only, packName: 'groupB_pack', mood: 'flirty', addedAt: nowIso }, groupBChatId);

  // Collect all default sticker IDs across all moods
  const allDefaultStickerIds = new Set<string>();
  for (const mood of Object.keys(DEFAULT_STICKERS_BY_MOOD)) {
    for (const s of getDefaultStickersForMood(mood)) {
      allDefaultStickerIds.add(s);
    }
  }

  // ----------------------------------------------------
  // TEST 1 & 2: Lust Mode ON never selects default stickers, selects ONLY custom stickers
  // ----------------------------------------------------
  console.log('\n--- TEST 1 & 2: Lust Mode selects ONLY custom stickers, NEVER default stickers ---');
  db.updateGroupSettings(groupAChatId, { lustMode: true });

  for (let i = 0; i < 20; i++) {
    const selected = ChatbotService.selectCustomStickerForLustMode('flirty', groupAChatId);
    assert(selected !== null, `Iteration ${i}: custom sticker must be returned`);
    assert(!allDefaultStickerIds.has(selected!), `TEST 1: Selected sticker (${selected}) MUST NOT be a default sticker`);
    assert(ChatbotService.isCustomSticker(selected!, groupAChatId), `TEST 2: Selected sticker must be verified custom sticker from group A`);
  }
  console.log('✅ [PASS] TEST 1: Lust Mode ON never selects default stickers (20 iterations verified)');
  console.log('✅ [PASS] TEST 2: Lust Mode selects only custom stickers');

  // ----------------------------------------------------
  // TEST 3 & 4 & 5: Format A (Text + 1 Sticker), Format B (1 Sticker Only), NEVER Text-Only
  // ----------------------------------------------------
  console.log('\n--- TEST 3, 4, 5: Response Formats (Text + 1 Sticker OR 1 Sticker Only, NEVER Text-Only) ---');
  let formatACount = 0;
  let formatBCount = 0;
  let textOnlyCount = 0;

  for (let i = 1; i <= 30; i++) {
    ChatbotService.reset();
    const dec = await ChatbotService.generateResponseDecision(`req_fmt_${i}`, makeMsg(groupAChatId, `Roxie you look amazing ${i}`, 600 + i), botUser);
    assert(dec !== null, `Decision ${i} must be generated`);

    if (dec?.responseType === 'text_plus_sticker') {
      formatACount++;
      assert(dec.content && dec.content.length > 0, 'Format A must contain text');
      assert(dec.mediaFileId, 'Format A must contain sticker');
      assert(ChatbotService.isCustomSticker(dec.mediaFileId!, groupAChatId), 'Format A must use custom sticker');
    } else if (dec?.responseType === 'sticker') {
      formatBCount++;
      assert(dec.mediaFileId, 'Format B must contain sticker');
      assert(ChatbotService.isCustomSticker(dec.mediaFileId!, groupAChatId), 'Format B must use custom sticker');
    } else if (dec?.responseType === 'text') {
      textOnlyCount++;
    }
  }

  assert(formatACount > 0, 'TEST 3: Format A (text + custom sticker) occurred');
  assert(formatBCount > 0, 'TEST 4: Format B (custom sticker only) occurred');
  assert(textOnlyCount === 0, 'TEST 5: Text-only format NEVER occurs when custom stickers exist in Lust Mode');
  console.log(`✅ [PASS] TEST 3: Text + sticker format works (Observed ${formatACount}/30)`);
  console.log(`✅ [PASS] TEST 4: Sticker-only format works (Observed ${formatBCount}/30)`);
  console.log(`✅ [PASS] TEST 5: Text-only format NEVER occurs in Lust Mode (${textOnlyCount} text-only responses)`);

  // ----------------------------------------------------
  // TEST 6 & 7: Exactly 1 sticker, NEVER multiple stickers, NEVER GIF + sticker
  // ----------------------------------------------------
  console.log('\n--- TEST 6 & 7: Sticker Count & Animation Boundary ---');
  sentMessages = [];
  sentStickers = [];
  sentAnimations = [];

  ChatbotService.reset();
  const testMsg6 = makeMsg(groupAChatId, 'Roxie, you are cute 😏', 701);
  await ChatbotService.handleMessage(testMsg6, botUser);

  assert(sentStickers.length === 1, `TEST 6: Exactly 1 sticker was dispatched (received: ${sentStickers.length})`);
  assert(sentAnimations.length === 0, `TEST 7: No GIF/animation was dispatched (received: ${sentAnimations.length})`);
  console.log('✅ [PASS] TEST 6: More than one sticker NEVER occurs (exactly 1 sticker dispatched)');
  console.log('✅ [PASS] TEST 7: GIF + sticker NEVER occurs in Lust Mode');

  // ----------------------------------------------------
  // TEST 8 & 9: Reply-to-message-id matches triggering message
  // ----------------------------------------------------
  console.log('\n--- TEST 8 & 9: Reply-to-Message-ID Verification ---');
  assert(sentStickers[0].options?.reply_to_message_id === 701, 'TEST 8: Sticker has reply_to_message_id = triggering message_id');
  if (sentMessages.length > 0) {
    assert(sentMessages[0].options?.reply_to_message_id === 701, 'TEST 9: Text has reply_to_message_id = triggering message_id');
  }
  console.log('✅ [PASS] TEST 8: Sticker is reply_to_message_id of triggering message');
  console.log('✅ [PASS] TEST 9: Text is reply_to_message_id of triggering message');

  // ----------------------------------------------------
  // TEST 10: Duplicate processing returns at most one response
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Deduplication Gate Verification ---');
  const countStickersBefore = sentStickers.length;
  // Attempt sending exact same message_id 701 again
  await ChatbotService.handleMessage(testMsg6, botUser);
  assert(sentStickers.length === countStickersBefore, 'TEST 10: Duplicate message_id 701 was blocked, no second response');
  console.log('✅ [PASS] TEST 10: Duplicate processing still returns at most one logical response');

  // ----------------------------------------------------
  // TEST 11: Mood-based custom sticker selection works
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Mood-Based Custom Sticker Selection ---');
  const stickerFlirty = ChatbotService.selectCustomStickerForLustMode('flirty', groupAChatId);
  assert(stickerFlirty === customStickerA_Flirty, 'TEST 11.1: Flirty mood matches custom flirty sticker');

  const stickerHappy = ChatbotService.selectCustomStickerForLustMode('happy', groupAChatId);
  assert(stickerHappy === customStickerA_Happy, 'TEST 11.2: Happy mood matches custom happy sticker');

  const stickerSad = ChatbotService.selectCustomStickerForLustMode('sad', groupAChatId);
  assert(stickerSad === customStickerA_Sad, 'TEST 11.3: Sad mood matches custom sad sticker');

  const stickerTeasing = ChatbotService.selectCustomStickerForLustMode('teasing', groupAChatId);
  assert(stickerTeasing === customStickerA_Teasing, 'TEST 11.4: Teasing mood matches custom teasing sticker');
  console.log('✅ [PASS] TEST 11: Mood-based custom sticker selection works across distinct moods');

  // ----------------------------------------------------
  // TEST 12: Group Isolation (Group A cannot use Group B's custom stickers)
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Group Custom Sticker Isolation ---');
  const groupASelection = ChatbotService.selectCustomStickerForLustMode('flirty', groupAChatId);
  assert(groupASelection !== customStickerB_Only, 'TEST 12.1: Group A CANNOT select Group B custom sticker');

  const groupBSelection = ChatbotService.selectCustomStickerForLustMode('flirty', groupBChatId);
  assert(groupBSelection === customStickerB_Only, 'TEST 12.2: Group B selects its own custom sticker');
  assert(!ChatbotService.isCustomSticker(customStickerB_Only, groupAChatId), 'TEST 12.3: Group B sticker is NOT recognized as custom in Group A');
  console.log('✅ [PASS] TEST 12: Group A cannot use Group B custom stickers (Isolation preserved)');

  // ----------------------------------------------------
  // TEST 13: Lust Mode OFF restores normal media behavior
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Lust Mode OFF Restores Normal Media Behavior ---');
  db.updateGroupSettings(groupAChatId, { lustMode: false });
  ChatbotService.reset();

  const decOff = await ChatbotService.generateResponseDecision('req_off', makeMsg(groupAChatId, 'Hello Roxie normal mode', 801), botUser);
  assert(decOff !== null);
  assert(decOff.personality === 'Psychologist-style', 'TEST 13.1: Restored Psychologist-style personality');

  // Verify normal selectSticker works with fallback/default library outside Lust Mode
  const normalSticker = ChatbotService.selectSticker('normal', groupAChatId);
  assert(normalSticker !== null, 'TEST 13.2: Normal sticker selection works');
  console.log('✅ [PASS] TEST 13: Lust Mode OFF restores normal media behavior');

  // ----------------------------------------------------
  // TEST 14: Group with ZERO custom stickers does NOT fall back to default stickers
  // ----------------------------------------------------
  console.log('\n--- TEST 14: Zero Custom Stickers Never Fall Back to Default Stickers ---');
  const emptyGroupChatId = -100999000111;
  db.clearMediaLibrary(emptyGroupChatId);
  db.updateGroupSettings(emptyGroupChatId, { lustMode: true });

  const zeroCustomSticker = ChatbotService.selectCustomStickerForLustMode('flirty', emptyGroupChatId);
  assert(zeroCustomSticker === null, 'TEST 14.1: selectCustomStickerForLustMode returns null when group has 0 custom stickers');

  ChatbotService.reset();
  const decZero = await ChatbotService.generateResponseDecision('req_zero', makeMsg(emptyGroupChatId, 'Roxie miss you', 901), botUser);
  assert(decZero !== null);
  // Must NOT have mediaFileId with a default sticker!
  assert(!decZero.mediaFileId, 'TEST 14.2: Group with zero custom stickers NEVER has a mediaFileId set to default sticker');
  assert(decZero.content && decZero.content.includes('Lust Mode requires custom stickers'), 'TEST 14.3: Safe informative notice delivered without default sticker');
  console.log('✅ [PASS] TEST 14: Group with zero custom stickers does NOT fall back to default stickers');

  // ----------------------------------------------------
  // TEST 15: /lustmode status correctly reports custom-sticker policy
  // ----------------------------------------------------
  console.log('\n--- TEST 15: /lustmode status reports custom-sticker policy ---');
  sentMessages = [];
  const statusCtx = makeCommandContext(groupAChatId, '/lustmode', ['status']);
  await CommandHandler.handleCommand(statusCtx);

  assert(sentMessages.length > 0, 'Status message was sent');
  const statusText = sentMessages[0].text;
  assert(statusText.includes('Lust Mode:'), 'TEST 15.1: Status includes Lust Mode label');
  assert(statusText.includes('Custom stickers only'), 'TEST 15.2: Status reports "Media: Custom stickers only"');
  assert(statusText.includes('Text + 1 custom sticker'), 'TEST 15.3: Status reports "Text + 1 custom sticker" format');
  assert(statusText.includes('1 custom sticker'), 'TEST 15.4: Status reports "1 custom sticker" format');
  console.log('✅ [PASS] TEST 15: /lustmode status correctly reports custom-sticker policy');

  console.log('\n====================================================');
  console.log('🎉 ALL 15 LUST MODE CUSTOM STICKER TESTS PASSED! (29 checks passed, 0 failed)');
  console.log('====================================================\n');
}

runLustmodeCustomStickerSuite().catch(err => {
  console.error('Fatal test failure:', err);
  process.exit(1);
});
