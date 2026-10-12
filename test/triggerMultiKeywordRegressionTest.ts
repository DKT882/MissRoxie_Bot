import assert from 'assert';
import http from 'http';
import { db } from '../server/db/storage.js';
import { authManager } from '../server/auth/authManager.js';
import { telegramApi } from '../server/telegram/api.js';
import {
  messageScheduler,
  MessageScheduler,
  matchesTrigger,
  findMatchingSchedule,
  parseTriggerPhrases,
  normalizeTriggerKeyword,
  getLongestMatchingPhrase
} from '../server/telegram/scheduler.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ScheduledMessage, TelegramMessage } from '../server/telegram/types.js';

process.env.PORT = '9915';
process.env.NODE_ENV = 'production';
process.env.ROXIE_TEST_MODE = 'false';
process.env.ENABLE_SCHEDULER = 'true';
process.env.DASHBOARD_ADMIN_PASSWORD = 'TestPassword123!';
process.env.DASHBOARD_SESSION_SECRET = 'TestSessionSecret1234567890!';
authManager.reloadConfig();

let passed = 0;
let failed = 0;

function pass(msg: string) {
  console.log(`✅ [PASS] ${msg}`);
  passed++;
}

function fail(msg: string, err?: any) {
  console.error(`❌ [FAIL] ${msg}`, err || '');
  failed++;
}

