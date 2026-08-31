import assert from 'node:assert';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runStickerPackRemoveTests() {
  console.log('====================================================');
  console.log('🧪 Starting Sticker Pack Remove Command Test Suite');
  console.log('====================================================\n');

  const chatId = -1001234567890;
  const groupA = -1001111111111;
  const groupB = -1002222222222;
  const adminId = 2001;
  const normalMemberId = 4001;
  const botId = 9999;
  const botUsername = 'MissRoxie_Bot';

  let lastSentMessage: { chatId: number | string; text: string; options?: any } | null = null;
  let deletedMessages: Array<{ chatId: number | string; messageId: number }> = [];
  let deletedStickerSets: string[] = [];
  let stickerSetsDatabase: Record<string, any> = {};

  // Store original API methods
  const origGetMe = telegramApi.getMe;
  const origSendMessage = telegramApi.sendMessage;
  const origDeleteMessage = telegramApi.deleteMessage;
  const origGetStickerSet = telegramApi.getStickerSet;
  const origDeleteStickerSet = telegramApi.deleteStickerSet;
  const origGetChatMember = telegramApi.getChatMember;

  // Mock API methods
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'MissRoxie', username: botUsername }
  });

  telegramApi.sendMessage = async (cId: number | string, text: string, opts?: any) => {
    lastSentMessage = { chatId: cId, text, options: opts };
    return {
      ok: true,
      result: {
        message_id: Math.floor(Math.random() * 10000) + 1,
        chat: { id: Number(cId), type: 'supergroup' },
        text,
        date: Date.now()
      } as any
    };
  };

  telegramApi.deleteMessage = async (cId: number | string, mId: number) => {
    deletedMessages.push({ chatId: cId, messageId: mId });
    return { ok: true, result: true };
  };

  telegramApi.getStickerSet = async (name: string) => {
    if (stickerSetsDatabase[name]) {
      return { ok: true, result: stickerSetsDatabase[name] };
    }
    return { ok: false, error_code: 400, description: 'STICKERSET_INVALID' };
  };

  telegramApi.deleteStickerSet = async (name: string) => {
    deletedStickerSets.push(name);
    if (stickerSetsDatabase[name]) {
      delete stickerSetsDatabase[name];
      return { ok: true, result: true };
    }
    return { ok: false, error_code: 400, description: 'STICKERSET_NOT_MODIFIED' };
  };

  const memberStatusMap: Record<number, any> = {
    [adminId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      user: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' }
    },
    [normalMemberId]: {
      status: 'member',
      user: { id: normalMemberId, is_bot: false, first_name: 'NormalUser', username: 'normal_user' }
    },
    [botId]: {
      status: 'administrator',
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'MissRoxie', username: botUsername }
    }
  };

  telegramApi.getChatMember = async (cId: number | string, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
  };

  function makeContext(
    actorId: number,
    command: string,
    replyTo?: Partial<TelegramMessage>,
    targetChatId: number = chatId
  ): CommandContext {
    const sender = memberStatusMap[actorId]?.user || { id: actorId, is_bot: false, first_name: 'User' };
    const cmdMessageId = 1000 + Math.floor(Math.random() * 5000);
    const chatType = targetChatId > 0 ? 'private' : 'supergroup';
    return {
      chatId: targetChatId,
      chatTitle: 'Test Group',
      command,
      args: [],
      sender,
      isAnonymousAdmin: false,
      adminDisplayName: sender.first_name || 'User',
      message: {
        message_id: cmdMessageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: targetChatId, type: chatType, title: 'Test Group' },
        from: sender,
        text: command,
        reply_to_message: replyTo as TelegramMessage | undefined
      } as TelegramMessage
    };
  }

  try {
    // TEST 1: Non-admin cannot use the command
    {
      lastSentMessage = null;
      const ctx = makeContext(normalMemberId, '/stickerpackremove');
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true, 'Command should be handled/intercepted');
      assert.strictEqual(
        lastSentMessage?.text,
        '❌ This bot is available only to group administrators.',
        'Regular member should be blocked by centralized admin guard'
      );
      pass('TEST 1: Non-admin cannot use /stickerpackremove');
    }

    // TEST 2: Admin can use the command
    {
      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove');
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true, 'Command should be handled');
      // Fails on missing reply, which proves admin was allowed into the handler
      assert(
        lastSentMessage?.text?.includes('Usage:') || lastSentMessage?.text?.includes('Reply to a sticker'),
        'Admin allowed past guard into usage check'
      );
      pass('TEST 2: Admin can use the command');
    }

    // TEST 3: Command without reply fails safely
    {
      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', undefined);
      await CommandHandler.handleCommand(ctx);
      assert(
        lastSentMessage?.text?.includes('Usage:') && lastSentMessage?.text?.includes('Reply to a sticker with <code>/stickerpackremove</code>'),
        'Must return concise usage instruction when not a reply'
      );
      pass('TEST 3: Command without reply fails safely with usage message');
    }

    // TEST 4: Reply to non-sticker fails safely
    {
      lastSentMessage = null;
      const nonStickerReply: Partial<TelegramMessage> = {
        message_id: 501,
        date: Math.floor(Date.now() / 1000),
        text: 'Hello world, I am plain text',
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' }
      };
      const ctx = makeContext(adminId, '/stickerpackremove', nonStickerReply);
      await CommandHandler.handleCommand(ctx);
      assert(
        lastSentMessage?.text?.includes('The replied message is not a sticker'),
        'Must report that replied message is not a sticker'
      );
      pass('TEST 4: Reply to non-sticker fails safely');
    }

    // TEST 5: Sticker with valid set is resolved via getStickerSet
    {
      const packName = 'test_pack_by_other_bot';
      stickerSetsDatabase[packName] = {
        name: packName,
        title: 'Other Bot Stickers',
        is_animated: false,
        is_video: false,
        stickers: [{ file_id: 'FILE_ID_101', emoji: '😀' }]
      };

      const stickerReply: Partial<TelegramMessage> = {
        message_id: 502,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'FILE_ID_101',
          file_unique_id: 'UNIQUE_101',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          set_name: packName
        }
      };

      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', stickerReply);
      await CommandHandler.handleCommand(ctx);
      assert(
        lastSentMessage?.text?.includes(packName) && lastSentMessage?.text?.includes('Other Bot Stickers'),
        'Resolved pack name and title in the response'
      );
      pass('TEST 5: Sticker with valid set is successfully resolved');
    }

    // TEST 6: Bot-owned sticker set is eligible for deletion
    {
      const botPackName = `cool_pack_by_${botUsername.toLowerCase()}`;
      stickerSetsDatabase[botPackName] = {
        name: botPackName,
        title: 'Roxie Official Pack',
        is_animated: false,
        is_video: false,
        stickers: [{ file_id: 'FILE_ROXIE_01', emoji: '✨' }]
      };

      // Register pack in group media library
      db.addStickerToLibrary('playful', 'FILE_ROXIE_01', {
        fileId: 'FILE_ROXIE_01',
        packName: botPackName,
        packTitle: 'Roxie Official Pack',
        mood: 'playful',
        addedAt: new Date().toISOString()
      }, chatId);

      const stickerReply: Partial<TelegramMessage> = {
        message_id: 503,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'FILE_ROXIE_01',
          file_unique_id: 'UNIQUE_ROXIE_01',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          set_name: botPackName
        }
      };

      deletedStickerSets = [];
      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', stickerReply);
      await CommandHandler.handleCommand(ctx);

      assert(
        deletedStickerSets.includes(botPackName),
        'deleteStickerSet must be called for bot-owned pack'
      );
      assert(
        lastSentMessage?.text?.includes('permanently deleted from Telegram'),
        'Must confirm permanent Telegram deletion'
      );

      // Verify removed from group storage
      const lib = db.getMediaLibrary(chatId);
      assert.strictEqual(
        lib.stickers['playful']?.includes('FILE_ROXIE_01') || false,
        false,
        'Pack stickers should be removed from group storage'
      );

      pass('TEST 6: Bot-owned sticker set is permanently deleted from Telegram & storage');
    }

    // TEST 7: Non-bot-owned sticker set is NOT falsely reported as deleted
    {
      const thirdPartyPack = 'public_animals_pack_by_other';
      stickerSetsDatabase[thirdPartyPack] = {
        name: thirdPartyPack,
        title: 'Public Animals',
        is_animated: false,
        is_video: false,
        stickers: [{ file_id: 'FILE_EXT_01', emoji: '🐶' }]
      };

      const stickerReply: Partial<TelegramMessage> = {
        message_id: 504,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'FILE_EXT_01',
          file_unique_id: 'UNIQUE_EXT_01',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          set_name: thirdPartyPack
        }
      };

      deletedStickerSets = [];
      deletedMessages = [];
      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', stickerReply);
      await CommandHandler.handleCommand(ctx);

      assert.strictEqual(
        deletedStickerSets.length,
        0,
        'Must NOT call deleteStickerSet for third-party pack'
      );
      assert(
        lastSentMessage?.text?.includes('Cannot Delete Third-Party Pack'),
        'Must explain third-party ownership restriction'
      );
      assert(
        !lastSentMessage?.text?.includes('permanently deleted from Telegram'),
        'Must NOT falsely claim the pack was deleted'
      );
      assert(
        deletedMessages.some(m => m.messageId === 504),
        'Must offer supported fallback of deleting the replied sticker message'
      );
      pass('TEST 7: Non-bot-owned sticker set is not falsely reported and message fallback is executed');
    }

    // TEST 8: Telegram API failure is handled safely
    {
      const errorPack = 'network_error_pack';
      // Force getStickerSet to throw
      const prevGetSet = telegramApi.getStickerSet;
      telegramApi.getStickerSet = async () => {
        throw new Error('Telegram connection timeout');
      };

      const stickerReply: Partial<TelegramMessage> = {
        message_id: 505,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'FILE_ERR_01',
          file_unique_id: 'UNIQUE_ERR_01',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          set_name: errorPack
        }
      };

      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', stickerReply);
      await CommandHandler.handleCommand(ctx);

      assert(
        lastSentMessage?.text?.includes('Failed to fetch sticker pack details') &&
        lastSentMessage?.text?.includes('Telegram connection timeout'),
        'Telegram API network error should be caught and reported gracefully'
      );

      telegramApi.getStickerSet = prevGetSet;
      pass('TEST 8: Telegram API failure is handled cleanly without crashing');
    }

    // TEST 9: Command cleanup works (moderator command message deleted)
    {
      const botPackName = `cleanup_pack_by_${botUsername.toLowerCase()}`;
      stickerSetsDatabase[botPackName] = {
        name: botPackName,
        title: 'Cleanup Pack',
        stickers: [{ file_id: 'FILE_CLN_01' }]
      };

      const stickerReply: Partial<TelegramMessage> = {
        message_id: 506,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'FILE_CLN_01',
          file_unique_id: 'UNIQUE_CLN_01',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false,
          set_name: botPackName
        }
      };

      deletedMessages = [];
      const ctx = makeContext(adminId, '/stickerpackremove', stickerReply);
      await CommandHandler.handleCommand(ctx);

      assert(
        deletedMessages.some(m => m.messageId === ctx.message.message_id),
        'Moderator command message must be deleted for clean chat'
      );
      pass('TEST 9: Clean chat behavior deletes moderator command message');
    }

    // TEST 10: Group isolation remains intact
    {
      const testPack = `shared_name_by_${botUsername.toLowerCase()}`;
      stickerSetsDatabase[testPack] = {
        name: testPack,
        title: 'Shared Pack',
        stickers: [{ file_id: 'FILE_ISO_A' }, { file_id: 'FILE_ISO_B' }]
      };

      // Add sticker in Group A and Group B
      db.clearMediaLibrary(groupA);
      db.clearMediaLibrary(groupB);
      db.addStickerToLibrary('cute', 'FILE_ISO_A', {
        fileId: 'FILE_ISO_A',
        packName: testPack,
        mood: 'cute',
        addedAt: new Date().toISOString()
      }, groupA);

      db.addStickerToLibrary('cute', 'FILE_ISO_B', {
        fileId: 'FILE_ISO_B',
        packName: testPack,
        mood: 'cute',
        addedAt: new Date().toISOString()
      }, groupB);

      // Remove in Group A only
      db.removeStickerPackFromLibrary(testPack, groupA);

      const libA = db.getMediaLibrary(groupA);
      const libB = db.getMediaLibrary(groupB);

      assert.strictEqual(
        libA.stickers['cute']?.includes('FILE_ISO_A') || false,
        false,
        'Group A sticker should be removed'
      );
      assert.strictEqual(
        libB.stickers['cute']?.includes('FILE_ISO_B'),
        true,
        'Group B sticker MUST remain intact'
      );
      pass('TEST 10: Group isolation remains intact across pack operations');
    }

    // TEST 11: No unhandled exceptions on edge cases
    {
      // Missing set_name
      const standaloneSticker: Partial<TelegramMessage> = {
        message_id: 507,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: 888, is_bot: false, first_name: 'Other' },
        sticker: {
          file_id: 'STANDALONE_01',
          file_unique_id: 'UNIQ_STANDALONE_01',
          width: 512,
          height: 512,
          is_animated: false,
          is_video: false
        }
      };

      lastSentMessage = null;
      const ctx = makeContext(adminId, '/stickerpackremove', standaloneSticker);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(
        lastSentMessage?.text?.includes('standalone sticker'),
        'Must handle standalone sticker gracefully'
      );

      // Private chat check
      const dmCtx = makeContext(adminId, '/stickerpackremove', standaloneSticker, 99999);
      dmCtx.chatId = 99999;
      lastSentMessage = null;
      await CommandHandler.handleCommand(dmCtx);
      assert(
        lastSentMessage?.text?.includes('inside groups') ||
        lastSentMessage?.text?.includes('used in groups') ||
        lastSentMessage?.text?.includes('available only to group administrators'),
        'Must reject private DM usage'
      );

      pass('TEST 11: Edge cases and nil fields handled safely without unhandled exceptions');
    }

    console.log('\n====================================================');
    console.log(`🎉 ALL 11 STICKER PACK REMOVE TESTS PASSED! (${passed}/11)`);
    console.log('====================================================\n');
  } finally {
    // Restore original API methods
    telegramApi.getMe = origGetMe;
    telegramApi.sendMessage = origSendMessage;
    telegramApi.deleteMessage = origDeleteMessage;
    telegramApi.getStickerSet = origGetStickerSet;
    telegramApi.deleteStickerSet = origDeleteStickerSet;
    telegramApi.getChatMember = origGetChatMember;
  }
}

runStickerPackRemoveTests().catch(err => {
  console.error('❌ Sticker pack remove test suite failed:', err);
  process.exit(1);
});
