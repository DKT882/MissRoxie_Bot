process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler } from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 Running Comprehensive Trigger Auto-Delete Test Suite');
  console.log('====================================================');

  const testChatA = -100999555111;
  const testChatB = -100999555222;

  // Cleanup
  for (const s of db.getGroupSchedules(testChatA)) db.deleteSchedule(testChatA, s.id);
  for (const s of db.getGroupSchedules(testChatB)) db.deleteSchedule(testChatB, s.id);

  const deleteCalls: Array<{ chatId: number | string; messageId: number }> = [];
  let deleteMockHandler: ((chatId: number | string, messageId: number) => Promise<{ ok: boolean; description?: string; error_code?: number }>) | null = null;
  telegramApi.deleteMessage = async (chatId, messageId) => {
    deleteCalls.push({ chatId, messageId });
    if (deleteMockHandler) return deleteMockHandler(chatId, messageId);
    return { ok: true };
  };

  let nextMsgId = 6000;
  let sendMockHandler: ((chatId: number, payload: any) => Promise<any>) | null = null;
  (PostSender as any).send = async (chatId: number, payload: any) => {
    if (sendMockHandler) return sendMockHandler(chatId, payload);
    nextMsgId++;
    return { ok: true, messageId: nextMsgId, chatId };
  };

  // ------------------------------------------------------------------------
  // TEST 1: First triggered send records returned message ID
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 1: First triggered send records its returned message ID ---');
  deleteCalls.length = 0;
  MessageScheduler.resetTriggerCooldownCache();

  const sched1 = db.addSchedule({
    chatId: testChatA,
    name: 'Trigger Del Sched 1',
    message: 'Hello trigger 1',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'hii',
    autoDeletePrevious: true,
    enabled: true
  });

  const msg1 = {
    message_id: 201,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'hii'
  };

  const triggered1 = await messageScheduler.handleIncomingMessageTrigger(msg1, testChatA, 'hii');
  assert.strictEqual(triggered1, true, 'First trigger must succeed');
  assert.strictEqual(deleteCalls.length, 0, 'No deletion should happen on first trigger');

  const after1 = db.getScheduleById(sched1.id)!;
  assert.strictEqual(after1.lastSentMessageId, 6001, 'Schedule must record returned message ID');
  console.log('✅ [PASS] TEST 1 passed');

  // ------------------------------------------------------------------------
  // TEST 2: Second matching trigger attempts to delete previous message before sending
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 2: Second matching trigger attempts to delete previous message before sending ---');
  deleteCalls.length = 0;
  MessageScheduler.resetTriggerCooldownCache();

  let deletionTime: number | null = null;
  let sendTime: number | null = null;

  deleteMockHandler = async (chatId, mId) => {
    deletionTime = Date.now();
    assert.strictEqual(mId, 6001, 'Should attempt to delete message 6001');
    assert.strictEqual(chatId, testChatA, 'Should attempt to delete in correct chat');
    return { ok: true };
  };

  sendMockHandler = async (chatId, payload) => {
    sendTime = Date.now();
    assert.ok(deletionTime !== null, 'Deletion must be attempted BEFORE send');
    nextMsgId++;
    return { ok: true, messageId: nextMsgId, chatId };
  };

  const msg2 = {
    message_id: 202,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'hii'
  };

  const triggered2 = await messageScheduler.handleIncomingMessageTrigger(msg2, testChatA, 'hii');
  assert.strictEqual(triggered2, true, 'Second trigger must succeed');
  assert.strictEqual(deleteCalls.length, 1, 'Exactly one deletion should be attempted');
  assert.strictEqual(deleteCalls[0].messageId, 6001);

  const after2 = db.getScheduleById(sched1.id)!;
  assert.strictEqual(after2.lastSentMessageId, 6002, 'Schedule must record new message ID 6002');
  assert.strictEqual(after2.pendingDeleteMessageIds, undefined, 'Clean queue after successful deletion');
  console.log('✅ [PASS] TEST 2 passed');

  // ------------------------------------------------------------------------
  // TEST 3: Disabled auto-delete does not delete messages
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 3: Disabled auto-delete does not delete messages ---');
  deleteCalls.length = 0;
  deleteMockHandler = null;
  sendMockHandler = null;
  MessageScheduler.resetTriggerCooldownCache();

  const schedNoDel = db.addSchedule({
    chatId: testChatA,
    name: 'No Del Sched',
    message: 'Hello no del',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'nodel',
    autoDeletePrevious: false,
    enabled: true
  });

  const msgNoDel1 = {
    message_id: 203,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'nodel'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgNoDel1, testChatA, 'nodel');
  const afterNoDel1 = db.getScheduleById(schedNoDel.id)!;
  assert.strictEqual(afterNoDel1.lastSentMessageId, 6003);

  MessageScheduler.resetTriggerCooldownCache();
  const msgNoDel2 = {
    message_id: 204,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'nodel'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgNoDel2, testChatA, 'nodel');
  assert.strictEqual(deleteCalls.length, 0, 'No deletion calls when autoDeletePrevious is false');
  console.log('✅ [PASS] TEST 3 passed');

  // ------------------------------------------------------------------------
  // TEST 4: Transient failures preserve pending IDs for retry
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 4: Transient failures preserve pending IDs for retry ---');
  deleteCalls.length = 0;
  MessageScheduler.resetTriggerCooldownCache();

  const schedTransient = db.addSchedule({
    chatId: testChatA,
    name: 'Transient Del Sched',
    message: 'Hello transient',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'transient',
    autoDeletePrevious: true,
    enabled: true
  });

  const msgTrans1 = {
    message_id: 205,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'transient'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgTrans1, testChatA, 'transient');
  const afterTrans1 = db.getScheduleById(schedTransient.id)!;
  const transMsgId1 = afterTrans1.lastSentMessageId!;
  assert.ok(transMsgId1 > 0);

  // Second trigger: deleteMessage encounters transient failure (e.g. 429 rate limit or network timeout)
  deleteMockHandler = async (chatId, mId) => {
    return { ok: false, error_code: 429, description: 'Too Many Requests: retry after 5' };
  };

  MessageScheduler.resetTriggerCooldownCache();
  const msgTrans2 = {
    message_id: 206,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'transient'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgTrans2, testChatA, 'transient');

  const afterTrans2 = db.getScheduleById(schedTransient.id)!;
  assert.deepStrictEqual(afterTrans2.pendingDeleteMessageIds, [transMsgId1], 'Failed deletion ID must be preserved in pendingDeleteMessageIds');
  const transMsgId2 = afterTrans2.lastSentMessageId!;
  assert.ok(transMsgId2 > transMsgId1, 'New message ID must be recorded as lastSentMessageId');

  // Third trigger: deletion succeeds for both pending and lastSentMessageId
  deleteCalls.length = 0;
  deleteMockHandler = async () => ({ ok: true });
  MessageScheduler.resetTriggerCooldownCache();
  const msgTrans3 = {
    message_id: 207,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'transient'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgTrans3, testChatA, 'transient');

  assert.strictEqual(deleteCalls.length, 2, 'Should attempt to delete both pending message and lastSentMessageId');
  assert.ok(deleteCalls.some(c => c.messageId === transMsgId1), 'Must delete previous transient failure ID');
  assert.ok(deleteCalls.some(c => c.messageId === transMsgId2), 'Must delete latest message ID');

  const afterTrans3 = db.getScheduleById(schedTransient.id)!;
  assert.strictEqual(afterTrans3.pendingDeleteMessageIds, undefined, 'Pending queue cleared after success');
  console.log('✅ [PASS] TEST 4 passed');

  // ------------------------------------------------------------------------
  // TEST 5: Failed new delivery does not record a nonexistent message ID
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 5: Failed new delivery does not record a nonexistent message ID ---');
  deleteCalls.length = 0;
  MessageScheduler.resetTriggerCooldownCache();

  const schedSendFail = db.addSchedule({
    chatId: testChatA,
    name: 'Send Fail Sched',
    message: 'Hello fail',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'faildel',
    autoDeletePrevious: true,
    enabled: true
  });

  // Successful run 1
  deleteMockHandler = async () => ({ ok: true });
  sendMockHandler = null;
  const msgFail1 = {
    message_id: 208,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'faildel'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgFail1, testChatA, 'faildel');
  const afterFail1 = db.getScheduleById(schedSendFail.id)!;
  const validMsgId1 = afterFail1.lastSentMessageId!;
  assert.ok(validMsgId1 > 0);

  // Run 2: Deletion succeeds, but PostSender fails to deliver new post
  sendMockHandler = async () => ({ ok: false, error: 'Telegram 500 Network Error' });
  MessageScheduler.resetTriggerCooldownCache();
  const msgFail2 = {
    message_id: 209,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'faildel'
  };
  const failTriggerRes = await messageScheduler.handleIncomingMessageTrigger(msgFail2, testChatA, 'faildel');
  assert.strictEqual(failTriggerRes, false, 'Trigger must fail when PostSender fails');

  const afterFail2 = db.getScheduleById(schedSendFail.id)!;
  assert.strictEqual(afterFail2.lastSentMessageId, undefined, 'lastSentMessageId must NOT record a failed message');
  console.log('✅ [PASS] TEST 5 passed');

  // ------------------------------------------------------------------------
  // TEST 6: Timer and trigger execution preserve independent per-schedule deletion state
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 6: Timer and trigger execution preserve independent per-schedule deletion state ---');
  deleteCalls.length = 0;
  deleteMockHandler = async () => ({ ok: true });
  sendMockHandler = null;
  MessageScheduler.resetTriggerCooldownCache();

  // Schedule A: Trigger schedule in testChatA
  const schedA = db.addSchedule({
    chatId: testChatA,
    name: 'Hybrid Sched A',
    message: 'Message A',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'hybrid',
    autoDeletePrevious: true,
    enabled: true
  });

  // Schedule B: Timer-only schedule in testChatB
  const schedB = db.addSchedule({
    chatId: testChatB,
    name: 'Timer Sched B',
    message: 'Message B',
    scheduleType: 'interval',
    intervalMs: 60000,
    autoDeletePrevious: true,
    nextRun: new Date(Date.now() - 1000).toISOString(),
    enabled: true
  });

  // 1. Run trigger on Schedule A
  const msgHyb1 = {
    message_id: 210,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'hybrid'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgHyb1, testChatA, 'hybrid');
  const a1 = db.getScheduleById(schedA.id)!;
  assert.ok(a1.lastSentMessageId! > 0);

  // 2. Run timer on Schedule B
  await (messageScheduler as any).checkAndExecuteSchedules();
  const b1 = db.getScheduleById(schedB.id)!;
  assert.ok(b1.lastSentMessageId! > 0);
  assert.notStrictEqual(a1.lastSentMessageId, b1.lastSentMessageId, 'Independent message IDs');

  // 3. Now run Timer on Schedule A (cross-execution path: trigger first, then timer!)
  deleteCalls.length = 0;
  const beforeTimerA = db.getScheduleById(schedA.id)!;
  console.log('Before Timer on Schedule A:', {
    id: beforeTimerA.id,
    nextRun: beforeTimerA.nextRun,
    lastSentMessageId: beforeTimerA.lastSentMessageId,
    autoDeletePrevious: beforeTimerA.autoDeletePrevious,
    enabled: beforeTimerA.enabled
  });
  const initialSentIdA = beforeTimerA.lastSentMessageId;
  db.updateSchedule(schedA.id, {
    nextRun: new Date(Date.now() - 1000).toISOString()
  });
  await (messageScheduler as any).checkAndExecuteSchedules();
  console.log('Delete calls after Timer run:', deleteCalls);
  const afterTimerA = db.getScheduleById(schedA.id)!;
  console.log('After Timer on Schedule A:', {
    lastSentMessageId: afterTimerA.lastSentMessageId,
    pendingDeleteMessageIds: afterTimerA.pendingDeleteMessageIds
  });
  assert.ok(deleteCalls.some(c => Number(c.chatId) === Number(testChatA) && Number(c.messageId) === Number(initialSentIdA)), 'Timer run must delete message sent by trigger');

  // 4. Now run Trigger on Schedule B after adding trigger keyword
  const initialSentIdB = db.getScheduleById(schedB.id)!.lastSentMessageId;
  db.updateSchedule(schedB.id, { triggerKeyword: 'triggerb' });
  deleteCalls.length = 0;
  MessageScheduler.resetTriggerCooldownCache();
  const msgB2 = {
    message_id: 211,
    chat: { id: testChatB, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'triggerb'
  };
  await messageScheduler.handleIncomingMessageTrigger(msgB2, testChatB, 'triggerb');
  assert.ok(deleteCalls.some(c => Number(c.chatId) === Number(testChatB) && Number(c.messageId) === Number(initialSentIdB)), 'Trigger run must delete message sent by timer');

  console.log('✅ [PASS] TEST 6 passed');

  // ------------------------------------------------------------------------
  // TEST 7: String message IDs are safely coerced and deleted
  // ------------------------------------------------------------------------
  console.log('\n--- TEST 7: String message IDs are safely coerced and deleted ---');
  deleteCalls.length = 0;
  deleteMockHandler = async (chatId, mId) => {
    assert.strictEqual(typeof mId, 'number', 'deleteMessage must receive numeric messageId');
    return { ok: true };
  };
  sendMockHandler = null;
  MessageScheduler.resetTriggerCooldownCache();

  const schedStringId = db.addSchedule({
    chatId: testChatA,
    name: 'String ID Sched',
    message: 'Message String ID',
    scheduleType: 'interval',
    intervalMs: 60000,
    triggerKeyword: 'stringid',
    autoDeletePrevious: true,
    enabled: true
  });

  // Simulate legacy/string storage where IDs were stored as strings
  (schedStringId as any).lastSentMessageId = '7777';
  (schedStringId as any).pendingDeleteMessageIds = ['6666'];
  db.updateSchedule(schedStringId.id, {
    lastSentMessageId: '7777' as any,
    pendingDeleteMessageIds: ['6666'] as any
  });

  const msgStr1 = {
    message_id: 212,
    chat: { id: testChatA, type: 'supergroup' as const },
    date: Math.floor(Date.now() / 1000),
    text: 'stringid'
  };

  const strTriggerRes = await messageScheduler.handleIncomingMessageTrigger(msgStr1, testChatA, 'stringid');
  assert.strictEqual(strTriggerRes, true, 'Trigger with string message IDs must succeed');

  assert.strictEqual(deleteCalls.length, 2, 'Must attempt deletion of both string pending ID and string lastSentMessageId');
  assert.ok(deleteCalls.some(c => c.messageId === 6666), 'Must delete message 6666');
  assert.ok(deleteCalls.some(c => c.messageId === 7777), 'Must delete message 7777');

  const afterStr = db.getScheduleById(schedStringId.id)!;
  assert.strictEqual(typeof afterStr.lastSentMessageId, 'number', 'New lastSentMessageId must be a number');
  assert.strictEqual(afterStr.pendingDeleteMessageIds, undefined, 'pendingDeleteMessageIds should be cleared');
  console.log('✅ [PASS] TEST 7 passed');

  console.log('\n====================================================');
  console.log('🎉 ALL TESTS PASSED SUCCESSFULLY');
  console.log('====================================================');
}

runTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
