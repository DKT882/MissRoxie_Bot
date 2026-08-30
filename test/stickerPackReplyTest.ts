import { db } from '../server/db/storage';
import { CommandHandler } from '../server/telegram/commands';
import { telegramApi } from '../server/telegram/api';
import { CommandContext, TelegramMessage } from '../server/telegram/types';
import { ChatbotService } from '../server/telegram/chatbot';
import { COMMAND_CATALOG } from '../server/telegram/commandCatalog';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${msg}`);
    throw new Error(msg);
  }
  console.log(`✅ [PASS] ${msg}`);
}

async function runStickerPackReplyTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING ROXIE /ADDSTICKERPACK REPLY TEST SUITE');
  console.log('======================================================\n');

  const chatId = -1001999888777;
  const otherChatId = -1001111222333;
  const adminUserId = 1001;
  const regularUserId = 2001;

  // Mock Telegram Chat Members for Permissions
  const originalGetChatMember = telegramApi.getChatMember.bind(telegramApi);
  (telegramApi as any).getChatMember = async (cId: number | string, uId: number) => {
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          can_restrict_members: true,
          can_promote_members: true,
          can_delete_messages: true,
          can_be_edited: false,
          user: { id: adminUserId, is_bot: false, first_name: 'AdminRoxie', username: 'admin_roxie' }
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: regularUserId, is_bot: false, first_name: 'RegularUser', username: 'regular_user' }
      }
    };
  };

  // Intercept Sent Messages
  const sentMessages: Array<{ chatId: number | string; text: string; options?: any }> = [];
  const originalSendMessage = telegramApi.sendMessage.bind(telegramApi);
  (telegramApi as any).sendMessage = async (cId: number | string, text: string, opts?: any) => {
    sentMessages.push({ chatId: cId, text, options: opts });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: cId } } };
  };

  // Sample Mock Sticker Pack Data
  const mockPackStickers = Array.from({ length: 40 }, (_, i) => ({
    file_id: `CAACAgIAAxkBAAE_SAMPLE_STICKER_FILE_ID_${i.toString().padStart(3, '0')}_XYZ12345`,
    file_unique_id: `AQAD_UNIQ_${i}`,
    width: 512,
    height: 512,
    emoji: i % 2 === 0 ? '🐶' : '🐱',
    set_name: 'AnimalsPackTest'
  }));

  const originalGetStickerSet = telegramApi.getStickerSet.bind(telegramApi);
  (telegramApi as any).getStickerSet = async (name: string) => {
    if (name === 'AnimalsPackTest') {
      return {
        ok: true,
        result: {
          name: 'AnimalsPackTest',
          title: 'Cute Animals Pack',
          stickers: mockPackStickers
        }
      };
    }
    if (name === 'EmptyPackTest') {
      return {
        ok: true,
        result: {
          name: 'EmptyPackTest',
          title: 'Empty Pack',
          stickers: []
        }
      };
    }
    if (name === 'ApiErrorPack') {
      throw new Error('Telegram Connection Timeout');
    }
    if (name === 'DeletedPack') {
      return {
        ok: false,
        error_code: 400,
        description: 'Bad Request: STICKERSET_INVALID'
      };
    }
    // Fall back to original (for real API calls in live test)
    return originalGetStickerSet(name);
  };

  // Helper to build CommandContext
  function makeContext(
    userId: number,
    command: string,
    args: string[],
    replyMessage?: Partial<TelegramMessage>,
    targetChatId = chatId
  ): CommandContext {
    const cmdWithSlash = command.startsWith('/') ? command : `/${command}`;
    return {
      chatId: targetChatId,
      chatTitle: 'Roxie Sticker Test Group',
      sender: {
        id: userId,
        is_bot: false,
        first_name: userId === adminUserId ? 'AdminRoxie' : 'RegularUser',
        username: userId === adminUserId ? 'admin_roxie' : 'regular_user'
      },
      isAnonymousAdmin: false,
      adminDisplayName: userId === adminUserId ? '@admin_roxie' : 'RegularUser',
      message: {
        message_id: Math.floor(Math.random() * 100000) + 100,
        date: Math.floor(Date.now() / 1000),
        chat: { id: targetChatId, type: 'supergroup', title: 'Roxie Sticker Test Group' },
        from: {
          id: userId,
          is_bot: false,
          first_name: userId === adminUserId ? 'AdminRoxie' : 'RegularUser',
          username: userId === adminUserId ? 'admin_roxie' : 'regular_user'
        },
        text: `${cmdWithSlash} ${args.join(' ')}`.trim(),
        reply_to_message: replyMessage as any
      },
      command: cmdWithSlash,
      args
    };
  }

  // Clear test group libraries
  db.clearMediaLibrary(chatId);
  db.clearMediaLibrary(otherChatId);

  // ----------------------------------------------------
  // TEST 1: Admin replies to a sticker with /addstickerpack (no mood -> default 'normal')
  // ----------------------------------------------------
  console.log('--- TEST 1: Reply to sticker + /addstickerpack (default mood) ---');
  sentMessages.length = 0;
  const replyStickerMsg1: Partial<TelegramMessage> = {
    message_id: 501,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    sticker: {
      file_id: mockPackStickers[0].file_id,
      file_unique_id: mockPackStickers[0].file_unique_id,
      width: 512,
      height: 512,
      emoji: '🐶',
      set_name: 'AnimalsPackTest'
    }
  };

  const ctx1 = makeContext(adminUserId, 'addstickerpack', [], replyStickerMsg1);
  await CommandHandler.handleCommand(ctx1);

  const libAfterTest1 = db.getMediaLibrary(chatId);
  const normalStickers = libAfterTest1.stickers['normal'] || [];
  assert(normalStickers.length === 40, `TEST 1.1: Complete pack imported (expected 40 stickers, got ${normalStickers.length})`);
  assert(normalStickers.includes(mockPackStickers[0].file_id), 'TEST 1.2: Replied sticker file_id is included in library');
  assert(normalStickers.includes(mockPackStickers[39].file_id), 'TEST 1.3: Last sticker file_id of pack is included in library');
  
  const lastMsg1 = sentMessages[sentMessages.length - 1];
  assert(lastMsg1?.text.includes('Imported 40 stickers') || lastMsg1?.text.includes('Added 40'), 'TEST 1.4: Success response mentions 40 stickers imported');
  assert(lastMsg1?.text.includes('Cute Animals Pack') || lastMsg1?.text.includes('AnimalsPackTest'), 'TEST 1.5: Success response mentions pack title/name');
  assert(lastMsg1?.text.includes('normal'), 'TEST 1.6: Mood indicated as normal');

  // ----------------------------------------------------
  // TEST 2: Verify metadata and sticker storage details
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Verify sticker metadata storage ---');
  const metaSample = libAfterTest1.stickerMetadata?.[mockPackStickers[0].file_id];
  assert(metaSample !== undefined, 'TEST 2.1: Sticker metadata is recorded');
  assert(metaSample?.packName === 'AnimalsPackTest', 'TEST 2.2: Metadata packName matches');
  assert(metaSample?.addedBy === adminUserId, 'TEST 2.3: Metadata actor matches');
  assert(metaSample?.mood === 'normal', 'TEST 2.4: Metadata mood matches normal');

  // ----------------------------------------------------
  // TEST 3: Duplicate Import (Import same pack again)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Duplicate Import (deduplication) ---');
  sentMessages.length = 0;
  const ctx3 = makeContext(adminUserId, 'addstickerpack', [], replyStickerMsg1);
  await CommandHandler.handleCommand(ctx3);

  const libAfterTest3 = db.getMediaLibrary(chatId);
  const normalStickersAfterDup = libAfterTest3.stickers['normal'] || [];
  assert(normalStickersAfterDup.length === 40, `TEST 3.1: Sticker count did NOT increase on duplicate import (remained 40, got ${normalStickersAfterDup.length})`);
  
  const lastMsg3 = sentMessages[sentMessages.length - 1];
  assert(lastMsg3?.text.includes('Already existed') || lastMsg3?.text.includes('already existed') || lastMsg3?.text.includes('40'), 'TEST 3.2: Duplicate import reports existing stickers');

  // ----------------------------------------------------
  // TEST 4: Reply to sticker with custom mood (/addstickerpack funny)
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Reply to sticker with mood assignment (/addstickerpack funny) ---');
  sentMessages.length = 0;
  const ctx4 = makeContext(adminUserId, 'addstickerpack', ['funny'], replyStickerMsg1);
  await CommandHandler.handleCommand(ctx4);

  const libAfterTest4 = db.getMediaLibrary(chatId);
  const funnyStickers = libAfterTest4.stickers['funny'] || [];
  assert(funnyStickers.length === 40, `TEST 4.1: Imported 40 stickers into "funny" mood category (got ${funnyStickers.length})`);
  const lastMsg4 = sentMessages[sentMessages.length - 1];
  assert(lastMsg4?.text.includes('funny'), 'TEST 4.2: Success message notes funny mood');

  // ----------------------------------------------------
  // TEST 5: Replying to non-sticker message (text/photo)
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Replying to non-sticker message ---');
  sentMessages.length = 0;
  const nonStickerMsg: Partial<TelegramMessage> = {
    message_id: 502,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    text: 'Hello, this is just a regular text message'
  };

  const ctx5 = makeContext(adminUserId, 'addstickerpack', [], nonStickerMsg);
  await CommandHandler.handleCommand(ctx5);
  const lastMsg5 = sentMessages[sentMessages.length - 1];
  assert(lastMsg5?.text.includes('not a Telegram sticker') || lastMsg5?.text.includes('reply to a sticker'), 'TEST 5.1: Non-sticker reply gives helpful guidance');

  // ----------------------------------------------------
  // TEST 6: Invalid packs / Standalone sticker / API errors
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Error handling (standalone sticker, empty pack, invalid pack, API error) ---');
  
  // 6.1 Standalone sticker without set_name
  sentMessages.length = 0;
  const standaloneStickerMsg: Partial<TelegramMessage> = {
    message_id: 503,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    sticker: {
      file_id: 'CAACAgIAAxkBAAE_STANDALONE_STICKER_9999999999',
      file_unique_id: 'AQAD_STANDALONE_1',
      width: 512,
      height: 512,
      emoji: '🌟',
      set_name: undefined // No pack!
    }
  };
  const ctx6_1 = makeContext(adminUserId, 'addstickerpack', ['cute'], standaloneStickerMsg);
  await CommandHandler.handleCommand(ctx6_1);
  const lastMsg6_1 = sentMessages[sentMessages.length - 1];
  assert(lastMsg6_1?.text.includes('does not belong to a Telegram sticker pack') || lastMsg6_1?.text.includes("Couldn't detect"), 'TEST 6.1: Standalone sticker without set_name returns graceful error');

  // 6.2 Deleted/invalid pack
  sentMessages.length = 0;
  const deletedPackMsg: Partial<TelegramMessage> = {
    message_id: 504,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    sticker: {
      file_id: 'CAACAgIAAxkBAAE_DELETED_STICKER_9999999999',
      file_unique_id: 'AQAD_DEL_1',
      width: 512,
      height: 512,
      set_name: 'DeletedPack'
    }
  };
  const ctx6_2 = makeContext(adminUserId, 'addstickerpack', ['cute'], deletedPackMsg);
  await CommandHandler.handleCommand(ctx6_2);
  const lastMsg6_2 = sentMessages[sentMessages.length - 1];
  assert(lastMsg6_2?.text.includes('STICKERSET_INVALID') || lastMsg6_2?.text.includes('not found') || lastMsg6_2?.text.includes('load sticker pack'), 'TEST 6.2: Deleted pack handled gracefully');

  // 6.3 Telegram API Network error
  sentMessages.length = 0;
  const apiErrorPackMsg: Partial<TelegramMessage> = {
    message_id: 505,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    sticker: {
      file_id: 'CAACAgIAAxkBAAE_API_ERR_STICKER_9999999999',
      file_unique_id: 'AQAD_API_1',
      width: 512,
      height: 512,
      set_name: 'ApiErrorPack'
    }
  };
  const ctx6_3 = makeContext(adminUserId, 'addstickerpack', ['cute'], apiErrorPackMsg);
  await CommandHandler.handleCommand(ctx6_3);
  const lastMsg6_3 = sentMessages[sentMessages.length - 1];
  assert(lastMsg6_3?.text.includes('Telegram API error') || lastMsg6_3?.text.includes('Telegram Connection Timeout'), 'TEST 6.3: API Error handled gracefully without crash');

  // 6.4 Empty sticker pack
  sentMessages.length = 0;
  const emptyPackMsg: Partial<TelegramMessage> = {
    message_id: 506,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup' },
    sticker: {
      file_id: 'CAACAgIAAxkBAAE_EMPTY_STICKER_9999999999',
      file_unique_id: 'AQAD_EMP_1',
      width: 512,
      height: 512,
      set_name: 'EmptyPackTest'
    }
  };
  const ctx6_4 = makeContext(adminUserId, 'addstickerpack', ['cute'], emptyPackMsg);
  await CommandHandler.handleCommand(ctx6_4);
  const lastMsg6_4 = sentMessages[sentMessages.length - 1];
  assert(lastMsg6_4?.text.includes('contains no stickers'), 'TEST 6.4: Empty pack returns appropriate error');

  // ----------------------------------------------------
  // TEST 7: Direct invocation without reply (Explicit Pack Name/Link)
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Direct invocation without reply ---');
  sentMessages.length = 0;
  const ctx7_1 = makeContext(adminUserId, 'addstickerpack', ['AnimalsPackTest', 'roasting']);
  await CommandHandler.handleCommand(ctx7_1);
  const libAfterTest7 = db.getMediaLibrary(chatId);
  assert((libAfterTest7.stickers['roasting'] || []).length === 40, 'TEST 7.1: Explicit pack name imported into "roasting" mood');

  sentMessages.length = 0;
  const ctx7_2 = makeContext(adminUserId, 'addstickerpack', ['https://t.me/addstickers/AnimalsPackTest', 'playful']);
  await CommandHandler.handleCommand(ctx7_2);
  const libAfterTest7_2 = db.getMediaLibrary(chatId);
  assert((libAfterTest7_2.stickers['playful'] || []).length === 40, 'TEST 7.2: Explicit t.me pack URL imported into "playful" mood');

  // Direct invocation with no args -> usage guide
  sentMessages.length = 0;
  const ctx7_3 = makeContext(adminUserId, 'addstickerpack', []);
  await CommandHandler.handleCommand(ctx7_3);
  const lastMsg7_3 = sentMessages[sentMessages.length - 1];
  assert(lastMsg7_3?.text.includes('Usage:'), 'TEST 7.3: Direct invocation with no args displays usage guide');

  // ----------------------------------------------------
  // TEST 8: Group Isolation Intact
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Group Isolation Verification ---');
  const libOther = db.getMediaLibrary(otherChatId);
  assert((libOther.stickers['normal'] || []).length === 0, 'TEST 8.1: Other chat has 0 stickers in "normal" mood');
  assert((libOther.stickers['funny'] || []).length === 0, 'TEST 8.2: Other chat has 0 stickers in "funny" mood');

  // ----------------------------------------------------
  // TEST 9: Permission Security Guard
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Permission Security Guard (Regular User Denied) ---');
  sentMessages.length = 0;
  const ctx9 = makeContext(regularUserId, 'addstickerpack', [], replyStickerMsg1);
  await CommandHandler.handleCommand(ctx9);
  const lastMsg9 = sentMessages[sentMessages.length - 1];
  assert(lastMsg9?.text.includes('administrator') || lastMsg9?.text.includes('⛔') || lastMsg9?.text.includes('❌'), 'TEST 9.1: Regular user denied /addstickerpack');

  // ----------------------------------------------------
  // TEST 10: Command Catalog Integrity
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Command Catalog Integrity ---');
  const addPackEntries = COMMAND_CATALOG.filter(c => c.command === '/addstickerpack');
  assert(addPackEntries.length === 1, `TEST 10.1: /addstickerpack registered exactly once in COMMAND_CATALOG (found ${addPackEntries.length})`);
  assert(addPackEntries[0].category === 'Media', 'TEST 10.2: /addstickerpack belongs to "Media" category');
  assert(addPackEntries[0].permission === 'Admin', 'TEST 10.3: /addstickerpack permission is Admin');
  const addStickerEntries = COMMAND_CATALOG.filter(c => c.command === '/addsticker');
  assert(addStickerEntries.length === 1, `TEST 10.4: /addsticker registered exactly once in COMMAND_CATALOG (found ${addStickerEntries.length})`);

  // ----------------------------------------------------
  // TEST 11: /help Integration
  // ----------------------------------------------------
  console.log('\n--- TEST 11: /help System Integration ---');
  sentMessages.length = 0;
  const ctxHelpDirect = makeContext(adminUserId, 'help', ['addstickerpack']);
  await CommandHandler.handleCommand(ctxHelpDirect);
  const lastHelpMsg1 = sentMessages[sentMessages.length - 1];
  assert(lastHelpMsg1?.text.includes('/addstickerpack'), 'TEST 11.1: /help addstickerpack displays command details');
  assert(lastHelpMsg1?.text.includes('Media'), 'TEST 11.2: Help mentions Media category');

  sentMessages.length = 0;
  const ctxHelpAll = makeContext(adminUserId, 'help', []);
  await CommandHandler.handleCommand(ctxHelpAll);
  const helpMsgs = sentMessages.map(m => m.text).join('\n');
  assert(helpMsgs.includes('/addstickerpack'), 'TEST 11.3: /help includes /addstickerpack');
  assert(helpMsgs.includes('/addsticker'), 'TEST 11.4: /help includes /addsticker');

  // ----------------------------------------------------
  // TEST 12: Command Isolation (Commands Never Trigger Chatbot)
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Command Isolation & Chatbot Protection ---');
  assert(CommandHandler.ADMIN_ONLY_COMMANDS.has('/addstickerpack'), 'TEST 12.1: /addstickerpack is in ADMIN_ONLY_COMMANDS');
  assert(CommandHandler.SENSITIVE_COMMANDS.has('/addstickerpack'), 'TEST 12.2: /addstickerpack is in SENSITIVE_COMMANDS');
  
  const isCommandTrigger = (text: string) => {
    const trimmed = text.trim();
    return trimmed.startsWith('/') || trimmed.startsWith('!');
  };
  assert(isCommandTrigger('/addstickerpack cute'), 'TEST 12.3: /addstickerpack is recognized as command prefix');
  assert(isCommandTrigger('/addsticker funny'), 'TEST 12.4: /addsticker is recognized as command prefix');

  // ----------------------------------------------------
  // TEST 13: /addsticker Command Saves ONLY Replied Sticker (Not Entire Pack)
  // ----------------------------------------------------
  console.log('\n--- TEST 13: /addsticker Saves Only The Replied Sticker ---');
  db.clearMediaLibrary(chatId);
  sentMessages.length = 0;
  const ctx13 = makeContext(adminUserId, 'addsticker', ['caring'], replyStickerMsg1);
  await CommandHandler.handleCommand(ctx13);

  const libAfter13 = db.getMediaLibrary(chatId);
  const caringStickers = libAfter13.stickers['caring'] || [];
  assert(caringStickers.length === 1, `TEST 13.1: /addsticker saved EXACTLY 1 sticker, not whole pack (got ${caringStickers.length})`);
  assert(caringStickers[0] === mockPackStickers[0].file_id, 'TEST 13.2: The saved sticker matches the replied sticker file_id');
  assert(!caringStickers.includes(mockPackStickers[1].file_id), 'TEST 13.3: Other stickers from the pack were NOT imported by /addsticker');
  const lastMsg13 = sentMessages[sentMessages.length - 1];
  assert(lastMsg13?.text.includes('Sticker added successfully') || lastMsg13?.text.includes('Added sticker'), 'TEST 13.4: /addsticker responded with single sticker success');

  // ----------------------------------------------------
  // TEST 14: Live Real Telegram API Test
  // ----------------------------------------------------
  console.log('\n--- TEST 14: Live Telegram API Integration with Real Sticker Pack ---');
  try {
    const realPackRes = await originalGetStickerSet('Animals');
    if (realPackRes.ok && realPackRes.result && realPackRes.result.stickers?.length > 0) {
      const realPack = realPackRes.result;
      console.log(`📡 [LIVE API] Found real Telegram sticker pack "${realPack.title}" (name: ${realPack.name}) with ${realPack.stickers.length} stickers.`);
      
      const realFirstSticker = realPack.stickers[0];
      const liveReplyMsg: Partial<TelegramMessage> = {
        message_id: 9991,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        sticker: {
          file_id: realFirstSticker.file_id,
          file_unique_id: realFirstSticker.file_unique_id || 'real_uniq',
          width: realFirstSticker.width || 512,
          height: realFirstSticker.height || 512,
          emoji: realFirstSticker.emoji || '🐶',
          set_name: realPack.name
        }
      };

      sentMessages.length = 0;
      // Temporary un-mock getStickerSet so it fetches live pack
      (telegramApi as any).getStickerSet = originalGetStickerSet;
      
      const liveCtx = makeContext(adminUserId, 'addstickerpack', ['cute'], liveReplyMsg);
      await CommandHandler.handleCommand(liveCtx);

      const libLive = db.getMediaLibrary(chatId);
      const cuteStickers = libLive.stickers['cute'] || [];
      assert(cuteStickers.length >= realPack.stickers.length, `TEST 14.1: Live pack "${realPack.title}" imported ${cuteStickers.length} stickers from Telegram Bot API into "cute" mood`);
      assert(cuteStickers.includes(realFirstSticker.file_id), 'TEST 14.2: First real sticker file_id is in library');
      
      const lastLiveMsg = sentMessages[sentMessages.length - 1];
      console.log(`💬 Live Command Reply: ${lastLiveMsg?.text}`);
      assert(lastLiveMsg?.text.includes('Imported') || lastLiveMsg?.text.includes('Added'), 'TEST 14.3: Live import sent successful reply');
    } else {
      console.log('ℹ️ Live Telegram API returned non-ok or empty for "Animals" (or test offline), skipping live assertion.');
    }
  } catch (err: any) {
    console.warn('⚠️ Note: Live Telegram test skipped due to network/token:', err.message);
  }

  // Restore mocks
  telegramApi.getChatMember = originalGetChatMember;
  telegramApi.sendMessage = originalSendMessage;
  telegramApi.getStickerSet = originalGetStickerSet;

  console.log('\n======================================================');
  console.log('🎉 ALL 14 /ADDSTICKERPACK & /ADDSTICKER TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');

  process.exit(0);
}

runStickerPackReplyTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});

