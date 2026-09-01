import assert from 'assert';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { TelegramMessage, TelegramUser, TelegramRequestContext } from '../server/telegram/types.js';

async function runConcurrencyTests() {
  console.log('================================================================');
  console.log('ROXIE ASYNC CONCURRENCY & CROSS-GROUP ISOLATION TEST SUITE');
  console.log('================================================================\n');

  const mockBotUser: TelegramUser = {
    id: 777000111,
    is_bot: true,
    first_name: 'Miss Roxie',
    username: 'MissRoxie_Bot'
  };

  // TEST 1: Dual Concurrent Groups with Inverted Completion Times (G1 slow, G2 fast)
  console.log('--- TEST 1: G1 Slow (Delayed AI) vs G2 Fast ---');
  const g1ChatId = -1004494262619;
  const g2ChatId = -1009876543210;

  const msgG1: TelegramMessage = {
    message_id: 5001,
    date: Math.floor(Date.now() / 1000),
    chat: { id: g1ChatId, type: 'supergroup', title: 'Group 1' },
    from: { id: 111001, is_bot: false, first_name: 'User 1' },
    text: 'Roxie hello from Group 1'
  };

  const reqCtxG1: TelegramRequestContext = {
    updateId: 90001,
    chatId: g1ChatId,
    messageId: 5001,
    userId: 111001,
    chatType: 'supergroup',
    isCommand: false,
    receivedAt: Date.now()
  };

  const msgG2: TelegramMessage = {
    message_id: 5002,
    date: Math.floor(Date.now() / 1000),
    chat: { id: g2ChatId, type: 'supergroup', title: 'Group 2' },
    from: { id: 222002, is_bot: false, first_name: 'User 2' },
    text: 'Roxie hello from Group 2'
  };

  const reqCtxG2: TelegramRequestContext = {
    updateId: 90002,
    chatId: g2ChatId,
    messageId: 5002,
    userId: 222002,
    chatType: 'supergroup',
    isCommand: false,
    receivedAt: Date.now()
  };

  // Launch G1 and G2 concurrently
  const [resG1, resG2] = await Promise.all([
    (async () => {
      // Artificially simulate delay for G1
      await new Promise(r => setTimeout(r, 200));
      return ChatbotService.generateResponseDecision('req_g1', msgG1, mockBotUser, reqCtxG1);
    })(),
    (async () => {
      // G2 finishes faster
      await new Promise(r => setTimeout(r, 20));
      return ChatbotService.generateResponseDecision('req_g2', msgG2, mockBotUser, reqCtxG2);
    })()
  ]);

  assert(resG1, 'TEST 1: G1 decision must be generated');
  assert(resG2, 'TEST 1: G2 decision must be generated');
  assert.strictEqual(resG1.chatId, g1ChatId, `TEST 1: G1 destination must be ${g1ChatId}, got ${resG1.chatId}`);
  assert.strictEqual(resG2.chatId, g2ChatId, `TEST 1: G2 destination must be ${g2ChatId}, got ${resG2.chatId}`);
  console.log(`✓ TEST 1 PASSED: G1 (${g1ChatId}) → ${resG1.chatId} and G2 (${g2ChatId}) → ${resG2.chatId} correctly isolated.`);

  // TEST 2: Inverse Delay (G1 fast, G2 slow)
  console.log('\n--- TEST 2: G1 Fast vs G2 Slow ---');
  const [resG1Fast, resG2Slow] = await Promise.all([
    (async () => {
      await new Promise(r => setTimeout(r, 10));
      return ChatbotService.generateResponseDecision('req_g1_fast', msgG1, mockBotUser, reqCtxG1);
    })(),
    (async () => {
      await new Promise(r => setTimeout(r, 150));
      return ChatbotService.generateResponseDecision('req_g2_slow', msgG2, mockBotUser, reqCtxG2);
    })()
  ]);

  assert.strictEqual(resG1Fast?.chatId, g1ChatId, 'TEST 2: G1 fast destination must match G1');
  assert.strictEqual(resG2Slow?.chatId, g2ChatId, 'TEST 2: G2 slow destination must match G2');
  console.log(`✓ TEST 2 PASSED: Inverse timing test passed.`);

  // TEST 3: High Concurrency (15 Simultaneous Mixed Groups and Private DMs)
  console.log('\n--- TEST 3: 15 Concurrent Mixed Chats (Groups + DMs) ---');
  const concurrentTasks: Promise<{ expectedChatId: number; actualChatId: number; messageId: number }>[] = [];

  for (let i = 1; i <= 15; i++) {
    const isGroup = i % 2 === 0;
    const targetChatId = isGroup ? -(1000000000000 + i * 1000) : (888000 + i);
    const msgId = 6000 + i;
    const userId = 777000 + i;

    const testMsg: TelegramMessage = {
      message_id: msgId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChatId, type: isGroup ? 'supergroup' : 'private', title: `Chat ${i}` },
      from: { id: userId, is_bot: false, first_name: `User ${i}` },
      text: isGroup ? `Roxie status check for chat ${i}` : `hello from user ${i}`
    };

    const reqCtx: TelegramRequestContext = {
      updateId: 91000 + i,
      chatId: targetChatId,
      messageId: msgId,
      userId,
      chatType: isGroup ? 'supergroup' : 'private',
      isCommand: false,
      receivedAt: Date.now()
    };

    const randomDelay = Math.floor(Math.random() * 100) + 5;

    concurrentTasks.push((async () => {
      await new Promise(r => setTimeout(r, randomDelay));
      const decision = await ChatbotService.generateResponseDecision(`req_concurrent_${i}`, testMsg, mockBotUser, reqCtx);
      assert(decision, `Decision must exist for chat ${i}`);
      return {
        expectedChatId: targetChatId,
        actualChatId: decision.chatId,
        messageId: msgId
      };
    })());
  }

  const results = await Promise.all(concurrentTasks);
  for (const r of results) {
    assert.strictEqual(r.actualChatId, r.expectedChatId, `Chat mismatch for msg ${r.messageId}: expected ${r.expectedChatId}, got ${r.actualChatId}`);
  }
  console.log(`✓ TEST 3 PASSED: All 15 concurrent chats completed with 100% strict destination isolation.`);

  console.log('\n================================================================');
  console.log('ALL CONCURRENCY & ROUTING ISOLATION TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runConcurrencyTests().catch(err => {
  console.error('Concurrency test failed:', err);
  process.exit(1);
});
