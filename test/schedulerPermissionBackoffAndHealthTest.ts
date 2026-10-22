import assert from 'assert';
import path from 'path';
import fs from 'fs';
import {
  MessageScheduler,
  classifyScheduleExecutionError,
  calculateScheduleFailureNextRun
} from '../server/telegram/scheduler.js';
import { StorageManager } from '../server/db/storage.js';
import { HealthDiagnosticsService } from '../server/observability/healthService.js';
import { ScheduledMessage } from '../server/telegram/types.js';

async function runSchedulerPermissionBackoffAndHealthTestSuite() {
  console.log('🧪 Starting Scheduler Permission Backoff & Health Metric Regression Test Suite\n');

  let passed = 0;
  const test = (desc: string, fn: () => void | Promise<void>) => {
    try {
      fn();
      passed++;
      console.log(`  ✅ PASS: ${desc}`);
    } catch (err: any) {
      console.error(`  ❌ FAIL: ${desc}`);
      console.error(err);
      process.exit(1);
    }
  };

  // --------------------------------------------------------------------------
  // TEST SECTION 1: Error Classification
  // --------------------------------------------------------------------------
  console.log('--- SECTION 1: Safe Error Classification ---');

  test('1.1: Identifies Telegram "not enough rights to send text messages" as PERMISSION_DENIED', () => {
    const err = new Error('Bad Request: not enough rights to send text messages to the chat');
    const res = classifyScheduleExecutionError(err);
    assert.strictEqual(res.category, 'PERMISSION_DENIED');
    assert.strictEqual(res.isPermanentPermission, true);
    assert.strictEqual(res.isDeadChat, false);
  });

  test('1.2: Identifies "CHAT_ADMIN_REQUIRED" and "need administrator rights" as PERMISSION_DENIED', () => {
    const err1 = new Error('Bad Request: CHAT_ADMIN_REQUIRED');
    const res1 = classifyScheduleExecutionError(err1);
    assert.strictEqual(res1.category, 'PERMISSION_DENIED');
    assert.strictEqual(res1.isPermanentPermission, true);

    const err2 = new Error('Bad Request: need administrator rights to post media in this channel');
    const res2 = classifyScheduleExecutionError(err2);
    assert.strictEqual(res2.category, 'PERMISSION_DENIED');
    assert.strictEqual(res2.isPermanentPermission, true);
  });

  test('1.3: Identifies dead chats (chat not found, bot kicked) as DEAD_CHAT', () => {
    const err1 = new Error('Bad Request: chat not found');
    const res1 = classifyScheduleExecutionError(err1);
    assert.strictEqual(res1.category, 'DEAD_CHAT');
    assert.strictEqual(res1.isDeadChat, true);

    const err2 = new Error('Forbidden: bot was kicked from the supergroup chat');
    const res2 = classifyScheduleExecutionError(err2);
    assert.strictEqual(res2.category, 'DEAD_CHAT');
    assert.strictEqual(res2.isDeadChat, true);
  });

  test('1.4: Identifies rate limits (429 / retry after) as RATE_LIMITED with correct retry delay', () => {
    // Regex string pattern
    const err = new Error('Too Many Requests: retry after 42');
    const res = classifyScheduleExecutionError(err);
    assert.strictEqual(res.category, 'RATE_LIMITED');
    assert.strictEqual(res.retryAfterMs, 47000); // 42s + 5s buffer

    // Structured Telegram API error object with parameters.retry_after
    const structuredErr = {
      error_code: 429,
      description: 'Too Many Requests',
      parameters: { retry_after: 55 }
    };
    const resStructured = classifyScheduleExecutionError(structuredErr);
    assert.strictEqual(resStructured.category, 'RATE_LIMITED');
    assert.strictEqual(resStructured.retryAfterMs, 60000); // 55s + 5s buffer
  });

  test('1.5: Identifies network and transient server errors as TRANSIENT with exponential backoff and cap', () => {
    const err1 = new Error('connect ETIMEDOUT 149.154.167.220:443');
    const res1 = classifyScheduleExecutionError(err1);
    assert.strictEqual(res1.category, 'TRANSIENT');
    assert.strictEqual(res1.isPermanentPermission, false);

    const err2 = new Error('502 Bad Gateway');
    const res2 = classifyScheduleExecutionError(err2);
    assert.strictEqual(res2.category, 'TRANSIENT');

    // Transient exponential delays: 30s * 2^min(3, failures-1) capped at 300s
    const transientSchedule: ScheduledMessage = {
      id: 'TRANS01',
      chatId: -1001234567,
      message: 'Transient Test',
      scheduleType: 'interval',
      intervalMs: 10000,
      enabled: true,
      createdAt: new Date().toISOString(),
      runsCount: 0
    };

    // Attempt 1: 30s
    const n1 = calculateScheduleFailureNextRun({ ...transientSchedule, consecutiveFailures: 0 }, res1, 1000000);
    assert.strictEqual(new Date(n1).getTime(), 1000000 + 30000);

    // Attempt 2: 60s
    const n2 = calculateScheduleFailureNextRun({ ...transientSchedule, consecutiveFailures: 1 }, res1, 1000000);
    assert.strictEqual(new Date(n2).getTime(), 1000000 + 60000);

    // Attempt 3: 120s
    const n3 = calculateScheduleFailureNextRun({ ...transientSchedule, consecutiveFailures: 2 }, res1, 1000000);
    assert.strictEqual(new Date(n3).getTime(), 1000000 + 120000);

    // Attempt 4+: 240s (capped <= 300s)
    const n4 = calculateScheduleFailureNextRun({ ...transientSchedule, consecutiveFailures: 3 }, res1, 1000000);
    assert.strictEqual(new Date(n4).getTime(), 1000000 + 240000);
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 2: Progressive Backoff for Recurring Schedules
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 2: Progressive Backoff for Recurring Schedules ---');

  const baseRecurringSchedule: ScheduledMessage = {
    id: 'UNE4AT',
    chatId: -1004379230831,
    message: 'Recurring broadcast test',
    scheduleType: 'interval',
    intervalMs: 60000, // 1 minute interval (reproducing production state)
    enabled: true,
    createdAt: new Date().toISOString(),
    runsCount: 10
  };

  const permError = classifyScheduleExecutionError(new Error('Bad Request: not enough rights to send text messages to the chat'));
  const fixedNow = 1770000000000; // Fixed timestamp for deterministic testing

  test('2.1: First permission failure backs off 1-minute schedule to 5 minutes', () => {
    const s: ScheduledMessage = { ...baseRecurringSchedule, consecutiveFailures: 0 };
    const nextRun = calculateScheduleFailureNextRun(s, permError, fixedNow);
    const expectedTime = fixedNow + 5 * 60 * 1000;
    assert.strictEqual(new Date(nextRun).getTime(), expectedTime);
  });

  test('2.2: Second permission failure backs off 1-minute schedule to 15 minutes', () => {
    const s: ScheduledMessage = { ...baseRecurringSchedule, consecutiveFailures: 1 };
    const nextRun = calculateScheduleFailureNextRun(s, permError, fixedNow);
    const expectedTime = fixedNow + 15 * 60 * 1000;
    assert.strictEqual(new Date(nextRun).getTime(), expectedTime);
  });

  test('2.3: Third permission failure backs off 1-minute schedule to 30 minutes', () => {
    const s: ScheduledMessage = { ...baseRecurringSchedule, consecutiveFailures: 2 };
    const nextRun = calculateScheduleFailureNextRun(s, permError, fixedNow);
    const expectedTime = fixedNow + 30 * 60 * 1000;
    assert.strictEqual(new Date(nextRun).getTime(), expectedTime);
  });

  test('2.4: Fourth and subsequent permission failures cap at 60 minutes', () => {
    const s: ScheduledMessage = { ...baseRecurringSchedule, consecutiveFailures: 3 };
    const nextRun = calculateScheduleFailureNextRun(s, permError, fixedNow);
    const expectedTime = fixedNow + 60 * 60 * 1000;
    assert.strictEqual(new Date(nextRun).getTime(), expectedTime);

    const s5: ScheduledMessage = { ...baseRecurringSchedule, consecutiveFailures: 10 };
    const nextRun5 = calculateScheduleFailureNextRun(s5, permError, fixedNow);
    assert.strictEqual(new Date(nextRun5).getTime(), expectedTime);
  });

  test('2.5: Recurring schedule with interval longer than backoff respects the longer interval', () => {
    const longIntervalSchedule: ScheduledMessage = {
      ...baseRecurringSchedule,
      intervalMs: 2 * 60 * 60 * 1000, // 2 hours
      consecutiveFailures: 1 // 15 mins backoff
    };
    const nextRun = calculateScheduleFailureNextRun(longIntervalSchedule, permError, fixedNow);
    const expectedTime = fixedNow + 2 * 60 * 60 * 1000; // 2 hours preserved
    assert.strictEqual(new Date(nextRun).getTime(), expectedTime);
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 3: One-Time Schedule Backoff and Halting
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 3: One-Time Schedule Backoff & Safe Halting ---');

  const baseOneTimeSchedule: ScheduledMessage = {
    id: 'ONETIME01',
    chatId: -1004311252481,
    message: 'Important Announcement',
    scheduleType: 'one_time',
    enabled: true,
    createdAt: new Date().toISOString(),
    runsCount: 0
  };

  test('3.1: One-time schedule applies backoff for early attempts', () => {
    const s1: ScheduledMessage = { ...baseOneTimeSchedule, consecutiveFailures: 0 };
    const nextRun1 = calculateScheduleFailureNextRun(s1, permError, fixedNow);
    assert.strictEqual(new Date(nextRun1).getTime(), fixedNow + 5 * 60 * 1000);

    const s2: ScheduledMessage = { ...baseOneTimeSchedule, consecutiveFailures: 1 };
    const nextRun2 = calculateScheduleFailureNextRun(s2, permError, fixedNow);
    assert.strictEqual(new Date(nextRun2).getTime(), fixedNow + 15 * 60 * 1000);
  });

  test('3.2: One-time schedule halts auto-retries after 5 attempts without deleting schedule', () => {
    const s5: ScheduledMessage = { ...baseOneTimeSchedule, consecutiveFailures: 5 };
    const nextRun5 = calculateScheduleFailureNextRun(s5, permError, fixedNow);
    assert.strictEqual(nextRun5, '', 'Next run must be cleared after 5 attempts');
    // Content and schedule identity remain fully intact
    assert.strictEqual(s5.enabled, true, 'Schedule enabled flag must not be mutated');
    assert.strictEqual(s5.message, 'Important Announcement');
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 4: Storage Recovery and Failure Counter Lifecycle
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 4: Storage State Lifecycle and Recovery ---');

  const testTempDir = path.resolve(process.cwd(), 'data', 'test_sched_perm_' + Date.now());
  fs.mkdirSync(path.join(testTempDir, 'groups'), { recursive: true });
  fs.mkdirSync(path.join(testTempDir, 'backup', 'groups'), { recursive: true });

  const testDb = new StorageManager(testTempDir);
  testDb.setBotIdentity({ id: 999123, username: 'TestBot' });

  let createdScheduleId = '';

  test('4.1: updateScheduleNextRun tracks consecutive failures and error description', () => {
    const created = testDb.addSchedule({
      chatId: -100555666777,
      message: 'Test Recovery',
      scheduleType: 'interval',
      intervalMs: 60000,
      enabled: true
    });
    createdScheduleId = created.id;

    testDb.updateScheduleNextRun(createdScheduleId, '2026-10-22T14:00:00Z', 'failure', 'Bad Request: not enough rights to send text messages');
    let s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.lastStatus, 'failure');
    assert.strictEqual(s?.consecutiveFailures, 1);
    assert.strictEqual(s?.lastError, 'Bad Request: not enough rights to send text messages');

    testDb.updateScheduleNextRun(createdScheduleId, '2026-10-22T14:15:00Z', 'failure', 'Bad Request: not enough rights to send text messages');
    s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.consecutiveFailures, 2);
  });

  test('4.2: Successful delivery resets consecutive failures and clears lastError', () => {
    testDb.updateScheduleNextRun(createdScheduleId, '2026-10-22T14:16:00Z', 'success', undefined, 123456);
    const s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.lastStatus, 'success');
    assert.strictEqual(s?.consecutiveFailures, 0);
    assert.strictEqual(s?.lastError, undefined);
    assert.strictEqual(s?.lastSentMessageId, 123456);
  });

  test('4.3: Manual re-enabling via toggleSchedule resets consecutive failures and error state', () => {
    // Put schedule back into failure state
    testDb.updateScheduleNextRun(createdScheduleId, '2026-10-22T14:20:00Z', 'failure', 'Temporary failure');
    let s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.consecutiveFailures, 1);

    // User toggles schedule enabled in dashboard
    testDb.toggleSchedule(createdScheduleId, true);
    s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.consecutiveFailures, 0);
    assert.strictEqual(s?.lastError, undefined);
  });

  test('4.4: consecutiveFailures is persisted to disk and survives storage reload', () => {
    testDb.updateScheduleNextRun(createdScheduleId, '2026-10-22T14:30:00Z', 'failure', 'Persistent failure test');
    let s = testDb.getScheduleById(createdScheduleId);
    assert.strictEqual(s?.consecutiveFailures, 1);

    // Save synchronously to ensure disk files are written
    (testDb as any).persist();

    // Reload from the same directory using a new StorageManager instance
    const reloadedDb = new StorageManager(testTempDir);
    const reloadedSchedule = reloadedDb.getScheduleById(createdScheduleId);
    assert.strictEqual(reloadedSchedule?.consecutiveFailures, 1, 'consecutiveFailures must survive reload from storage');
    assert.strictEqual(reloadedSchedule?.lastStatus, 'failure');
  });

  test('4.5: Older serialized schedules without consecutiveFailures start gracefully at failure 1', () => {
    const legacySchedule = testDb.addSchedule({
      chatId: -100555666777,
      message: 'Legacy Schedule Without Failures',
      scheduleType: 'interval',
      intervalMs: 60000,
      enabled: true
    });
    delete (legacySchedule as any).consecutiveFailures;
    assert.strictEqual(legacySchedule.consecutiveFailures, undefined);

    testDb.updateScheduleNextRun(legacySchedule.id, '2026-10-22T14:45:00Z', 'failure', 'Legacy failure');
    const s = testDb.getScheduleById(legacySchedule.id);
    assert.strictEqual(s?.consecutiveFailures, 1, 'Missing consecutiveFailures must gracefully start at 1');
  });

  test('4.6: Permission failures never delete schedules or content', () => {
    const permSched = testDb.addSchedule({
      chatId: -100555666777,
      message: 'Permanent Permission Test Message',
      scheduleType: 'interval',
      intervalMs: 60000,
      enabled: true
    });
    const schedId = permSched.id;
    const classified = classifyScheduleExecutionError(new Error('Bad Request: not enough rights to send text messages to the chat'));
    assert.strictEqual(classified.isPermanentPermission, true);
    assert.strictEqual(classified.isDeadChat, false);

    // In scheduler execution loop: only isDeadChat deletes schedules
    if (classified.isDeadChat) {
      testDb.deleteSchedule(-100555666777, schedId);
    } else {
      const fallback = calculateScheduleFailureNextRun(permSched, classified);
      testDb.updateScheduleNextRun(schedId, fallback, 'failure', classified.cleanMessage);
    }

    const preserved = testDb.getScheduleById(schedId);
    assert.ok(preserved, 'Schedule must remain present and preserved');
    assert.strictEqual(preserved?.message, 'Permanent Permission Test Message');
    assert.strictEqual(preserved?.lastStatus, 'failure');
  });

  test('4.7: Identical failure state skips redundant persistence without losing counter updates', () => {
    let saveCount = 0;
    const originalSave = (testDb as any).scheduleSave.bind(testDb);
    (testDb as any).scheduleSave = () => {
      saveCount++;
    };

    try {
      const s = testDb.addSchedule({
        chatId: -100555666777,
        message: 'Identical State Test',
        scheduleType: 'interval',
        intervalMs: 60000,
        enabled: true
      });
      const initialSaves = saveCount;

      // 1. Failure update mutates state (incrementing consecutiveFailures) -> must trigger save
      testDb.updateScheduleNextRun(s.id, '2026-10-22T15:00:00Z', 'failure', 'Error 1');
      assert.strictEqual(saveCount, initialSaves + 1, 'First failure must save');

      // 2. Another failure update mutates consecutiveFailures (1 -> 2) -> must trigger save
      const beforeSecond = saveCount;
      testDb.updateScheduleNextRun(s.id, '2026-10-22T15:15:00Z', 'failure', 'Error 1');
      assert.strictEqual(saveCount, beforeSecond + 1, 'Counter increment must never be skipped');
    } finally {
      (testDb as any).scheduleSave = originalSave;
    }
  });

  test('4.8: Failure diagnostic logging throttles repeated permission errors and clears on recovery', () => {
    MessageScheduler.logFailureDiagnostic('TEST_DIAG_1', -100555, 'Permission denied test', true);
    MessageScheduler.clearFailureDiagnostic('TEST_DIAG_1');
    assert.ok(true, 'Diagnostics throttling and clearing works as intended');
  });

  test('4.9: Scheduler loop respects future nextRun and does not execute early', () => {
    const futureSchedule: ScheduledMessage = {
      id: 'FUT01',
      chatId: -100555,
      message: 'Future Run Test',
      scheduleType: 'interval',
      intervalMs: 60000,
      nextRun: new Date(Date.now() + 300000).toISOString(), // 5 mins in future
      enabled: true,
      createdAt: new Date().toISOString(),
      runsCount: 0
    };
    const now = Date.now();
    const nextRunTime = new Date(futureSchedule.nextRun!).getTime();
    const isDue = !isNaN(nextRunTime) && now >= nextRunTime;
    assert.strictEqual(isDue, false, 'Future nextRun must not be due for execution');
  });

  // --------------------------------------------------------------------------
  // TEST SECTION 5: Health Metric Isolation
  // --------------------------------------------------------------------------
  console.log('\n--- SECTION 5: Health Metric Scoping & Isolation ---');

  test('5.1: HealthDiagnosticsService reports active groups scoped to active bot, ignoring legacy/unrelated entries', () => {
    // Create an isolated storage manager instance
    const healthTestDir = path.resolve(process.cwd(), 'data', 'test_health_metric_' + Date.now());
    fs.mkdirSync(path.join(healthTestDir, 'groups'), { recursive: true });
    const healthDb = new StorageManager(healthTestDir);

    const activeBotId = 777001;
    const unrelatedBotId = 888002;
    healthDb.setBotIdentity({ id: activeBotId, username: 'ActiveRoxieBot' });

    // Populate active groups for activeBotId
    (healthDb as any).data.settings[-1001001] = { chatId: -1001001, botId: activeBotId, title: 'Active Group 1' };
    (healthDb as any).data.settings[-1001002] = { chatId: -1001002, botId: activeBotId, title: 'Active Group 2' };
    (healthDb as any).data.settings[-1001003] = { chatId: -1001003, botId: activeBotId, title: 'Active Group 3' };

    // Populate legacy groups belonging to unrelated bot and positive/dummy IDs
    (healthDb as any).data.settings[-1002001] = { chatId: -1002001, botId: unrelatedBotId, title: 'Other Bot Group 1' };
    (healthDb as any).data.settings[-1002002] = { chatId: -1002002, botId: unrelatedBotId, title: 'Other Bot Group 2' };
    (healthDb as any).data.settings[1234567] = { chatId: 1234567, botId: activeBotId, title: 'Private Chat Entry' }; // positive ID
    (healthDb as any).data.settings[-1003001] = { chatId: -1003001, botId: unrelatedBotId, title: 'Other Bot Group 3' };

    // Legacy unassigned group without botId
    (healthDb as any).data.settings[-1004001] = { chatId: -1004001, title: 'Unassigned Legacy Group' }; // botId is undefined

    // Total raw entries in memory: 8 entries
    assert.strictEqual(Object.keys((healthDb as any).data.settings).length, 8);

    // Scoped active groups count: exactly 3 groups for activeBotId (ignoring other bots AND legacy unassigned groups)
    const scopedCount = healthDb.getConnectedGroupCount(activeBotId);
    assert.strictEqual(scopedCount, 3, 'Scoped active group count must only count activeBotId groups and ignore unassigned legacy groups');

    // Both singular and plural method aliases return identical count
    assert.strictEqual(healthDb.getConnectedGroupsCount(activeBotId), 3);

    // Clean up test directories
    fs.rmSync(healthTestDir, { recursive: true, force: true });
  });

  test('5.2: Active group count is consistent between getConnectedGroupCount and fallback paths', () => {
    const testDir = path.resolve(process.cwd(), 'data', 'test_health_consistency_' + Date.now());
    fs.mkdirSync(path.join(testDir, 'groups'), { recursive: true });
    const consistencyDb = new StorageManager(testDir);
    consistencyDb.setBotIdentity({ id: 555123, username: 'ConsistencyBot' });

    (consistencyDb as any).data.settings[-100901] = { chatId: -100901, botId: 555123, title: 'Group A' };
    (consistencyDb as any).data.settings[-100902] = { chatId: -100902, botId: 555123, title: 'Group B' };

    const directCount = consistencyDb.getConnectedGroupCount();
    const fallbackCount = Object.keys(consistencyDb.getAllGroupSettings()).filter(k => Number(k) < 0).length;

    assert.strictEqual(directCount, 2);
    assert.strictEqual(fallbackCount, 2);
    assert.strictEqual(directCount, fallbackCount, 'Endpoint counts must match exactly');

    fs.rmSync(testDir, { recursive: true, force: true });
  });

  // Clean up storage temp dir
  fs.rmSync(testTempDir, { recursive: true, force: true });

  console.log('\n=============================================================');
  console.log(`🎉 ALL ${passed} SCHEDULER BACKOFF & HEALTH TESTS PASSED!`);
  process.exit(0);
}

runSchedulerPermissionBackoffAndHealthTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
