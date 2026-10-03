process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import { strict as assert } from 'node:assert';
import { db } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler, isValidHttpUrl } from '../server/telegram/scheduler.js';
import { TelegramMessage, CommandContext, ScheduledPostButton } from '../server/telegram/types.js';

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

async function runScheduleRepliedMediaTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING /SCHEDULE REPLIED-MEDIA & BUTTONS/PIN COMPREHENSIVE TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -1004494269999;
  const testChatTitle = 'Schedule Replied Media Test Group';
  const adminId = 123456;
  const botId = 987654321;

  // Track captured API calls
  const capturedMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const capturedPhotos: Array<{ chatId: number; photo: string; options?: any }> = [];
  const capturedVideos: Array<{ chatId: number; video: string; options?: any }> = [];
  const capturedAnimations: Array<{ chatId: number; animation: string; options?: any }> = [];
  const capturedDocuments: Array<{ chatId: number; document: string; options?: any }> = [];
  const capturedDeletions: Array<{ chatId: number; messageId: number }> = [];
  const capturedPins: Array<{ chatId: number; messageId: number; disableNotification?: boolean }> = [];

  let shouldSendFail = false;
  let shouldPinFail = false;

  const originalSendMessage = telegramApi.sendMessage;
  const originalSendPhoto = telegramApi.sendPhoto;
  const originalSendVideo = telegramApi.sendVideo;
  const originalSendAnimation = telegramApi.sendAnimation;
  const originalSendDocument = telegramApi.sendDocument;
  const originalDeleteMessage = telegramApi.deleteMessage;
  const originalPinChatMessage = telegramApi.pinChatMessage;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;

  let nextMessageId = 10000;

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendMessage simulated failure' };
    }
    capturedMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number, photo: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendPhoto simulated failure' };
    }
    capturedPhotos.push({ chatId, photo, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendVideo = async (chatId: number, video: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendVideo simulated failure' };
    }
    capturedVideos.push({ chatId, video, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number, animation: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendAnimation simulated failure' };
    }
    capturedAnimations.push({ chatId, animation, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number, document: string, options?: any) => {
    if (shouldSendFail) {
      return { ok: false, error_code: 400, description: 'Telegram sendDocument simulated failure' };
    }
    capturedDocuments.push({ chatId, document, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId } } };
  };

  (telegramApi as any).deleteMessage = async (chatId: number, messageId: number) => {
    capturedDeletions.push({ chatId, messageId });
    return { ok: true };
  };

  (telegramApi as any).pinChatMessage = async (chatId: number, messageId: number, disableNotification?: boolean) => {
    capturedPins.push({ chatId, messageId, disableNotification });
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
  }

  function createContext(textOrCaption: string, replyTo?: TelegramMessage): CommandContext {
    const trimmed = textOrCaption.trim();
    const cmdMatch = textOrCaption.match(/^([\/!][^\s]+)([\s\S]*)$/);
    const rawCmd = cmdMatch ? cmdMatch[1] : trimmed.split(/\s+/)[0];
    const rawRemainder = cmdMatch ? cmdMatch[2] : '';
    const rawArgs = rawRemainder.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
    const parts = trimmed.split(/\s+/);
    const command = rawCmd.startsWith('!') ? `/${rawCmd.slice(1)}` : rawCmd;
    const args = parts.slice(1);

    const message: TelegramMessage = {
      message_id: 500 + Math.floor(Math.random() * 500),
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
      from: { id: adminId, is_bot: false, first_name: 'SuperAdmin', username: 'super_admin' },
      text: textOrCaption,
      reply_to_message: replyTo
    };

    return {
      message,
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: message.from!,
      isAnonymousAdmin: false,
      adminDisplayName: 'SuperAdmin',
      args,
      command,
      rawArgs
    };
  }

  try {
    // ----------------------------------------------------
    // TEST 1: /schedule replying to a photo
    // ----------------------------------------------------
    await test('1. /schedule replying to a photo extracts photo file_id, caption, and delOn', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 101,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        photo: [
          { file_id: 'thumb_id_1', file_unique_id: 'uq_t1', width: 100, height: 100 },
          { file_id: 'full_photo_file_id_123', file_unique_id: 'uq_p1', width: 1200, height: 800 }
        ]
      };

      const ctx = createContext('/schedule 10m delOn hello all', replyMsg);
      await CommandHandler.handleCommand(ctx);

      assert.strictEqual(capturedMessages.length, 1, 'Must send confirmation message');
      assert.ok(capturedMessages[0].text.includes('Message Scheduled Successfully!'));
      assert.ok(capturedMessages[0].text.includes('photo'));
      assert.ok(capturedMessages[0].text.includes('delOn'));

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'photo');
      assert.ok(sched, 'Photo schedule must exist in db');
      assert.strictEqual(sched.contentType, 'photo');
      assert.strictEqual(sched.mediaFileId, 'full_photo_file_id_123');
      assert.strictEqual(sched.messageText, 'hello all');
      assert.strictEqual(sched.autoDeletePrevious, true);
      assert.strictEqual(sched.intervalMs, 10 * 60 * 1000);
    });

    // ----------------------------------------------------
    // TEST 2: /schedule replying to a GIF/animation
    // ----------------------------------------------------
    await test('2. /schedule replying to a GIF/animation extracts animation file_id and custom caption', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 102,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        animation: { file_id: 'anim_file_id_456', file_unique_id: 'uq_a1', width: 400, height: 400, duration: 3 },
        document: { file_id: 'anim_file_id_456', file_unique_id: 'uq_a1', mime_type: 'video/mp4' }
      };

      const ctx = createContext('/schedule 30m Weekend Hype!', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'animation');
      assert.ok(sched, 'Animation schedule must exist in db');
      assert.strictEqual(sched.contentType, 'animation');
      assert.strictEqual(sched.mediaFileId, 'anim_file_id_456');
      assert.strictEqual(sched.messageText, 'Weekend Hype!');
      assert.strictEqual(sched.autoDeletePrevious, false);
    });

    // ----------------------------------------------------
    // TEST 3: /schedule replying to a video
    // ----------------------------------------------------
    await test('3. /schedule replying to a video extracts video file_id and custom caption', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 103,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        video: { file_id: 'video_file_id_789', file_unique_id: 'uq_v1', width: 1280, height: 720, duration: 60 }
      };

      const ctx = createContext('/schedule 1h delOn Weekly Recap Video', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'video');
      assert.ok(sched, 'Video schedule must exist in db');
      assert.strictEqual(sched.contentType, 'video');
      assert.strictEqual(sched.mediaFileId, 'video_file_id_789');
      assert.strictEqual(sched.messageText, 'Weekly Recap Video');
      assert.strictEqual(sched.autoDeletePrevious, true);
    });

    // ----------------------------------------------------
    // TEST 4: /schedule replying to a document
    // ----------------------------------------------------
    await test('4. /schedule replying to a document extracts document file_id and caption', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 104,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        document: { file_id: 'doc_file_id_999', file_unique_id: 'uq_d1', file_name: 'Whitepaper.pdf' }
      };

      const ctx = createContext('/schedule 1d Read the updated whitepaper!', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'document');
      assert.ok(sched, 'Document schedule must exist in db');
      assert.strictEqual(sched.contentType, 'document');
      assert.strictEqual(sched.mediaFileId, 'doc_file_id_999');
      assert.strictEqual(sched.messageText, 'Read the updated whitepaper!');
    });

    // ----------------------------------------------------
    // TEST 5: Scheduled execution sends media + text via correct Telegram method
    // ----------------------------------------------------
    await test('5. Scheduled execution sends media + text via correct Telegram method', async () => {
      clearGroupSchedules();
      capturedPhotos.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'hello all',
        'photo',
        'full_photo_file_id_123',
        false
      );

      assert.strictEqual(schedRes.success, true);
      assert.ok(schedRes.schedule);

      db.updateSchedule(schedRes.schedule.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      const chatPhotos = capturedPhotos.filter(p => p.chatId === testChatId);
      assert.strictEqual(chatPhotos.length, 1, 'Must execute exactly 1 sendPhoto operation');
      assert.strictEqual(chatPhotos[0].chatId, testChatId);
      assert.strictEqual(chatPhotos[0].photo, 'full_photo_file_id_123');
      assert.strictEqual(chatPhotos[0].options.caption, 'hello all');
      assert.strictEqual(chatPhotos[0].options.parse_mode, 'HTML');
    });

    // ----------------------------------------------------
    // TEST 6: Recurring execution sends media + text repeatedly across executions 1, 2, 3...
    // ----------------------------------------------------
    await test('6. Recurring schedule retains media metadata across executions 1, 2, and 3', async () => {
      clearGroupSchedules();
      capturedPhotos.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'hello all',
        'photo',
        'photo_recurring_456',
        false
      );

      const schedId = schedRes.schedule!.id;

      // Execution 1
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      let chatPhotos1 = capturedPhotos.filter(p => p.chatId === testChatId);
      assert.strictEqual(chatPhotos1.length, 1, 'Execution 1 must call sendPhoto');
      assert.strictEqual(chatPhotos1[0].photo, 'photo_recurring_456');
      assert.strictEqual(chatPhotos1[0].options.caption, 'hello all');

      let fresh1 = db.getScheduleById(schedId)!;
      assert.strictEqual(fresh1.contentType, 'photo');
      assert.strictEqual(fresh1.mediaFileId, 'photo_recurring_456');
      assert.strictEqual(fresh1.runsCount, 1);

      // Execution 2
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      let chatPhotos2 = capturedPhotos.filter(p => p.chatId === testChatId);
      assert.strictEqual(chatPhotos2.length, 2, 'Execution 2 must call sendPhoto');
      assert.strictEqual(chatPhotos2[1].photo, 'photo_recurring_456');
      assert.strictEqual(chatPhotos2[1].options.caption, 'hello all');

      let fresh2 = db.getScheduleById(schedId)!;
      assert.strictEqual(fresh2.contentType, 'photo');
      assert.strictEqual(fresh2.mediaFileId, 'photo_recurring_456');
      assert.strictEqual(fresh2.runsCount, 2);

      // Execution 3
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      let chatPhotos3 = capturedPhotos.filter(p => p.chatId === testChatId);
      assert.strictEqual(chatPhotos3.length, 3, 'Execution 3 must call sendPhoto');
      assert.strictEqual(chatPhotos3[2].photo, 'photo_recurring_456');
      assert.strictEqual(chatPhotos3[2].options.caption, 'hello all');

      let fresh3 = db.getScheduleById(schedId)!;
      assert.strictEqual(fresh3.contentType, 'photo');
      assert.strictEqual(fresh3.mediaFileId, 'photo_recurring_456');
      assert.strictEqual(fresh3.runsCount, 3);
    });

    // ----------------------------------------------------
    // TEST 7: Media metadata survives scheduler restart / storage hydration
    // ----------------------------------------------------
    await test('7. Media metadata survives storage hydration and process restart simulation', async () => {
      clearGroupSchedules();

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '1h',
        'Hydration Test Video',
        'video',
        'video_persist_id_888',
        true
      );

      const schedId = schedRes.schedule!.id;

      const initialSchedules = db.getGroupSchedules(testChatId);
      assert.ok(initialSchedules.some(s => s.id === schedId), 'Schedule must be in db');

      const backupConfig = {
        backupVersion: '2.0',
        settings: {},
        schedules: initialSchedules
      };

      db.deleteSchedule(testChatId, schedId);
      assert.strictEqual(db.getGroupSchedules(testChatId).length, 0);

      const restoreResult = db.importGroupFullBackup(testChatId, backupConfig, ['schedules'], true, 'admin', true);
      assert.strictEqual(restoreResult.ok, true);

      const rehydrated = db.getScheduleById(schedId);
      assert.ok(rehydrated, 'Schedule must be rehydrated');
      assert.strictEqual(rehydrated.contentType, 'video');
      assert.strictEqual(rehydrated.mediaFileId, 'video_persist_id_888');
      assert.strictEqual(rehydrated.messageText, 'Hydration Test Video');
      assert.strictEqual(rehydrated.autoDeletePrevious, true);
    });

    // ----------------------------------------------------
    // TEST 8: /schedule without replied media remains unchanged (plain text)
    // ----------------------------------------------------
    await test('8. /schedule without replied media creates text schedule and calls sendMessage', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const ctx = createContext('/schedule 15m Plain text reminder');
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.messageText === 'Plain text reminder');
      assert.ok(sched, 'Text schedule must exist');
      assert.strictEqual(sched.contentType, 'text');
      assert.strictEqual(sched.mediaFileId, undefined);

      capturedMessages.length = 0;
      db.updateSchedule(sched.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1, 'Must call sendMessage for text schedule');
      assert.strictEqual(capturedMessages[0].chatId, testChatId);
      assert.strictEqual(capturedMessages[0].text, 'Plain text reminder');
    });

    // ----------------------------------------------------
    // TEST 9: Existing delOn behavior deletes previous message before sending new one
    // ----------------------------------------------------
    await test('9. delOn behavior deletes previous message ID before dispatching next run', async () => {
      clearGroupSchedules();
      capturedPhotos.length = 0;
      capturedDeletions.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'delOn photo message',
        'photo',
        'photo_delon_777',
        true
      );

      const schedId = schedRes.schedule!.id;

      // Run 1: Sends message (message_id = 10000)
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      const run1MsgId = db.getScheduleById(schedId)!.lastSentMessageId!;
      assert.ok(run1MsgId, 'Run 1 must track lastSentMessageId');
      assert.strictEqual(capturedDeletions.length, 0, 'No deletion on Run 1 (no previous message)');

      // Run 2: Deletes message from Run 1, then sends new message
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedDeletions.length, 1, 'Run 2 must delete Run 1 message');
      assert.strictEqual(capturedDeletions[0].chatId, testChatId);
      assert.strictEqual(capturedDeletions[0].messageId, run1MsgId);

      const run2MsgId = db.getScheduleById(schedId)!.lastSentMessageId!;
      assert.ok(run2MsgId && run2MsgId !== run1MsgId, 'Run 2 must track new lastSentMessageId');
    });

    // ----------------------------------------------------
    // TEST 10: Existing interval parsing remains unchanged
    // ----------------------------------------------------
    await test('10. Interval parsing correctly parses m, h, and d units', () => {
      const p10m = messageScheduler.parseInterval('10m');
      assert.ok(p10m && p10m.ms === 600000 && p10m.formatted === '10 minutes');

      const p2h = messageScheduler.parseInterval('2h');
      assert.ok(p2h && p2h.ms === 7200000 && p2h.formatted === '2 hours');

      const p1d = messageScheduler.parseInterval('1d');
      assert.ok(p1d && p1d.ms === 86400000 && p1d.formatted === '1 day');

      const pInvalid = messageScheduler.parseInterval('invalid');
      assert.strictEqual(pInvalid, null);
    });

    // ----------------------------------------------------
    // TEST 11: Media file_id is reused directly without re-uploading
    // ----------------------------------------------------
    await test('11. Media file_id string is reused directly without re-uploading or downloading', async () => {
      clearGroupSchedules();
      capturedVideos.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Caption text',
        'video',
        'BAACAgIAAxkBAAICamX4...',
        false
      );

      db.updateSchedule(schedRes.schedule!.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedVideos.length, 1);
      assert.strictEqual(capturedVideos[0].video, 'BAACAgIAAxkBAAICamX4...', 'Must pass exact Telegram file_id');
    });

    // ----------------------------------------------------
    // TEST 12: Schedule deletion removes/disables the scheduled job correctly
    // ----------------------------------------------------
    await test('12. Schedule deletion removes job from group schedules', () => {
      clearGroupSchedules();

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'To be deleted',
        'photo',
        'photo_to_delete'
      );

      const schedId = schedRes.schedule!.id;
      assert.ok(db.getScheduleById(schedId), 'Schedule must exist before deletion');

      const deleted = messageScheduler.deleteSchedule(testChatId, schedId, adminId, 'SuperAdmin');
      assert.strictEqual(deleted, true);
      assert.strictEqual(db.getScheduleById(schedId), undefined, 'Schedule must not exist after deletion');
    });

    // ----------------------------------------------------
    // TEST 13: Replied photo without command text falls back to replied message caption
    // ----------------------------------------------------
    await test('13. Replied photo without custom command text inherits replied message caption', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 105,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        photo: [{ file_id: 'photo_with_caption_99', file_unique_id: 'uq_c1', width: 600, height: 600 }],
        caption: 'Original photo caption from replied message'
      };

      const ctx = createContext('/schedule 10m delOn', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'photo');
      assert.ok(sched, 'Schedule must exist');
      assert.strictEqual(sched.messageText, 'Original photo caption from replied message');
    });

    // ----------------------------------------------------
    // TEST 14: /schedule with pin option parses pinAfterSend: true
    // ----------------------------------------------------
    await test('14. /schedule 1m pin hello parses pinAfterSend=true and messageText="hello"', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const ctx = createContext('/schedule 1m pin hello');
      await CommandHandler.handleCommand(ctx);

      assert.strictEqual(capturedMessages.length, 1);
      assert.ok(capturedMessages[0].text.includes('Message Scheduled Successfully!'));
      assert.ok(capturedMessages[0].text.includes('Enabled (pin)'));

      const sched = db.getGroupSchedules(testChatId).find(s => s.messageText === 'hello');
      assert.ok(sched, 'Schedule must exist');
      assert.strictEqual(sched.pinAfterSend, true);
      assert.strictEqual(sched.messageText, 'hello');
      assert.strictEqual(sched.autoDeletePrevious, false);
    });

    // ----------------------------------------------------
    // TEST 15: /schedule flag ordering: delOn pin AND pin delOn
    // ----------------------------------------------------
    await test('15. /schedule parses both /schedule 1m delOn pin hello and /schedule 1m pin delOn hello', async () => {
      clearGroupSchedules();

      // Case A: delOn pin
      const ctxA = createContext('/schedule 1m delOn pin announcement A');
      await CommandHandler.handleCommand(ctxA);
      const schedA = db.getGroupSchedules(testChatId).find(s => s.messageText === 'announcement A');
      assert.ok(schedA);
      assert.strictEqual(schedA.autoDeletePrevious, true);
      assert.strictEqual(schedA.pinAfterSend, true);

      // Case B: pin delOn
      const ctxB = createContext('/schedule 1m pin delOn announcement B');
      await CommandHandler.handleCommand(ctxB);
      const schedB = db.getGroupSchedules(testChatId).find(s => s.messageText === 'announcement B');
      assert.ok(schedB);
      assert.strictEqual(schedB.autoDeletePrevious, true);
      assert.strictEqual(schedB.pinAfterSend, true);
    });

    // ----------------------------------------------------
    // TEST 16: /schedule without pin defaults to pinAfterSend: false
    // ----------------------------------------------------
    await test('16. /schedule without pin flag defaults pinAfterSend to false', async () => {
      clearGroupSchedules();

      const ctx = createContext('/schedule 5m regular message');
      await CommandHandler.handleCommand(ctx);
      const sched = db.getGroupSchedules(testChatId).find(s => s.messageText === 'regular message');
      assert.ok(sched);
      assert.strictEqual(sched.pinAfterSend, false);
    });

    // ----------------------------------------------------
    // TEST 17: Scheduled execution pins the newly sent Telegram message
    // ----------------------------------------------------
    await test('17. Scheduled execution pins EXACTLY the returned message_id when pinAfterSend is true', async () => {
      clearGroupSchedules();
      capturedPins.length = 0;
      capturedMessages.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Pinned broadcast',
        'text',
        undefined,
        false,
        undefined,
        true // pinAfterSend = true
      );

      assert.strictEqual(schedRes.success, true);
      const schedId = schedRes.schedule!.id;

      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1, 'Must send message');
      const sentMsgId = db.getScheduleById(schedId)!.lastSentMessageId!;
      assert.ok(sentMsgId, 'Must track sent message ID');

      assert.strictEqual(capturedPins.length, 1, 'Must call pinChatMessage');
      assert.strictEqual(capturedPins[0].chatId, testChatId);
      assert.strictEqual(capturedPins[0].messageId, sentMsgId, 'Pin must target exact sent message ID');
      assert.strictEqual(capturedPins[0].disableNotification, true, 'Pin should be silent by default');
    });

    // ----------------------------------------------------
    // TEST 18: Pin only occurs after successful send, never if sending fails
    // ----------------------------------------------------
    await test('18. Pin is NOT attempted if message delivery fails', async () => {
      clearGroupSchedules();
      capturedPins.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Fail send message',
        'text',
        undefined,
        false,
        undefined,
        true // pinAfterSend = true
      );

      shouldSendFail = true;
      try {
        db.updateSchedule(schedRes.schedule!.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
        await messageScheduler.checkAndExecuteSchedules();

        assert.strictEqual(capturedPins.length, 0, 'Must NOT attempt pin if send failed');
        const sched = db.getScheduleById(schedRes.schedule!.id)!;
        assert.strictEqual(sched.lastStatus, 'failure');
      } finally {
        shouldSendFail = false;
      }
    });

    // ----------------------------------------------------
    // TEST 19: Pin failure does NOT fail delivery or cause message resend
    // ----------------------------------------------------
    await test('19. Pin failure does not treat message delivery as failed or cause resending', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;
      capturedPins.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Message with failed pin',
        'text',
        undefined,
        false,
        undefined,
        true // pinAfterSend = true
      );

      shouldPinFail = true;
      try {
        db.updateSchedule(schedRes.schedule!.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
        await messageScheduler.checkAndExecuteSchedules();

        assert.strictEqual(capturedMessages.length, 1, 'Must send message');
        assert.strictEqual(capturedPins.length, 1, 'Attempted pin');

        const fresh = db.getScheduleById(schedRes.schedule!.id)!;
        assert.strictEqual(fresh.lastStatus, 'success', 'Delivery must be recorded as success even if pin fails');
        assert.strictEqual(fresh.runsCount, 1);
      } finally {
        shouldPinFail = false;
      }
    });

    // ----------------------------------------------------
    // TEST 20: /schedule extracts and serializes inline URL buttons from replied message
    // ----------------------------------------------------
    await test('20. /schedule extracts and preserves inline link buttons from replied message', async () => {
      clearGroupSchedules();

      const replyMsg: TelegramMessage = {
        message_id: 201,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        text: 'Visit our community website',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Official Website', url: 'https://example.com' }
            ]
          ]
        }
      };

      const ctx = createContext('/schedule 15m delOn Check out our links!', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.messageText === 'Check out our links!');
      assert.ok(sched, 'Schedule must exist');
      assert.ok(sched.inlineKeyboard, 'Must have inlineKeyboard');
      assert.strictEqual(sched.inlineKeyboard.length, 1);
      assert.strictEqual(sched.inlineKeyboard[0].length, 1);
      assert.strictEqual(sched.inlineKeyboard[0][0].text, '🌐 Official Website');
      assert.strictEqual(sched.inlineKeyboard[0][0].url, 'https://example.com');
    });

    // ----------------------------------------------------
    // TEST 21: Scheduled execution reconstructs reply_markup for text messages
    // ----------------------------------------------------
    await test('21. Scheduled execution passes reconstructed reply_markup to sendMessage', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const buttons: ScheduledPostButton[][] = [
        [{ text: 'Click Here', url: 'https://example.org/join' }]
      ];

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Text with button',
        'text',
        undefined,
        false,
        undefined,
        false,
        buttons
      );

      db.updateSchedule(schedRes.schedule!.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.ok(capturedMessages[0].options?.reply_markup?.inline_keyboard, 'Must include inline_keyboard in options');
      assert.deepStrictEqual(capturedMessages[0].options.reply_markup.inline_keyboard, [
        [{ text: 'Click Here', url: 'https://example.org/join' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 22: Multi-row and multi-column button structure is preserved exactly
    // ----------------------------------------------------
    await test('22. Multi-row and multi-column inline keyboard structure is preserved exactly', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;

      const multiGrid: ScheduledPostButton[][] = [
        [
          { text: '🌐 Website', url: 'https://example.com' },
          { text: '📢 Channel', url: 'https://t.me/example_channel' }
        ],
        [
          { text: '💬 Support Chat', url: 'https://t.me/example_support' }
        ]
      ];

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '1h',
        'Multi-button post',
        'text',
        undefined,
        false,
        undefined,
        false,
        multiGrid
      );

      db.updateSchedule(schedRes.schedule!.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      const sentKeyboard = capturedMessages[0].options?.reply_markup?.inline_keyboard;
      assert.strictEqual(sentKeyboard.length, 2, 'Must have 2 rows');
      assert.strictEqual(sentKeyboard[0].length, 2, 'Row 1 must have 2 buttons');
      assert.strictEqual(sentKeyboard[1].length, 1, 'Row 2 must have 1 button');
      assert.strictEqual(sentKeyboard[0][0].text, '🌐 Website');
      assert.strictEqual(sentKeyboard[0][1].url, 'https://t.me/example_channel');
      assert.strictEqual(sentKeyboard[1][0].text, '💬 Support Chat');
    });

    // ----------------------------------------------------
    // TEST 23: Replied Photo + Caption + Inline URL Buttons
    // ----------------------------------------------------
    await test('23. Replied photo schedule reconstructs and attaches reply_markup to sendPhoto', async () => {
      clearGroupSchedules();
      capturedPhotos.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 301,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        photo: [{ file_id: 'photo_btn_123', file_unique_id: 'uq_pb1', width: 800, height: 600 }],
        caption: 'Look at this photo!',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🖼️ HD Gallery', url: 'https://gallery.example.com/item' }]
          ]
        }
      };

      const ctx = createContext('/schedule 30m', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'photo');
      assert.ok(sched);
      assert.ok(sched.inlineKeyboard);

      db.updateSchedule(sched.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedPhotos.length, 1);
      assert.strictEqual(capturedPhotos[0].photo, 'photo_btn_123');
      assert.strictEqual(capturedPhotos[0].options.caption, 'Look at this photo!');
      assert.deepStrictEqual(capturedPhotos[0].options.reply_markup.inline_keyboard, [
        [{ text: '🖼️ HD Gallery', url: 'https://gallery.example.com/item' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 24: Replied Video + Caption + Inline URL Buttons
    // ----------------------------------------------------
    await test('24. Replied video schedule reconstructs and attaches reply_markup to sendVideo', async () => {
      clearGroupSchedules();
      capturedVideos.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 302,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        video: { file_id: 'video_btn_456', file_unique_id: 'uq_vb1', width: 1280, height: 720, duration: 45 },
        caption: 'Watch video',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎬 Watch on YouTube', url: 'https://youtube.com/watch?v=123' }]
          ]
        }
      };

      const ctx = createContext('/schedule 1h Watch video full', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'video');
      assert.ok(sched);

      db.updateSchedule(sched.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedVideos.length, 1);
      assert.strictEqual(capturedVideos[0].video, 'video_btn_456');
      assert.deepStrictEqual(capturedVideos[0].options.reply_markup.inline_keyboard, [
        [{ text: '🎬 Watch on YouTube', url: 'https://youtube.com/watch?v=123' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 25: Replied Animation/GIF + Caption + Inline URL Buttons
    // ----------------------------------------------------
    await test('25. Replied animation schedule reconstructs and attaches reply_markup to sendAnimation', async () => {
      clearGroupSchedules();
      capturedAnimations.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 303,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        animation: { file_id: 'anim_btn_789', file_unique_id: 'uq_ab1', width: 400, height: 400, duration: 4 },
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎉 GIF Source', url: 'https://giphy.com/gifs/123' }]
          ]
        }
      };

      const ctx = createContext('/schedule 2h Party Time!', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'animation');
      assert.ok(sched);

      db.updateSchedule(sched.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedAnimations.length, 1);
      assert.strictEqual(capturedAnimations[0].animation, 'anim_btn_789');
      assert.deepStrictEqual(capturedAnimations[0].options.reply_markup.inline_keyboard, [
        [{ text: '🎉 GIF Source', url: 'https://giphy.com/gifs/123' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 26: Replied Document + Caption + Inline URL Buttons
    // ----------------------------------------------------
    await test('26. Replied document schedule reconstructs and attaches reply_markup to sendDocument', async () => {
      clearGroupSchedules();
      capturedDocuments.length = 0;

      const replyMsg: TelegramMessage = {
        message_id: 304,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' },
        document: { file_id: 'doc_btn_999', file_unique_id: 'uq_db1', file_name: 'Terms.pdf' },
        reply_markup: {
          inline_keyboard: [
            [{ text: '📄 Read Online', url: 'https://docs.example.com/terms' }]
          ]
        }
      };

      const ctx = createContext('/schedule 1d Terms and Conditions', replyMsg);
      await CommandHandler.handleCommand(ctx);

      const sched = db.getGroupSchedules(testChatId).find(s => s.contentType === 'document');
      assert.ok(sched);

      db.updateSchedule(sched.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedDocuments.length, 1);
      assert.strictEqual(capturedDocuments[0].document, 'doc_btn_999');
      assert.deepStrictEqual(capturedDocuments[0].options.reply_markup.inline_keyboard, [
        [{ text: '📄 Read Online', url: 'https://docs.example.com/terms' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 27: Recurring execution preserves buttons and pins across executions
    // ----------------------------------------------------
    await test('27. Recurring schedule retains buttons and executes pin across executions 1, 2, and 3', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;
      capturedPins.length = 0;

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '10m',
        'Recurring with buttons and pin',
        'text',
        undefined,
        false,
        undefined,
        true, // pinAfterSend = true
        [[{ text: 'Recurring Link', url: 'https://example.com/recurring' }]]
      );

      const schedId = schedRes.schedule!.id;

      // Exec 1
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedPins.length, 1);
      assert.deepStrictEqual(capturedMessages[0].options.reply_markup.inline_keyboard, [
        [{ text: 'Recurring Link', url: 'https://example.com/recurring' }]
      ]);

      // Exec 2
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      assert.strictEqual(capturedMessages.length, 2);
      assert.strictEqual(capturedPins.length, 2);
      assert.deepStrictEqual(capturedMessages[1].options.reply_markup.inline_keyboard, [
        [{ text: 'Recurring Link', url: 'https://example.com/recurring' }]
      ]);

      // Exec 3
      db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();
      assert.strictEqual(capturedMessages.length, 3);
      assert.strictEqual(capturedPins.length, 3);
      assert.deepStrictEqual(capturedMessages[2].options.reply_markup.inline_keyboard, [
        [{ text: 'Recurring Link', url: 'https://example.com/recurring' }]
      ]);
    });

    // ----------------------------------------------------
    // TEST 28: Backward compatibility: Old schedules without pinAfterSend or inlineKeyboard
    // ----------------------------------------------------
    await test('28. Old scheduled records without pinAfterSend / inlineKeyboard execute normally without error', async () => {
      clearGroupSchedules();
      capturedMessages.length = 0;
      capturedPins.length = 0;

      // Manually add raw schedule representing old database record
      const oldSchedule = db.addSchedule({
        chatId: testChatId,
        chatTitle: testChatTitle,
        name: 'Legacy Post',
        message: 'Legacy message text',
        messageText: 'Legacy message text',
        intervalMs: 600000,
        intervalFormatted: '10 minutes',
        scheduleType: 'interval',
        nextRun: new Date(Date.now() - 1000).toISOString(),
        contentType: 'text',
        enabled: true
      });

      assert.strictEqual(oldSchedule.pinAfterSend, undefined);
      assert.strictEqual(oldSchedule.inlineKeyboard, undefined);

      await messageScheduler.checkAndExecuteSchedules();

      assert.strictEqual(capturedMessages.length, 1);
      assert.strictEqual(capturedMessages[0].text, 'Legacy message text');
      assert.strictEqual(capturedMessages[0].options?.reply_markup, undefined);
      assert.strictEqual(capturedPins.length, 0, 'No pin attempted for legacy schedule');
      assert.strictEqual(db.getScheduleById(oldSchedule.id)!.lastStatus, 'success');
    });

    // ----------------------------------------------------
    // TEST 29: URL Validator helper handles edge cases safely
    // ----------------------------------------------------
    await test('29. isValidHttpUrl correctly allows http/https and rejects invalid or javascript: URLs', () => {
      assert.strictEqual(isValidHttpUrl('https://example.com'), true);
      assert.strictEqual(isValidHttpUrl('http://sub.domain.org/path?q=1#anchor'), true);
      assert.strictEqual(isValidHttpUrl('https://t.me/mygroup'), true);

      assert.strictEqual(isValidHttpUrl('javascript:alert(1)'), false);
      assert.strictEqual(isValidHttpUrl('ftp://files.example.com'), false);
      assert.strictEqual(isValidHttpUrl('data:text/html,test'), false);
      assert.strictEqual(isValidHttpUrl('not a url'), false);
      assert.strictEqual(isValidHttpUrl(''), false);
      assert.strictEqual(isValidHttpUrl(undefined), false);
    });

    // ----------------------------------------------------
    // TEST 30: Invalid/malformed URLs in button payload are stripped at send time
    // ----------------------------------------------------
    await test('30. Malformed or dangerous URLs in inlineKeyboard are sanitized and stripped by buildSendOptions', () => {
      const scheduleWithBadUrls = {
        id: 'BADURL1',
        chatId: testChatId,
        message: 'Test bad URLs',
        createdAt: new Date().toISOString(),
        runsCount: 0,
        inlineKeyboard: [
          [
            { text: 'Good Link', url: 'https://good.com' },
            { text: 'Evil JS', url: 'javascript:alert(document.cookie)' }
          ],
          [
            { text: 'Malformed', url: 'not-a-url' }
          ]
        ]
      };

      const options = MessageScheduler.buildSendOptions(scheduleWithBadUrls as any);
      assert.ok(options.reply_markup?.inline_keyboard);
      assert.strictEqual(options.reply_markup.inline_keyboard.length, 1, 'Only row 1 should remain (row 2 had only malformed URL)');
      assert.strictEqual(options.reply_markup.inline_keyboard[0].length, 1, 'Row 1 should only contain valid good link');
      assert.strictEqual(options.reply_markup.inline_keyboard[0][0].text, 'Good Link');
      assert.strictEqual(options.reply_markup.inline_keyboard[0][0].url, 'https://good.com');
    });

    // ----------------------------------------------------
    // TEST 31: Storage rehydration preserves pinAfterSend and inlineKeyboard
    // ----------------------------------------------------
    await test('31. Storage rehydration (importGroupFullBackup) preserves pinAfterSend and inlineKeyboard', async () => {
      clearGroupSchedules();

      const buttons: ScheduledPostButton[][] = [
        [{ text: 'Official Telegram', url: 'https://t.me/example' }]
      ];

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        adminId,
        'SuperAdmin',
        '2h',
        'Hydration Backup Post',
        'photo',
        'photo_hydration_999',
        true, // autoDeletePrevious
        undefined,
        true, // pinAfterSend
        buttons
      );

      const schedId = schedRes.schedule!.id;
      const initialSchedules = db.getGroupSchedules(testChatId);

      const backupConfig = {
        backupVersion: '2.0',
        settings: {},
        schedules: initialSchedules
      };

      // Clear from storage
      db.deleteSchedule(testChatId, schedId);
      assert.strictEqual(db.getGroupSchedules(testChatId).length, 0);

      // Rehydrate
      const restoreResult = db.importGroupFullBackup(testChatId, backupConfig, ['schedules'], true, 'admin', true);
      assert.strictEqual(restoreResult.ok, true);

      const rehydrated = db.getScheduleById(schedId);
      assert.ok(rehydrated, 'Schedule must exist after rehydration');
      assert.strictEqual(rehydrated.pinAfterSend, true);
      assert.strictEqual(rehydrated.autoDeletePrevious, true);
      assert.strictEqual(rehydrated.contentType, 'photo');
      assert.strictEqual(rehydrated.mediaFileId, 'photo_hydration_999');
      assert.ok(rehydrated.inlineKeyboard);
      assert.strictEqual(rehydrated.inlineKeyboard[0][0].text, 'Official Telegram');
      assert.strictEqual(rehydrated.inlineKeyboard[0][0].url, 'https://t.me/example');
    });

    console.log(`\n================================================================`);
    console.log(`🎉 /SCHEDULE REPLIED-MEDIA & BUTTONS/PIN TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
    console.log(`================================================================`);

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.sendPhoto = originalSendPhoto;
    telegramApi.sendVideo = originalSendVideo;
    telegramApi.sendAnimation = originalSendAnimation;
    telegramApi.sendDocument = originalSendDocument;
    telegramApi.deleteMessage = originalDeleteMessage;
    telegramApi.pinChatMessage = originalPinChatMessage;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
  }
}

runScheduleRepliedMediaTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
