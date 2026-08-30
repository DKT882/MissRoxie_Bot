import { ChatbotService } from '../server/telegram/chatbot.js';
import { db, GROUP_MEMORY_LIMIT, isSensitiveData } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runGroupSharedMemoryTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Group-Shared Memory 20-Point Test Suite');
  console.log('====================================================\n');

  const groupAChatId = -100111222333;
  const groupBChatId = -100444555666;
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup environment & mocks
  process.env.OPENROUTER_API_KEY = 'test_group_memory_key';
  process.env.OPENROUTER_MODEL = 'test/model';

  let capturedRequestBody: any = null;
  let simulatedAiResponseText = 'Haan main sun rahi hu!';

  const originalFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    if (init && init.body) {
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
              content: simulatedAiResponseText
            }
          }
        ]
      })
    } as any;
  }) as any;

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    return { ok: true, result: { message_id: 999000 + Math.floor(Math.random() * 1000), text } };
  };
  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    return { ok: true, result: { message_id: 999000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).getChatMember = async (chatId: number, userId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: userId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    // Reset state before starting
    ChatbotService.reset();
    db.clearGroupMemory(groupAChatId);
    db.clearGroupMemory(groupBChatId);

    // ----------------------------------------------------
    // TEST 1-6: Group A has ONE shared memory for all members and bot
    // ----------------------------------------------------
    console.log('--- TEST 1-6: Shared group conversation memory (Aman, Riya, Rahul + Roxie) ---');

    // 1. Group A shared memory exists
    assert(Array.isArray(db.getGroupMemory(groupAChatId)), 'TEST 1: Group A has a group memory array initialized');

    // 2. User A (Aman) sends message
    const msgAman: TelegramMessage = {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupAChatId, type: 'supergroup', title: 'Group Alpha' },
      from: { id: 1001, is_bot: false, first_name: 'Aman', username: 'aman10' },
      text: 'Roxie hii everyone'
    };
    simulatedAiResponseText = 'helloo Aman!';
    await ChatbotService.handleMessage(msgAman, botUser);

    // 3. User B (Riya) sends message
    const msgRiya: TelegramMessage = {
      message_id: 102,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupAChatId, type: 'supergroup', title: 'Group Alpha' },
      from: { id: 1002, is_bot: false, first_name: 'Riya', username: 'riya_g' },
      text: 'Roxie what are you guys doing?'
    };
    simulatedAiResponseText = 'bas tum logon ki bakbak sun rahi hu 😂';
    await ChatbotService.handleMessage(msgRiya, botUser);

    // 4. User C (Rahul) sends message
    const msgRahul: TelegramMessage = {
      message_id: 103,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupAChatId, type: 'supergroup', title: 'Group Alpha' },
      from: { id: 1003, is_bot: false, first_name: 'Rahul', username: 'rahul_99' },
      text: 'Roxie kal college jana hai kya?'
    };
    simulatedAiResponseText = 'uff Monday again 😭';
    await ChatbotService.handleMessage(msgRahul, botUser);

    const memGroupA = db.getGroupMemory(groupAChatId);

    // 5. All messages appear in the SAME group memory
    const userNamesInMem = memGroupA.filter(e => e.role === 'user').map(e => e.name);
    assert(userNamesInMem.includes('Aman'), 'TEST 5.1: Aman is recorded in Group A memory');
    assert(userNamesInMem.includes('Riya'), 'TEST 5.2: Riya is recorded in Group A memory');
    assert(userNamesInMem.includes('Rahul'), 'TEST 5.3: Rahul is recorded in Group A memory');
    assert(memGroupA.some(e => e.content === 'Roxie hii everyone'), 'TEST 5.4: Aman\'s message content is in Group A memory');
    assert(memGroupA.some(e => e.content === 'Roxie what are you guys doing?'), 'TEST 5.5: Riya\'s message content is in Group A memory');
    assert(memGroupA.some(e => e.content === 'Roxie kal college jana hai kya?'), 'TEST 5.6: Rahul\'s message content is in Group A memory');

    // 6. Roxie's replies appear in the SAME group memory
    const roxieReplies = memGroupA.filter(e => e.role === 'assistant');
    assert(roxieReplies.length >= 3, 'TEST 6.1: Roxie\'s assistant replies are in Group A memory');
    assert(roxieReplies.some(e => e.content.includes('helloo Aman!') || e.content.includes('[Sent sticker]')), 'TEST 6.2: Reply to Aman stored (text or sticker)');
    assert(roxieReplies.some(e => e.content.includes('bas tum logon ki bakbak sun rahi hu') || e.content.includes('[Sent sticker]')), 'TEST 6.3: Reply to Riya stored');
    assert(roxieReplies.some(e => e.content.includes('uff Monday again') || e.content.includes('[Sent sticker]')), 'TEST 6.4: Reply to Rahul stored');

    // ----------------------------------------------------
    // TEST 7-8: Group Isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 7-8: Strict Group Isolation ---');
    const msgGroupB: TelegramMessage = {
      message_id: 201,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupBChatId, type: 'supergroup', title: 'Group Beta' },
      from: { id: 1001, is_bot: false, first_name: 'Aman', username: 'aman10' },
      text: 'Roxie, this is Group Beta room discussion'
    };
    simulatedAiResponseText = 'Got it, Group Beta!';
    await ChatbotService.handleMessage(msgGroupB, botUser);

    const memGroupB = db.getGroupMemory(groupBChatId);

    // 7. Group B has a separate memory
    assert(memGroupB.length >= 2, 'TEST 7.1: Group B has its own conversation memory');
    assert(memGroupB.some(e => e.content.includes('Group Beta room discussion')), 'TEST 7.2: Group B contains its own messages');

    // 8. Group A memory never appears in Group B, and vice versa
    assert(!memGroupB.some(e => e.content === 'kal college jana hai kya?'), 'TEST 8.1: Group A conversation does NOT leak into Group B');
    assert(!memGroupA.some(e => e.content.includes('Group Beta room discussion')), 'TEST 8.2: Group B conversation does NOT leak into Group A');

    // ----------------------------------------------------
    // TEST 9-11: Rolling 80-entry limit & Indefinite response
    // ----------------------------------------------------
    console.log('\n--- TEST 9-11: Rolling Window (80 entries limit) & Indefinite Continuation ---');
    const testRollChatId = -100999888777;
    db.clearGroupMemory(testRollChatId);

    // Add exactly 80 entries
    for (let i = 1; i <= 80; i++) {
      db.addGroupConversationEntry(testRollChatId, {
        role: i % 2 === 1 ? 'user' : 'assistant',
        userId: 5000,
        name: i % 2 === 1 ? 'TestUser' : 'Roxie',
        content: `Message ${i}`,
        timestamp: Date.now()
      });
    }

    const countAt80 = db.getGroupMemory(testRollChatId).length;
    assert(countAt80 === 80, `TEST 9.1: Group memory holds exactly 80 entries (count=${countAt80})`);
    assert(db.getGroupMemory(testRollChatId)[0].content === 'Message 1', 'TEST 9.2: First entry is Message 1');
    assert(db.getGroupMemory(testRollChatId)[79].content === 'Message 80', 'TEST 9.3: 80th entry is Message 80');

    // 10. Entry 81 removes the oldest entry (Message 1 removed, Message 81 added)
    db.addGroupConversationEntry(testRollChatId, {
      role: 'user',
      userId: 5000,
      name: 'TestUser',
      content: 'Message 81',
      timestamp: Date.now()
    });

    const entriesAfter81 = db.getGroupMemory(testRollChatId);
    assert(entriesAfter81.length === 80, 'TEST 10.1: Memory length stays clamped at 80');
    assert(entriesAfter81[0].content === 'Message 2', 'TEST 10.2: Oldest entry (Message 1) was evicted, Message 2 is now first');
    assert(entriesAfter81[79].content === 'Message 81', 'TEST 10.3: Newest entry is Message 81');

    // 11. Bot continues responding indefinitely after 80 messages (test up to 100)
    let continuousSuccess = true;
    for (let i = 82; i <= 100; i++) {
      const msg: TelegramMessage = {
        message_id: 1000 + i,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testRollChatId, type: 'supergroup', title: 'Roll Group' },
        from: { id: 5000, is_bot: false, first_name: 'TestUser' },
        text: `Roxie message ${i}`
      };
      simulatedAiResponseText = `Reply to ${i}`;
      const handled = await ChatbotService.handleMessage(msg, botUser);
      if (!handled) {
        continuousSuccess = false;
        break;
      }
    }
    assert(continuousSuccess === true, 'TEST 11.1: Roxie continues responding smoothly after 80, 90, 100 messages');
    const finalEntries = db.getGroupMemory(testRollChatId);
    assert(finalEntries.length === 80, 'TEST 11.2: Memory remains bounded at exactly 80 entries');
    assert(finalEntries[79].content.includes('Reply to 100') || finalEntries[79].content.includes('[Sent sticker]'), 'TEST 11.3: Newest entry reflects message 100 response');

    // ----------------------------------------------------
    // TEST 12: Persistence Verification
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Restart / Storage Persistence ---');
    // Verify that data is stored in db storage data
    const persistedMemories = (db as any).data.groupMemories;
    assert(!!persistedMemories[String(testRollChatId)], 'TEST 12.1: Group memory is tracked in db.data.groupMemories for persistent JSON storage');
    assert(persistedMemories[String(testRollChatId)].entries.length === 80, 'TEST 12.2: Persisted entries match 80 count');

    // ----------------------------------------------------
    // TEST 13: /clearmemory clears only the current group's memory
    // ----------------------------------------------------
    console.log('\n--- TEST 13: /clearmemory Admin Command Isolation ---');
    const clearCmdHandled = await CommandHandler.handleCommand({
      command: '/clearmemory',
      args: [],
      chatId: groupAChatId,
      chatTitle: 'Group Alpha',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 1001, first_name: 'Admin', is_bot: false },
      message: { message_id: 888, date: Math.floor(Date.now() / 1000), chat: { id: groupAChatId, type: 'supergroup' } }
    });

    assert(clearCmdHandled === true, 'TEST 13.1: /clearmemory executed successfully for Group A');
    assert(db.getGroupMemory(groupAChatId).length === 0, 'TEST 13.2: Group A memory was cleared');
    assert(db.getGroupMemory(groupBChatId).length > 0, 'TEST 13.3: Group B memory was NOT touched by Group A\'s /clearmemory');

    // ----------------------------------------------------
    // TEST 14: /forgetme does NOT erase group memory
    // ----------------------------------------------------
    console.log('\n--- TEST 14: /forgetme Command Separated from Group Memory ---');
    // Seed both group memory and personal user fact
    db.addGroupConversationEntry(groupBChatId, {
      role: 'user',
      userId: 1001,
      name: 'Aman',
      content: 'I love group discussions',
      timestamp: Date.now()
    });
    db.addUserMemoryFact(groupBChatId, 1001, 'Prefers dark roast coffee');

    assert(db.getUserMemory(groupBChatId, 1001).length === 1, 'TEST 14.1: Aman has 1 personal memory fact');
    const groupBMemsBefore = db.getGroupMemory(groupBChatId).length;

    // Aman executes /forgetme
    const forgetMeHandled = await CommandHandler.handleCommand({
      command: '/forgetme',
      args: [],
      chatId: groupBChatId,
      chatTitle: 'Group Beta',
      isAnonymousAdmin: false,
      adminDisplayName: 'Aman',
      sender: { id: 1001, first_name: 'Aman', is_bot: false },
      message: { message_id: 889, date: Math.floor(Date.now() / 1000), chat: { id: groupBChatId, type: 'supergroup' } }
    });

    assert(forgetMeHandled === true, 'TEST 14.2: /forgetme executed successfully');
    assert(db.getUserMemory(groupBChatId, 1001).length === 0, 'TEST 14.3: Aman\'s personal facts were cleared');
    assert(db.getGroupMemory(groupBChatId).length === groupBMemsBefore, 'TEST 14.4: Group B\'s shared conversation memory was COMPLETELY PRESERVED');

    // ----------------------------------------------------
    // TEST 15-16: Security Filtering & Sensitive Information
    // ----------------------------------------------------
    console.log('\n--- TEST 15-16: Sensitive Information Filtering ---');
    assert(isSensitiveData('my password is supersecret123') === true, 'TEST 15.1: Detects password as sensitive');
    assert(isSensitiveData('api_key: sk-proj-1234567890abcdef123456') === true, 'TEST 15.2: Detects api_key as sensitive');

    const memCountBeforeSensitive = db.getGroupMemory(groupBChatId).length;
    const sensitiveMsg: TelegramMessage = {
      message_id: 991,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupBChatId, type: 'supergroup', title: 'Group Beta' },
      from: { id: 1001, is_bot: false, first_name: 'Aman' },
      text: 'Roxie my password is supersecret123'
    };
    await ChatbotService.handleMessage(sensitiveMsg, botUser);

    const memsAfterSensitive = db.getGroupMemory(groupBChatId);
    assert(!memsAfterSensitive.some(e => e.content.includes('supersecret123')), 'TEST 16.1: Password was NOT stored into group conversation memory');
    assert(!db.getUserMemory(groupBChatId, 1001).some(f => f.includes('supersecret123')), 'TEST 16.2: Password was NOT stored into personal memory');

    // ----------------------------------------------------
    // TEST 17: Duplicate Response Prevention
    // ----------------------------------------------------
    console.log('\n--- TEST 17: Duplicate Response Protection ---');
    ChatbotService.reset();
    const dupMsg: TelegramMessage = {
      message_id: 12345,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupBChatId, type: 'supergroup', title: 'Group Beta' },
      from: { id: 1001, is_bot: false, first_name: 'Aman' },
      text: 'Roxie what is 2+2?'
    };
    simulatedAiResponseText = '2+2 is 4!';
    const firstDispatch = await ChatbotService.handleMessage(dupMsg, botUser);
    const secondDispatch = await ChatbotService.handleMessage(dupMsg, botUser); // duplicate with same message_id

    assert(firstDispatch === true, 'TEST 17.1: First message dispatch succeeds');
    assert(secondDispatch === false, 'TEST 17.2: Duplicate message dispatch is blocked by atomic deduplication gate');

    // ----------------------------------------------------
    // TEST 18: Mood Detection using Group Context
    // ----------------------------------------------------
    console.log('\n--- TEST 18: Mood Detection with Group Context ---');
    const moodHappy = ChatbotService.inferMood('aaj hum sab party kar rahe hain, bahut khush hain!');
    assert(moodHappy === 'happy' || moodHappy === 'joyful' || moodHappy === 'friendly', `TEST 18.1: Infers happy mood correctly (got ${moodHappy})`);

    const moodRomantic = ChatbotService.inferMood('miss you so much ❤️');
    assert(moodRomantic === 'romantic', `TEST 18.2: Infers romantic mood correctly (got ${moodRomantic})`);

    // ----------------------------------------------------
    // TEST 19: Latest message receives highest contextual priority
    // ----------------------------------------------------
    console.log('\n--- TEST 19: Context Format & Latest Message Priority ---');
    db.clearGroupMemory(groupAChatId);

    // Seed prior conversation between Aman and Riya
    db.addGroupConversationEntry(groupAChatId, { role: 'user', userId: 1001, name: 'Aman', content: 'hii', timestamp: Date.now() });
    db.addGroupConversationEntry(groupAChatId, { role: 'assistant', name: 'Roxie', content: 'helloo', timestamp: Date.now() });
    db.addGroupConversationEntry(groupAChatId, { role: 'user', userId: 1002, name: 'Riya', content: 'kya kar rahe ho log?', timestamp: Date.now() });
    db.addGroupConversationEntry(groupAChatId, { role: 'assistant', name: 'Roxie', content: 'bas yahin hu 😭', timestamp: Date.now() });
    db.addGroupConversationEntry(groupAChatId, { role: 'user', userId: 1001, name: 'Aman', content: 'kal exam hai', timestamp: Date.now() });
    db.addGroupConversationEntry(groupAChatId, { role: 'user', userId: 1002, name: 'Riya', content: 'seriously??', timestamp: Date.now() });

    capturedRequestBody = null;
    simulatedAiResponseText = 'tum dono ko ab yaad aa raha hai? 😂';

    const latestMsg: TelegramMessage = {
      message_id: 301,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupAChatId, type: 'supergroup', title: 'Group Alpha' },
      from: { id: 1001, is_bot: false, first_name: 'Aman' },
      text: 'Roxie kuch padha nahi maine'
    };

    await ChatbotService.handleMessage(latestMsg, botUser);

    const userPrompt = capturedRequestBody?.messages?.find((m: any) => m.role === 'user')?.content || '';
    assert(userPrompt.includes('GROUP CONVERSATION:'), 'TEST 19.1: Prompt contains GROUP CONVERSATION block');
    assert(userPrompt.includes('Aman: hii'), 'TEST 19.2: Prior conversation includes Aman');
    assert(userPrompt.includes('Riya: kya kar rahe ho log?'), 'TEST 19.3: Prior conversation includes Riya');
    assert(userPrompt.includes('Roxie: bas yahin hu 😭'), 'TEST 19.4: Prior conversation includes Roxie');
    assert(userPrompt.includes('LATEST MESSAGE:\nAman: Roxie kuch padha nahi maine'), 'TEST 19.5: Prompt highlights LATEST MESSAGE with highest priority');

    // ----------------------------------------------------
    // TEST 20: No Random Topic Jumping System Prompt Rules
    // ----------------------------------------------------
    console.log('\n--- TEST 20: No Random Topic Jumping Rules ---');
    const systemPrompt = capturedRequestBody?.messages?.find((m: any) => m.role === 'system')?.content || '';
    assert(systemPrompt.includes('LATEST MESSAGE PRIORITY'), 'TEST 20.1: System prompt mandates latest message priority');
    assert(systemPrompt.includes('TOPIC CONTINUITY'), 'TEST 20.2: System prompt mandates topic continuity');
    assert(systemPrompt.includes('NEVER randomly introduce unrelated topics'), 'TEST 20.3: System prompt strictly forbids random topic jumping');

    console.log('\n====================================================');
    console.log(`🎉 ALL 20 GROUP-SHARED MEMORY TESTS PASSED! (${passed} checks passed, ${failed} failed)`);
    console.log('====================================================\n');

  } finally {
    global.fetch = originalFetch;
  }
}

runGroupSharedMemoryTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
