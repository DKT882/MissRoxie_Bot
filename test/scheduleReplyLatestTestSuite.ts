process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import { strict as assert } from 'node:assert';
import { db } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler, isValidHttpUrl } from '../server/telegram/scheduler.js';
import { TelegramMessage, ScheduledPostButton, ScheduledMessage } from '../server/telegram/types.js';
import { CommandContext } from '../server/telegram/middleware.js';

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

async function runScheduleReplyLatestTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING /SCHEDULE "REPLY TO LATEST MESSAGE" TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -1004494268888;
  const testChatTitle = 'Schedule Reply Latest Test Group';
  const adminId = 123456;
  const botId = 987654321;

  // Track captured API calls
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

  let nextMessageId = 10000;

  const isTargetTestChat = (cid: number) => cid === testChatId || cid === -1004494299999;

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendMessage simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedMessages.push({ chatId, text, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number, photo: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendPhoto simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedPhotos.push({ chatId, photo, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendVideo = async (chatId: number, video: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendVideo simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedVideos.push({ chatId, video, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number, animation: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendAnimation simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedAnimations.push({ chatId, animation, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number, document: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendDocument simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedDocuments.push({ chatId, document, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendSticker simulated failure' };
    }
    if (isTargetTestChat(chatId)) {
      capturedStickers.push({ chatId, sticker, options });
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).deleteMessage = async (chatId: number, messageId: number) => {
    if (isTargetTestChat(chatId)) {
      capturedDeletions.push({ chatId, messageId });
    }
    return { ok: true };
  };

  (telegramApi as any).pinChatMessage = async (chatId: number, messageId: number, disableNotification?: boolean) => {
    if (isTargetTestChat(chatId)) {
      capturedPins.push({ chatId, messageId, disableNotification });
    }
    if (shouldPinFail) {
      return { ok: false, error_code: 400, description: 'Telegram pinChatMessage simulated error: CHAT_NOT_MODIFIED' };
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
      can_restrict_members: true,
      can_delete_messages: true,
      can_pin_messages: true
    }
  });

  function clearGroupSchedules() {
    for (const s of db.getGroupSchedules(testChatId)) {
      messageScheduler.deleteSchedule(testChatId, s.id, adminId);
    }
    (db as any).trackedMessages[testChatId] = [];
    if ((db as any).data.groupConversationMemories) {
      delete (db as any).data.groupConversationMemories[String(testChatId)];
    }
  }

  function createContext(textOrCaption: string, replyTo?: TelegramMessage): CommandContext {
    const trimmed = textOrCaption.trim();
    const cmdMatch = textOrCaption.match(/^([\/!][^\s]+)([\s\S]*)$/);
    const rawCmd = cmdMatch ? cmdMatch[1] : trimmed.split(/\s+/)[0];
    const rawRemainder = cmdMatch ? cmdMatch[2] : '';
    const rawArgs = rawRemainder.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
    const args = rawArgs.length > 0 ? rawArgs.split(/\s+/) : [];

    const msg: TelegramMessage = {
      message_id: nextMessageId++,
      chat: { id: testChatId, title: testChatTitle, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      date: Math.floor(Date.now() / 1000),
      text: textOrCaption,
      reply_to_message: replyTo
    };

    return {
      message: msg,
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: msg.from!,
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      args,
      command: rawCmd.replace(/^[\/!]/, '').toLowerCase(),
      rawArgs
    };
  }

  try {
    // =========================================================================
    // SECTION 1: COMMAND PARSING & FLAGS
    // =========================================================================

    // TEST 1: /schedule with replyOn parses replyToLatest: true
    await test('1. /schedule 1m replyOn Hello parses replyToLatest=true and messageText="Hello"', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const ctx = createContext('/schedule 1m replyOn Hello');
      await (CommandHandler as any).handleSchedule(ctx);

      assert.strictEqual(capturedMessages.length, 1);
      assert.ok(capturedMessages[0].text.includes('Enabled (replyOn)'));

      const schedules = db.getGroupSchedules(testChatId);
      assert.strictEqual(schedules.length, 1);
      const sched = schedules[0];
      assert.strictEqual(sched.replyToLatest, true);
      assert.strictEqual(sched.messageText, 'Hello');
      assert.strictEqual(sched.pinAfterSend, false);
      assert.strictEqual(sched.autoDeletePrevious, false);
    });

    // TEST 2: /schedule with replyOff parses replyToLatest: false
    await test('2. /schedule 1m replyOff Hello parses replyToLatest=false', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const ctx = createContext('/schedule 1m replyOff Hello');
      await (CommandHandler as any).handleSchedule(ctx);

      assert.strictEqual(capturedMessages.length, 1);
      assert.ok(capturedMessages[0].text.includes('Disabled'));

      const schedules = db.getGroupSchedules(testChatId);
      assert.strictEqual(schedules.length, 1);
      const sched = schedules[0];
      assert.strictEqual(sched.replyToLatest, false);
      assert.strictEqual(sched.messageText, 'Hello');
    });

    // TEST 3: /schedule with multiple flags in arbitrary order
    await test('3. /schedule parses delOn replyOn pin in arbitrary order', async () => {
      clearGroupSchedules();

      // Case A: delOn replyOn pin
      const ctxA = createContext('/schedule 1m delOn replyOn pin announcement A');
      await (CommandHandler as any).handleSchedule(ctxA);
      const schedA = db.getGroupSchedules(testChatId)[0];
      assert.strictEqual(schedA.autoDeletePrevious, true);
      assert.strictEqual(schedA.replyToLatest, true);
      assert.strictEqual(schedA.pinAfterSend, true);
      assert.strictEqual(schedA.messageText, 'announcement A');

      // Case B: pin replyOn delOn
      clearGroupSchedules();
      const ctxB = createContext('/schedule 1m pin replyOn delOn announcement B');
      await (CommandHandler as any).handleSchedule(ctxB);
      const schedB = db.getGroupSchedules(testChatId)[0];
      assert.strictEqual(schedB.autoDeletePrevious, true);
      assert.strictEqual(schedB.replyToLatest, true);
      assert.strictEqual(schedB.pinAfterSend, true);
      assert.strictEqual(schedB.messageText, 'announcement B');

      // Case C: replyOn delOn pin
      clearGroupSchedules();
      const ctxC = createContext('/schedule 1m replyOn delOn pin announcement C');
      await (CommandHandler as any).handleSchedule(ctxC);
      const schedC = db.getGroupSchedules(testChatId)[0];
      assert.strictEqual(schedC.autoDeletePrevious, true);
      assert.strictEqual(schedC.replyToLatest, true);
      assert.strictEqual(schedC.pinAfterSend, true);
      assert.strictEqual(schedC.messageText, 'announcement C');
    });

    // TEST 4: /schedule trailing flags stripped cleanly
    await test('4. /schedule strips trailing replyOn, pin, delOn flags from message text', async () => {
      clearGroupSchedules();

      const ctx = createContext('/schedule 1m Hello everyone delOn replyOn pin');
      await (CommandHandler as any).handleSchedule(ctx);

      const sched = db.getGroupSchedules(testChatId)[0];
      assert.strictEqual(sched.replyToLatest, true);
      assert.strictEqual(sched.pinAfterSend, true);
      assert.strictEqual(sched.autoDeletePrevious, true);
      assert.strictEqual(sched.messageText, 'Hello everyone');
    });

    // TEST 5: Default without replyOn is replyToLatest: false
    await test('5. /schedule without replyOn flag defaults replyToLatest to false', async () => {
      clearGroupSchedules();

      const ctx = createContext('/schedule 1m standard message');
      await (CommandHandler as any).handleSchedule(ctx);

      const sched = db.getGroupSchedules(testChatId)[0];
      assert.strictEqual(sched.replyToLatest, false);
    });

    // TEST 6: /listschedules displays [replyOn] badge
    await test('6. /listschedules displays [replyOn] tag for schedules with replyToLatest', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const ctxCreate = createContext('/schedule 10m replyOn Broadcast');
      await (CommandHandler as any).handleSchedule(ctxCreate);

      const ctxList = createContext('/listschedules');
      await (CommandHandler as any).handleListSchedules(ctxList);

      assert.strictEqual(capturedMessages.length, 2);
      assert.ok(capturedMessages[1].text.includes('[replyOn]'));
    });

    // =========================================================================
    // SECTION 2: DYNAMIC RESOLUTION AT EXECUTION TIME
    // =========================================================================

    // TEST 7: Resolves message sent AFTER schedule was created
    await test('7. Resolves latest message ID dynamically at execution time (message arriving after creation)', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // 10:00 - Create schedule with replyToLatest = true
      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Dynamic Reply Scheduled Post',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true // replyToLatest = true
      );
      assert.ok(createRes.success && createRes.schedule);

      // Force due
      db.updateSchedule(createRes.schedule.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      // 10:05 - Incoming chat message arrives with messageId 554433
      db.trackMessage(testChatId, 554433, Math.floor(Date.now() / 1000), 999111);

      // Execute scheduler
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].text, 'Dynamic Reply Scheduled Post');
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 554433, 'Must reply to latest message in chat');
    });

    // TEST 8: Resolves highest / most recent message when multiple exist
    await test('8. Resolves highest message ID when multiple messages exist in chat', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // Track multiple messages in order
      db.trackMessage(testChatId, 100, Math.floor(Date.now() / 1000) - 100, 111);
      db.trackMessage(testChatId, 200, Math.floor(Date.now() / 1000) - 50, 222);
      db.trackMessage(testChatId, 350, Math.floor(Date.now() / 1000), 333);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Reply to latest of multiple',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true // replyToLatest = true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 350, 'Must reply to highest message ID');
    });

    // TEST 9: Resolves messages in groupConversationMemory if trackMessage buffer is empty
    await test('9. Resolves latest message ID from groupConversationMemory', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // Clear trackedMessages for chat
      (db as any).trackedMessages[testChatId] = [];

      // Add entry to group conversation memory
      db.addGroupConversationEntry(testChatId, {
        role: 'user',
        name: 'John',
        content: 'Hello in memory',
        timestamp: Date.now(),
        messageId: 887766
      });

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Memory reply post',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 887766);
    });

    // TEST 10: Fallback when chat has NO messages: sends without reply_to_message_id and does NOT fail
    await test('10. When chat has no recorded messages, replyToLatest sends normally without reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // Empty chat target
      const emptyChatId = -1004494299999;
      (db as any).trackedMessages[emptyChatId] = [];
      if ((db as any).data.groupConversationMemories) {
        delete (db as any).data.groupConversationMemories[String(emptyChatId)];
      }

      const createRes = messageScheduler.createSchedule(
        emptyChatId,
        'Empty Group',
        adminId,
        'AdminUser',
        '1m',
        'Fallback post with no prior chat history',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true // replyToLatest = true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, undefined, 'Must omit reply_to_message_id if no eligible message');
      const sched = db.getScheduleById(createRes.schedule!.id);
      assert.strictEqual(sched?.lastStatus, 'success', 'Must record success');

      // Cleanup
      messageScheduler.deleteSchedule(emptyChatId, createRes.schedule!.id, adminId);
    });

    // =========================================================================
    // SECTION 3: PRECEDENCE & INTERACTION WITH STATIC REPLIES
    // =========================================================================

    // TEST 11: Precedence of replyToLatest over static replyToMessageId
    await test('11. replyToLatest takes precedence over static replyToMessageId when both are present', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      db.trackMessage(testChatId, 778899, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Precedence test post',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true // replyToLatest = true
      );

      // Set static replyToMessageId on the schedule as well
      db.updateSchedule(createRes.schedule!.id, {
        replyToMessageId: 10001,
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 778899, 'Dynamic latest must override static reply ID');
    });

    // TEST 12: When replyToLatest is false, static replyToMessageId is preserved
    await test('12. When replyToLatest is false, static replyToMessageId is used', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      db.trackMessage(testChatId, 999999, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Static reply post',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        false // replyToLatest = false
      );

      db.updateSchedule(createRes.schedule!.id, {
        replyToMessageId: 54321,
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 54321, 'Must use static replyToMessageId when replyToLatest is false');
    });

    // =========================================================================
    // SECTION 4: MEDIA CONTENT TYPES WITH replyToLatest
    // =========================================================================

    // TEST 13: Scheduled Photo with replyToLatest
    await test('13. Scheduled Photo dispatches sendPhoto with dynamic reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedPhotos.length = 0;

      db.trackMessage(testChatId, 12345, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Photo caption',
        'photo',
        'photo_file_id_123',
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedPhotos.length, 1);
      assert.strictEqual(capturedPhotos[0].photo, 'photo_file_id_123');
      assert.strictEqual(capturedPhotos[0].options?.reply_to_message_id, 12345);
      assert.strictEqual(capturedPhotos[0].options?.caption, 'Photo caption');
    });

    // TEST 14: Scheduled Video with replyToLatest
    await test('14. Scheduled Video dispatches sendVideo with dynamic reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedVideos.length = 0;

      db.trackMessage(testChatId, 12346, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Video caption',
        'video',
        'video_file_id_456',
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedVideos.length, 1);
      assert.strictEqual(capturedVideos[0].video, 'video_file_id_456');
      assert.strictEqual(capturedVideos[0].options?.reply_to_message_id, 12346);
    });

    // TEST 15: Scheduled Animation with replyToLatest
    await test('15. Scheduled Animation dispatches sendAnimation with dynamic reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedAnimations.length = 0;

      db.trackMessage(testChatId, 12347, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Animation caption',
        'animation',
        'anim_file_id_789',
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedAnimations.length, 1);
      assert.strictEqual(capturedAnimations[0].animation, 'anim_file_id_789');
      assert.strictEqual(capturedAnimations[0].options?.reply_to_message_id, 12347);
    });

    // TEST 16: Scheduled Document with replyToLatest
    await test('16. Scheduled Document dispatches sendDocument with dynamic reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedDocuments.length = 0;

      db.trackMessage(testChatId, 12348, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Document caption',
        'document',
        'doc_file_id_101',
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedDocuments.length, 1);
      assert.strictEqual(capturedDocuments[0].document, 'doc_file_id_101');
      assert.strictEqual(capturedDocuments[0].options?.reply_to_message_id, 12348);
    });

    // TEST 17: Scheduled Sticker with replyToLatest
    await test('17. Scheduled Sticker dispatches sendSticker with dynamic reply_to_message_id', async () => {
      clearGroupSchedules();
      capturedStickers.length = 0;

      db.trackMessage(testChatId, 12349, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        '',
        'sticker',
        'sticker_file_id_202',
        false,
        'none',
        false,
        undefined,
        true
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedStickers.length, 1);
      assert.strictEqual(capturedStickers[0].sticker, 'sticker_file_id_202');
      assert.strictEqual(capturedStickers[0].options?.reply_to_message_id, 12349);
    });

    // =========================================================================
    // SECTION 5: COMBINATIONS (PIN, AUTODELETE, BUTTONS, RECURRING)
    // =========================================================================

    // TEST 18: pinAfterSend + replyToLatest
    await test('18. Scheduled execution with replyToLatest AND pinAfterSend replies then pins newly sent message', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;
      capturedPins.length = 0;

      db.trackMessage(testChatId, 70001, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Pinned & Replied message',
        'text',
        undefined,
        false, // autoDeletePrevious
        'none',
        true,  // pinAfterSend
        undefined,
        true   // replyToLatest
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 70001);

      assert.strictEqual(capturedPins.length, 1);
      const sched = db.getScheduleById(createRes.schedule!.id);
      assert.strictEqual(capturedPins[0].messageId, sched?.lastSentMessageId);
      assert.strictEqual(capturedPins[0].disableNotification, true);
    });

    // TEST 19: autoDeletePrevious + replyToLatest
    await test('19. Scheduled execution with replyToLatest AND autoDeletePrevious deletes previous and replies to latest', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;
      capturedDeletions.length = 0;

      db.trackMessage(testChatId, 80001, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'delOn + replyOn message',
        'text',
        undefined,
        true,  // autoDeletePrevious
        'none',
        false,
        undefined,
        true   // replyToLatest
      );
      // Simulate previous run sent message 44444
      db.updateSchedule(createRes.schedule!.id, {
        lastSentMessageId: 44444,
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedDeletions.length, 1);
      assert.strictEqual(capturedDeletions[0].messageId, 44444);

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 80001);
    });

    // TEST 20: Inline Keyboard buttons + replyToLatest
    await test('20. Scheduled execution with replyToLatest AND inline buttons attaches both', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      db.trackMessage(testChatId, 90001, Math.floor(Date.now() / 1000), 123);

      const buttons: ScheduledPostButton[][] = [
        [{ text: 'Join Channel', url: 'https://t.me/example' }]
      ];

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '1m',
        'Buttons + replyOn message',
        'text',
        undefined,
        false,
        'none',
        false,
        buttons,
        true // replyToLatest
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 90001);
      assert.deepStrictEqual(capturedMessages[0].options?.reply_markup?.inline_keyboard, [
        [{ text: 'Join Channel', url: 'https://t.me/example' }]
      ]);
    });

    // TEST 21: Recurring schedule dynamically updates reply target on each subsequent run
    await test('21. Recurring schedule resolves new latest message on each consecutive execution tick', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // Tick 1
      db.trackMessage(testChatId, 1000, Math.floor(Date.now() / 1000), 123);

      const createRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'AdminUser',
        '10m',
        'Recurring replyOn broadcast',
        'text',
        undefined,
        false,
        'none',
        false,
        undefined,
        true // replyToLatest
      );
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, 1000, 'Tick 1 must reply to message 1000');

      // User sends a new message 2000 before Tick 2
      db.trackMessage(testChatId, 2000, Math.floor(Date.now() / 1000), 456);

      // Force Tick 2 due
      db.updateSchedule(createRes.schedule!.id, {
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 2);
      assert.strictEqual(capturedMessages[1].options?.reply_to_message_id, 2000, 'Tick 2 must dynamically reply to NEW latest message 2000');
    });

    // =========================================================================
    // SECTION 6: STORAGE REHYDRATION & BACKWARD COMPATIBILITY
    // =========================================================================

    // TEST 22: Storage rehydration (importGroupFullBackup) preserves replyToLatest
    await test('22. importGroupFullBackup preserves replyToLatest in rehydrated schedules', async () => {
      clearGroupSchedules();

      const backupConfig = {
        settings: { name: 'Backup Test' },
        schedules: [
          {
            id: 'REPLY1',
            chatId: testChatId,
            name: 'Rehydrated Reply Schedule',
            message: 'Rehydrated post',
            replyToLatest: true,
            pinAfterSend: true,
            autoDeletePrevious: false,
            intervalFormatted: '30m'
          }
        ]
      };

      db.importGroupFullBackup(testChatId, backupConfig, ['schedules']);

      const rehydrated = db.getScheduleById('REPLY1');
      assert.ok(rehydrated, 'Schedule REPLY1 must exist after rehydration');
      assert.strictEqual(rehydrated.replyToLatest, true);
      assert.strictEqual(rehydrated.pinAfterSend, true);
    });

    // TEST 23: Backward compatibility with legacy schedules without replyToLatest
    await test('23. Legacy schedule records without replyToLatest execute normally', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      // Add a legacy schedule directly into db without replyToLatest field
      const legacySchedule = db.addSchedule({
        chatId: testChatId,
        message: 'Legacy schedule without replyToLatest',
        nextRun: new Date(Date.now() - 5000).toISOString()
      });

      assert.strictEqual((legacySchedule as any).replyToLatest, undefined);

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].options?.reply_to_message_id, undefined);
      const sched = db.getScheduleById(legacySchedule.id);
      assert.strictEqual(sched?.lastStatus, 'success');
    });

    console.log(`\n================================================================`);
    console.log(`🎉 /SCHEDULE "REPLY TO LATEST" TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
    console.log(`================================================================\n`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Restore originals
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
}

runScheduleReplyLatestTestSuite().catch(err => {
  console.error('Fatal error in scheduleReplyLatestTestSuite:', err);
  process.exit(1);
});
