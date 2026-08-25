import { parseClearDuration, parseClearCount } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';

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
  console.log('STARTING /CLEAR COMMAND SUITE');
  console.log('====================================================');

  // 1. Test Duration Parsing
  console.log('--- 1. Duration Parsing Tests ---');
  const d5s = parseClearDuration('5s');
  assert(d5s !== null && d5s.seconds === 5, 'parseClearDuration("5s") returns 5 seconds');

  const d10sec = parseClearDuration('10sec');
  assert(d10sec !== null && d10sec.seconds === 10, 'parseClearDuration("10sec") returns 10 seconds');

  const d30secs = parseClearDuration('30 seconds');
  assert(d30secs !== null && d30secs.seconds === 30, 'parseClearDuration("30 seconds") returns 30 seconds');

  const d1m = parseClearDuration('1m');
  assert(d1m !== null && d1m.seconds === 60, 'parseClearDuration("1m") returns 60 seconds');

  const d5mins = parseClearDuration('5 mins');
  assert(d5mins !== null && d5mins.seconds === 300, 'parseClearDuration("5 mins") returns 300 seconds');

  const d1h = parseClearDuration('1h');
  assert(d1h !== null && d1h.seconds === 3600, 'parseClearDuration("1h") returns 3600 seconds');

  const d2hrs = parseClearDuration('2 hours');
  assert(d2hrs !== null && d2hrs.seconds === 7200, 'parseClearDuration("2 hours") returns 7200 seconds');

  const d1d = parseClearDuration('1d');
  assert(d1d !== null && d1d.seconds === 86400, 'parseClearDuration("1d") returns 86400 seconds');

  const dInvalid = parseClearDuration('xyz');
  assert(dInvalid === null, 'parseClearDuration("xyz") returns null');

  // 2. Test Count Parsing
  console.log('--- 2. Count Parsing Tests ---');
  const c10 = parseClearCount('10');
  assert(c10 === 10, 'parseClearCount("10") returns 10');

  const c50 = parseClearCount('50');
  assert(c50 === 50, 'parseClearCount("50") returns 50');

  const cCap = parseClearCount('250');
  assert(cCap === 100, 'parseClearCount("250") is capped at 100');

  const cInvalid = parseClearCount('abc');
  assert(cInvalid === null, 'parseClearCount("abc") returns null');

  // 3. Storage Message Tracking Tests
  console.log('--- 3. Storage Message Tracking Tests ---');
  const testChatId = -10099887766;
  const now = Math.floor(Date.now() / 1000);

  // Track messages with different timestamps
  db.trackMessage(testChatId, 101, now - 60, 201); // 1 min ago
  db.trackMessage(testChatId, 102, now - 30, 202); // 30 sec ago
  db.trackMessage(testChatId, 103, now - 4, 203);  // 4 sec ago
  db.trackMessage(testChatId, 104, now - 2, 204);  // 2 sec ago
  db.trackMessage(testChatId, 105, now, 205);      // current /clear command

  // Query by 5s duration (should match 103, 104, 105)
  const msgs5s = db.getMessagesByDuration(testChatId, 5, 105);
  assert(msgs5s.includes(103) && msgs5s.includes(104) && msgs5s.includes(105) && !msgs5s.includes(101) && !msgs5s.includes(102), 'getMessagesByDuration(5s) finds only messages from last 5s');

  // Query by 45s duration (should match 102, 103, 104, 105)
  const msgs45s = db.getMessagesByDuration(testChatId, 45, 105);
  assert(msgs45s.includes(102) && msgs45s.includes(103) && !msgs45s.includes(101), 'getMessagesByDuration(45s) finds messages within 45s');

  // Query by count: last 2 messages
  const msgsCount2 = db.getMessagesByCount(testChatId, 2, 105);
  assert(msgsCount2.length === 2 && msgsCount2.includes(104) && msgsCount2.includes(105), 'getMessagesByCount(2) returns 2 latest messages');

  // Query range: reply to 102 from 105
  const msgsRange = db.getMessagesInRange(testChatId, 102, 105);
  assert(msgsRange.length === 4 && msgsRange[0] === 102 && msgsRange[3] === 105, 'getMessagesInRange(102, 105) returns complete range [102, 103, 104, 105]');

  // Untrack deleted messages
  db.untrackMessages(testChatId, [103, 104]);
  const trackedAfter = db.getTrackedMessages(testChatId);
  assert(!trackedAfter.some((m) => m.messageId === 103 || m.messageId === 104), 'untrackMessages correctly removes purged IDs from memory buffer');

  // Test getMessagesByUser (Reply or @username mode)
  console.log('--- 4. Target Member Purge Tests ---');
  db.trackMessage(testChatId, 201, now - 10, 9999);
  db.trackMessage(testChatId, 202, now - 8, 8888);
  db.trackMessage(testChatId, 203, now - 6, 9999);
  db.trackMessage(testChatId, 204, now - 4, 7777);
  db.trackMessage(testChatId, 205, now - 2, 9999);

  const user9999Msgs = db.getMessagesByUser(testChatId, 9999);
  assert(user9999Msgs.length === 3 && user9999Msgs.includes(201) && user9999Msgs.includes(203) && user9999Msgs.includes(205), 'getMessagesByUser returns all messages for target user 9999');

  console.log('====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
