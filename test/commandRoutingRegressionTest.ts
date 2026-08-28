import { CommandHandler } from '../server/telegram/commands.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
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

async function runRegressionTests() {
  console.log('====================================================');
  console.log('STARTING COMMAND ROUTING & CHATBOT REGRESSION TESTS');
  console.log('====================================================');

  const chatId = -100777888999;
  const chatTitle = 'Regression Test Group';
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Enable chatbot so that if a command incorrectly reached chatbot, it would trigger
  const settings = db.getGroupSettings(chatId, chatTitle);
  settings.chatbotEnabled = true;

  const originalSendMessage = telegramApi.sendMessage;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalDeleteMessage = telegramApi.deleteMessage;

  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    return { message_id: 999, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
  };

  (telegramApi as any).deleteMessage = async () => {
    return { ok: true };
  };

  const commandsToTest = [
    '/autodeljoin on',
    '/autodeljoin@MissRoxie_Bot on',
    '/help',
    '/all hello everyone',
    '/free @testuser',
    '/say hello',
    '/mute @user spam',
    '/ban @user spam',
    '/kick @user spam',
    '/schedule 1h test job',
    '/notes',
    '/security on',
    '/antiraid on',
    '/protection on',
    '/roxie on',
    '/roxiemode friendly',
    '/unknowncmdtest'
  ];

  try {
    for (const cmdLine of commandsToTest) {
      const parts = cmdLine.trim().split(/\s+/);
      const rawCommand = parts[0];
      const args = parts.slice(1);

      // Track if chatbot handleMessage is ever invoked
      let chatbotReached = false;
      const originalHandleMessage = ChatbotService.handleMessage;
      (ChatbotService as any).handleMessage = async () => {
        chatbotReached = true;
        return true;
      };

      const ctx = {
        message: {
          message_id: 100,
          chat: { id: chatId, type: 'supergroup', title: chatTitle },
          from: { id: 4001, is_bot: false, first_name: 'Admin', username: 'admin' },
          text: cmdLine,
          date: Math.floor(Date.now() / 1000)
        } as any,
        chatId,
        chatTitle,
        sender: { id: 4001, is_bot: false, first_name: 'Admin' },
        isAnonymousAdmin: false,
        adminDisplayName: '@admin',
        args,
        command: rawCommand
      };

      await CommandHandler.handleCommand(ctx);

      // Restore
      ChatbotService.handleMessage = originalHandleMessage;

      assert(!chatbotReached, `REGRESSION: Command "${cmdLine}" did NOT reach ChatbotService.handleMessage`);
    }

    console.log(`\n🎉 Command Routing Regression Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.deleteMessage = originalDeleteMessage;
  }
}

runRegressionTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