function apiRequest(
  method: string,
  urlPath: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload !== undefined) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(payload));
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port: 9915,
      path: urlPath,
      method,
      headers: reqHeaders
    }, (res) => {
      let resBody = '';
      res.on('data', chunk => resBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(resBody), headers: res.headers });
        } catch {
          resolve({ status: res.statusCode || 0, data: resBody, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Starting Multi-Phrase Trigger Keyword Regression Test Suite');
  console.log('================================================================');

  const { startServer } = await import('../server.js');
  await startServer();
  console.log('✅ Server listening on port 9915');

  authManager.createOperator({
    username: 'op_moderator_multi',
    name: 'Test Moderator Multi',
    password: 'ModeratorPassword123!',
    role: 'MODERATOR'
  });
  const modAuth = authManager.authenticate('op_moderator_multi', 'ModeratorPassword123!');
  const modSessionId = modAuth.session!.sessionId;
  const modHeaders = { 'x-session-id': modSessionId };

  const testChatA = -100999666111;
  const testChatB = -100999666222;

  // Mock Telegram API deliveries & deletions
  let sentMessages: Array<{ chatId: number; text?: string; caption?: string; options?: any }> = [];
  let nextMessageId = 7000;

  const originalSendMessage = (telegramApi as any).sendMessage;
  const originalSendPhoto = (telegramApi as any).sendPhoto;

  const handleMockSend = (chatId: number, text?: string, caption?: string, options?: any) => {
    const msgId = ++nextMessageId;
    if (chatId === testChatA || chatId === testChatB) {
      sentMessages.push({ chatId, text, caption, options });
    }
    return {
      ok: true,
      result: {
        message_id: msgId,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    return handleMockSend(chatId, text, undefined, options);
  };
  (telegramApi as any).sendPhoto = async (chatId: number, photo: any, options?: any) => {
    return handleMockSend(chatId, undefined, options?.caption, options);
  };

  const cleanup = (chatId: number) => {
    const list = db.getGroupSchedules(chatId);
    for (const s of list) {
      db.deleteSchedule(chatId, s.id);
    }
  };
  cleanup(testChatA);
  cleanup(testChatB);

  try {
    // ------------------------------------------------------------------------
    // TEST 1: Unit matching - parseTriggerPhrases & normalizeTriggerKeyword
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 1: Unit matching - parseTriggerPhrases & normalizeTriggerKeyword ---');
    const parsedPhrases = parseTriggerPhrases('  hii , , good morning ,, rules, help me ,  ');
    assert.deepStrictEqual(parsedPhrases, ['hii', 'good morning', 'rules', 'help me']);

    const normalized = normalizeTriggerKeyword('  hii , , good morning ,, rules, help me ,  ');
    assert.strictEqual(normalized, 'hii, good morning, rules, help me');

    assert.strictEqual(normalizeTriggerKeyword('   '), undefined);
    assert.strictEqual(normalizeTriggerKeyword(',,,'), undefined);
    assert.strictEqual(normalizeTriggerKeyword(null), undefined);
    pass('TEST 1: parseTriggerPhrases and normalizeTriggerKeyword behave correctly');

    // ------------------------------------------------------------------------
    // TEST 2: Single trigger phrase works
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 2: Single trigger phrase works ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const schedSingle = db.addSchedule({
      chatId: testChatA,
      name: 'Single Trigger',
      message: 'Single phrase response',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'rules',
      enabled: true
    });

    const singleMsg: TelegramMessage = {
      message_id: 8001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 111, is_bot: false, first_name: 'Alice' },
      text: 'Can someone show me the rules please?'
    };

    const singleTriggered = await messageScheduler.handleIncomingMessageTrigger(singleMsg, testChatA, singleMsg.text!);
    assert.strictEqual(singleTriggered, true, 'Single keyword schedule must trigger');
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Single phrase response');
    pass('TEST 2: A single trigger phrase works');

    // ------------------------------------------------------------------------
    // TEST 3: Multiple comma-separated phrases each work independently
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 3: Multiple comma-separated phrases each work independently ---');
    cleanup(testChatA);
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const schedMulti = db.addSchedule({
      chatId: testChatA,
      name: 'Multi Trigger Post',
      message: 'Multi phrase greeting',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'hii, good morning, rules, help me',
      enabled: true
    });

    const testPhrases = ['hii', 'good morning', 'rules', 'help me'];
    for (let i = 0; i < testPhrases.length; i++) {
      MessageScheduler.resetTriggerCooldownCache();
      const p = testPhrases[i];
      const testMsg: TelegramMessage = {
        message_id: 8100 + i,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup' },
        from: { id: 111 + i, is_bot: false, first_name: `User ${i}` },
        text: `Hey everyone, ${p}! Hope all is well.`
      };
      const res = await messageScheduler.handleIncomingMessageTrigger(testMsg, testChatA, testMsg.text!);
      assert.strictEqual(res, true, `Phrase "${p}" must trigger the schedule`);
      assert.strictEqual(sentMessages.length, i + 1);
    }
    pass('TEST 3: Multiple comma-separated phrases each work independently');

    // ------------------------------------------------------------------------
    // TEST 4: Matching is case-insensitive
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 4: Matching is case-insensitive ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const caseVariations = ['HII everyone', 'GOOD MORNING to all', 'Please obey the RULES', 'Can somebody HELP ME?'];
    for (let i = 0; i < caseVariations.length; i++) {
      MessageScheduler.resetTriggerCooldownCache();
      const cMsg: TelegramMessage = {
        message_id: 8200 + i,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup' },
        from: { id: 200 + i, is_bot: false, first_name: `User ${i}` },
        text: caseVariations[i]
      };
      const res = await messageScheduler.handleIncomingMessageTrigger(cMsg, testChatA, cMsg.text!);
      assert.strictEqual(res, true, `Case variation "${caseVariations[i]}" must trigger`);
    }
    pass('TEST 4: Matching is case-insensitive');

    // ------------------------------------------------------------------------
    // TEST 5: Leading/trailing whitespace and empty comma-separated entries
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 5: Leading/trailing whitespace and empty comma-separated entries ---');
    cleanup(testChatA);
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const schedMessy = db.addSchedule({
      chatId: testChatA,
      name: 'Messy Comma Trigger',
      message: 'Messy commas response',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: ' ,  hii , , good morning ,, rules, help me ,  ',
      enabled: true
    });

    const messyMsg: TelegramMessage = {
      message_id: 8301,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 301, is_bot: false, first_name: 'MessyUser' },
      text: 'Oh hii guys'
    };
    const messyRes = await messageScheduler.handleIncomingMessageTrigger(messyMsg, testChatA, messyMsg.text!);
    assert.strictEqual(messyRes, true, 'Messy commas trigger must trigger successfully');
    pass('TEST 5: Leading/trailing whitespace and empty comma-separated entries are handled');

    // ------------------------------------------------------------------------
    // TEST 6: Whole-word matching prevents partial-word false positives
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 6: Whole-word matching prevents partial-word false positives ---');
    assert.strictEqual(matchesTrigger('this is something', 'hi'), false);
    assert.strictEqual(matchesTrigger('ship captain', 'hi'), false);
    assert.strictEqual(matchesTrigger('good mornings to all', 'good morning'), false);
    assert.strictEqual(matchesTrigger('supergood morning', 'good morning'), false);
    assert.strictEqual(matchesTrigger('he was overruled', 'rules'), false);
    assert.strictEqual(matchesTrigger('whelped me out', 'help me'), false);
    assert.strictEqual(matchesTrigger('help men now', 'help me'), false);

    // But whole word adjacent to punctuation matches
    assert.strictEqual(matchesTrigger('Oh, hii!', 'hii, good morning'), true);
    assert.strictEqual(matchesTrigger('(rules)', 'rules'), true);
    assert.strictEqual(matchesTrigger('help me, please', 'help me'), true);
    pass('TEST 6: Whole-word matching prevents partial-word false positives');

    // ------------------------------------------------------------------------
    // TEST 7: A message matching multiple phrases dispatches only once
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 7: A message matching multiple phrases dispatches only once ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const multiMatchMsg: TelegramMessage = {
      message_id: 8401,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 401, is_bot: false, first_name: 'MultiMatcher' },
      text: 'hii everyone! good morning, please read the rules to help me!'
    };
    const multiMatchRes = await messageScheduler.handleIncomingMessageTrigger(multiMatchMsg, testChatA, multiMatchMsg.text!);
    assert.strictEqual(multiMatchRes, true);
    assert.strictEqual(sentMessages.length, 1, 'Incoming text with all phrases must only trigger 1 broadcast');
    pass('TEST 7: A message matching multiple phrases dispatches only once per schedule');

    // ------------------------------------------------------------------------
    // TEST 8: Unrelated messages do not trigger the schedule
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 8: Unrelated messages do not trigger the schedule ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const unrelatedMsg: TelegramMessage = {
      message_id: 8501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 501, is_bot: false, first_name: 'UnrelatedUser' },
      text: 'What is the stock price of Apple today?'
    };
    const unrelatedRes = await messageScheduler.handleIncomingMessageTrigger(unrelatedMsg, testChatA, unrelatedMsg.text!);
    assert.strictEqual(unrelatedRes, false);
    assert.strictEqual(sentMessages.length, 0);
    pass('TEST 8: Unrelated messages do not trigger the schedule');

    // ------------------------------------------------------------------------
    // TEST 9: A disabled schedule does not trigger
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 9: A disabled schedule does not trigger ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    db.updateSchedule(schedMessy.id, { enabled: false });

    const disabledMsg: TelegramMessage = {
      message_id: 8601,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 601, is_bot: false, first_name: 'DisabledTestUser' },
      text: 'hii everyone'
    };
    const disRes = await messageScheduler.handleIncomingMessageTrigger(disabledMsg, testChatA, disabledMsg.text!);
    assert.strictEqual(disRes, false);
    assert.strictEqual(sentMessages.length, 0);
    db.updateSchedule(schedMessy.id, { enabled: true });
    pass('TEST 9: A disabled schedule does not trigger');

    // ------------------------------------------------------------------------
    // TEST 10: The trigger cannot run in a different group
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 10: The trigger cannot run in a different group ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const diffGroupMsg: TelegramMessage = {
      message_id: 8701,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatB, type: 'supergroup' },
      from: { id: 701, is_bot: false, first_name: 'OtherGroupUser' },
      text: 'good morning group B'
    };
    const diffGroupRes = await messageScheduler.handleIncomingMessageTrigger(diffGroupMsg, testChatB, diffGroupMsg.text!);
    assert.strictEqual(diffGroupRes, false, 'Schedule in Chat A must not fire in Chat B');
    assert.strictEqual(sentMessages.length, 0);
    pass('TEST 10: The trigger cannot run in a different group');

    // ------------------------------------------------------------------------
    // TEST 11: Cooldown and execution locks prevent duplicate sends
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 11: Cooldown and execution locks prevent duplicate sends ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    const msgFirst: TelegramMessage = {
      message_id: 8801,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 801, is_bot: false, first_name: 'FirstUser' },
      text: 'rules please'
    };
    const resFirst = await messageScheduler.handleIncomingMessageTrigger(msgFirst, testChatA, msgFirst.text!);
    assert.strictEqual(resFirst, true);
    assert.strictEqual(sentMessages.length, 1);

    const msgSecond: TelegramMessage = {
      message_id: 8802,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 802, is_bot: false, first_name: 'SecondUser' },
      text: 'rules please again'
    };
    const resSecond = await messageScheduler.handleIncomingMessageTrigger(msgSecond, testChatA, msgSecond.text!);
    assert.strictEqual(resSecond, false, 'Second message within 30s cooldown must be skipped');
    assert.strictEqual(sentMessages.length, 1);
    pass('TEST 11: Cooldown and execution locks prevent duplicate sends');

    // ------------------------------------------------------------------------
    // TEST 12: Timer-based scheduling still works when triggers are blank
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 12: Timer-based scheduling still works when triggers are blank ---');
    cleanup(testChatA);
    sentMessages = [];

    const blankTriggerSched = db.addSchedule({
      chatId: testChatA,
      name: 'Time Only Schedule',
      message: 'Time only message',
      scheduleType: 'interval',
      intervalMs: 60000,
      nextRun: new Date(Date.now() - 5000).toISOString(),
      enabled: true
    });

    assert.strictEqual(blankTriggerSched.triggerKeyword, undefined);
    const noMatch = findMatchingSchedule([blankTriggerSched], 'any random message');
    assert.strictEqual(noMatch, null);

    // Execute timer check
    await (messageScheduler as any).checkAndExecuteSchedules();
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].text, 'Time only message');
    pass('TEST 12: Timer-based scheduling still works when triggers are blank');

    // ------------------------------------------------------------------------
    // TEST 13: Editing trigger phrases replaces old set, and clearing disables trigger
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 13: Editing trigger phrases replaces old set, and clearing disables trigger ---');
    cleanup(testChatA);
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    // Create via API
    const createRes = await apiRequest('POST', '/api/dashboard/schedules', {
      chatId: testChatA,
      name: 'Editable Trigger Schedule',
      message: 'Original Message Content',
      scheduleType: 'interval',
      intervalFormatted: '1h',
      triggerKeyword: 'hii, good morning'
    }, modHeaders);

    assert.strictEqual(createRes.status, 200);
    const schedId = createRes.data.schedule.id;
    assert.strictEqual(createRes.data.schedule.triggerKeyword, 'hii, good morning');

    // Edit trigger phrases via PUT
    const updateRes = await apiRequest('PUT', `/api/dashboard/schedules/${schedId}`, {
      triggerKeyword: 'rules, help me'
    }, modHeaders);

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.schedule.triggerKeyword, 'rules, help me');

    // Old phrase no longer matches
    const oldMsg: TelegramMessage = {
      message_id: 8901,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 901, is_bot: false, first_name: 'OldTester' },
      text: 'hii everyone'
    };
    const oldRes = await messageScheduler.handleIncomingMessageTrigger(oldMsg, testChatA, oldMsg.text!);
    assert.strictEqual(oldRes, false, 'Old phrase "hii" must no longer trigger');

    // New phrase matches
    const newMsg: TelegramMessage = {
      message_id: 8902,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 902, is_bot: false, first_name: 'NewTester' },
      text: 'please help me now'
    };
    const newRes = await messageScheduler.handleIncomingMessageTrigger(newMsg, testChatA, newMsg.text!);
    assert.strictEqual(newRes, true, 'New phrase "help me" must trigger');
    assert.strictEqual(sentMessages.length, 1);

    // Clear trigger keyword via PUT with null
    const clearRes = await apiRequest('PUT', `/api/dashboard/schedules/${schedId}`, {
      triggerKeyword: null
    }, modHeaders);

    assert.strictEqual(clearRes.status, 200);
    assert.strictEqual(clearRes.data.schedule.triggerKeyword, undefined);

    MessageScheduler.resetTriggerCooldownCache();
    const clearMsg: TelegramMessage = {
      message_id: 8903,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 903, is_bot: false, first_name: 'ClearTester' },
      text: 'help me now'
    };
    const clearTriggerRes = await messageScheduler.handleIncomingMessageTrigger(clearMsg, testChatA, clearMsg.text!);
    assert.strictEqual(clearTriggerRes, false, 'Cleared trigger schedule must not fire on any message');
    pass('TEST 13: Editing trigger phrases replaces old set, and clearing disables trigger');

    // ------------------------------------------------------------------------
    // TEST 14: Trigger execution uses latest edited message content and target chat
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 14: Trigger execution uses latest edited content and target chat ---');
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    // Re-enable trigger with new content & route to chat B
    const routeRes = await apiRequest('PUT', `/api/dashboard/schedules/${schedId}`, {
      chatId: testChatB,
      message: 'Brand New Post for Chat B',
      triggerKeyword: 'launch_now'
    }, modHeaders);

    assert.strictEqual(routeRes.status, 200);
    assert.strictEqual(routeRes.data.schedule.chatId, testChatB);

    const chatBMsg: TelegramMessage = {
      message_id: 8950,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatB, type: 'supergroup' },
      from: { id: 950, is_bot: false, first_name: 'ChatBTester' },
      text: 'Attention everyone: launch_now'
    };
    const chatBRes = await messageScheduler.handleIncomingMessageTrigger(chatBMsg, testChatB, chatBMsg.text!);
    assert.strictEqual(chatBRes, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentMessages[0].chatId, testChatB);
    assert.strictEqual(sentMessages[0].text, 'Brand New Post for Chat B');
    pass('TEST 14: Trigger execution uses latest edited message content and target chat');

    // ------------------------------------------------------------------------
    // TEST 15: Existing @random and @all behavior remains compatible
    // ------------------------------------------------------------------------
    console.log('\n--- TEST 15: Existing @random and @all behavior remains compatible ---');
    cleanup(testChatA);
    sentMessages = [];
    MessageScheduler.resetTriggerDeduplicationCache();
    MessageScheduler.resetTriggerCooldownCache();

    // Cache a member in chat A
    db.cacheUser({ id: 99991, first_name: 'RandomMember', username: 'random_user', is_bot: false }, testChatA);

    const mentionSchedule = db.addSchedule({
      chatId: testChatA,
      name: 'Random Mention Schedule',
      message: 'Hello @random! Welcome to the group.',
      scheduleType: 'interval',
      intervalMs: 3600000,
      triggerKeyword: 'randomcall',
      enabled: true
    });

    const mentionMsg: TelegramMessage = {
      message_id: 8980,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup' },
      from: { id: 980, is_bot: false, first_name: 'Caller' },
      text: 'Let us do a randomcall now'
    };
    const mentionRes = await messageScheduler.handleIncomingMessageTrigger(mentionMsg, testChatA, mentionMsg.text!);
    assert.strictEqual(mentionRes, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.ok(sentMessages[0].text?.includes('@random_user'), `Expected @random_user mention, got: ${sentMessages[0].text}`);
    pass('TEST 15: Existing @random and @all behavior remains compatible');

    console.log('\n================================================================');
    console.log(`🎉 All Multi-Phrase Trigger Tests Completed: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================');
  } finally {
    (telegramApi as any).sendMessage = originalSendMessage;
    (telegramApi as any).sendPhoto = originalSendPhoto;
    cleanup(testChatA);
    cleanup(testChatB);
  }
}

run().catch((err) => {
  console.error('Fatal error running regression suite:', err);
  process.exit(1);
});
