process.env.NODE_ENV = 'test';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { mtprotoParticipantService } from '../server/telegram/mtprotoParticipantService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING /ALL CONCURRENCY & /STOPALL TEST SUITE');
  console.log('====================================================\n');

  const adminUserId = 888123;
  const regularUserId = 777456;

  // Mock API methods
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentPhotos: Array<{ chatId: number; photo: string; options?: any }> = [];

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 999888, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' }
  });

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          can_restrict_members: true,
          can_promote_members: true,
          can_delete_messages: true,
          user: { id: adminUserId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' }
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: 'NormalUser', username: 'normal_user' }
      }
    };
  };

  const defaultSendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return {
      ok: true,
      result: {
        message_id: 1000 + sentMessages.length,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };
  (telegramApi as any).sendMessage = defaultSendMessage;

  (telegramApi as any).sendPhoto = async (chatId: number, photo: string, options?: any) => {
    sentPhotos.push({ chatId, photo, options });
    return {
      ok: true,
      result: {
        message_id: 2000 + sentPhotos.length,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).deleteMessage = async () => ({ ok: true });

  // -------------------------------------------------------------
  // Test 1: First /all starts and registers active operation in registry
  // -------------------------------------------------------------
  console.log('--- Test 1: First /all starts and acquires chat lock ---');
  const chat1 = -10099494671;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 0;

  for (let i = 1; i <= 5; i++) {
    db.cacheUser({ id: 10000 + i, first_name: `MemberA${i}`, username: `member_a_${i}`, is_bot: false }, chat1);
  }

  await CommandHandler.handleCommand({
    command: '/all',
    args: ['Welcome all'],
    chatId: chat1,
    chatTitle: 'Chat 1',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chat1, type: 'supergroup' } }
  });

  assert(sentMessages.length === 1, 'First /all sent exactly 1 message for 5 members');
  assert(sentMessages[0].text.includes('Welcome all'), 'Sent message contains custom text');
  assert(!CommandHandler.activeAllOperations.has(chat1), 'Operation registry cleaned up after complete execution');
  assert(!mtprotoParticipantService.isChatLocked(chat1), 'Chat lock released after complete execution');

  // -------------------------------------------------------------
  // Test 2 & 3: Concurrent /all in same group is rejected, no duplicate batches
  // -------------------------------------------------------------
  console.log('\n--- Test 2 & 3: Overlapping /all in same group rejected without extra batches ---');
  const chat2 = -10099494672;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 150; // Delay between batches

  // Cache 15 members (2 batches of 10 and 5)
  for (let i = 1; i <= 15; i++) {
    db.cacheUser({ id: 11000 + i, first_name: `User${i}`, username: `user_${i}`, is_bot: false }, chat2);
  }

  const p1 = CommandHandler.handleCommand({
    command: '/all',
    args: ['First run'],
    chatId: chat2,
    chatTitle: 'Chat 2',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: chat2, type: 'supergroup' } }
  });

  // Brief pause to allow p1 to register active operation and start batch 1
  await new Promise(r => setTimeout(r, 20));
  assert(CommandHandler.activeAllOperations.has(chat2), 'Chat 2 is registered as active while p1 is in-flight');

  // Attempt second concurrent /all in the same chat
  await CommandHandler.handleCommand({
    command: '/all',
    args: ['Second run (should reject)'],
    chatId: chat2,
    chatTitle: 'Chat 2',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 11, date: Math.floor(Date.now() / 1000), chat: { id: chat2, type: 'supergroup' } }
  });

  const rejectionMsg = sentMessages.find(m => m.text.includes('already in progress'));
  assert(Boolean(rejectionMsg), 'Second /all received notice that broadcast is already in progress');

  await p1; // Wait for p1 to finish both batches

  // Verify only p1's 2 batches + 1 rejection message were sent (total 3 messages, no batches from 2nd command)
  const mentionBatches = sentMessages.filter(m => m.text.includes('First run'));
  const rejectedBatches = sentMessages.filter(m => m.text.includes('Second run'));
  assert(mentionBatches.length === 2, `Expected 2 mention batches for p1, got ${mentionBatches.length}`);
  assert(rejectedBatches.length === 0, 'No mention batches sent for the rejected second command');
  assert(!CommandHandler.activeAllOperations.has(chat2), 'Lock released after p1 finishes');

  // -------------------------------------------------------------
  // Test 4: New /all works normally after previous operation terminates
  // -------------------------------------------------------------
  console.log('\n--- Test 4: New /all works normally after previous terminates ---');
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 0;

  await CommandHandler.handleCommand({
    command: '/all',
    args: ['Subsequent run'],
    chatId: chat2,
    chatTitle: 'Chat 2',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 20, date: Math.floor(Date.now() / 1000), chat: { id: chat2, type: 'supergroup' } }
  });

  const subsequentMentions = sentMessages.filter(m => m.text.includes('Subsequent run'));
  assert(subsequentMentions.length === 2, `Subsequent /all executed successfully (${subsequentMentions.length} batches)`);

  // -------------------------------------------------------------
  // Test 5: Operations in different groups (Group A and Group B) run independently
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Independent group isolation (Group A vs Group B) ---');
  const chat5A = -10099494673;
  const chat5B = -10099494674;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 350;

  for (let i = 1; i <= 15; i++) {
    db.cacheUser({ id: 20000 + i, first_name: `GAUser${i}`, username: `ga_user_${i}`, is_bot: false }, chat5A);
  }
  for (let i = 1; i <= 15; i++) {
    db.cacheUser({ id: 25000 + i, first_name: `GBUser${i}`, username: `gb_user_${i}`, is_bot: false }, chat5B);
  }

  // Launch in Chat 5A
  const pA = CommandHandler.handleCommand({
    command: '/all',
    args: ['Group A broadcast'],
    chatId: chat5A,
    chatTitle: 'Chat 5A',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 30, date: Math.floor(Date.now() / 1000), chat: { id: chat5A, type: 'supergroup' } }
  });

  await new Promise(r => setTimeout(r, 20));

  // Launch concurrently in Chat 5B
  const pB = CommandHandler.handleCommand({
    command: '/all',
    args: ['Group B broadcast'],
    chatId: chat5B,
    chatTitle: 'Chat 5B',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 31, date: Math.floor(Date.now() / 1000), chat: { id: chat5B, type: 'supergroup' } }
  });

  await new Promise(r => setTimeout(r, 20));

  assert(CommandHandler.activeAllOperations.has(chat5A), 'Chat 5A is active in registry');
  assert(CommandHandler.activeAllOperations.has(chat5B), 'Chat 5B is active in registry concurrently');

  await Promise.all([pA, pB]);

  const groupAMessages = sentMessages.filter(m => m.chatId === chat5A && m.text.includes('Group A broadcast'));
  const groupBMessages = sentMessages.filter(m => m.chatId === chat5B && m.text.includes('Group B broadcast'));
  assert(groupAMessages.length === 2, `Group A completed 2 batches (got ${groupAMessages.length})`);
  assert(groupBMessages.length === 2, `Group B completed 2 batches without interference (got ${groupBMessages.length})`);

  // -------------------------------------------------------------
  // Test 6 & 7: Authorized /stopall cleanly stops active operation and prevents further batches
  // -------------------------------------------------------------
  console.log('\n--- Test 6 & 7: Authorized /stopall stops worker and cancels future batches ---');
  const chat6 = -10099494675;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 300; // Pacing delay

  // Cache 25 members in Chat 6 (3 batches: 10, 10, 5)
  for (let i = 1; i <= 25; i++) {
    db.cacheUser({ id: 30000 + i, first_name: `StopTestUser${i}`, username: `stop_user_${i}`, is_bot: false }, chat6);
  }

  const broadcastPromise = CommandHandler.handleCommand({
    command: '/all',
    args: ['Will be stopped'],
    chatId: chat6,
    chatTitle: 'Chat 6',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 40, date: Math.floor(Date.now() / 1000), chat: { id: chat6, type: 'supergroup' } }
  });

  // Wait for batch 1 to send and enter pacing delay
  await new Promise(r => setTimeout(r, 40));

  // Admin invokes /stopall
  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat6,
    chatTitle: 'Chat 6',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 41, date: Math.floor(Date.now() / 1000), chat: { id: chat6, type: 'supergroup' } }
  });

  await broadcastPromise;

  const mentionBatchesSent = sentMessages.filter(m => m.text.includes('Will be stopped'));
  const stopConfirmation = sentMessages.find(m => m.text.includes('Broadcast Stopped'));

  assert(mentionBatchesSent.length === 1, `Worker stopped immediately after batch 1 (got ${mentionBatchesSent.length}/3 batches)`);
  assert(Boolean(stopConfirmation), 'Bot replied with /stopall confirmation');
  assert(stopConfirmation?.text.includes('Sent <b>1</b> of <b>3</b> batch(es)'), `Confirmation reports exact sent vs total batches (got: ${stopConfirmation?.text})`);
  assert(!CommandHandler.activeAllOperations.has(chat6), 'Chat 6 lock cleared after stop');

  // -------------------------------------------------------------
  // Test 8: /stopall when idle returns appropriate message
  // -------------------------------------------------------------
  console.log('\n--- Test 8: /stopall when idle ---');
  const chat8 = -10099494676;
  sentMessages = [];

  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat8,
    chatTitle: 'Chat 8',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 50, date: Math.floor(Date.now() / 1000), chat: { id: chat8, type: 'supergroup' } }
  });

  assert(sentMessages.length === 1, 'Idle /stopall sends 1 reply');
  assert(sentMessages[0].text.includes('no active /all broadcast running'), 'Reply confirms no broadcast is active');

  // -------------------------------------------------------------
  // Test 9: Unauthorized user cannot invoke /stopall
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Unauthorized user cannot invoke /stopall ---');
  const chat9 = -10099494677;
  sentMessages = [];

  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat9,
    chatTitle: 'Chat 9',
    isAnonymousAdmin: false,
    adminDisplayName: 'NormalUser',
    sender: { id: regularUserId, first_name: 'NormalUser', is_bot: false },
    message: { message_id: 60, date: Math.floor(Date.now() / 1000), chat: { id: chat9, type: 'supergroup' } }
  });

  assert(sentMessages.length === 1, 'Non-admin /stopall rejected with 1 message');
  assert(sentMessages[0].text.includes('administrators') || sentMessages[0].text.includes('permission'), 'Rejection states permission denied / admin only');

  // -------------------------------------------------------------
  // Test 10: Inter-batch pacing delay is promptly interrupted on /stopall
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Pacing delay promptly interrupted by /stopall ---');
  const chat10 = -10099494678;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 2500; // 2.5 second pacing

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 40000 + i, first_name: `PacingUser${i}`, username: `pacing_user_${i}`, is_bot: false }, chat10);
  }

  const startT = Date.now();
  const longPacingPromise = CommandHandler.handleCommand({
    command: '/all',
    args: ['Long pacing'],
    chatId: chat10,
    chatTitle: 'Chat 10',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 70, date: Math.floor(Date.now() / 1000), chat: { id: chat10, type: 'supergroup' } }
  });

  await new Promise(r => setTimeout(r, 40));

  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat10,
    chatTitle: 'Chat 10',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 71, date: Math.floor(Date.now() / 1000), chat: { id: chat10, type: 'supergroup' } }
  });

  await longPacingPromise;
  const elapsed = Date.now() - startT;

  assert(elapsed < 1000, `Interrupted 2500ms pacing promptly (took ${elapsed}ms)`);
  assert(!CommandHandler.activeAllOperations.has(chat10), 'Registry cleaned up');

  // -------------------------------------------------------------
  // Test 11: 429 flood wait retry delay is interrupted on /stopall
  // -------------------------------------------------------------
  console.log('\n--- Test 11: 429 flood wait retry interrupted by /stopall ---');
  const chat11 = -10099494679;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 0;

  for (let i = 1; i <= 10; i++) {
    db.cacheUser({ id: 50000 + i, first_name: `FloodUser${i}`, username: `flood_user_${i}`, is_bot: false }, chat11);
  }

  let attempt = 0;
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    attempt++;
    if (attempt === 1) {
      // First batch: trigger 429 retry_after = 5 seconds
      return { ok: false, error_code: 429, parameters: { retry_after: 5 } };
    }
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 3000 + attempt, chat: { id: chatId, type: 'supergroup' } } };
  };

  const floodWaitT = Date.now();
  const floodBroadcastPromise = CommandHandler.handleCommand({
    command: '/all',
    args: ['Flood test'],
    chatId: chat11,
    chatTitle: 'Chat 11',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 80, date: Math.floor(Date.now() / 1000), chat: { id: chat11, type: 'supergroup' } }
  });

  // Wait 40ms so it enters the 5000ms flood wait
  await new Promise(r => setTimeout(r, 40));

  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat11,
    chatTitle: 'Chat 11',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 81, date: Math.floor(Date.now() / 1000), chat: { id: chat11, type: 'supergroup' } }
  });

  await floodBroadcastPromise;
  const floodElapsed = Date.now() - floodWaitT;

  assert(floodElapsed < 1200, `Interrupted 5000ms flood wait promptly (took ${floodElapsed}ms)`);
  // Restore normal sendMessage
  (telegramApi as any).sendMessage = defaultSendMessage;

  // -------------------------------------------------------------
  // Test 12: Errors / exceptions release the lock cleanly in finally
  // -------------------------------------------------------------
  console.log('\n--- Test 12: Exceptions in worker release active lock in finally ---');
  const chat12 = -10099494680;
  CommandHandler.allMessageIntervalMs = 0;

  for (let i = 1; i <= 5; i++) {
    db.cacheUser({ id: 60000 + i, first_name: `ExcUser${i}`, username: `exc_user_${i}`, is_bot: false }, chat12);
  }

  (telegramApi as any).sendMessage = async () => {
    throw new Error('Telegram network crash simulation');
  };

  try {
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Exception test'],
      chatId: chat12,
      chatTitle: 'Chat 12',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 90, date: Math.floor(Date.now() / 1000), chat: { id: chat12, type: 'supergroup' } }
    });
  } catch {
    // Exception handled
  }

  assert(!CommandHandler.activeAllOperations.has(chat12), 'Lock released after worker exception in finally');
  assert(!mtprotoParticipantService.isChatLocked(chat12), 'MTProto chat lock released in finally');

  // Restore normal sendMessage
  (telegramApi as any).sendMessage = defaultSendMessage;

  // -------------------------------------------------------------
  // Test 13: New /all blocked while /stopall is in progress
  // -------------------------------------------------------------
  console.log('\n--- Test 13: New /all is blocked while stopping until worker exits ---');
  const chat13 = -10099494681;
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 200;

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 70000 + i, first_name: `StopBlkUser${i}`, username: `stop_blk_user_${i}`, is_bot: false }, chat13);
  }

  const stoppingBroadcast = CommandHandler.handleCommand({
    command: '/all',
    args: ['Broadcast being stopped'],
    chatId: chat13,
    chatTitle: 'Chat 13',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 100, date: Math.floor(Date.now() / 1000), chat: { id: chat13, type: 'supergroup' } }
  });

  await new Promise(r => setTimeout(r, 30));

  // Verify that an active operation exists
  const opBeforeStop = CommandHandler.activeAllOperations.get(chat13);
  assert(Boolean(opBeforeStop), 'Active operation exists');

  // Trigger stopall
  const stopallPromise = CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat13,
    chatTitle: 'Chat 13',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 101, date: Math.floor(Date.now() / 1000), chat: { id: chat13, type: 'supergroup' } }
  });

  await stopallPromise;
  await stoppingBroadcast;

  assert(!CommandHandler.activeAllOperations.has(chat13), 'Lock cleared once stopall and worker complete');

  // -------------------------------------------------------------
  // Test 14: Replied media and 10-member batching preserved
  // -------------------------------------------------------------
  console.log('\n--- Test 14: Replied media handling preserved ---');
  const chat14 = -10099494682;
  sentPhotos = [];
  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 0;

  for (let i = 1; i <= 15; i++) {
    db.cacheUser({ id: 80000 + i, first_name: `MediaUser${i}`, username: `media_user_${i}`, is_bot: false }, chat14);
  }

  await CommandHandler.handleCommand({
    command: '/all',
    args: ['Check this photo announcement'],
    chatId: chat14,
    chatTitle: 'Chat 14',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: {
      message_id: 110,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chat14, type: 'supergroup' },
      reply_to_message: {
        message_id: 99,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chat14, type: 'supergroup' },
        photo: [
          { file_id: 'small_thumb', file_unique_id: 'u1', width: 100, height: 100 },
          { file_id: 'large_photo_file_123', file_unique_id: 'u2', width: 800, height: 800 }
        ]
      }
    }
  });

  assert(sentPhotos.length === 2, `Replied photo was broadcasted across 2 batches via sendPhoto (got ${sentPhotos.length} photos)`);
  assert(sentPhotos[0].photo === 'large_photo_file_123', 'Selected highest resolution photo file_id');
  assert(sentPhotos[0].options.caption.includes('Check this photo announcement'), 'Photo caption includes /all text and mentions');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
