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

async function runHelpTests() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie /help & Command Dispatch Test Suite...');
  console.log('====================================================');

  let sentMessages: string[] = [];
  (telegramApi as any).sendMessage = async (chatId: number, text: string) => {
    sentMessages.push(text);
    return { message_id: 999, chat: { id: chatId, type: chatId > 0 ? 'private' : 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).getChatMember = async () => ({
    ok: true,
    result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } }
  });

  // Test 1: /help in group/supergroup
  sentMessages = [];
  const groupCtx = {
    chatId: -100123456789,
    chatTitle: 'Test Supergroup',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: -100123456789, type: 'supergroup' as const } },
    command: '/help',
    args: []
  };
  let handled = await CommandHandler.handleCommand(groupCtx);
  const hasAdminCenter = sentMessages.some(m => m.includes('Roxie Admin Command Center'));
  assert(handled && hasAdminCenter, 'HELP-01: /help in supergroup returns command center');

  // Test 2: /help in private chat (DM)
  sentMessages = [];
  const dmCtx = {
    chatId: 12345,
    chatTitle: 'DM Chat',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: 12345, type: 'private' as const } },
    command: '/help',
    args: []
  };
  handled = await CommandHandler.handleCommand(dmCtx);
  const hasRoxieDM = sentMessages.some(m => m.includes('Roxie'));
  assert(handled && hasRoxieDM, 'HELP-02: /help in private chat (DM) succeeds without Group Command Only error');

  // Test 3: /help@MissRoxie_Bot
  sentMessages = [];
  const mentionCtx = {
    chatId: -100123456789,
    chatTitle: 'Test Supergroup',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: -100123456789, type: 'supergroup' as const } },
    command: '/help@MissRoxie_Bot',
    args: []
  };
  handled = await CommandHandler.handleCommand(mentionCtx);
  const hasMentionHelp = sentMessages.some(m => m.includes('Roxie'));
  assert(handled && hasMentionHelp, 'HELP-03: /help@MissRoxie_Bot strips bot username and responds successfully');

  // Test 4: /help ban (command argument)
  sentMessages = [];
  const argCmdCtx = {
    chatId: -100123456789,
    chatTitle: 'Test Supergroup',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: -100123456789, type: 'supergroup' as const } },
    command: '/help',
    args: ['ban']
  };
  handled = await CommandHandler.handleCommand(argCmdCtx);
  const hasBanHelp = sentMessages.some(m => m.includes('Command Help: /ban'));
  assert(handled && hasBanHelp, 'HELP-04: /help ban provides specific command help');

  // Test 5: /help Moderation (category argument)
  sentMessages = [];
  const argCatCtx = {
    chatId: -100123456789,
    chatTitle: 'Test Supergroup',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: -100123456789, type: 'supergroup' as const } },
    command: '/help',
    args: ['Moderation']
  };
  handled = await CommandHandler.handleCommand(argCatCtx);
  const hasModCat = sentMessages.some(m => m.includes('Category: Moderation'));
  assert(handled && hasModCat, 'HELP-05: /help Moderation provides category help');

  // Test 6: Other existing commands (/ping, /rules)
  const pingCtx = {
    ...groupCtx,
    command: '/ping',
    args: []
  };
  handled = await CommandHandler.handleCommand(pingCtx);
  assert(handled, 'DISPATCH-01: /ping command executes successfully');

  const rulesCtx = {
    ...groupCtx,
    command: '/rules',
    args: []
  };
  handled = await CommandHandler.handleCommand(rulesCtx);
  assert(handled, 'DISPATCH-02: /rules command executes successfully');

  console.log(`====================================================`);
  console.log(`🎉 /help Tests Completed: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runHelpTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
