process.env.NODE_ENV = 'test';
import { registerBotCommands, CommandHandler } from '../server/telegram/commands.js';
import { getCommandsForTelegramScope, COMMAND_CATALOG } from '../server/telegram/commandCatalog.js';
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
  console.log('STARTING ADMIN COMMAND MENU VISIBILITY TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------------------
  // Test 1: getCommandsForTelegramScope('all_chat_administrators')
  // ----------------------------------------------------------------
  console.log('--- Test 1: Administrator command scope derivation ---');
  const adminCommands = getCommandsForTelegramScope('all_chat_administrators');
  const adminCmdNames = adminCommands.map(c => c.command);

  assert(adminCommands.length > 0, `Admin commands list is non-empty (got ${adminCommands.length})`);
  assert(adminCommands.length <= 100, `Admin commands list satisfies Telegram <= 100 constraint (got ${adminCommands.length})`);
  assert(adminCmdNames.includes('all'), 'all_chat_administrators contains /all');
  assert(adminCmdNames.includes('stopall'), 'all_chat_administrators contains /stopall');
  assert(adminCmdNames.includes('ban'), 'all_chat_administrators contains /ban');
  assert(adminCmdNames.includes('mute'), 'all_chat_administrators contains /mute');
  assert(adminCmdNames.includes('kick'), 'all_chat_administrators contains /kick');
  assert(adminCmdNames.includes('warn'), 'all_chat_administrators contains /warn');
  assert(adminCmdNames.includes('help'), 'all_chat_administrators includes group public /help');
  assert(adminCmdNames.includes('rules'), 'all_chat_administrators includes group public /rules');

  // Verify zero duplicates
  const uniqueAdminNames = new Set(adminCmdNames);
  assert(uniqueAdminNames.size === adminCmdNames.length, 'Zero duplicate command names in all_chat_administrators');

  // ----------------------------------------------------------------
  // Test 2: getCommandsForTelegramScope('all_group_chats') (Ordinary members)
  // ----------------------------------------------------------------
  console.log('\n--- Test 2: Ordinary group-member command scope derivation ---');
  const groupCommands = getCommandsForTelegramScope('all_group_chats');
  const groupCmdNames = groupCommands.map(c => c.command);

  assert(groupCommands.length === 0, `Group member command list is completely empty (got ${groupCommands.length})`);
  assert(!groupCmdNames.includes('all'), 'Ordinary members DO NOT see /all in menu');
  assert(!groupCmdNames.includes('stopall'), 'Ordinary members DO NOT see /stopall in menu');
  assert(!groupCmdNames.includes('ban'), 'Ordinary members DO NOT see /ban in menu');
  assert(!groupCmdNames.includes('mute'), 'Ordinary members DO NOT see /mute in menu');
  assert(!groupCmdNames.includes('kick'), 'Ordinary members DO NOT see /kick in menu');
  assert(!groupCmdNames.includes('warn'), 'Ordinary members DO NOT see /warn in menu');
  assert(!groupCmdNames.includes('del'), 'Ordinary members DO NOT see /del in menu');
  assert(!groupCmdNames.includes('clear'), 'Ordinary members DO NOT see /clear in menu');
  assert(!groupCmdNames.includes('promote'), 'Ordinary members DO NOT see /promote in menu');
  assert(!groupCmdNames.includes('demote'), 'Ordinary members DO NOT see /demote in menu');
  assert(!groupCmdNames.includes('slowmode'), 'Ordinary members DO NOT see /slowmode in menu');
  assert(!groupCmdNames.includes('help'), 'Ordinary members DO NOT see /help in menu');
  assert(!groupCmdNames.includes('settings'), 'Ordinary members DO NOT see /settings in menu');
  assert(!groupCmdNames.includes('report'), 'Ordinary members DO NOT see /report in menu');
  assert(!groupCmdNames.includes('rules'), 'Ordinary members DO NOT see /rules in menu');
  assert(!groupCmdNames.includes('forgetme'), 'Ordinary members DO NOT see /forgetme in menu');

  // ----------------------------------------------------------------
  // Test 3: getCommandsForTelegramScope('all_private_chats')
  // ----------------------------------------------------------------
  console.log('\n--- Test 3: Private chats command scope derivation ---');
  const privateCommands = getCommandsForTelegramScope('all_private_chats');
  const privateCmdNames = privateCommands.map(c => c.command);

  assert(privateCommands.length > 0, `Private chat command list is non-empty (got ${privateCommands.length})`);
  assert(privateCommands.length <= 100, `Private chat command list satisfies <= 100 constraint (got ${privateCommands.length})`);
  assert(!privateCmdNames.includes('all'), 'Private chats DO NOT include /all');
  assert(!privateCmdNames.includes('stopall'), 'Private chats DO NOT include /stopall');
  assert(!privateCmdNames.includes('ban'), 'Private chats DO NOT include /ban');
  assert(privateCmdNames.includes('help'), 'Private chats include /help');
  assert(privateCmdNames.includes('settings'), 'Private chats include /settings');

  // ----------------------------------------------------------------
  // Test 4: getCommandsForTelegramScope('default') (Fallback Scope)
  // ----------------------------------------------------------------
  console.log('\n--- Test 4: Default fallback scope derivation ---');
  const defaultCommands = getCommandsForTelegramScope('default');
  const defaultCmdNames = defaultCommands.map(c => c.command);

  assert(defaultCommands.length === 0, `Default fallback command list is completely empty (got ${defaultCommands.length})`);
  assert(!defaultCmdNames.includes('all'), 'Default scope DOES NOT include /all');
  assert(!defaultCmdNames.includes('stopall'), 'Default scope DOES NOT include /stopall');
  assert(!defaultCmdNames.includes('ban'), 'Default scope DOES NOT include /ban');
  assert(!defaultCmdNames.includes('mute'), 'Default scope DOES NOT include /mute');
  assert(!defaultCmdNames.includes('kick'), 'Default scope DOES NOT include /kick');
  assert(!defaultCmdNames.includes('help'), 'Default scope DOES NOT include /help');
  assert(!defaultCmdNames.includes('settings'), 'Default scope DOES NOT include /settings');

  // ----------------------------------------------------------------
  // Test 5: registerBotCommands API interaction and scope payloads
  // ----------------------------------------------------------------
  console.log('\n--- Test 5: registerBotCommands API dispatch verification ---');
  const originalSetMyCommands = telegramApi.setMyCommands;
  const originalDeleteMyCommands = telegramApi.deleteMyCommands;

  const registeredScopes: Array<{ scope: any; commands: any[] }> = [];
  const deletedScopes: Array<{ scope: any; language_code?: string }> = [];

  (telegramApi as any).setMyCommands = async (commands: any[], scope?: any) => {
    registeredScopes.push({ scope, commands });
    return { ok: true, result: true };
  };

  (telegramApi as any).deleteMyCommands = async (scope?: any, language_code?: string) => {
    deletedScopes.push({ scope, language_code });
    return { ok: true, result: true };
  };

  const regResult = await registerBotCommands();

  assert(regResult.adminCommandsSet === true, 'adminCommandsSet returned true');
  assert(regResult.groupCommandsSet === true, 'groupCommandsSet returned true');
  assert(regResult.privateCommandsSet === true, 'privateCommandsSet returned true');
  assert(regResult.defaultCommandsSet === true, 'defaultCommandsSet returned true');
  assert(regResult.errors === undefined, 'No registration errors occurred');

  // Verify each scope was sent to Telegram with correct payload
  const adminScopeReg = registeredScopes.find(r => r.scope?.type === 'all_chat_administrators');
  const groupScopeReg = registeredScopes.find(r => r.scope?.type === 'all_group_chats');
  const privateScopeReg = registeredScopes.find(r => r.scope?.type === 'all_private_chats');
  const defaultScopeReg = registeredScopes.find(r => r.scope?.type === 'default');

  assert(Boolean(adminScopeReg), 'all_chat_administrators scope was registered with Telegram');
  assert(Boolean(groupScopeReg), 'all_group_chats scope was registered with Telegram');
  assert(Boolean(privateScopeReg), 'all_private_chats scope was registered with Telegram');
  assert(Boolean(defaultScopeReg), 'default scope was registered with Telegram');

  assert(adminScopeReg?.commands.length === 97, `all_chat_administrators contains 97 admin commands (got ${adminScopeReg?.commands.length})`);
  assert(adminScopeReg?.commands.some(c => c.command === 'all'), 'all_chat_administrators registration payload contains all');
  assert(adminScopeReg?.commands.some(c => c.command === 'stopall'), 'all_chat_administrators registration payload contains stopall');
  assert(groupScopeReg?.commands.length === 0, 'all_group_chats registration payload is completely empty (0 commands)');
  assert(privateScopeReg?.commands.length === 5, 'all_private_chats registration payload contains 5 commands');
  assert(defaultScopeReg?.commands.length === 0, 'default registration payload is completely empty (0 commands)');

  // Verify no more-specific scopes (like chat or chat_member) were registered
  const invalidScopeReg = registeredScopes.find(r => r.scope?.type === 'chat' || r.scope?.type === 'chat_member');
  assert(!invalidScopeReg, 'No more-specific chat or chat_member scopes were registered');

  // ----------------------------------------------------------------
  // Test 6: registerBotCommands handles API failures gracefully
  // ----------------------------------------------------------------
  console.log('\n--- Test 6: Error handling when Telegram API fails ---');
  (telegramApi as any).setMyCommands = async (commands: any[], scope?: any) => {
    if (scope?.type === 'all_chat_administrators') {
      return { ok: false, error_code: 400, description: 'Bad Request: test error' };
    }
    return { ok: true, result: true };
  };

  const failResult = await registerBotCommands();
  assert(failResult.adminCommandsSet === false, 'adminCommandsSet reports false on API failure');
  assert(failResult.groupCommandsSet === true, 'groupCommandsSet reports true for successful scopes');
  assert(failResult.errors !== undefined && failResult.errors.length > 0, 'Useful error message recorded in errors array');
  assert(failResult.errors![0].includes('test error'), 'Error description includes Telegram API failure reason');

  // Restore original methods
  (telegramApi as any).setMyCommands = originalSetMyCommands;
  (telegramApi as any).deleteMyCommands = originalDeleteMyCommands;

  // ----------------------------------------------------------------
  // Test 7: Server-side authorization remains strictly enforced
  // ----------------------------------------------------------------
  console.log('\n--- Test 7: Server-side authorization check enforcement ---');
  const sentMessages: string[] = [];
  (telegramApi as any).sendMessage = async (cId: number, text: string) => {
    sentMessages.push(text);
    return { ok: true, result: { message_id: 999 } };
  };
  (telegramApi as any).getChatMember = async () => ({
    ok: true,
    result: { status: 'member', user: { id: 777999, is_bot: false, first_name: 'RegularUser' } }
  });

  sentMessages.length = 0;
  await CommandHandler.handleCommand({
    command: '/all',
    args: ['Test unauthorized'],
    chatId: -10099494699,
    chatTitle: 'Test Group',
    isAnonymousAdmin: false,
    adminDisplayName: 'RegularUser',
    sender: { id: 777999, first_name: 'RegularUser', is_bot: false },
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: -10099494699, type: 'supergroup' } }
  });

  assert(sentMessages.length === 1, 'Manual typed /all was intercepted by server-side authorization');
  assert(sentMessages[0].includes("permission") || sentMessages[0].includes("administrators"), 'Server-side denied unauthorized execution of /all');

  sentMessages.length = 0;
  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: -10099494699,
    chatTitle: 'Test Group',
    isAnonymousAdmin: false,
    adminDisplayName: 'RegularUser',
    sender: { id: 777999, first_name: 'RegularUser', is_bot: false },
    message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: -10099494699, type: 'supergroup' } }
  });

  assert(sentMessages.length === 1, 'Manual typed /stopall was intercepted by server-side authorization');
  assert(sentMessages[0].includes("permission") || sentMessages[0].includes("administrators"), 'Server-side denied unauthorized execution of /stopall');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
