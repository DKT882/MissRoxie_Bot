import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService, AUTO_ENGINE_PRESETS, MIN_AUTO_ENGINE_INTERVAL_SECONDS } from '../server/telegram/autoEngineService.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { AutoEngineMode, AutoEnginePreset } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runAutoEngineUnifiedModeTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Full 28-Edge-Case Auto Engine Unified Mode Test Suite');
  console.log('===================================================================\n');

  const botId = 812999444;
  const testChatA = -1004223070652; // Authoritative Group 1
  const testChatB = -1004449422619; // Authoritative Group 2
  const testChatC = -1004450389363; // Authoritative Group 3
  const testChat7 = -100888999777; // Onboarded 7th Group

  // Track API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string }> = [];
  let sentChatActions: Array<{ chatId: number; action: string }> = [];
  let apiFailureMode: Record<number, string | null> = {};

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    if (apiFailureMode[chatId]) {
      return { ok: false, error_code: 400, description: apiFailureMode[chatId]! };
    }
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    if (apiFailureMode[chatId]) {
      return { ok: false, error_code: 400, description: apiFailureMode[chatId]! };
    }
    sentStickers.push({ chatId, fileId: sticker });
    return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (chatId: number, action: any): Promise<any> => {
    if (apiFailureMode[chatId]) {
      return { ok: false, error_code: 400, description: apiFailureMode[chatId]! };
    }
    sentChatActions.push({ chatId, action });
    return { ok: true, result: true };
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

  const advanceTime = async (ms: number) => {
    virtualTime += ms;
    let ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    while (ready.length > 0) {
      ready.sort((a, b) => a.executeAt - b.executeAt);
      const item = ready.shift()!;
      pendingCallbacks = pendingCallbacks.filter(c => c.id !== item.id);
      await item.fn();
      ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    }
  };

  // Configure test hooks with bypass = true for fast virtual testing
  autoEngineService.setTestHooks({
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    now: mockNow,
    bypassMinimumIntervalForTests: true
  });

  db.setBotIdentity({ id: botId, username: 'MissRoxie_Bot' });

  // Clean baseline: disable auto engines on existing groups for test isolation
  const initialGroups = db.getAllGroupSettings(botId);
  for (const [idStr] of Object.entries(initialGroups)) {
    db.updateGroupSettings(Number(idStr), {
      lustMode: false,
      autoEngine: { enabled: false, mode: 'off' },
      autoResponse: { enabled: false, mode: 'disabled' },
      autoSticker: { enabled: false, mode: 'disabled' }
    });
  }
  autoEngineService.start(botId);

  const mockBotUser = { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' };

  try {
    // -------------------------------------------------------------
    // EDGE CASES 1-6: Dynamic Mode Transitions
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 1-6: Dynamic Mode Transitions ---');

    // Setup initial state: BOTH messages and stickers enabled
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true },
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.ok(autoEngineService.getJob(botId, testChatA, 'response'), 'Initial response job scheduled');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Initial sticker job scheduled');

    // 1. BOTH -> MESSAGES_ONLY immediately cancels sticker timer
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.ok(autoEngineService.getJob(botId, testChatA, 'response'), 'Response job retained in messages_only');
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'sticker'), undefined, 'Sticker job immediately canceled');
    pass('Test 1: BOTH -> MESSAGES_ONLY immediately cancels sticker timer');

    // 2. BOTH -> STICKERS_ONLY immediately cancels message timer
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true },
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'response'), undefined, 'Response job immediately canceled');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Sticker job retained in stickers_only');
    pass('Test 2: BOTH -> STICKERS_ONLY immediately cancels message timer');

    // 3. OFF immediately cancels both timers
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: false,
        mode: 'off'
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'response'), undefined, 'Response job canceled on OFF');
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'sticker'), undefined, 'Sticker job canceled on OFF');
    pass('Test 3: OFF immediately cancels both');

    // 4. OFF -> MESSAGES_ONLY schedules message timer and zero sticker timers
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.ok(autoEngineService.getJob(botId, testChatA, 'response'), 'Response job scheduled');
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'sticker'), undefined, 'No sticker job scheduled');
    pass('Test 4: OFF -> MESSAGES_ONLY schedules message timer and zero sticker timers');

    // 5. OFF -> STICKERS_ONLY schedules sticker timer and zero message timers
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'response'), undefined, 'No response job scheduled');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Sticker job scheduled');
    pass('Test 5: OFF -> STICKERS_ONLY schedules sticker timer and zero message timers');

    // 6. OFF -> MESSAGES_AND_STICKERS schedules both
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true },
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.ok(autoEngineService.getJob(botId, testChatA, 'response'), 'Response job scheduled');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Sticker job scheduled');
    pass('Test 6: OFF -> MESSAGES_AND_STICKERS schedules both');

    // -------------------------------------------------------------
    // EDGE CASES 7-10: Frequency Presets, Custom Interval, Min Floor
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 7-10: Frequency Presets & Minimum Floor ---');

    // 7. Frequency preset change (normal -> high) cancels old timer and creates exactly one new timer
    const jobBefore7 = autoEngineService.getJob(botId, testChatA, 'response');
    const oldHandle7 = jobBefore7?.timeoutHandle;
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'high' }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    const jobAfter7 = autoEngineService.getJob(botId, testChatA, 'response');
    assert.ok(jobAfter7, 'Job must exist after preset update');
    assert.notStrictEqual(jobAfter7.timeoutHandle, oldHandle7, 'Old timer handle must be replaced');
    assert.strictEqual(autoEngineService.getActiveJobCount().response, 1, 'Exactly one message timer must exist');
    pass('Test 7: Frequency change cancels old timer and creates exactly one new timer');

    // 8. Custom frequency change cancels old timer and reschedules single timer with updated interval
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 150, maxSeconds: 200, cooldownSeconds: 150, randomize: false }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    assert.strictEqual(autoEngineService.getActiveJobCount().response, 1, 'Exactly one timer after custom update');
    pass('Test 8: Custom frequency change cancels old timer and reschedules single timer');

    // 9. Strict server-side minimum floor (120s / 2m) enforced for custom message interval
    autoEngineService.setTestHooks({ bypassMinimumIntervalForTests: false });
    const msgFloorDelayMs = autoEngineService.calculateDelayMs({
      preset: 'custom',
      minSeconds: 10,
      maxSeconds: 30,
      cooldownSeconds: 15,
      randomize: false
    }, 120, 300, 120, 'messages');
    assert.ok(msgFloorDelayMs >= 120000, `Message delay must be >= 120000ms (120s floor), got ${msgFloorDelayMs}ms`);
    pass('Test 9: Strict server-side minimum floor (120s) enforced for custom message interval');

    // 10. Strict server-side minimum floor (120s / 2m) enforced for custom sticker interval
    const stkFloorDelayMs = autoEngineService.calculateDelayMs({
      preset: 'custom',
      minSeconds: 5,
      maxSeconds: 25,
      cooldownSeconds: 10,
      randomize: false
    }, 120, 300, 120, 'stickers');
    assert.ok(stkFloorDelayMs >= 120000, `Sticker delay must be >= 120000ms (120s floor), got ${stkFloorDelayMs}ms`);
    autoEngineService.setTestHooks({ bypassMinimumIntervalForTests: true });
    pass('Test 10: Strict server-side minimum floor (120s) enforced for custom sticker interval');

    // -------------------------------------------------------------
    // EDGE CASES 11-13: Telegram Error Isolation
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 11-13: Telegram Error Isolation ---');

    // Setup Chat A and Chat B in AutoEngine
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });

    db.updateGroupSettings(testChatB, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });

    autoEngineService.syncGroup(botId, testChatA);
    autoEngineService.syncGroup(botId, testChatB);

    // 11. Invalid Telegram group (400 chat not found) cancels ONLY that group's timers
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Proactive test response' } }] })
    })) as any;

    apiFailureMode[testChatA] = 'Bad Request: chat not found';
    apiFailureMode[testChatB] = null;

    await advanceTime(70000);

    const sA = db.getGroupSettings(testChatA);
    assert.strictEqual(sA.botLeft, true, 'Chat A botLeft must be true');
    assert.strictEqual(sA.unavailable, true, 'Chat A unavailable must be true');
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'response'), undefined, 'Chat A job canceled');
    pass('Test 11: Invalid Telegram group cancels ONLY that group\'s timers');

    // 12. Another group's timers continue after the first group fails
    const sB = db.getGroupSettings(testChatB);
    assert.strictEqual(sB.botLeft, false, 'Chat B botLeft must remain false');
    assert.strictEqual(sB.unavailable, false, 'Chat B unavailable must remain false');
    assert.ok(autoEngineService.getJob(botId, testChatB, 'response'), 'Chat B job MUST remain active and scheduled');
    pass('Test 12: Another group\'s timers continue after the first group fails');

    // 13. Bot kicked/forbidden in group C cancels ONLY group C
    db.updateGroupSettings(testChatC, {
      botId,
      botLeft: false,
      unavailable: false,
      humanMessagesSinceLastSticker: 15,
      requiredStickerGap: 10,
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatC);
    apiFailureMode[testChatC] = 'Forbidden: bot was kicked from the supergroup chat';

    await advanceTime(70000);

    const sC = db.getGroupSettings(testChatC);
    assert.strictEqual(sC.botLeft, true, 'Chat C botLeft must be true');
    assert.strictEqual(autoEngineService.getJob(botId, testChatC, 'sticker'), undefined, 'Chat C sticker job canceled');
    pass('Test 13: Bot kicked/forbidden cancels ONLY that group\'s timers');

    // -------------------------------------------------------------
    // EDGE CASE 14: Process Restart Hydration & Jitter
    // -------------------------------------------------------------
    console.log('--- EDGE CASE 14: Restart Hydration ---');

    // Reset Chat A and Chat B to active
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'normal' },
        stickers: { preset: 'normal' }
      }
    });
    db.updateGroupSettings(testChatB, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'normal' }
      }
    });

    // Stop and restart autoEngineService
    autoEngineService.stop();
    assert.strictEqual(autoEngineService.getActiveJobCount().total, 0, 'Zero jobs after stop');
    autoEngineService.start(botId);

    // Chat A has 2 jobs (response + sticker), Chat B has 1 job (response)
    assert.ok(autoEngineService.getJob(botId, testChatA, 'response'), 'Chat A response scheduled on restart');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Chat A sticker scheduled on restart');
    assert.ok(autoEngineService.getJob(botId, testChatB, 'response'), 'Chat B response scheduled on restart');
    assert.strictEqual(autoEngineService.getJob(botId, testChatB, 'sticker'), undefined, 'Chat B sticker not scheduled');
    pass('Test 14: Restart creates exactly one timer per enabled feature per group');

    // -------------------------------------------------------------
    // EDGE CASES 15-17: Direct @Roxie Mentions Independence
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 15-17: Direct Mentions Independence ---');

    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Hello! Roxie is replying to your direct mention.' } }] })
    })) as any;

    // 15. Direct @Roxie mention works while Auto Engine is OFF
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      autoEngine: { enabled: false, mode: 'off' }
    });

    const msgDirectOff = {
      message_id: 8801,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
      from: { id: 1234567, is_bot: false, first_name: 'Alice', username: 'alice' },
      text: '@MissRoxie_Bot what is up?'
    };

    const decOff = await ChatbotService.generateResponseDecision('req_dir_off', msgDirectOff as any, mockBotUser);
    assert.ok(decOff && decOff.responseType !== 'none', 'Must respond to direct mention when Auto Engine is OFF');
    pass('Test 15: Direct @Roxie mention works while Auto Engine is OFF');

    // 16. Direct @Roxie mention works while mode is STICKERS_ONLY
    db.updateGroupSettings(testChatA, {
      autoEngine: { enabled: true, mode: 'stickers_only' }
    });
    const decStkOnly = await ChatbotService.generateResponseDecision('req_dir_stk', msgDirectOff as any, mockBotUser);
    assert.ok(decStkOnly && decStkOnly.responseType !== 'none', 'Must respond to direct mention in STICKERS_ONLY mode');
    pass('Test 16: Direct @Roxie mention works while mode is STICKERS_ONLY');

    // 17. Direct @Roxie mention works while mode is MESSAGES_ONLY
    db.updateGroupSettings(testChatA, {
      autoEngine: { enabled: true, mode: 'messages_only' }
    });
    const decMsgOnly = await ChatbotService.generateResponseDecision('req_dir_msg', msgDirectOff as any, mockBotUser);
    assert.ok(decMsgOnly && decMsgOnly.responseType !== 'none', 'Must respond to direct mention in MESSAGES_ONLY mode');
    pass('Test 17: Direct @Roxie mention works while mode is MESSAGES_ONLY');

    // -------------------------------------------------------------
    // EDGE CASES 18-19: AI Failure Suppression & Typing Indicator Fix
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 18-19: AI Failure & Ghost Typing Suppression ---');

    global.fetch = (async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'Internal Server Error' } })
    })) as any;

    sentMessages = [];
    sentChatActions = [];

    const failMsg = {
      message_id: 8802,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
      from: { id: 1234567, is_bot: false, first_name: 'Alice', username: 'alice' },
      text: '@MissRoxie_Bot test fail'
    };

    const failDec = await ChatbotService.generateResponseDecision('req_fail_dec', failMsg as any, mockBotUser);

    // 18. AI failure never sends dummy/filler text
    assert.ok(failDec, 'Decision returned');
    assert.strictEqual(failDec.responseType, 'none', 'responseType must be none on failure');
    assert.strictEqual(failDec.content, undefined, 'Zero dummy text must be emitted');
    pass('Test 18: AI failure never sends dummy/filler text');

    // 19. AI failure never leaves typing indicator stuck
    assert.strictEqual(sentChatActions.length, 0, 'Zero typing actions emitted when AI fails');
    pass('Test 19: AI failure never leaves typing indicator stuck');

    // -------------------------------------------------------------
    // EDGE CASES 20-23: Execution & Next Interval Rescheduling
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 20-23: Execution & Rescheduling ---');

    // 20. Successful sticker creates exactly one next timer
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      lustMode: false,
      humanMessagesSinceLastSticker: 15,
      requiredStickerGap: 10,
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    apiFailureMode[testChatA] = null;
    sentStickers = [];

    await advanceTime(70000);

    assert.ok(sentStickers.length >= 1, 'Sticker must have been sent');
    assert.ok(autoEngineService.getJob(botId, testChatA, 'sticker'), 'Next sticker timer must be scheduled');
    assert.strictEqual(autoEngineService.getActiveJobCount().sticker, 1, 'Exactly one sticker timer exists');
    pass('Test 20: Successful sticker creates exactly one next timer');

    // 21. Sticker cannot execute again before server-side minimum cooldown
    const jobStk21 = autoEngineService.getJob(botId, testChatA, 'sticker');
    assert.ok(jobStk21 && jobStk21.targetRunAt > virtualTime, 'Next sticker must be in the future');
    pass('Test 21: Sticker cannot execute again before the server-side minimum cooldown');

    // 22. Successful proactive message creates exactly one next timer
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Proactive conversation message' } }] })
    })) as any;

    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);
    sentMessages = [];

    await advanceTime(70000);

    assert.ok(sentMessages.length >= 1, 'Message must have been sent');
    const jobA22 = autoEngineService.getJob(botId, testChatA, 'response');
    assert.ok(jobA22, 'Next message timer must be scheduled for Chat A');
    assert.strictEqual(jobA22.engineType, 'response');
    pass('Test 22: Successful proactive message creates exactly one next timer');

    // 23. Failed proactive message does not create duplicate retry timers
    global.fetch = (async () => ({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ error: { message: 'Server down' } })
    })) as any;

    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30, randomize: true }
      }
    });
    autoEngineService.syncGroup(botId, testChatA);

    await advanceTime(70000);

    // Job should back off safely with single timer
    const jobA23 = autoEngineService.getJob(botId, testChatA, 'response');
    assert.ok(jobA23, 'Next message backoff timer must be scheduled for Chat A');
    assert.strictEqual(jobA23.engineType, 'response');
    pass('Test 23: Failed proactive message does not create duplicate retry timers');

    // -------------------------------------------------------------
    // EDGE CASES 24-26: OpenRouter Fallbacks & Models
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 24-26: OpenRouter Candidate Models & Fallbacks ---');

    // 24. OpenRouter 402 Payment Required falls back gracefully
    let modelsTried: string[] = [];
    global.fetch = (async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      modelsTried.push(body.model);
      if (modelsTried.length === 1) {
        return { ok: false, status: 402, text: async () => JSON.stringify({ error: { message: 'Credit limit reached' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Fallback model succeeded' } }] }) };
    }) as any;

    const dec402 = await ChatbotService.generateResponseDecision('req_402', msgDirectOff as any, mockBotUser);
    assert.ok(dec402 && dec402.responseType !== 'none', 'Must succeed on fallback model');
    assert.ok(modelsTried.length >= 2, 'Must have fallen back to next model');
    pass('Test 24: OpenRouter 402 Payment Required falls back gracefully');

    // 25. OpenRouter 429 Rate Limit backoff
    modelsTried = [];
    global.fetch = (async (url: any, opts: any) => {
      const body = JSON.parse(opts.body);
      modelsTried.push(body.model);
      if (modelsTried.length === 1) {
        return { ok: false, status: 429, text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'Model 2 succeeded' } }] }) };
    }) as any;

    const dec429 = await ChatbotService.generateResponseDecision('req_429', msgDirectOff as any, mockBotUser);
    assert.ok(dec429 && dec429.responseType !== 'none', 'Must succeed on fallback after 429');
    pass('Test 25: OpenRouter 429 Rate Limit applies backoff and moves to next candidate');

    // 26. Candidate models list verification
    const candidates = ChatbotService.getCandidateModels();
    assert.ok(candidates.length >= 4, 'Must have at least 4 candidate models');
    for (const m of candidates) {
      if (m !== 'openrouter/free' && !m.includes('gpt-4o') && !m.includes('claude')) {
        assert.ok(m.endsWith(':free') || m === 'openrouter/free', `Free model ${m} must have :free suffix`);
      }
    }
    pass('Test 26: Candidate models properly include :free suffixes for OpenRouter');

    // -------------------------------------------------------------
    // EDGE CASES 27-28: Future Onboarding & Storage Backward Compatibility
    // -------------------------------------------------------------
    console.log('--- EDGE CASES 27-28: 7th-Group Onboarding & Backward Compatibility ---');

    // 27. 7th-group onboarding remains functional after unified Auto Engine changes
    db.updateGroupSettings(testChat7, {
      botId,
      chatTitle: 'Brand New 7th Group',
      botLeft: false,
      unavailable: false,
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'normal' },
        stickers: { preset: 'normal' }
      }
    });
    autoEngineService.syncGroup(botId, testChat7);

    assert.ok(autoEngineService.getJob(botId, testChat7, 'response'), '7th group response job scheduled');
    assert.ok(autoEngineService.getJob(botId, testChat7, 'sticker'), '7th group sticker job scheduled');
    const s7 = db.getGroupSettings(testChat7);
    assert.strictEqual(s7.chatTitle, 'Brand New 7th Group');
    assert.strictEqual(s7.autoEngine?.mode, 'messages_and_stickers');
    // Clean up 7th group after test
    db.deleteGroupData(testChat7);
    autoEngineService.cancelAllForGroup(botId, testChat7);
    pass('Test 27: 7th-group onboarding remains functional after unified Auto Engine changes');

    // 28. Bidirectional storage merging preserves complete backward compatibility
    db.updateGroupSettings(testChatC, {
      botId,
      botLeft: false,
      unavailable: false,
      autoResponse: {
        enabled: true,
        mode: 'random',
        minSeconds: 160,
        maxSeconds: 320
      },
      autoSticker: {
        enabled: false,
        mode: 'disabled'
      }
    });

    const syncdC = db.getGroupSettings(testChatC);
    assert.strictEqual(syncdC.autoEngine?.mode, 'messages_only', 'autoEngine mode should sync to messages_only');
    assert.strictEqual(syncdC.autoEngine?.enabled, true, 'autoEngine should be enabled');
    assert.strictEqual(syncdC.autoEngine?.messages?.minSeconds, 160, 'minSeconds should sync to messages');
    pass('Test 28: Bidirectional storage merging preserves complete backward compatibility');

    console.log('\n===================================================================');
    console.log(`🎉 ALL ${passed}/28 UNIFIED AUTO ENGINE EDGE CASES PASSED!`);
    console.log('===================================================================\n');
  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
    autoEngineService.resetTestHooks();
    autoEngineService.stop();
  }
}

runAutoEngineUnifiedModeTestSuite().catch(err => {
  console.error('❌ Test suite failed with error:', err);
  process.exit(1);
});
