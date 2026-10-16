import assert from 'assert';
import http from 'http';
import { db } from '../server/db/storage.js';
import { authManager } from '../server/auth/authManager.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler } from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage, TelegramMessage } from '../server/telegram/types.js';

process.env.PORT = '9914';
process.env.NODE_ENV = 'production';
process.env.ROXIE_TEST_MODE = 'false';
process.env.ENABLE_SCHEDULER = 'true';
process.env.DASHBOARD_ADMIN_PASSWORD = 'TestPassword123!';
process.env.DASHBOARD_SESSION_SECRET = 'TestSessionSecret1234567890!';
authManager.reloadConfig();

let passed = 0;
let failed = 0;

function pass(msg: string) {
  console.log(`✅ [PASS] ${msg}`);
  passed++;
}

function fail(msg: string, err?: any) {
  console.error(`❌ [FAIL] ${msg}`, err || '');
  failed++;
}

function apiRequest(
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload !== undefined) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: 9914,
      path: urlPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(resBody), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode || 0, data: resBody, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Starting Schedule Edit Runtime Execution Regression Test Suite');
  console.log('================================================================');

  const { startServer } = await import('../server.js');
  await startServer();
  console.log('✅ Server listening on port 9914');

  authManager.createOperator({
    username: 'op_moderator_exec',
    name: 'Test Moderator Exec',
    password: 'ModeratorPassword123!',
    role: 'MODERATOR'
  });
  const modAuth = authManager.authenticate('op_moderator_exec', 'ModeratorPassword123!');
  const modSessionId = modAuth.session!.sessionId;
  const modHeaders = { 'x-session-id': modSessionId };

  const testChatA = -100999555111;
  const testChatB = -100999555222;

  // Mock Telegram API deliveries & deletions
  let sentMessages: Array<{ chatId: number; text?: string; caption?: string; options?: any }> = [];
  let deletedMessages: Array<{ chatId: number; messageId: number }> = [];
  let nextMessageId = 5000;

  const originalSendMessage = (telegramApi as any).sendMessage;
  const originalSendPhoto = (telegramApi as any).sendPhoto;
  const originalSendVideo = (telegramApi as any).sendVideo;
  const originalSendAnimation = (telegramApi as any).sendAnimation;
  const originalSendDocument = (telegramApi as any).sendDocument;
  const originalSendSticker = (telegramApi as any).sendSticker;
  const originalDeleteMessage = (telegramApi as any).deleteMessage;

  const handleMockSend = (chatId: number, text?: string, caption?: string, options?: any) => {
    const msgId = ++nextMessageId;
    if (chatId === testChatA || chatId === testChatB) {
      sentMessages.push({ chatId, text, caption, options });
    }
    return {
      ok: true,
      result: {
        message_id: msgId,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    return handleMockSend(chatId, text, undefined, options);
  };

  (telegramApi as any).sendPhoto = async (chatId: number, photo: any, options?: any) => {
    return handleMockSend(chatId, undefined, options?.caption, options);
  };

  (telegramApi as any).sendVideo = async (chatId: number, video: any, options?: any) => {
    return handleMockSend(chatId, undefined, options?.caption, options);
  };

  (telegramApi as any).sendAnimation = async (chatId: number, anim: any, options?: any) => {
    return handleMockSend(chatId, undefined, options?.caption, options);
  };

  (telegramApi as any).sendDocument = async (chatId: number, doc: any, options?: any) => {
    return handleMockSend(chatId, undefined, options?.caption, options);
  };

  (telegramApi as any).sendSticker = async (chatId: number, sticker: any, options?: any) => {
    return handleMockSend(chatId, undefined, undefined, options);
  };

  (telegramApi as any).deleteMessage = async (chatId: number, messageId: number) => {
    if (chatId === testChatA || chatId === testChatB) {
      deletedMessages.push({ chatId, messageId });
    }
    return { ok: true };
  };

  try {
    // Pre-clear any lingering test schedules for test chats
    db.getGroupSchedules(testChatA).forEach(s => db.deleteSchedule(testChatA, s.id));
    db.getGroupSchedules(testChatB).forEach(s => db.deleteSchedule(testChatB, s.id));

    // ------------------------------------------------------------------------
    // TEST 1: Editing message text causes the next execution to send the new text
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Editing message text sends new text on next execution ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();

    const createRes1 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Text Test Schedule',
      message: 'Original Initial Message',
      messageText: 'Original Initial Message',
      scheduleType: 'interval',
      intervalMs: 3600000,
      intervalFormatted: '1h',
      enabled: true
    }, modHeaders);
    assert.strictEqual(createRes1.status, 200);
    const sched1Id = createRes1.data.schedule.id;

    // Edit only message (simulates caller/dashboard sending message or messageText)
    const updateRes1 = await apiRequest('PUT', `/api/dashboard/schedules/${sched1Id}`, {
      message: 'Brand New Updated Announcement Text'
    }, modHeaders);
    assert.strictEqual(updateRes1.status, 200);
    assert.strictEqual(updateRes1.data.schedule.message, 'Brand New Updated Announcement Text');
    assert.strictEqual(updateRes1.data.schedule.messageText, 'Brand New Updated Announcement Text');

    // Trigger scheduled execution
    const sched1 = db.getScheduleById(sched1Id)!;
    sched1.nextRun = new Date(Date.now() - 1000).toISOString();
    await messageScheduler.checkAndExecuteSchedules();

    assert.strictEqual(sentMessages.length, 1, 'Exactly one message must be sent to testChatA');
    assert.strictEqual(sentMessages[0].chatId, testChatA);
    assert.strictEqual(sentMessages[0].text, 'Brand New Updated Announcement Text', 'Must send the NEW updated text, not stale original text');
    pass('TEST 1: Editing message text causes the next scheduled execution to send the new text');

    // ------------------------------------------------------------------------
    // TEST 2: Editing interval updates subsequent execution timing
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Editing interval updates execution timing ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();

    const createRes2 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Interval Test Schedule',
      message: 'Interval Broadcast',
      scheduleType: 'interval',
      intervalMs: 3600000, // 1 hour
      intervalFormatted: '1h',
      enabled: true
    }, modHeaders);
    assert.strictEqual(createRes2.status, 200);
    const sched2Id = createRes2.data.schedule.id;

    // Edit interval to 15m (900000 ms) via PUT without explicit nextRun
    const nowBeforeEdit = Date.now();
    const updateRes2 = await apiRequest('PUT', `/api/dashboard/schedules/${sched2Id}`, {
      intervalStr: '15m'
    }, modHeaders);
    assert.strictEqual(updateRes2.status, 200);
    assert.strictEqual(updateRes2.data.schedule.intervalMs, 900000);
    assert.strictEqual(updateRes2.data.schedule.intervalFormatted, '15 minutes');

    // Verify nextRun was refreshed to match the 15m interval
    const updatedNextRunMs = new Date(updateRes2.data.schedule.nextRun).getTime();
    assert.ok(updatedNextRunMs >= nowBeforeEdit + 890000 && updatedNextRunMs <= nowBeforeEdit + 910000, 'nextRun must be refreshed to ~15m');

    // Advance to due and execute
    const sched2 = db.getScheduleById(sched2Id)!;
    sched2.nextRun = new Date(Date.now() - 1000).toISOString();
    await messageScheduler.checkAndExecuteSchedules();

    // Verify after execution nextRun advances by 15 minutes (900000ms), NOT by 1 hour (3600000ms)
    const afterRunSched2 = db.getScheduleById(sched2Id)!;
    const postRunNextMs = new Date(afterRunSched2.nextRun!).getTime();
    const expectedAdvancement = Date.now() + 900000;
    assert.ok(Math.abs(postRunNextMs - expectedAdvancement) < 5000, 'Subsequent execution timing must advance by the updated 15m interval');
    pass('TEST 2: Editing interval updates subsequent execution timing');

    // ------------------------------------------------------------------------
    // TEST 3: Editing target chat sends to the new destination
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Editing target chat sends to new destination ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();

    const createRes3 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Destination Switch Schedule',
      message: 'Moved Message',
      scheduleType: 'interval',
      intervalMs: 3600000,
      enabled: true,
      triggerKeyword: 'movedkeyword'
    }, modHeaders);
    assert.strictEqual(createRes3.status, 200);
    const sched3Id = createRes3.data.schedule.id;

    // Update chatId from testChatA to testChatB
    const updateRes3 = await apiRequest('PUT', `/api/dashboard/schedules/${sched3Id}`, {
      chatId: testChatB
    }, modHeaders);
    assert.strictEqual(updateRes3.status, 200);
    assert.strictEqual(updateRes3.data.schedule.chatId, testChatB);

    // 3a: Timer path sends to testChatB
    const sched3 = db.getScheduleById(sched3Id)!;
    sched3.nextRun = new Date(Date.now() - 1000).toISOString();
    await messageScheduler.checkAndExecuteSchedules();

    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].chatId, testChatB, 'Must send to updated chat B, not old chat A');

    // 3b: Trigger path in old chat A does not trigger; trigger path in new chat B does trigger
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const triggerMsgA: TelegramMessage = {
      message_id: 3001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 8881, is_bot: false, first_name: 'Bob' },
      text: 'movedkeyword'
    };
    const trigResA = await messageScheduler.handleIncomingMessageTrigger(triggerMsgA, testChatA, triggerMsgA.text!);
    assert.strictEqual(trigResA, false, 'Old chat A must not trigger after destination switch');
    assert.strictEqual(sentMessages.length, 0);

    const triggerMsgB: TelegramMessage = {
      message_id: 3002,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatB, type: 'supergroup' },
      from: { id: 8881, is_bot: false, first_name: 'Bob' },
      text: 'movedkeyword'
    };
    const trigResB = await messageScheduler.handleIncomingMessageTrigger(triggerMsgB, testChatB, triggerMsgB.text!);
    assert.strictEqual(trigResB, true, 'New chat B triggers successfully');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].chatId, testChatB);
    pass('TEST 3: Editing target chat sends to the new destination in both timer and trigger paths');

    // ------------------------------------------------------------------------
    // TEST 4: Editing trigger keyword changes which phrase triggers the schedule
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Editing trigger keyword changes trigger matching ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const createRes4 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Trigger Keyword Test',
      message: 'Trigger Response Message',
      scheduleType: 'interval',
      intervalMs: 3600000,
      enabled: true,
      triggerKeyword: 'original_phrase'
    }, modHeaders);
    assert.strictEqual(createRes4.status, 200);
    const sched4Id = createRes4.data.schedule.id;

    // Edit trigger keyword to 'brand_new_phrase'
    const updateRes4 = await apiRequest('PUT', `/api/dashboard/schedules/${sched4Id}`, {
      triggerKeyword: 'brand_new_phrase'
    }, modHeaders);
    assert.strictEqual(updateRes4.status, 200);
    assert.strictEqual(updateRes4.data.schedule.triggerKeyword, 'brand_new_phrase');

    // Incoming message with old phrase must NOT trigger
    const oldPhraseMsg: TelegramMessage = {
      message_id: 4001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 8882, is_bot: false, first_name: 'Charlie' },
      text: 'hello original_phrase here'
    };
    const oldRes = await messageScheduler.handleIncomingMessageTrigger(oldPhraseMsg, testChatA, oldPhraseMsg.text!);
    assert.strictEqual(oldRes, false, 'Old phrase must no longer trigger');
    assert.strictEqual(sentMessages.length, 0);

    // Incoming message with new phrase MUST trigger
    const newPhraseMsg: TelegramMessage = {
      message_id: 4002,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 8882, is_bot: false, first_name: 'Charlie' },
      text: 'hello brand_new_phrase here'
    };
    const newRes = await messageScheduler.handleIncomingMessageTrigger(newPhraseMsg, testChatA, newPhraseMsg.text!);
    assert.strictEqual(newRes, true, 'New phrase triggers successfully');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Trigger Response Message');
    pass('TEST 4: Editing trigger keyword changes which phrase triggers the schedule');

    // ------------------------------------------------------------------------
    // TEST 5: A running or previously registered timer cannot execute stale content after an edit
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Running/registered timer does not execute stale content ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();

    const createRes5 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Stale Timer Defense',
      message: 'Original Stale Body',
      scheduleType: 'interval',
      intervalMs: 3600000,
      enabled: true
    }, modHeaders);
    assert.strictEqual(createRes5.status, 200);
    const sched5Id = createRes5.data.schedule.id;

    // Simulate timer loop preparing to execute sched5: nextRun was due
    const sched5 = db.getScheduleById(sched5Id)!;
    sched5.nextRun = new Date(Date.now() - 500).toISOString();

    // Now an edit occurs right before execution
    await apiRequest('PUT', `/api/dashboard/schedules/${sched5Id}`, {
      message: 'Freshly Edited Content After Delay'
    }, modHeaders);

    // Timer fires
    await messageScheduler.checkAndExecuteSchedules();
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Freshly Edited Content After Delay', 'Must execute fresh content, never stale snapshot');

    // 5b: If nextRun was moved to the future during edit, timer must NOT execute it now
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();
    sched5.nextRun = new Date(Date.now() - 500).toISOString(); // marked due
    await apiRequest('PUT', `/api/dashboard/schedules/${sched5Id}`, {
      nextRun: new Date(Date.now() + 7200000).toISOString() // pushed 2h into future
    }, modHeaders);

    await messageScheduler.checkAndExecuteSchedules();
    assert.strictEqual(sentMessages.length, 0, 'Schedule pushed to future must not execute');

    // 5c: If schedule was deleted before timer runs, it must NOT execute via fallback
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();
    const createRes5c = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Delete Defense',
      message: 'Should Never Send',
      scheduleType: 'interval',
      intervalMs: 3600000,
      enabled: true
    }, modHeaders);
    const sched5cId = createRes5c.data.schedule.id;
    const sched5c = db.getScheduleById(sched5cId)!;
    sched5c.nextRun = new Date(Date.now() - 1000).toISOString();

    // Delete schedule
    await apiRequest('DELETE', `/api/dashboard/schedules/${sched5cId}`, undefined, modHeaders);

    // Timer fires
    await messageScheduler.checkAndExecuteSchedules();
    assert.strictEqual(sentMessages.length, 0, 'Deleted schedule must never execute via stale snapshot fallback');
    pass('TEST 5: Running or previously registered timer cannot execute stale content after an edit');

    // ------------------------------------------------------------------------
    // TEST 6: pendingDeleteMessageIds, lastSentMessageId, and unrelated fields survive schedule updates
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Deletion-reliability state survives schedule edits ---');
    sentMessages = [];
    deletedMessages = [];
    MessageScheduler.resetExecutingScheduleIds();

    const createRes6 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'State Survival Schedule',
      message: 'Original Message With Deletion State',
      scheduleType: 'interval',
      intervalMs: 3600000,
      autoDeletePrevious: true,
      enabled: true
    }, modHeaders);
    assert.strictEqual(createRes6.status, 200);
    const sched6Id = createRes6.data.schedule.id;

    // Attach pending deletion state
    const sched6 = db.getScheduleById(sched6Id)!;
    sched6.lastSentMessageId = 888;
    sched6.pendingDeleteMessageIds = [886, 887];
    db.updateSchedule(sched6Id, {
      lastSentMessageId: 888,
      pendingDeleteMessageIds: [886, 887]
    });

    // Perform schedule edit on message and interval
    const updateRes6 = await apiRequest('PUT', `/api/dashboard/schedules/${sched6Id}`, {
      message: 'Updated Text Preserving Deletion State',
      intervalStr: '2h'
    }, modHeaders);
    assert.strictEqual(updateRes6.status, 200);

    const memSched6 = db.getScheduleById(sched6Id)!;
    assert.strictEqual(memSched6.lastSentMessageId, 888, 'lastSentMessageId must survive edit');
    assert.deepStrictEqual(memSched6.pendingDeleteMessageIds, [886, 887], 'pendingDeleteMessageIds must survive edit');
    assert.strictEqual(memSched6.autoDeletePrevious, true, 'autoDeletePrevious must survive edit');

    // Execute schedule: verify processScheduleDeletions cleans up the preserved IDs
    memSched6.nextRun = new Date(Date.now() - 1000).toISOString();
    await messageScheduler.checkAndExecuteSchedules();

    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Updated Text Preserving Deletion State');
    const deletedIds = deletedMessages.map(d => d.messageId);
    assert.ok(deletedIds.includes(886), 'Preserved ID 886 must be deleted');
    assert.ok(deletedIds.includes(887), 'Preserved ID 887 must be deleted');
    assert.ok(deletedIds.includes(888), 'Preserved lastSentMessageId 888 must be deleted');
    pass('TEST 6: pendingDeleteMessageIds, lastSentMessageId, and unrelated fields survive schedule updates');

    // ------------------------------------------------------------------------
    // TEST 7: Normal timer and keyword-trigger paths both use latest configuration
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Both timer and keyword-trigger paths use latest config ---');
    sentMessages = [];
    MessageScheduler.resetExecutingScheduleIds();
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const createRes7 = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Dual Path Schedule',
      message: 'Initial Dual Path Text',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'dualtrigger',
      inlineKeyboard: [[{ text: 'Old Button', url: 'https://example.com/old' }]],
      replyToMessageId: 100,
      enabled: true
    }, modHeaders);
    assert.strictEqual(createRes7.status, 200);
    const sched7Id = createRes7.data.schedule.id;

    // Update message, buttons, and reply-to
    await apiRequest('PUT', `/api/dashboard/schedules/${sched7Id}`, {
      message: 'Latest Unified Content',
      inlineKeyboard: [[{ text: 'New Button', url: 'https://example.com/new' }]],
      replyToMessageId: 200
    }, modHeaders);

    // 7a: Timer path uses latest config
    const sched7 = db.getScheduleById(sched7Id)!;
    sched7.nextRun = new Date(Date.now() - 1000).toISOString();
    await messageScheduler.checkAndExecuteSchedules();

    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Latest Unified Content');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 200);
    assert.strictEqual(sentMessages[0].options?.reply_markup?.inline_keyboard?.[0]?.[0]?.text, 'New Button');

    // 7b: Trigger path uses latest config
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    // Update message again
    await apiRequest('PUT', `/api/dashboard/schedules/${sched7Id}`, {
      message: 'Latest Triggered Content',
      replyToMessageId: 300
    }, modHeaders);

    const dualMsg: TelegramMessage = {
      message_id: 7001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 8883, is_bot: false, first_name: 'Diana' },
      text: 'dualtrigger'
    };
    const dualRes = await messageScheduler.handleIncomingMessageTrigger(dualMsg, testChatA, dualMsg.text!);
    assert.strictEqual(dualRes, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Latest Triggered Content');
    assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 300);
    assert.strictEqual(sentMessages[0].options?.reply_markup?.inline_keyboard?.[0]?.[0]?.text, 'New Button');
    pass('TEST 7: Normal timer and keyword-trigger paths both use latest configuration');

    // Cleanup schedules
    db.deleteSchedule(testChatA, sched1Id);
    db.deleteSchedule(testChatA, sched2Id);
    db.deleteSchedule(testChatB, sched3Id);
    db.deleteSchedule(testChatA, sched4Id);
    db.deleteSchedule(testChatA, sched5Id);
    db.deleteSchedule(testChatA, sched6Id);
    db.deleteSchedule(testChatA, sched7Id);

    authManager.logout(modSessionId);

    console.log('\n================================================================');
    console.log(`🎉 All Schedule Edit Execution Tests Completed: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
    process.exit(0);
  } finally {
    (telegramApi as any).sendMessage = originalSendMessage;
    (telegramApi as any).sendPhoto = originalSendPhoto;
    (telegramApi as any).sendVideo = originalSendVideo;
    (telegramApi as any).sendAnimation = originalSendAnimation;
    (telegramApi as any).sendDocument = originalSendDocument;
    (telegramApi as any).sendSticker = originalSendSticker;
    (telegramApi as any).deleteMessage = originalDeleteMessage;
  }
}

run().catch((err) => {
  console.error('Test run failed with error:', err);
  process.exit(1);
});
