process.env.NODE_ENV = 'test';

import { strict as assert } from 'node:assert';
import { PostBuilderManager, parseScheduleTime } from '../server/telegram/postBuilder.js';
import { PostSender } from '../server/telegram/postSender.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { TelegramMessage, TelegramCallbackQuery, PostPayload, ScheduledMessage } from '../server/telegram/types.js';

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

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING TELEGRAM RICH POST BUILDER SCHEDULING TEST SUITE (PHASE 3B)');
  console.log('================================================================\n');

  const chatId = -100555666777;
  const adminId = 123456;
  const nonAdminId = 999111;

  const capturedMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const capturedEdits: Array<{ chatId: number; messageId: number; text: string; options?: any }> = [];
  const capturedPostSenderCalls: Array<{ chatId: number; payload: PostPayload }> = [];

  let nextMessageId = 60000;
  let forceDbAddScheduleError = false;

  const originalSendMessage = telegramApi.sendMessage;
  const originalEditMessageText = telegramApi.editMessageText;
  const originalAnswerCallbackQuery = telegramApi.answerCallbackQuery;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;
  const originalPostSenderSend = PostSender.send;
  const originalAddSchedule = db.addSchedule.bind(db);

  (telegramApi as any).sendMessage = async (cId: number, text: string, options?: any) => {
    capturedMessages.push({ chatId: cId, text, options });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: cId }, text } };
  };

  (telegramApi as any).editMessageText = async (cId: number, mId: number, text: string, options?: any) => {
    capturedEdits.push({ chatId: cId, messageId: mId, text, options });
    return { ok: true, result: { message_id: mId, chat: { id: cId }, text } };
  };

  (telegramApi as any).answerCallbackQuery = async (queryId: string, options?: any) => {
    return { ok: true, result: true };
  };

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 987654321, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }
  });

  (telegramApi as any).getChatMember = async (_cId: number, userId: number) => ({
    ok: true,
    result: {
      status: (userId === adminId) ? 'administrator' : 'member',
      user: { id: userId, is_bot: false, first_name: `User_${userId}` },
      can_delete_messages: true,
      can_pin_messages: true
    }
  });

  (PostSender as any).send = async (cId: number, payload: PostPayload) => {
    capturedPostSenderCalls.push({ chatId: cId, payload });
    return { ok: true, chatId: cId, messageId: nextMessageId++, result: { message_id: nextMessageId } };
  };

  (db as any).addSchedule = (scheduleData: any) => {
    if (forceDbAddScheduleError) {
      throw new Error('Simulated Database Write Failure');
    }
    return originalAddSchedule(scheduleData);
  };

  function createCommandContext(command: string, userId: number, cId: number = chatId, reply?: TelegramMessage, rawArgs?: string): CommandContext {
    const parts = command.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);
    const calculatedRawArgs = rawArgs !== undefined ? rawArgs : args.join(' ');

    return {
      message: {
        message_id: nextMessageId++,
        chat: { id: cId, type: 'supergroup', title: 'Test Supergroup' },
        from: { id: userId, is_bot: false, first_name: `User_${userId}` },
        date: Math.floor(Date.now() / 1000),
        text: command,
        reply_to_message: reply
      },
      chatId: cId,
      chatTitle: 'Test Supergroup',
      sender: { id: userId, is_bot: false, first_name: `User_${userId}` },
      isAnonymousAdmin: false,
      adminDisplayName: `User_${userId}`,
      args,
      command: cmd,
      rawArgs: calculatedRawArgs
    };
  }

  function createCallbackQuery(data: string, userId: number, cId: number = chatId): TelegramCallbackQuery {
    return {
      id: `query_${Math.random()}`,
      from: { id: userId, is_bot: false, first_name: `User_${userId}` },
      message: {
        message_id: 55555,
        chat: { id: cId, type: 'supergroup', title: 'Test Supergroup' },
        date: Math.floor(Date.now() / 1000),
        text: 'Post Builder'
      },
      chat_instance: 'instance_123',
      data
    };
  }

  function resetState() {
    PostBuilderManager.resetSessions();
    capturedMessages.length = 0;
    capturedEdits.length = 0;
    capturedPostSenderCalls.length = 0;
    forceDbAddScheduleError = false;
    const existing = db.getGroupSchedules(chatId);
    for (const s of existing) {
      db.deleteSchedule(chatId, s.id);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Schedule button appears in PREVIEW
    // -------------------------------------------------------------------------
    await test('1. Schedule button appears in PREVIEW menu inline keyboard', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hello, this is a test post for scheduling!'
      });

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'PREVIEW');

      // Check captured messages/edits for Schedule button
      const lastEdit = capturedEdits[capturedEdits.length - 1] || capturedMessages[capturedMessages.length - 1];
      const buttons = lastEdit.options?.reply_markup?.inline_keyboard?.flat();
      const schedBtn = buttons?.find((b: any) => b.text.includes('Schedule') && b.callback_data === 'postb:preview:schedule');
      assert.ok(schedBtn, 'Schedule button must be present in PREVIEW inline keyboard');
    });

    // -------------------------------------------------------------------------
    // 2. Schedule action transitions state to WAITING_FOR_SCHEDULE_TIME
    // -------------------------------------------------------------------------
    await test('2. Clicking Schedule transitions state to WAITING_FOR_SCHEDULE_TIME and prompts user', async () => {
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'WAITING_FOR_SCHEDULE_TIME');

      const lastEdit = capturedEdits[capturedEdits.length - 1];
      assert(lastEdit.text.includes('Schedule Post'));
      assert(lastEdit.text.includes('Send the time'));
    });

    // -------------------------------------------------------------------------
    // 3. parseScheduleTime unit tests
    // -------------------------------------------------------------------------
    await test('3. parseScheduleTime parses relative and duration strings correctly', () => {
      const baseNow = new Date('2026-10-04T12:00:00.000Z').getTime();

      const r1 = parseScheduleTime('30m', baseNow);
      assert(!('error' in r1));
      assert.strictEqual(r1.ms, 30 * 60 * 1000);
      assert.strictEqual(r1.formatted, 'in 30 minutes');
      assert.strictEqual(r1.nextRunIso, '2026-10-04T12:30:00.000Z');

      const r2 = parseScheduleTime('2h', baseNow);
      assert(!('error' in r2));
      assert.strictEqual(r2.ms, 2 * 3600 * 1000);
      assert.strictEqual(r2.formatted, 'in 2 hours');

      const r3 = parseScheduleTime('1d', baseNow);
      assert(!('error' in r3));
      assert.strictEqual(r3.ms, 24 * 3600 * 1000);
      assert.strictEqual(r3.formatted, 'in 1 day');

      const r4 = parseScheduleTime('in 45 minutes', baseNow);
      assert(!('error' in r4));
      assert.strictEqual(r4.ms, 45 * 60 * 1000);
    });

    // -------------------------------------------------------------------------
    // 4. Invalid date/time rejected
    // -------------------------------------------------------------------------
    await test('4. Invalid date/time formats are rejected with an error message', async () => {
      const err1 = parseScheduleTime('invalid-text');
      assert('error' in err1);

      const err2 = parseScheduleTime('25:99');
      assert('error' in err2);

      // Pass invalid time into builder session
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'not-a-valid-time'
      });

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'WAITING_FOR_SCHEDULE_TIME');
      assert(capturedMessages.some(m => m.text.includes('Invalid Schedule Time')));
    });

    // -------------------------------------------------------------------------
    // 5. Past schedule date rejected
    // -------------------------------------------------------------------------
    await test('5. Past calendar date is rejected', () => {
      const baseNow = new Date('2026-10-04T12:00:00.000Z').getTime();
      const pastRes = parseScheduleTime('2020-01-01 10:00', baseNow);
      assert('error' in pastRes);
      assert(pastRes.error.includes('future'));
    });

    // -------------------------------------------------------------------------
    // 6. Valid schedule time transitions to SCHEDULE_CONFIRM
    // -------------------------------------------------------------------------
    await test('6. Valid time input transitions builder state to SCHEDULE_CONFIRM and shows confirmation menu', async () => {
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '2h'
      });

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'SCHEDULE_CONFIRM');
      assert.strictEqual(session?.scheduledTime?.formatted, 'in 2 hours');

      const lastEdit = capturedEdits[capturedEdits.length - 1] || capturedMessages[capturedMessages.length - 1];
      assert(lastEdit.text.includes('Schedule Post Confirmation'));
      assert(lastEdit.text.includes('in 2 hours'));

      const buttons = lastEdit.options?.reply_markup?.inline_keyboard?.flat();
      assert.ok(buttons?.some((b: any) => b.callback_data === 'postb:sched:confirm'), 'Confirm Schedule button must be present');
    });

    // -------------------------------------------------------------------------
    // 7. Schedule is NOT created before explicit confirmation
    // -------------------------------------------------------------------------
    await test('7. Schedule record is NOT created in storage prior to confirmation', async () => {
      const groupSchedules = db.getGroupSchedules(chatId);
      const builderSchedule = groupSchedules.find(s => s.messageText === 'Hello, this is a test post for scheduling!');
      assert.strictEqual(builderSchedule, undefined, 'No schedule should be created before clicking confirm');
    });

    // -------------------------------------------------------------------------
    // 8. Confirm Schedule creates canonical ScheduledMessage
    // -------------------------------------------------------------------------
    await test('8. Confirm Schedule creates exactly one ScheduledMessage and clears session', async () => {
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));

      const groupSchedules = db.getGroupSchedules(chatId);
      const created = groupSchedules.find(s => s.messageText === 'Hello, this is a test post for scheduling!');
      assert.ok(created, 'Scheduled record must exist in db');
      assert.strictEqual(created?.contentType, 'text');
      assert.strictEqual(created?.messageText, 'Hello, this is a test post for scheduling!');
      assert.strictEqual(created?.adminId, adminId);
      assert.strictEqual(created?.enabled, true);

      // Session should be cleared from memory
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);

      const lastEdit = capturedEdits[capturedEdits.length - 1];
      assert(lastEdit.text.includes('Post scheduled successfully'));
      assert(lastEdit.text.includes(created!.id));
    });

    // -------------------------------------------------------------------------
    // 9. Scheduled payload preserves media, caption, and multi-row buttons
    // -------------------------------------------------------------------------
    await test('9. Scheduled payload preserves media file_id, caption, and button grid rows', async () => {
      resetState();
      const repliedMsg: TelegramMessage = {
        message_id: 77777,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000),
        photo: [{ file_id: 'sched_photo_123', file_unique_id: 'p1', width: 800, height: 600 }],
        caption: 'Special Discount Photo Announcement!',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Website', url: 'https://mysite.com' }],
            [{ text: 'Support', url: 'https://support.com' }, { text: 'Channel', url: 'https://t.me/mychannel' }]
          ]
        }
      };

      const ctx = createCommandContext('/post', adminId, chatId, repliedMsg);
      await CommandHandler.handleCommand(ctx);

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.buttons.length, 2);

      // Click Schedule
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      assert.strictEqual(session?.state, 'WAITING_FOR_SCHEDULE_TIME');

      // Send 1d
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '1d'
      });
      assert.strictEqual(session?.state, 'SCHEDULE_CONFIRM');

      // Confirm
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));

      const groupSchedules = db.getGroupSchedules(chatId);
      const photoSchedule = groupSchedules.find(s => s.mediaFileId === 'sched_photo_123');
      assert.ok(photoSchedule, 'Photo schedule record must exist');
      assert.strictEqual(photoSchedule?.contentType, 'photo');
      assert.strictEqual(photoSchedule?.messageText, 'Special Discount Photo Announcement!');
      assert.strictEqual(photoSchedule?.inlineKeyboard?.length, 2);
      assert.strictEqual(photoSchedule?.inlineKeyboard?.[0][0].text, 'Website');
      assert.strictEqual(photoSchedule?.inlineKeyboard?.[1][0].text, 'Support');
      assert.strictEqual(photoSchedule?.inlineKeyboard?.[1][1].text, 'Channel');
    });

    // -------------------------------------------------------------------------
    // 10. Execution of scheduled rich post via scheduler -> PostSender
    // -------------------------------------------------------------------------
    await test('10. Scheduled rich post adapts to PostPayload and sends via PostSender', async () => {
      const groupSchedules = db.getGroupSchedules(chatId);
      const photoSchedule = groupSchedules.find(s => s.mediaFileId === 'sched_photo_123');
      assert.ok(photoSchedule);

      const payload = PostSender.scheduleToPayload(photoSchedule!, photoSchedule!.messageText);
      assert.strictEqual(payload.contentType, 'photo');
      assert.strictEqual(payload.mediaFileId, 'sched_photo_123');
      assert.strictEqual(payload.text, 'Special Discount Photo Announcement!');
      assert.strictEqual(payload.buttons?.length, 2);

      capturedPostSenderCalls.length = 0;
      const sendRes = await PostSender.send(chatId, payload);
      assert.strictEqual(sendRes.ok, true);
      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.mediaFileId, 'sched_photo_123');
    });

    // -------------------------------------------------------------------------
    // 11. Failed schedule creation preserves session
    // -------------------------------------------------------------------------
    await test('11. Database failure during schedule creation preserves session for retry', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Retry Schedule Post'
      });
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '30m'
      });

      forceDbAddScheduleError = true;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));

      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true, 'Session must remain active on DB failure');
      assert(capturedEdits.some(e => e.text.includes('Failed to create schedule')));
    });

    // -------------------------------------------------------------------------
    // 12. Repeated confirmation does not create duplicate schedules
    // -------------------------------------------------------------------------
    await test('12. Repeated Confirm Schedule clicks do not create duplicate schedules', async () => {
      forceDbAddScheduleError = false;
      const initialScheduleCount = db.getGroupSchedules(chatId).length;

      // First click succeeds and clears session
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));
      assert.strictEqual(db.getGroupSchedules(chatId).length, initialScheduleCount + 1);

      // Second click finds session cleared
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));
      assert.strictEqual(db.getGroupSchedules(chatId).length, initialScheduleCount + 1, 'Schedule count must not increase on duplicate callback');
    });

    // -------------------------------------------------------------------------
    // 13. Foreign user cannot confirm schedule
    // -------------------------------------------------------------------------
    await test('13. Unauthorized / foreign admin cannot confirm another user schedule', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Admin A Post'
      });
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '1h'
      });

      const otherAdminId = 777999;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', otherAdminId));

      assert.strictEqual(PostBuilderManager.getSession(chatId, adminId)?.state, 'SCHEDULE_CONFIRM', 'Session must remain untouched by foreign click');
    });

    // -------------------------------------------------------------------------
    // 14. Change time and back button navigation
    // -------------------------------------------------------------------------
    await test('14. Change Time and Back navigation works smoothly in confirmation menu', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);

      // Change time goes back to WAITING_FOR_SCHEDULE_TIME
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      assert.strictEqual(session?.state, 'WAITING_FOR_SCHEDULE_TIME');

      // Back to preview
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:done', adminId));
      assert.strictEqual(session?.state, 'PREVIEW');
    });

    // -------------------------------------------------------------------------
    // 15. Send Now continues to work alongside Schedule
    // -------------------------------------------------------------------------
    await test('15. Send Now continues to deliver immediately via PostSender', async () => {
      capturedPostSenderCalls.length = 0;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:send', adminId));

      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.text, 'Admin A Post');
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);
    });

    // -------------------------------------------------------------------------
    // 16. Existing /schedule command remains untouched and functional
    // -------------------------------------------------------------------------
    await test('16. Existing /schedule command continues to create schedules directly', async () => {
      const initialCount = db.getGroupSchedules(chatId).length;
      const ctx = createCommandContext('/schedule 2h delOn Standard CLI Scheduled Message', adminId);
      await CommandHandler.handleCommand(ctx);

      const newSchedules = db.getGroupSchedules(chatId);
      assert.strictEqual(newSchedules.length, initialCount + 1);
      const cliSched = newSchedules.find(s => s.messageText === 'Standard CLI Scheduled Message');
      assert.ok(cliSched);
      assert.strictEqual(cliSched?.autoDeletePrevious, true);
    });

    // -------------------------------------------------------------------------
    // 17. Video/Animation/Document rich post scheduling
    // -------------------------------------------------------------------------
    await test('17. Video / Animation / Document posts schedule with correct contentType and fileId', async () => {
      resetState();
      const repliedMsg: TelegramMessage = {
        message_id: 88888,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000),
        video: { file_id: 'sched_vid_999', file_unique_id: 'v1', width: 1280, height: 720, duration: 30 },
        caption: 'Video Schedule Test Caption'
      };
      const ctx = createCommandContext('/post', adminId, chatId, repliedMsg);
      await CommandHandler.handleCommand(ctx);

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '3h'
      });
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:sched:confirm', adminId));

      const groupSchedules = db.getGroupSchedules(chatId);
      const vidSched = groupSchedules.find(s => s.mediaFileId === 'sched_vid_999');
      assert.ok(vidSched);
      assert.strictEqual(vidSched?.contentType, 'video');
      assert.strictEqual(vidSched?.messageText, 'Video Schedule Test Caption');
    });

    // -------------------------------------------------------------------------
    // 18. Cancel removes builder session from scheduling state
    // -------------------------------------------------------------------------
    await test('18. Cancel button clears session from WAITING_FOR_SCHEDULE_TIME or SCHEDULE_CONFIRM', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Cancel Me'
      });
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:cancel', adminId));
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);
    });

    // -------------------------------------------------------------------------
    // 19. Cross-chat isolation during scheduling
    // -------------------------------------------------------------------------
    await test('19. Cross-chat isolation: Admin scheduling in Chat 1 does not affect Chat 2', async () => {
      resetState();
      const chat1 = -100888111222;
      const chat2 = -100999333444;

      await CommandHandler.handleCommand(createCommandContext('/post', adminId, chat1));
      await CommandHandler.handleCommand(createCommandContext('/post', adminId, chat2));

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId, chat1));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chat1, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Chat 1 Post'
      });

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId, chat1));
      assert.strictEqual(PostBuilderManager.getSession(chat1, adminId)?.state, 'WAITING_FOR_SCHEDULE_TIME');
      assert.strictEqual(PostBuilderManager.getSession(chat2, adminId)?.state, 'SELECTING_TYPE');
    });

    // -------------------------------------------------------------------------
    // 20. Empty text post cannot enter scheduling flow
    // -------------------------------------------------------------------------
    await test('20. Empty text post is prevented from entering scheduling flow', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      // Try to click schedule with empty session
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:schedule', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'SELECTING_TYPE');
    });

    // -------------------------------------------------------------------------
    // 21. Non-admin cannot start builder or schedule
    // -------------------------------------------------------------------------
    await test('21. Non-admin member is rejected by requireAdmin from /post', async () => {
      resetState();
      const ctx = createCommandContext('/post', nonAdminId);
      await CommandHandler.handleCommand(ctx);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, nonAdminId), false);
    });

    // -------------------------------------------------------------------------
    // 22. PostSender delivery execution integration
    // -------------------------------------------------------------------------
    await test('22. PostSender handles scheduled rich post delivery with all options', async () => {
      const scheduleRecord: ScheduledMessage = {
        id: 'SCHED1',
        chatId,
        message: 'Integrated Test Delivery',
        messageText: 'Integrated Test Delivery',
        contentType: 'text',
        inlineKeyboard: [[{ text: 'Direct Link', url: 'https://example.com' }]],
        createdAt: new Date().toISOString(),
        runsCount: 0
      };

      const payload = PostSender.scheduleToPayload(scheduleRecord, scheduleRecord.messageText);
      capturedPostSenderCalls.length = 0;
      const res = await PostSender.send(chatId, payload);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.buttons?.length, 1);
    });

  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.editMessageText = originalEditMessageText;
    telegramApi.answerCallbackQuery = originalAnswerCallbackQuery;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
    PostSender.send = originalPostSenderSend;
    db.addSchedule = originalAddSchedule;
  }

  console.log('\n================================================================');
  console.log(`🎉 POST BUILDER SCHEDULING SUITE: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled error in PostBuilder scheduling test suite:', err);
  process.exit(1);
});
