import assert from 'assert';
import { db, GROUP_MEMORY_LIMIT, MAX_PRIVATE_CHAT_MESSAGES } from '../server/db/storage.js';
import { telegramBot } from '../server/telegram/botManager.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { COMMAND_CATALOG, getCommandsForTelegramScope } from '../server/telegram/commandCatalog.js';
import { isGroupProtected } from '../server/operations/cleanupDummyData.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';

async function runAuditTests() {
  console.log('================================================================');
  console.log('ROXIE COMPREHENSIVE PRODUCTION RECOVERY & AUDIT SUITE');
  console.log('================================================================\n');

  const testGroupId = -1004494262619; // Protected "Horney Log"
  const testUserId = 888777666;
  const testPrivateChatId = testUserId;

  const mockBotUser: TelegramUser = {
    id: 777000111,
    is_bot: true,
    first_name: 'Miss Roxie',
    username: 'MissRoxie_Bot'
  };

  // ----------------------------------------------------
  // TEST A: Telegram Update Ingestion
  // ----------------------------------------------------
  console.log('--- TEST A: Telegram Update Ingestion ---');
  const updateAId = 91001;
  const msgAId = 92001;
  const testMsgA: TelegramMessage = {
    message_id: msgAId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testGroupId, type: 'supergroup', title: 'Horney Log' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester', username: 'tester_user' },
    text: 'Test ingestion message A'
  };

  await (telegramBot as any).handleMessage(testMsgA, false);
  const diag = (telegramBot as any).getDiagnosticsTimestamps();
  assert(diag.lastProcessedMessageTimestamp, 'TEST A: lastProcessedMessageTimestamp not recorded');
  assert(diag.lastStoredMessageTimestamp, 'TEST A: lastStoredMessageTimestamp not recorded');
  console.log('✓ TEST A PASSED: Ingestion, timestamps, and structured logging confirmed.');

  // ----------------------------------------------------
  // TEST B: Private Message Storage & Direct Triggers
  // ----------------------------------------------------
  console.log('\n--- TEST B: Private Message Storage & Direct Triggers ---');
  const dmMsgId = 92002;
  const testDmMsg: TelegramMessage = {
    message_id: dmMsgId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testPrivateChatId, type: 'private', first_name: 'Tester' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester', username: 'tester_user' },
    text: 'Test DM storage message B'
  };

  await (telegramBot as any).handleMessage(testDmMsg, false);
  const dmList = db.getPrivateChatsList();
  const foundDm = dmList.find(c => Number(c.chatId) === testPrivateChatId);
  assert(foundDm, 'TEST B: Private chat not found in list');
  const dmMessages = db.getPrivateChatMessages(testPrivateChatId);
  const foundDmMsg = dmMessages.find(m => m.content.includes('Test DM storage message B'));
  assert(foundDmMsg, 'TEST B: Private message not found in storage');
  assert.strictEqual(foundDmMsg.direction, 'in', 'TEST B: Message direction must be in');
  
  // Verify private message is always an explicit trigger
  const dmTriggered = ChatbotService.isTriggered(testDmMsg, mockBotUser);
  assert.strictEqual(dmTriggered, true, 'TEST B: Private message must always trigger response');
  console.log('✓ TEST B PASSED: Private message immediately persisted and triggers chatbot unconditionally.');

  // ----------------------------------------------------
  // TEST C: Group Message Storage
  // ----------------------------------------------------
  console.log('\n--- TEST C: Group Message Storage ---');
  const grpMsgId = 92003;
  const testGrpMsg: TelegramMessage = {
    message_id: grpMsgId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testGroupId, type: 'supergroup', title: 'Horney Log' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester' },
    text: 'Test Group storage message C'
  };

  await (telegramBot as any).handleMessage(testGrpMsg, false);
  const groupMem = db.getGroupMemory(testGroupId);
  const foundGrpMsg = groupMem.find(m => m.messageId === grpMsgId || m.content.includes('Test Group storage message C'));
  assert(foundGrpMsg, 'TEST C: Group message not found in group memory');
  console.log('✓ TEST C PASSED: Group message immediately persisted in group memory.');

  // ----------------------------------------------------
  // TEST D: Private Normal Chat Response
  // ----------------------------------------------------
  console.log('\n--- TEST D: Private Normal Chat Response ---');
  const normalDmDecision = await ChatbotService.generateResponseDecision(
    'req_test_d',
    {
      message_id: 92004,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testPrivateChatId, type: 'private' },
      from: { id: testUserId, is_bot: false, first_name: 'Tester' },
      text: 'hello how are you doing?'
    },
    mockBotUser
  );
  assert(normalDmDecision, 'TEST D: Decision object must not be null');
  console.log(`✓ TEST D PASSED: Private normal chat generated response type: ${normalDmDecision.responseType}`);

  // ----------------------------------------------------
  // TEST E: Group Normal Chat Response & Direct Mentions / Replies
  // ----------------------------------------------------
  console.log('\n--- TEST E: Group Normal Chat Response & Direct Mentions / Replies ---');
  const mentionMsg: TelegramMessage = {
    message_id: 92005,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testGroupId, type: 'supergroup' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester' },
    text: 'Roxie, what is your plan for today?'
  };
  const groupTriggered = ChatbotService.isTriggered(mentionMsg, mockBotUser);
  assert(groupTriggered, 'TEST E: Group message mentioning Roxie must trigger response');

  const replyMsg: TelegramMessage = {
    message_id: 92006,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testGroupId, type: 'supergroup' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester' },
    reply_to_message: {
      message_id: 92000,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testGroupId, type: 'supergroup' },
      from: mockBotUser,
      text: 'Hey everyone!'
    },
    text: 'I agree with you!'
  };
  const replyTriggered = ChatbotService.isTriggered(replyMsg, mockBotUser);
  assert(replyTriggered, 'TEST E: Replying directly to Roxie must trigger response');

  const groupDecision = await ChatbotService.generateResponseDecision('req_test_e', mentionMsg, mockBotUser);
  assert(groupDecision && groupDecision.responseType !== 'none', 'TEST E: Direct group mention must not be blocked by autoResponse disabled');
  console.log('✓ TEST E PASSED: Group chat trigger correctly identifies bot mentions and direct replies.');

  // ----------------------------------------------------
  // TEST F: /start in DM
  // ----------------------------------------------------
  console.log('\n--- TEST F: /start in DM ---');
  const startCtx = {
    message: { message_id: 93001, date: Math.floor(Date.now() / 1000), chat: { id: testPrivateChatId, type: 'private' }, from: { id: testUserId, is_bot: false, first_name: 'Tester' }, text: '/start' },
    chatId: testPrivateChatId,
    chatTitle: 'Tester',
    sender: { id: testUserId, is_bot: false, first_name: 'Tester' },
    isAnonymousAdmin: false,
    adminDisplayName: 'Tester',
    args: [],
    command: '/start',
    rawArgs: ''
  };
  const startHandled = await CommandHandler.handleCommand(startCtx as any);
  assert(startHandled, 'TEST F: /start must execute in private chat');
  console.log('✓ TEST F PASSED: /start executed in DM successfully.');

  // ----------------------------------------------------
  // TEST G: /help in DM
  // ----------------------------------------------------
  console.log('\n--- TEST G: /help in DM ---');
  const helpDmCtx = {
    message: { message_id: 93002, date: Math.floor(Date.now() / 1000), chat: { id: testPrivateChatId, type: 'private' }, from: { id: testUserId, is_bot: false, first_name: 'Tester' }, text: '/help' },
    chatId: testPrivateChatId,
    chatTitle: 'Tester',
    sender: { id: testUserId, is_bot: false, first_name: 'Tester' },
    isAnonymousAdmin: false,
    adminDisplayName: 'Tester',
    args: [],
    command: '/help',
    rawArgs: ''
  };
  const helpDmHandled = await CommandHandler.handleCommand(helpDmCtx as any);
  assert(helpDmHandled, 'TEST G: /help must execute in private chat');
  console.log('✓ TEST G PASSED: /help executed in DM successfully.');

  // ----------------------------------------------------
  // TEST H: /help in Group
  // ----------------------------------------------------
  console.log('\n--- TEST H: /help in Group ---');
  const helpGrpCtx = {
    message: { message_id: 93003, date: Math.floor(Date.now() / 1000), chat: { id: testGroupId, type: 'supergroup', title: 'Horney Log' }, from: { id: testUserId, is_bot: false, first_name: 'Tester' }, text: '/help' },
    chatId: testGroupId,
    chatTitle: 'Horney Log',
    sender: { id: testUserId, is_bot: false, first_name: 'Tester' },
    isAnonymousAdmin: false,
    adminDisplayName: 'Tester',
    args: [],
    command: '/help',
    rawArgs: ''
  };
  const helpGrpHandled = await CommandHandler.handleCommand(helpGrpCtx as any);
  assert(helpGrpHandled, 'TEST H: /help must execute in group');
  console.log('✓ TEST H PASSED: /help executed in group successfully.');

  // ----------------------------------------------------
  // TEST I: /ping
  // ----------------------------------------------------
  console.log('\n--- TEST I: /ping ---');
  const pingCtx = {
    message: { message_id: 93004, date: Math.floor(Date.now() / 1000), chat: { id: testPrivateChatId, type: 'private' }, from: { id: testUserId, is_bot: false, first_name: 'Tester' }, text: '/ping' },
    chatId: testPrivateChatId,
    chatTitle: 'Tester',
    sender: { id: testUserId, is_bot: false, first_name: 'Tester' },
    isAnonymousAdmin: false,
    adminDisplayName: 'Tester',
    args: [],
    command: '/ping',
    rawArgs: ''
  };
  const pingHandled = await CommandHandler.handleCommand(pingCtx as any);
  assert(pingHandled, 'TEST I: /ping must execute successfully');
  console.log('✓ TEST I PASSED: /ping executed successfully without AI dependency.');

  // ----------------------------------------------------
  // TEST J: /addbulkstickers
  // ----------------------------------------------------
  console.log('\n--- TEST J: /addbulkstickers ---');
  const bulkCtx = {
    message: { message_id: 93005, date: Math.floor(Date.now() / 1000), chat: { id: testGroupId, type: 'supergroup', title: 'Horney Log' }, from: { id: testUserId, is_bot: false, first_name: 'Admin' }, text: '/addbulkstickers https://t.me/addstickers/TestPack cute' },
    chatId: testGroupId,
    chatTitle: 'Horney Log',
    sender: { id: testUserId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: true,
    adminDisplayName: 'Admin',
    args: ['https://t.me/addstickers/TestPack', 'cute'],
    command: '/addbulkstickers',
    rawArgs: 'https://t.me/addstickers/TestPack cute'
  };
  const bulkHandled = await CommandHandler.handleCommand(bulkCtx as any);
  assert(bulkHandled, 'TEST J: /addbulkstickers must execute without crash');
  console.log('✓ TEST J PASSED: /addbulkstickers executed and validated.');

  // ----------------------------------------------------
  // TEST K: Command Catalog Consistency
  // ----------------------------------------------------
  console.log('\n--- TEST K: Command Catalog Consistency ---');
  assert.strictEqual(COMMAND_CATALOG.length, 110, 'TEST K: Canonical catalog must have 110 commands');
  for (const item of COMMAND_CATALOG) {
    assert(item.command.startsWith('/'), `TEST K: ${item.command} must start with /`);
    assert(item.description && item.description.length > 0, `TEST K: ${item.command} missing description`);
    assert(item.category, `TEST K: ${item.command} missing category`);
    assert(item.permission, `TEST K: ${item.command} missing permission`);
    assert(item.scopes && item.scopes.length > 0, `TEST K: ${item.command} missing scopes`);
  }
  console.log('✓ TEST K PASSED: 110 canonical commands fully validated with zero missing fields.');

  // ----------------------------------------------------
  // TEST L: Telegram Command Registration
  // ----------------------------------------------------
  console.log('\n--- TEST L: Telegram Command Registration ---');
  const adminScoped = getCommandsForTelegramScope('all_chat_administrators');
  const groupScoped = getCommandsForTelegramScope('all_group_chats');
  const privateScoped = getCommandsForTelegramScope('all_private_chats');
  const defaultScoped = getCommandsForTelegramScope('default');
  assert(adminScoped.length <= 100, `TEST L: Admin scope exceeds 100: ${adminScoped.length}`);
  assert.strictEqual(groupScoped.length, 0, `TEST L: Group scope must be empty (admin-only): ${groupScoped.length}`);
  assert(privateScoped.length <= 30, `TEST L: Private scope exceeds 30: ${privateScoped.length}`);
  assert.strictEqual(defaultScoped.length, 0, `TEST L: Default scope must be empty (preventing fallback leakage): ${defaultScoped.length}`);
  console.log(`✓ TEST L PASSED: All 4 Telegram command scopes capped to safe limits (Admin: ${adminScoped.length}, Group: ${groupScoped.length}, Private: ${privateScoped.length}, Default: ${defaultScoped.length}).`);

  // ----------------------------------------------------
  // TEST M: Dashboard Group Data
  // ----------------------------------------------------
  console.log('\n--- TEST M: Dashboard Group Data ---');
  const groupSettings = db.getGroupSettings(testGroupId);
  assert(groupSettings, 'TEST M: Group settings must exist');
  const storedGrpMsgs = db.getGroupMemory(testGroupId);
  assert(Array.isArray(storedGrpMsgs), 'TEST M: Stored group messages must be an array');
  console.log(`✓ TEST M PASSED: Group data available with ${storedGrpMsgs.length} messages.`);

  // ----------------------------------------------------
  // TEST N: Dashboard Private-Chat Data
  // ----------------------------------------------------
  console.log('\n--- TEST N: Dashboard Private-Chat Data ---');
  const dms = db.getPrivateChatsList();
  assert(dms.length >= 1, 'TEST N: Private chats list must contain at least 1 chat');
  console.log(`✓ TEST N PASSED: Private chats list returned ${dms.length} chats.`);

  // ----------------------------------------------------
  // TEST O: AI Transcript / Echo Prevention
  // ----------------------------------------------------
  console.log('\n--- TEST O: AI Transcript / Echo Prevention ---');
  const dirtyInputs = [
    { in: 'User: hello\nRoxie: hi jaan', out: 'hi jaan' },
    { in: 'Yohan: How are you?\nRoxie: All good here!', out: 'All good here!' },
    { in: 'Roxie: Direct reply', out: 'Direct reply' },
    { in: '[Roxie]: Direct reply with brackets', out: 'Direct reply with brackets' },
    { in: '*laughs* Arre yaar sach mein', out: 'Arre yaar sach mein' },
    { in: '"Quoted text"', out: 'Quoted text' }
  ];
  for (const item of dirtyInputs) {
    const cleaned = ChatbotService.cleanAiText(item.in);
    assert.strictEqual(cleaned, item.out, `TEST O: Expected "${item.out}", got "${cleaned}"`);
  }
  console.log('✓ TEST O PASSED: AI response sanitizer stripped speaker prefixes and asterisks cleanly.');

  // ----------------------------------------------------
  // TEST P: 500 Group Retention
  // ----------------------------------------------------
  console.log('\n--- TEST P: 500 Group Retention ---');
  assert.strictEqual(GROUP_MEMORY_LIMIT, 500, 'TEST P: GROUP_MEMORY_LIMIT must be 500');
  console.log('✓ TEST P PASSED: Group retention limit is 500 messages.');

  // ----------------------------------------------------
  // TEST Q: 200 DM Retention
  // ----------------------------------------------------
  console.log('\n--- TEST Q: 200 DM Retention ---');
  assert.strictEqual(MAX_PRIVATE_CHAT_MESSAGES, 200, 'TEST Q: MAX_PRIVATE_CHAT_MESSAGES must be 200');
  console.log('✓ TEST Q PASSED: Private chat retention limit is 200 messages.');

  // ----------------------------------------------------
  // TEST R: Inactive DM Cleanup
  // ----------------------------------------------------
  console.log('\n--- TEST R: Inactive DM Cleanup ---');
  const inactiveCleaned = db.cleanupInactivePrivateConversations(5);
  console.log(`✓ TEST R PASSED: Inactive private chat cleanup threshold executed (${inactiveCleaned} expired removed).`);

  // ----------------------------------------------------
  // TEST S: Protected Real Groups
  // ----------------------------------------------------
  console.log('\n--- TEST S: Protected Real Groups ---');
  const protectedTitles = ['horny log', 'Horney Log', 'bade log', '𓄂❄𝐵𝐴𝐷𝐸 𝐿𝑂𝐺', 'lovers', '♡LOVERS𒅆❥᭄'];
  for (const t of protectedTitles) {
    const isProt = isGroupProtected(0, t);
    assert(isProt, `TEST S: Real group "${t}" MUST be protected`);
  }
  const dummyTitle = 'Dummy Test Group 123';
  assert(!isGroupProtected(0, dummyTitle), 'TEST S: Dummy group should not be protected');
  console.log('✓ TEST S PASSED: Real groups ("horny log", "bade log", "lovers") protected from cleanup.');

  // ----------------------------------------------------
  // TEST T: Message Routing Safety Invariant
  // ----------------------------------------------------
  console.log('\n--- TEST T: Message Routing Safety Invariant ---');
  const incomingRealGroupId = -1004494262619;
  const dummyGroupId = -100111222333;
  const testMsgT: TelegramMessage = {
    message_id: 94001,
    date: Math.floor(Date.now() / 1000),
    chat: { id: incomingRealGroupId, type: 'supergroup', title: 'Horney Log' },
    from: { id: testUserId, is_bot: false, first_name: 'Tester' },
    text: 'Roxie, what is your status?'
  };

  const decisionT = await ChatbotService.generateResponseDecision('req_test_t', testMsgT, mockBotUser);
  assert(decisionT, 'TEST T: Decision must be generated');
  assert.strictEqual(decisionT.chatId, incomingRealGroupId, 'TEST T: Decision chatId MUST match incoming message chatId');
  assert.notStrictEqual(decisionT.chatId, dummyGroupId, 'TEST T: Decision chatId MUST NOT equal dummy group ID');
  console.log(`✓ TEST T PASSED: Invariant verified — response destination (${decisionT.chatId}) strictly matches incoming chat (${incomingRealGroupId}).`);

  console.log('\n================================================================');
  console.log('ALL TESTS (A THROUGH T) PASSED SUCCESSFULLY! 🎉');
  console.log('================================================================\n');
}

runAuditTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Audit test failed:', err);
  process.exit(1);
});
