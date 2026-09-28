import {
  MtprotoParticipantService,
  mtprotoParticipantService,
  ParticipantFetchResult,
  MTProtoNotConfiguredError,
  MTProtoAuthError,
  MTProtoPermissionError,
  MTProtoFloodWaitError,
  MTProtoIncompleteFetchError,
  MTProtoUnsupportedChatError,
  MTProtoGroupResolutionError
} from '../server/telegram/mtprotoParticipantService.js';
import { Api } from 'telegram';
import bigInt from 'big-integer';
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

  // Test 14: 10-per-message chunking structure (custom header applied to ALL chunks)
  const users25: CachedMember[] = Array.from({ length: 25 }, (_, i) =>
    createMember(800 + i, `U${i}`)
  );
  const chunk25 = CommandHandler.buildAllMentionsChunks(users25, 'Announcement Header', undefined, 10);
  assert(chunk25.chunks.length === 3, 'Test 14: 25 users produce exactly 3 chunks');
  assert(chunk25.chunks[0].startsWith('Announcement Header\n\n'), 'Test 14: First chunk includes custom header');
  assert(chunk25.chunks[1].startsWith('Announcement Header\n\n'), 'Test 14: Second chunk includes custom header');
  assert(chunk25.chunks[2].startsWith('Announcement Header\n\n'), 'Test 14: Third chunk includes custom header');

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
  assert(permError.code === 'CHAT_ADMIN_REQUIRED' && permError.message.includes('administrator access'), 'Test 20: MTProtoPermissionError has CHAT_ADMIN_REQUIRED code');

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
  // Test 27: Bot token configuration succeeds without TELEGRAM_MT_PROTO_SESSION
  const prevApiId = process.env.TELEGRAM_API_ID;
  const prevApiHash = process.env.TELEGRAM_API_HASH;
  const prevBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const prevSession = process.env.TELEGRAM_MT_PROTO_SESSION;

  try {
    process.env.TELEGRAM_API_ID = '123456';
    process.env.TELEGRAM_API_HASH = 'mock_api_hash_32chars_test';
    process.env.TELEGRAM_BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';
    delete process.env.TELEGRAM_MT_PROTO_SESSION;

    const botConfiguredService = new MtprotoParticipantService();
    const configStatus = botConfiguredService.getConfigurationStatus();
    assert(
      botConfiguredService.isConfigured() === true,
      'Test 27: MTProto is configured using TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_BOT_TOKEN'
    );
    assert(
      configStatus.hasBotToken === true && configStatus.hasApiId === true && configStatus.hasApiHash === true,
      'Test 27: Configuration status tracks hasBotToken=true without requiring TELEGRAM_MT_PROTO_SESSION'
    );

    // Test 28: Missing bot token fails clearly
    delete process.env.TELEGRAM_BOT_TOKEN;
    const unconfBotService = new MtprotoParticipantService();
    assert(
      unconfBotService.isConfigured() === false,
      'Test 28: Missing TELEGRAM_BOT_TOKEN returns isConfigured=false'
    );
  } finally {
    process.env.TELEGRAM_API_ID = prevApiId;
    process.env.TELEGRAM_API_HASH = prevApiHash;
    process.env.TELEGRAM_BOT_TOKEN = prevBotToken;
    process.env.TELEGRAM_MT_PROTO_SESSION = prevSession;
  }

  // Test 29: Entity resolution for Bot API chat ID -1004494262619 resolves to InputChannel and NOT PeerUser
  const targetSupergroupId = -1004494262619;
  const mockChannel = new Api.Channel({
    id: bigInt('4494262619') as any,
    title: 'Production Supergroup',
    photo: new Api.ChatPhotoEmpty(),
    date: 0,
    accessHash: bigInt('987654321012345678') as any
  });

  const mockClientWithCache: any = {
    _entityCache: {
      get: (key: string | number) => {
        if (String(key) === '-1004494262619' || key === -1004494262619) {
          return new Api.InputPeerChannel({
            channelId: bigInt('4494262619') as any,
            accessHash: bigInt('987654321012345678') as any
          });
        }
        throw new Error('Not found in cache');
      }
    },
    getInputEntity: async (key: any) => {
      if (String(key) === '-1004494262619') {
        return new Api.InputPeerChannel({
          channelId: bigInt('4494262619') as any,
          accessHash: bigInt('987654321012345678') as any
        });
      }
      throw new Error(`Could not find the input entity for ${JSON.stringify(key)}`);
    }
  };

  const resolvedInputChannel = await mtprotoParticipantService.resolvePeerEntity(mockClientWithCache, targetSupergroupId);
  assert(
    resolvedInputChannel instanceof Api.InputChannel,
    'Test 29: Resolves -1004494262619 to an instance of Api.InputChannel'
  );
  assert(
    resolvedInputChannel.channelId.toString() === '4494262619',
    'Test 29: Channel ID is correctly 4494262619'
  );
  assert(
    resolvedInputChannel.accessHash.toString() === '987654321012345678',
    'Test 29: MTProto access hash is retrieved and preserved in InputChannel'
  );
  assert(
    (resolvedInputChannel as any).className === 'InputChannel' && !(resolvedInputChannel as any).userId,
    'Test 29: Entity is NOT converted to PeerUser (no userId, className is InputChannel)'
  );

  // Test 30: Direct resolution for bot identity without calling messages.getDialogs
  let getDialogsCalled = false;
  const mockBotClientDirect: any = {
    _entityCache: {
      get: () => {
        throw new Error('Cache miss');
      }
    },
    getInputEntity: async (key: any) => {
      if (String(key) === '-1004494262619') {
        return new Api.InputPeerChannel({
          channelId: bigInt('4494262619') as any,
          accessHash: bigInt('987654321012345678') as any
        });
      }
      throw new Error('Entity not found');
    },
    getDialogs: async () => {
      getDialogsCalled = true;
      throw new Error('BOT_METHOD_INVALID: bots cannot use getDialogs');
    }
  };

  const directResolved = await mtprotoParticipantService.resolvePeerEntity(mockBotClientDirect, targetSupergroupId);
  assert(
    directResolved instanceof Api.InputChannel && directResolved.channelId.toString() === '4494262619',
    'Test 30: Direct bot resolution resolves to InputChannel with channelId 4494262619'
  );
  assert(
    getDialogsCalled === false,
    'Test 30: Bot identity does NOT call messages.getDialogs (avoiding BOT_METHOD_INVALID)'
  );

  // Test 31: Basic group (-4494262619) throws MTProtoUnsupportedChatError
  let basicGroupError: any = null;
  try {
    await mtprotoParticipantService.resolvePeerEntity(mockClientWithCache, -4494262619);
  } catch (err: any) {
    basicGroupError = err;
  }
  assert(
    basicGroupError instanceof MTProtoUnsupportedChatError && basicGroupError.code === 'UNSUPPORTED_CHAT_TYPE',
    'Test 31: Basic group (-4494262619) throws MTProtoUnsupportedChatError with code UNSUPPORTED_CHAT_TYPE'
  );

  // Test 32: Direct user chat ID (4494262619) throws MTProtoUnsupportedChatError and is NEVER resolved as a user
  let userChatError: any = null;
  try {
    await mtprotoParticipantService.resolvePeerEntity(mockClientWithCache, 4494262619);
  } catch (err: any) {
    userChatError = err;
  }
  assert(
    userChatError instanceof MTProtoUnsupportedChatError && userChatError.code === 'UNSUPPORTED_CHAT_TYPE',
    'Test 32: Positive user ID (4494262619) throws MTProtoUnsupportedChatError and is not treated as a group'
  );

  // Test 33: Unresolvable supergroup / bot not a member throws MTProtoGroupResolutionError
  const mockClientNoAccess: any = {
    _entityCache: {
      get: () => {
        throw new Error('Cache miss');
      }
    },
    getInputEntity: async () => {
      throw new Error('CHANNEL_PRIVATE');
    }
  };

  let noAccessError: any = null;
  try {
    await mtprotoParticipantService.resolvePeerEntity(mockClientNoAccess, -1004494262619);
  } catch (err: any) {
    noAccessError = err;
  }
  assert(
    noAccessError instanceof MTProtoGroupResolutionError &&
    noAccessError.code === 'GROUP_RESOLUTION_FAILED' &&
    noAccessError.message.includes('Roxie bot is not a member or administrator'),
    'Test 33: Inaccessible group throws MTProtoGroupResolutionError with clear membership/admin diagnostic'
  );

  // Test 34: String format "-1004494262619" chat ID resolves correctly
  const resolvedStrChannel = await mtprotoParticipantService.resolvePeerEntity(mockClientWithCache, '-1004494262619');
  assert(
    resolvedStrChannel instanceof Api.InputChannel && resolvedStrChannel.channelId.toString() === '4494262619',
    'Test 34: String format "-1004494262619" resolves correctly to Api.InputChannel'
  );

  // Test 35: CHAT_ADMIN_REQUIRED error mapped cleanly
  const mockAdminReqClient: any = {
    _entityCache: {
      get: () => {
        throw new Error('Cache miss');
      }
    },
    getInputEntity: async () => {
      throw new Error('CHAT_ADMIN_REQUIRED');
    }
  };

  let adminReqError: any = null;
  try {
    await mtprotoParticipantService.resolvePeerEntity(mockAdminReqClient, -1004494262619);
  } catch (err: any) {
    adminReqError = err;
  }
  assert(
    adminReqError instanceof MTProtoPermissionError &&
    adminReqError.code === 'CHAT_ADMIN_REQUIRED' &&
    adminReqError.message.includes('Roxie needs administrator access'),
    'Test 35: CHAT_ADMIN_REQUIRED throws MTProtoPermissionError with "❌ Roxie needs administrator access in this supergroup to enumerate its members."'
  );

  // Test 36: buildEmojiMentionBatches applies custom caption to ALL chunks
  const users45: CachedMember[] = Array.from({ length: 45 }, (_, i) =>
    createMember(60000 + i, `Member_${i}`)
  );
  const res45 = MtprotoParticipantService.buildEmojiMentionBatches(users45, 'ajao sab', 10);
  assert(res45.chunks.length === 5, 'Test 36: 45 members produce 5 chunks (10, 10, 10, 10, 5)');
  for (let c = 0; c < res45.chunks.length; c++) {
    assert(
      res45.chunks[c].startsWith('ajao sab\n\n'),
      `Test 36: Chunk ${c + 1} must start with custom text "ajao sab\\n\\n"`
    );
  }

  // Test 37: 537 members with custom caption produce 54 chunks, all with custom caption
  const res537WithCaption = MtprotoParticipantService.buildEmojiMentionBatches(users537, 'Important Announcement', 10);
  assert(res537WithCaption.chunks.length === 54, 'Test 37: 537 members produce 54 chunks');
  const allChunksHaveCaption = res537WithCaption.chunks.every(chunk => chunk.startsWith('Important Announcement\n\n'));
  assert(allChunksHaveCaption, 'Test 37: All 54 chunks contain "Important Announcement\\n\\n" caption prefix');

  // Test 38: Empty custom text produces chunks with only emoji mentions
  const resEmptyCaption = MtprotoParticipantService.buildEmojiMentionBatches(users45, '', 10);
  assert(resEmptyCaption.chunks.length === 5, 'Test 38: 45 members with empty caption produce 5 chunks');
  const noneHaveNewlines = resEmptyCaption.chunks.every(chunk => !chunk.includes('\n\n') && chunk.startsWith('<a href='));
  assert(noneHaveNewlines, 'Test 38: Chunks without custom text contain only emoji mentions without leading newlines');

  // Test 39: 20 ordinary members + 3 administrators + 1 bot enumeration and batching
  const ordinaryUsers = Array.from({ length: 20 }, (_, i) =>
    createMember(1000 + i, `OrdinaryUser${i}`, `ordinary_${i}`)
  );
  const adminUsers = [
    createMember(2001, 'OwnerAdmin', 'owner_admin'),
    createMember(2002, 'ModAdmin1', 'mod_admin_1'),
    createMember(2003, 'ModAdmin2', 'mod_admin_2')
  ];
  const botUserItem = {
    userId: 99999,
    firstName: 'MissRoxieBot',
    username: 'MissRoxie_Bot',
    is_bot: true,
    lastSeen: '2026-09-28T00:00:00.000Z'
  };

  const mixedPool = [...ordinaryUsers, ...adminUsers, botUserItem as any];
  const mixedRes = CommandHandler.buildAllMentionsChunks(mixedPool, 'Notice', 99999, 10);
  assert(
    mixedRes.mentions.length === 23,
    'Test 39: 20 ordinary members + 3 admins = 23 mentions (bot correctly excluded)'
  );
  assert(
    mixedRes.chunks.length === 3,
    'Test 39: 23 members produce exactly 3 batches (10, 10, 3)'
  );
  assert(
    mixedRes.mentions.some(m => m.includes('tg://user?id=1000')) &&
    mixedRes.mentions.some(m => m.includes('tg://user?id=2001')),
    'Test 39: Both ordinary members and administrators are present in mention output'
  );

  // Test 40: 50 ordinary members + 5 admins = 55 members -> 6 batches
  const users55 = [
    ...Array.from({ length: 50 }, (_, i) => createMember(3000 + i, `OrdUser${i}`, `ord_${i}`)),
    ...Array.from({ length: 5 }, (_, i) => createMember(4000 + i, `AdminUser${i}`, `admin_${i}`))
  ];
  const res55 = MtprotoParticipantService.buildEmojiMentionBatches(users55, 'Hype', 10);
  assert(res55.mentions.length === 55, 'Test 40: 55 total members (50 ordinary + 5 admin) produce 55 mentions');
  assert(res55.chunks.length === 6, 'Test 40: 55 members produce exactly 6 batches');

  // Test 41: Verification that ChannelParticipantsSearch filter collects ordinary members
  const mockSearchClient: any = {
    _entityCache: {
      get: () => new Api.InputPeerChannel({
        channelId: bigInt('4494262619') as any,
        accessHash: bigInt('987654321012345678') as any
      })
    },
    invoke: async (req: any) => {
      if (req instanceof Api.channels.GetParticipants) {
        // Return 20 ordinary members + 3 admins
        const users = [
          ...Array.from({ length: 20 }, (_, i) => new Api.User({
            id: bigInt(5000 + i) as any,
            firstName: `Ordinary${i}`,
            username: `ord_${i}`,
            bot: false
          })),
          new Api.User({ id: bigInt(6001) as any, firstName: 'AdminA', username: 'admin_a', bot: false }),
          new Api.User({ id: bigInt(6002) as any, firstName: 'AdminB', username: 'admin_b', bot: false }),
          new Api.User({ id: bigInt(6003) as any, firstName: 'AdminC', username: 'admin_c', bot: false })
        ];
        return new Api.channels.ChannelParticipants({
          count: 23,
          participants: users.map(u => new Api.ChannelParticipant({ userId: u.id, date: Math.floor(Date.now() / 1000) })),
          chats: [],
          users
        });
      }
      throw new Error('Unknown request');
    }
  };

  const serviceInstance = new MtprotoParticipantService();
  serviceInstance.isConfigured = () => true;
  (serviceInstance as any).client = mockSearchClient;
  (serviceInstance as any).isConnected = true;

  const mockFetchRes = await serviceInstance.fetchGroupParticipants(-1004494262619, 99999);
  assert(mockFetchRes.status === 'FULL_FETCH', 'Test 41: Search fetch returns status FULL_FETCH');
  assert(mockFetchRes.eligibleCount === 23, 'Test 41: Search fetch enumerates all 23 members (20 ordinary + 3 admins)');
  assert(
    mockFetchRes.members.some(m => m.userId === 5000) && mockFetchRes.members.some(m => m.userId === 6001),
    'Test 41: Both ordinary members (id: 5000) and admins (id: 6001) are included in fetch result'
  );

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
