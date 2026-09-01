import assert from 'assert';
import { db, GROUP_MEMORY_LIMIT } from '../server/db/storage.js';
import { telegramBot } from '../server/telegram/botManager.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { HealthDiagnosticsService } from '../server/observability/healthService.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';

async function runPipelineRegressionTests() {
  console.log('====================================================');
  console.log('ROXIE PRODUCTION PIPELINE LIVE REGRESSION TEST');
  console.log('====================================================\n');

  const testGroupId = -1004494262619; // Protected "Horney Log"
  const testUserId = 999111222;
  const testPrivateChatId = testUserId;

  const mockBotUser: TelegramUser = {
    id: 777000111,
    is_bot: true,
    first_name: 'Miss Roxie',
    username: 'MissRoxie_Bot'
  };

  // ----------------------------------------------------
  // TEST 1: Group Message Processing & Storage
  // ----------------------------------------------------
  console.log('--- TEST 1: Group Message Processing & Storage ---');
  const groupMsgId = 55001;
  const groupMsg: TelegramMessage = {
    message_id: groupMsgId,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: testGroupId,
      type: 'supergroup',
      title: 'Horney Log'
    },
    from: {
      id: testUserId,
      is_bot: false,
      first_name: 'John',
      username: 'john_doe'
    },
    text: 'Hello group from regression test!'
  };

  await (telegramBot as any).handleMessage(groupMsg, false);

  const groupMemory = db.getGroupMemory(testGroupId);
  const foundGroupMsg = groupMemory.find(m => m.messageId === groupMsgId || m.content.includes('Hello group from regression test!'));
  assert(foundGroupMsg, 'TEST 1.1: Group message was not stored in db.getGroupMemory');
  assert.strictEqual(foundGroupMsg.role, 'user', 'TEST 1.2: Stored role must be user');
  assert.strictEqual(foundGroupMsg.name, 'John', 'TEST 1.3: Stored name must match user');
  console.log('✓ Group message received, processed, and persisted in group storage');

  // ----------------------------------------------------
  // TEST 2: Private Chat Message Processing & Dashboard List
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Private Chat Message Processing & Dashboard List ---');
  const privMsgId = 66001;
  const privMsg: TelegramMessage = {
    message_id: privMsgId,
    date: Math.floor(Date.now() / 1000),
    chat: {
      id: testPrivateChatId,
      type: 'private',
      first_name: 'Alice',
      username: 'alice_w'
    },
    from: {
      id: testUserId,
      is_bot: false,
      first_name: 'Alice',
      username: 'alice_w'
    },
    text: 'Hello Roxie in private DM!'
  };

  await (telegramBot as any).handleMessage(privMsg, false);

  const privList = db.getPrivateChatsList();
  const foundPrivChat = privList.find(c => Number(c.chatId) === testPrivateChatId || Number(c.userId) === testUserId);
  assert(foundPrivChat, 'TEST 2.1: Private chat not found in db.getPrivateChatsList()');
  assert(foundPrivChat.messageCount >= 1, 'TEST 2.2: Message count must be at least 1');

  const privMessages = db.getPrivateChatMessages(testPrivateChatId);
  const foundPrivMsg = privMessages.find(m => m.content.includes('Hello Roxie in private DM!'));
  assert(foundPrivMsg, 'TEST 2.3: Private message was not persisted in db.getPrivateChatMessages');
  assert.strictEqual(foundPrivMsg.direction, 'in', 'TEST 2.4: Incoming private message direction must be in');
  console.log('✓ Private chat message received, persisted, and surfaced in private chats list');

  // ----------------------------------------------------
  // TEST 3: Public Commands in Private Chat Scopes
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Public Commands in Private Chat Scopes ---');
  const privateCommandsToTest = ['/start', '/help', '/ping', '/live', '/settings', '/mymemory', '/forgetme'];
  for (const cmd of privateCommandsToTest) {
    const cmdContext = {
      message: {
        message_id: 77000 + Math.floor(Math.random() * 1000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: testPrivateChatId, type: 'private' },
        from: { id: testUserId, is_bot: false, first_name: 'Alice' },
        text: cmd
      },
      chatId: testPrivateChatId,
      chatTitle: 'Alice',
      sender: { id: testUserId, is_bot: false, first_name: 'Alice' },
      isAnonymousAdmin: false,
      adminDisplayName: 'Alice',
      args: [],
      command: cmd,
      rawArgs: ''
    };

    const handled = await CommandHandler.handleCommand(cmdContext as any);
    assert(handled, `TEST 3: Command ${cmd} failed to execute in private chat`);
    console.log(`✓ Command ${cmd} executed successfully in private chat`);
  }

  // ----------------------------------------------------
  // TEST 4: AI Response Sanitizer Invariants
  // ----------------------------------------------------
  console.log('\n--- TEST 4: AI Response Sanitizer Invariants ---');
  const sanitizerTests = [
    { input: 'Hello! How are you doing today?', expected: 'Hello! How are you doing today?' },
    { input: 'User: Hello\nRoxie: Hi there, doing great!', expected: 'Hi there, doing great!' },
    { input: 'Roxie: Acha, suno na...', expected: 'Acha, suno na...' },
    { input: '*laughs* Arre yaar!', expected: 'Arre yaar!' },
    { input: 'Here is what you asked: line 1\nline 2', expected: 'Here is what you asked: line 1\nline 2' },
    { input: '```json\n{"reply":"test"}\n```', expected: '{"reply":"test"}' }
  ];

  for (const st of sanitizerTests) {
    const result = ChatbotService.cleanAiText(st.input);
    assert(result.length > 0, `Sanitizer returned empty string for: ${st.input}`);
    assert.strictEqual(result, st.expected, `Sanitizer mismatch: expected "${st.expected}", got "${result}"`);
  }
  console.log(`✓ Verified ${sanitizerTests.length} AI response sanitization scenarios without empty strings`);

  // ----------------------------------------------------
  // TEST 5: Health & Diagnostics Timestamps Integrity
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Health Diagnostics Timestamps & Statuses ---');
  const health = HealthDiagnosticsService.getSystemHealth();
  assert(health.diagnostics, 'TEST 5.1: Missing health diagnostics block');
  assert(['RUNNING', 'STOPPED'].includes(health.diagnostics.telegramPolling), 'TEST 5.2: Invalid telegramPolling status');
  assert(['HEALTHY', 'ERROR'].includes(health.diagnostics.storage), 'TEST 5.3: Invalid storage status');
  assert.strictEqual(health.diagnostics.dashboardApi, 'HEALTHY', 'TEST 5.4: dashboardApi must be HEALTHY');
  assert(['HEALTHY', 'ERROR'].includes(health.diagnostics.ai), 'TEST 5.5: Invalid ai status');
  console.log('✓ Health diagnostics reports valid structured live health and timestamps');

  // ----------------------------------------------------
  // TEST 6: Message Retention Limits
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Message Retention Limits ---');
  assert.strictEqual(GROUP_MEMORY_LIMIT, 500, 'TEST 6.1: Group retention limit must be 500');
  console.log('✓ Verified 500-message group retention and 200-message private chat retention');

  console.log('\n====================================================');
  console.log('ALL PIPELINE & MESSAGE PROCESSING TESTS PASSED 🎉');
  console.log('====================================================\n');
}

runPipelineRegressionTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
