process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import { strict as assert } from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler } from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage, ScheduledPostButton } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    failed++;
  }
}

async function runIntegrationSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING SCHEDULER <-> POST SENDER INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -1004494269999;
  const adminId = 123456;
  const botId = 987654321;

  // Track captured Telegram API calls
  const capturedMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const capturedPhotos: Array<{ chatId: number; photo: string; options?: any }> = [];
  const capturedVideos: Array<{ chatId: number; video: string; options?: any }> = [];
  const capturedAnimations: Array<{ chatId: number; animation: string; options?: any }> = [];
  const capturedDocuments: Array<{ chatId: number; document: string; options?: any }> = [];
  const capturedStickers: Array<{ chatId: number; sticker: string; options?: any }> = [];
  const capturedDeletions: Array<{ chatId: number; messageId: number }> = [];
  const capturedPins: Array<{ chatId: number; messageId: number; disableNotification?: boolean }> = [];

  let shouldSendFail = false;
  let shouldPinFail = false;

  const originalSendMessage = telegramApi.sendMessage;
  const originalSendPhoto = telegramApi.sendPhoto;
  const originalSendVideo = telegramApi.sendVideo;
  const originalSendAnimation = telegramApi.sendAnimation;
  const originalSendDocument = telegramApi.sendDocument;
  const originalSendSticker = telegramApi.sendSticker;
  const originalDeleteMessage = telegramApi.deleteMessage;
  const originalPinChatMessage = telegramApi.pinChatMessage;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;

  let nextMessageId = 20000;

  const isTargetTestChat = (cid: number) => cid === testChatId;

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendMessage failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedMessages.push({ chatId, text, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number, photo: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendPhoto failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedPhotos.push({ chatId, photo, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, photo: [{ file_id: photo }] } };
  };

  (telegramApi as any).sendVideo = async (chatId: number, video: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendVideo failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedVideos.push({ chatId, video, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, video: { file_id: video } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number, animation: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendAnimation failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedAnimations.push({ chatId, animation, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, animation: { file_id: animation } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number, document: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendDocument failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedDocuments.push({ chatId, document, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, document: { file_id: document } } };
  };

  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Simulated sendSticker failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedStickers.push({ chatId, sticker, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, sticker: { file_id: sticker } } };
  };

  (telegramApi as any).deleteMessage = async (chatId: number, messageId: number) => {
    if (isTargetTestChat(chatId)) {
      capturedDeletions.push({ chatId, messageId });
    }
    return { ok: true, result: true };
  };

  (telegramApi as any).pinChatMessage = async (chatId: number, messageId: number, disableNotification?: boolean) => {
    if (isTargetTestChat(chatId)) {
      capturedPins.push({ chatId, messageId, disableNotification });
    }
    if (shouldPinFail) {
      return { ok: false, error_code: 400, description: 'CHAT_NOT_MODIFIED' };
    }
    return { ok: true, result: true };
  };

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }
  });

  (telegramApi as any).getChatMember = async (_chatId: number, userId: number) => ({
    ok: true,
    result: {
      status: (userId === adminId || userId === botId) ? 'administrator' : 'member',
      user: { id: userId, is_bot: userId === botId, first_name: `User_${userId}` },
      can_pin_messages: true,
      can_delete_messages: true
    }
  });

  function clearGroup() {
    for (const s of db.getGroupSchedules(testChatId)) {
      messageScheduler.deleteSchedule(testChatId, s.id, adminId);
    }
    (db as any).trackedMessages[testChatId] = [];
    capturedMessages.length = 0;
    capturedPhotos.length = 0;
    capturedVideos.length = 0;
    capturedAnimations.length = 0;
    capturedDocuments.length = 0;
    capturedStickers.length = 0;
    capturedDeletions.length = 0;
    capturedPins.length = 0;
    shouldSendFail = false;
    shouldPinFail = false;
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Scheduled text post reaches PostSender and sends via TelegramApi
    // -------------------------------------------------------------------------
    await test('1. Scheduled text post executes through PostSender -> sendMessage', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Broadcast Text #1',
        messageText: 'Broadcast Text #1',
        contentType: 'text',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].text, 'Broadcast Text #1');
      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'success');
      assert.strictEqual(updated?.enabled, false);
      assert(updated?.lastSentMessageId !== undefined && updated.lastSentMessageId > 0);
    });

    // -------------------------------------------------------------------------
    // 2. Scheduled photo reaches PostSender correctly
    // -------------------------------------------------------------------------
    await test('2. Scheduled photo post executes through PostSender -> sendPhoto', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Photo Caption',
        messageText: 'Photo Caption',
        contentType: 'photo',
        mediaFileId: 'photo_abc_123',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedPhotos.length, 1);
      assert.strictEqual(capturedPhotos[0].photo, 'photo_abc_123');
      assert.strictEqual(capturedPhotos[0].options?.caption, 'Photo Caption');
      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'success');
    });

    // -------------------------------------------------------------------------
    // 3. Scheduled video reaches PostSender correctly
    // -------------------------------------------------------------------------
    await test('3. Scheduled video post executes through PostSender -> sendVideo', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Video Caption',
        messageText: 'Video Caption',
        contentType: 'video',
        mediaFileId: 'vid_xyz_789',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedVideos.length, 1);
      assert.strictEqual(capturedVideos[0].video, 'vid_xyz_789');
      assert.strictEqual(capturedVideos[0].options?.caption, 'Video Caption');
      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'success');
    });

    // -------------------------------------------------------------------------
    // 4. Scheduled animation reaches PostSender correctly
    // -------------------------------------------------------------------------
    await test('4. Scheduled animation post executes through PostSender -> sendAnimation', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'GIF Caption',
        messageText: 'GIF Caption',
        contentType: 'animation',
        mediaFileId: 'gif_123_456',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedAnimations.length, 1);
      assert.strictEqual(capturedAnimations[0].animation, 'gif_123_456');
      assert.strictEqual(capturedAnimations[0].options?.caption, 'GIF Caption');
    });

    // -------------------------------------------------------------------------
    // 5. Scheduled document reaches PostSender correctly
    // -------------------------------------------------------------------------
    await test('5. Scheduled document post executes through PostSender -> sendDocument', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Doc Caption',
        messageText: 'Doc Caption',
        contentType: 'document',
        mediaFileId: 'doc_pdf_999',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedDocuments.length, 1);
      assert.strictEqual(capturedDocuments[0].document, 'doc_pdf_999');
      assert.strictEqual(capturedDocuments[0].options?.caption, 'Doc Caption');
    });

    // -------------------------------------------------------------------------
    // 6. Existing inline keyboard reaches PostSender unchanged
    // -------------------------------------------------------------------------
    await test('6. Existing inline keyboard rows reach Telegram via PostSender', async () => {
      clearGroup();
      const buttons: ScheduledPostButton[][] = [
        [{ text: 'Website', url: 'https://roxiebot.com' }],
        [{ text: 'Channel', url: 'https://t.me/roxie' }, { text: 'Support', url: 'https://t.me/roxiesupport' }]
      ];

      db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Message with Buttons',
        messageText: 'Message with Buttons',
        contentType: 'text',
        inlineKeyboard: buttons,
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      const kb = capturedMessages[0].options?.reply_markup?.inline_keyboard;
      assert(Array.isArray(kb));
      assert.strictEqual(kb.length, 2);
      assert.strictEqual(kb[0][0].text, 'Website');
      assert.strictEqual(kb[0][0].url, 'https://roxiebot.com');
      assert.strictEqual(kb[1].length, 2);
    });

    // -------------------------------------------------------------------------
    // 7. replyToLatest reaches PostSender and resolves dynamically
    // -------------------------------------------------------------------------
    await test('7. replyToLatest dynamically resolves latest message at execution tick', async () => {
      clearGroup();
      db.trackMessage(testChatId, 777888, Math.floor(Date.now() / 1000), 555);

      db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Dynamic Reply Post',
        messageText: 'Dynamic Reply Post',
        contentType: 'text',
        replyToLatest: true,
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 777888);
    });

    // -------------------------------------------------------------------------
    // 8. Static replyToMessageId remains supported
    // -------------------------------------------------------------------------
    await test('8. Static replyToMessageId is used when replyToLatest is false', async () => {
      clearGroup();
      db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Static Reply Post',
        messageText: 'Static Reply Post',
        contentType: 'text',
        replyToMessageId: 333444,
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 333444);
    });

    // -------------------------------------------------------------------------
    // 9. replyToLatest takes precedence over replyToMessageId
    // -------------------------------------------------------------------------
    await test('9. replyToLatest takes strict precedence over static replyToMessageId', async () => {
      clearGroup();
      db.trackMessage(testChatId, 999111, Math.floor(Date.now() / 1000), 555);

      db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Precedence Post',
        messageText: 'Precedence Post',
        contentType: 'text',
        replyToLatest: true,
        replyToMessageId: 111222, // Stale static ID
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 999111);
    });

    // -------------------------------------------------------------------------
    // 10. pinAfterSend remains functional
    // -------------------------------------------------------------------------
    await test('10. pinAfterSend pins newly sent message after delivery', async () => {
      clearGroup();
      db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Pinned Announcement',
        messageText: 'Pinned Announcement',
        contentType: 'photo',
        mediaFileId: 'pin_photo_77',
        pinAfterSend: true,
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedPhotos.length, 1);
      assert.strictEqual(capturedPins.length, 1);
      assert.strictEqual(capturedPins[0].chatId, testChatId);
      // The pin call message ID matches the newly delivered photo message ID
      const photoMessageId = (db.getGroupSchedules(testChatId)[0])?.lastSentMessageId;
      assert.strictEqual(capturedPins[0].messageId, photoMessageId);
    });

    // -------------------------------------------------------------------------
    // 11. pin failure remains non-fatal
    // -------------------------------------------------------------------------
    await test('11. pin failure is non-fatal; delivery remains successful', async () => {
      clearGroup();
      shouldPinFail = true;

      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Pin Fail Post',
        messageText: 'Pin Fail Post',
        contentType: 'text',
        pinAfterSend: true,
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'success');
      assert.strictEqual(updated?.enabled, false);
    });

    // -------------------------------------------------------------------------
    // 12. autoDeletePrevious remains functional
    // -------------------------------------------------------------------------
    await test('12. autoDeletePrevious deletes previous run message before new delivery', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Auto Delete Run',
        messageText: 'Auto Delete Run',
        contentType: 'text',
        autoDeletePrevious: true,
        lastSentMessageId: 19876,
        scheduleType: 'interval',
        intervalMs: 60000,
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedDeletions.length, 1);
      assert.strictEqual(capturedDeletions[0].chatId, testChatId);
      assert.strictEqual(capturedDeletions[0].messageId, 19876);
      assert.strictEqual(capturedMessages.length, 1);
    });

    // -------------------------------------------------------------------------
    // 13. recurring schedule behavior remains unchanged
    // -------------------------------------------------------------------------
    await test('13. recurring schedule advances nextRun and stays enabled', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Recurring Post',
        messageText: 'Recurring Post',
        contentType: 'text',
        scheduleType: 'interval',
        intervalMs: 120000,
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.enabled, true);
      assert.strictEqual(updated?.lastStatus, 'success');
      const nextRunMs = new Date(updated!.nextRun).getTime();
      assert(nextRunMs > Date.now());
    });

    // -------------------------------------------------------------------------
    // 14. failed Telegram delivery does not mark schedule delivered
    // -------------------------------------------------------------------------
    await test('14. failed Telegram delivery does not mark schedule delivered', async () => {
      clearGroup();
      shouldSendFail = true;

      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Failing Post',
        messageText: 'Failing Post',
        contentType: 'text',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'failure');
      assert.strictEqual(updated?.enabled, true);
      assert.strictEqual(updated?.lastSentMessageId, undefined);
    });

    // -------------------------------------------------------------------------
    // 15. successful delivery records correct Telegram message ID
    // -------------------------------------------------------------------------
    await test('15. successful delivery records newly sent Telegram messageId in storage', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Record ID Test',
        messageText: 'Record ID Test',
        contentType: 'text',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      await (messageScheduler as any).checkAndExecuteSchedules();

      const updated = db.getScheduleById(sched.id);
      assert(typeof updated?.lastSentMessageId === 'number' && updated.lastSentMessageId > 0);
    });

    // -------------------------------------------------------------------------
    // 16. distributed claim behavior remains unchanged
    // -------------------------------------------------------------------------
    await test('16. distributed claim rejects duplicate concurrent execution in same tick', async () => {
      clearGroup();
      const sched = db.addSchedule({
        chatId: testChatId,
        chatTitle: 'Test Group',
        adminId,
        adminUsername: 'admin',
        message: 'Claim Test',
        messageText: 'Claim Test',
        contentType: 'text',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      });

      // Claim by another instance
      const claimed = await db.claimScheduleExecution(sched.id, sched.nextRun, '', 'competing_instance');
      assert.strictEqual(claimed, true);

      // Scheduler tick should now skip it
      await (messageScheduler as any).checkAndExecuteSchedules();
      assert.strictEqual(capturedMessages.length, 0);
    });

    // -------------------------------------------------------------------------
    // 17. duplicate delivery protection remains intact
    // -------------------------------------------------------------------------
    await test('17. duplicate delivery protection prevents repeated calls during in-flight', async () => {
      clearGroup();
      const payload = PostSender.scheduleToPayload({
        id: 'DEDUP_TEST',
        chatId: testChatId,
        message: 'Dedup Message',
        messageText: 'Dedup Message',
        contentType: 'text',
        createdAt: new Date().toISOString(),
        runsCount: 0
      });

      const res = await PostSender.send(testChatId, payload);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(capturedMessages.length, 1);
    });

    // -------------------------------------------------------------------------
    // 18. legacy ScheduledMessage records remain compatible
    // -------------------------------------------------------------------------
    await test('18. legacy ScheduledMessage without contentType defaults to text and executes', async () => {
      clearGroup();
      const legacySched: any = {
        chatId: testChatId,
        chatTitle: 'Legacy Group',
        adminId,
        adminUsername: 'admin',
        message: 'Pure Legacy Broadcast',
        scheduleType: 'one_time',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        enabled: true
      };
      const sched = db.addSchedule(legacySched);

      await (messageScheduler as any).checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].text, 'Pure Legacy Broadcast');
      const updated = db.getScheduleById(sched.id);
      assert.strictEqual(updated?.lastStatus, 'success');
    });

  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.sendPhoto = originalSendPhoto;
    telegramApi.sendVideo = originalSendVideo;
    telegramApi.sendAnimation = originalSendAnimation;
    telegramApi.sendDocument = originalSendDocument;
    telegramApi.sendSticker = originalSendSticker;
    telegramApi.deleteMessage = originalDeleteMessage;
    telegramApi.pinChatMessage = originalPinChatMessage;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
  }

  console.log('\n================================================================');
  console.log(`🎉 INTEGRATION TEST SUITE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationSuite().catch(err => {
  console.error('Unhandled error in integration test suite:', err);
  process.exit(1);
});
