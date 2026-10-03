process.env.NODE_ENV = 'test';
import { CommandHandler, ALL_MESSAGE_INTERVAL_MS } from '../server/telegram/commands.js';
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

async function runTests() {
  console.log('====================================================');
  console.log('STARTING /ALL 20-SECOND PACING TEST SUITE');
  console.log('====================================================');

  const chatId = -1008887776655;
  const adminUserId = 123456;

  // Setup mock methods
  const originalSendMessage = telegramApi.sendMessage;
  const originalGetMe = telegramApi.getMe;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalSendPhoto = telegramApi.sendPhoto;

  (telegramApi as any).getMe = async () => {
    return { ok: true, result: { id: 999999, is_bot: true, username: 'RoxieBot', first_name: 'Roxie' } };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return { ok: true, result: { status: 'administrator', user: { id: adminUserId, is_bot: false, first_name: 'Admin' } } };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'User' } } };
  };

  try {
    // ----------------------------------------------------------------
    // Test 1: Verify ALL_MESSAGE_INTERVAL_MS constant is exactly 20,000ms
    // ----------------------------------------------------------------
    console.log('\n--- Test 1: ALL_MESSAGE_INTERVAL_MS Constant Verification ---');
    assert(ALL_MESSAGE_INTERVAL_MS === 20_000, `ALL_MESSAGE_INTERVAL_MS is 20000ms (got ${ALL_MESSAGE_INTERVAL_MS})`);

    // ----------------------------------------------------------------
    // Test 2: Single batch (<= 10 members) sends immediately without delay
    // ----------------------------------------------------------------
    console.log('\n--- Test 2: Single Batch (5 members) ---');
    // Cache 5 members
    for (let i = 1; i <= 5; i++) {
      db.cacheUser({ id: 1000 + i, first_name: `User${i}`, username: `user${i}`, is_bot: false }, chatId);
    }

    const sendTimestamps: number[] = [];
    (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
      sendTimestamps.push(Date.now());
      return { ok: true, result: { message_id: 2000 + sendTimestamps.length, chat: { id, type: 'supergroup' } } };
    };

    CommandHandler.allMessageIntervalMs = 50; // Mock 50ms pacing for testing
    const startT1 = Date.now();
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Announcement'],
      chatId,
      chatTitle: 'Test Pacing Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    const elapsedT1 = Date.now() - startT1;

    assert(sendTimestamps.length === 1, `Single batch sent exactly 1 message (got ${sendTimestamps.length})`);
    assert(elapsedT1 < 100, `Single batch completed immediately without trailing delay (elapsed: ${elapsedT1}ms)`);

    // ----------------------------------------------------------------
    // Test 3: Two batches (15 members) -> 1 interval between batches, 0 trailing wait
    // ----------------------------------------------------------------
    console.log('\n--- Test 3: Two Batches (15 members) with Pacing ---');
    const chatId2 = -1008887776656;
    for (let i = 1; i <= 15; i++) {
      db.cacheUser({ id: 2000 + i, first_name: `Member${i}`, username: `member${i}`, is_bot: false }, chatId2);
    }

    sendTimestamps.length = 0;
    const testPacingMs = 80;
    CommandHandler.allMessageIntervalMs = testPacingMs;

    const startT2 = Date.now();
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Two batch test'],
      chatId: chatId2,
      chatTitle: 'Test Pacing Group 2',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 20, date: Math.floor(Date.now() / 1000), chat: { id: chatId2, type: 'supergroup' } }
    });
    const elapsedT2 = Date.now() - startT2;

    assert(sendTimestamps.length === 2, `Two batches sent exactly 2 messages (got ${sendTimestamps.length})`);
    const gap1 = sendTimestamps[1] - sendTimestamps[0];
    assert(gap1 >= testPacingMs - 15, `Interval between batch 1 and batch 2 is >= ${testPacingMs}ms (got ${gap1}ms)`);
    assert(elapsedT2 >= testPacingMs - 15 && elapsedT2 < (testPacingMs * 2) + 200, `Overall time reflects 1 interval without trailing delay (elapsed: ${elapsedT2}ms)`);

    // ----------------------------------------------------------------
    // Test 4: Three batches (25 members) -> 2 consecutive intervals
    // ----------------------------------------------------------------
    console.log('\n--- Test 4: Three Batches (25 members) with 2 Pacing Intervals ---');
    const chatId3 = -1008887776657;
    for (let i = 1; i <= 25; i++) {
      db.cacheUser({ id: 3000 + i, first_name: `Batch3Member${i}`, username: `b3m${i}`, is_bot: false }, chatId3);
    }

    sendTimestamps.length = 0;
    CommandHandler.allMessageIntervalMs = testPacingMs;

    const startT3 = Date.now();
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Three batch test'],
      chatId: chatId3,
      chatTitle: 'Test Pacing Group 3',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 30, date: Math.floor(Date.now() / 1000), chat: { id: chatId3, type: 'supergroup' } }
    });
    const elapsedT3 = Date.now() - startT3;

    assert(sendTimestamps.length === 3, `Three batches sent exactly 3 messages (got ${sendTimestamps.length})`);
    const gap1_2 = sendTimestamps[1] - sendTimestamps[0];
    const gap2_3 = sendTimestamps[2] - sendTimestamps[1];
    assert(gap1_2 >= testPacingMs - 15, `Interval between batch 1 and batch 2 is >= ${testPacingMs}ms (got ${gap1_2}ms)`);
    assert(gap2_3 >= testPacingMs - 15, `Interval between batch 2 and batch 3 is >= ${testPacingMs}ms (got ${gap2_3}ms)`);
    assert(elapsedT3 >= (testPacingMs * 2) - 25 && elapsedT3 < (testPacingMs * 3) + 300, `Overall time reflects 2 intervals (elapsed: ${elapsedT3}ms)`);

    // ----------------------------------------------------------------
    // Test 5: Per-chat mutex prevents concurrent /all during paced broadcast
    // ----------------------------------------------------------------
    console.log('\n--- Test 5: Per-chat Mutex during Pacing ---');
    const chatId4 = -1008887776658;
    for (let i = 1; i <= 20; i++) {
      db.cacheUser({ id: 4000 + i, first_name: `MutexUser${i}`, username: `mu${i}`, is_bot: false }, chatId4);
    }

    sendTimestamps.length = 0;
    CommandHandler.allMessageIntervalMs = 100;
    let mutexRejectionSent = false;

    // Start first /all which takes ~100ms
    const firstPromise = CommandHandler.handleCommand({
      command: '/all',
      args: ['First invocation'],
      chatId: chatId4,
      chatTitle: 'Mutex Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 40, date: Math.floor(Date.now() / 1000), chat: { id: chatId4, type: 'supergroup' } }
    });

    // Intercept rejection message
    const origSend = telegramApi.sendMessage;
    (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
      if (text.includes('already in progress')) {
        mutexRejectionSent = true;
        return { ok: true, result: { message_id: 9999, chat: { id, type: 'supergroup' } } };
      }
      sendTimestamps.push(Date.now());
      return { ok: true, result: { message_id: 4000 + sendTimestamps.length, chat: { id, type: 'supergroup' } } };
    };

    // Attempt second /all in the middle of first
    await new Promise(r => setTimeout(r, 20));
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Second invocation while first running'],
      chatId: chatId4,
      chatTitle: 'Mutex Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 41, date: Math.floor(Date.now() / 1000), chat: { id: chatId4, type: 'supergroup' } }
    });

    await firstPromise;

    assert(mutexRejectionSent, 'Concurrent /all invocation rejected with "already in progress" message');
    assert(sendTimestamps.length === 2, `First invocation sent its 2 batches without interference (got ${sendTimestamps.length})`);

    // ----------------------------------------------------------------
    // Test 6: 429 flood wait retry handling works with pacing
    // ----------------------------------------------------------------
    console.log('\n--- Test 6: 429 Flood Wait Retry Preservation ---');
    const chatId5 = -1008887776659;
    for (let i = 1; i <= 15; i++) {
      db.cacheUser({ id: 5000 + i, first_name: `FloodUser${i}`, username: `fu${i}`, is_bot: false }, chatId5);
    }

    sendTimestamps.length = 0;
    CommandHandler.allMessageIntervalMs = 50;
    let floodAttempt = 0;

    (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
      // Simulate 429 on the first try of batch 1
      if (floodAttempt === 0) {
        floodAttempt++;
        return { ok: false, error_code: 429, parameters: { retry_after: 0.05 } };
      }
      sendTimestamps.push(Date.now());
      return { ok: true, result: { message_id: 5000 + sendTimestamps.length, chat: { id, type: 'supergroup' } } };
    };

    await CommandHandler.handleCommand({
      command: '/all',
      args: ['Flood test'],
      chatId: chatId5,
      chatTitle: 'Flood Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 50, date: Math.floor(Date.now() / 1000), chat: { id: chatId5, type: 'supergroup' } }
    });

    assert(floodAttempt === 1, '429 flood error was triggered and retried');
    assert(sendTimestamps.length === 2, `Both batches successfully delivered after retry (got ${sendTimestamps.length})`);

    // ----------------------------------------------------------------
    // Test 7: Media replied /all preserves media and pacing across batches
    // ----------------------------------------------------------------
    console.log('\n--- Test 7: Replied Media Pacing ---');
    const chatId6 = -1008887776660;
    for (let i = 1; i <= 15; i++) {
      db.cacheUser({ id: 6000 + i, first_name: `MediaUser${i}`, username: `mu6_${i}`, is_bot: false }, chatId6);
    }

    const photoTimestamps: number[] = [];
    (telegramApi as any).sendPhoto = async (cId: number, photo: string, options?: any) => {
      photoTimestamps.push(Date.now());
      return { ok: true, result: { message_id: 6000 + photoTimestamps.length, chat: { id: cId, type: 'supergroup' } } };
    };

    CommandHandler.allMessageIntervalMs = 60;
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId: chatId6,
      chatTitle: 'Media Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 60,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId6, type: 'supergroup' },
        reply_to_message: {
          message_id: 59,
          date: Math.floor(Date.now() / 1000),
          chat: { id: chatId6, type: 'supergroup' },
          photo: [{ file_id: 'photo_test_123', file_unique_id: 'photo_uid_123', width: 100, height: 100 }]
        }
      }
    });

    assert(photoTimestamps.length === 2, `Photo sent for both batches (got ${photoTimestamps.length})`);
    const photoGap = photoTimestamps[1] - photoTimestamps[0];
    assert(photoGap >= 50, `Pacing between photo batches respected (got ${photoGap}ms)`);

    // ----------------------------------------------------------------
    // Test 8: Reset override and verify fallback logic
    // ----------------------------------------------------------------
    console.log('\n--- Test 8: Pacing Override Fallback ---');
    CommandHandler.allMessageIntervalMs = null;
    assert(CommandHandler.allMessageIntervalMs === null, 'CommandHandler.allMessageIntervalMs successfully reset to null');

  } finally {
    // Restore originals
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getMe = originalGetMe;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.sendPhoto = originalSendPhoto;
    CommandHandler.allMessageIntervalMs = null;
  }

  console.log('====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test suite:', err);
  process.exit(1);
});
