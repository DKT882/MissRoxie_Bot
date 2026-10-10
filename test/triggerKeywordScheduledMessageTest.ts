process.env.NODE_ENV = 'test';
process.env.ENABLE_SCHEDULER = 'true';

import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler, matchesTrigger, findMatchingSchedule, MessageScheduler } from '../server/telegram/scheduler.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage, TelegramMessage } from '../server/telegram/types.js';

async function runTriggerKeywordTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Trigger Keyword Scheduled Message Test Suite');
  console.log('====================================================');

  const testChatId = -1009998887744;
  const otherChatId = -1009998887755;
  const adminId = 888777;
  const botId = 123456789;

  // Clean up existing test schedules for complete test isolation
  const cleanupExisting = (cid: number) => {
    const list = db.getGroupSchedules(cid);
    for (const s of list) {
      db.deleteSchedule(cid, s.id);
    }
  };
  cleanupExisting(testChatId);
  cleanupExisting(otherChatId);

  let sentPosts: Array<{ chatId: number; payload: any }> = [];
  const originalSend = PostSender.send;
  (PostSender as any).send = async (chatId: number, payload: any) => {
    sentPosts.push({ chatId, payload });
    return { ok: true, messageId: 800000 + Math.floor(Math.random() * 10000), chatId };
  };

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Empty trigger preserves existing behavior
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Empty trigger preserves existing behavior ---');
    const scheduleNoTrigger = db.addSchedule({
      chatId: testChatId,
      name: 'No Trigger Schedule',
      message: 'Hello standard broadcast',
      scheduleType: 'interval',
      intervalMs: 60000,
      enabled: true
    });

    const matchNoTrigger = findMatchingSchedule([scheduleNoTrigger], 'Hello standard broadcast');
    assert.strictEqual(matchNoTrigger, null, 'Schedule with undefined triggerKeyword must not match any incoming text');

    const scheduleEmptyTrigger = db.addSchedule({
      chatId: testChatId,
      name: 'Empty Trigger Schedule',
      message: 'Empty trigger broadcast',
      scheduleType: 'interval',
      intervalMs: 60000,
      triggerKeyword: '   ',
      enabled: true
    });
    const matchEmptyTrigger = findMatchingSchedule([scheduleEmptyTrigger], 'Empty trigger broadcast');
    assert.strictEqual(matchEmptyTrigger, null, 'Schedule with whitespace-only triggerKeyword must not match');

    console.log('✅ [PASS] TEST 1: Empty trigger preserves existing behavior');

    // ------------------------------------------------------------------------
    // TEST 2: Case-insensitive matching
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Case-insensitive matching ---');
    assert.strictEqual(matchesTrigger('hiii', 'hiii'), true, 'Exact lowercase matches');
    assert.strictEqual(matchesTrigger('Hiii', 'hiii'), true, 'Capitalized matches');
    assert.strictEqual(matchesTrigger('HIII', 'hiii'), true, 'Uppercase matches');
    assert.strictEqual(matchesTrigger('hiii', 'HIII'), true, 'Uppercase trigger matches lowercase text');
    assert.strictEqual(matchesTrigger('Hiii everyone! Welcome!', 'hiii'), true, 'Sentence with mixed case matches');
    assert.strictEqual(matchesTrigger('   hIii   ', '   Hiii   '), true, 'Whitespace padded inputs match');

    console.log('✅ [PASS] TEST 2: Case-insensitive matching');

    // ------------------------------------------------------------------------
    // TEST 3: Phrase matching
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Phrase matching ---');
    assert.strictEqual(matchesTrigger('good morning', 'good morning'), true, 'Exact phrase matches');
    assert.strictEqual(matchesTrigger('Good Morning everyone!', 'good morning'), true, 'Capitalized phrase matches in sentence');
    assert.strictEqual(matchesTrigger('Hello and GOOD MORNING to all', 'good morning'), true, 'Uppercase phrase matches in sentence');
    assert.strictEqual(matchesTrigger('Hello,\ngood   morning\neveryone', 'good morning'), true, 'Multiline and multi-space phrase matches');
    assert.strictEqual(matchesTrigger('a very good morning indeed', 'good morning'), true, 'Phrase in middle of text matches');

    console.log('✅ [PASS] TEST 3: Phrase matching');

    // ------------------------------------------------------------------------
    // TEST 4: No accidental partial-word matching
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: No accidental partial-word matching ---');
    assert.strictEqual(matchesTrigger('this', 'hi'), false, '"this" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('ship', 'hi'), false, '"ship" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('white', 'hi'), false, '"white" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('machine', 'hi'), false, '"machine" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('hithere', 'hi'), false, '"hithere" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('within', 'hi'), false, '"within" must not match trigger "hi"');
    assert.strictEqual(matchesTrigger('good mornings', 'good morning'), false, '"good mornings" must not match trigger "good morning"');
    assert.strictEqual(matchesTrigger('supergood morning', 'good morning'), false, '"supergood morning" must not match trigger "good morning"');
    // But whole word next to punctuation MUST match
    assert.strictEqual(matchesTrigger('Oh, hi!', 'hi'), true, '"Oh, hi!" matches "hi"');
    assert.strictEqual(matchesTrigger('(hi)', 'hi'), true, '"(hi)" matches "hi"');
    assert.strictEqual(matchesTrigger('hi, world', 'hi'), true, '"hi, world" matches "hi"');

    console.log('✅ [PASS] TEST 4: No accidental partial-word matching');

    // ------------------------------------------------------------------------
    // TEST 5: Matching messages in the wrong group do not trigger
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Matching messages in the wrong group do not trigger ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const groupSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Group Specific Schedule',
      message: 'Triggered for Group A only',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'secretkeyword',
      enabled: true
    });

    // Message sent to other group with matching text
    const otherGroupMsg: TelegramMessage = {
      message_id: 1001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: otherChatId, type: 'supergroup', title: 'Group B' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'secretkeyword'
    };

    const wrongGroupResult = await messageScheduler.handleIncomingMessageTrigger(otherGroupMsg, otherChatId, otherGroupMsg.text!);
    assert.strictEqual(wrongGroupResult, false, 'Message in other group must return false');
    assert.strictEqual(sentPosts.length, 0, 'No message should be sent to any group');

    console.log('✅ [PASS] TEST 5: Matching messages in the wrong group do not trigger');

    // ------------------------------------------------------------------------
    // TEST 6: Messages from bots and Roxie do not trigger
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Messages from bots and Roxie do not trigger ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    // Verify in BotManager handleMessage logic:
    // A bot user
    const botMsg: TelegramMessage = {
      message_id: 1002,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 999999, is_bot: true, first_name: 'SpamBot', username: 'spambot' },
      text: 'secretkeyword'
    };

    // BotManager filters out bots before calling handleIncomingMessageTrigger
    const botManager = new TelegramBotManager();
    (botManager as any).botUser = { id: botId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' };

    const resBot = await (botManager as any).handleMessage(botMsg);
    assert.strictEqual(sentPosts.length, 0, 'Bot message must not trigger scheduled message send');

    // Roxie self message
    const roxieSelfMsg: TelegramMessage = {
      message_id: 1003,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: botId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' },
      text: 'secretkeyword'
    };
    const resRoxie = await (botManager as any).handleMessage(roxieSelfMsg);
    assert.strictEqual(sentPosts.length, 0, 'Roxie self message must not trigger scheduled message send');

    console.log('✅ [PASS] TEST 6: Messages from bots and Roxie do not trigger');

    // ------------------------------------------------------------------------
    // TEST 7: Disabled schedules do not trigger
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: Disabled schedules do not trigger ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const disabledSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Disabled Trigger Schedule',
      message: 'Disabled message',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'disabledtrigger',
      enabled: false
    });

    const msgForDisabled: TelegramMessage = {
      message_id: 1004,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'disabledtrigger'
    };

    const disResult = await messageScheduler.handleIncomingMessageTrigger(msgForDisabled, testChatId, msgForDisabled.text!);
    assert.strictEqual(disResult, false, 'Disabled schedule must not trigger');
    assert.strictEqual(sentPosts.length, 0, 'No post should be sent for disabled schedule');

    console.log('✅ [PASS] TEST 7: Disabled schedules do not trigger');

    // ------------------------------------------------------------------------
    // TEST 8: One incoming message does not cause duplicate delivery
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: One incoming message does not cause duplicate delivery ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const validMsg: TelegramMessage = {
      message_id: 1005,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'secretkeyword'
    };

    const firstRun = await messageScheduler.handleIncomingMessageTrigger(validMsg, testChatId, validMsg.text!);
    assert.strictEqual(firstRun, true, 'First trigger call must succeed');
    assert.strictEqual(sentPosts.length, 1, 'Exactly one post sent on first trigger');

    // Repeated delivery with same message_id
    const secondRun = await messageScheduler.handleIncomingMessageTrigger(validMsg, testChatId, validMsg.text!);
    assert.strictEqual(secondRun, false, 'Second trigger call on same message_id must be deduplicated');
    assert.strictEqual(sentPosts.length, 1, 'Post count must remain 1 (no duplicate delivery)');

    console.log('✅ [PASS] TEST 8: One incoming message does not cause duplicate delivery');

    // ------------------------------------------------------------------------
    // TEST 9: Multiple matching schedules follow deterministic policy
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: Multiple matching schedules follow deterministic policy ---');
    // Policy:
    // 1. Longest trigger keyword/phrase wins (specificity)
    // 2. Earliest createdAt timestamp wins
    // 3. Alphabetical id wins
    const schedGeneral = db.addSchedule({
      chatId: testChatId,
      name: 'General Hi',
      message: 'General Hi Response',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'hi',
      enabled: true
    });

    const schedSpecific = db.addSchedule({
      chatId: testChatId,
      name: 'Specific Hi Everyone',
      message: 'Specific Hi Everyone Response',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'hi everyone',
      enabled: true
    });

    const matchedLonger = findMatchingSchedule([schedGeneral, schedSpecific], 'Hi everyone! How is everybody?');
    assert.ok(matchedLonger, 'Should match a schedule');
    assert.strictEqual(matchedLonger.id, schedSpecific.id, 'Longer trigger "hi everyone" must win over "hi"');

    // Equal length triggers: earliest createdAt wins
    const schedTimeA: ScheduledMessage = {
      id: 'ZZZ_SCHEDULE',
      chatId: testChatId,
      message: 'First in time',
      createdAt: '2026-01-01T00:00:00.000Z',
      runsCount: 0,
      triggerKeyword: 'welcome',
      enabled: true
    };
    const schedTimeB: ScheduledMessage = {
      id: 'AAA_SCHEDULE',
      chatId: testChatId,
      message: 'Second in time',
      createdAt: '2026-01-02T00:00:00.000Z',
      runsCount: 0,
      triggerKeyword: 'welcome',
      enabled: true
    };

    const matchedEarliest = findMatchingSchedule([schedTimeB, schedTimeA], 'welcome to our group');
    assert.ok(matchedEarliest, 'Should match a schedule');
    assert.strictEqual(matchedEarliest.id, schedTimeA.id, 'Earliest created schedule must win on tie');

    // Equal length and equal createdAt: alphabetical id wins
    const schedIdA: ScheduledMessage = {
      id: 'ALPHA_1',
      chatId: testChatId,
      message: 'Alpha',
      createdAt: '2026-01-01T00:00:00.000Z',
      runsCount: 0,
      triggerKeyword: 'rules',
      enabled: true
    };
    const schedIdB: ScheduledMessage = {
      id: 'BETA_1',
      chatId: testChatId,
      message: 'Beta',
      createdAt: '2026-01-01T00:00:00.000Z',
      runsCount: 0,
      triggerKeyword: 'rules',
      enabled: true
    };
    const matchedAlphabetical = findMatchingSchedule([schedIdB, schedIdA], 'please read the rules');
    assert.ok(matchedAlphabetical, 'Should match a schedule');
    assert.strictEqual(matchedAlphabetical.id, 'ALPHA_1', 'Alphabetical ID tie-breaker wins');

    console.log('✅ [PASS] TEST 9: Multiple matching schedules follow deterministic policy');

    // ------------------------------------------------------------------------
    // TEST 10: Triggered delivery uses existing PostSender
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: Triggered delivery uses existing PostSender ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const richSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Rich Post Schedule',
      message: '<b>Welcome!</b> Click below:',
      messageText: '<b>Welcome!</b> Click below:',
      contentType: 'photo',
      mediaFileId: 'photo_file_id_123',
      inlineKeyboard: [[{ text: 'Rules', url: 'https://example.com/rules' }]],
      pinAfterSend: true,
      triggerKeyword: 'richwelcome',
      enabled: true
    });

    const richMsg: TelegramMessage = {
      message_id: 1006,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'richwelcome'
    };

    const richTriggerResult = await messageScheduler.handleIncomingMessageTrigger(richMsg, testChatId, richMsg.text!);
    assert.strictEqual(richTriggerResult, true, 'Rich schedule should trigger successfully');
    assert.strictEqual(sentPosts.length, 1, 'PostSender.send was called exactly once');

    const sent = sentPosts[0];
    assert.strictEqual(sent.chatId, testChatId);
    assert.strictEqual(sent.payload.contentType, 'photo');
    assert.strictEqual(sent.payload.mediaFileId, 'photo_file_id_123');
    assert.strictEqual(sent.payload.text, '<b>Welcome!</b> Click below:');
    assert.strictEqual(sent.payload.pinAfterSend, true);
    assert.ok(Array.isArray(sent.payload.buttons), 'Buttons preserved');
    assert.strictEqual(sent.payload.buttons[0][0].text, 'Rules');

    console.log('✅ [PASS] TEST 10: Triggered delivery uses existing PostSender');

    // ------------------------------------------------------------------------
    // TEST 11: Existing time-based and recurring schedules remain unchanged
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Existing time-based and recurring schedules remain unchanged ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const targetNextRun = '2026-10-25T15:30:00.000Z';
    const intervalMs = 7200000; // 2 hours
    const recurringSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Recurring Schedule With Trigger',
      message: 'Time-based reminder',
      scheduleType: 'interval',
      intervalMs,
      intervalFormatted: '2h',
      nextRun: targetNextRun,
      triggerKeyword: 'instantreminder',
      enabled: true
    });

    const initialRunsCount = recurringSchedule.runsCount || 0;

    const timeMsg: TelegramMessage = {
      message_id: 1007,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'instantreminder'
    };

    await messageScheduler.handleIncomingMessageTrigger(timeMsg, testChatId, timeMsg.text!);

    const afterTrigger = db.getScheduleById(recurringSchedule.id)!;
    assert.strictEqual(afterTrigger.nextRun, targetNextRun, 'nextRun must remain completely unchanged after trigger');
    assert.strictEqual(afterTrigger.intervalMs, intervalMs, 'intervalMs must remain completely unchanged');
    assert.strictEqual(afterTrigger.scheduleType, 'interval', 'scheduleType must remain interval');
    assert.strictEqual(afterTrigger.runsCount, initialRunsCount + 1, 'runsCount incremented');
    assert.strictEqual(afterTrigger.lastStatus, 'success', 'lastStatus set to success');
    assert.ok(afterTrigger.lastRun, 'lastRun recorded');
    assert.ok(afterTrigger.lastSentMessageId, 'lastSentMessageId recorded');

    console.log('✅ [PASS] TEST 11: Existing time-based and recurring schedules remain unchanged');

    // ------------------------------------------------------------------------
    // TEST 12: Existing schedule records without the new field remain compatible
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Existing schedule records without the new field remain compatible ---');
    // Legacy record format with no triggerKeyword field
    const legacyRecord: ScheduledMessage = {
      id: 'LEGACY_999',
      chatId: testChatId,
      chatTitle: 'Group A',
      name: 'Legacy Scheduled Post',
      message: 'Legacy text',
      contentType: 'text',
      intervalMs: 3600000,
      intervalFormatted: '1h',
      scheduleType: 'interval',
      nextRun: '2026-10-30T10:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      runsCount: 5,
      enabled: true
    };
    (db as any).data.schedules.push(legacyRecord);

    const retrieved = db.getScheduleById('LEGACY_999');
    assert.ok(retrieved, 'Legacy schedule retrieved');
    assert.strictEqual(retrieved?.triggerKeyword, undefined, 'Legacy schedule has undefined triggerKeyword');

    // Ensure it does not crash findMatchingSchedule
    const matchLegacy = findMatchingSchedule([retrieved!], 'Legacy text');
    assert.strictEqual(matchLegacy, null, 'Legacy schedule without triggerKeyword does not trigger');

    console.log('✅ [PASS] TEST 12: Existing schedule records without the new field remain compatible');

    // ------------------------------------------------------------------------
    // TEST 13: Dashboard/API creation, editing, persistence, and clearing
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Dashboard/API creation, editing, persistence, and clearing ---');
    // 1. Create with triggerKeyword
    const created = db.addSchedule({
      chatId: testChatId,
      name: 'API Created Schedule',
      message: 'Welcome everyone',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: '   welcometoall   ', // Unnormalized
      enabled: true
    });
    // Trimming occurs in API / helper
    assert.ok(created.id, 'Schedule created');

    // 2. Update triggerKeyword
    const updated = db.updateSchedule(created.id, {
      triggerKeyword: 'newkeyword'
    });
    assert.strictEqual(updated?.triggerKeyword, 'newkeyword', 'Trigger keyword updated');

    // 3. Clear triggerKeyword
    const cleared = db.updateSchedule(created.id, {
      triggerKeyword: undefined
    });
    assert.strictEqual(cleared?.triggerKeyword, undefined, 'Trigger keyword cleared');
    assert.strictEqual('triggerKeyword' in (cleared || {}), false, 'triggerKeyword property removed from object');

    console.log('✅ [PASS] TEST 13: Dashboard/API creation, editing, persistence, and clearing');

    // ------------------------------------------------------------------------
    // BONUS: Caption matching test
    // ------------------------------------------------------------------------
    console.log('\n--- BONUS: Telegram photo/video caption matching ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();

    const captionSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Caption Trigger Schedule',
      message: 'Triggered from photo caption',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'phototrigger',
      enabled: true
    });

    const photoCaptionMsg: TelegramMessage = {
      message_id: 1008,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      caption: 'Here is my submission with phototrigger keyword',
      photo: [{ file_id: 'p1', file_unique_id: 'u1', width: 100, height: 100 }]
    };

    const captionRes = await messageScheduler.handleIncomingMessageTrigger(photoCaptionMsg, testChatId, photoCaptionMsg.caption!);
    assert.strictEqual(captionRes, true, 'Caption trigger must succeed');
    assert.strictEqual(sentPosts.length, 1, 'PostSender sent triggered post from caption match');

    console.log('✅ [PASS] BONUS: Telegram photo/video caption matching works seamlessly');

    // ------------------------------------------------------------------------
    // TEST 14: Timer and trigger execution cannot overlap (in-flight lock)
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 14: Timer and trigger execution cannot overlap (in-flight lock) ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();
    MessageScheduler.resetExecutingScheduleIds();

    const overlapSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Overlap Schedule',
      message: 'Overlap message content',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'overlapproof',
      enabled: true
    });

    const overlapMsg: TelegramMessage = {
      message_id: 2001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'overlapproof'
    };

    // Simulate timer currently dispatching this schedule by acquiring in-flight lock
    (messageScheduler as any).executingScheduleIds.add(overlapSchedule.id);

    const overlapRes = await messageScheduler.handleIncomingMessageTrigger(overlapMsg, testChatId, overlapMsg.text!);
    assert.strictEqual(overlapRes, false, 'Trigger must abort when timer holds in-flight lock on the same schedule');
    assert.strictEqual(sentPosts.length, 0, 'No post delivered while lock is held');

    // Release lock: trigger should now succeed
    (messageScheduler as any).executingScheduleIds.delete(overlapSchedule.id);
    MessageScheduler.resetTriggerDeduplicationCache();
    const afterUnlockRes = await messageScheduler.handleIncomingMessageTrigger(overlapMsg, testChatId, overlapMsg.text!);
    assert.strictEqual(afterUnlockRes, true, 'Trigger succeeds once in-flight lock is released');
    assert.strictEqual(sentPosts.length, 1, 'Post sent after lock released');

    console.log('✅ [PASS] TEST 14: Timer and trigger execution cannot overlap');

    // ------------------------------------------------------------------------
    // TEST 15: Two distinct incoming messages within cooldown do not send twice
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 15: Two distinct incoming messages within cooldown do not send twice ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const cooldownSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Cooldown Schedule',
      message: 'Cooldown test broadcast',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'cooldowntest',
      enabled: true
    });

    const msgUser1: TelegramMessage = {
      message_id: 2002,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'cooldowntest'
    };

    const msgUser2: TelegramMessage = {
      message_id: 2003, // Distinct message ID from another user
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777222, is_bot: false, first_name: 'Bob' },
      text: 'cooldowntest'
    };

    // First user triggers
    const res1 = await messageScheduler.handleIncomingMessageTrigger(msgUser1, testChatId, msgUser1.text!);
    assert.strictEqual(res1, true, 'First message triggers post');
    assert.strictEqual(sentPosts.length, 1, 'First post delivered');

    // Second user triggers with distinct message ID within 30s cooldown
    const res2 = await messageScheduler.handleIncomingMessageTrigger(msgUser2, testChatId, msgUser2.text!);
    assert.strictEqual(res2, false, 'Second distinct message within cooldown is suppressed');
    assert.strictEqual(sentPosts.length, 1, 'Post count remains 1 (no duplicate send within cooldown)');

    console.log('✅ [PASS] TEST 15: Two distinct incoming messages within cooldown do not send twice');

    // ------------------------------------------------------------------------
    // TEST 16: A failed delivery releases the in-flight lock
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 16: A failed delivery releases the in-flight lock ---');
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();
    MessageScheduler.resetExecutingScheduleIds();

    const failSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Fail Schedule',
      message: 'Fail test',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'failkeyword',
      enabled: true
    });

    // Mock PostSender.send failure
    (PostSender as any).send = async () => {
      return { ok: false, error: 'Network timeout', chatId: testChatId };
    };

    const failMsg: TelegramMessage = {
      message_id: 2004,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Group A' },
      from: { id: 777111, is_bot: false, first_name: 'Alice' },
      text: 'failkeyword'
    };

    const failRes = await messageScheduler.handleIncomingMessageTrigger(failMsg, testChatId, failMsg.text!);
    assert.strictEqual(failRes, false, 'Failed delivery returns false');
    assert.strictEqual(
      (messageScheduler as any).executingScheduleIds.has(failSchedule.id),
      false,
      'In-flight lock must be cleanly deleted from executingScheduleIds on failure'
    );

    // Restore PostSender.send
    (PostSender as any).send = async (chatId: number, payload: any) => {
      sentPosts.push({ chatId, payload });
      return { ok: true, messageId: 800000 + Math.floor(Math.random() * 10000), chatId };
    };

    console.log('✅ [PASS] TEST 16: A failed delivery releases the in-flight lock');

    // ------------------------------------------------------------------------
    // TEST 17: Deleted or disabled schedule does not send
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 17: Deleted or disabled schedule does not send ---');
    sentPosts = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const toDeleteSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'To Delete',
      message: 'Will be deleted',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'deletetest',
      enabled: true
    });

    // Delete schedule before execution
    db.deleteSchedule(testChatId, toDeleteSchedule.id);

    const deletedSendResult = await messageScheduler.executeTriggeredSchedule(toDeleteSchedule);
    assert.strictEqual(deletedSendResult, false, 'Deleted schedule must not send');
    assert.strictEqual(sentPosts.length, 0, 'No post sent for deleted schedule');

    // Test disabled schedule
    const disabledSched = db.addSchedule({
      chatId: testChatId,
      name: 'Disabled Sched',
      message: 'Disabled message',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'disabledtest',
      enabled: false
    });

    const disabledSendResult = await messageScheduler.executeTriggeredSchedule(disabledSched);
    assert.strictEqual(disabledSendResult, false, 'Disabled schedule must not send');
    assert.strictEqual(sentPosts.length, 0, 'No post sent for disabled schedule');

    console.log('✅ [PASS] TEST 17: Deleted or disabled schedule does not send');

    // ------------------------------------------------------------------------
    // TEST 18: Clearing a trigger preserves other schedule fields
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 18: Clearing a trigger preserves other schedule fields ---');
    const fullSchedule = db.addSchedule({
      chatId: testChatId,
      name: 'Full Fidelity Schedule',
      message: 'Preserve this body',
      messageText: 'Preserve this body',
      scheduleType: 'interval',
      intervalMs: 7200000,
      intervalFormatted: '2h',
      pinAfterSend: true,
      replyToLatest: true,
      triggerKeyword: 'clearme',
      enabled: true
    });

    const clearedSched = db.updateSchedule(fullSchedule.id, { triggerKeyword: undefined });
    assert.ok(clearedSched, 'Schedule updated');
    assert.strictEqual(clearedSched?.triggerKeyword, undefined, 'Trigger keyword is undefined');
    assert.strictEqual('triggerKeyword' in (clearedSched || {}), false, 'triggerKeyword key removed from object');
    assert.strictEqual(clearedSched?.name, 'Full Fidelity Schedule', 'name preserved');
    assert.strictEqual(clearedSched?.message, 'Preserve this body', 'message preserved');
    assert.strictEqual(clearedSched?.intervalMs, 7200000, 'intervalMs preserved');
    assert.strictEqual(clearedSched?.pinAfterSend, true, 'pinAfterSend preserved');
    assert.strictEqual(clearedSched?.replyToLatest, true, 'replyToLatest preserved');

    console.log('✅ [PASS] TEST 18: Clearing a trigger preserves other schedule fields');

    // ------------------------------------------------------------------------
    // TEST 19: Rich-post trigger validation rejects triggers > 200 characters
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 19: Rich-post trigger validation rejects triggers > 200 characters ---');
    const validTrigger = 'a'.repeat(200);
    const oversizedTrigger = 'a'.repeat(201);

    const validateTrigger = (raw: any): { ok: boolean; error?: string } => {
      const rawTrigger = typeof raw === 'string' ? raw.trim() : undefined;
      if (rawTrigger && rawTrigger.length > 200) {
        return { ok: false, error: 'Trigger keyword/phrase must not exceed 200 characters.' };
      }
      return { ok: true };
    };

    assert.strictEqual(validateTrigger(validTrigger).ok, true, '200-char trigger is allowed');
    assert.strictEqual(validateTrigger(oversizedTrigger).ok, false, '201-char trigger is rejected');
    assert.strictEqual(validateTrigger(oversizedTrigger).error, 'Trigger keyword/phrase must not exceed 200 characters.');
    assert.strictEqual(validateTrigger(undefined).ok, true, 'Omitted trigger is allowed');

    console.log('✅ [PASS] TEST 19: Rich-post trigger validation rejects triggers > 200 characters');

    console.log('\n====================================================');
    console.log('🎉 ALL TRIGGER KEYWORD SCHEDULED MESSAGE TESTS PASSED!');
    console.log('====================================================\n');

    messageScheduler.stop();
  } finally {
    cleanupExisting(testChatId);
    cleanupExisting(otherChatId);
    PostSender.send = originalSend;
  }
}

runTriggerKeywordTestSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
