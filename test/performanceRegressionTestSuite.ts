import assert from 'assert';
import { TelegramMiddleware, RoleRank } from '../server/telegram/middleware.js';
import { RateLimiterService } from '../server/telegram/rateLimiter.js';
import { mtprotoParticipantService, MtprotoParticipantService } from '../server/telegram/mtprotoParticipantService.js';
import { mentionAllService, MentionAllService } from '../server/telegram/mentionAllService.js';
import { logPerformance, PerformanceTraceLog } from '../server/observability/logger.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';

export async function runPerformanceRegressionSuite() {
  console.log('🧪 Starting MissRoxie_Bot Performance & Latency Regression Test Suite...\n');

  const testChatId = -1009998889999;
  const normalUserId = 888123456;
  const adminUserId = 888654321;
  const ownerUserId = 888999999;

  // Setup storage
  db.getGroupSettings(testChatId, 'Performance Test Group');

  // PERF-01: RateLimiterService in-memory admin check (zero network delay)
  console.log('--- TEST 1: RateLimiter In-Memory Fast Path ---');
  RateLimiterService.reset();
  RateLimiterService.setConfig({
    windowMs: 5_000,
    maxMessages: 10,
    cooldownMs: 2_000
  });

  const msgNormal = {
    message_id: 1001,
    chat: { id: testChatId, type: 'supergroup', title: 'Performance Test Group' },
    from: { id: normalUserId, is_bot: false, first_name: 'RegularUser' },
    text: 'Hello world',
    date: Math.floor(Date.now() / 1000)
  } as any;

  const tStart = Date.now();
  const rateLimitResult = await RateLimiterService.checkAndRecord(msgNormal, testChatId, normalUserId);
  const tDuration = Date.now() - tStart;
  assert.strictEqual(rateLimitResult.allowed, true, 'Normal message within limits should be allowed');
  assert.ok(tDuration < 20, `Rate limit check should take <20ms (took ${tDuration}ms)`);
  console.log(`✅ [PASS] PERF-01A: RateLimiter check completed in ${tDuration}ms without network calls`);

  // PERF-01B: Admin Cache Expiry & Privileged Action Correctness
  console.log('\n--- TEST 1B: Admin Cache Expiry & Privileged Action Fresh Verification ---');
  // 1. Regular user is not cached as admin
  assert.strictEqual(TelegramMiddleware.isAdminCached(testChatId, normalUserId), false, 'Regular user must not be cached as admin');

  // 2. Expired admin cache entry (>30s) must NOT grant exemption
  const expiredAdminMap = new Map();
  expiredAdminMap.set(normalUserId, { user: { id: normalUserId }, status: 'administrator' });
  (TelegramMiddleware as any).adminListCache.set(testChatId, {
    admins: [{ user: { id: normalUserId }, status: 'administrator' }],
    map: expiredAdminMap,
    timestamp: Date.now() - 35_000 // 35 seconds ago (expired)
  });
  assert.strictEqual(TelegramMiddleware.isAdminCached(testChatId, normalUserId), false, 'Expired admin cache (>30s) must return false');

  // 3. Fresh admin cache entry (<30s) grants exemption
  (TelegramMiddleware as any).adminListCache.set(testChatId, {
    admins: [{ user: { id: normalUserId }, status: 'administrator' }],
    map: expiredAdminMap,
    timestamp: Date.now()
  });
  assert.strictEqual(TelegramMiddleware.isAdminCached(testChatId, normalUserId), true, 'Fresh admin cache (<30s) must return true');
  (TelegramMiddleware as any).adminListCache.delete(testChatId);

  // 4. Privileged action requireAdmin() strictly validates server-side and rejects normal users
  const adminCtx = {
    message: msgNormal,
    chatId: testChatId,
    chatTitle: 'Performance Test Group',
    sender: msgNormal.from,
    isAnonymousAdmin: false,
    adminDisplayName: 'RegularUser',
    args: [],
    command: 'warn'
  };
  const authRes = await TelegramMiddleware.requireAdmin(adminCtx as any, true);
  assert.strictEqual(authRes.allowed, false, 'Privileged command must reject regular users server-side');
  console.log('✅ [PASS] PERF-01B: Admin cache expiry (<30s) and privileged action server-side checks verified');

  // PERF-02: Routine message resolveActor does not force uncached getTargetMember
  console.log('\n--- TEST 2: Routine resolveActor Zero Uncached Network Calls ---');
  let networkCallsCount = 0;
  const originalGetChatMember = telegramApi.getChatMember;
  telegramApi.getChatMember = (async (chatId: number, userId: number) => {
    networkCallsCount++;
    return {
      ok: true,
      result: {
        user: { id: userId, is_bot: false, first_name: 'Member' },
        status: 'member'
      }
    };
  }) as any;

  try {
    const ctx = {
      message: msgNormal,
      chatId: testChatId,
      chatTitle: 'Performance Test Group',
      sender: msgNormal.from,
      isAnonymousAdmin: false,
      adminDisplayName: 'RegularUser',
      args: [],
      command: ''
    };

    const actor1 = await TelegramMiddleware.resolveActor(ctx);
    assert.strictEqual(actor1.actorRole, 'MEMBER', 'Normal user should resolve as MEMBER');
    const firstCallCount = networkCallsCount;

    // Second message from same user in same context
    ctx.message.message_id = 1002;
    const actor2 = await TelegramMiddleware.resolveActor(ctx);
    assert.strictEqual(actor2.actorRole, 'MEMBER');
    // Cached, so no additional calls
    assert.strictEqual(networkCallsCount, firstCallCount, 'Subsequent resolveActor must not make redundant network calls');
    console.log(`✅ [PASS] PERF-02: resolveActor successfully cached normal members (calls: ${networkCallsCount})`);
  } finally {
    telegramApi.getChatMember = originalGetChatMember;
  }

  // PERF-03: Chat Lock Active Protection Past 120s & Stale Crash Recovery
  console.log('\n--- TEST 3: MTProto Chat Lock Active Protection & Stale Crash Recovery ---');
  const dummyChatId = -1004494299999;
  mtprotoParticipantService.releaseChatLock(dummyChatId);

  // 1. Initial lock acquisition with an active operation callback
  let isOp1Active = true;
  const acquired = mtprotoParticipantService.acquireChatLock(dummyChatId, () => isOp1Active);
  assert.strictEqual(acquired, true, 'First lock acquisition should succeed');
  assert.strictEqual(mtprotoParticipantService.isChatLocked(dummyChatId), true);

  // 2. Immediate second operation acquisition is rejected
  const acquiredAgain = mtprotoParticipantService.acquireChatLock(dummyChatId);
  assert.strictEqual(acquiredAgain, false, 'Immediate second lock acquisition should be rejected');

  // 3. Simulate passage of 130s (>120s TTL) while original operation is STILL ACTIVE
  const lockEntry = (MtprotoParticipantService as any).activeChatLocks.get(dummyChatId);
  lockEntry.timestamp = Date.now() - 130_000; // 130s elapsed

  // Must NOT allow second operation to acquire lock while original is active, even after 120s
  const acquiredWhileActivePast120s = mtprotoParticipantService.acquireChatLock(dummyChatId);
  assert.strictEqual(acquiredWhileActivePast120s, false, 'Second operation CANNOT acquire lock while original operation is still active, even after 120s');
  assert.strictEqual(mtprotoParticipantService.isChatLocked(dummyChatId), true, 'Chat must remain locked while operation is active');

  // 4. Now simulate original operation crashing / ending (isOp1Active = false)
  isOp1Active = false;
  lockEntry.timestamp = Date.now() - 130_000; // 130s elapsed without heartbeat/activity (crashed)

  // Stale crashed operation is now expired and safely recoverable
  assert.strictEqual(mtprotoParticipantService.isChatLocked(dummyChatId), false, 'Stale crashed lock must expire after TTL');
  const recoveredAcquire = mtprotoParticipantService.acquireChatLock(dummyChatId);
  assert.strictEqual(recoveredAcquire, true, 'Stale crashed operation must be safely recoverable by second operation');
  mtprotoParticipantService.releaseChatLock(dummyChatId);
  console.log('✅ [PASS] PERF-03: Active operation protected past 120s AND stale crashed operation safely recovered');

  // PERF-04: MentionAllService Stale Operation Eviction
  console.log('\n--- TEST 4: MentionAllService Stale Operation Eviction ---');
  const staleChatId = -100555666777;
  (mentionAllService as any).activeOperations.set(staleChatId, {
    chatId: staleChatId,
    operationId: 'op_stale_test',
    status: 'starting',
    startedAt: Date.now() - 150_000, // 2.5 minutes ago
    abortController: new AbortController(),
    completionResolve: () => {},
    completionPromise: Promise.resolve()
  });

  const isStaleActive = mentionAllService.hasActiveOperation(staleChatId);
  assert.strictEqual(isStaleActive, false, 'Stale starting operation (>120s) must be auto-evicted');
  console.log('✅ [PASS] PERF-04: Stale starting Mention All operation auto-evicted safely');

  // PERF-05: MentionAllService PARTIAL_FETCH broadcasts to discovered members
  console.log('\n--- TEST 5: MentionAll Partial Fetch Delivery ---');
  const partialMembers = [
    { userId: 111, firstName: 'Alice', username: 'alice' },
    { userId: 222, firstName: 'Bob', username: 'bob' },
    { userId: 333, firstName: 'Charlie', username: 'charlie' }
  ];

  // Mock MTProto returning PARTIAL_FETCH with 3 members discovered out of 50
  const originalFetch = mtprotoParticipantService.fetchGroupParticipants;
  const originalIsConfigured = mtprotoParticipantService.isConfigured;
  mtprotoParticipantService.isConfigured = () => true;
  mtprotoParticipantService.fetchGroupParticipants = (async () => ({
    status: 'PARTIAL_FETCH',
    members: partialMembers as any,
    uniqueCount: 3,
    telegramTotal: 50,
    diagnosticMessage: 'Partial results returned'
  })) as any;

  try {
    const actor = { actorUserId: adminUserId, actorUsername: 'admin', actorDisplayName: 'Admin' };
    const startRes = await mentionAllService.startOperation({
      chatId: testChatId,
      chatTitle: 'Performance Test Group',
      actor,
      source: 'command',
      messageText: 'Test partial broadcast',
      awaitWorker: true
    });

    if (!startRes.ok) console.log('startRes error details:', startRes);
    assert.strictEqual(startRes.ok, true, 'startOperation should succeed with PARTIAL_FETCH when members > 0');
    assert.strictEqual(startRes.status, 'running');
    console.log('✅ [PASS] PERF-05: PARTIAL_FETCH with available members broadcasts successfully instead of aborting to zero');
  } finally {
    mtprotoParticipantService.fetchGroupParticipants = originalFetch;
    mtprotoParticipantService.isConfigured = originalIsConfigured;
  }

  // PERF-06: logPerformance writes structured JSON without leaking sensitive data
  console.log('\n--- TEST 6: Structured Performance Logging & Sanitization ---');
  let loggedOutput = '';
  const originalConsoleLog = console.log;
  console.log = (str: any) => {
    if (typeof str === 'string' && str.includes('PERFORMANCE_STAGE_DURATION')) {
      loggedOutput = str;
    }
  };

  try {
    logPerformance({
      path: 'update_command',
      stage: 'handler_execution',
      durationMs: 42,
      operationId: 'perf_test_123',
      chatId: testChatId,
      handlerName: 'handleAllCommand',
      outcome: 'success',
      details: {
        secret_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
        session_string: '1BVtsOKMBux12345...',
        message_text: 'Secret user message'
      }
    });

    assert.ok(loggedOutput.length > 0, 'logPerformance should output structured log');
    assert.ok(!loggedOutput.includes('123456:ABC-DEF'), 'Tokens must never be leaked in performance logs');
    assert.ok(!loggedOutput.includes('1BVtsOKMBux'), 'Session strings must never be leaked');
    assert.ok(!loggedOutput.includes('Secret user message'), 'Message bodies must never be leaked');
    const parsed = JSON.parse(loggedOutput);
    assert.strictEqual(parsed.event, 'PERFORMANCE_STAGE_DURATION');
    assert.strictEqual(parsed.durationMs, 42);
    assert.strictEqual(parsed.path, 'update_command');
    console.log('✅ [PASS] PERF-06: logPerformance sanitizes secrets and outputs valid structured JSON');
  } finally {
    console.log = originalConsoleLog;
  }

  console.log('\n======================================================');
  console.log('🎉 ALL 6 PERFORMANCE & LATENCY REGRESSION TESTS PASSED!');
  console.log('======================================================\n');
}

if (process.argv[1]?.endsWith('performanceRegressionTestSuite.ts') || process.argv[1]?.endsWith('performanceRegressionTestSuite.js')) {
  runPerformanceRegressionSuite().catch((err) => {
    console.error('❌ Regression suite failed:', err);
    process.exit(1);
  });
}
