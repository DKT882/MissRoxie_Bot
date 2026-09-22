process.env.NODE_ENV = 'test';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
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

async function runTests() {
  console.log('====================================================');
  console.log('STARTING /ALL COMMAND INTEGRATION TEST SUITE');
  console.log('====================================================');

  const chatId = -100999888778;

  // Cache test members
  db.cacheUser({ id: 111, first_name: 'Alice', username: 'alice' }, chatId);
  db.cacheUser({ id: 222, first_name: 'Bob', username: 'bob' }, chatId);
  db.cacheUser({ id: 333, first_name: 'Bot', username: 'testbot' }, chatId); // Bot should be excluded by username filter

  let sentMessages: { text: string; options: any }[] = [];
  const originalSendMessage = telegramApi.sendMessage;
  const originalGetMe = telegramApi.getMe;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalDeleteMessage = telegramApi.deleteMessage;

  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    sentMessages.push({ text, options });
    return { message_id: 100, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  (telegramApi as any).getMe = async () => {
    return { ok: true, result: { id: 999, is_bot: true, username: 'RoxieBot', first_name: 'Roxie' } };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === 12345) {
      return { ok: true, result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } } };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'User' } } };
  };

  let deletedMessageIds: number[] = [];
  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deletedMessageIds.push(mId);
    return { ok: true };
  };

  try {
    // Test 1: ALL-07: Unauthorized member receives permission error
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Regular',
      sender: { id: 777, first_name: 'Regular', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(sentMessages.some(m => m.text.includes('permission') || m.text.includes('administrator')), 'ALL-07: Unauthorized user receives permission error');

    // Test 2: ALL-01 & ALL-03 & ALL-06: Authorized admin sends /all, generates clickable emoji mentions, excludes bot
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    const combinedText = sentMessages.map(m => m.text).join(' ');
    assert(combinedText.includes('tg://user?id=111'), 'ALL-03: Includes clickable emoji tg://user mention for Alice (id: 111)');
    assert(combinedText.includes('tg://user?id=222'), 'ALL-03: Includes clickable emoji tg://user mention for Bob (id: 222)');
    assert(!combinedText.includes('tg://user?id=333'), 'ALL-06: Excludes bot user (id: 333) from mentions');

    // Test 3: ALL-02: Custom message support (/all hello everyone)
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['hello', 'everyone'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    const customCombined = sentMessages.map(m => m.text).join(' ');
    assert(customCombined.includes('hello everyone'), 'ALL-02: /all with custom message includes custom text');
    assert(customCombined.includes('tg://user?id=111') && customCombined.includes('tg://user?id=222'), 'ALL-02: /all custom message includes member mentions');

    // Test 4: ALL-05: Empty member handling when no members found
    const emptyChatId = -888999;
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId: emptyChatId,
      chatTitle: 'Empty Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: emptyChatId, type: 'supergroup' } }
    });
    assert(sentMessages.some(m => m.text.includes('No eligible group members') || m.text.includes('cached group members')), 'ALL-05: Empty member handling returns informative warning');

    console.log(`\n🎉 /all Integration Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getMe = originalGetMe;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.deleteMessage = originalDeleteMessage;
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
