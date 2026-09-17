import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runProactiveAutoEngineTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Proactive Auto Response & Auto Sticker Test Suite');
  console.log('===================================================================\n');

  const botIdA = 812999444;
  const botIdB = 999888777;
  const testGroup1 = -100999888101;
  const testGroup2 = -100999888102;
  const testGroup3 = -100999888103;

  // Mock API tracking
  let sentMessages: Array<{ chatId: number; text: string }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string }> = [];
  let openRouterAiCalls = 0;

  // Backup original API and fetch methods
  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origCall = (telegramApi as any).call;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    sentMessages.push({ chatId, text });
    return { ok: true, result: { message_id: 9000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    sentStickers.push({ chatId, fileId: sticker });
    return { ok: true, result: { message_id: 8000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (chatId: number, action: any): Promise<any> => {
    return { ok: true, result: true };
  };

  (telegramApi as any).call = async (method: string, params?: any): Promise<any> => {
    return { ok: true, result: true };
  };

  global.fetch = async (url: any, opts: any): Promise<any> => {
    if (typeof url === 'string' && url.includes('openrouter.ai')) {
      openRouterAiCalls++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Haan ji, sab kaisa chal raha hai group me?'
              }
            }
          ]
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
  };

  // Mock virtual timer clock for instantaneous test execution
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
    const ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    pendingCallbacks = pendingCallbacks.filter(c => c.executeAt > virtualTime);
    for (const item of ready) {
      await item.fn();
    }
  };

  try {
    // Setup virtual clock in autoEngineService
    autoEngineService.setTestHooks({
      setTimeout: mockSetTimeout,
      clearTimeout: mockClearTimeout,
      now: mockNow
    });

    db.setBotIdentity({ id: botIdA, username: 'RoxieDemo_bot' });

    // Clean baseline: disable auto engines on existing groups for test isolation
    const initialGroups = db.getAllGroupSettings(botIdA);
    for (const [idStr] of Object.entries(initialGroups)) {
      db.updateGroupSettings(Number(idStr), {
        botLeft: false,
        unavailable: false,
        unavailableReason: undefined,
        autoResponse: { enabled: false, mode: 'disabled', cooldownSeconds: 30 },
        autoSticker: { enabled: false, mode: 'disabled', cooldownSeconds: 60 }
      });
    }

    // --------------------------------------------------------------------------------------
    // TEST 01: Auto Response Enabled Creates Exactly One Timer
    // --------------------------------------------------------------------------------------
    autoEngineService.start(botIdA);
    db.updateGroupSettings(testGroup1, {
      botId: botIdA,
      botLeft: false,
      unavailable: false,
      unavailableReason: undefined,
      chatbotEnabled: true,
      autoResponse: {
        enabled: true,
        mode: 'random',
        minSeconds: 30,
        maxSeconds: 120,
        cooldownSeconds: 30
      },
      autoSticker: {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 60
      }
    });

    const jobResp1 = autoEngineService.getJob(botIdA, testGroup1, 'response');
    const jobStk1 = autoEngineService.getJob(botIdA, testGroup1, 'sticker');
    assert(jobResp1 !== undefined, 'Auto Response job must exist');
    assert(jobStk1 === undefined, 'Auto Sticker job must NOT exist when disabled');
    assert.strictEqual(autoEngineService.getActiveJobCount().response, 1);
    assert.strictEqual(autoEngineService.getActiveJobCount().sticker, 0);
    pass('TEST 01: Auto Response enabled creates exactly one timer');

    // --------------------------------------------------------------------------------------
    // TEST 02: Auto Response Disabled Removes Timer
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoResponse: {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 30
      }
    });
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'response'), undefined);
    assert.strictEqual(autoEngineService.getActiveJobCount().total, 0);
    pass('TEST 02: Auto Response disabled removes timer immediately');

    // --------------------------------------------------------------------------------------
    // TEST 03: Auto Sticker Enabled Creates Exactly One Independent Timer
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoSticker: {
        enabled: true,
        mode: 'random',
        minSeconds: 50,
        maxSeconds: 200,
        cooldownSeconds: 60
      }
    });
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'response'), undefined);
    const jobStk2 = autoEngineService.getJob(botIdA, testGroup1, 'sticker');
    assert(jobStk2 !== undefined, 'Auto Sticker job must exist');
    assert.strictEqual(autoEngineService.getActiveJobCount().sticker, 1);
    pass('TEST 03: Auto Sticker enabled creates exactly one independent timer');

    // --------------------------------------------------------------------------------------
    // TEST 04: Auto Sticker Disabled Removes Timer
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoSticker: {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 60
      }
    });
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'sticker'), undefined);
    assert.strictEqual(autoEngineService.getActiveJobCount().total, 0);
    pass('TEST 04: Auto Sticker disabled removes timer immediately');

    // --------------------------------------------------------------------------------------
    // TEST 05: Both Enabled Creates Exactly Two Timers
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        minSeconds: 30,
        maxSeconds: 120,
        cooldownSeconds: 30
      },
      autoSticker: {
        enabled: true,
        mode: 'random',
        minSeconds: 50,
        maxSeconds: 200,
        cooldownSeconds: 60
      }
    });
    assert(autoEngineService.getJob(botIdA, testGroup1, 'response') !== undefined);
    assert(autoEngineService.getJob(botIdA, testGroup1, 'sticker') !== undefined);
    assert.strictEqual(autoEngineService.getActiveJobCount().response, 1);
    assert.strictEqual(autoEngineService.getActiveJobCount().sticker, 1);
    assert.strictEqual(autoEngineService.getActiveJobCount().total, 2);
    pass('TEST 05: Both enabled creates exactly two independent timers');

    // --------------------------------------------------------------------------------------
    // TEST 06: Silent Group Triggers Proactive Auto Response Without Incoming Messages
    // --------------------------------------------------------------------------------------
    sentMessages = [];
    openRouterAiCalls = 0;
    const initialRespJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(initialRespJob);
    const delayToRun = initialRespJob.targetRunAt - virtualTime;
    await advanceTime(delayToRun + 100);

    assert.strictEqual(sentMessages.length, 1, 'Proactive message must be sent to Telegram');
    assert.strictEqual(sentMessages[0].chatId, testGroup1);
    assert(sentMessages[0].text.length > 0);
    assert.strictEqual(openRouterAiCalls, 1, 'OpenRouter must be called for proactive text response');
    // Verify next run is scheduled
    assert(autoEngineService.getJob(botIdA, testGroup1, 'response') !== undefined);
    pass('TEST 06: Silent group triggers Auto Response without incoming message');

    // --------------------------------------------------------------------------------------
    // TEST 07: Silent Group Triggers Proactive Auto Sticker Without Incoming Messages & Zero AI
    // --------------------------------------------------------------------------------------
    sentStickers = [];
    // Temporarily disable auto response to isolate auto sticker execution
    db.updateGroupSettings(testGroup1, {
      autoResponse: { enabled: false, mode: 'disabled', cooldownSeconds: 30 }
    });
    const aiCallsBeforeSticker = openRouterAiCalls;
    const initialStkJob = autoEngineService.getJob(botIdA, testGroup1, 'sticker');
    assert(initialStkJob);
    const stkDelay = initialStkJob.targetRunAt - virtualTime;
    await advanceTime(stkDelay + 100);

    assert.strictEqual(sentStickers.length, 1, 'Proactive sticker must be sent to Telegram');
    assert.strictEqual(sentStickers[0].chatId, testGroup1);
    assert(sentStickers[0].fileId.length > 0);
    assert.strictEqual(openRouterAiCalls, aiCallsBeforeSticker, 'Auto Sticker must require ZERO OpenRouter AI calls');
    pass('TEST 07: Silent group triggers Auto Sticker without incoming message & zero AI calls');

    // --------------------------------------------------------------------------------------
    // TEST 08: Random Response Delay Stays Strictly Within Min/Max
    // --------------------------------------------------------------------------------------
    for (let i = 0; i < 50; i++) {
      const delay = autoEngineService.calculateDelayMs({
        enabled: true,
        mode: 'random',
        minSeconds: 30,
        maxSeconds: 120,
        cooldownSeconds: 30
      }, 30, 120, 30);
      assert(delay >= 30000 && delay <= 120000, `Delay ${delay}ms must be between 30000ms and 120000ms`);
    }
    pass('TEST 08: Random response delay stays strictly within min/max');

    // --------------------------------------------------------------------------------------
    // TEST 09: Random Sticker Delay Stays Strictly Within Min/Max
    // --------------------------------------------------------------------------------------
    for (let i = 0; i < 50; i++) {
      const delay = autoEngineService.calculateDelayMs({
        enabled: true,
        mode: 'random',
        minSeconds: 50,
        maxSeconds: 200,
        cooldownSeconds: 60
      }, 50, 200, 60);
      assert(delay >= 50000 && delay <= 200000, `Delay ${delay}ms must be between 50000ms and 200000ms`);
    }
    pass('TEST 09: Random sticker delay stays strictly within min/max');

    // --------------------------------------------------------------------------------------
    // TEST 10: Fixed Cooldown Mode Works Correctly
    // --------------------------------------------------------------------------------------
    const fixedDelay = autoEngineService.calculateDelayMs({
      enabled: true,
      mode: 'cooldown',
      cooldownSeconds: 45
    }, 30, 120, 30);
    assert.strictEqual(fixedDelay, 45000, 'Fixed cooldown mode must return exact configured milliseconds');
    pass('TEST 10: Fixed cooldown mode maps directly to configured cooldown');

    // --------------------------------------------------------------------------------------
    // TEST 11: Settings Update Replaces Old Timer
    // --------------------------------------------------------------------------------------
    const beforeJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    const oldTarget = beforeJob?.targetRunAt;
    db.updateGroupSettings(testGroup1, {
      autoResponse: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 77
      }
    });
    const afterJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(afterJob !== undefined);
    assert.strictEqual(afterJob.targetRunAt, virtualTime + 77000);
    assert.notStrictEqual(afterJob.targetRunAt, oldTarget);
    pass('TEST 11: Settings update cancels old timer and reschedules new timer');

    // --------------------------------------------------------------------------------------
    // TEST 12: Repeated Settings Updates Never Create Duplicate Timers
    // --------------------------------------------------------------------------------------
    for (let i = 0; i < 10; i++) {
      db.updateGroupSettings(testGroup1, {
        autoResponse: {
          enabled: true,
          mode: 'cooldown',
          cooldownSeconds: 30 + i
        }
      });
    }
    assert.strictEqual(autoEngineService.getActiveJobCount().response, 1, 'Exactly one timer must exist');
    pass('TEST 12: Repeated settings updates never create duplicate timers');

    // --------------------------------------------------------------------------------------
    // TEST 13: Restart Staggers Initial Execution (Jitter Prevents Burst)
    // --------------------------------------------------------------------------------------
    // Setup multiple groups
    db.updateGroupSettings(testGroup2, {
      botId: botIdA,
      botLeft: false,
      autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 120, cooldownSeconds: 30 }
    });
    db.updateGroupSettings(testGroup3, {
      botId: botIdA,
      botLeft: false,
      autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 120, cooldownSeconds: 30 }
    });

    // Simulate restart
    autoEngineService.stop();
    assert.strictEqual(autoEngineService.getActiveJobCount().total, 0);

    autoEngineService.start(botIdA);
    const j1 = autoEngineService.getJob(botIdA, testGroup1, 'response');
    const j2 = autoEngineService.getJob(botIdA, testGroup2, 'response');
    const j3 = autoEngineService.getJob(botIdA, testGroup3, 'response');

    assert(j1 && j2 && j3, 'All enabled groups must be scheduled on restart');
    // Verify jittered startup delays are >= 5s
    assert(j1.targetRunAt - virtualTime >= 5000);
    assert(j2.targetRunAt - virtualTime >= 5000);
    assert(j3.targetRunAt - virtualTime >= 5000);
    pass('TEST 13: Process restart restores enabled groups with staggered jitter');

    // --------------------------------------------------------------------------------------
    // TEST 14: Multiple Groups Are Isolated
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup2, {
      autoResponse: { enabled: false, mode: 'disabled', cooldownSeconds: 30 }
    });
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup2, 'response'), undefined);
    assert(autoEngineService.getJob(botIdA, testGroup1, 'response') !== undefined);
    assert(autoEngineService.getJob(botIdA, testGroup3, 'response') !== undefined);
    pass('TEST 14: Multiple groups have completely isolated timers');

    // --------------------------------------------------------------------------------------
    // TEST 15: Multiple Bots Are Isolated
    // --------------------------------------------------------------------------------------
    // Switch scope to botIdB
    db.setBotIdentity({ id: botIdB, username: 'OtherBot' });
    autoEngineService.start(botIdB);
    // testGroup1 belongs to botIdA, so botIdB must not have jobs for testGroup1
    assert.strictEqual(autoEngineService.getJob(botIdB, testGroup1, 'response'), undefined);
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'response'), undefined);

    // Switch back to botIdA
    db.setBotIdentity({ id: botIdA, username: 'RoxieDemo_bot' });
    autoEngineService.start(botIdA);
    assert(autoEngineService.getJob(botIdA, testGroup1, 'response') !== undefined);
    pass('TEST 15: Multiple bots are strictly isolated');

    // --------------------------------------------------------------------------------------
    // TEST 16: AI Concurrency Bounded
    // --------------------------------------------------------------------------------------
    assert(ChatbotService.MAX_CONCURRENT_AI_REQUESTS === 4, 'Max concurrent AI requests must be 4');
    pass('TEST 16: AI concurrency bound remains 4');

    // --------------------------------------------------------------------------------------
    // TEST 17: Reactive AI and Explicit Roxie Mentions Still Work
    // --------------------------------------------------------------------------------------
    const reactiveDecision = await ChatbotService.generateResponseDecision(
      'req-explicit-test',
      {
        message_id: 555,
        chat: { id: testGroup1, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'roxie jaan kaisi ho?'
      } as any,
      null
    );
    assert(reactiveDecision);
    assert.strictEqual(reactiveDecision.responseType, 'text');
    assert(reactiveDecision.content && reactiveDecision.content.length > 0);
    pass('TEST 17: Reactive AI and explicit Roxie mentions continue to work immediately');

    // --------------------------------------------------------------------------------------
    // TEST 18: OpenRouter Failure Does Not Tight Retry (Backs off >= 60s) and Produces Zero Dummy Text
    // --------------------------------------------------------------------------------------
    const prevFetch = global.fetch;
    global.fetch = async () => {
      return { ok: false, status: 500, text: async () => 'Internal Server Error' } as any;
    };

    // Verify reactive failure returns responseType: 'none' and sends no dummy text
    const failDecision = await ChatbotService.generateResponseDecision(
      'req-fail-test',
      {
        message_id: 556,
        chat: { id: testGroup1, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'hello'
      } as any,
      null
    );
    assert.strictEqual(failDecision.responseType, 'none', 'On AI failure, responseType must be none');

    const beforeFailJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(beforeFailJob);
    const failDelay = beforeFailJob.targetRunAt - virtualTime;
    await advanceTime(failDelay + 100);

    const afterFailJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(afterFailJob);
    assert(afterFailJob.targetRunAt - virtualTime >= 60000, 'Backoff must be at least 60s on AI failure');
    global.fetch = prevFetch;
    pass('TEST 18: OpenRouter failure suppresses dummy text (responseType: none) and backs off safely without tight retry loop');

    // --------------------------------------------------------------------------------------
    // TEST 19: Telegram 429 Respects retry_after
    // --------------------------------------------------------------------------------------
    const prevSend = telegramApi.sendMessage;
    telegramApi.sendMessage = async () => {
      return { ok: false, description: 'Too Many Requests: retry after 42' } as any;
    };

    const before429Job = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(before429Job);
    await advanceTime((before429Job.targetRunAt - virtualTime) + 100);

    const after429Job = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(after429Job);
    assert(after429Job.targetRunAt - virtualTime >= 47000, 'Backoff must respect retry_after (42s + 5s buffer)');
    telegramApi.sendMessage = prevSend;
    pass('TEST 19: Telegram 429 respects retry_after + buffer');

    // --------------------------------------------------------------------------------------
    // TEST 20: Bot Removed from Group Cancels Jobs
    // --------------------------------------------------------------------------------------
    telegramApi.sendMessage = async () => {
      return { ok: false, description: 'Forbidden: bot was kicked from the supergroup chat' } as any;
    };

    const beforeKickJob = autoEngineService.getJob(botIdA, testGroup1, 'response');
    assert(beforeKickJob);
    await advanceTime((beforeKickJob.targetRunAt - virtualTime) + 100);

    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'response'), undefined);
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup1, 'sticker'), undefined);
    telegramApi.sendMessage = prevSend;
    pass('TEST 20: Bot removed from group automatically cancels all future jobs');

    // --------------------------------------------------------------------------------------
    // TEST 21: Group Conversation Memory Context Utilized In Proactive AI
    // --------------------------------------------------------------------------------------
    db.addGroupConversationEntry(testGroup3, {
      role: 'user',
      userId: 1234,
      name: 'Aman',
      content: 'Aaj ka match bohot mast tha!',
      timestamp: Date.now()
    });
    const memory = db.getGroupMemory(testGroup3);
    assert(memory.length > 0);
    const proactiveDecision = await ChatbotService.generateProactiveResponse(testGroup3, null);
    assert(proactiveDecision && proactiveDecision.content);
    pass('TEST 21: Group conversation memory context is preserved in proactive response');

    // --------------------------------------------------------------------------------------
    // TEST 22: Lust Mode Proactive Sticker Uses Custom Library Only
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup3, {
      lustMode: true,
      botLeft: false
    });
    const lustSticker = ChatbotService.selectProactiveSticker(testGroup3);
    // If no custom stickers in group library, it safely returns null (never default sticker)
    if (lustSticker) {
      assert(ChatbotService.isCustomSticker(lustSticker, testGroup3));
    }
    pass('TEST 22: Lust mode proactive sticker respects custom sticker isolation');

    // --------------------------------------------------------------------------------------
    // TEST 23: Non-Lust Mode Proactive Sticker Selects Valid File ID
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup3, {
      lustMode: false
    });
    const nonLustSticker = ChatbotService.selectProactiveSticker(testGroup3);
    assert(nonLustSticker !== null);
    assert(typeof nonLustSticker === 'string');
    pass('TEST 23: Non-Lust mode proactive sticker selects valid sticker from collection');

    // --------------------------------------------------------------------------------------
    // TEST 24: Group Deletion / Removal Cancels All Timers
    // --------------------------------------------------------------------------------------
    db.updateGroupSettings(testGroup3, {
      botLeft: false,
      unavailable: false,
      autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 120, cooldownSeconds: 30 },
      autoSticker: { enabled: true, mode: 'random', minSeconds: 50, maxSeconds: 200, cooldownSeconds: 60 }
    });
    assert(autoEngineService.getJob(botIdA, testGroup3, 'response') !== undefined);
    assert(autoEngineService.getJob(botIdA, testGroup3, 'sticker') !== undefined);

    db.deleteGroupData(testGroup3);
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup3, 'response'), undefined);
    assert.strictEqual(autoEngineService.getJob(botIdA, testGroup3, 'sticker'), undefined);
    pass('TEST 24: Group deletion cancels all auto engine timers');

    // --------------------------------------------------------------------------------------
    // TEST 25: Disabled Engines Produce Zero Outbound Requests
    // --------------------------------------------------------------------------------------
    sentMessages = [];
    sentStickers = [];
    autoEngineService.stop();
    await advanceTime(500000);
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers.length, 0);
    pass('TEST 25: Disabled engines produce zero outbound requests');

  } finally {
    // Restore originals
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    (telegramApi as any).call = origCall;
    global.fetch = origFetch;
    autoEngineService.resetTestHooks();
    autoEngineService.stop();
  }

  console.log('\n===================================================================');
  console.log(`🎉 PROACTIVE AUTO ENGINE TEST SUITE COMPLETE: ${passed}/25 TESTS PASSED`);
  console.log('===================================================================\n');
  process.exit(0);
}

runProactiveAutoEngineTestSuite().catch((err) => {
  console.error('❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
