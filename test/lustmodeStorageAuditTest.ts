import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { DEFAULT_STICKERS_BY_MOOD } from '../server/telegram/defaultStickers.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runLustmodeStorageAuditTests() {
  console.log('====================================================');
  console.log('🧪 Starting Lust Mode Common Storage Audit Test Suite');
  console.log('====================================================\n');

  const groupA = -100888111000;
  const groupB = -100888222000;
  const groupEmpty = -100888333000;
  const adminId = 1001;

  const botUser = { id: 999888777, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  let lastSentMessage: { chatId: number | string; text: string; options?: any } | null = null;
  const origSendMessage = telegramApi.sendMessage;
  telegramApi.sendMessage = async (cId: number | string, text: string, opts?: any) => {
    lastSentMessage = { chatId: cId, text, options: opts };
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1 } as any };
  };

  const origFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: 'Haan jaan, bolo!'
            }
          }
        ]
      })
    } as any;
  }) as any;

  const origGetChatMember = telegramApi.getChatMember;
  telegramApi.getChatMember = async (cId: number | string, uId: number) => {
    return {
      ok: true,
      result: {
        status: uId === adminId ? 'creator' : 'member',
        user: { id: uId, is_bot: false, first_name: 'User' }
      } as any
    };
  };

  function makeContext(groupId: number, cmd: string, args: string[] = []): CommandContext {
    const sender = { id: adminId, is_bot: false, first_name: 'Owner' };
    return {
      chatId: groupId,
      chatTitle: `Group ${groupId}`,
      command: cmd,
      args,
      sender,
      isAnonymousAdmin: false,
      adminDisplayName: 'Owner',
      message: {
        message_id: 1234,
        date: Math.floor(Date.now() / 1000),
        chat: { id: groupId, type: 'supergroup', title: `Group ${groupId}` },
        from: sender,
        text: `${cmd} ${args.join(' ')}`.trim()
      } as TelegramMessage
    };
  }

  try {
    ChatbotService.reset();
    db.clearMediaLibrary(groupA);
    db.clearMediaLibrary(groupB);
    db.clearMediaLibrary(groupEmpty);

    // TEST 1: Generic default stickers are NOT automatically inherited by Lust Mode
    {
      // Put a generic sticker into common/global storage (without a chatId)
      const commonSticker = 'CAACAgIAAxUAAWqCommonGenericSticker_001_XYZ';
      db.addStickerToLibrary('romantic', commonSticker);

      // Verify common sticker is detected as default/non-custom
      assert.strictEqual(
        ChatbotService.isDefaultSticker(commonSticker),
        true,
        'Common storage sticker without chatId must be treated as default/non-custom'
      );

      // Verify a built-in default sticker from DEFAULT_STICKERS_BY_MOOD
      const builtInRomantic = DEFAULT_STICKERS_BY_MOOD['romantic'][0];
      assert.strictEqual(
        ChatbotService.isDefaultSticker(builtInRomantic),
        true,
        'Built-in sticker must be recognized as default'
      );

      // Enable Lust Mode for groupEmpty (which has 0 custom stickers)
      db.getGroupSettings(groupEmpty, 'Empty Group');
      db.updateGroupSettings(groupEmpty, { lustMode: true });

      // selectCustomStickerForLustMode MUST NOT return the common or default sticker
      const selected = ChatbotService.selectCustomStickerForLustMode('romantic', groupEmpty);
      assert.strictEqual(
        selected,
        null,
        'Lust Mode must NOT inherit generic default stickers from common storage or built-in library'
      );

      // Permission check: default stickers are strictly blocked for Lust Mode
      assert.strictEqual(
        ChatbotService.isStickerAllowedForMode(builtInRomantic, groupEmpty, true),
        false,
        'Built-in default sticker forbidden in Lust Mode'
      );
      assert.strictEqual(
        ChatbotService.isStickerAllowedForMode(commonSticker, groupEmpty, true),
        false,
        'Common storage default sticker forbidden in Lust Mode'
      );

      pass('TEST 1: Generic default stickers are not automatically inherited by Lust Mode');
    }

    // TEST 2: Explicit Lust Mode stickers still work
    {
      const explicitLustSticker = 'CAACAgIAAxUAAWqExplicitLustSticker_Romantic_001';
      db.addLustSticker('romantic', explicitLustSticker, {
        fileId: explicitLustSticker,
        mood: 'romantic',
        packName: 'explicit_lust_pack',
        addedAt: new Date().toISOString()
      }, groupA);

      // Enable Lust Mode for groupA
      db.getGroupSettings(groupA, 'Group A');
      db.updateGroupSettings(groupA, { lustMode: true });

      const selected = ChatbotService.selectCustomStickerForLustMode('romantic', groupA);
      assert.strictEqual(
        selected,
        explicitLustSticker,
        'Explicit Lust Mode sticker must be selected for the group'
      );

      assert.strictEqual(
        ChatbotService.isStickerAllowedForMode(explicitLustSticker, groupA, true),
        true,
        'Explicit Lust Mode sticker must be allowed in Lust Mode'
      );

      pass('TEST 2: Explicit Lust Mode stickers still work');
    }

    // TEST 3: Group-specific Lust stickers remain intact
    {
      const lustStickers = db.getLustStickers(groupA, 'romantic');
      assert.strictEqual(lustStickers.length, 1, 'Group A must have 1 explicit romantic lust sticker');
      assert.strictEqual(lustStickers[0], 'CAACAgIAAxUAAWqExplicitLustSticker_Romantic_001');

      const libA = db.getMediaLibrary(groupA);
      assert(libA.lustStickers && libA.lustStickers['romantic'], 'Group media library must contain lustStickers record');
      assert(libA.lustStickers['romantic'].includes('CAACAgIAAxUAAWqExplicitLustSticker_Romantic_001'));

      pass('TEST 3: Group-specific Lust stickers remain intact');
    }

    // TEST 4: Group A changes do not affect Group B
    {
      const lustStickerB = 'CAACAgIAAxUAAWqExplicitLustSticker_GroupB_001';
      db.addLustSticker('flirty', lustStickerB, {
        fileId: lustStickerB,
        mood: 'flirty',
        packName: 'pack_b',
        addedAt: new Date().toISOString()
      }, groupB);

      db.getGroupSettings(groupB, 'Group B');
      db.updateGroupSettings(groupB, { lustMode: true });

      // Group B can select its own sticker
      const selectedB = ChatbotService.selectCustomStickerForLustMode('flirty', groupB);
      assert.strictEqual(selectedB, lustStickerB);

      // Group A cannot select Group B's sticker
      assert.strictEqual(
        ChatbotService.isCustomSticker(lustStickerB, groupA),
        false,
        "Group B's sticker is NOT a custom sticker for Group A"
      );

      // Clear Group A's lust stickers
      db.clearLustStickers(groupA);
      assert.strictEqual(db.getLustStickers(groupA).length, 0, 'Group A lust stickers cleared');

      // Group B must be completely unaffected
      assert.strictEqual(
        db.getLustStickers(groupB).length,
        1,
        'Group B lust stickers must remain unaffected when Group A is cleared'
      );
      assert.strictEqual(db.getLustStickers(groupB)[0], lustStickerB);

      pass('TEST 4: Group A changes do not affect Group B');
    }

    // TEST 5: Custom sticker configuration remains intact
    {
      const customPlayful = 'CAACAgIAAxUAAWqCustomGeneralSticker_001';
      db.addStickerToLibrary('playful', customPlayful, {
        fileId: customPlayful,
        mood: 'playful',
        packName: 'general_custom_pack',
        addedAt: new Date().toISOString()
      }, groupA);

      assert.strictEqual(
        ChatbotService.isCustomSticker(customPlayful, groupA),
        true,
        'Regular custom sticker must be recognized as custom'
      );

      // Lust Mode can use valid custom stickers from the group's custom library
      const selectedFallback = ChatbotService.selectCustomStickerForLustMode('playful', groupA);
      assert.strictEqual(
        selectedFallback,
        customPlayful,
        'Lust Mode selects group custom sticker when no explicit lust sticker exists'
      );

      pass('TEST 5: Custom sticker configuration remains intact');
    }

    // TEST 6: /lust off still behaves correctly
    {
      // Turn off lust mode via command
      const ctx = makeContext(groupA, '/lust', ['off']);
      await CommandHandler.handleCommand(ctx);

      const settings = db.getGroupSettings(groupA);
      assert.strictEqual(settings.lustMode, false, 'Lust Mode must be turned OFF');

      // In normal mode (isLustMode = false), standard stickers are permitted
      const builtInSticker = DEFAULT_STICKERS_BY_MOOD['normal'][0];
      assert.strictEqual(
        ChatbotService.isStickerAllowedForMode(builtInSticker, groupA, false),
        true,
        'Default stickers allowed when Lust Mode is OFF'
      );

      pass('TEST 6: /lust off behaves correctly and restores normal mode');
    }

    // TEST 7: Existing custom sticker protection remains intact
    {
      // Turn stickerProtection ON
      db.updateGroupSettings(groupA, { stickerProtection: true });
      const settings = db.getGroupSettings(groupA);
      assert.strictEqual(settings.stickerProtection, true);

      // Non-freed member is restricted
      assert.strictEqual(
        db.isUserStickerFree(groupA, 99999),
        false,
        'Unfreed member is not exempt'
      );

      // Free user
      db.grantStickerPermission(groupA, 99999, adminId, 'TestUser');
      assert.strictEqual(
        db.isUserStickerFree(groupA, 99999),
        true,
        'Freed member is exempt from sticker protection'
      );

      // Unfree user
      db.revokeContentPermission(groupA, 99999, 'stickers');
      assert.strictEqual(
        db.isUserStickerFree(groupA, 99999),
        false,
        'Unfreed member is no longer exempt'
      );

      pass('TEST 7: Existing custom sticker protection remains intact');
    }

    // TEST 8: Empty sticker configuration is handled safely
    {
      // Group with Lust Mode ON, but 0 stickers configured
      db.updateGroupSettings(groupEmpty, { lustMode: true });
      db.clearMediaLibrary(groupEmpty);

      // selectCustomStickerForLustMode returns null safely
      const sticker = ChatbotService.selectCustomStickerForLustMode('romantic', groupEmpty);
      assert.strictEqual(sticker, null, 'Must safely return null with 0 stickers');

      // Full decision generation handles 0 stickers gracefully without throwing
      const testMsg: TelegramMessage = {
        message_id: 1001,
        date: Math.floor(Date.now() / 1000),
        chat: { id: groupEmpty, type: 'supergroup', title: 'Empty Group' },
        from: { id: 1001, is_bot: false, first_name: 'Aman' },
        text: 'Hello Roxie jaan'
      };
      const decision = await ChatbotService.generateResponseDecision(
        'req_test_empty',
        testMsg,
        botUser
      );

      assert(decision, 'Must return a valid decision');
      assert.strictEqual(decision.responseType, 'text', 'Should return friendly text-only fallback');
      assert(
        decision.content?.includes('Lust Mode requires custom stickers'),
        'Fallback text explains custom stickers are required'
      );
      assert.strictEqual(
        decision.mediaFileId,
        undefined,
        'Must NOT attach any default sticker'
      );

      pass('TEST 8: Empty sticker configuration is handled safely without errors');
    }

    console.log('\n====================================================');
    console.log(`🎉 ALL 8 LUST MODE STORAGE AUDIT TESTS PASSED! (${passed}/8)`);
    console.log('====================================================\n');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.getChatMember = origGetChatMember;
    global.fetch = origFetch;
  }
}

runLustmodeStorageAuditTests().catch(err => {
  console.error('❌ Lust Mode storage audit test suite failed:', err);
  process.exit(1);
});
