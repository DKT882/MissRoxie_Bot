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
  console.log('🧪 Starting Roxie Phase 10C Warning Escalation Test Suite...');
  console.log('====================================================');

  const chatId = -1009001003;
  let lastMessage = '';
  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    lastMessage = text;
    return { message_id: 102, chat: { id, type: 'supergroup' }, date: Date.now() };
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
    command: '/warnsettings',
    args: ['status']
  });
  assert(lastMessage.includes('Warning Settings'), 'WARN-01: /warnsettings status displays settings');

  await CommandHandler.handleCommand({
    ...ctxBase,
    command: '/warnsettings',
    args: ['action', 'mute']
  });
  const settings = db.getGroupSettings(chatId);
  assert(settings.warnAction === 'mute', 'WARN-02: /warnsettings action updates escalation action');

  console.log(`🎉 Phase 10C Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
