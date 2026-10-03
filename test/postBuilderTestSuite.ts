process.env.NODE_ENV = 'test';

import { strict as assert } from 'node:assert';
import { PostBuilderManager, PostBuilderSession } from '../server/telegram/postBuilder.js';
import { PostSender } from '../server/telegram/postSender.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { TelegramMessage, TelegramCallbackQuery, PostPayload } from '../server/telegram/types.js';

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
  console.log('🧪 STARTING TELEGRAM RICH POST BUILDER TEST SUITE (PHASE 3A)');
  console.log('================================================================\n');

  const chatId = -100555666777;
  const adminId = 123456;
  const nonAdminId = 999111;

  const capturedMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const capturedEdits: Array<{ chatId: number; messageId: number; text: string; options?: any }> = [];
  const capturedPostSenderCalls: Array<{ chatId: number; payload: PostPayload }> = [];

  let nextMessageId = 50000;
  let shouldPostSenderFail = false;

  const originalSendMessage = telegramApi.sendMessage;
  const originalEditMessageText = telegramApi.editMessageText;
  const originalAnswerCallbackQuery = telegramApi.answerCallbackQuery;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;
  const originalPostSenderSend = PostSender.send;

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
    if (shouldPostSenderFail) {
      return { ok: false, chatId: cId, error: 'Simulated Telegram send failure' };
    }
    return { ok: true, chatId: cId, messageId: nextMessageId++, result: { message_id: nextMessageId } };
  };

  function createCommandContext(command: string, userId: number, cId: number = chatId, reply?: TelegramMessage, rawArgs: string = ''): CommandContext {
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
      args: [],
      command,
      rawArgs
    };
  }

  function createCallbackQuery(data: string, userId: number, cId: number = chatId, mId: number = 4444): TelegramCallbackQuery {
    return {
      id: `cb_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      from: { id: userId, is_bot: false, first_name: `User_${userId}` },
      message: {
        message_id: mId,
        chat: { id: cId, type: 'supergroup', title: 'Test Supergroup' },
        date: Math.floor(Date.now() / 1000)
      },
      data
    };
  }

  function resetState() {
    PostBuilderManager.resetSessions();
    capturedMessages.length = 0;
    capturedEdits.length = 0;
    capturedPostSenderCalls.length = 0;
    shouldPostSenderFail = false;
  }

  try {
    // -------------------------------------------------------------------------
    // 1. /post starts a session
    // -------------------------------------------------------------------------
    await test('1. /post starts a new session for authorized admin', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);
      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'SELECTING_TYPE');
      assert.strictEqual(capturedMessages.length, 1);
      assert(capturedMessages[0].text.includes('Roxie Post Builder'));
    });

    // -------------------------------------------------------------------------
    // 2. /buildpost starts a session
    // -------------------------------------------------------------------------
    await test('2. /buildpost alias also starts a session', async () => {
      resetState();
      const ctx = createCommandContext('/buildpost', adminId);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);
    });

    // -------------------------------------------------------------------------
    // 3. Unauthorized user is rejected
    // -------------------------------------------------------------------------
    await test('3. Non-admin user is rejected from running /post', async () => {
      resetState();
      const ctx = createCommandContext('/post', nonAdminId);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true); // handled by sending denial
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, nonAdminId), false);
      assert(capturedMessages.some(m => m.text.includes('administrator') || m.text.includes('rights') || m.text.includes('permission')));
    });

    // -------------------------------------------------------------------------
    // 4. Text post creation flow
    // -------------------------------------------------------------------------
    await test('4. Text post creation flow through WAITING_FOR_TEXT to PREVIEW', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      // Select 'text'
      const cb = createCallbackQuery('postb:type:text', adminId);
      await CommandHandler.handleCallbackQuery(cb);

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'WAITING_FOR_TEXT');
      assert.strictEqual(session?.contentType, 'text');

      // Send text message
      const textMsg: TelegramMessage = {
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '<b>Important Announcement!</b>\nCheck out the update.'
      };
      const handledMsg = await PostBuilderManager.handleIncomingMessage(textMsg);
      assert.strictEqual(handledMsg, true);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.text, '<b>Important Announcement!</b>\nCheck out the update.');
    });

    // -------------------------------------------------------------------------
    // 5. Photo + caption creation
    // -------------------------------------------------------------------------
    await test('5. Photo post creation with photo file_id and caption', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      const cb = createCallbackQuery('postb:type:photo', adminId);
      await CommandHandler.handleCallbackQuery(cb);

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'WAITING_FOR_MEDIA');
      assert.strictEqual(session?.contentType, 'photo');

      // Send photo message
      const photoMsg: TelegramMessage = {
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        photo: [{ file_id: 'small_thumb', file_unique_id: 'u1', width: 100, height: 100 }, { file_id: 'large_photo_file_id', file_unique_id: 'u2', width: 800, height: 800 }],
        caption: 'Beautiful scenery'
      };
      await PostBuilderManager.handleIncomingMessage(photoMsg);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.mediaFileId, 'large_photo_file_id');
      assert.strictEqual(session?.text, 'Beautiful scenery');
    });

    // -------------------------------------------------------------------------
    // 6. Video + caption creation
    // -------------------------------------------------------------------------
    await test('6. Video post creation with video file_id and caption', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:video', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);

      const videoMsg: TelegramMessage = {
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        video: { file_id: 'video_file_id_555', file_unique_id: 'u3', width: 640, height: 480, duration: 60 },
        caption: 'Watch this tutorial'
      };
      await PostBuilderManager.handleIncomingMessage(videoMsg);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.mediaFileId, 'video_file_id_555');
      assert.strictEqual(session?.text, 'Watch this tutorial');
    });

    // -------------------------------------------------------------------------
    // 7. Animation/GIF + caption creation
    // -------------------------------------------------------------------------
    await test('7. Animation post creation with animation file_id and caption', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:animation', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);

      const animMsg: TelegramMessage = {
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        animation: { file_id: 'gif_file_id_888', file_unique_id: 'u4', width: 320, height: 240, duration: 5 },
        caption: 'Funny reaction GIF'
      };
      await PostBuilderManager.handleIncomingMessage(animMsg);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.mediaFileId, 'gif_file_id_888');
      assert.strictEqual(session?.text, 'Funny reaction GIF');
    });

    // -------------------------------------------------------------------------
    // 8. Document + caption creation
    // -------------------------------------------------------------------------
    await test('8. Document post creation with document file_id and caption', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:document', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);

      const docMsg: TelegramMessage = {
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        document: { file_id: 'doc_pdf_file_id_101', file_unique_id: 'u5', file_name: 'whitepaper.pdf' },
        caption: 'Read the whitepaper'
      };
      await PostBuilderManager.handleIncomingMessage(docMsg);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.mediaFileId, 'doc_pdf_file_id_101');
      assert.strictEqual(session?.text, 'Read the whitepaper');
    });

    // -------------------------------------------------------------------------
    // 9. Button creation
    // -------------------------------------------------------------------------
    await test('9. Single button creation flow', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Hello post'
      });

      // Click 'Manage Buttons'
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:buttons', adminId));
      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'MANAGING_BUTTONS');

      // Click 'Add Button'
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:add', adminId));
      assert.strictEqual(session?.state, 'WAITING_FOR_BUTTON_TEXT');

      // Send button text
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Visit Website'
      });
      assert.strictEqual(session?.state, 'WAITING_FOR_BUTTON_URL');
      assert.strictEqual(session?.pendingButtonText, 'Visit Website');

      // Send button URL
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'https://example.com'
      });
      assert.strictEqual(session?.state, 'MANAGING_BUTTONS');
      assert.strictEqual(session?.buttons.length, 1);
      assert.strictEqual(session?.buttons[0].length, 1);
      assert.strictEqual(session?.buttons[0][0].text, 'Visit Website');
      assert.strictEqual(session?.buttons[0][0].url, 'https://example.com');
    });

    // -------------------------------------------------------------------------
    // 10. Multiple buttons in same row
    // -------------------------------------------------------------------------
    await test('10. Multiple buttons in same row', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      // Add second button
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:add', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Docs'
      });
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'https://docs.example.com'
      });

      assert.strictEqual(session?.buttons[0].length, 2);
      assert.strictEqual(session?.buttons[0][1].text, 'Docs');
      assert.strictEqual(session?.buttons[0][1].url, 'https://docs.example.com');
    });

    // -------------------------------------------------------------------------
    // 11. Multiple button rows (New Row)
    // -------------------------------------------------------------------------
    await test('11. New Row button management adds a second row', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:newrow', adminId));
      assert.strictEqual(session?.buttons.length, 2);

      // Add button to Row 2
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:add', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Support'
      });
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'https://t.me/support'
      });

      assert.strictEqual(session?.buttons.length, 2);
      assert.strictEqual(session?.buttons[0].length, 2);
      assert.strictEqual(session?.buttons[1].length, 1);
      assert.strictEqual(session?.buttons[1][0].text, 'Support');
    });

    // -------------------------------------------------------------------------
    // 12. Button removal
    // -------------------------------------------------------------------------
    await test('12. Remove Last button removes newest button', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:remlast', adminId));
      // Row 2 is now removed because it became empty
      assert.strictEqual(session?.buttons.length, 1);
      assert.strictEqual(session?.buttons[0].length, 2);
    });

    // -------------------------------------------------------------------------
    // 13. Clear all buttons
    // -------------------------------------------------------------------------
    await test('13. Clear All buttons clears button grid', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:clear', adminId));
      assert.strictEqual(session?.buttons.length, 0);
    });

    // -------------------------------------------------------------------------
    // 14. Invalid URL rejection
    // -------------------------------------------------------------------------
    await test('14. Invalid URL is rejected and user is prompted to retry', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:add', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Bad Link'
      });

      // Send invalid URL (javascript:alert(1))
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'javascript:alert(1)'
      });

      assert.strictEqual(session?.state, 'WAITING_FOR_BUTTON_URL');
      assert.strictEqual(session?.buttons.length, 0);
      assert(capturedMessages.some(m => m.text.includes('Invalid URL')));

      // Now send valid URL
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'https://valid.com'
      });
      assert.strictEqual(session?.state, 'MANAGING_BUTTONS');
      assert.strictEqual(session?.buttons.length, 1);
      assert.strictEqual(session?.buttons[0][0].url, 'https://valid.com');
    });

    // -------------------------------------------------------------------------
    // 15. Invalid button text rejection
    // -------------------------------------------------------------------------
    await test('15. Empty or oversized button text is rejected', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:add', adminId));
      assert.strictEqual(session?.state, 'WAITING_FOR_BUTTON_TEXT');

      // Send 100-character button text (> 64)
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'A'.repeat(100)
      });

      assert.strictEqual(session?.state, 'WAITING_FOR_BUTTON_TEXT');
      assert(capturedMessages.some(m => m.text.includes('Button text must be between')));
    });

    // -------------------------------------------------------------------------
    // 16. Preview generation
    // -------------------------------------------------------------------------
    await test('16. Done returns to PREVIEW state and renders preview', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:btn:done', adminId));
      assert.strictEqual(session?.state, 'PREVIEW');
      assert(capturedEdits.some(e => e.text.includes('Post Preview')));
    });

    // -------------------------------------------------------------------------
    // 17. Send calls PostSender.send
    // -------------------------------------------------------------------------
    await test('17. Send Now calls PostSender.send with correct PostPayload', async () => {
      capturedPostSenderCalls.length = 0;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:send', adminId));

      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].chatId, chatId);
      assert.strictEqual(capturedPostSenderCalls[0].payload.contentType, 'text');
      assert.strictEqual(capturedPostSenderCalls[0].payload.text, 'Hello post');
      assert.strictEqual(capturedPostSenderCalls[0].payload.buttons?.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.buttons[0][0].text, 'Bad Link');
      assert.strictEqual(capturedPostSenderCalls[0].payload.buttons[0][0].url, 'https://valid.com');
    });

    // -------------------------------------------------------------------------
    // 18. Successful send clears session
    // -------------------------------------------------------------------------
    await test('18. Successful delivery clears the session from memory', async () => {
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);
    });

    // -------------------------------------------------------------------------
    // 19. Failed send preserves session for retry
    // -------------------------------------------------------------------------
    await test('19. Failed delivery keeps session active and shows error', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Retry Test Post'
      });

      shouldPostSenderFail = true;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:send', adminId));

      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);
      assert(capturedEdits.some(e => e.text.includes('Failed to send post')));
    });

    // -------------------------------------------------------------------------
    // 20. Cancel clears session
    // -------------------------------------------------------------------------
    await test('20. Cancel action clears session and sends cancellation text', async () => {
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:cancel', adminId));
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);
      assert(capturedEdits.some(e => e.text.includes('Post creation cancelled')));
    });

    // -------------------------------------------------------------------------
    // 21. /cancel command clears session
    // -------------------------------------------------------------------------
    await test('21. Typing /cancel during session aborts and clears session', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);

      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '/cancel'
      });

      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), false);
    });

    // -------------------------------------------------------------------------
    // 22. User A cannot access User B's session
    // -------------------------------------------------------------------------
    await test('22. Session isolation: User B cannot touch User A session', async () => {
      resetState();
      const ctxA = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctxA);

      const otherAdminId = 888777;
      // User B tries to cancel or interact with User A's session
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:photo', otherAdminId));

      const sessionA = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(sessionA?.state, 'SELECTING_TYPE'); // Unaltered
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, otherAdminId), false);
    });

    // -------------------------------------------------------------------------
    // 23. Same user in different chats gets separate sessions
    // -------------------------------------------------------------------------
    await test('23. Same admin in two different chats has distinct sessions', async () => {
      resetState();
      const chat1 = -100111111111;
      const chat2 = -100222222222;

      await CommandHandler.handleCommand(createCommandContext('/post', adminId, chat1));
      await CommandHandler.handleCommand(createCommandContext('/post', adminId, chat2));

      assert.strictEqual(PostBuilderManager.hasActiveSession(chat1, adminId), true);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chat2, adminId), true);

      // Mutate chat 1
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:type:text', adminId, chat1));
      assert.strictEqual(PostBuilderManager.getSession(chat1, adminId)?.state, 'WAITING_FOR_TEXT');
      assert.strictEqual(PostBuilderManager.getSession(chat2, adminId)?.state, 'SELECTING_TYPE');
    });

    // -------------------------------------------------------------------------
    // 24. Malformed callback cannot crash or corrupt session
    // -------------------------------------------------------------------------
    await test('24. Malformed callback data is safely ignored without crash', async () => {
      resetState();
      const ctx = createCommandContext('/post', adminId);
      await CommandHandler.handleCommand(ctx);

      const handled = await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:unknown:garbage:action', adminId));
      assert.strictEqual(handled, false);
      assert.strictEqual(PostBuilderManager.hasActiveSession(chatId, adminId), true);
    });

    // -------------------------------------------------------------------------
    // 25. Replied message prefill text
    // -------------------------------------------------------------------------
    await test('25. /post replying to existing text pre-populates session in PREVIEW', async () => {
      resetState();
      const repliedMsg: TelegramMessage = {
        message_id: 1234,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000),
        text: 'Prefilled message text'
      };
      const ctx = createCommandContext('/post', adminId, chatId, repliedMsg);
      await CommandHandler.handleCommand(ctx);

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.contentType, 'text');
      assert.strictEqual(session?.text, 'Prefilled message text');
    });

    // -------------------------------------------------------------------------
    // 26. Replied message prefill photo + buttons
    // -------------------------------------------------------------------------
    await test('26. /post replying to photo with inline buttons extracts both', async () => {
      resetState();
      const repliedMsg: TelegramMessage = {
        message_id: 5678,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000),
        photo: [{ file_id: 'replied_photo_id', file_unique_id: 'u9', width: 400, height: 400 }],
        caption: 'Replied Photo Caption',
        reply_markup: {
          inline_keyboard: [
            [{ text: 'Link 1', url: 'https://link1.com' }],
            [{ text: 'Link 2', url: 'https://link2.com' }]
          ]
        }
      };
      const ctx = createCommandContext('/post', adminId, chatId, repliedMsg);
      await CommandHandler.handleCommand(ctx);

      const session = PostBuilderManager.getSession(chatId, adminId);
      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.contentType, 'photo');
      assert.strictEqual(session?.mediaFileId, 'replied_photo_id');
      assert.strictEqual(session?.text, 'Replied Photo Caption');
      assert.strictEqual(session?.buttons.length, 2);
    });

    // -------------------------------------------------------------------------
    // 27. Edit caption flow for media post
    // -------------------------------------------------------------------------
    await test('27. Edit caption flow modifies media post caption', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:edittext', adminId));
      assert.strictEqual(session?.state, 'WAITING_FOR_CAPTION');

      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: 'Updated New Caption!'
      });

      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.text, 'Updated New Caption!');
    });

    // -------------------------------------------------------------------------
    // 28. Skip caption flow for media post
    // -------------------------------------------------------------------------
    await test('28. /skip removes caption from media post', async () => {
      const session = PostBuilderManager.getSession(chatId, adminId);
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:edittext', adminId));
      await PostBuilderManager.handleIncomingMessage({
        message_id: nextMessageId++,
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        date: Math.floor(Date.now() / 1000),
        text: '/skip'
      });

      assert.strictEqual(session?.state, 'PREVIEW');
      assert.strictEqual(session?.text, undefined);
    });

    // -------------------------------------------------------------------------
    // 29. Photo PostPayload verification
    // -------------------------------------------------------------------------
    await test('29. Photo PostPayload delivers correctly via PostSender', async () => {
      capturedPostSenderCalls.length = 0;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:send', adminId));

      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.contentType, 'photo');
      assert.strictEqual(capturedPostSenderCalls[0].payload.mediaFileId, 'replied_photo_id');
      assert.strictEqual(capturedPostSenderCalls[0].payload.text, '');
      assert.strictEqual(capturedPostSenderCalls[0].payload.buttons?.length, 2);
    });

    // -------------------------------------------------------------------------
    // 30. Video PostPayload verification
    // -------------------------------------------------------------------------
    await test('30. Video PostPayload delivers correctly via PostSender', async () => {
      resetState();
      const repliedMsg: TelegramMessage = {
        message_id: 9999,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000),
        video: { file_id: 'vid_test_123', file_unique_id: 'uv', width: 640, height: 480, duration: 10 },
        caption: 'Video Caption Test'
      };
      await CommandHandler.handleCommand(createCommandContext('/post', adminId, chatId, repliedMsg));

      capturedPostSenderCalls.length = 0;
      await CommandHandler.handleCallbackQuery(createCallbackQuery('postb:preview:send', adminId));

      assert.strictEqual(capturedPostSenderCalls.length, 1);
      assert.strictEqual(capturedPostSenderCalls[0].payload.contentType, 'video');
      assert.strictEqual(capturedPostSenderCalls[0].payload.mediaFileId, 'vid_test_123');
      assert.strictEqual(capturedPostSenderCalls[0].payload.text, 'Video Caption Test');
    });

  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.editMessageText = originalEditMessageText;
    telegramApi.answerCallbackQuery = originalAnswerCallbackQuery;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
    PostSender.send = originalPostSenderSend;
  }

  console.log('\n================================================================');
  console.log(`🎉 POST BUILDER TEST SUITE RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled error in PostBuilder test suite:', err);
  process.exit(1);
});
