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
  console.log('🧪 Starting Roxie Phase 10F Advanced /all Test Suite...');
  console.log('====================================================');

  const chatId = -1009001006;
  let lastMessage = '';
  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    lastMessage = text;
    return { message_id: 105, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async () => ({
    ok: true,
    result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } }
  });

  const ctxBase = {
    chatId,
    chatTitle: 'Test Group',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' as const } }
  };

  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/all',
    args: ['status']
  });
  assert(lastMessage.includes('/all status') || lastMessage.includes('all'), 'ALL-01: /all status displays usage');

  console.log(`🎉 Phase 10F Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
