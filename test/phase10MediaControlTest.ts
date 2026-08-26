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
  console.log('🧪 Starting Roxie Phase 10B Media Control Test Suite...');
  console.log('====================================================');

  const chatId = -1009001002;
  let lastMessage = '';
  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    lastMessage = text;
    return { message_id: 101, chat: { id, type: 'supergroup' }, date: Date.now() };
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

  // Test /gif off / gif on
  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/gif',
    args: ['off']
  });
  let settings = db.getGroupSettings(chatId);
  assert(settings.gifsProtection === false, 'MEDIA-01: /gif off updates setting');

  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/gif',
    args: ['on']
  });
  settings = db.getGroupSettings(chatId);
  assert(settings.gifsProtection === true, 'MEDIA-02: /gif on updates setting');

  // Test /media status
  lastMessage = '';
  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/media',
    args: ['status']
  });
  assert(lastMessage.includes('Media Protection Status'), 'MEDIA-03: /media status displays media toggles');

  console.log(`🎉 Phase 10B Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
