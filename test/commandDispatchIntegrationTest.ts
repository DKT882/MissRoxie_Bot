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
  console.log('STARTING COMMAND DISPATCH INTEGRATION TEST SUITE');
  console.log('====================================================');

  const chatId = -100111222333;
  let invokedHandler = '';

  const originalSendMessage = telegramApi.sendMessage;
  const originalGetChatMember = telegramApi.getChatMember;

  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    return { message_id: 500, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    // DISPATCH-06: Unknown command returns false
    const unknownHandled = await CommandHandler.handleCommand({
      command: '/unknowncmd12345',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(unknownHandled === false, 'DISPATCH-06: Unknown command returns false');

    // DISPATCH-05: /command@BotName parsing works (/note@RoxieBot testkey testval)
    const botSuffixHandled = await CommandHandler.handleCommand({
      command: '/note@RoxieBot',
      args: ['dispatchkey', 'dispatchval'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(botSuffixHandled === true, 'DISPATCH-05: /command@BotName parsing correctly normalizes and dispatches command');

    // DISPATCH-01, 02, 03, 04: /note, /notes, /delnote, /all dispatch successfully
    const commandsToTest = ['/note', '/notes', '/delnote', '/all', '/getnote', '/clearmemory'];
    for (const cmd of commandsToTest) {
      const res = await CommandHandler.handleCommand({
        command: cmd,
        args: ['dispatchkey'],
        chatId,
        chatTitle: 'Test Group',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin',
        sender: { id: 12345, first_name: 'Admin', is_bot: false },
        message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
      });
      assert(res === true, `DISPATCH: ${cmd} reaches dispatcher and handles successfully`);
    }

    console.log(`\n🎉 Command Dispatch Integration Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getChatMember = originalGetChatMember;
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
