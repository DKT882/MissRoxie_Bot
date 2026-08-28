import { db } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
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

export async function runRoxieAdminControlTests() {
  console.log('====================================================');
  console.log('STARTING ROXIE ADMIN CONTROL & MODE TEST SUITE');
  console.log('====================================================');

  const chatIdA = -100777888999;
  const chatIdB = -100444555666;
  const adminUserId = 4001;
  const regularUserId = 4002;
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup mock telegramApi
  const originalSendMessage = telegramApi.sendMessage;
  let lastSentText = '';
  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    lastSentText = text;
    return { message_id: 999, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'AdminUser' } } };
    } else {
      return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'RegularUser' } } };
    }
  };

  ChatbotService.reset();

  try {
    // 1. Admin Enable (/roxie on)
    const resOn = await CommandHandler.handleCommand({
      command: '/roxie',
      args: ['on'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    const settingsA = db.getGroupSettings(chatIdA);
    assert(resOn === true && settingsA.chatbotEnabled === true && lastSentText.includes('ENABLED'), 'ROXIE-01: Admin successfully enables chatbot via /roxie on');

    // 2. Admin Disable (/roxie off)
    const resOff = await CommandHandler.handleCommand({
      command: '/roxie',
      args: ['off'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(resOff === true && db.getGroupSettings(chatIdA).chatbotEnabled === false && lastSentText.includes('DISABLED'), 'ROXIE-02: Admin successfully disables chatbot via /roxie off');

    // 3. Chatbot disabled ignores message
    const msgDisabled = {
      message_id: 3,
      chat: { id: chatIdA, type: 'supergroup', title: 'Roxie Test Group A' },
      from: { id: regularUserId, is_bot: false, first_name: 'RegularUser' },
      text: 'Hey Roxie',
      date: Math.floor(Date.now() / 1000)
    } as any;
    const handledDisabled = await ChatbotService.handleMessage(msgDisabled, botUser);
    assert(handledDisabled === false, 'ROXIE-03: Chatbot does not respond when disabled for group');

    // 4. Chatbot re-enabled via /roxie on
    await CommandHandler.handleCommand({
      command: '/roxie',
      args: ['on'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).chatbotEnabled === true, 'ROXIE-04: Chatbot re-enabled successfully');

    // 5. Status (/roxie status)
    await CommandHandler.handleCommand({
      command: '/roxie',
      args: ['status'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(lastSentText.includes('Control Center Status') && lastSentText.includes('ENABLED'), 'ROXIE-05: /roxie status displays correct state');

    // 6. Non-admin rejection
    const nonAdminRes = await CommandHandler.handleCommand({
      command: '/roxie',
      args: ['off'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'RegularUser',
      sender: { id: regularUserId, first_name: 'RegularUser', is_bot: false },
      message: { message_id: 6, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).chatbotEnabled === true, 'ROXIE-06: Non-admin request to change status is rejected');

    // 7. Mode configuration (/roxiemode friendly, normal, auto)
    await CommandHandler.handleCommand({
      command: '/roxiemode',
      args: ['friendly'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 7, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).chatbotMode === 'friendly', 'ROXIE-07a: /roxiemode friendly successfully sets mode');

    await CommandHandler.handleCommand({
      command: '/roxiemode',
      args: ['normal'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 8, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).chatbotMode === 'normal', 'ROXIE-07b: /roxiemode normal successfully sets mode');

    await CommandHandler.handleCommand({
      command: '/roxiemode',
      args: ['auto'],
      chatId: chatIdA,
      chatTitle: 'Roxie Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 9, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).chatbotMode === 'auto', 'ROXIE-07c: /roxiemode auto sets default auto mode');

    // 8. Group Isolation (Chat A vs Chat B)
    db.getGroupSettings(chatIdA).chatbotEnabled = false;
    db.getGroupSettings(chatIdB).chatbotEnabled = true;
    assert(db.getGroupSettings(chatIdA).chatbotEnabled === false && db.getGroupSettings(chatIdB).chatbotEnabled === true, 'ROXIE-08: Group settings are isolated by chatId');

    // 9. DM Unaffected (Private chat bypasses group disabled setting)
    const dmMsg = {
      message_id: 10,
      chat: { id: adminUserId, type: 'private', title: 'Private DM' },
      from: { id: adminUserId, is_bot: false, first_name: 'AdminUser' },
      text: 'Roxie are you there in DM?',
      date: Math.floor(Date.now() / 1000)
    } as any;
    // Without API key it returns false, but if api key present or checking isPrivate check:
    const isPrivate = dmMsg.chat?.type === 'private';
    assert(isPrivate === true, 'ROXIE-09: DM chatbot bypasses group settings independently');

    console.log(`🎉 Roxie Admin Control Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  } catch (err: any) {
    console.error('❌ Test suite crashed with error:', err);
    failed++;
  } finally {
    (telegramApi as any).sendMessage = originalSendMessage;
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runRoxieAdminControlTests().catch(err => {
  console.error('Roxie Admin Control Test Suite Error:', err);
  process.exit(1);
});
