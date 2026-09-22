process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
delete process.env.ENABLE_PROACTIVE_TEXT;
delete process.env.ENABLE_AUTO_RESPONSE;

import { strict as assert } from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService, AutoEngineService } from '../server/telegram/autoEngineService.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { TelegramMessage, TelegramUser, TelegramChatMember } from '../server/telegram/types.js';
import { CommandContext } from '../server/telegram/middleware.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function runAutoEngineProactiveTextDisabledSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting AutoEngine Proactive Text Suppression Test Suite');
  console.log('===================================================================\n');

  const botId = 812999444;
  const testChatId = -1004494269999;
  const adminId = 123456;
  const mockBotUser: TelegramUser = { id: botId, is_bot: true, first_name: 'Roxie', username: 'MissRoxie_Bot' };

  // Track captured API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; sticker: string; options?: any }> = [];

  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    sentStickers.push({ chatId, sticker, options });
    return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (_chatId: number, _action: any): Promise<any> => {
    return { ok: true, result: true };
  };

  (telegramApi as any).getChatMember = async (_chatId: number, userId: number) => {
    return {
      ok: true,
      result: {
        status: userId === adminId ? 'administrator' : 'member',
        user: { id: userId, is_bot: false, first_name: userId === adminId ? 'AdminUser' : 'User' },
        can_restrict_members: true,
        can_delete_messages: true,
        can_pin_messages: true,
        can_promote_members: true
      }
    };
  };

  // Mock virtual timer clock
  let virtualTime = Date.now();
  let pendingCallbacks: Array<{ id: number; executeAt: number; fn: () => void }> = [];
  let nextTimerId = 1;

  const mockSetTimeout = ((fn: any, delay?: number): any => {
    const id = nextTimerId++;
    const executeAt = virtualTime + (delay || 0);
    pendingCallbacks.push({ id, executeAt, fn });
    return id as any;
  }) as typeof setTimeout;

  const mockClearTimeout = ((id: any): void => {
    pendingCallbacks = pendingCallbacks.filter(c => c.id !== id);
  }) as typeof clearTimeout;

  const mockNow = () => virtualTime;

  autoEngineService.setTestHooks({
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    now: mockNow,
    bypassMinimumIntervalForTests: true
  });

  db.setBotIdentity({ id: botId, username: 'MissRoxie_Bot' });

  const resetState = () => {
    sentMessages = [];
    sentStickers = [];
    delete process.env.ENABLE_PROACTIVE_TEXT;
    delete process.env.ENABLE_AUTO_RESPONSE;
    AutoEngineService.setProactiveTextEnabled(null);
  };

  const setupGroup = (mode: 'off' | 'messages_only' | 'stickers_only' | 'messages_and_stickers' = 'messages_and_stickers', humanMessages: number = 50) => {
    db.updateGroupSettings(testChatId, {
      botId,
      botLeft: false,
      unavailable: false,
      chatbotEnabled: true,
      humanMessagesSinceLastSticker: humanMessages,
      requiredStickerGap: 10,
      stickerActivityMin: 10,
      stickerActivityMax: 20,
      autoEngine: {
        enabled: mode !== 'off',
        mode,
        humanMessagesSinceLastSticker: humanMessages,
        requiredStickerGap: 10,
        messages: { preset: 'normal', minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120, randomize: false },
        stickers: { preset: 'normal', minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120, randomize: false }
      },
      autoResponse: {
        enabled: mode === 'messages_only' || mode === 'messages_and_stickers',
        mode: (mode === 'messages_only' || mode === 'messages_and_stickers') ? 'every_message' : 'disabled',
        cooldownSeconds: 0,
        lastResponseTimestamp: 0
      },
      autoSticker: {
        enabled: mode === 'stickers_only' || mode === 'messages_and_stickers',
        mode: (mode === 'stickers_only' || mode === 'messages_and_stickers') ? 'cooldown' : 'disabled',
        cooldownSeconds: 0,
        lastStickerTimestamp: 0,
        nextAllowedAt: 0
      }
    });
  };

  try {
    autoEngineService.start(botId);

    // ----------------------------------------------------
    // TEST 1: Default state (ENABLE_PROACTIVE_TEXT absent) suppresses proactive text job scheduling
    // ----------------------------------------------------
    await test('1. Default state suppresses proactive text scheduling in AutoEngine while scheduling stickers', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      assert.strictEqual(AutoEngineService.isProactiveTextEnabled(), false, 'isProactiveTextEnabled must be false by default');
      assert.strictEqual(autoEngineService.isProactiveTextEnabled(), false, 'instance isProactiveTextEnabled must be false by default');

      autoEngineService.syncGroup(botId, testChatId);

      // Verify: response job is NOT scheduled, sticker job IS scheduled
      const responseJob = autoEngineService.getJob(botId, testChatId, 'response');
      const stickerJob = autoEngineService.getJob(botId, testChatId, 'sticker');

      assert.strictEqual(responseJob, undefined, 'Response job must be suppressed when ENABLE_PROACTIVE_TEXT is absent');
      assert.ok(stickerJob, 'Sticker job must be scheduled and active');
    });

    // ----------------------------------------------------
    // TEST 2: ENABLE_AUTO_RESPONSE=true does NOT bypass the proactive text gate
    // ----------------------------------------------------
    await test('2. Setting ENABLE_AUTO_RESPONSE=true does NOT bypass the gate or enable proactive text', async () => {
      resetState();
      process.env.ENABLE_AUTO_RESPONSE = 'true';
      setupGroup('messages_and_stickers', 50);

      assert.strictEqual(AutoEngineService.isProactiveTextEnabled(), false, 'ENABLE_AUTO_RESPONSE must not enable proactive text');

      autoEngineService.syncGroup(botId, testChatId);

      const responseJob = autoEngineService.getJob(botId, testChatId, 'response');
      assert.strictEqual(responseJob, undefined, 'Response job must remain suppressed');
    });

    // ----------------------------------------------------
    // TEST 3: Explicit ENABLE_PROACTIVE_TEXT=true enables proactive text scheduling
    // ----------------------------------------------------
    await test('3. Explicit ENABLE_PROACTIVE_TEXT=true enables proactive text scheduling', async () => {
      resetState();
      process.env.ENABLE_PROACTIVE_TEXT = 'true';
      setupGroup('messages_and_stickers', 50);

      assert.strictEqual(AutoEngineService.isProactiveTextEnabled(), true, 'ENABLE_PROACTIVE_TEXT=true must enable proactive text');

      autoEngineService.syncGroup(botId, testChatId);

      const responseJob = autoEngineService.getJob(botId, testChatId, 'response');
      const stickerJob = autoEngineService.getJob(botId, testChatId, 'sticker');

      assert.ok(responseJob, 'Response job must be scheduled when ENABLE_PROACTIVE_TEXT=true');
      assert.ok(stickerJob, 'Sticker job must be scheduled when ENABLE_PROACTIVE_TEXT=true');
    });

    // ----------------------------------------------------
    // TEST 4: Direct execution of executeAutoResponse with ENABLE_PROACTIVE_TEXT disabled exits immediately
    // ----------------------------------------------------
    await test('4. Direct executeAutoResponse execution is safely aborted when proactive text is disabled', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      // Record a new human message in memory
      db.addGroupConversationEntry(testChatId, {
        messageId: 9991,
        userId: 111,
        content: 'Hey everyone, check this out!',
        name: 'Alice',
        role: 'user',
        timestamp: Date.now()
      });

      // Force execute response job directly
      await (autoEngineService as any).executeAutoResponse(
        botId,
        testChatId,
        db.getGroupSettings(testChatId),
        db.getGroupSettings(testChatId).autoEngine
      );

      assert.strictEqual(sentMessages.length, 0, 'Zero messages must be sent');
    });

    // ----------------------------------------------------
    // TEST 5: Proactive sticker scheduling & execution remains fully operational
    // ----------------------------------------------------
    await test('5. Proactive stickers execute normally when activity gating is satisfied', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      // Verify sticker eligibility
      const eligibility = db.checkAutoStickerEligibility(testChatId);
      assert.strictEqual(eligibility.allowed, true, 'Sticker eligibility must be allowed with 50 human messages');

      // Execute sticker job directly
      await (autoEngineService as any).executeAutoSticker(
        botId,
        testChatId,
        db.getGroupSettings(testChatId),
        db.getGroupSettings(testChatId).autoEngine
      );

      assert.strictEqual(sentStickers.length, 1, 'Exactly one sticker must be sent');
      assert.strictEqual(sentMessages.length, 0, 'Zero text messages sent during sticker execution');
    });

    // ----------------------------------------------------
    // TEST 6: Proactive sticker activity gating suppresses sticker and sends zero fallback text
    // ----------------------------------------------------
    await test('6. Proactive sticker with low activity count is gated with zero fallback text', async () => {
      resetState();
      setupGroup('messages_and_stickers', 2); // Only 2 messages (threshold is 10)

      const eligibility = db.checkAutoStickerEligibility(testChatId);
      assert.strictEqual(eligibility.allowed, false, 'Sticker eligibility must be gated');

      await (autoEngineService as any).executeAutoSticker(
        botId,
        testChatId,
        db.getGroupSettings(testChatId),
        db.getGroupSettings(testChatId).autoEngine
      );

      assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent when gated');
      assert.strictEqual(sentMessages.length, 0, 'Zero fallback text sent when gated');
    });

    // ----------------------------------------------------
    // TEST 7: Incoming unprompted message in group skips Priority 3 proactive text
    // ----------------------------------------------------
    await test('7. Unprompted incoming group message skips proactive text generation', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);
      ChatbotService.setProactiveOpportunityProbability(1.0); // Even with 100% probability

      const unpromptedMsg: TelegramMessage = {
        message_id: 8881,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup', title: 'Test Supergroup' },
        from: { id: 555, is_bot: false, first_name: 'Bob' },
        text: 'Just sharing a general update here with the group.'
      };

      const decision = await ChatbotService.generateResponseDecision('req-7', unpromptedMsg, mockBotUser);

      assert.ok(decision, 'Decision object must be returned');
      assert.strictEqual(decision.responseType, 'none', 'Response type must be none');
      assert.strictEqual(decision.reason, 'No trigger condition met', 'Reason must be No trigger condition met');
    });

    // ----------------------------------------------------
    // TEST 8: Direct trigger (@Roxie / "roxie") still generates direct AI response
    // ----------------------------------------------------
    await test('8. Direct Roxie trigger (@Roxie) bypasses proactive gate and delivers AI response', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      const directMsg: TelegramMessage = {
        message_id: 8882,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup', title: 'Test Supergroup' },
        from: { id: 555, is_bot: false, first_name: 'Bob', username: 'bob_user' },
        text: '@MissRoxie_Bot how are you doing today?'
      };

      // Mock OpenRouter API response
      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Hey Bob! I am doing great, thanks for asking! 😊'
              }
            }
          ]
        }),
        text: async () => ''
      }) as any;

      try {
        const decision = await ChatbotService.generateResponseDecision('req-8', directMsg, mockBotUser);

        assert.ok(decision, 'Decision object must be returned');
        assert.strictEqual(decision.responseType, 'text', 'Response type must be text for direct trigger');
        assert.strictEqual(decision.content, 'Hey Bob! I am doing great, thanks for asking! 😊');
        assert.strictEqual(decision.replyToMessageId, 8882, 'Reply target must be the triggering message');
      } finally {
        global.fetch = origFetch;
      }
    });

    // ----------------------------------------------------
    // TEST 9: Dynamic toggling of proactive text setting
    // ----------------------------------------------------
    await test('9. Programmatic toggle enables and disables response jobs dynamically', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      // 1. Initial state: disabled
      AutoEngineService.setProactiveTextEnabled(false);
      autoEngineService.syncGroup(botId, testChatId);
      assert.strictEqual(autoEngineService.getJob(botId, testChatId, 'response'), undefined);
      assert.ok(autoEngineService.getJob(botId, testChatId, 'sticker'));

      // 2. Toggle to enabled
      AutoEngineService.setProactiveTextEnabled(true);
      autoEngineService.syncGroup(botId, testChatId);
      assert.ok(autoEngineService.getJob(botId, testChatId, 'response'), 'Response job scheduled after enabling');
      assert.ok(autoEngineService.getJob(botId, testChatId, 'sticker'), 'Sticker job preserved after enabling');

      // 3. Toggle back to disabled
      AutoEngineService.setProactiveTextEnabled(false);
      autoEngineService.syncGroup(botId, testChatId);
      assert.strictEqual(autoEngineService.getJob(botId, testChatId, 'response'), undefined, 'Response job canceled after disabling');
      assert.ok(autoEngineService.getJob(botId, testChatId, 'sticker'), 'Sticker job preserved after disabling');
    });

    // ----------------------------------------------------
    // TEST 10: /schedule and /all commands remain completely unaffected
    // ----------------------------------------------------
    await test('10. Core commands (/schedule and /all) operate normally with proactive text disabled', async () => {
      resetState();
      setupGroup('messages_and_stickers', 50);

      const adminUser: TelegramUser = { id: adminId, is_bot: false, first_name: 'Admin', username: 'admin_user' };
      const adminCtx: CommandContext = {
        message: {
          message_id: 5001,
          date: Math.floor(Date.now() / 1000),
          chat: { id: testChatId, type: 'supergroup', title: 'Test Supergroup' },
          from: adminUser,
          text: '/schedule 10m delOn Meeting in 10 minutes!'
        },
        sender: adminUser,
        chatId: testChatId,
        chatTitle: 'Test Supergroup',
        isAnonymousAdmin: false,
        adminDisplayName: 'AdminUser',
        args: ['10m', 'delOn', 'Meeting', 'in', '10', 'minutes!'],
        command: '/schedule'
      };

      await CommandHandler.handleCommand(adminCtx);

      const schedules = db.getGroupSchedules(testChatId);
      const created = schedules.find(s => s.messageText?.includes('Meeting in 10 minutes!'));
      assert.ok(created, 'Schedule must be created successfully');
      assert.strictEqual(created.autoDeletePrevious, true, 'delOn flag must be respected');
    });

  } finally {
    global.fetch = origFetch;
    autoEngineService.stop();
    autoEngineService.resetTestHooks();
    resetState();
  }

  console.log('\n===================================================================');
  console.log(`🎉 AUTO-ENGINE PROACTIVE TEXT TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('===================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAutoEngineProactiveTextDisabledSuite().catch((err) => {
  console.error('Test suite runner encountered fatal error:', err);
  process.exit(1);
});
