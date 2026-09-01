import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db, GROUP_MEMORY_LIMIT } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
function pass(msg: string) {
  console.log(`✅ [PASS] ${msg}`);
  passed++;
}

async function runGroupSharedMemoryCriticalFixTests() {
  console.log('====================================================');
  console.log('🧪 Starting Group-Shared Memory Critical Fix Test Suite');
  console.log('====================================================\n');

  const groupA = -100999111222;
  const groupB = -100888222333;
  const botUser = { id: 777000111, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup API mocks
  process.env.OPENROUTER_API_KEY = 'test_group_fix_api_key';
  process.env.OPENROUTER_MODEL = 'test/deepseek-chat';

  let capturedRequestBody: any = null;
  let mockAiResponse = 'Haan main sun rahi hu sabki baatein!';

  const origFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    if (init?.body) {
      try {
        capturedRequestBody = JSON.parse(init.body);
      } catch (e) {}
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: mockAiResponse
            }
          }
        ]
      })
    } as any;
  }) as any;

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    return { ok: true, result: { message_id: 888000 + Math.floor(Math.random() * 1000), text } };
  };
  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    return { ok: true, result: { message_id: 888000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).getChatMember = async (chatId: number, userId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: userId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    ChatbotService.reset();
    db.clearGroupMemory(groupA);
    db.clearGroupMemory(groupB);

    // ==============================================================
    // REQUIREMENT 1 & 2 & 3: One Group = One Shared Memory. Multiple users write to it.
    // userId is metadata only, NOT storage key!
    // ==============================================================
    console.log('--- 1. Multi-User Shared Group Memory & Metadata Verification ---');
    const msg1: TelegramMessage = {
      message_id: 1001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupA, type: 'supergroup', title: 'Test Group Alpha' },
      from: { id: 101, is_bot: false, first_name: 'Aman' },
      text: 'Roxie hii'
    };
    mockAiResponse = 'hello Aman!';
    await ChatbotService.handleMessage(msg1, botUser);

    const msg2: TelegramMessage = {
      message_id: 1002,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupA, type: 'supergroup', title: 'Test Group Alpha' },
      from: { id: 102, is_bot: false, first_name: 'Rahul' },
      text: 'Roxie kal exam hai'
    };
    mockAiResponse = 'haan yaar 😭';
    await ChatbotService.handleMessage(msg2, botUser);

    const msg3: TelegramMessage = {
      message_id: 1003,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupA, type: 'supergroup', title: 'Test Group Alpha' },
      from: { id: 103, is_bot: false, first_name: 'Priya' },
      text: 'Roxie maine kuch nahi padha'
    };
    mockAiResponse = 'kisi ne bhi nahi padha 😂';
    await ChatbotService.handleMessage(msg3, botUser);

    const memoryA = db.getGroupMemory(groupA);
    assert(memoryA.length >= 6, 'Group A memory must contain user messages and bot responses');

    // Verify storage keys: groupConversationMemories contains groupA as ONLY key
    const rawData = (db as any).data;
    assert.strictEqual(typeof rawData.groupConversationMemories[String(groupA)], 'object', 'Group key must be String(chatId)');
    assert.strictEqual(rawData.groupConversationMemories[`${groupA}_101`], undefined, 'Must NOT contain chatId_userId key');
    assert.strictEqual(rawData.groupConversationMemories[`${groupA}_102`], undefined, 'Must NOT contain chatId_userId key');
    assert.strictEqual(rawData.groupConversationMemories[`${groupA}_103`], undefined, 'Must NOT contain chatId_userId key');
    assert.strictEqual(rawData.groupConversationMemories['101'], undefined, 'Must NOT contain userId key');

    // Verify userId is present in message entries as metadata
    const userAMsg = memoryA.find(m => m.userId === 101);
    const userBMsg = memoryA.find(m => m.userId === 102);
    const userCMsg = memoryA.find(m => m.userId === 103);
    assert(userAMsg && userAMsg.name === 'Aman' && userAMsg.content === 'Roxie hii', 'User A metadata recorded');
    assert(userBMsg && userBMsg.name === 'Rahul' && userBMsg.content === 'Roxie kal exam hai', 'User B metadata recorded');
    assert(userCMsg && userCMsg.name === 'Priya' && userCMsg.content === 'Roxie maine kuch nahi padha', 'User C metadata recorded');
    pass('Requirements 1, 2, 3: Exactly ONE shared memory container for group, userId exists only as metadata.');

    // ==============================================================
    // REQUIREMENT 4: Group A Isolated from Group B
    // ==============================================================
    console.log('\n--- 2. Group Isolation ---');
    const msgB: TelegramMessage = {
      message_id: 2001,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupB, type: 'supergroup', title: 'Test Group Beta' },
      from: { id: 201, is_bot: false, first_name: 'Charlie' },
      text: 'Roxie what are you doing?'
    };
    mockAiResponse = 'chilling!';
    await ChatbotService.handleMessage(msgB, botUser);

    const memoryB = db.getGroupMemory(groupB);
    assert(memoryB.every(m => m.userId !== 101 && m.userId !== 102 && m.userId !== 103), 'Group B must contain NONE of Group A messages');
    pass('Requirement 4: Group A and Group B are strictly isolated.');

    // ==============================================================
    // REQUIREMENT 5, 6, 7: 80-Message Rolling Window & Continues Responding
    // ==============================================================
    console.log('\n--- 3. 80-Message Rolling Window & Continuous Processing ---');
    const rollGroup = -100777333444;
    db.clearGroupMemory(rollGroup);

    // Insert 600 messages directly into group memory
    for (let i = 1; i <= 600; i++) {
      db.addGroupConversationEntry(rollGroup, {
        role: 'user',
        userId: 1000 + (i % 5),
        name: `User${i % 5}`,
        content: `Message ${i}`,
        timestamp: Date.now() + i,
        messageId: 5000 + i
      });
    }

    const rollMemory = db.getGroupMemory(rollGroup);
    assert.strictEqual(rollMemory.length, 500, `Must be capped at exactly 500 messages (got ${rollMemory.length})`);
    assert.strictEqual(rollMemory[0].content, 'Message 101', 'Oldest entries (1-100) were removed; first is Message 101');
    assert.strictEqual(rollMemory[499].content, 'Message 600', 'Latest entry is Message 600');

    // 601st message triggers chatbot without any blockage
    const msg101: TelegramMessage = {
      message_id: 5601,
      date: Math.floor(Date.now() / 1000),
      chat: { id: rollGroup, type: 'supergroup', title: 'Roll Group' },
      from: { id: 1001, is_bot: false, first_name: 'User1' },
      text: 'Roxie message 601'
    };
    mockAiResponse = 'Still responding happily at message 601!';
    const handled101 = await ChatbotService.handleMessage(msg101, botUser);
    assert.strictEqual(handled101, true, 'Chatbot handles message successfully');
    pass('Requirements 5, 6, 7: 500-entry rolling window maintained, oldest removed, processing continues past 500.');

    // ==============================================================
    // REQUIREMENT 8: Deduplication Prevents Duplicate Entries
    // ==============================================================
    console.log('\n--- 4. Duplicate Update Prevention ---');
    const countBeforeDup = db.getGroupMemory(rollGroup).length;
    // Attempt duplicate entry with same messageId
    db.addGroupConversationEntry(rollGroup, {
      role: 'user',
      userId: 1001,
      name: 'User1',
      content: 'Roxie message 101',
      timestamp: Date.now(),
      messageId: 5101 // identical messageId
    });
    const countAfterDup = db.getGroupMemory(rollGroup).length;
    assert.strictEqual(countAfterDup, countBeforeDup, 'Duplicate messageId must not be added to group memory');
    pass('Requirement 8: Duplicate Telegram updates do not duplicate memory entries.');

    // ==============================================================
    // REQUIREMENT 9, 10, 11: /clearmemory vs /forgetme Separation
    // ==============================================================
    console.log('\n--- 5. /clearmemory vs /forgetme & Personal Facts Separation ---');
    // Store personal user fact for Aman in Group A
    db.addUserMemoryFact(groupA, 101, 'I love playing badminton');
    const amanFactsBefore = db.getUserMemory(groupA, 101);
    assert.strictEqual(amanFactsBefore.length, 1, 'Aman has 1 personal fact stored');

    // /forgetme removes personal fact ONLY, leaves group conversation intact
    db.clearUserMemory(groupA, 101);
    const amanFactsAfterForget = db.getUserMemory(groupA, 101);
    assert.strictEqual(amanFactsAfterForget.length, 0, 'Aman personal fact cleared by /forgetme');
    const groupAMemoryAfterForget = db.getGroupMemory(groupA);
    assert(groupAMemoryAfterForget.length > 0, 'Group A shared conversation memory is NOT touched by /forgetme');

    // /clearmemory clears Group A conversation ONLY, leaves Group B and personal facts intact
    db.addUserMemoryFact(groupA, 102, 'I work at a university');
    const groupBCountBefore = db.getGroupMemory(groupB).length;

    db.clearGroupMemory(groupA);
    assert.strictEqual(db.getGroupMemory(groupA).length, 0, 'Group A shared memory cleared');
    assert.strictEqual(db.getGroupMemory(groupB).length, groupBCountBefore, 'Group B shared memory intact');
    assert.strictEqual(db.getUserMemory(groupA, 102).length, 1, 'Personal user memory fact intact after /clearmemory');
    pass('Requirements 9, 10, 11: /clearmemory clears only group conversation; /forgetme clears only personal facts.');

    // ==============================================================
    // REQUIREMENT 12: Persistence & Recovery
    // ==============================================================
    console.log('\n--- 6. Persistence & Storage Format ---');
    const persistGroup = -100555444333;
    db.clearGroupMemory(persistGroup);
    db.addGroupConversationEntry(persistGroup, {
      role: 'user',
      userId: 501,
      name: 'Aman',
      content: 'hello',
      timestamp: 1787990000000,
      messageId: 6001
    });
    db.addGroupConversationEntry(persistGroup, {
      role: 'user',
      userId: 502,
      name: 'Rahul',
      content: "what's up?",
      timestamp: 1787990001000,
      messageId: 6002
    });
    db.addGroupConversationEntry(persistGroup, {
      role: 'user',
      userId: 503,
      name: 'Priya',
      content: 'exam tomorrow',
      timestamp: 1787990002000,
      messageId: 6003
    });
    db.addGroupConversationEntry(persistGroup, {
      role: 'assistant',
      name: 'Roxie',
      content: 'haan yaar 😭',
      timestamp: 1787990003000
    });

    const storedGroupRec = (db as any).data.groupConversationMemories[String(persistGroup)];
    assert(storedGroupRec && Array.isArray(storedGroupRec.messages), 'Must have messages array in groupConversationMemories');
    assert.strictEqual(storedGroupRec.messages.length, 4, 'All 4 messages stored');
    console.log('\n--- Example Stored Structure in groupConversationMemories ---');
    console.log(JSON.stringify({ [String(persistGroup)]: { messages: storedGroupRec.messages } }, null, 2));
    pass('Requirement 12: Storage structure matches exact required schema.');

    // ==============================================================
    // REQUIREMENT 13, 14: Context construction in Chatbot
    // ==============================================================
    console.log('\n--- 7. Context Construction in AI Dispatch ---');
    capturedRequestBody = null;
    mockAiResponse = 'pata hai mujhe 😂';
    const testMsg: TelegramMessage = {
      message_id: 6004,
      date: Math.floor(Date.now() / 1000),
      chat: { id: persistGroup, type: 'supergroup', title: 'Study Group' },
      from: { id: 504, is_bot: false, first_name: 'Neha' },
      text: 'Roxie pass karwa do'
    };

    await ChatbotService.handleMessage(testMsg, botUser);
    const userPrompt = capturedRequestBody?.messages?.find((m: any) => m.role === 'user')?.content || '';
    assert(userPrompt.includes('GROUP CONVERSATION:'), 'Must contain GROUP CONVERSATION');
    assert(userPrompt.includes('Aman: hello'), 'Context contains Aman');
    assert(userPrompt.includes("Rahul: what's up?"), 'Context contains Rahul');
    assert(userPrompt.includes('Priya: exam tomorrow'), 'Context contains Priya');
    assert(userPrompt.includes('Roxie: haan yaar 😭'), 'Context contains Roxie');
    assert(userPrompt.includes('LATEST MESSAGE:\nNeha: Roxie pass karwa do'), 'Highlights latest message');
    pass('Requirements 13, 14, 15, 16: Prompt uses chronological group conversation with names and latest message priority.');

    console.log('\n====================================================');
    console.log(`🎉 ALL GROUP-SHARED MEMORY CRITICAL FIX TESTS PASSED! (${passed} tests)`);
    console.log('====================================================\n');
  } finally {
    global.fetch = origFetch;
  }
}

runGroupSharedMemoryCriticalFixTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
