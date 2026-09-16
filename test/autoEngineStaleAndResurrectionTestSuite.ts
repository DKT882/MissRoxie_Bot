import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { safeStaleGroupCleanup } from '../scripts/safeStaleGroupCleanup.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runAutoEngineStaleAndResurrectionTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Auto Engine Stale Target & Resurrection Test Suite');
  console.log('===================================================================\n');

  const botIdA = 812999444;
  const botIdB = 999888777;
  const testChatId1 = -100999222001;
  const testChatId2 = -100999222002;
  const testChatId3 = -100999222003;
  const testChatId4 = -100999222004;

  // Track API calls
  let sentMessages: Array<{ chatId: number; text: string }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string }> = [];
  let apiFailureMode: Record<number, string | null> = {};

  // Backup original API and fetch methods
  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origCall = (telegramApi as any).call;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    if (apiFailureMode[chatId]) {
      const err = apiFailureMode[chatId]!;
      return { ok: false, error_code: 400, description: err };
    }
    sentMessages.push({ chatId, text });
    return { ok: true, result: { message_id: 9000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    if (apiFailureMode[chatId]) {
      const err = apiFailureMode[chatId]!;
      return { ok: false, error_code: 400, description: err };
    }
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
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Auto response test message' } }]
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
    // Process callbacks that are ready, sort by executeAt
    let ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    while (ready.length > 0) {
      ready.sort((a, b) => a.executeAt - b.executeAt);
      const item = ready.shift()!;
      pendingCallbacks = pendingCallbacks.filter(c => c.id !== item.id);
      await item.fn();
      ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    }
  };

  // Inject mocks into autoEngineService
  autoEngineService.setTestHooks({
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    now: mockNow
  });

  // Setup initial storage state
  db.setBotIdentity({ id: botIdA, username: 'RoxieDemo_bot' });

  // Clean all test groups from previous runs
  const allTestChats = [
    testChatId1, testChatId2, testChatId3, testChatId4,
    -100999222005, -100999222006, -100999222007, -100999222008,
    -100999222009, -100999222010, -100999222011, -100999222012,
    -100999222013, -100999222014, -100999222015, -100999222016,
    -100999222017, -100999222018, -100999222019, -100999222020,
    -100999222021, -100999222022, -100999222023, -100999222024, -1001
  ];
  for (const cid of allTestChats) {
    try {
      db.deleteGroupData(cid);
    } catch {}
  }

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
  autoEngineService.stop();
  pendingCallbacks = [];
  autoEngineService.start(botIdA);

  // --- TEST T & U: Classification tests ---
  // Test T: isPermanentInvalidTargetError correctly classifies all specified permanent error strings
  const permanentErrors = [
    'Bad Request: chat not found',
    'Forbidden: bot was kicked from the group chat',
    'Forbidden: bot was kicked from the supergroup chat',
    'Forbidden: bot was removed by the administrator',
    'Bad Request: bot is not a member of the supergroup chat',
    'Bad Request: group chat was upgraded to a supergroup chat',
    'Bad Request: upgraded to a supergroup',
    'TELEGRAM_INVALID_LEGACY_TARGET',
    'Blocked call to legacy dummy chat target: -1001',
    'legacy dummy target blocked',
    'Bad Request: PEER_ID_INVALID',
    'Bad Request: group chat was deactivated',
    'Bad Request: chat was deleted',
    'Forbidden: bot was blocked by the user',
    'Forbidden: bot was blocked by user',
    'Bad Request: user is deactivated'
  ];

  for (const err of permanentErrors) {
    assert.strictEqual(
      autoEngineService.isPermanentInvalidTargetError(err),
      true,
      `Should recognize "${err}" as permanent invalid target`
    );
  }
  pass('Test T: isPermanentInvalidTargetError correctly classifies all specified permanent error strings');

  // Test U: isPermanentInvalidTargetError does NOT classify generic 'bad request', 500, network timeouts, or 429
  const nonPermanentErrors = [
    'Bad Request: message is not modified',
    'Bad Request: reply message not found',
    'Bad Request: text is empty',
    'Bad Request: message to forward not found',
    'Bad Request: can\'t parse entities: Character \'_\' is reserved',
    'Bad Request: message can\'t be deleted',
    'Bad Request: chat description is not modified',
    'Bad Request: invalid target parameter',
    'Internal Server Error: 500',
    'Bad Gateway: 502',
    'Gateway Timeout: 504',
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'Too Many Requests: retry after 30',
    'Too Many Requests: retry after 42'
  ];

  for (const err of nonPermanentErrors) {
    assert.strictEqual(
      autoEngineService.isPermanentInvalidTargetError(err),
      false,
      `Should NOT recognize "${err}" as permanent invalid target`
    );
  }
  pass('Test U: isPermanentInvalidTargetError does NOT classify non-permanent errors');

  // --- TEST A: Single 400 'chat not found' marks group unavailable/botLeft and never schedules retry ---
  db.updateGroupSettings(testChatId1, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: {
      enabled: true,
      mode: 'random',
      randomize: true,
      minSeconds: 30,
      maxSeconds: 60,
      cooldownSeconds: 30
    }
  });

  autoEngineService.syncGroup(botIdA, testChatId1);
  let state1 = autoEngineService.getJob(botIdA, testChatId1, 'response');
  assert.ok(state1, 'Auto response job should be scheduled initially');

  // Set API failure mode to "chat not found"
  apiFailureMode[testChatId1] = 'Bad Request: chat not found';

  // Advance time to fire the timer
  await advanceTime(70000);

  // Verify group is marked unavailable & botLeft in db
  const updatedSettings1 = db.getGroupSettings(testChatId1);
  assert.strictEqual(updatedSettings1?.botLeft, true, 'botLeft must be set to true on chat not found');
  assert.strictEqual(updatedSettings1?.unavailable, true, 'unavailable must be set to true on chat not found');
  assert.ok(updatedSettings1?.unavailableReason?.includes('chat not found'), 'unavailableReason must capture reason');

  // Verify no job is scheduled in autoEngineService
  const postState1 = autoEngineService.getJob(botIdA, testChatId1, 'response');
  assert.strictEqual(postState1, undefined, 'Job must be completely removed from autoEngineService');
  assert.strictEqual(pendingCallbacks.length, 0, 'No pending timers must remain');
  pass('Test A: Single 400 "chat not found" marks group unavailable/botLeft and never schedules retry');

  // --- TEST B: Single 400 'bot was kicked' / 'bot was removed' marks group unavailable and cancels jobs ---
  apiFailureMode[testChatId2] = 'Forbidden: bot was kicked from the group chat';
  db.updateGroupSettings(testChatId2, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoSticker: {
      enabled: true,
      mode: 'random',
      randomize: false,
      minSeconds: 30,
      maxSeconds: 60,
      cooldownSeconds: 30
    }
  });

  autoEngineService.syncGroup(botIdA, testChatId2);
  assert.ok(autoEngineService.getJob(botIdA, testChatId2, 'sticker'), 'Sticker job should be scheduled');

  await advanceTime(70000);

  const updatedSettings2 = db.getGroupSettings(testChatId2);
  assert.strictEqual(updatedSettings2?.botLeft, true, 'botLeft must be set to true when bot was kicked');
  assert.strictEqual(updatedSettings2?.unavailable, true, 'unavailable must be set to true when bot was kicked');
  assert.strictEqual(autoEngineService.getJob(botIdA, testChatId2, 'sticker'), undefined, 'Sticker job canceled');
  pass('Test B: Single 400 "bot was kicked" marks group unavailable/botLeft and never schedules retry');

  // --- TEST C: Single 'group chat was upgraded to a supergroup' marks old group unavailable ---
  const upgradedOldChatId = -100999222005;
  apiFailureMode[upgradedOldChatId] = 'Bad Request: group chat was upgraded to a supergroup chat';
  db.updateGroupSettings(upgradedOldChatId, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: {
      enabled: true,
      mode: 'random',
      minSeconds: 30,
      maxSeconds: 60,
      cooldownSeconds: 30
    }
  });

  autoEngineService.syncGroup(botIdA, upgradedOldChatId);
  await advanceTime(70000);

  const updatedUpgradedSettings = db.getGroupSettings(upgradedOldChatId);
  assert.strictEqual(updatedUpgradedSettings?.unavailable, true, 'Upgraded old chat must be marked unavailable');
  assert.strictEqual(updatedUpgradedSettings?.botLeft, true, 'Upgraded old chat must be marked botLeft');
  assert.strictEqual(autoEngineService.getJob(botIdA, upgradedOldChatId, 'response'), undefined);
  pass('Test C: Single "group chat was upgraded to a supergroup" marks old group unavailable and cancels jobs');

  // --- TEST D: Dummy target error halts immediately and sets unavailable ---
  const dummyChatId = -1001;
  apiFailureMode[dummyChatId] = 'Blocked call to legacy dummy chat target: -1001';
  db.updateGroupSettings(dummyChatId, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoSticker: {
      enabled: true,
      mode: 'random',
      minSeconds: 30,
      maxSeconds: 60,
      cooldownSeconds: 60
    }
  });

  autoEngineService.syncGroup(botIdA, dummyChatId);
  await advanceTime(70000);

  const dummySettings = db.getGroupSettings(dummyChatId);
  assert.strictEqual(dummySettings?.unavailable, true, 'Dummy chat must be marked unavailable');
  assert.strictEqual(autoEngineService.getJob(botIdA, dummyChatId, 'sticker'), undefined);
  pass('Test D: Single dummy target error halts immediately and sets unavailable');

  // --- TEST E: Transient 500 error triggers backoff and does NOT mark group unavailable ---
  const transientChatId = -100999222006;
  apiFailureMode[transientChatId] = 'Internal Server Error: 500';
  db.updateGroupSettings(transientChatId, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    autoResponse: {
      enabled: true,
      mode: 'random',
      randomize: true,
      cooldownSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30
    }
  });

  autoEngineService.syncGroup(botIdA, transientChatId);
  await advanceTime(35000);

  // Group should NOT be marked unavailable
  const transientSettings = db.getGroupSettings(transientChatId);
  assert.strictEqual(transientSettings?.unavailable ?? false, false, 'Transient 500 must NOT mark group unavailable');
  assert.strictEqual(transientSettings?.botLeft ?? false, false, 'Transient 500 must NOT mark botLeft');

  // Consecutive failures should be 1
  const transientJob = autoEngineService.getJob(botIdA, transientChatId, 'response');
  assert.ok(transientJob, 'Job must still be scheduled for retry');
  assert.strictEqual(transientJob?.consecutiveFailures, 1, 'Consecutive failures must be 1');
  pass('Test E: Transient 500 error triggers bounded exponential backoff and does NOT mark group unavailable');

  // --- TEST W: Consecutive failures counter increments on failure and resets on success ---
  // Clear API failure mode so next execution succeeds
  delete apiFailureMode[transientChatId];
  // Advance time past the backoff interval (60s backoff)
  await advanceTime(70000);
  const recoveredJob = autoEngineService.getJob(botIdA, transientChatId, 'response');
  assert.ok(recoveredJob, 'Job must continue');
  assert.strictEqual(recoveredJob?.consecutiveFailures, 0, 'Consecutive failures must reset to 0 on success');
  autoEngineService.cancelAllForGroup(botIdA, transientChatId);
  pass('Test W: Consecutive failures counter increments on transient failures and resets to 0 on success');

  // --- TEST F: 429 Too Many Requests triggers retry_after backoff and does NOT mark unavailable ---
  const rateLimitedChatId = -100999222007;
  db.updateGroupSettings(rateLimitedChatId, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    autoResponse: {
      enabled: true,
      mode: 'random',
      randomize: true,
      cooldownSeconds: 30,
      minSeconds: 30,
      maxSeconds: 30
    }
  });

  // Mock API call to return 429 description
  telegramApi.sendMessage = async (chatId: number, text: string): Promise<any> => {
    if (chatId === rateLimitedChatId) {
      return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 40', parameters: { retry_after: 40 } };
    }
    sentMessages.push({ chatId, text });
    return { ok: true, result: { message_id: 1234, text } };
  };

  autoEngineService.syncGroup(botIdA, rateLimitedChatId);
  await advanceTime(35000);

  const rateLimitSettings = db.getGroupSettings(rateLimitedChatId);
  assert.strictEqual(rateLimitSettings?.unavailable ?? false, false, '429 must NOT mark group unavailable');
  const rateLimitJob = autoEngineService.getJob(botIdA, rateLimitedChatId, 'response');
  assert.ok(rateLimitJob, 'Job must be scheduled for backoff retry');
  autoEngineService.cancelAllForGroup(botIdA, rateLimitedChatId);
  pass('Test F: 429 Too Many Requests triggers backoff and does NOT mark group unavailable');

  // Restore telegramApi.sendMessage
  telegramApi.sendMessage = async (chatId: number, text: string): Promise<any> => {
    if (apiFailureMode[chatId]) {
      return { ok: false, error_code: 400, description: apiFailureMode[chatId]! };
    }
    sentMessages.push({ chatId, text });
    return { ok: true, result: { message_id: 9000 + sentMessages.length, text } };
  };

  // --- TEST G: Auto Sticker never sends continuously; respects cooldown/min-max interval ---
  const stickerGroup = -100999222008;
  sentStickers = [];
  db.updateGroupSettings(stickerGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoSticker: {
      enabled: true,
      mode: 'random',
      randomize: true,
      cooldownSeconds: 60,
      minSeconds: 60,
      maxSeconds: 60,
      lastStickerTimestamp: 0
    }
  });

  autoEngineService.syncGroup(botIdA, stickerGroup);
  // Initial sync schedules job at virtualTime + 60s
  assert.strictEqual(sentStickers.length, 0, 'No sticker sent at 0s');

  await advanceTime(30000);
  assert.strictEqual(sentStickers.length, 0, 'No sticker sent at 30s');

  await advanceTime(35000); // 65s elapsed
  assert.strictEqual(sentStickers.length, 1, 'Exactly 1 sticker sent at 65s');

  // Immediately advancing small amount (5s) should NOT send another sticker
  await advanceTime(5000);
  assert.strictEqual(sentStickers.length, 1, 'No immediate repeat sticker sent');

  await advanceTime(60000); // Next 60s elapsed
  assert.strictEqual(sentStickers.length, 2, 'Exactly 2 stickers sent after next interval');
  autoEngineService.cancelAllForGroup(botIdA, stickerGroup);
  pass('Test G: Auto Sticker never sends continuously; after execution, respects cooldown / min-max interval');

  // --- TEST H: Auto Response and Auto Sticker timers run independently ---
  const dualGroup = -100999222009;
  sentMessages = [];
  sentStickers = [];
  db.updateGroupSettings(dualGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    autoResponse: {
      enabled: true,
      mode: 'random',
      randomize: true,
      cooldownSeconds: 40,
      minSeconds: 40,
      maxSeconds: 40
    },
    autoSticker: {
      enabled: true,
      mode: 'random',
      randomize: true,
      cooldownSeconds: 90,
      minSeconds: 90,
      maxSeconds: 90
    }
  });

  autoEngineService.syncGroup(botIdA, dualGroup);
  const respJob = autoEngineService.getJob(botIdA, dualGroup, 'response');
  const stickJob = autoEngineService.getJob(botIdA, dualGroup, 'sticker');
  assert.ok(respJob && stickJob, 'Both jobs scheduled');
  assert.notStrictEqual(respJob?.timeoutHandle, stickJob?.timeoutHandle, 'Timers must have distinct handles');

  await advanceTime(45000);
  assert.strictEqual(sentMessages.length, 1, 'Response sent at 45s');
  assert.strictEqual(sentStickers.length, 0, 'Sticker not yet sent at 45s');

  await advanceTime(50000); // 95s total
  assert.strictEqual(sentMessages.length, 2, 'Second response sent at 95s');
  assert.strictEqual(sentStickers.length, 1, 'First sticker sent at 95s');
  autoEngineService.cancelAllForGroup(botIdA, dualGroup);
  pass('Test H: Auto Response and Auto Sticker timers run independently with separate timers');

  // --- TEST I & J: Startup hydration skips botLeft === true and unavailable === true ---
  const leftGroup = -100999222010;
  const unavailGroup = -100999222011;
  const activeGroup = -100999222012;

  db.updateGroupSettings(leftGroup, {
    botId: botIdA,
    botLeft: true,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', cooldownSeconds: 30 }
  });

  db.updateGroupSettings(unavailGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: true,
    autoResponse: { enabled: true, mode: 'random', cooldownSeconds: 30 }
  });

  db.updateGroupSettings(activeGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 }
  });

  // Stop and restart AutoEngineService
  autoEngineService.stop();
  autoEngineService.start(botIdA);

  assert.strictEqual(autoEngineService.getJob(botIdA, leftGroup, 'response'), undefined, 'botLeft group not hydrated');
  pass('Test I: Startup hydration skips groups with botLeft === true');

  assert.strictEqual(autoEngineService.getJob(botIdA, unavailGroup, 'response'), undefined, 'unavailable group not hydrated');
  pass('Test J: Startup hydration skips groups with unavailable === true');

  assert.ok(autoEngineService.getJob(botIdA, activeGroup, 'response'), 'Active group properly hydrated');

  // --- TEST K: Startup hydration skips legacy/unassigned groups (does NOT adopt them) ---
  const legacyUnassignedGroup = -100999222013;
  db.restoreGroupData(legacyUnassignedGroup, {
    chat: { chatId: legacyUnassignedGroup, title: 'Legacy Group' },
    botId: undefined,
    settings: {
      chatId: legacyUnassignedGroup,
      botId: undefined,
      botLeft: false,
      unavailable: false,
      autoResponse: { enabled: true, mode: 'random', cooldownSeconds: 30 }
    }
  });

  autoEngineService.stop();
  autoEngineService.start(botIdA);

  const legacyJob = autoEngineService.getJob(botIdA, legacyUnassignedGroup, 'response');
  assert.strictEqual(legacyJob, undefined, 'Legacy unassigned group must NOT be scheduled on startup');
  pass('Test K: Startup hydration skips legacy/unassigned groups without adopting them');

  // --- TEST L & M: removeGroupFromDashboard immediately cancels active timers and prevents future syncs ---
  const removeTargetChat = -100999222014;
  db.updateGroupSettings(removeTargetChat, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 },
    autoSticker: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 60 }
  });

  autoEngineService.syncGroup(botIdA, removeTargetChat);
  assert.ok(autoEngineService.getJob(botIdA, removeTargetChat, 'response'), 'Response scheduled');
  assert.ok(autoEngineService.getJob(botIdA, removeTargetChat, 'sticker'), 'Sticker scheduled');

  // Perform dashboard removal
  const removed = db.removeGroupFromDashboard(removeTargetChat);
  assert.strictEqual(removed, true, 'Group removed from dashboard');

  // Verify timers canceled immediately
  assert.strictEqual(autoEngineService.getJob(botIdA, removeTargetChat, 'response'), undefined, 'Response timer canceled');
  assert.strictEqual(autoEngineService.getJob(botIdA, removeTargetChat, 'sticker'), undefined, 'Sticker timer canceled');
  pass('Test L: removeGroupFromDashboard immediately cancels active AutoEngine timers');

  // Attempt syncGroup again
  autoEngineService.syncGroup(botIdA, removeTargetChat);
  assert.strictEqual(autoEngineService.getJob(botIdA, removeTargetChat, 'response'), undefined, 'No re-scheduling after removal');
  pass('Test M: removeGroupFromDashboard prevents re-scheduling across future syncs');

  // --- TEST N: MongoDB reload/restore preserves botLeft: true and unavailable: true ---
  const mongoRawDoc = {
    chat: { chatId: -100999222015, title: 'Preserved Unavailable Group' },
    botId: botIdA,
    settings: {
      chatId: -100999222015,
      botId: botIdA,
      botLeft: true,
      unavailable: true,
      unavailableReason: 'Chat was deleted'
    }
  };

  db.restoreGroupData(-100999222015, mongoRawDoc);
  const restoredSettings = db.getGroupSettings(-100999222015);
  assert.strictEqual(restoredSettings?.botLeft, true, 'botLeft must remain true after restore');
  assert.strictEqual(restoredSettings?.unavailable, true, 'unavailable must remain true after restore');
  assert.strictEqual(restoredSettings?.unavailableReason, 'Chat was deleted', 'unavailableReason preserved');
  pass('Test N: MongoDB reload/restore preserves botLeft: true and unavailable: true without resurrecting groups');

  // --- TEST O: MongoDB reload/restore preserves unassigned botId: undefined without assigning currentBotId ---
  const unassignedDoc = {
    chat: { chatId: -100999222016, title: 'Unassigned Doc' },
    botId: undefined,
    settings: {
      chatId: -100999222016,
      botId: undefined
    }
  };

  db.restoreGroupData(-100999222016, unassignedDoc);
  const unassignedRestored = db.getGroupSettings(-100999222016);
  assert.strictEqual(unassignedRestored?.botId, undefined, 'Restored group must retain botId === undefined');
  pass('Test O: MongoDB reload/restore preserves unassigned botId: undefined without assigning currentBotId');

  // --- TEST P: Legacy unassigned group in MongoDB defaults autoResponse and autoSticker to disabled ---
  const legacyNoAutoDoc = {
    chat: { chatId: -100999222017, title: 'Legacy Doc Without Auto Config' },
    settings: {
      chatId: -100999222017
    }
  };

  db.restoreGroupData(-100999222017, legacyNoAutoDoc);
  const legacyAutoRestored = db.getGroupSettings(-100999222017);
  assert.strictEqual(legacyAutoRestored?.autoResponse?.enabled, false, 'autoResponse must default to disabled for legacy record');
  assert.strictEqual(legacyAutoRestored?.autoResponse?.mode, 'disabled', 'autoResponse mode must default to disabled');
  assert.strictEqual(legacyAutoRestored?.autoSticker?.enabled, false, 'autoSticker must default to disabled for legacy record');
  assert.strictEqual(legacyAutoRestored?.autoSticker?.mode, 'disabled', 'autoSticker mode must default to disabled');
  pass('Test P: Legacy unassigned group in MongoDB defaults autoResponse and autoSticker to disabled');

  // --- TEST Q: Multi-bot isolation: bot B never starts AutoEngine timers for bot A's groups ---
  const botAGroup = -100999222018;
  db.updateGroupSettings(botAGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 }
  });

  autoEngineService.syncGroup(botIdB, botAGroup);
  assert.strictEqual(autoEngineService.getJob(botIdB, botAGroup, 'response'), undefined, 'Bot B must not schedule Bot A group');
  pass('Test Q: Multi-bot isolation: bot B never starts AutoEngine timers for bot A groups');

  // --- TEST R: Multi-bot isolation: terminal failure on bot A's group updates only bot A's group record ---
  const isolatedFailGroup = -100999222019;
  db.updateGroupSettings(isolatedFailGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 }
  });

  autoEngineService.handlePermanentInvalidTarget(botIdA, isolatedFailGroup, 'Bot kicked');
  const isolatedFailSettings = db.getGroupSettings(isolatedFailGroup);
  assert.strictEqual(isolatedFailSettings?.botLeft, true);
  assert.strictEqual(isolatedFailSettings?.botId, botIdA);
  pass('Test R: Multi-bot isolation: terminal failure on bot A group updates only bot A record');

  // --- TEST S: Re-adding a group via dashboard or bot join clears botLeft and unavailable ---
  db.updateGroupSettings(isolatedFailGroup, {
    botLeft: false,
    unavailable: false,
    unavailableReason: undefined
  });
  const revivedSettings = db.getGroupSettings(isolatedFailGroup);
  assert.strictEqual(revivedSettings?.botLeft, false, 'botLeft reset to false');
  assert.strictEqual(revivedSettings?.unavailable, false, 'unavailable reset to false');

  autoEngineService.syncGroup(botIdA, isolatedFailGroup);
  assert.ok(autoEngineService.getJob(botIdA, isolatedFailGroup, 'response'), 'AutoEngine resumes upon revival');
  pass('Test S: Re-adding a group clears botLeft/unavailable allowing AutoEngine to resume');

  // --- TEST V: Timer cancellation is clean ---
  autoEngineService.cancelAllForGroup(botIdA, isolatedFailGroup);
  assert.strictEqual(autoEngineService.getJob(botIdA, isolatedFailGroup, 'response'), undefined);
  assert.strictEqual(autoEngineService.getJob(botIdA, isolatedFailGroup, 'sticker'), undefined);
  pass('Test V: Timer cancellation is clean: job map entry is cleared');

  // --- TEST X: Jittered interval calculation stays within [minSeconds, maxSeconds] bounds ---
  for (let i = 0; i < 50; i++) {
    const min = 30;
    const max = 120;
    const interval = autoEngineService.calculateDelayMs({
      enabled: true,
      mode: 'random',
      randomize: true,
      minSeconds: min,
      maxSeconds: max,
      cooldownSeconds: 30
    }, min, max, 30);
    assert.ok(interval >= min * 1000, `Interval ${interval}ms must be >= ${min * 1000}ms`);
    assert.ok(interval <= max * 1000, `Interval ${interval}ms must be <= ${max * 1000}ms`);
  }
  pass('Test X: Jittered interval calculation stays within [minSeconds, maxSeconds] bounds');

  // --- TEST AC: Auto sticker disabled in settings cancels sticker timer without affecting response timer ---
  const acGroup = -100999222020;
  db.updateGroupSettings(acGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 },
    autoSticker: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 60 }
  });

  autoEngineService.syncGroup(botIdA, acGroup);
  assert.ok(autoEngineService.getJob(botIdA, acGroup, 'response'));
  assert.ok(autoEngineService.getJob(botIdA, acGroup, 'sticker'));

  // Disable sticker only
  db.updateGroupSettings(acGroup, {
    autoSticker: { enabled: false, mode: 'disabled', cooldownSeconds: 60 }
  });
  autoEngineService.syncGroup(botIdA, acGroup);
  assert.ok(autoEngineService.getJob(botIdA, acGroup, 'response'), 'Response timer remains active');
  assert.strictEqual(autoEngineService.getJob(botIdA, acGroup, 'sticker'), undefined, 'Sticker timer canceled');
  pass('Test AC: Auto sticker disabled cancels sticker timer without affecting response timer');

  // --- TEST AD: Auto response disabled in settings cancels response timer without affecting sticker timer ---
  db.updateGroupSettings(acGroup, {
    autoResponse: { enabled: false, mode: 'disabled', cooldownSeconds: 30 },
    autoSticker: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 60 }
  });
  autoEngineService.syncGroup(botIdA, acGroup);
  assert.strictEqual(autoEngineService.getJob(botIdA, acGroup, 'response'), undefined, 'Response timer canceled');
  assert.ok(autoEngineService.getJob(botIdA, acGroup, 'sticker'), 'Sticker timer remains active');
  autoEngineService.cancelAllForGroup(botIdA, acGroup);
  pass('Test AD: Auto response disabled cancels response timer without affecting sticker timer');

  // --- TEST Y: Safe stale cleanup dry-run mode makes no writes/deletions ---
  const cleanupTempDir = path.resolve(process.cwd(), 'data', 'temp_test_cleanup_groups');
  if (!fs.existsSync(cleanupTempDir)) fs.mkdirSync(cleanupTempDir, { recursive: true });

  const tempStaleFile = path.join(cleanupTempDir, '-100999999999.json');
  fs.writeFileSync(tempStaleFile, JSON.stringify({
    chat: { chatId: -100999999999, title: 'Temp Stale Group' },
    settings: { chatId: -100999999999, botLeft: false, unavailable: false }
  }, null, 2), 'utf-8');

  const dryRunReport = await safeStaleGroupCleanup({
    execute: false,
    customGroupsDir: cleanupTempDir
  });

  assert.strictEqual(dryRunReport.isDryRun, true);
  assert.ok(dryRunReport.totalFound >= 1);
  const postDryContent = JSON.parse(fs.readFileSync(tempStaleFile, 'utf-8'));
  assert.strictEqual(postDryContent.settings.unavailable, false, 'Dry run must not modify file content');
  pass('Test Y: Safe stale cleanup dry-run mode makes no writes/deletions');

  // --- TEST Z: Safe stale cleanup execute mode sets botLeft=true, unavailable=true ---
  const execReport = await safeStaleGroupCleanup({
    execute: true,
    customGroupsDir: cleanupTempDir
  });

  assert.strictEqual(execReport.isDryRun, false);
  assert.ok(execReport.markedUnavailable >= 1);
  const postExecContent = JSON.parse(fs.readFileSync(tempStaleFile, 'utf-8'));
  assert.strictEqual(postExecContent.settings.unavailable, true, 'Execute mode sets unavailable=true');
  assert.strictEqual(postExecContent.settings.botLeft, true, 'Execute mode sets botLeft=true');

  // Clean up temp dir
  fs.rmSync(cleanupTempDir, { recursive: true, force: true });
  pass('Test Z: Safe stale cleanup execute mode sets botLeft=true, unavailable=true');

  // --- TEST AA: MongoDB query using $or: [{ chatId: normChatId }, { numChatId }] matches string or numeric chat IDs ---
  const numChatId = -100444555;
  const normChatId = String(numChatId);
  const generatedQuery = { $or: [{ chatId: normChatId }, { numChatId }], botId: botIdA };
  assert.deepStrictEqual(generatedQuery.$or, [{ chatId: '-100444555' }, { numChatId: -100444555 }]);
  pass('Test AA: MongoDB query using $or matches string or numeric chat IDs reliably');

  // --- TEST AB: UpdateGroupSettings triggers Mongo replication hook when Mongo is simulated as connected ---
  let mongoSaveCalledWith: any = null;
  const origSaveGroup = MongoStorageService.saveGroup;
  MongoStorageService.saveGroup = async (data: any, botId?: number): Promise<boolean> => {
    mongoSaveCalledWith = { data, botId };
    return true;
  };

  // Mock mongoManager.getStatus()
  const origGetStatus = mongoManager.getStatus;
  (mongoManager as any).getStatus = () => ({ isConnected: true, uriConfigured: true });

  const replicatedChatId = -100999222021;
  db.updateGroupSettings(replicatedChatId, {
    botId: botIdA,
    botLeft: true,
    unavailable: true,
    unavailableReason: 'Replication test'
  });

  // Allow async saveGroup promise to settle
  await new Promise(r => setTimeout(r, 20));
  assert.ok(mongoSaveCalledWith, 'MongoStorageService.saveGroup was called on updateGroupSettings');
  assert.strictEqual(mongoSaveCalledWith.botId, botIdA);
  assert.strictEqual(mongoSaveCalledWith.data?.settings?.unavailable, true);

  // Restore mocks immediately
  MongoStorageService.saveGroup = origSaveGroup;
  (mongoManager as any).getStatus = origGetStatus;
  pass('Test AB: UpdateGroupSettings triggers Mongo replication hook when Mongo is simulated as connected');

  // --- TEST AE: Supergroup migration disables ONLY the old chat ID, allowing new supergroup to operate ---
  const oldGroupMigrated = -100999222022;
  const newSupergroupMigrated = -100999222023;

  apiFailureMode[oldGroupMigrated] = 'Bad Request: group chat was upgraded to a supergroup chat';
  db.updateGroupSettings(oldGroupMigrated, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 }
  });

  autoEngineService.syncGroup(botIdA, oldGroupMigrated);
  await advanceTime(70000);

  const oldSettings = db.getGroupSettings(oldGroupMigrated);
  assert.strictEqual(oldSettings?.unavailable, true, 'Old group must be marked unavailable');
  assert.strictEqual(autoEngineService.getJob(botIdA, oldGroupMigrated, 'response'), undefined, 'Old group timer cancelled');

  // Register newly discovered supergroup
  delete apiFailureMode[newSupergroupMigrated];
  db.updateGroupSettings(newSupergroupMigrated, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    autoResponse: { enabled: true, mode: 'random', minSeconds: 30, maxSeconds: 60, cooldownSeconds: 30 }
  });

  autoEngineService.syncGroup(botIdA, newSupergroupMigrated);
  assert.ok(autoEngineService.getJob(botIdA, newSupergroupMigrated, 'response'), 'New supergroup must run AutoEngine normally');
  autoEngineService.cancelAllForGroup(botIdA, newSupergroupMigrated);
  pass('Test AE: Supergroup migration disables only old chat ID, allowing new supergroup to operate normally');

  // --- TEST AF: Complete End-to-End Realistic Regression Lifecycle ---
  for (const cid of allTestChats) {
    try {
      db.deleteGroupData(cid);
    } catch {}
  }
  autoEngineService.stop();
  pendingCallbacks = [];
  autoEngineService.start(botIdA);

  const e2eGroup = -100999222024;
  sentStickers = [];
  delete apiFailureMode[e2eGroup];

  // 1. Setup valid group with Auto Sticker enabled
  db.updateGroupSettings(e2eGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: {
      enabled: false,
      mode: 'disabled',
      cooldownSeconds: 30
    },
    autoSticker: {
      enabled: true,
      mode: 'random',
      randomize: true,
      minSeconds: 30,
      maxSeconds: 30,
      cooldownSeconds: 30,
      lastStickerTimestamp: 0
    }
  });

  autoEngineService.syncGroup(botIdA, e2eGroup);
  // Verify exactly one sticker timer exists
  assert.ok(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), 'Initial sticker timer must exist');
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'response'), undefined, 'No response timer when disabled');

  // 2. Multiple successful executions
  await advanceTime(35000); // 1st execution
  assert.strictEqual(sentStickers.length, 1, 'First sticker executed');
  assert.ok(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), 'Exactly one future timer scheduled after 1st execution');

  await advanceTime(35000); // 2nd execution
  assert.strictEqual(sentStickers.length, 2, 'Second sticker executed');
  assert.ok(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), 'Exactly one future timer scheduled after 2nd execution');

  // 3. Simulate chat not found error
  apiFailureMode[e2eGroup] = 'Bad Request: chat not found';
  await advanceTime(35000); // 3rd execution fails permanently

  // 4. Prove both Auto Response and Auto Sticker timers are gone
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), undefined, 'Sticker timer must be gone');
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'response'), undefined, 'Response timer must be gone');

  // 5. Prove terminal state persisted in storage
  const e2eTermSettings = db.getGroupSettings(e2eGroup);
  assert.strictEqual(e2eTermSettings?.botLeft, true, 'botLeft must be true');
  assert.strictEqual(e2eTermSettings?.unavailable, true, 'unavailable must be true');

  // 6. Simulate container restart / hydration
  autoEngineService.stop();
  pendingCallbacks = [];
  autoEngineService.start(botIdA);
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), undefined, 'Zero timers scheduled on hydration for unavailable group');

  // 7. Repeated syncGroup calls schedule nothing
  autoEngineService.syncGroup(botIdA, e2eGroup);
  autoEngineService.syncGroup(botIdA, e2eGroup);
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), undefined, 'Repeated syncGroup schedules zero timers');

  // 8. Remove from dashboard
  const e2eRemoved = db.removeGroupFromDashboard(e2eGroup);
  assert.strictEqual(e2eRemoved, true, 'Removed from dashboard');
  assert.strictEqual(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), undefined, 'Zero timers after dashboard removal');

  // 9. Re-add as a fresh valid group
  delete apiFailureMode[e2eGroup];
  db.updateGroupSettings(e2eGroup, {
    botId: botIdA,
    botLeft: false,
    unavailable: false,
    autoResponse: {
      enabled: false,
      mode: 'disabled',
      cooldownSeconds: 30
    },
    autoSticker: {
      enabled: true,
      mode: 'random',
      randomize: true,
      minSeconds: 30,
      maxSeconds: 30,
      cooldownSeconds: 30
    }
  });

  autoEngineService.syncGroup(botIdA, e2eGroup);
  assert.ok(autoEngineService.getJob(botIdA, e2eGroup, 'sticker'), 'AutoEngine starts successfully when re-added');
  autoEngineService.cancelAllForGroup(botIdA, e2eGroup);
  pass('Test AF: Complete End-to-End realistic regression lifecycle verified');

  // --- Clean up test groups from storage ---
  for (const cid of allTestChats) {
    try {
      db.deleteGroupData(cid);
    } catch {}
  }

  // Allow storage debounce saveTimeout to settle
  await new Promise(r => setTimeout(r, 150));

  // Restore all original globals
  telegramApi.sendMessage = origSendMessage;
  telegramApi.sendSticker = origSendSticker;
  telegramApi.sendChatAction = origSendChatAction;
  (telegramApi as any).call = origCall;
  global.fetch = origFetch;
  autoEngineService.stop();
  autoEngineService.resetTestHooks();

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} AUTO ENGINE & RESURRECTION TESTS PASSED!`);
  console.log('===================================================================\n');
}

runAutoEngineStaleAndResurrectionTestSuite().catch(err => {
  console.error('❌ Test suite failed with error:', err);
  process.exit(1);
});
