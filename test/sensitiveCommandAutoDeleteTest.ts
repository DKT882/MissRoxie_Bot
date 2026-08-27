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

  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deletedMessages.push({ chatId: cId, messageId: mId });
    return { ok: true };
  };
  (telegramApi as any).sendMessage = async () => ({ message_id: 100, chat: { id: chatId, type: 'supergroup' }, date: Date.now() });
  (telegramApi as any).getChatMember = async () => ({
    ok: true,
    result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } }
  });

  const ctxGroup = (cmd: string, msgId: number) => ({
    chatId,
    chatTitle: 'Group',
    command: cmd,
    args: ['test'],
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
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

  // Test 1: /say in group deletes after ~1s
  deletedMessages = [];
  await CommandHandler.handleCommand(ctxGroup('/say', 101));
  assert(deletedMessages.length === 0, 'SENSITIVE-01: /say message not deleted immediately');
  await new Promise((r) => setTimeout(r, 1200));
  assert(deletedMessages.some(d => d.messageId === 101), 'SENSITIVE-02: /say message deleted after 1s delay');

  // Test 2: /ban in group deletes after ~4.5s
  deletedMessages = [];
  await CommandHandler.handleCommand(ctxGroup('/ban', 102));
  assert(deletedMessages.length === 0, 'SENSITIVE-03: /ban message not deleted immediately');
  await new Promise((r) => setTimeout(r, 3800));
  assert(deletedMessages.length === 0, 'SENSITIVE-04: /ban message not deleted before 4.5s');
  await new Promise((r) => setTimeout(r, 1000));
  assert(deletedMessages.some(d => d.messageId === 102), 'SENSITIVE-05: /ban message deleted after 4.5s delay');

  // Test 3: /help (normal public command) in group is NOT deleted
  deletedMessages = [];
  await CommandHandler.handleCommand(ctxGroup('/help', 103));
  await new Promise((r) => setTimeout(r, 5000));
  assert(!deletedMessages.some(d => d.messageId === 103), 'SENSITIVE-06: /help (public command) message is NOT auto-deleted');

  // Test 4: /ban in private chat is NOT deleted (group only rule)
  deletedMessages = [];
  await CommandHandler.handleCommand(ctxPrivate('/ban', 104));
  await new Promise((r) => setTimeout(r, 5000));
  assert(!deletedMessages.some(d => d.messageId === 104), 'SENSITIVE-07: /ban in private chat is NOT auto-deleted');

  console.log(`🎉 Sensitive Command Auto-Delete Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
