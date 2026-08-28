import { db } from '../server/db/storage.js';
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

export async function runAdvancedConfigTests() {
  console.log('====================================================');
  console.log('STARTING PHASE 18 ADVANCED GROUP CONFIGURATION TEST SUITE');
  console.log('====================================================');

  const chatIdA = -100555666777;
  const chatIdB = -100888999000;
  const adminUserId = 4001;
  const regularUserId = 4002;

  // Mock telegramApi
  let lastSentText = '';
  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    lastSentText = text;
    return { message_id: 100, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'AdminUser' } } };
    } else {
      return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'RegularUser' } } };
    }
  };

  try {
    // 1. Admin Access & Overview (/settings)
    const resOverview = await CommandHandler.handleCommand({
      command: '/settings',
      args: [],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(resOverview === true && lastSentText.includes('Centralized Group Configuration'), 'CFG-01: Admin successfully views centralized /settings overview');

    // 2. Non-admin rejection on configuration change
    const resNonAdmin = await CommandHandler.handleCommand({
      command: '/settings',
      args: ['chatbot', 'off'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'RegularUser',
      sender: { id: regularUserId, first_name: 'RegularUser', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(resNonAdmin === true && lastSentText.includes('requires administrator privileges'), 'CFG-02: Non-admin configuration change is rejected');

    // 3. Chatbot Settings (/settings chatbot on / mode)
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['chatbot', 'on'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    let sA = db.getGroupSettings(chatIdA);
    assert(sA.chatbotEnabled === true, 'CFG-03a: Chatbot enabled via /settings chatbot on');

    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['chatbot', 'mode', 'friendly'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    sA = db.getGroupSettings(chatIdA);
    assert(sA.chatbotMode === 'friendly', 'CFG-03b: Chatbot mode set to friendly via /settings chatbot mode');

    // 4. Protection Settings (/settings protection on / flood / duplicate / link)
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['protection', 'on'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['protection', 'flood', '6', '8'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 6, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['protection', 'duplicate', '4'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 7, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['protection', 'link', '2'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 8, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    sA = db.getGroupSettings(chatIdA);
    assert(sA.protectionEnabled === true && sA.protectionFloodCount === 6 && sA.protectionFloodWindow === 8 && sA.protectionDuplicateLimit === 4 && sA.protectionLinkBurstLimit === 2, 'CFG-04: Protection settings successfully configured and persisted');

    // 5. Welcome Settings (/settings welcome on / autodelete)
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['welcome', 'on'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 9, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['welcome', 'autodelete', 'on'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    sA = db.getGroupSettings(chatIdA);
    assert(sA.welcomeEnabled === true && sA.goodbyeEnabled === true && sA.autoDeleteJoinLeave === true, 'CFG-05: Welcome and auto-delete settings successfully configured');

    // 6. Moderation Settings (/settings moderation warn_limit / warn_action / mute_duration)
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['moderation', 'warn_limit', '4'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 11, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['moderation', 'warn_action', 'mute'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 12, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    await CommandHandler.handleCommand({
      command: '/settings',
      args: ['moderation', 'mute_duration', '600'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 13, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    sA = db.getGroupSettings(chatIdA);
    assert(sA.warnLimit === 4 && sA.warnAction === 'mute' && sA.warnExpireSeconds === 600, 'CFG-06: Moderation settings successfully configured');

    // 7. Group Isolation (Group B settings remain untouched)
    const sB = db.getGroupSettings(chatIdB, 'Config Test Group B');
    assert(sB.warnLimit === 3 && sB.protectionFloodCount === 5, 'CFG-07: Group settings are strictly isolated by chatId');

    // 8. Existing commands remaining functional (/chatbot, /protection, /welcome)
    const resLegacy = await CommandHandler.handleCommand({
      command: '/chatbot',
      args: ['status'],
      chatId: chatIdA,
      chatTitle: 'Config Test Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
      message: { message_id: 14, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(resLegacy === true && lastSentText.includes('Roxie AI Chatbot Status'), 'CFG-08: Existing legacy commands remain fully functional and backward compatible');

    console.log('====================================================');
    console.log(`TOTAL PASSED: ${passed} / ${passed + failed}`);
    console.log(`TOTAL FAILED: ${failed}`);
    console.log('====================================================');
    return failed === 0;
  } catch (err) {
    console.error('❌ Advanced Config Test Suite Exception:', err);
    return false;
  }
}

if (process.argv[1] && process.argv[1].includes('phase18AdvancedConfigTest')) {
  runAdvancedConfigTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
