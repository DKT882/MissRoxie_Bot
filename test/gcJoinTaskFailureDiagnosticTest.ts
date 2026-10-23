import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';

process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

// Storage isolation - temporary directory ensuring data/ is NEVER touched or modified
const testTempDir = path.join(os.tmpdir(), `roxie_gc_join_diag_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
fs.mkdirSync(testTempDir, { recursive: true });
process.env.ROXIE_DATA_DIR = testTempDir;

import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { MessageScheduler, classifyScheduleExecutionError } from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage } from '../server/telegram/types.js';

// Re-initialize db singleton to use isolated testTempDir with clean in-memory state
(db as any).configuredDataDir = testTempDir;
(db as any).activeDataDir = testTempDir;
(db as any).data = {
  settings: {},
  warnings: [],
  tempActions: [],
  stickerFreeUsers: [],
  contentPermissions: {},
  notes: {},
  approvedUsers: {},
  captchaSessions: [],
  schedules: [],
  logs: [],
  knownUsers: {},
  knownUsersById: {},
  groupMembers: {},
  customRoles: {},
  mediaLibrary: { stickers: {}, animations: {}, stickerMetadata: {} },
  groupMediaLibraries: {},
  userMemories: {},
  groupConversationMemories: {},
  groupMemories: {},
  userLustLevels: {},
  contentTemplates: {}
};
db.init();

let passed = 0;
let failed = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✅ [PASS] ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function runGcJoinDiagnostic() {
  console.log('================================================================');
  console.log('🔍 RUNNING GC JOIN TASK (JSDMLV) COMPREHENSIVE TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -100444555666;
  const testChatTitle = 'Target Group Chat';

  db.setBotIdentity({ id: 8880001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });
  db.getGroupSettings(testChatId, testChatTitle);

  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origDeleteMessage = telegramApi.deleteMessage.bind(telegramApi);
  const origPostSenderSend = PostSender.send.bind(PostSender);

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Replicate task JSDMLV configuration
    // -------------------------------------------------------------------------
    await test('1. Replicate task JSDMLV configuration in isolated storage', async () => {
      const schedule = db.addSchedule({
        chatId: testChatId,
        chatTitle: testChatTitle,
        name: 'GC Join',
        message: 'Join my all groups',
        messageText: 'Join my all groups',
        scheduleType: 'interval',
        intervalMs: 60000,
        intervalFormatted: '1 minute',
        nextRun: new Date(Date.now() - 5000).toISOString(),
        enabled: true,
        contentType: 'text',
        lastStatus: 'pending'
      });

      // Set schedule ID to JSDMLV to mirror the user's task
      schedule.id = 'JSDMLV';
      db.updateSchedule(schedule.id, { id: 'JSDMLV' } as any);

      const retrieved = db.getScheduleById('JSDMLV');
      assert.ok(retrieved, 'Schedule JSDMLV must exist in storage');
      assert.strictEqual(retrieved.name, 'GC Join');
      assert.strictEqual(retrieved.message, 'Join my all groups');
      assert.strictEqual(retrieved.intervalMs, 60000);
      assert.strictEqual(retrieved.intervalFormatted, '1 minute');
      assert.strictEqual(retrieved.runsCount, 0);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Task execution path (Message broadcast, NOT group joining)
    // -------------------------------------------------------------------------
    await test('2. Task execution path: scheduler delegates "GC Join" to PostSender.send, NOT group joining', async () => {
      const schedule = db.getScheduleById('JSDMLV')!;
      const payload = PostSender.scheduleToPayload(schedule, schedule.message);

      assert.strictEqual(payload.text, 'Join my all groups', 'Payload text is the raw message string');
      assert.strictEqual(payload.contentType, 'text', 'Payload content type defaults to text');
      assert.strictEqual(typeof (PostSender as any).joinGroup, 'undefined', 'PostSender has no joinGroup method');
    });

    // -------------------------------------------------------------------------
    // TEST 3: Missing send permissions (Exact failure reproduction for JSDMLV)
    // -------------------------------------------------------------------------
    await test('3. Missing send permissions: Telegram 400 rejection increments runsCount and sets lastStatus=failure', async () => {
      const scheduler = new MessageScheduler();

      const simulatedTelegramError = 'Bad Request: not enough rights to send text messages to the chat';
      (telegramApi as any).sendMessage = async () => {
        return {
          ok: false,
          error_code: 400,
          description: simulatedTelegramError
        };
      };

      for (let run = 1; run <= 3; run++) {
        db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
        await scheduler.checkAndExecuteSchedules();

        const s = db.getScheduleById('JSDMLV')!;
        assert.strictEqual(s.runsCount, run, `runsCount must be ${run} after ${run} failed attempts`);
        assert.strictEqual(s.lastStatus, 'failure', 'lastStatus must be failure');
        assert.strictEqual(s.consecutiveFailures, run, `consecutiveFailures must be ${run}`);
        assert.strictEqual(s.lastError, simulatedTelegramError, 'lastError must record the Telegram API error');
        assert.ok(s.nextRun, 'nextRun must be computed for retry');
      }
    });

    // -------------------------------------------------------------------------
    // TEST 4: Consecutive failures increment runsCount to 102 without deleting schedule
    // -------------------------------------------------------------------------
    await test('4. Consecutive failures increment runsCount to 102 without deleting the schedule', async () => {
      for (let run = 4; run <= 102; run++) {
        db.updateScheduleNextRun(
          'JSDMLV',
          new Date(Date.now() + 60000).toISOString(),
          'failure',
          'Bad Request: not enough rights to send text messages to the chat'
        );
      }

      const finalState = db.getScheduleById('JSDMLV')!;
      assert.strictEqual(finalState.runsCount, 102, 'runsCount must reach 102');
      assert.strictEqual(finalState.lastStatus, 'failure', 'lastStatus is failure');
      assert.strictEqual(finalState.consecutiveFailures, 102, 'consecutiveFailures is 102');
      assert.strictEqual(finalState.enabled, true, 'Task remains enabled despite failures');
    });

    // -------------------------------------------------------------------------
    // TEST 5: Accurate lastError visibility & token redaction
    // -------------------------------------------------------------------------
    await test('5. Accurate lastError visibility and sensitive bot token sanitization', async () => {
      const schedule = db.getScheduleById('JSDMLV')!;

      // Verify dashboard API response includes lastError
      assert.strictEqual(schedule.lastError, 'Bad Request: not enough rights to send text messages to the chat');

      // Test token redaction utility function as implemented in UI
      const sanitize = (err: string) =>
        err.replace(/\b\d{8,11}:[a-zA-Z0-9_-]{35}\b/g, '[REDACTED]').replace(/bot\d+:[a-zA-Z0-9_-]+/gi, 'bot[REDACTED]');

      const sensitiveError = 'Error calling https://api.telegram.org/bot1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789/sendMessage: Forbidden';
      const sanitized = sanitize(sensitiveError);
      assert.ok(!sanitized.includes('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789'), 'Bot token must be redacted');
      assert.ok(sanitized.includes('[REDACTED]'), 'Redaction placeholder must be present');

      // Scheduler classifyExecutionError must also sanitize tokens
      const classified = MessageScheduler.classifyExecutionError(new Error(sensitiveError));
      assert.ok(!classified.cleanMessage.includes('1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789'), 'cleanMessage must redact bot token');
    });

    // -------------------------------------------------------------------------
    // TEST 6: Successful scheduled message delivery
    // -------------------------------------------------------------------------
    await test('6. Successful delivery: resets consecutiveFailures, clears lastError, and sets lastStatus=success', async () => {
      const scheduler = new MessageScheduler();

      // Mock Telegram sendMessage returning successful message object
      (telegramApi as any).sendMessage = async () => {
        return {
          ok: true,
          result: {
            message_id: 888999,
            chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
            date: Math.floor(Date.now() / 1000),
            text: 'Join my all groups'
          }
        };
      };

      db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
      await scheduler.checkAndExecuteSchedules();

      const successState = db.getScheduleById('JSDMLV')!;
      assert.strictEqual(successState.lastStatus, 'success', 'lastStatus must be success');
      assert.strictEqual(successState.consecutiveFailures, 0, 'consecutiveFailures must reset to 0');
      assert.strictEqual(successState.lastError, undefined, 'lastError must be deleted');
      assert.strictEqual(successState.lastSentMessageId, 888999, 'lastSentMessageId must record the delivered message ID');
      assert.strictEqual(successState.runsCount, 103, 'runsCount increments on success as well');
    });

    // -------------------------------------------------------------------------
    // TEST 7: Invalid or inaccessible destination chat (DEAD_CHAT)
    // -------------------------------------------------------------------------
    await test('7. Invalid destination: dead chat errors automatically remove obsolete schedule', async () => {
      const deadChatId = -100999000111;
      const deadSchedule = db.addSchedule({
        chatId: deadChatId,
        message: 'Message to dead chat',
        scheduleType: 'interval',
        intervalMs: 60000,
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      const scheduler = new MessageScheduler();
      (telegramApi as any).sendMessage = async () => {
        return {
          ok: false,
          error_code: 400,
          description: 'Bad Request: chat not found'
        };
      };

      await scheduler.checkAndExecuteSchedules();

      const deadResult = db.getScheduleById(deadSchedule.id);
      assert.strictEqual(deadResult, undefined, 'Schedule for dead chat must be safely removed from storage');
    });

    // -------------------------------------------------------------------------
    // TEST 8: Telegram rate limiting & retry behavior (RATE_LIMITED)
    // -------------------------------------------------------------------------
    await test('8. Rate limiting: 429 response respects retry_after buffer', async () => {
      const rateLimitError = new Error('Too Many Requests: retry after 35');
      (rateLimitError as any).parameters = { retry_after: 35 };

      const classified = MessageScheduler.classifyExecutionError(rateLimitError);
      assert.strictEqual(classified.category, 'RATE_LIMITED');
      assert.strictEqual(classified.isPermanentPermission, false);
      assert.strictEqual(classified.isDeadChat, false);
      // 35s + 5s buffer = 40s (40000ms)
      assert.strictEqual(classified.retryAfterMs, 40000);

      const fixedNow = 1770000000000;
      const schedule = db.getScheduleById('JSDMLV')!;
      const nextRun = MessageScheduler.calculateFailureNextRun(schedule, classified, fixedNow);
      assert.strictEqual(new Date(nextRun).getTime(), fixedNow + Math.max(60000, 40000));
    });

    // -------------------------------------------------------------------------
    // TEST 9: Transient network failure
    // -------------------------------------------------------------------------
    await test('9. Transient network failure: classified as TRANSIENT with exponential backoff', async () => {
      const networkError = new Error('FetchError: request to https://api.telegram.org failed, reason: connect ETIMEDOUT');
      const classified = MessageScheduler.classifyExecutionError(networkError);

      assert.strictEqual(classified.category, 'TRANSIENT');
      assert.strictEqual(classified.isPermanentPermission, false);
      assert.strictEqual(classified.isDeadChat, false);

      const fixedNow = 1770000000000;
      const s = { ...db.getScheduleById('JSDMLV')!, consecutiveFailures: 2 };
      const nextRun = MessageScheduler.calculateFailureNextRun(s, classified, fixedNow);
      // For failure 3: transientBackoffMs = 30000 * 2^2 = 120000ms (2 minutes), larger than base 60s
      assert.strictEqual(new Date(nextRun).getTime(), fixedNow + 120000);
    });

    // -------------------------------------------------------------------------
    // TEST 10: Task handler throwing an unexpected exception
    // -------------------------------------------------------------------------
    await test('10. Task handler throwing an exception: caught gracefully without unhandled crash', async () => {
      const scheduler = new MessageScheduler();
      const initialFailures = (scheduler as any).failures;

      (PostSender as any).send = async () => {
        throw new Error('Unexpected simulated PostSender crash');
      };

      db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
      await scheduler.checkAndExecuteSchedules();

      assert.strictEqual((scheduler as any).failures, initialFailures + 1, 'Scheduler failure count must increment');
      const s = db.getScheduleById('JSDMLV')!;
      assert.strictEqual(s.lastStatus, 'failure', 'lastStatus must be failure');
      assert.strictEqual(s.lastError, 'Unexpected simulated PostSender crash');

      (PostSender as any).send = origPostSenderSend;
    });

    // -------------------------------------------------------------------------
    // TEST 11: Prevention of overlapping executions
    // -------------------------------------------------------------------------
    await test('11. Prevention of overlapping executions: in-flight lock blocks concurrent execution', async () => {
      const scheduler = new MessageScheduler();
      const schedule = db.getScheduleById('JSDMLV')!;

      // Simulate schedule already in executingScheduleIds set
      (scheduler as any).executingScheduleIds.add(schedule.id);

      let sendCalled = false;
      (telegramApi as any).sendMessage = async () => {
        sendCalled = true;
        return { ok: true, result: { message_id: 1 } };
      };

      db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
      await scheduler.checkAndExecuteSchedules();

      assert.strictEqual(sendCalled, false, 'sendMessage must not be called when task is already executing');

      (scheduler as any).executingScheduleIds.delete(schedule.id);
    });

    // -------------------------------------------------------------------------
    // TEST 12: No false success after failed delivery
    // -------------------------------------------------------------------------
    await test('12. No false success after failed delivery: rejection guarantees lastStatus !== success', async () => {
      const scheduler = new MessageScheduler();
      (telegramApi as any).sendMessage = async () => {
        return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
      };

      db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
      await scheduler.checkAndExecuteSchedules();

      const s = db.getScheduleById('JSDMLV')!;
      assert.notStrictEqual(s.lastStatus, 'success', 'lastStatus must NEVER be success when Telegram rejects');
      assert.strictEqual(s.lastStatus, 'failure');
    });

    // -------------------------------------------------------------------------
    // TEST 13: No false failure after successful delivery
    // -------------------------------------------------------------------------
    await test('13. No false failure after successful delivery: post-delivery error does not flip status to failure', async () => {
      const scheduler = new MessageScheduler();

      // Successful sendMessage
      (telegramApi as any).sendMessage = async () => {
        return {
          ok: true,
          result: { message_id: 999111, chat: { id: testChatId, type: 'supergroup' } }
        };
      };

      // Force db.addLog to throw post-delivery exception
      const origAddLog = db.addLog.bind(db);
      (db as any).addLog = () => {
        throw new Error('Simulated database log failure after successful dispatch');
      };

      db.updateSchedule('JSDMLV', { nextRun: new Date(Date.now() - 1000).toISOString() });
      await scheduler.checkAndExecuteSchedules();

      const s = db.getScheduleById('JSDMLV')!;
      // Because isDelivered was true before addLog threw, the message was delivered
      assert.strictEqual(s.lastStatus, 'success', 'Delivery status must remain success despite post-delivery log exception');
      assert.strictEqual(s.lastSentMessageId, 999111);

      (db as any).addLog = origAddLog;
    });

  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.deleteMessage = origDeleteMessage;
    (PostSender as any).send = origPostSenderSend;

    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`🎉 TEST SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runGcJoinDiagnostic().catch((err) => {
  console.error('Fatal diagnostic test error:', err);
  process.exit(1);
});
