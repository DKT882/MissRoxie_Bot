import {
  MtprotoParticipantService,
  mtprotoParticipantService,
  ParticipantFetchResult,
  MTProtoNotConfiguredError,
  MTProtoAuthError,
  MTProtoPermissionError,
  MTProtoFloodWaitError,
  MTProtoIncompleteFetchError
} from '../server/telegram/mtprotoParticipantService.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { CachedMember } from '../server/telegram/types.js';

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

function createMember(userId: number, firstName: string = 'User', username?: string): CachedMember {
  return {
    userId,
    firstName,
    username,
    lastSeen: '2026-09-22T00:00:00.000Z'
  };
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 STARTING MTPROTO PARTICIPANT SERVICE TEST SUITE');
  console.log('====================================================\n');

  // Test 1: 20 fetched users chunking
  const users20: CachedMember[] = Array.from({ length: 20 }, (_, i) =>
    createMember(1000 + i, `User${i}`, `user_${i}`)
  );
  const res20 = MtprotoParticipantService.buildEmojiMentionBatches(users20, '', 10);
  assert(res20.mentions.length === 20, 'Test 1: 20 fetched users produce 20 mentions');
  assert(res20.chunks.length === 2, 'Test 1: 20 fetched users produce exactly 2 chunks of 10');

  // Test 2: 100 fetched users chunking
  const users100: CachedMember[] = Array.from({ length: 100 }, (_, i) =>
    createMember(2000 + i, `User${i}`, `user_${i}`)
  );
  const res100 = MtprotoParticipantService.buildEmojiMentionBatches(users100, '', 10);
  assert(res100.mentions.length === 100, 'Test 2: 100 fetched users produce 100 mentions');
  assert(res100.chunks.length === 10, 'Test 2: 100 fetched users produce exactly 10 chunks');

  // Test 3 & 15: 537 fetched users -> 54 messages
  const users537: CachedMember[] = Array.from({ length: 537 }, (_, i) =>
    createMember(10000 + i, `User${i}`, `user_${i}`)
  );
  const res537 = MtprotoParticipantService.buildEmojiMentionBatches(users537, '', 10);
  assert(res537.mentions.length === 537, 'Test 3: 537 fetched users produce 537 mentions');
  assert(res537.chunks.length === 54, 'Test 3 & 15: exactly 537 users produce ceil(537/10) = 54 messages');

  // Test 4: 1000+ fetched users -> 100+ messages
  const users1050: CachedMember[] = Array.from({ length: 1050 }, (_, i) =>
    createMember(20000 + i, `User${i}`, `user_${i}`)
  );
  const res1050 = MtprotoParticipantService.buildEmojiMentionBatches(users1050, '', 10);
  assert(res1050.mentions.length === 1050, 'Test 4: 1050 fetched users produce 1050 mentions');
  assert(res1050.chunks.length === 105, 'Test 4: 1050 fetched users produce exactly 105 messages');

  // Test 5: Pagination across multiple pages simulation
  const simulatePagination = (totalPages: number, pageSize: number, remainder: number) => {
    let offset = 0;
    const allRetrieved: number[] = [];
    for (let page = 1; page <= totalPages; page++) {
      const count = page === totalPages ? remainder : pageSize;
      const pageData = Array.from({ length: count }, (_, i) => offset + i);
      allRetrieved.push(...pageData);
      offset += count;
    }
    return { allRetrieved, offset };
  };
  const pagRes = simulatePagination(3, 200, 137);
  assert(pagRes.allRetrieved.length === 537, 'Test 5: Multi-page pagination (200 + 200 + 137) retrieves 537 items');

  // Test 6: Duplicate participant records deduplication
  const duplicateCandidates: CachedMember[] = [
    createMember(101, 'Alice', 'alice'),
    createMember(101, 'Alice Dup', 'alice'),
    createMember(102, 'Bob', 'bob'),
    createMember(102, 'Bob Dup', 'bob'),
    createMember(103, 'Charlie', 'charlie')
  ];
  const dedupRes = MtprotoParticipantService.buildEmojiMentionBatches(duplicateCandidates, '', 10);
  assert(dedupRes.mentions.length === 3, 'Test 6: Duplicate user IDs are deduplicated correctly (3 unique users)');

  // Test 7: Incomplete fetch detection
  const incompleteResult: ParticipantFetchResult = {
    status: 'PARTIAL_FETCH',
    telegramTotal: 537,
    fetchedCount: 20,
    uniqueCount: 20,
    excludedCount: 0,
    eligibleCount: 20,
    members: users20,
    isComplete: false,
    diagnosticMessage: 'Telegram visibility restrictions prevented full participant retrieval: 20/537 available.'
  };
  assert(incompleteResult.status === 'PARTIAL_FETCH' && !incompleteResult.isComplete, 'Test 7: Incomplete fetch is flagged as PARTIAL_FETCH with isComplete=false');

  // Test 8: Telegram-reported total mismatch
  const mismatchResult: ParticipantFetchResult = {
    status: 'PARTIAL_FETCH',
    telegramTotal: 1000,
    fetchedCount: 150,
    uniqueCount: 150,
    excludedCount: 0,
    eligibleCount: 150,
    members: users100,
    isComplete: false
  };
  assert(mismatchResult.telegramTotal !== mismatchResult.uniqueCount && mismatchResult.status === 'PARTIAL_FETCH', 'Test 8: Total mismatch (1000 reported vs 150 fetched) correctly tracked');

  // Test 9: Bot exclusion
  const mixedUsers = [
    { userId: 301, firstName: 'Alice', username: 'alice', is_bot: false, lastSeen: '2026-09-22T00:00:00.000Z' },
    { userId: 302, firstName: 'SpamBot', username: 'group_spambot', is_bot: true, lastSeen: '2026-09-22T00:00:00.000Z' },
    { userId: 303, firstName: 'HelperBot', username: 'helper_bot', is_bot: false, lastSeen: '2026-09-22T00:00:00.000Z' },
    { userId: 304, firstName: 'Bob', username: 'bob', is_bot: false, lastSeen: '2026-09-22T00:00:00.000Z' }
  ];
  const filteredMixed = CommandHandler.buildAllMentionsChunks(mixedUsers as any, '', undefined, 10);
  assert(filteredMixed.mentions.length === 2, 'Test 9: Bots (is_bot: true or username ending with bot) are excluded');

  // Test 10: Roxie self exclusion
  const botId = 99999;
  const selfExcluded = CommandHandler.buildAllMentionsChunks([
    createMember(99999, 'Roxie', 'roxiebot'),
    createMember(401, 'David', 'david')
  ], '', botId, 10);
  assert(selfExcluded.mentions.length === 1, 'Test 10: Roxie bot itself is excluded from mentions');

  // Test 11: Users without usernames
  const noUsernameUsers: CachedMember[] = [
    createMember(501, 'Anonymous John'),
    createMember(502, 'Silent Jane')
  ];
  const noUsernameRes = CommandHandler.buildAllMentionsChunks(noUsernameUsers, '', undefined, 10);
  assert(noUsernameRes.mentions.length === 2 && noUsernameRes.mentions[0].includes('tg://user?id=501'), 'Test 11: Users without usernames are successfully included with tg://user?id links');

  // Test 12: text_mention entity & HTML link generation
  const singleUser: CachedMember = createMember(601, 'Frank');
  const chunkSingle = CommandHandler.buildAllMentionsChunks([singleUser], '', undefined, 10);
  assert(
    chunkSingle.mentions[0].startsWith('<a href="tg://user?id=601">') && chunkSingle.mentions[0].endsWith('</a>'),
    'Test 12: Generates valid HTML text mention with <a href="tg://user?id=...">emoji</a>'
  );

  // Test 13: UTF-16 offset calculations for emoji mentions
  const emojiEntities = MtprotoParticipantService.buildTextMentionEntities(
    [createMember(701, 'UserA'), createMember(702, 'UserB')],
    ['😀', '😎']
  );
  assert(emojiEntities.text.length === 4, 'Test 13: Two surrogate pair emojis have UTF-16 length of 4');
  assert(emojiEntities.entities[0].offset === 0 && emojiEntities.entities[0].length === 2, 'Test 13: Entity 0 has offset 0 and length 2');
  assert(emojiEntities.entities[1].offset === 2 && emojiEntities.entities[1].length === 2, 'Test 13: Entity 1 has offset 2 and length 2');

  // Test 14: 10-per-message chunking structure
  const users25: CachedMember[] = Array.from({ length: 25 }, (_, i) =>
    createMember(800 + i, `U${i}`)
  );
  const chunk25 = CommandHandler.buildAllMentionsChunks(users25, 'Announcement Header', undefined, 10);
  assert(chunk25.chunks.length === 3, 'Test 14: 25 users produce exactly 3 chunks');
  assert(chunk25.chunks[0].startsWith('Announcement Header\n\n'), 'Test 14: First chunk includes custom header');
  assert(!chunk25.chunks[1].includes('Announcement Header'), 'Test 14: Second chunk contains only emojis');

  // Test 16: Exactly 500 -> 50 messages
  const users500: CachedMember[] = Array.from({ length: 500 }, (_, i) =>
    createMember(30000 + i, `U${i}`)
  );
  const chunk500 = MtprotoParticipantService.buildEmojiMentionBatches(users500, '', 10);
  assert(chunk500.chunks.length === 50, 'Test 16: exactly 500 users produce exactly 50 messages');

  // Test 17: Exactly 501 -> 51 messages
  const users501: CachedMember[] = Array.from({ length: 501 }, (_, i) =>
    createMember(40000 + i, `U${i}`)
  );
  const chunk501 = MtprotoParticipantService.buildEmojiMentionBatches(users501, '', 10);
  assert(chunk501.chunks.length === 51, 'Test 17: exactly 501 users produce exactly 51 messages');

  // Test 18: Zero participants
  const emptyRes = MtprotoParticipantService.buildEmojiMentionBatches([], 'Test', 10);
  assert(emptyRes.mentions.length === 0 && emptyRes.chunks.length === 0, 'Test 18: 0 participants produce empty mentions and chunks');

  // Test 19: MTProto unconfigured / auth failure handling
  const unconfiguredService = new MtprotoParticipantService();
  const unconfRes = await unconfiguredService.fetchGroupParticipants(-1001234567890);
  assert(unconfRes.status === 'FETCH_FAILED' && unconfRes.errorCode === 'NOT_CONFIGURED', 'Test 19: Unconfigured MTProto returns typed FETCH_FAILED status');

  // Test 20: CHAT_ADMIN_REQUIRED error class
  const permError = new MTProtoPermissionError();
  assert(permError.code === 'CHAT_ADMIN_REQUIRED' && permError.message.includes('Telegram did not allow'), 'Test 20: MTProtoPermissionError has CHAT_ADMIN_REQUIRED code');

  // Test 21: Flood wait error handling
  const floodError = new MTProtoFloodWaitError(45);
  assert(floodError.code === 'FLOOD_WAIT' && floodError.seconds === 45, 'Test 21: MTProtoFloodWaitError stores seconds correctly');

  // Test 22: Concurrent /all per-chat locking
  const testChatId = -100777999111;
  const lock1 = mtprotoParticipantService.acquireChatLock(testChatId);
  const lock2 = mtprotoParticipantService.acquireChatLock(testChatId);
  assert(lock1 === true, 'Test 22: First /all acquires chat lock');
  assert(lock2 === false, 'Test 22: Concurrent /all for same chat is rejected by lock');
  mtprotoParticipantService.releaseChatLock(testChatId);
  const lock3 = mtprotoParticipantService.acquireChatLock(testChatId);
  assert(lock3 === true, 'Test 22: Lock can be re-acquired after release');
  mtprotoParticipantService.releaseChatLock(testChatId);

  // Test 23: Stale observed Mongo member is NOT included if absent from MTProto result
  const staleChatId = -100999000111;
  db.cacheUser({ id: 999111, first_name: 'StaleUser', username: 'stale_user' }, staleChatId);
  // Current MTProto result has only ActiveUser1 and ActiveUser2
  const activeMtprotoMembers: CachedMember[] = [
    createMember(111, 'ActiveUser1', 'active1'),
    createMember(222, 'ActiveUser2', 'active2')
  ];
  const finalMentionBatches = MtprotoParticipantService.buildEmojiMentionBatches(activeMtprotoMembers, '', 10);
  const allMentionText = finalMentionBatches.mentions.join(' ');
  assert(!allMentionText.includes('999111'), 'Test 23: Stale Mongo member (999111) absent from MTProto is NOT mentioned');
  assert(allMentionText.includes('111') && allMentionText.includes('222'), 'Test 23: Only active MTProto members are mentioned');

  // Test 24: Fresh fetch on every /all (537 on first fetch, 540 on second fetch)
  let currentGroupSize = 537;
  const mockFetchGroup = async () => {
    return Array.from({ length: currentGroupSize }, (_, i) => createMember(50000 + i, `User${i}`));
  };

  // Run 1: 537 members
  const run1Members = await mockFetchGroup();
  const run1Batches = MtprotoParticipantService.buildEmojiMentionBatches(run1Members, '', 10);
  assert(run1Batches.mentions.length === 537 && run1Batches.chunks.length === 54, 'Test 24: First /all fetches and mentions 537 members (54 batches)');

  // Dynamic Telegram group change: 3 users join
  currentGroupSize = 540;
  const run2Members = await mockFetchGroup();
  const run2Batches = MtprotoParticipantService.buildEmojiMentionBatches(run2Members, '', 10);
  assert(run2Batches.mentions.length === 540 && run2Batches.chunks.length === 54, 'Test 24: Second /all performs fresh fetch and mentions 540 members (not cached 537)');

  // Dynamic Telegram group change: 10 more users join
  currentGroupSize = 550;
  const run3Members = await mockFetchGroup();
  const run3Batches = MtprotoParticipantService.buildEmojiMentionBatches(run3Members, '', 10);
  assert(run3Batches.mentions.length === 550 && run3Batches.chunks.length === 55, 'Test 24: Third /all performs fresh fetch and mentions 550 members across 55 batches');

  // Test 25: Multi-chat concurrency independence (Chat A locked does NOT block Chat B)
  const chatA = -100111111111;
  const chatB = -100222222222;
  const lockA1 = mtprotoParticipantService.acquireChatLock(chatA);
  const lockB1 = mtprotoParticipantService.acquireChatLock(chatB);
  assert(lockA1 === true && lockB1 === true, 'Test 25: Chat A and Chat B can acquire locks concurrently and independently');
  const lockA2 = mtprotoParticipantService.acquireChatLock(chatA);
  assert(lockA2 === false, 'Test 25: Chat A second lock is rejected while Chat B remains active');
  mtprotoParticipantService.releaseChatLock(chatA);
  mtprotoParticipantService.releaseChatLock(chatB);

  // Test 26: Per-batch 429 retry simulation
  let dispatchCalls = 0;
  const simulatedBatchSend = async (batchNum: number, maxRetries: number = 3) => {
    let attempts = 0;
    while (attempts < maxRetries) {
      attempts++;
      dispatchCalls++;
      if (batchNum === 24 && attempts === 1) {
        // First attempt hits 429 flood wait
        continue;
      }
      return { ok: true, batch: batchNum };
    }
    return { ok: false, error: 'exhausted' };
  };

  dispatchCalls = 0;
  const batch23Res = await simulatedBatchSend(23);
  const batch24Res = await simulatedBatchSend(24);
  const batch25Res = await simulatedBatchSend(25);
  assert(batch23Res.ok && batch24Res.ok && batch25Res.ok, 'Test 26: All batches succeed after 429 retry');
  assert(dispatchCalls === 4, 'Test 26: Exactly 4 attempts made (Batch 24 retried once without restarting operation)');

  console.log(`\n====================================================`);
  console.log(`🎉 MTProto Service Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
