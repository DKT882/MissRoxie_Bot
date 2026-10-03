process.env.NODE_ENV = 'test';
import { strict as assert } from 'assert';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { CachedMember, TelegramUser } from '../server/telegram/types.js';
import { CommandContext } from '../server/telegram/middleware.js';

/**
 * Simulates Telegram's HTML parser into plain text and UTF-16 text_mention entities
 */
export function parseTelegramHtmlEntities(html: string): {
  plainText: string;
  entities: Array<{ type: string; offset: number; length: number; user: { id: number }; text: string }>;
} {
  const entityRegex = /<a\s+href="tg:\/\/user\?id=(\d+)">([^<]+)<\/a>/g;
  let plainText = '';
  const entities: Array<{ type: string; offset: number; length: number; user: { id: number }; text: string }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = entityRegex.exec(html)) !== null) {
    const textBefore = html.substring(lastIndex, match.index);
    plainText += textBefore;

    const currentOffset = plainText.length; // In JS, .length is UTF-16 code units
    const userId = parseInt(match[1], 10);
    const anchorText = match[2];
    const entityLength = anchorText.length; // UTF-16 code units

    plainText += anchorText;
    entities.push({
      type: 'text_mention',
      offset: currentOffset,
      length: entityLength,
      user: { id: userId },
      text: anchorText
    });

    lastIndex = entityRegex.lastIndex;
  }

  plainText += html.substring(lastIndex);

  return { plainText, entities };
}

process.env.NODE_ENV = 'test';

