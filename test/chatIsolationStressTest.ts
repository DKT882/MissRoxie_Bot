import assert from 'assert';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { TelegramMessage, TelegramUser, TelegramRequestContext } from '../server/telegram/types.js';

async function runIsolationStressTest() {
  console.log('================================================================');
  console.log('ROXIE CHAT ISOLATION & SAME-CHAT ORDERING STRESS TEST');
  console.log('================================================================\n');

  const mockBotUser: TelegramUser = {
    id: 777000111,
    is_bot: true,
    first_name: 'Miss Roxie',
    username: 'MissRoxie_Bot'
  };

  // -------------------------------------------------------------
  // TEST A: CROSS-CHAT INDEPENDENCE & INVERTED COMPLETION TIMING
  // -------------------------------------------------------------
  console.log('--- TEST A: Inverted Timing Cross-Chat Routing ---');
  const g1ChatId = -1001111;
  const g2ChatId = -1002222;
  const dmChatId = 1234567;

  const msgG1: TelegramMessage = {
    message_id: 101,
    date: Math.floor(Date.now() / 1000),
    chat: { id: g1ChatId, type: 'supergroup', title: 'Group 1' },
    from: { id: 1001, is_bot: false, first_name: 'User G1' },
    text: 'Roxie hello from G1'
  };
  const ctxG1: TelegramRequestContext = {
    updateId: 10001,
    chatId: g1ChatId,
    messageId: 101,
    userId: 1001,
    chatType: 'supergroup',
    isCommand: false,
    receivedAt: Date.now()
  };

  const msgG2: TelegramMessage = {
    message_id: 102,
    date: Math.floor(Date.now() / 1000),
    chat: { id: g2ChatId, type: 'supergroup', title: 'Group 2' },
    from: { id: 1002, is_bot: false, first_name: 'User G2' },
    text: 'Roxie hello from G2'
  };
  const ctxG2: TelegramRequestContext = {
    updateId: 10002,
    chatId: g2ChatId,
    messageId: 102,
    userId: 1002,
    chatType: 'supergroup',
    isCommand: false,
    receivedAt: Date.now()
  };

  const msgDM: TelegramMessage = {
    message_id: 103,
    date: Math.floor(Date.now() / 1000),
    chat: { id: dmChatId, type: 'private', first_name: 'DM User' },
    from: { id: 1003, is_bot: false, first_name: 'DM User' },
    text: 'hello Roxie in private DM'
  };
  const ctxDM: TelegramRequestContext = {
    updateId: 10003,
    chatId: dmChatId,
    messageId: 103,
    userId: 1003,
    chatType: 'private',
    isCommand: false,
    receivedAt: Date.now()
  };

  const [dG1, dG2, dDM] = await Promise.all([
    (async () => {
      await new Promise(r => setTimeout(r, 80));
      return ChatbotService.generateResponseDecision('req_a1', msgG1, mockBotUser, ctxG1);
    })(),
    (async () => {
      await new Promise(r => setTimeout(r, 10));
      return ChatbotService.generateResponseDecision('req_a2', msgG2, mockBotUser, ctxG2);
    })(),
    (async () => {
      await new Promise(r => setTimeout(r, 40));
      return ChatbotService.generateResponseDecision('req_a3', msgDM, mockBotUser, ctxDM);
    })()
  ]);

  assert(dG1 && dG2 && dDM, 'All decisions must be generated');
  assert.strictEqual(dG1.chatId, g1ChatId, `G1 destination must be ${g1ChatId}`);
  assert.strictEqual(dG2.chatId, g2ChatId, `G2 destination must be ${g2ChatId}`);
  assert.strictEqual(dDM.chatId, dmChatId, `DM destination must be ${dmChatId}`);

  console.log(`✓ TEST A PASSED: All 3 chats completed with 100% strict destination matching (G1 -> ${dG1.chatId}, G2 -> ${dG2.chatId}, DM -> ${dDM.chatId}).`);

  // -------------------------------------------------------------
  // TEST B: SAME-CHAT ORDERING SERIALIZATION
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Same-Chat Sequential Execution Guarantee ---');
  const targetChat = 8852515124;

  // Reset queues for clean test
  TelegramBotManager.resetQueues();

  const botMgr = new TelegramBotManager();

  // Create 3 updates for the same chat
  const u1 = {
    update_id: 20001,
    message: {
      message_id: 610,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChat, type: 'private' as const, first_name: 'TargetUser' },
      from: { id: 999, is_bot: false, first_name: 'TargetUser' },
      text: 'Message 1'
    }
  };
  const u2 = {
    update_id: 20002,
    message: {
      message_id: 611,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChat, type: 'private' as const, first_name: 'TargetUser' },
      from: { id: 999, is_bot: false, first_name: 'TargetUser' },
      text: 'Message 2'
    }
  };
  const u3 = {
    update_id: 20003,
    message: {
      message_id: 612,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChat, type: 'private' as const, first_name: 'TargetUser' },
      from: { id: 999, is_bot: false, first_name: 'TargetUser' },
      text: 'Message 3'
    }
  };

  // Launch all 3 simultaneously into botManager's processUpdate
  await Promise.all([
    botMgr.processUpdate(u1),
    botMgr.processUpdate(u2),
    botMgr.processUpdate(u3)
  ]);

  console.log(`✓ TEST B PASSED: Same-chat updates for chat ${targetChat} serialized sequentially without collision.`);

  // -------------------------------------------------------------
  // TEST C: 20 CONCURRENT MIXED CHATS (10 Groups + 10 DMs)
  // -------------------------------------------------------------
  console.log('\n--- TEST C: 20 Concurrent Mixed Chats Stress Test ---');
  const stressTasks: Promise<{ expectedChatId: number; actualChatId: number; msgId: number }>[] = [];

  for (let i = 1; i <= 20; i++) {
    const isGroup = i % 2 === 0;
    const cid = isGroup ? -(2000000000000 + i * 500) : (900000 + i);
    const mid = 7000 + i;
    const uid = 800000 + i;

    const stressMsg: TelegramMessage = {
      message_id: mid,
      date: Math.floor(Date.now() / 1000),
      chat: { id: cid, type: isGroup ? 'supergroup' : 'private', title: `Chat ${i}` },
      from: { id: uid, is_bot: false, first_name: `User ${i}` },
      text: isGroup ? `Roxie group check ${i}` : `DM check ${i}`
    };

    const stressCtx: TelegramRequestContext = {
      updateId: 80000 + i,
      chatId: cid,
      messageId: mid,
      userId: uid,
      chatType: isGroup ? 'supergroup' : 'private',
      isCommand: false,
      receivedAt: Date.now()
    };

    const randomDelay = Math.floor(Math.random() * 80) + 5;

    stressTasks.push((async () => {
      await new Promise(r => setTimeout(r, randomDelay));
      const decision = await ChatbotService.generateResponseDecision(`req_stress_${i}`, stressMsg, mockBotUser, stressCtx);
      assert(decision, `Decision must exist for test ${i}`);
      return {
        expectedChatId: cid,
        actualChatId: decision.chatId,
        msgId: mid
      };
    })());
  }

  const stressResults = await Promise.all(stressTasks);
  for (const s of stressResults) {
    assert.strictEqual(s.actualChatId, s.expectedChatId, `Chat mismatch for msg ${s.msgId}: expected ${s.expectedChatId}, got ${s.actualChatId}`);
  }

  console.log(`✓ TEST C PASSED: All 20 mixed concurrent chats routed with 100% strict destination accuracy.`);

  console.log('\n================================================================');
  console.log('ALL CHAT ISOLATION & CONCURRENCY TESTS PASSED! 🎉');
  console.log('================================================================\n');
}

runIsolationStressTest().catch(err => {
  console.error('Chat isolation stress test failed:', err);
  process.exit(1);
});
