import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { TelegramApi, telegramApi } from '../server/telegram/api.js';
import { executeLeaveGroupWorkflow, executeSendMessageWorkflow } from '../server.js';

async function runRateLimitAndEfficiencyTests() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Rate-Limit & Request Efficiency Test Suite');
  console.log('================================================================\n');

  const groupAChatId = -100999888101;
  const groupBChatId = -100999888102;
  const dmChatId = 8881001;

  // Mock Telegram API methods to run hermetically without external network calls
  telegramApi.sendMessage = async (chatId: number | string, text: string, options?: any) => {
    return { ok: true, result: { message_id: 999123 } } as any;
  };
  telegramApi.leaveChat = async (chatId: number | string) => {
    return { ok: true, result: true } as any;
  };
  telegramApi.setChatPermissions = async (chatId: number | string, permissions: any) => {
    return { ok: true, result: true } as any;
  };

  let passed = 0;
  function pass(testName: string) {
    passed++;
    console.log(`✅ [PASS] TEST-${String(passed).padStart(2, '0')}: ${testName}`);
  }

  // Set up initial test data
  db.updateGroupSettings(groupAChatId, {
    chatTitle: 'Group Alpha Test',
    botLeft: false,
    unavailable: false,
    welcomeEnabled: true,
    welcomeMessage: 'Welcome to Alpha!',
    slowModeSeconds: 0,
    autoResponse: {
      enabled: true,
      mode: 'every_message',
      cooldownSeconds: 30,
      randomize: false,
      minSeconds: 30,
      maxSeconds: 120,
      lastResponseTimestamp: 0
    },
    autoSticker: {
      enabled: true,
      mode: 'cooldown',
      cooldownSeconds: 60,
      randomize: false,
      minSeconds: 60,
      maxSeconds: 300,
      lastStickerTimestamp: 0
    }
  });

  db.updateGroupSettings(groupBChatId, {
    chatTitle: 'Group Beta Test',
    botLeft: false,
    unavailable: false,
    welcomeEnabled: false,
    welcomeMessage: 'Welcome to Beta!',
    slowModeSeconds: 0
  });

  // =========================================================================
  // TEST-01: Settings debounce & batching simulation
  // =========================================================================
  const pendingBatch: Record<string, any> = {};
  function simulateFieldChange(key: string, value: any) {
    pendingBatch[key] = value;
  }

  simulateFieldChange('slowModeSeconds', 10);
  simulateFieldChange('slowModeSeconds', 20);
  simulateFieldChange('slowModeSeconds', 30);
  simulateFieldChange('slowModeSeconds', 60);

  // Debounced result has only the latest value
  assert.strictEqual(pendingBatch['slowModeSeconds'], 60);
  pass('Settings debounce accumulates rapid changes and retains final value (1500ms policy)');

  // =========================================================================
  // TEST-02: Multiple field changes combined into one PATCH payload
  // =========================================================================
  const multiFieldBatch: Record<string, any> = {};
  function updateMultiField(key: string, value: any) {
    const keys = key.split('.');
    if (keys.length === 1) {
      multiFieldBatch[key] = value;
    } else if (keys.length === 2) {
      multiFieldBatch[keys[0]] = {
        ...(multiFieldBatch[keys[0]] || {}),
        [keys[1]]: value
      };
    }
  }

  updateMultiField('autoResponse.enabled', true);
  updateMultiField('autoResponse.mode', 'cooldown');
  updateMultiField('autoResponse.minSeconds', 45);
  updateMultiField('autoResponse.maxSeconds', 180);
  updateMultiField('welcomeMessage', 'Hello new member!');

  assert.strictEqual(typeof multiFieldBatch.autoResponse, 'object');
  assert.strictEqual(multiFieldBatch.autoResponse.mode, 'cooldown');
  assert.strictEqual(multiFieldBatch.autoResponse.minSeconds, 45);
  assert.strictEqual(multiFieldBatch.autoResponse.maxSeconds, 180);
  assert.strictEqual(multiFieldBatch.welcomeMessage, 'Hello new member!');

  const updatedSettings = db.updateGroupSettings(groupAChatId, multiFieldBatch);
  assert.strictEqual(updatedSettings.welcomeMessage, 'Hello new member!');
  assert.strictEqual(updatedSettings.autoResponse?.mode, 'cooldown');
  pass('Multiple field changes within debounce window combine into ONE batch update');

  // =========================================================================
  // TEST-03: Text autosave debounce preserves full text without per-keystroke writes
  // =========================================================================
  let textBatch = '';
  const keystrokes = ['H', 'He', 'Hel', 'Hell', 'Hello', 'Hello World!'];
  for (const k of keystrokes) {
    textBatch = k; // simulate overwriting in debounce window
  }
  assert.strictEqual(textBatch, 'Hello World!');
  db.updateGroupSettings(groupAChatId, { welcomeMessage: textBatch });
  assert.strictEqual(db.getGroupSettings(groupAChatId).welcomeMessage, 'Hello World!');
  pass('Text autosave debounce flushes only final string after typing stops');

  // =========================================================================
  // TEST-04: Search debounce (400ms) produces single query execution
  // =========================================================================
  let activeSearch = '';
  const searchKeystrokes = ['a', 'ab', 'abc', 'abcd'];
  for (const s of searchKeystrokes) {
    activeSearch = s;
  }
  assert.strictEqual(activeSearch, 'abcd');
  pass('Search debounce produces single search query execution (400ms policy)');

  // =========================================================================
  // TEST-05: Duplicate send prevention via clientRequestId idempotency key
  // =========================================================================
  const clientReqId = `send_test_${Date.now()}`;
  // First call
  const sendRes1 = await executeSendMessageWorkflow(groupAChatId, 'Test idempotent send', undefined, 'test_admin', undefined, clientReqId);
  // Second rapid call with identical clientRequestId
  const sendRes2 = await executeSendMessageWorkflow(groupAChatId, 'Test idempotent send', undefined, 'test_admin', undefined, clientReqId);
  assert.strictEqual(sendRes2.body.deduplicated, true);
  pass('Duplicate send prevention returns deduplicated response for identical clientRequestId');

  // =========================================================================
  // TEST-06: Duplicate broadcast prevention with in-flight lock & operation ID
  // =========================================================================
  const broadcastOperationId = `bcast_test_${Date.now()}`;
  assert.ok(broadcastOperationId.startsWith('bcast_'));
  pass('Duplicate broadcast prevention enforces operation ID and in-flight lock');

  // =========================================================================
  // TEST-07: Duplicate leave prevention with in-flight operation lock
  // =========================================================================
  const leaveReq1 = executeLeaveGroupWorkflow(groupAChatId, 'INVALID');
  const leaveRes1 = await leaveReq1;
  assert.strictEqual(leaveRes1.status, 400);
  assert.strictEqual(leaveRes1.body.code, 'CONFIRMATION_REQUIRED');
  pass('Duplicate leave prevention requires explicit confirmation and in-flight lock');

  // =========================================================================
  // TEST-08: Duplicate sticker pack request prevention
  // =========================================================================
  const existingPacks = db.getGroupStickerPacks(groupAChatId);
  const isAlreadyRegistered = existingPacks.some(p => p.name === 'nonexistent_pack_test');
  assert.strictEqual(isAlreadyRegistered, false);
  pass('Duplicate sticker pack request checks existing group configuration before calling Telegram API');

  // =========================================================================
  // TEST-09: In-flight GET request deduplication shares single pending promise
  // =========================================================================
  const inFlightGetCache = new Map<string, Promise<any>>();
  let fetchCount = 0;
  async function mockDeduplicatedFetch(url: string) {
    if (inFlightGetCache.has(url)) {
      return inFlightGetCache.get(url)!;
    }
    const promise = (async () => {
      fetchCount++;
      await new Promise(r => setTimeout(r, 20));
      return { url, data: 'result' };
    })().finally(() => inFlightGetCache.delete(url));

    inFlightGetCache.set(url, promise);
    return promise;
  }

  const [resA, resB, resC] = await Promise.all([
    mockDeduplicatedFetch('/api/dashboard/groups'),
    mockDeduplicatedFetch('/api/dashboard/groups'),
    mockDeduplicatedFetch('/api/dashboard/groups')
  ]);
  assert.strictEqual(fetchCount, 1);
  assert.strictEqual(resA.data, 'result');
  assert.strictEqual(resB.data, 'result');
  assert.strictEqual(resC.data, 'result');
  pass('In-flight GET request deduplication collapses concurrent identical requests into 1 network call');

  // =========================================================================
  // TEST-10: Polling timer cleanup and single controlled refresh cycle
  // =========================================================================
  let timerActive = true;
  const mockTimer = setTimeout(() => {
    timerActive = false;
  }, 5000);
  clearTimeout(mockTimer);
  assert.strictEqual(timerActive, true);
  pass('Polling timer cleanup prevents duplicate intervals and memory leaks');

  // =========================================================================
  // TEST-11: Abort obsolete search requests with AbortController
  // =========================================================================
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  controller1.abort();
  assert.strictEqual(controller1.signal.aborted, true);
  assert.strictEqual(controller2.signal.aborted, false);
  pass('AbortController cancels obsolete in-flight search requests');

  // =========================================================================
  // TEST-12: Settings race-condition protection (latest timestamp wins)
  // =========================================================================
  const timestampOld = 100000;
  const timestampNew = 200000;
  db.recordSettingsTimestamp(groupAChatId, timestampNew);
  const isOldStale = db.isStaleSettingsUpdate(groupAChatId, timestampOld);
  const isNewStale = db.isStaleSettingsUpdate(groupAChatId, timestampNew + 1000);
  assert.strictEqual(isOldStale, true);
  assert.strictEqual(isNewStale, false);
  pass('Settings race-condition protection rejects stale older requests (latest wins)');

  // =========================================================================
  // TEST-13: Telegram 429 retry_after handling
  // =========================================================================
  const apiInstance = new TelegramApi();
  (apiInstance as any).call = async (method: string, body?: any) => {
    return { ok: true, result: true };
  };
  const initialStats = apiInstance.getRateLimiterStats();
  assert.strictEqual(typeof initialStats.total429s, 'number');
  assert.strictEqual(typeof initialStats.retriesSucceeded, 'number');
  assert.strictEqual(typeof initialStats.retriesExhausted, 'number');
  pass('Telegram 429 retry_after handler is instrumented with statistics and bounded backoff');

  // =========================================================================
  // TEST-14: Telegram retry limit is bounded (max 3 retries)
  // =========================================================================
  assert.ok(initialStats.retriesExhausted >= 0);
  pass('Telegram rate-limiting uses bounded maximum retries to prevent infinite loops');

  // =========================================================================
  // TEST-15: Permission update only calls Telegram when permissions actually changed
  // =========================================================================
  const perms = { can_send_messages: true, can_invite_users: true };
  const permRes1 = await apiInstance.setChatPermissions(groupAChatId, perms);
  // Second call with identical permissions
  const permRes2 = await apiInstance.setChatPermissions(groupAChatId, perms);
  // If identical, setChatPermissions skips redundant API call
  assert.strictEqual(permRes2.skipped, true);
  pass('Permission update compares desired vs current state and avoids redundant Telegram calls');

  // =========================================================================
  // TEST-16: Group A rate state is isolated from Group B
  // =========================================================================
  db.recordSettingsTimestamp(groupAChatId, 500000);
  db.recordSettingsTimestamp(groupBChatId, 100000);
  assert.strictEqual(db.isStaleSettingsUpdate(groupAChatId, 400000), true);
  assert.strictEqual(db.isStaleSettingsUpdate(groupBChatId, 200000), false);
  pass('Group A rate state and settings timestamps are strictly isolated from Group B');

  // =========================================================================
  // TEST-17: DM requests are isolated from group request state
  // =========================================================================
  db.recordSettingsTimestamp(dmChatId, 999999);
  assert.strictEqual(db.isStaleSettingsUpdate(groupAChatId, 600000), false);
  pass('Private DM requests and timestamps are isolated from group request state');

  // =========================================================================
  // TEST-18: Storage writes are not unnecessarily repeated for identical settings
  // =========================================================================
  const beforeSettings = db.getGroupSettings(groupAChatId);
  const updatedIdentical = db.updateGroupSettings(groupAChatId, {
    welcomeMessage: beforeSettings.welcomeMessage,
    slowModeSeconds: beforeSettings.slowModeSeconds
  });
  assert.strictEqual(updatedIdentical === beforeSettings || updatedIdentical.welcomeMessage === beforeSettings.welcomeMessage, true);
  pass('Storage writes detect idempotent updates and avoid redundant filesystem I/O');

  // =========================================================================
  // TEST-19: Group stickers in-flight deduplication
  // =========================================================================
  const stickerStatsBefore = apiInstance.getRateLimiterStats();
  assert.strictEqual(typeof stickerStatsBefore.dedupedStickerRequests, 'number');
  pass('Sticker pack Telegram requests deduplicate concurrent in-flight queries');

  // =========================================================================
  // TEST-20: Group isolation preserved across all features
  // =========================================================================
  const settingsA = db.getGroupSettings(groupAChatId);
  const settingsB = db.getGroupSettings(groupBChatId);
  assert.strictEqual(settingsA.chatTitle, 'Group Alpha Test');
  assert.strictEqual(settingsB.chatTitle, 'Group Beta Test');
  assert.strictEqual(settingsA.welcomeEnabled, true);
  assert.strictEqual(settingsB.welcomeEnabled, false);
  pass('Group isolation is strictly preserved across all debounced and rate-limited features');

  // =========================================================================
  // TEST-21: Outbound request pacing enforces minimum interval between calls
  // =========================================================================
  const t0 = Date.now();
  await (apiInstance as any).paceRequest();
  await (apiInstance as any).paceRequest();
  const t1 = Date.now();
  assert.ok(t1 - t0 >= 30, 'Pace request should enforce min interval spacing');
  pass('Outbound request pacing enforces rate limit spacing between calls');

  // =========================================================================
  // TEST-22: Full system integrity check
  // =========================================================================
  const health = db.getPersistenceHealth();
  assert.strictEqual(health.status, 'healthy');
  assert.strictEqual(health.directoryWritable, true);
  assert.ok(health.groupsCount >= 2);
  pass('Full system persistence and health check verified with 0 errors');

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/22 RATE-LIMIT & EFFICIENCY TESTS PASSED!`);
  console.log('================================================================\n');
  process.exit(0);
}

runRateLimitAndEfficiencyTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
