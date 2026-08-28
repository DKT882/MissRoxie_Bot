import { db } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { SmartProtectionService } from '../server/telegram/smartProtection.js';
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

export async function runSmartProtectionTests() {
  console.log('====================================================');
  console.log('STARTING SMART USER PROTECTION TEST SUITE (PHASE 17)');
  console.log('====================================================');

  const chatIdA = -100999888777;
  const chatIdB = -100111222333;
  const adminUserId = 5001;
  const regularUserId = 5002;
  const spamUserId = 5003;

  // Mock telegramApi
  let deletedMessages: number[] = [];
  let sentMessages: string[] = [];

  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deletedMessages.push(mId);
    return true;
  };
  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    sentMessages.push(text);
    return { message_id: 999, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return { ok: true, result: { status: 'administrator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'Regular' } } };
  };
  (telegramApi as any).getMe = async () => ({ ok: true, result: { id: 12345, is_bot: true, first_name: 'Roxie', username: 'RoxieBot' } });
  (telegramApi as any).restrictChatMember = async () => true;

  SmartProtectionService.reset();
  (db as any).data.warnings = [];

  try {
    const settingsA = db.getGroupSettings(chatIdA, 'Group A');
    settingsA.protectionEnabled = true;
    settingsA.protectionFloodCount = 3;
    settingsA.protectionFloodWindow = 10;
    settingsA.protectionDuplicateLimit = 3;
    settingsA.protectionLinkBurstLimit = 2;
    db.scheduleSave();

    // 1. Group Isolation & Disabled Protection Test (/protection off)
    const settingsB = db.getGroupSettings(chatIdB, 'Group B');
    settingsB.protectionEnabled = false;
    db.scheduleSave();

    // Send rapid messages in Group B (disabled protection) should not trigger protection
    for (let i = 0; i < 5; i++) {
      const msg = {
        message_id: 10 + i,
        chat: { id: chatIdB, type: 'supergroup', title: 'Group B' },
        from: { id: spamUserId, is_bot: false, first_name: 'Spammer' },
        text: 'hello spam',
        date: Math.floor(Date.now() / 1000)
      } as any;
      await SmartProtectionService.handleMessage(msg);
    }
    assert(db.getUserWarnings(chatIdB, spamUserId).length === 0, 'PROT-01: Disabled protection on Group B does not flag spam (Group Isolation)');

    // Re-enable protection on Group A via command
    await CommandHandler.handleCommand({
      command: '/protection',
      args: ['on'],
      chatId: chatIdA,
      chatTitle: 'Group A',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: adminUserId, first_name: 'Admin', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatIdA, type: 'supergroup' } }
    });
    assert(db.getGroupSettings(chatIdA).protectionEnabled === true, 'PROT-02: Admin successfully enables protection via /protection on');

    // 2. Admin Exemption Test
    for (let i = 0; i < 5; i++) {
      const adminMsg = {
        message_id: 20 + i,
        chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
        from: { id: adminUserId, is_bot: false, first_name: 'Admin' },
        text: 'admin fast message',
        date: Math.floor(Date.now() / 1000)
      } as any;
      const handled = await SmartProtectionService.handleMessage(adminMsg);
      assert(handled === false, `PROT-03: Admin message ${i} is exempt from protection`);
    }
    assert(db.getUserWarnings(chatIdA, adminUserId).length === 0, 'PROT-04: Admin received zero warnings for rapid messages');

    // 3. Smart Flood Detection Test
    deletedMessages = [];
    sentMessages = [];
    for (let i = 0; i < 4; i++) {
      const floodMsg = {
        message_id: 100 + i,
        chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
        from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
        text: `flood msg ${i}`,
        date: Math.floor(Date.now() / 1000)
      } as any;
      await SmartProtectionService.handleMessage(floodMsg);
    }
    assert(deletedMessages.length > 0, 'PROT-05: Smart flood detection intercepts rapid messages and deletes them');
    assert(db.getUserWarnings(chatIdA, regularUserId).length > 0, 'PROT-06: Warning issued on flood detection');

    // 4. Duplicate Message Detection Test
    (db as any).data.warnings = [];
    SmartProtectionService.reset();
    deletedMessages = [];
    for (let i = 0; i < 3; i++) {
      const dupMsg = {
        message_id: 200 + i,
        chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
        from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
        text: 'buy crypto now!!',
        date: Math.floor(Date.now() / 1000)
      } as any;
      await SmartProtectionService.handleMessage(dupMsg);
    }
    assert(deletedMessages.length > 0, 'PROT-07: Duplicate message detection intercepts repeated identical text');

    // 5. Link / Spam Burst Detection Test
    SmartProtectionService.reset();
    deletedMessages = [];
    for (let i = 0; i < 3; i++) {
      const linkMsg = {
        message_id: 300 + i,
        chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
        from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
        text: `Check out https://scam-site-${i}.com for free crypto`,
        date: Math.floor(Date.now() / 1000)
      } as any;
      await SmartProtectionService.handleMessage(linkMsg);
    }
    assert(deletedMessages.length > 0, 'PROT-08: Link spam burst detection intercepts rapid promotional links');

    // 6. Chatbot & Scheduled Message Compatibility Tests
    SmartProtectionService.reset();
    const botMsg = {
      message_id: 400,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: 99999, is_bot: true, first_name: 'RoxieBot', username: 'Roxie_Bot' },
      text: 'Hello from Roxie',
      date: Math.floor(Date.now() / 1000)
    } as any;
    const botHandled = await SmartProtectionService.handleMessage(botMsg);
    assert(botHandled === false, 'PROT-09: Chatbot / bot messages are compatible and never intercepted');

    const scheduledMsg = {
      message_id: 401,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: adminUserId, is_bot: false, first_name: 'Admin' },
      text: 'Scheduled broadcast message',
      isScheduled: true,
      date: Math.floor(Date.now() / 1000)
    } as any;
    const schedHandled = await SmartProtectionService.handleMessage(scheduledMsg);
    assert(schedHandled === false, 'PROT-10: Scheduled messages are compatible and never intercepted');

    const commandMsg = {
      message_id: 402,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
      text: '/help',
      date: Math.floor(Date.now() / 1000)
    } as any;
    const cmdHandled = await SmartProtectionService.handleMessage(commandMsg);
    assert(cmdHandled === false, 'PROT-11: Admin/user commands are compatible and never intercepted');

    // 7. Warning & Mute Escalation Test
    (db as any).data.warnings = [];
    SmartProtectionService.reset();
    // 1st, 2nd, 3rd messages to trigger flood count = 3
    await SmartProtectionService.handleMessage({
      message_id: 500,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
      text: 'spam 1',
      date: Math.floor(Date.now() / 1000)
    } as any);
    await SmartProtectionService.handleMessage({
      message_id: 501,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
      text: 'spam 2',
      date: Math.floor(Date.now() / 1000)
    } as any);
    await SmartProtectionService.handleMessage({
      message_id: 502,
      chat: { id: chatIdA, type: 'supergroup', title: 'Group A' },
      from: { id: regularUserId, is_bot: false, first_name: 'Regular' },
      text: 'spam 3',
      date: Math.floor(Date.now() / 1000)
    } as any);
    const warns = db.getUserWarnings(chatIdA, regularUserId);
    assert(warns.length >= 1, 'PROT-12: Warning escalation increments warning count');

  } catch (err) {
    console.error('❌ Smart Protection Test Error:', err);
    failed++;
  }

  console.log('====================================================');
  console.log(`SMART PROTECTION TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');
  return failed === 0;
}

if (process.argv[1] && process.argv[1].includes('smartProtectionTest')) {
  runSmartProtectionTests();
}

