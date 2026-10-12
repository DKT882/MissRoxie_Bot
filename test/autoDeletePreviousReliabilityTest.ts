process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler, DeletionClassification } from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage } from '../server/telegram/types.js';

async function runAutoDeleteReliabilityTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Reliable delOn / autoDeletePrevious Test Suite');
  console.log('====================================================');

  const testChatId = -1009998889999;
  const adminId = 888777;

  // Clean up any test schedules in this test group
  const cleanup = () => {
    const list = db.getGroupSchedules(testChatId);
    for (const s of list) {
      db.deleteSchedule(testChatId, s.id);
    }
  };
  cleanup();

  // Track telegramApi.deleteMessage calls
  const deleteCalls: Array<{ chatId: number | string; messageId: number }> = [];
  let deleteMockHandler: ((chatId: number | string, messageId: number) => Promise<{ ok: boolean; description?: string; error_code?: number }>) | null = null;

  const originalDeleteMessage = telegramApi.deleteMessage;
  telegramApi.deleteMessage = async (chatId: number | string, messageId: number) => {
    deleteCalls.push({ chatId, messageId });
    if (deleteMockHandler) {
      return deleteMockHandler(chatId, messageId);
    }
    return { ok: true };
  };

  // Track PostSender.send calls
  let nextSentMessageId = 1000;
  let sendMockHandler: ((chatId: number, payload: any) => Promise<any>) | null = null;
  const originalPostSenderSend = PostSender.send;
  (PostSender as any).send = async (chatId: number, payload: any) => {
    if (sendMockHandler) {
      return sendMockHandler(chatId, payload);
    }
    nextSentMessageId++;
    return { ok: true, messageId: nextSentMessageId, chatId };
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: First send when no previous ID exists
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: First send when no previous ID exists ---');
    deleteCalls.length = 0;
    const schedule1 = db.addSchedule({
      chatId: testChatId,
      name: 'Test Schedule 1',
      message: 'First broadcast message',
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      enabled: true
    });

    assert.strictEqual(schedule1.lastSentMessageId, undefined, 'Initial schedule must have no lastSentMessageId');
    assert.strictEqual(schedule1.pendingDeleteMessageIds, undefined, 'Initial schedule must have no pendingDeleteMessageIds');

    // Run deletion helper directly
    const delResult1 = await MessageScheduler.processScheduleDeletions(schedule1);
    assert.strictEqual(deleteCalls.length, 0, 'No deleteMessage calls should be made when no previous IDs exist');
    assert.deepStrictEqual(delResult1.remainingPendingIds, [], 'remainingPendingIds should be empty');
    assert.strictEqual(delResult1.lastSentMessageIdDeleted, false);

    // Simulate scheduler timer run
    const nextRunDate = new Date(Date.now() + 60000).toISOString();
    const sentMsgId1 = 1001;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId1, delResult1.remainingPendingIds);

    const afterRun1 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun1.lastSentMessageId, 1001, 'lastSentMessageId must be updated to newly sent message ID');
    assert.strictEqual(afterRun1.pendingDeleteMessageIds, undefined, 'pendingDeleteMessageIds should be undefined when clean');
    console.log('✅ [PASS] TEST 1: First send when no previous ID exists');

    // ------------------------------------------------------------------------
    // TEST 2: Successful deletion of the previous message
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Successful deletion of the previous message ---');
    deleteCalls.length = 0;
    deleteMockHandler = async (cId, mId) => {
      assert.strictEqual(mId, 1001, 'Should attempt to delete previous message 1001');
      return { ok: true };
    };

    const delResult2 = await MessageScheduler.processScheduleDeletions(afterRun1);
    assert.strictEqual(deleteCalls.length, 1, 'Exactly one delete call should be made');
    assert.strictEqual(deleteCalls[0].messageId, 1001);
    assert.strictEqual(delResult2.lastSentMessageIdDeleted, true, 'lastSentMessageIdDeleted must be true');
    assert.deepStrictEqual(delResult2.remainingPendingIds, [], 'No remaining pending delete IDs');

    const sentMsgId2 = 1002;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId2, delResult2.remainingPendingIds);

    const afterRun2 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun2.lastSentMessageId, 1002, 'lastSentMessageId must now be 1002');
    assert.strictEqual(afterRun2.pendingDeleteMessageIds, undefined);
    console.log('✅ [PASS] TEST 2: Successful deletion of the previous message');

    // ------------------------------------------------------------------------
    // TEST 3: Transient deletion failure followed by later successful cleanup
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Transient deletion failure followed by later successful cleanup ---');
    deleteCalls.length = 0;
    // Simulate rate limit (429) or transient error deleting 1002
    deleteMockHandler = async (cId, mId) => {
      if (mId === 1002) {
        return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' };
      }
      return { ok: true };
    };

    const delResult3 = await MessageScheduler.processScheduleDeletions(afterRun2);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(deleteCalls[0].messageId, 1002);
    assert.strictEqual(delResult3.lastSentMessageIdDeleted, false, '1002 failed deletion, so not marked deleted');
    assert.deepStrictEqual(delResult3.remainingPendingIds, [1002], '1002 must be preserved in remainingPendingIds');

    // New post 1003 is sent successfully
    const sentMsgId3 = 1003;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId3, delResult3.remainingPendingIds);

    const afterRun3 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun3.lastSentMessageId, 1003, 'lastSentMessageId updated to new post 1003');
    assert.deepStrictEqual(afterRun3.pendingDeleteMessageIds, [1002], 'Failed message 1002 must be durably preserved in pendingDeleteMessageIds');

    // Now Run 4: Both 1002 and 1003 should be candidate IDs, and deletion now succeeds!
    deleteCalls.length = 0;
    deleteMockHandler = async (cId, mId) => {
      return { ok: true }; // both succeed
    };

    const delResult4 = await MessageScheduler.processScheduleDeletions(afterRun3);
    assert.strictEqual(deleteCalls.length, 2, 'Should attempt deletion of both 1002 (pending) and 1003 (previous)');
    const deletedIds = deleteCalls.map(c => c.messageId).sort((a, b) => a - b);
    assert.deepStrictEqual(deletedIds, [1002, 1003]);
    assert.deepStrictEqual(delResult4.remainingPendingIds, [], 'Both deleted successfully, so pending list is clean');
    assert.strictEqual(delResult4.lastSentMessageIdDeleted, true);

    const sentMsgId4 = 1004;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId4, delResult4.remainingPendingIds);
    const afterRun4 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun4.lastSentMessageId, 1004);
    assert.strictEqual(afterRun4.pendingDeleteMessageIds, undefined);
    console.log('✅ [PASS] TEST 3: Transient deletion failure followed by later successful cleanup');

    // ------------------------------------------------------------------------
    // TEST 4: Deletion timeout where remote outcome may be ambiguous
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Deletion timeout where remote outcome may be ambiguous ---');
    deleteCalls.length = 0;
    // Run 5: deletion of 1004 times out (HTTP 408)
    deleteMockHandler = async (cId, mId) => {
      if (mId === 1004) {
        return { ok: false, error_code: 408, description: 'Telegram API request timed out after 7000ms' };
      }
      return { ok: true };
    };

    const delResult5 = await MessageScheduler.processScheduleDeletions(afterRun4);
    assert.strictEqual(delResult5.lastSentMessageIdDeleted, false);
    assert.deepStrictEqual(delResult5.remainingPendingIds, [1004], 'Timed-out message ID must be retained for next retry');

    const sentMsgId5 = 1005;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId5, delResult5.remainingPendingIds);
    const afterRun5 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun5.lastSentMessageId, 1005);
    assert.deepStrictEqual(afterRun5.pendingDeleteMessageIds, [1004]);

    // Run 6: In Telegram, 1004 was actually deleted before the timeout expired!
    // So when Roxie retries 1004, Telegram returns "message to delete not found"
    deleteCalls.length = 0;
    deleteMockHandler = async (cId, mId) => {
      if (mId === 1004) {
        return { ok: false, description: 'Bad Request: message to delete not found' };
      }
      if (mId === 1005) {
        return { ok: true };
      }
      return { ok: true };
    };

    const delResult6 = await MessageScheduler.processScheduleDeletions(afterRun5);
    assert.deepStrictEqual(delResult6.remainingPendingIds, [], '1004 was resolved as ALREADY_ABSENT and 1005 deleted successfully');
    assert.strictEqual(delResult6.lastSentMessageIdDeleted, true);

    const sentMsgId6 = 1006;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId6, delResult6.remainingPendingIds);
    const afterRun6 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun6.lastSentMessageId, 1006);
    assert.strictEqual(afterRun6.pendingDeleteMessageIds, undefined);
    console.log('✅ [PASS] TEST 4: Deletion timeout where remote outcome may be ambiguous');

    // ------------------------------------------------------------------------
    // TEST 5: An already-deleted message
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: An already-deleted message ---');
    deleteCalls.length = 0;
    deleteMockHandler = async (cId, mId) => {
      return { ok: false, description: 'message to delete not found' };
    };

    const delResult7 = await MessageScheduler.processScheduleDeletions(afterRun6);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(delResult7.lastSentMessageIdDeleted, true, 'Message already deleted is resolved, not retried');
    assert.deepStrictEqual(delResult7.remainingPendingIds, []);

    const sentMsgId7 = 1007;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId7, delResult7.remainingPendingIds);
    const afterRun7 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun7.lastSentMessageId, 1007);
    assert.strictEqual(afterRun7.pendingDeleteMessageIds, undefined);
    console.log('✅ [PASS] TEST 5: An already-deleted message');

    // ------------------------------------------------------------------------
    // TEST 6: Permanent failure (insufficient permissions / age > 48h)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Permanent failure (age > 48 hours or missing delete rights) ---');
    deleteCalls.length = 0;
    deleteMockHandler = async (cId, mId) => {
      // Telegram 48-hour limit: "message can't be deleted"
      return { ok: false, description: 'Bad Request: message can\'t be deleted' };
    };

    const delResult8 = await MessageScheduler.processScheduleDeletions(afterRun7);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(delResult8.lastSentMessageIdDeleted, true, 'Terminal failure must prune ID to avoid infinite retry');
    assert.deepStrictEqual(delResult8.remainingPendingIds, [], 'Permanent failure must not be kept in pending list');

    const sentMsgId8 = 1008;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId8, delResult8.remainingPendingIds);
    const afterRun8 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun8.lastSentMessageId, 1008);
    assert.strictEqual(afterRun8.pendingDeleteMessageIds, undefined);

    // Also test bot lacks admin rights: "chat_admin_required"
    assert.strictEqual(
      MessageScheduler.classifyDeletionResult({ ok: false, description: 'Bad Request: not enough rights to delete message' }),
      'PERMANENT_FAILURE'
    );
    assert.strictEqual(
      MessageScheduler.classifyDeletionResult({ ok: false, description: 'Forbidden: bot was kicked from the supergroup', error_code: 403 }),
      'PERMANENT_FAILURE'
    );
    console.log('✅ [PASS] TEST 6: Permanent failure');

    // ------------------------------------------------------------------------
    // TEST 7: Successful deletion followed by failed new delivery
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Successful deletion followed by failed new delivery ---');
    deleteCalls.length = 0;
    deleteMockHandler = async () => ({ ok: true });

    // Schedule has lastSentMessageId: 1008
    const delResult9 = await MessageScheduler.processScheduleDeletions(afterRun8);
    assert.strictEqual(delResult9.lastSentMessageIdDeleted, true);
    assert.deepStrictEqual(delResult9.remainingPendingIds, []);

    // Simulate pre-send state update: 1008 was deleted so lastSentMessageId is cleared
    db.updateSchedule(schedule1.id, {
      lastSentMessageId: undefined,
      pendingDeleteMessageIds: undefined
    });

    // Simulate send failure: PostSender fails
    // Message 1008 was already deleted, so it must NOT be re-attempted
    const afterSendFail = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterSendFail.lastSentMessageId, undefined, 'lastSentMessageId must NOT be set to unsent message');
    assert.strictEqual(afterSendFail.pendingDeleteMessageIds, undefined, 'Already deleted message must not be pending');

    // On next execution, candidate IDs is empty
    deleteCalls.length = 0;
    const delResult10 = await MessageScheduler.processScheduleDeletions(afterSendFail);
    assert.strictEqual(deleteCalls.length, 0, 'No delete attempts should be made when lastSentMessageId was already deleted');

    // Delivery succeeds on retry
    const sentMsgId9 = 1009;
    db.updateScheduleNextRun(schedule1.id, nextRunDate, 'success', undefined, sentMsgId9, delResult10.remainingPendingIds);
    const afterRun9 = db.getScheduleById(schedule1.id)!;
    assert.strictEqual(afterRun9.lastSentMessageId, 1009);
    console.log('✅ [PASS] TEST 7: Successful deletion followed by failed new delivery');

    // ------------------------------------------------------------------------
    // TEST 8: Timer-versus-trigger concurrency
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Timer-versus-trigger concurrency ---');
    const scheduleConcurrent = db.addSchedule({
      chatId: testChatId,
      name: 'Concurrent Test Schedule',
      message: 'Concurrent broadcast test',
      scheduleType: 'interval',
      intervalMs: 60000,
      triggerKeyword: 'ping_concurrent',
      autoDeletePrevious: true,
      enabled: true
    });

    MessageScheduler.resetExecutingScheduleIds();

    // Trigger execution
    let triggerEntered = false;
    let timerEntered = false;
    deleteMockHandler = async () => {
      // Simulate artificial delay during deletion
      await new Promise(r => setTimeout(r, 20));
      return { ok: true };
    };

    const triggerPromise = (messageScheduler as any).executeTriggeredSchedule(scheduleConcurrent);
    // While trigger is running in background, attempt timer run or second trigger run
    const concurrentTriggerRes = await (messageScheduler as any).executeTriggeredSchedule(scheduleConcurrent);
    assert.strictEqual(concurrentTriggerRes, false, 'Second trigger must be rejected while first execution is in-flight');

    const trigger1Res = await triggerPromise;
    assert.strictEqual(trigger1Res, true, 'First trigger must succeed');

    MessageScheduler.resetExecutingScheduleIds();
    console.log('✅ [PASS] TEST 8: Timer-versus-trigger concurrency');

    // ------------------------------------------------------------------------
    // TEST 9: Persistence and restoration of pending deletion IDs
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Persistence and restoration of pending deletion IDs ---');
    const schedulePersist = db.addSchedule({
      chatId: testChatId,
      name: 'Persist Test Schedule',
      message: 'Test backup persistence',
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      lastSentMessageId: 7771,
      pendingDeleteMessageIds: [7768, 7769, 7770],
      enabled: true
    });

    const retrieved1 = db.getScheduleById(schedulePersist.id)!;
    assert.deepStrictEqual(retrieved1.pendingDeleteMessageIds, [7768, 7769, 7770], 'Stored pendingDeleteMessageIds must match');

    // Test updateScheduleNextRun persistence
    db.updateScheduleNextRun(schedulePersist.id, nextRunDate, 'success', undefined, 7772, [7770]);
    const retrieved2 = db.getScheduleById(schedulePersist.id)!;
    assert.strictEqual(retrieved2.lastSentMessageId, 7772);
    assert.deepStrictEqual(retrieved2.pendingDeleteMessageIds, [7770]);

    // Test backup export and restoration
    const fullBackup = db.exportGroupFullBackup(testChatId);
    const restoredGroup = db.importGroupFullBackup(testChatId, fullBackup, undefined, true, 'test', true);
    assert.strictEqual(restoredGroup.ok, true);

    const retrievedRestored = db.getScheduleById(schedulePersist.id)!;
    assert.deepStrictEqual(retrievedRestored.pendingDeleteMessageIds, [7770], 'pendingDeleteMessageIds must survive backup restoration');

    // Test clearing pendingDeleteMessageIds
    db.updateScheduleNextRun(schedulePersist.id, nextRunDate, 'success', undefined, 7773, []);
    const retrievedCleared = db.getScheduleById(schedulePersist.id)!;
    assert.strictEqual(retrievedCleared.pendingDeleteMessageIds, undefined, 'Empty array should clear pendingDeleteMessageIds');
    console.log('✅ [PASS] TEST 9: Persistence and restoration of pending deletion IDs');

    // ------------------------------------------------------------------------
    // TEST 10: Multiple schedules in the same group never delete one another
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Multiple schedules in the same group never delete one another ---');
    const scheduleA = db.addSchedule({
      chatId: testChatId,
      name: 'Schedule A in Chat',
      message: 'Message from A',
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      lastSentMessageId: 9001,
      enabled: true
    });

    const scheduleB = db.addSchedule({
      chatId: testChatId,
      name: 'Schedule B in Chat',
      message: 'Message from B',
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      lastSentMessageId: 9002,
      enabled: true
    });

    deleteCalls.length = 0;
    deleteMockHandler = async () => ({ ok: true });

    // Process deletions for schedule A only
    await MessageScheduler.processScheduleDeletions(scheduleA);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(deleteCalls[0].messageId, 9001, 'Schedule A must only delete 9001');

    deleteCalls.length = 0;
    // Process deletions for schedule B only
    await MessageScheduler.processScheduleDeletions(scheduleB);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(deleteCalls[0].messageId, 9002, 'Schedule B must only delete 9002');

    console.log('✅ [PASS] TEST 10: Multiple schedules in same group isolated');

    // ------------------------------------------------------------------------
    // TEST 11: Rich posts returning the correct Telegram message ID
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Rich posts returning correct Telegram message ID ---');
    const scheduleRich = db.addSchedule({
      chatId: testChatId,
      name: 'Rich Post Schedule',
      message: 'Rich post text with buttons',
      contentType: 'photo',
      mediaFileId: 'https://example.com/banner.jpg',
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      inlineKeyboard: [[{ text: 'Join VIP', url: 'https://t.me/example' }]],
      enabled: true
    });

    const payload = PostSender.scheduleToPayload(scheduleRich, 'Rich post text with buttons');
    assert.strictEqual(payload.contentType, 'photo');
    assert.strictEqual(payload.mediaFileId, 'https://example.com/banner.jpg');
    assert.strictEqual(payload.buttons?.length, 1);

    // When PostSender sends, it returns messageId
    const sendRes = await PostSender.send(scheduleRich.chatId, payload);
    assert.strictEqual(sendRes.ok, true);
    assert.ok(typeof sendRes.messageId === 'number' && sendRes.messageId > 0, 'Must return valid numeric messageId');
    console.log('✅ [PASS] TEST 11: Rich posts returning correct message ID');

    // ------------------------------------------------------------------------
    // TEST 12: Existing schedules without pending deletion state remain compatible
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Existing schedules without pending deletion state remain compatible ---');
    // Emulate a legacy schedule JSON without pendingDeleteMessageIds
    const legacySchedule: ScheduledMessage = {
      id: 'LEGACY_SCHED_01',
      chatId: testChatId,
      name: 'Legacy Schedule Without pendingDeleteMessageIds',
      message: 'Legacy broadcast',
      contentType: 'text',
      enabled: true,
      scheduleType: 'interval',
      intervalMs: 60000,
      autoDeletePrevious: true,
      lastSentMessageId: 8888,
      createdAt: new Date().toISOString(),
      runsCount: 5
    };

    deleteCalls.length = 0;
    deleteMockHandler = async () => ({ ok: true });

    const delResultLegacy = await MessageScheduler.processScheduleDeletions(legacySchedule);
    assert.strictEqual(deleteCalls.length, 1);
    assert.strictEqual(deleteCalls[0].messageId, 8888, 'Legacy schedule lastSentMessageId deleted correctly');
    assert.strictEqual(delResultLegacy.lastSentMessageIdDeleted, true);
    assert.deepStrictEqual(delResultLegacy.remainingPendingIds, []);

    // Also test when autoDeletePrevious is false
    const legacyNoAutoDelete: ScheduledMessage = {
      ...legacySchedule,
      id: 'LEGACY_SCHED_02',
      autoDeletePrevious: false,
      lastSentMessageId: 9999
    };
    deleteCalls.length = 0;
    const delResultNoAuto = await MessageScheduler.processScheduleDeletions(legacyNoAutoDelete);
    assert.strictEqual(deleteCalls.length, 0, 'When autoDeletePrevious is false, no deletions occur');
    assert.strictEqual(delResultNoAuto.lastSentMessageIdDeleted, false);

    console.log('✅ [PASS] TEST 12: Existing legacy schedules compatibility');

    // ------------------------------------------------------------------------
    // TEST 13: Bounded queue policy (MAX_PENDING_DELETE_IDS = 10)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Bounded queue policy ---');
    deleteCalls.length = 0;
    deleteMockHandler = async () => ({ ok: false, error_code: 429, description: 'Rate limit' });

    // Schedule with 12 failing pending IDs
    const scheduleBounded: ScheduledMessage = {
      id: 'BOUNDED_SCHED_01',
      chatId: testChatId,
      name: 'Bounded Schedule',
      message: 'Queue bound test',
      contentType: 'text',
      enabled: true,
      autoDeletePrevious: true,
      pendingDeleteMessageIds: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      createdAt: new Date().toISOString(),
      runsCount: 1
    };

    const delResultBounded = await MessageScheduler.processScheduleDeletions(scheduleBounded);
    assert.strictEqual(delResultBounded.remainingPendingIds.length, MessageScheduler.MAX_PENDING_DELETE_IDS, 'Queue must be capped at 10');
    // Oldest IDs (1 and 2) must be evicted, newest 10 (3 through 12) retained
    assert.deepStrictEqual(delResultBounded.remainingPendingIds, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    console.log('✅ [PASS] TEST 13: Bounded queue policy');

    console.log('\n====================================================');
    console.log('🎉 ALL AUTO-DELETE RELIABILITY TESTS PASSED SUCCESSFULLY');
    console.log('====================================================\n');
  } finally {
    // Restore original methods
    telegramApi.deleteMessage = originalDeleteMessage;
    (PostSender as any).send = originalPostSenderSend;
    cleanup();
  }
}

runAutoDeleteReliabilityTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test suite failed with error:', err);
    process.exit(1);
  });