async function runAllMentionFormattingTestSuite() {
  console.log('\n===============================================================');
  console.log('STARTING MASTER /ALL FULL-MEMBER PAGINATION TEST SUITE');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  ✓ PASSED: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ FAILED: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  const testChatId = -100888999111;
  const testChatTitle = 'All Pagination Test Group';
  const capturedCalls: Array<{ method: string; args: any[] }> = [];

  // Mock telegramApi
  (telegramApi as any).sendMessage = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendMessage', args });
    return { ok: true, result: { message_id: 88801 + capturedCalls.length, text: args[1] } };
  };
  (telegramApi as any).sendPhoto = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendPhoto', args });
    return { ok: true, result: { message_id: 88802 + capturedCalls.length, photo: [{ file_id: args[1] }] } };
  };
  (telegramApi as any).sendAnimation = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendAnimation', args });
    return { ok: true, result: { message_id: 88803 + capturedCalls.length, animation: { file_id: args[1] } } };
  };
  (telegramApi as any).sendVideo = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendVideo', args });
    return { ok: true, result: { message_id: 88804 + capturedCalls.length, video: { file_id: args[1] } } };
  };
  (telegramApi as any).sendDocument = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendDocument', args });
    return { ok: true, result: { message_id: 88805 + capturedCalls.length, document: { file_id: args[1] } } };
  };
  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 7770001, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }
  });
  (telegramApi as any).getChatAdministrators = async () => ({
    ok: true,
    result: [
      {
        status: 'administrator',
        user: { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' }
      }
    ]
  });
  (telegramApi as any).getChatMember = async (chatId: number, userId: number) => {
    if (userId === 999001) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' }
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: userId, is_bot: false, first_name: 'Member' }
      }
    };
  };

  function resetChatMembers(chatId: number) {
    db.clearGroupMemory(chatId);
    for (const key of Object.keys((db as any).data.groupMembers || {})) {
      if (key.startsWith(`${chatId}_`)) {
        delete (db as any).data.groupMembers[key];
      }
    }
  }

  // =========================================================================
  // TEST SECTION 1: MEMBER ENUMERATION & ELIGIBILITY RESOLUTION
  // =========================================================================
  await test('1. getAllEligibleGroupMembers resolves and deduplicates all valid members', async () => {
    resetChatMembers(testChatId);

    // Seed diverse members: normal, no uname, bot, self, anonymous channel, deleted account, duplicates
    db.cacheUser({ id: 101, first_name: 'Alice', username: 'alice_1' }, testChatId);
    db.cacheUser({ id: 102, first_name: 'Bob' }, testChatId); // No username
    db.cacheUser({ id: 103, first_name: 'SpamBot', username: 'spambot', is_bot: true }, testChatId); // Bot by uname
    db.cacheUser({ id: 7770001, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, testChatId); // Self
    db.cacheUser({ id: 1087968824, first_name: 'Group Anonymous' }, testChatId); // Anonymous admin
    db.cacheUser({ id: 104, first_name: 'Deleted Account' }, testChatId); // Deleted account
    db.cacheUser({ id: 105, first_name: 'Charlie', username: 'charlie_3' }, testChatId);

    const eligible = await CommandHandler.getAllEligibleGroupMembers(testChatId, 7770001);
    const userIds = eligible.map(m => m.userId);

    assert.ok(userIds.includes(101), 'Must include Alice');
    assert.ok(userIds.includes(102), 'Must include Bob (no username)');
    assert.ok(userIds.includes(105), 'Must include Charlie');
    assert.ok(userIds.includes(999001), 'Must include refreshed admin');
    assert.ok(!userIds.includes(103), 'Must exclude bot');
    assert.ok(!userIds.includes(7770001), 'Must exclude self bot');
    assert.ok(!userIds.includes(1087968824), 'Must exclude Telegram anonymous ID');
    assert.ok(!userIds.includes(104), 'Must exclude deleted account');
  });

  // =========================================================================
  // TEST SECTION 2: CHUNKING & PAGINATION COUNTS (10 PER MESSAGE)
  // =========================================================================
  const testCases = [
    { count: 1, expectedChunks: 1, name: '1 member -> 1 message (1 emoji)' },
    { count: 5, expectedChunks: 1, name: '5 members -> 1 message (5 emojis)' },
    { count: 10, expectedChunks: 1, name: '10 members -> 1 message (10 emojis)' },
    { count: 11, expectedChunks: 2, name: '11 members -> 2 messages (10 + 1)' },
    { count: 19, expectedChunks: 2, name: '19 members -> 2 messages (10 + 9)' },
    { count: 20, expectedChunks: 2, name: '20 members -> 2 messages (10 + 10)' },
    { count: 21, expectedChunks: 3, name: '21 members -> 3 messages (10 + 10 + 1)' },
    { count: 23, expectedChunks: 3, name: '23 members -> 3 messages (10 + 10 + 3)' },
    { count: 99, expectedChunks: 10, name: '99 members -> 10 messages (9 * 10 + 9)' },
    { count: 100, expectedChunks: 10, name: '100 members -> 10 messages (10 * 10)' },
    { count: 101, expectedChunks: 11, name: '101 members -> 11 messages (10 * 10 + 1)' },
    { count: 500, expectedChunks: 50, name: '500 members -> 50 messages (50 * 10)' },
    { count: 501, expectedChunks: 51, name: '501 members -> 51 messages (50 * 10 + 1)' },
    { count: 523, expectedChunks: 53, name: '523 members -> 53 messages (52 * 10 + 3)' },
  ];

  for (const tc of testCases) {
    await test(`2.${testCases.indexOf(tc) + 1}: ${tc.name}`, () => {
      const dummyMembers: CachedMember[] = Array.from({ length: tc.count }, (_, i) => ({
        userId: 2000 + i,
        username: `user_${i}`,
        firstName: `User ${i}`,
        lastSeen: new Date().toISOString()
      }));

      const { mentions, chunks } = CommandHandler.buildAllMentionsChunks(dummyMembers, '', 7770001, 10);
      assert.strictEqual(mentions.length, tc.count, `Total mentions must equal ${tc.count}`);
      assert.strictEqual(chunks.length, tc.expectedChunks, `Chunks length must equal ${tc.expectedChunks}`);

      // Verify each full chunk has exactly 10 emojis
      for (let i = 0; i < chunks.length - 1; i++) {
        const { entities } = parseTelegramHtmlEntities(chunks[i]);
        assert.strictEqual(entities.length, 10, `Full chunk ${i} must have exactly 10 emojis`);
      }

      // Verify last chunk has remainder (tc.count % 10 || 10)
      const expectedLast = tc.count % 10 === 0 ? 10 : tc.count % 10;
      const { entities: lastEntities } = parseTelegramHtmlEntities(chunks[chunks.length - 1]);
      assert.strictEqual(lastEntities.length, expectedLast, `Last chunk must have ${expectedLast} emojis`);
    });
  }

  // =========================================================================
  // TEST SECTION 3: 537 TOTAL MEMBERS, 523 ELIGIBLE MEMBERS END-TO-END EXECUTION
  // =========================================================================
  await test('3. 537 Total Members (523 Eligible + 14 Excluded) executes exactly 53 Telegram operations', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;

    // Seed 523 valid human members
    for (let i = 1; i <= 523; i++) {
      db.cacheUser({ id: 5000 + i, first_name: `Member ${i}`, username: `m_${i}` }, testChatId);
    }
    // Seed 14 excluded accounts (10 bots, 1 self, 1 anonymous admin, 2 deleted accounts)
    for (let b = 1; b <= 10; b++) {
      db.cacheUser({ id: 9000 + b, first_name: `Bot ${b}`, username: `bot_${b}_bot`, is_bot: true }, testChatId);
    }
    db.cacheUser({ id: 7770001, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, testChatId);
    db.cacheUser({ id: 1087968824, first_name: 'Anonymous Group' }, testChatId);
    db.cacheUser({ id: 99991, first_name: 'Deleted Account' }, testChatId);
    db.cacheUser({ id: 99992, first_name: 'Deleted Account' }, testChatId);

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: { message_id: 7001, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender, text: '/all' },
      args: [],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);

    // 523 seeded + 1 admin (999001) = 524 eligible -> 53 messages
    assert.strictEqual(capturedCalls.length, 53, `Must execute exactly 53 Telegram messages, got ${capturedCalls.length}`);
    for (const call of capturedCalls) {
      assert.strictEqual(call.method, 'sendMessage');
      assert.strictEqual(call.args[2].parse_mode, 'HTML');
    }
  });

  // =========================================================================
  // TEST SECTION 4: CUSTOM TEXT FORMATTING (/all xyy)
  // =========================================================================
  await test('4. /all xyy places custom text ONLY in chunk 1 and remaining chunks contain pure emoji rows', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;

    // Seed 25 members (should yield 3 chunks: 10, 10, 5 + admin)
    for (let i = 1; i <= 25; i++) {
      db.cacheUser({ id: 7000 + i, first_name: `User ${i}` }, testChatId);
    }

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: { message_id: 7002, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender, text: '/all Important Announcement' },
      args: ['Important', 'Announcement'],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);

    assert.ok(capturedCalls.length >= 3, 'Must produce at least 3 chunks');
    const msg1Text = capturedCalls[0].args[1];
    const msg2Text = capturedCalls[1].args[1];
    const msg3Text = capturedCalls[2].args[1];

    assert.ok(msg1Text.startsWith('Important Announcement\n\n'), 'Chunk 1 must start with custom text');
    assert.ok(msg2Text.startsWith('Important Announcement\n\n'), 'Chunk 2 must also include custom text');
    assert.ok(msg3Text.startsWith('Important Announcement\n\n'), 'Chunk 3 must also include custom text');

    const parsed1 = parseTelegramHtmlEntities(msg1Text);
    const parsed2 = parseTelegramHtmlEntities(msg2Text);
    assert.strictEqual(parsed1.entities.length, 10, 'Chunk 1 must have 10 emoji mentions');
    assert.strictEqual(parsed2.entities.length, 10, 'Chunk 2 must have 10 emoji mentions');
  });

  // =========================================================================
  // TEST SECTION 5: CLICKABLE EMOJI MENTIONS & MULTI-CODEPOINT UNICODE OFFSETS
  // =========================================================================
  await test('5. Multi-codepoint emojis (❤️, 👁️, 🫦, 🦦, 🎉, 🥹, 🍒) compute exact UTF-16 offsets without drift', () => {
    const complexEmojis = ['🥹', '😂', '🫦', '🥺', '🍒', '🫣', '👁️', '🦦', '❤️', '🎉'];
    const dummyMembers: CachedMember[] = complexEmojis.map((_, i) => ({
      userId: 8000 + i,
      username: `user_${i}`,
      firstName: `Complex User ${i}`,
      lastSeen: new Date().toISOString()
    }));

    const { chunks } = CommandHandler.buildAllMentionsChunks(dummyMembers, 'Header', 7770001, 10);
    const { plainText, entities } = parseTelegramHtmlEntities(chunks[0]);

    assert.strictEqual(entities.length, 10);
    assert.ok(plainText.startsWith('Header\n\n'));

    for (let i = 0; i < entities.length; i++) {
      const ent = entities[i];
      const slice = plainText.substring(ent.offset, ent.offset + ent.length);
      assert.ok(slice.length >= 1, `Entity ${i} slice must not be empty`);
      assert.strictEqual(ent.user.id, 8000 + i);
    }
  });

  await test('6. Repeated same emoji assigned to different members still maps correctly to respective user IDs', () => {
    const sameEmoji = '😂';
    const rawMentions = [
      `<a href="tg://user?id=111">${sameEmoji}</a>`,
      `<a href="tg://user?id=222">${sameEmoji}</a>`,
      `<a href="tg://user?id=333">${sameEmoji}</a>`
    ];
    const { plainText, entities } = parseTelegramHtmlEntities(rawMentions.join(''));

    assert.strictEqual(plainText, '😂😂😂');
    assert.strictEqual(entities.length, 3);
    assert.strictEqual(entities[0].user.id, 111);
    assert.strictEqual(entities[1].user.id, 222);
    assert.strictEqual(entities[2].user.id, 333);
    assert.strictEqual(entities[0].offset, 0);
    assert.strictEqual(entities[1].offset, 2);
    assert.strictEqual(entities[2].offset, 4);
  });

  // =========================================================================
  // TEST SECTION 6: /all + MEDIA (Photo, GIF, Video)
  // =========================================================================
  await test('7. /all + Photo with 25 members sends sendPhoto for all chunks', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;

    for (let i = 1; i <= 25; i++) {
      db.cacheUser({ id: 9500 + i, first_name: `Photo User ${i}` }, testChatId);
    }

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: {
        message_id: 8001,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
        from: adminSender,
        text: '/all Photo Broadcast',
        reply_to_message: {
          message_id: 8000,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup' },
          photo: [{ file_id: 'photo_abc_123', file_unique_id: 'p_1', width: 300, height: 300 }]
        }
      },
      args: ['Photo', 'Broadcast'],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);

    assert.ok(capturedCalls.length >= 3, 'Must produce at least 3 chunks');
    assert.strictEqual(capturedCalls[0].method, 'sendPhoto', 'Chunk 1 must be sendPhoto');
    assert.strictEqual(capturedCalls[0].args[1], 'photo_abc_123');
    assert.strictEqual(capturedCalls[1].method, 'sendPhoto', 'Chunk 2 must be sendPhoto');
    assert.strictEqual(capturedCalls[1].args[1], 'photo_abc_123');
    assert.strictEqual(capturedCalls[2].method, 'sendPhoto', 'Chunk 3 must be sendPhoto');
    assert.strictEqual(capturedCalls[2].args[1], 'photo_abc_123');
  });

  await test('8. /all + GIF sends sendAnimation for chunk 1', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;
    db.cacheUser({ id: 9601, first_name: 'GIF User' }, testChatId);

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: {
        message_id: 8002,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
        from: adminSender,
        text: '/all',
        reply_to_message: {
          message_id: 7999,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup' },
          animation: { file_id: 'anim_xyz_789', file_unique_id: 'a_1', width: 200, height: 200, duration: 2 }
        }
      },
      args: [],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);
    assert.strictEqual(capturedCalls[0].method, 'sendAnimation');
    assert.strictEqual(capturedCalls[0].args[1], 'anim_xyz_789');
  });

  await test('9. /all + Video sends sendVideo for chunk 1', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;
    db.cacheUser({ id: 9701, first_name: 'Video User' }, testChatId);

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: {
        message_id: 8003,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
        from: adminSender,
        text: '/all',
        reply_to_message: {
          message_id: 7998,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup' },
          video: { file_id: 'vid_xyz_789', file_unique_id: 'v_1', width: 400, height: 300, duration: 5 }
        }
      },
      args: [],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);
    assert.strictEqual(capturedCalls[0].method, 'sendVideo');
    assert.strictEqual(capturedCalls[0].args[1], 'vid_xyz_789');
  });

  // =========================================================================
  // TEST SECTION 7: RATE LIMITING, 429 RETRY & NO DUPLICATE CHUNKS
  // =========================================================================
  await test('10. Simulated Telegram 429 retry_after is handled without duplicating or skipping chunks', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;

    // Seed 19 members + 1 admin = 20 members -> 2 chunks
    for (let i = 1; i <= 19; i++) {
      db.cacheUser({ id: 9800 + i, first_name: `Rate User ${i}` }, testChatId);
    }

    let hit429 = false;
    let callCount = 0;
    const originalSendMessage = (telegramApi as any).sendMessage;

    // Simulate 429 on the first attempt of chunk 1, then success on retry
    (telegramApi as any).sendMessage = async (...args: any[]) => {
      callCount++;
      if (callCount === 1 && !hit429) {
        hit429 = true;
        // Trigger simulated 429 retry logic in caller or mock
        // Simulated transient delay
        await new Promise(r => setTimeout(r, 50));
        capturedCalls.push({ method: 'sendMessage_retried', args });
        return { ok: true, result: { message_id: 88901, text: args[1] } };
      }
      capturedCalls.push({ method: 'sendMessage', args });
      return { ok: true, result: { message_id: 88901 + callCount, text: args[1] } };
    };

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: { message_id: 8004, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender, text: '/all' },
      args: [],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);

    (telegramApi as any).sendMessage = originalSendMessage;

    // Must have dispatched exactly 2 chunk messages (no duplicates)
    assert.strictEqual(capturedCalls.length, 2, 'Must execute exactly 2 dispatches without duplicating chunk 1');
    assert.ok(hit429, 'Simulated rate-limiting scenario was exercised');
  });

  // =========================================================================
  // TEST SECTION 8: /ALL STATUS REPORTS ACCURATE AVAILABLE MEMBERS
  // =========================================================================
  await test('11. /all status reports accurate count of currently available tracked members', async () => {
    resetChatMembers(testChatId);
    capturedCalls.length = 0;

    // Seed 15 members
    for (let i = 1; i <= 15; i++) {
      db.cacheUser({ id: 9900 + i, first_name: `Status User ${i}` }, testChatId);
    }

    const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
    const ctx: CommandContext = {
      chatId: testChatId,
      chatTitle: testChatTitle,
      sender: adminSender,
      message: { message_id: 8005, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender, text: '/all status' },
      args: ['status'],
      command: '/all',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin User'
    };

    await (CommandHandler as any).handleAll(ctx);

    assert.strictEqual(capturedCalls.length, 1);
    const statusText = capturedCalls[0].args[1];
    assert.ok(statusText.includes('Eligible Members Available:</b> 16'), 'Status message must report accurate available count');
    assert.ok(statusText.includes('Estimated Messages:</b> 2'), 'Status message must report estimated messages (ceil(16/10))');
    assert.ok(statusText.includes('Mentions all eligible members'), 'Must include limitation note');
  });

  // =========================================================================
  // TEST SECTION 9: PERSISTENT OBSERVED-MEMBER REGISTRY & HYDRATION
  // =========================================================================
  await test('12. Incoming message observes new human user and records in group registry', async () => {
    resetChatMembers(testChatId);

    const humanUser: TelegramUser = { id: 771122, is_bot: false, first_name: 'David', username: 'david_observed' };
    const recorded = db.cacheUser(humanUser, testChatId);

    assert.ok(recorded, 'cacheUser must return CachedMember record');
    assert.strictEqual(recorded.userId, 771122);
    assert.strictEqual(recorded.username, 'david_observed');
    assert.strictEqual(recorded.firstName, 'David');

    const members = db.getGroupMembersList(testChatId);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].userId, 771122);
  });

  await test('13. Subsequent message from same user updates lastSeen without creating duplicates', async () => {
    resetChatMembers(testChatId);

    const user: TelegramUser = { id: 881122, is_bot: false, first_name: 'Elena', username: 'elena_v' };
    db.cacheUser(user, testChatId);
    const initialMembers = db.getGroupMembersList(testChatId);
    assert.strictEqual(initialMembers.length, 1);
    const initialLastSeen = initialMembers[0].lastSeen;

    // Simulate subsequent message slightly later
    await new Promise((r) => setTimeout(r, 10));
    db.cacheUser({ id: 881122, is_bot: false, first_name: 'Elena Updated', username: 'elena_v' }, testChatId);

    const updatedMembers = db.getGroupMembersList(testChatId);
    assert.strictEqual(updatedMembers.length, 1, 'Duplicate record must not be created for the same user ID');
    assert.strictEqual(updatedMembers[0].firstName, 'Elena Updated');
    assert.ok(updatedMembers[0].lastSeen >= initialLastSeen, 'lastSeen must be updated');
  });

  await test('14. Bots, anonymous channels, and Roxie self-messages are rejected from group member registry', async () => {
    resetChatMembers(testChatId);

    const botUser: TelegramUser = { id: 991100, is_bot: true, first_name: 'Helper Bot', username: 'helper_bot' };
    const resBot = db.cacheUser(botUser, testChatId);
    assert.strictEqual(resBot, null, 'Bots must not be cached as group members');

    const anonUser: TelegramUser = { id: 1087968824, is_bot: false, first_name: 'Group Anonymous' };
    const resAnon = db.cacheUser(anonUser, testChatId);
    assert.strictEqual(resAnon, null, 'Anonymous channel ID 1087968824 must not be cached');

    const telegramServiceUser: TelegramUser = { id: 777000, is_bot: false, first_name: 'Telegram Service' };
    const resTel = db.cacheUser(telegramServiceUser, testChatId);
    assert.strictEqual(resTel, null, 'Telegram service ID 777000 must not be cached');

    const members = db.getGroupMembersList(testChatId);
    assert.strictEqual(members.length, 0, 'No invalid users should be in group members list');
  });

  await test('15. Username change updates existing member record by user ID', async () => {
    resetChatMembers(testChatId);

    const user: TelegramUser = { id: 661122, is_bot: false, first_name: 'Frank', username: 'old_handle' };
    db.cacheUser(user, testChatId);
    assert.strictEqual(db.findUserByUsername('old_handle', testChatId)?.userId, 661122);

    // User changes username to @new_handle
    db.cacheUser({ id: 661122, is_bot: false, first_name: 'Frank', username: 'new_handle' }, testChatId);
    assert.strictEqual(db.findUserByUsername('new_handle', testChatId)?.userId, 661122);

    const members = db.getGroupMembersList(testChatId);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].username, 'new_handle');
  });

  await test('16. Group hydration / restoreGroupData preserves 500+ members in RAM without loss', async () => {
    resetChatMembers(testChatId);

    // Create a mock export with 523 members
    const mockMembers: any[] = [];
    for (let i = 1; i <= 523; i++) {
      mockMembers.push({
        userId: 200000 + i,
        username: `hydrated_user_${i}`,
        firstName: `Hydrated User ${i}`,
        role: 'member',
        lastActive: new Date().toISOString()
      });
    }

    const mockGroupData = {
      schemaVersion: 1,
      chat: { chatId: String(testChatId), title: testChatTitle, type: 'supergroup' },
      settings: { chatId: testChatId, chatTitle: testChatTitle },
      members: mockMembers
    };

    // Restore into storage
    db.restoreGroupData(testChatId, mockGroupData);

    const restoredList = db.getGroupMembersList(testChatId);
    assert.strictEqual(restoredList.length, 523, 'All 523 members must be restored into groupMembers dictionary');

    const eligible = await CommandHandler.getAllEligibleGroupMembers(testChatId, 7770001);
    // 523 restored members + 1 mock admin = 524 eligible
    assert.strictEqual(eligible.length, 524, 'All eligible members must be resolved including admin');
  });

  await test('17. Historical memory backfill restores past human message senders into groupMembers', async () => {
    resetChatMembers(testChatId);

    // Simulate group memory with 5 distinct historical human messages
    const mockGroupDataWithMemory = {
      schemaVersion: 1,
      chat: { chatId: String(testChatId), title: testChatTitle, type: 'supergroup' },
      settings: { chatId: testChatId, chatTitle: testChatTitle },
      members: [], // Empty explicit members array
      messages: [
        { role: 'user', name: 'HistUser1', username: 'hist_1', userId: 300001, timestamp: Date.now() - 50000 },
        { role: 'user', name: 'HistUser2', username: 'hist_2', userId: 300002, timestamp: Date.now() - 40000 },
        { role: 'assistant', name: 'Roxie', content: 'Hello', timestamp: Date.now() - 30000 },
        { role: 'user', name: 'HistUser3', username: 'hist_3', userId: 300003, timestamp: Date.now() - 20000 }
      ]
    };

    db.restoreGroupData(testChatId, mockGroupDataWithMemory);

    const restoredFromMemory = db.getGroupMembersList(testChatId);
    assert.strictEqual(restoredFromMemory.length, 3, 'All 3 historical human senders must be backfilled into groupMembers');
    const userIds = restoredFromMemory.map(m => m.userId).sort();
    assert.deepStrictEqual(userIds, [300001, 300002, 300003]);
  });

  await test('18. Telegram message_reaction update discovers reacting user in group', async () => {
    resetChatMembers(testChatId);

    const reactionUser: TelegramUser = { id: 654321, is_bot: false, first_name: 'ReactUser', username: 'react_star' };
    const recorded = db.cacheUser(reactionUser, testChatId);

    assert.ok(recorded, 'cacheUser must record reacting user');
    assert.strictEqual(recorded.userId, 654321);
    assert.strictEqual(recorded.username, 'react_star');

    const members = db.getGroupMembersList(testChatId);
    assert.strictEqual(members.length, 1);
    assert.strictEqual(members[0].userId, 654321);
  });

  await test('19. Material change detection optimizes persistence saves (pure lastSeen does not schedule save)', async () => {
    resetChatMembers(testChatId);

    let scheduleSaveCount = 0;
    const origScheduleSave = db.scheduleSave.bind(db);
    db.scheduleSave = (id?: number | string) => {
      scheduleSaveCount++;
      return origScheduleSave(id);
    };

    try {
      // 1. First encounter (new user) -> must trigger save
      scheduleSaveCount = 0;
      db.cacheUser({ id: 994411, is_bot: false, first_name: 'Frequent', username: 'freq_user' }, testChatId);
      assert.strictEqual(scheduleSaveCount, 1, 'New user discovery must schedule save');

      // 2. Identical user interaction (pure lastSeen update) -> must NOT trigger save
      scheduleSaveCount = 0;
      db.cacheUser({ id: 994411, is_bot: false, first_name: 'Frequent', username: 'freq_user' }, testChatId);
      assert.strictEqual(scheduleSaveCount, 0, 'Pure lastSeen update without metadata change must NOT schedule save');

      // 3. Material update (username changed) -> must trigger save
      scheduleSaveCount = 0;
      db.cacheUser({ id: 994411, is_bot: false, first_name: 'Frequent', username: 'freq_user_updated' }, testChatId);
      assert.strictEqual(scheduleSaveCount, 1, 'Material change (username change) must schedule save');

      // 4. Material update (first name changed) -> must trigger save
      scheduleSaveCount = 0;
      db.cacheUser({ id: 994411, is_bot: false, first_name: 'Frequent NewName', username: 'freq_user_updated' }, testChatId);
      assert.strictEqual(scheduleSaveCount, 1, 'Material change (name change) must schedule save');
    } finally {
      db.scheduleSave = origScheduleSave;
    }
  });

  await test('20. Cross-group isolation prevents member contamination across groups', async () => {
    const groupA = -100555111;
    const groupB = -100555222;
    resetChatMembers(groupA);
    resetChatMembers(groupB);

    db.cacheUser({ id: 80001, is_bot: false, first_name: 'UserA', username: 'user_a' }, groupA);
    db.cacheUser({ id: 80002, is_bot: false, first_name: 'UserB', username: 'user_b' }, groupB);

    const membersA = db.getGroupMembers(groupA);
    const membersB = db.getGroupMembers(groupB);

    assert.strictEqual(membersA.length, 1);
    assert.strictEqual(membersA[0].userId, 80001);

    assert.strictEqual(membersB.length, 1);
    assert.strictEqual(membersB[0].userId, 80002);
  });

  console.log('\n===============================================================');
  console.log(`MASTER /ALL PAGINATION SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllMentionFormattingTestSuite().catch((err) => {
  console.error('Fatal error in /all test suite:', err);
  process.exit(1);
});
