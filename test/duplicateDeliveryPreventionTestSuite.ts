import { telegramApi, NON_IDEMPOTENT_TELEGRAM_METHODS } from '../server/telegram/api.js';
import { messageScheduler, MessageScheduler } from '../server/telegram/scheduler.js';
import { db } from '../server/db/storage.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${msg}`);
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('RUNNING DUPLICATE DELIVERY PREVENTION TEST SUITE');
  console.log('====================================================\n');

  process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_testtoken';
  process.env.ENABLE_SCHEDULER = 'true';

  // -------------------------------------------------------------
  // TEST 1: TelegramApi Non-Idempotent Network Failure Protection
  // -------------------------------------------------------------
  console.log('--- TEST 1: TelegramApi Non-Idempotent Network Failure (No Auto-Retry) ---');
  
  const originalFetch = global.fetch;
  try {
    for (const sendMethod of ['sendMessage', 'sendPhoto', 'sendVideo', 'sendDocument', 'sendAnimation', 'sendSticker']) {
      assert(NON_IDEMPOTENT_TELEGRAM_METHODS.has(sendMethod), `${sendMethod} is registered as non-idempotent`);

      let fetchCallCount = 0;
      global.fetch = async () => {
        fetchCallCount++;
        const netErr: any = new Error('fetch failed');
        netErr.code = 'ECONNRESET';
        throw netErr;
      };

      let callResult: any;
      if (sendMethod === 'sendMessage') {
        callResult = await telegramApi.sendMessage(-100999888777, 'Test message');
      } else if (sendMethod === 'sendPhoto') {
        callResult = await telegramApi.sendPhoto(-100999888777, 'file_photo_123');
      } else if (sendMethod === 'sendVideo') {
        callResult = await telegramApi.sendVideo(-100999888777, 'file_vid_123');
      } else if (sendMethod === 'sendDocument') {
        callResult = await telegramApi.sendDocument(-100999888777, 'file_doc_123');
      } else if (sendMethod === 'sendAnimation') {
        callResult = await telegramApi.sendAnimation(-100999888777, 'file_gif_123');
      } else if (sendMethod === 'sendSticker') {
        callResult = await telegramApi.sendSticker(-100999888777, 'file_stk_123');
      }

      assert(fetchCallCount === 1, `${sendMethod} called fetch exactly 1 time on ECONNRESET (did NOT retry)`);
      assert(callResult.ok === false, `${sendMethod} returned ok=false on network error`);
    }
  } finally {
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // TEST 2: TelegramApi HTTP 429 Retry Behavior Remains Functional
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: TelegramApi HTTP 429 Rate Limit Retry ---');
  try {
    let rateLimitCalls = 0;
    global.fetch = async () => {
      rateLimitCalls++;
      if (rateLimitCalls === 1) {
        return {
          status: 429,
          headers: new Headers({ 'retry-after': '1' }),
          json: async () => ({
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
            parameters: { retry_after: 1 }
          })
        } as any;
      }
      return {
        status: 200,
        headers: new Headers(),
        json: async () => ({
          ok: true,
          result: { message_id: 9999 }
        })
      } as any;
    };

    const res429 = await telegramApi.sendMessage(-100999888777, 'Retry on 429 test');
    assert(rateLimitCalls === 2, 'sendMessage retried on HTTP 429 with retry_after');
    assert(res429.ok === true && res429.result?.message_id === 9999, 'sendMessage succeeded on second attempt after 429');
  } finally {
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // TEST 3: Scheduler Cross-Worker Atomic Claim
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Scheduler Cross-Worker Atomic Claim ---');
  const testChatId = -100999888777;
  const created = messageScheduler.createSchedule(
    testChatId,
    'Atomic Claim Test Chat',
    12345,
    'admin_tester',
    '1m',
    'Atomic test payload'
  );
  assert(created.success && Boolean(created.schedule), 'Created test schedule for claim simulation');
  const schedId = created.schedule!.id;

  // Set nextRun to now (due)
  const dueTime = new Date(Date.now() - 5000).toISOString();
  db.updateSchedule(schedId, { nextRun: dueTime });

  let workerASends = 0;
  let workerBSends = 0;

  // Worker A attempts claim
  const nextIntervalA = new Date(Date.now() + 60000).toISOString();
  const claimA = await db.claimScheduleExecution(schedId, dueTime, nextIntervalA, 'worker_A');
  assert(claimA === true, 'Worker A atomic claim succeeded');
  if (claimA) {
    workerASends++;
  }

  // Worker B attempts claim on the same schedule
  const nextIntervalB = new Date(Date.now() + 60000).toISOString();
  const claimB = await db.claimScheduleExecution(schedId, dueTime, nextIntervalB, 'worker_B');
  assert(claimB === false, 'Worker B atomic claim failed (already claimed by Worker A)');
  if (claimB) {
    workerBSends++;
  }

  assert(workerASends === 1 && workerBSends === 0, 'Schedule was sent exactly ONCE across both workers');

  // -------------------------------------------------------------
  // TEST 4: Scheduler Catch Block Post-Delivery Exception Safety
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Scheduler Catch Block Post-Delivery Safety ---');
  const postDeliveryChatId = -100999888778;
  const schedPost = messageScheduler.createSchedule(
    postDeliveryChatId,
    'Post Delivery Test Chat',
    12345,
    'admin_tester',
    '5m',
    'Post delivery payload'
  );
  assert(schedPost.success && Boolean(schedPost.schedule), 'Created schedule for post-delivery exception test');
  const postSchedId = schedPost.schedule!.id;

  // Make schedule due
  const overdueTime = new Date(Date.now() - 10000).toISOString();
  db.updateSchedule(postSchedId, { nextRun: overdueTime });

  let postSendCalls = 0;
  global.fetch = async (url: any, opts: any) => {
    const bodyStr = opts?.body ? String(opts.body) : '';
    const isTargetChat = bodyStr.includes(String(postDeliveryChatId));
    if (isTargetChat) {
      postSendCalls++;
    }
    return {
      status: 200,
      headers: new Headers(),
      json: async () => ({
        ok: true,
        result: { message_id: 88888 }
      })
    } as any;
  };

  // Mock db.addLog to throw a simulated error AFTER successful send
  const originalAddLog = db.addLog.bind(db);
  (db as any).addLog = (logObj: any) => {
    if (logObj?.chatId === postDeliveryChatId) {
      throw new Error('Simulated database write error during audit logging');
    }
    return originalAddLog(logObj);
  };

  try {
    await messageScheduler.checkAndExecuteSchedules();
    assert(postSendCalls === 1, 'Target scheduled message was sent to Telegram before post-delivery error');

    // Inspect schedule state after catch block
    const postState = db.getScheduleById(postSchedId);
    assert(Boolean(postState?.nextRun), 'nextRun is set');
    const postNextRunMs = new Date(postState!.nextRun).getTime();
    assert(postNextRunMs > Date.now(), 'nextRun remains in the FUTURE (not reverted to overdue timestamp)');

    // Run second scheduler tick
    await messageScheduler.checkAndExecuteSchedules();
    assert(postSendCalls === 1, 'Second scheduler tick did NOT re-send the message (postSendCalls remains 1)');
  } finally {
    db.addLog = originalAddLog;
    global.fetch = originalFetch;
  }

  // -------------------------------------------------------------
  // TEST 5: Single-Consumer Polling Lease Guard
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Single-Consumer Polling Lease Guard ---');
  const lease1 = await TelegramBotManager.acquireOrRenewPollingLease('instance_1', 30000);
  assert(lease1 === true, 'Instance 1 acquired polling lease (or local fallback succeeded)');

  // Clean up test schedules
  db.deleteSchedule(testChatId, schedId);
  db.deleteSchedule(postDeliveryChatId, postSchedId);

  console.log('\n====================================================');
  console.log(`ALL ${passedTests}/${totalTests} TESTS PASSED PERFECTLY!`);
  console.log('====================================================');
}

runTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
