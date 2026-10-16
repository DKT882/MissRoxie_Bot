import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { db } from '../server/db/storage.js';
import { authManager } from '../server/auth/authManager.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler } from '../server/telegram/scheduler.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { ScheduledMessage } from '../server/telegram/types.js';

process.env.PORT = '9915';
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
      port: 9915,
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
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Starting Schedule Persistence & MongoDB Sync Test Suite');
  console.log('================================================================\n');

  const { startServer } = await import('../server.js');
  await startServer();
  await new Promise(r => setTimeout(r, 600));

  authManager.createOperator({
    username: 'op_sched_tester',
    name: 'Schedule Tester',
    password: 'TesterPassword123!',
    role: 'MODERATOR'
  });
  const auth = authManager.authenticate('op_sched_tester', 'TesterPassword123!');
  const sessionId = auth.session!.sessionId;
  const authHeaders = { 'x-session-id': sessionId };

  const testChatId = -1009998887711;

  // Track Mongo updateGroupSchedules calls
  const mongoCalls: Array<{ chatId: string | number; schedules: any[] }> = [];
  const originalUpdateGroupSchedules = MongoStorageService.updateGroupSchedules;
  MongoStorageService.updateGroupSchedules = async (chatId, schedules, targetBotId) => {
    mongoCalls.push({ chatId, schedules: JSON.parse(JSON.stringify(schedules)) });
    return true;
  };

  const originalMongoGetStatus = mongoManager.getStatus;
  mongoManager.getStatus = () => ({
    isConfigured: true,
    isConnected: true,
    dbName: 'roxie',
    lastError: null,
    lastConnectedAt: new Date().toISOString()
  });

  try {
    // Clean test chat schedules
    db.getGroupSchedules(testChatId).forEach(s => db.deleteSchedule(testChatId, s.id));
    mongoCalls.length = 0;

    // ------------------------------------------------------------------------
    // TEST 1: Creation persists to RAM, disk, and triggers MongoDB sync
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Creation persists and triggers MongoDB sync ---');
    const createRes = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatId,
      name: 'Initial Schedule',
      message: 'Hello World Broadcast',
      scheduleType: 'interval',
      intervalMs: 1800000,
      intervalFormatted: '30m',
      enabled: true
    }, authHeaders);

    assert.strictEqual(createRes.status, 200);
    const createdId = createRes.data.schedule.id;
    assert.ok(createdId, 'Schedule ID must be returned');

    // Verify in RAM
    const inMem1 = db.getScheduleById(createdId);
    assert.ok(inMem1, 'Schedule must be present in RAM');
    assert.strictEqual(inMem1.message, 'Hello World Broadcast');

    // Verify Mongo sync was triggered
    assert.ok(mongoCalls.some(c => Number(c.chatId) === testChatId && c.schedules.some(s => s.id === createdId)),
      'MongoDB updateGroupSchedules must be invoked on schedule creation');
    pass('Schedule creation persists to RAM and invokes MongoDB sync');

    // ------------------------------------------------------------------------
    // TEST 2: Editing schedule persists updates and synchronizes with Mongo
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Editing schedule persists updates and syncs with Mongo ---');
    mongoCalls.length = 0;

    const specificNextRun = new Date(Date.now() + 7200000).toISOString();
    const updateRes = await apiRequest('PUT', `/api/dashboard/schedules/${createdId}`, {
      message: 'Updated Message Content',
      intervalMs: 7200000,
      intervalFormatted: '2 hours',
      nextRun: specificNextRun,
      pinAfterSend: true
    }, authHeaders);

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.schedule.message, 'Updated Message Content');
    assert.strictEqual(updateRes.data.schedule.intervalMs, 7200000);
    assert.strictEqual(updateRes.data.schedule.nextRun, specificNextRun);
    assert.strictEqual(updateRes.data.schedule.pinAfterSend, true);

    const inMem2 = db.getScheduleById(createdId);
    assert.strictEqual(inMem2?.message, 'Updated Message Content');
    assert.strictEqual(inMem2?.nextRun, specificNextRun);

    assert.ok(mongoCalls.some(c => Number(c.chatId) === testChatId && c.schedules.some(s => s.id === createdId && s.message === 'Updated Message Content')),
      'MongoDB updateGroupSchedules must be invoked with updated message content');
    pass('Schedule edit persists updated values and synchronizes with Mongo');

    // ------------------------------------------------------------------------
    // TEST 3: Hydration from Mongo (restoreGroupData) authoritatively reflects state
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: restoreGroupData authoritatively updates RAM ---');
    const simulatedMongoSchedules = [
      {
        id: createdId,
        chatId: testChatId,
        message: 'Direct Mongo Synced Message',
        scheduleType: 'interval',
        intervalMs: 7200000,
        intervalFormatted: '2 hours',
        nextRun: specificNextRun,
        enabled: true
      }
    ];

    db.restoreGroupData(testChatId, {
      chat: { id: testChatId, title: 'Test Group' },
      schedules: simulatedMongoSchedules
    });

    const hydrated1 = db.getScheduleById(createdId);
    assert.strictEqual(hydrated1?.message, 'Direct Mongo Synced Message',
      'Hydration from Mongo must update existing schedule in RAM without stale caching');
    pass('restoreGroupData authoritatively updates existing schedule in RAM');

    // ------------------------------------------------------------------------
    // TEST 4: Schedule deletion removes record permanently and syncs to Mongo
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Schedule deletion removes record and syncs with Mongo ---');
    mongoCalls.length = 0;

    const delRes = await apiRequest('DELETE', `/api/dashboard/schedules/${createdId}`, undefined, authHeaders);
    assert.strictEqual(delRes.status, 200);

    // RAM check
    assert.strictEqual(db.getScheduleById(createdId), undefined, 'Schedule must be removed from RAM');

    // Mongo check
    assert.ok(mongoCalls.some(c => Number(c.chatId) === testChatId && !c.schedules.some(s => s.id === createdId)),
      'MongoDB updateGroupSchedules must be invoked without the deleted schedule');

    // Simulate container restart / re-hydration with empty schedules from Mongo
    db.restoreGroupData(testChatId, {
      chat: { id: testChatId, title: 'Test Group' },
      schedules: []
    });

    assert.strictEqual(db.getScheduleById(createdId), undefined,
      'Deleted schedule must NOT be resurrected upon restoreGroupData with empty schedules');
    pass('Schedule deletion removes record permanently and prevents zombie resurrection');

    // ------------------------------------------------------------------------
    // TEST 5: Toggle schedule persists enabled: false to RAM, disk, and Mongo
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Toggle schedule persists state to Mongo ---');
    const toggleCreate = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatId,
      name: 'Toggle Test Schedule',
      message: 'Pause Me',
      scheduleType: 'interval',
      intervalMs: 3600000,
      intervalFormatted: '1h',
      enabled: true
    }, authHeaders);

    assert.strictEqual(toggleCreate.status, 200);
    const toggleId = toggleCreate.data.schedule.id;

    mongoCalls.length = 0;
    const toggleRes = await apiRequest('POST', `/api/dashboard/schedules/${toggleId}/toggle`, {
      enabled: false
    }, authHeaders);

    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleRes.data.schedule.enabled, false);

    const inMemToggle = db.getScheduleById(toggleId);
    assert.strictEqual(inMemToggle?.enabled, false);

    assert.ok(mongoCalls.some(c => Number(c.chatId) === testChatId && c.schedules.some(s => s.id === toggleId && s.enabled === false)),
      'MongoDB sync must receive enabled: false');
    pass('Toggle schedule persists enabled: false and synchronizes with Mongo');

    // ------------------------------------------------------------------------
    // TEST 6: Daily schedule recurrence defaults to 24h intervalMs and does not pause
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Daily schedule recurrence defaults to 24h intervalMs ---');
    const dailyCreate = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatId,
      name: 'Daily Morning Announcement',
      message: 'Good morning group!',
      scheduleType: 'daily',
      nextRun: new Date(Date.now() - 1000).toISOString(), // Ready to execute
      enabled: true
    }, authHeaders);

    assert.strictEqual(dailyCreate.status, 200);
    const dailyId = dailyCreate.data.schedule.id;
    assert.strictEqual(dailyCreate.data.schedule.scheduleType, 'daily');
    assert.strictEqual(dailyCreate.data.schedule.intervalMs, 86400000, 'Daily schedule must resolve intervalMs to 86400000 (24h)');

    // Mock Telegram send to execute daily schedule
    let executedDaily = false;
    const originalSendMessage = (telegramApi as any).sendMessage;
    (telegramApi as any).sendMessage = async (chatId: number, text: string) => {
      executedDaily = true;
      return { ok: true, result: { message_id: 8888, chat: { id: chatId }, date: Math.floor(Date.now() / 1000) } };
    };

    MessageScheduler.resetExecutingScheduleIds();
    await messageScheduler.checkAndExecuteSchedules();

    const afterDailyExec = db.getScheduleById(dailyId);
    assert.ok(afterDailyExec, 'Daily schedule must still exist');
    assert.strictEqual(afterDailyExec.enabled, true, 'Daily schedule must NOT be paused after execution');
    assert.ok(afterDailyExec.nextRun && afterDailyExec.nextRun.length > 0, 'Daily schedule must have nextRun populated');
    const nextRunTime = new Date(afterDailyExec.nextRun).getTime();
    assert.ok(nextRunTime > Date.now() + 86000000, 'Daily schedule nextRun must be scheduled ~24h in future');
    pass('Daily schedule recurrence advances nextRun by 24h and does not pause or revert to 12:00');

    // Restore original mock
    (telegramApi as any).sendMessage = originalSendMessage;

    // Clean up
    db.deleteSchedule(testChatId, toggleId);
    db.deleteSchedule(testChatId, dailyId);

  } catch (err: any) {
    fail('Schedule persistence test error', err);
  } finally {
    MongoStorageService.updateGroupSchedules = originalUpdateGroupSchedules;
    mongoManager.getStatus = originalMongoGetStatus;
  }

  console.log('\n================================================================');
  console.log(`🎉 Schedule Persistence Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
