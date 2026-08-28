import { db, isSensitiveData } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';

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

export async function runUserMemoryTests() {
  console.log('====================================================');
  console.log('STARTING ROXIE USER MEMORY TEST SUITE');
  console.log('====================================================');

  const chatId1 = -100555666777;
  const chatId2 = -100888999000;
  const userId1 = 2001;
  const userId2 = 2002;

  // Clear any existing memories for test users/chats
  db.clearUserMemory(chatId1, userId1);
  db.clearUserMemory(chatId1, userId2);
  db.clearUserMemory(chatId2, userId1);

  // 1. Memory creation & retrieval
  db.addUserMemoryFact(chatId1, userId1, 'I love coding in TypeScript');
  db.addUserMemoryFact(chatId1, userId1, 'My name is Alex');
  const mems1 = db.getUserMemory(chatId1, userId1);
  assert(mems1.length === 2 && mems1[0] === 'I love coding in TypeScript' && mems1[1] === 'My name is Alex', 'MEMORY-01: Memory creation and retrieval works correctly');

  // 2. Duplicate memory prevention
  db.addUserMemoryFact(chatId1, userId1, 'My name is Alex');
  const memsDups = db.getUserMemory(chatId1, userId1);
  assert(memsDups.length === 2, 'MEMORY-02: Duplicate memory facts are prevented');

  // 3. Memory isolation between users (User 1 vs User 2 in chatId1)
  db.addUserMemoryFact(chatId1, userId2, 'I prefer Python');
  const memsUser2 = db.getUserMemory(chatId1, userId2);
  const memsUser1Again = db.getUserMemory(chatId1, userId1);
  assert(memsUser2.length === 1 && memsUser2[0] === 'I prefer Python', 'MEMORY-03a: User 2 has isolated memory');
  assert(memsUser1Again.length === 2 && !memsUser1Again.includes('I prefer Python'), 'MEMORY-03b: User 1 memory is isolated from User 2');

  // 4. Memory isolation between groups (chatId1 vs chatId2 for userId1)
  db.addUserMemoryFact(chatId2, userId1, 'I live in Tokyo');
  const memsChat2User1 = db.getUserMemory(chatId2, userId1);
  const memsChat1User1 = db.getUserMemory(chatId1, userId1);
  assert(memsChat2User1.length === 1 && memsChat2User1[0] === 'I live in Tokyo', 'MEMORY-04a: Chat 2 memory is isolated');
  assert(memsChat1User1.length === 2 && !memsChat1User1.includes('I live in Tokyo'), 'MEMORY-04b: Chat 1 memory is isolated from Chat 2');

  // 5. Sensitive data rejection
  const sensitiveInputs = [
    'my password is secret123',
    'api_key = sk-proj-123456789abcdefghijklmnopqrstuvwxyz',
    'my credit card is 4532-1111-2222-3333',
    'token bearer abcdefg12345',
    'my ssn is 123-45-6789'
  ];
  for (const input of sensitiveInputs) {
    assert(isSensitiveData(input) === true, `SENSITIVE-01: Correctly detects sensitive data: "${input}"`);
  }
  // Try adding sensitive fact to user memory
  db.addUserMemoryFact(chatId1, userId1, 'my password is secret123');
  const memsAfterSensitive = db.getUserMemory(chatId1, userId1);
  assert(!memsAfterSensitive.includes('my password is secret123'), 'MEMORY-05: Sensitive data is rejected and not added to memory store');

  // Mock telegramApi for command tests
  const originalSendMessage = telegramApi.sendMessage;
  let lastSentText = '';
  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    lastSentText = text;
    return { message_id: 999, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    // 6. /mymemory command test
    const myMemoryHandled = await CommandHandler.handleCommand({
      command: '/mymemory',
      args: [],
      chatId: chatId1,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'User',
      sender: { id: userId1, first_name: 'Alex', is_bot: false },
      message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: chatId1, type: 'supergroup' } }
    });
    assert(myMemoryHandled === true && lastSentText.includes('Alex'), 'COMMAND-01: /mymemory command successfully executes and displays stored memory');

    // 7. /forgetme command test
    const forgetMeHandled = await CommandHandler.handleCommand({
      command: '/forgetme',
      args: [],
      chatId: chatId1,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'User',
      sender: { id: userId1, first_name: 'Alex', is_bot: false },
      message: { message_id: 11, date: Math.floor(Date.now() / 1000), chat: { id: chatId1, type: 'supergroup' } }
    });
    assert(forgetMeHandled === true && db.getUserMemory(chatId1, userId1).length === 0, 'COMMAND-02: /forgetme command successfully clears user memory');

    // 8. /clearmemory admin command test
    const clearMemoryHandled = await CommandHandler.handleCommand({
      command: '/clearmemory',
      args: [],
      chatId: chatId1,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: userId1, first_name: 'Admin', is_bot: false },
      message: { message_id: 12, date: Math.floor(Date.now() / 1000), chat: { id: chatId1, type: 'supergroup' } }
    });
    assert(clearMemoryHandled === true, 'COMMAND-03: /clearmemory admin command executes successfully');

  } finally {
    telegramApi.sendMessage = originalSendMessage;
  }

  console.log(`\n🎉 User Memory Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runUserMemoryTests().catch(err => {
  console.error('User Memory Test Suite Error:', err);
  process.exit(1);
});
