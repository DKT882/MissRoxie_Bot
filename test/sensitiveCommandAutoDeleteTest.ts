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

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Sensitive Command Auto-Delete Test Suite...');
  console.log('====================================================');

  const chatId = -100999888;
  let deletedMessages: Array<{ chatId: number; messageId: number }> = [];
  let deleteApiCallCount = 0;
  let deleteMockBehavior: ((cId: number, mId: number) => Promise<{ ok: boolean; description?: string }>) | null = null;

  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deleteApiCallCount++;
    deletedMessages.push({ chatId: cId, messageId: mId });
    if (deleteMockBehavior) {
      return deleteMockBehavior(cId, mId);
    }
    return { ok: true };
  };
  (telegramApi as any).sendMessage = async () => ({ message_id: 100, chat: { id: chatId, type: 'supergroup' }, date: Date.now() });
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === 12345) {
      return {
        ok: true,
        result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } }
      };
    }
    return {
      ok: true,
      result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'Regular Member' } }
    };
  };

  const ctxGroup = (cmd: string, msgId: number, userId: number = 12345) => ({
    chatId,
    chatTitle: 'Group',
    command: cmd,
    args: ['test'],
    isAnonymousAdmin: false,
    adminDisplayName: userId === 12345 ? 'Admin' : 'Regular',
    sender: { id: userId, first_name: userId === 12345 ? 'Admin' : 'Regular', is_bot: false },
    message: { message_id: msgId, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' as const } }
  });

  const ctxPrivate = (cmd: string, msgId: number) => ({
    chatId: 12345,
    chatTitle: 'Private',
    command: cmd,
    args: ['test'],
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: msgId, date: Math.floor(Date.now() / 1000), chat: { id: 12345, type: 'private' as const } }
  });

  // Test 1: /say in group deletes immediately without artificial delay
  deletedMessages = [];
  deleteApiCallCount = 0;
  await CommandHandler.handleCommand(ctxGroup('/say', 101));
  assert(deletedMessages.some(d => d.messageId === 101), 'SENSITIVE-01: /say command message is deleted immediately in group');

  // Test 2: /ban in group deletes immediately without 4.5s delay
  deletedMessages = [];
  deleteApiCallCount = 0;
  await CommandHandler.handleCommand(ctxGroup('/ban', 102));
  assert(deletedMessages.some(d => d.messageId === 102), 'SENSITIVE-02: /ban command message is deleted immediately in group');

  // Test 3: /help (normal public command) in group is auto-deleted immediately
  deletedMessages = [];
  deleteApiCallCount = 0;
  await CommandHandler.handleCommand(ctxGroup('/help', 103));
  assert(deletedMessages.some(d => d.messageId === 103), 'SENSITIVE-03: /help (public command) message is auto-deleted immediately in group');

  // Test 4: /ban in private chat is NOT deleted (group only rule)
  deletedMessages = [];
  deleteApiCallCount = 0;
  await CommandHandler.handleCommand(ctxPrivate('/ban', 104));
  assert(!deletedMessages.some(d => d.messageId === 104), 'SENSITIVE-04: /ban in private chat is NOT auto-deleted');

  // Test 5: Unauthorized member executing admin command (/ban) is rejected and NOT deleted
  deletedMessages = [];
  deleteApiCallCount = 0;
  await CommandHandler.handleCommand(ctxGroup('/ban', 105, 99999));
  assert(!deletedMessages.some(d => d.messageId === 105), 'SENSITIVE-05: Unauthorized user command is rejected and NOT deleted');

  // Test 6: Deduplication prevents duplicate deleteMessage API calls for the same message
  deleteApiCallCount = 0;
  deletedMessages = [];
  const del1 = await CommandHandler.deleteCommandMessage(chatId, 201, 'ban');
  const del2 = await CommandHandler.deleteCommandMessage(chatId, 201, 'ban');
  assert(del1 === true && del2 === true, 'SENSITIVE-06A: Both deduplicated deletion calls return success');
  assert(deleteApiCallCount === 1, 'SENSITIVE-06B: Telegram deleteMessage was called exactly once for message 201');

  // Test 7: Telegram API deletion errors (message already deleted / lacks permissions) handled gracefully
  deleteMockBehavior = async () => {
    return { ok: false, description: 'Bad Request: message to delete not found' };
  };
  const errorHandled = await CommandHandler.deleteCommandMessage(chatId, 301, 'ban');
  assert(errorHandled === false, 'SENSITIVE-07: Telegram API deletion error handled gracefully without throwing');
  deleteMockBehavior = null;

  // Test 8: Telegram API network exception handled gracefully
  deleteMockBehavior = async () => {
    throw new Error('Telegram network connection reset');
  };
  const exceptionHandled = await CommandHandler.deleteCommandMessage(chatId, 302, 'ban');
  assert(exceptionHandled === false, 'SENSITIVE-08: Network exception handled gracefully without throwing');
  deleteMockBehavior = null;

  console.log(`🎉 Sensitive Command Auto-Delete Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
