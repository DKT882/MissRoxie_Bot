import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { db } from '../server/db/storage.js';
import { authManager } from '../server/auth/authManager.js';

process.env.PORT = '9913';
process.env.NODE_ENV = 'production';
process.env.ROXIE_TEST_MODE = 'false'; // Test real auth checks as well!
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
      port: 9913,
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
  console.log('🧪 Starting Schedule Edit & Persistence Regression Test Suite');
  console.log('================================================================');

  const { startServer } = await import('../server.js');
  await startServer();
  console.log('✅ Server listening on port 9913');

  // Setup sessions for testing: MODERATOR and VIEWER
  authManager.createOperator({
    username: 'op_viewer_sched',
    name: 'Test Viewer',
    password: 'ViewerPassword123!',
    role: 'VIEWER'
  });
  const viewerAuth = authManager.authenticate('op_viewer_sched', 'ViewerPassword123!');
  const viewerSessionId = viewerAuth.session!.sessionId;

  authManager.createOperator({
    username: 'op_moderator_sched',
    name: 'Test Moderator',
    password: 'ModeratorPassword123!',
    role: 'MODERATOR'
  });
  const modAuth = authManager.authenticate('op_moderator_sched', 'ModeratorPassword123!');
  const modSessionId = modAuth.session!.sessionId;

  const modHeaders = { 'x-session-id': modSessionId };
  const viewerHeaders = { 'x-session-id': viewerSessionId };

  const testChatId = -1009998887766;

  // 1. Unauthenticated and Unauthorized checks
  console.log('\n--- TEST 1: Authorization checks for Schedule mutations ---');
  const unauthRes = await apiRequest('PUT', '/api/dashboard/schedules/TEST123', { name: 'New Name' });
  assert.strictEqual(unauthRes.status, 401, 'Unauthenticated PUT must return 401');
  pass('Unauthenticated PUT /api/dashboard/schedules/:id rejected with 401');

  const viewerRes = await apiRequest('PUT', '/api/dashboard/schedules/TEST123', { name: 'New Name' }, viewerHeaders);
  assert.strictEqual(viewerRes.status, 403, 'VIEWER PUT must return 403 Forbidden');
  pass('VIEWER role PUT /api/dashboard/schedules/:id rejected with 403 Forbidden');

  // 2. Create initial schedule with MODERATOR
  console.log('\n--- TEST 2: Create initial schedule ---');
  const createPayload = {
    chatId: testChatId,
    name: 'Initial Schedule',
    message: 'Initial Message Content',
    scheduleType: 'interval',
    intervalStr: '1h',
    intervalMs: 3600000,
    intervalFormatted: '1h',
    timezone: 'UTC',
    contentType: 'text',
    enabled: true,
    pinAfterSend: false,
    replyToLatest: false,
    autoDeletePrevious: false,
    triggerKeyword: 'hello_roxie',
    inlineKeyboard: [[{ text: 'Initial Link', url: 'https://example.com/initial' }]]
  };

  const createRes = await apiRequest('POST', '/api/dashboard/schedules', createPayload, modHeaders);
  assert.strictEqual(createRes.status, 200, 'MODERATOR should create schedule successfully');
  assert.strictEqual(createRes.data.success, true);
  assert.ok(createRes.data.schedule?.id, 'Created schedule must have an id');
  const scheduleId = createRes.data.schedule.id;
  pass(`Schedule created with ID ${scheduleId}`);

  // 3. Edit existing schedule via PUT
  console.log('\n--- TEST 3: Edit existing schedule via PUT ---');
  const updatePayload = {
    chatId: testChatId,
    name: 'Updated Schedule Title',
    message: 'Updated Announcement Text',
    messageText: 'Updated Announcement Text',
    scheduleType: 'interval',
    intervalFormatted: '2h',
    intervalMs: 7200000,
    timezone: 'Asia/Kolkata',
    contentType: 'text',
    enabled: true,
    pinAfterSend: true,
    replyToLatest: true,
    autoDeletePrevious: true,
    triggerKeyword: 'updated_keyword',
    inlineKeyboard: [
      [{ text: 'New Website', url: 'https://example.com/updated', style: 'primary' }]
    ]
  };

  const updateRes = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, updatePayload, modHeaders);
  assert.strictEqual(updateRes.status, 200, 'PUT /api/dashboard/schedules/:id should return 200');
  assert.strictEqual(updateRes.data.success, true);
  const updatedSchedule = updateRes.data.schedule;
  assert.strictEqual(updatedSchedule.id, scheduleId);
  assert.strictEqual(updatedSchedule.name, 'Updated Schedule Title');
  assert.strictEqual(updatedSchedule.message, 'Updated Announcement Text');
  assert.strictEqual(updatedSchedule.messageText, 'Updated Announcement Text');
  assert.strictEqual(updatedSchedule.intervalFormatted, '2h');
  assert.strictEqual(updatedSchedule.intervalMs, 7200000);
  assert.strictEqual(updatedSchedule.timezone, 'Asia/Kolkata');
  assert.strictEqual(updatedSchedule.pinAfterSend, true);
  assert.strictEqual(updatedSchedule.replyToLatest, true);
  assert.strictEqual(updatedSchedule.autoDeletePrevious, true);
  assert.strictEqual(updatedSchedule.triggerKeyword, 'updated_keyword');
  assert.strictEqual(updatedSchedule.inlineKeyboard?.[0]?.[0]?.text, 'New Website');
  assert.strictEqual(updatedSchedule.inlineKeyboard?.[0]?.[0]?.style, 'primary');
  pass('PUT updated message, name, interval, pinAfterSend, replyToLatest, delOn, triggerKeyword, and inlineKeyboard');

  // Verify memory in storage
  const memorySchedule = db.getScheduleById(scheduleId);
  assert.ok(memorySchedule, 'Schedule must exist in memory');
  assert.strictEqual(memorySchedule.name, 'Updated Schedule Title');
  assert.strictEqual(memorySchedule.triggerKeyword, 'updated_keyword');
  assert.strictEqual(memorySchedule.autoDeletePrevious, true);
  pass('Storage in-memory model reflects updated fields');

  // 4. Clear trigger keyword and buttons on update
  console.log('\n--- TEST 4: Clear optional trigger keyword and buttons ---');
  const clearKeywordRes = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, {
    triggerKeyword: null, // explicit null clearing
    inlineKeyboard: [] // explicit clear
  }, modHeaders);
  assert.strictEqual(clearKeywordRes.status, 200);
  assert.strictEqual(clearKeywordRes.data.schedule.triggerKeyword, undefined);
  assert.strictEqual(clearKeywordRes.data.schedule.inlineKeyboard, undefined);
  const clearedMemSchedule = db.getScheduleById(scheduleId);
  assert.strictEqual(clearedMemSchedule?.triggerKeyword, undefined);
  assert.strictEqual(clearedMemSchedule?.inlineKeyboard, undefined);
  // Ensure message and other fields remained preserved
  assert.strictEqual(clearedMemSchedule?.name, 'Updated Schedule Title');
  assert.strictEqual(clearedMemSchedule?.autoDeletePrevious, true);
  pass('Optional fields triggerKeyword and inlineKeyboard cleared without affecting preserved fields');

  // 5. Update non-existent schedule returns 404
  console.log('\n--- TEST 5: Non-existent schedule returns 404 ---');
  const notFoundRes = await apiRequest('PUT', '/api/dashboard/schedules/NONEXISTENT999', {
    name: 'Ghost'
  }, modHeaders);
  assert.strictEqual(notFoundRes.status, 404);
  assert.strictEqual(notFoundRes.data.error, 'Schedule not found.');
  pass('Non-existent schedule returns 404');

  // 6. Validation Failures
  console.log('\n--- TEST 6: Validation failures return 400 without corrupting data ---');
  // 6a. Invalid schedule ID
  const invalidIdRes = await apiRequest('PUT', '/api/dashboard/schedules/undefined', { name: 'Test' }, modHeaders);
  assert.strictEqual(invalidIdRes.status, 400);
  assert.strictEqual(invalidIdRes.data.error, 'Valid schedule ID is required.');
  pass('Missing/undefined schedule ID rejected with 400');

  // 6b. Blocked test chatId
  const blockedChatRes = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, {
    chatId: -100111222333
  }, modHeaders);
  assert.strictEqual(blockedChatRes.status, 400);
  assert.strictEqual(blockedChatRes.data.error, 'Target chatId is a blocked legacy test destination.');
  pass('Blocked legacy test chatId rejected with 400');

  // 6c. Trigger keyword over 200 characters
  const longTrigger = 'a'.repeat(201);
  const longTriggerRes = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, {
    triggerKeyword: longTrigger
  }, modHeaders);
  assert.strictEqual(longTriggerRes.status, 400);
  assert.strictEqual(longTriggerRes.data.error, 'Trigger keyword/phrase must not exceed 200 characters.');
  pass('Trigger keyword > 200 chars rejected with 400');

  // 6d. Empty message and no media
  const emptyMsgRes = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, {
    message: '',
    messageText: '',
    mediaFileId: ''
  }, modHeaders);
  assert.strictEqual(emptyMsgRes.status, 400);
  assert.strictEqual(emptyMsgRes.data.error, 'Message text or media is required for schedule.');
  pass('Empty message with no media rejected with 400');

  // Verify schedule was not corrupted after validation failures
  const intactSchedule = db.getScheduleById(scheduleId);
  assert.ok(intactSchedule);
  assert.strictEqual(intactSchedule.name, 'Updated Schedule Title');
  assert.strictEqual(intactSchedule.chatId, testChatId);
  pass('Schedule data remains completely intact after rejected payloads');

  // 7. Toggle schedule
  console.log('\n--- TEST 7: Toggle schedule ---');
  const toggleRes = await apiRequest('POST', `/api/dashboard/schedules/${scheduleId}/toggle`, {
    enabled: false
  }, modHeaders);
  assert.strictEqual(toggleRes.status, 200);
  assert.strictEqual(toggleRes.data.schedule.enabled, false);
  pass('Schedule enabled toggled to false via POST /api/dashboard/schedules/:id/toggle');

  // 8. Disk persistence verification
  console.log('\n--- TEST 8: Disk persistence verification ---');
  // Wait for debounced scheduleSave to flush to disk
  await new Promise(r => setTimeout(r, 200));

  const storageFilePath = path.join(process.cwd(), 'data', 'bot_storage.json');
  const rawDiskData = fs.readFileSync(storageFilePath, 'utf-8');
  const diskData = JSON.parse(rawDiskData);
  const diskSchedule = (diskData.schedules || []).find((s: any) => s.id.toUpperCase() === scheduleId.toUpperCase());
  assert.ok(diskSchedule, 'Schedule must be present in bot_storage.json');
  assert.strictEqual(diskSchedule.name, 'Updated Schedule Title');
  assert.strictEqual(diskSchedule.message, 'Updated Announcement Text');
  assert.strictEqual(diskSchedule.intervalFormatted, '2h');
  assert.strictEqual(diskSchedule.autoDeletePrevious, true);
  assert.strictEqual(diskSchedule.enabled, false);
  pass('All updates verified on disk in bot_storage.json');

  // 9. Delete schedule cleanup
  console.log('\n--- TEST 9: Delete schedule ---');
  const deleteRes = await apiRequest('DELETE', `/api/dashboard/schedules/${scheduleId}`, undefined, modHeaders);
  assert.strictEqual(deleteRes.status, 200);
  assert.strictEqual(deleteRes.data.success, true);

  const deletedMem = db.getScheduleById(scheduleId);
  assert.strictEqual(deletedMem, undefined, 'Schedule must be deleted from memory');

  const afterDeleteUpdate = await apiRequest('PUT', `/api/dashboard/schedules/${scheduleId}`, { name: 'Zombie' }, modHeaders);
  assert.strictEqual(afterDeleteUpdate.status, 404, 'Updating deleted schedule must return 404');
  pass('Deleted schedule removed from storage and subsequent PUT returns 404');

  // Clean sessions
  authManager.logout(modSessionId);
  authManager.logout(viewerSessionId);

  console.log(`\n================================================================`);
  console.log(`🎉 All Schedule Edit Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log(`================================================================`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

run().catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
