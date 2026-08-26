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
  console.log('🧪 Starting Roxie Phase 10A Auto Moderation Test Suite...');
  console.log('====================================================');

  const chatId = -1009001001;
  let lastMessage = '';
  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    lastMessage = text;
    return { message_id: 100, chat: { id, type: 'supergroup' }, date: Date.now() };
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

  // 1. /automod on
  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/automod',
    args: ['on']
  });
  let settings = db.getGroupSettings(chatId);
  assert(settings.automodEnabled === true && settings.stopSpamEnabled === true, 'AUTOMOD-01: /automod on enables smart auto moderation');

  // 2. /automod status
  lastMessage = '';
  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/automod',
    args: ['status']
  });
  assert(lastMessage.includes('Enabled'), 'AUTOMOD-02: /automod status reports active state');

  // 3. /automod off
  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/automod',
    args: ['off']
  });
  settings = db.getGroupSettings(chatId);
  assert(settings.automodEnabled === false, 'AUTOMOD-03: /automod off disables auto moderation');

  console.log(`🎉 Phase 10A Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
