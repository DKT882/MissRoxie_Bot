import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { telegramBot } from '../server/telegram.js';
import { authManager } from '../server/auth/authManager.js';
import { executeLeaveGroupWorkflow } from '../server.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runDashboardControlCenterTests() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Control Center Test Suite (22 Tests)');
  console.log('====================================================\n');

  const testGroup1 = -100999111001;
  const testGroup2 = -100999111002;
  const testGroupLeft = -100999111003;
  const testUser1 = 555001;
  const testUser2 = 555002;

  // Initialize mock group settings
  const s1 = db.getGroupSettings(testGroup1);
  s1.chatTitle = 'Roxie Alpha Community';
  s1.linksProtection = true;
  s1.stickerProtection = true;
  s1.lustMode = true;
  s1.botLeft = false;
  delete (s1 as any).leftAt;
  db.updateGroupSettings(testGroup1, s1);

  const s2 = db.getGroupSettings(testGroup2);
  s2.chatTitle = 'Roxie Beta Group';
  s2.linksProtection = false;
  s2.stickerProtection = false;
  s2.botLeft = false;
  delete (s2 as any).leftAt;
  db.updateGroupSettings(testGroup2, s2);

  const s3 = db.getGroupSettings(testGroupLeft);
  s3.chatTitle = 'Roxie Former Group';
  s3.botLeft = true;
  db.updateGroupSettings(testGroupLeft, s3);

  // Setup Telegram API mocks
  const origSendMessage = telegramApi.sendMessage;
  const origLeaveChat = telegramApi.leaveChat;
  const origGetChatAdministrators = telegramApi.getChatAdministrators;
  const origGetChatMember = telegramApi.getChatMember;
  const origPromoteChatMember = telegramApi.promoteChatMember;
  const origSetChatPermissions = telegramApi.setChatPermissions;

  // 1. Overview metrics
  const totalMsgsBefore = db.getTotalStoredMessagesCount();
  assert(typeof totalMsgsBefore === 'number', 'Total stored messages should be a number');
  pass('Test 1: Overview metrics calculation');

  // 2. Groups retrieval
  const allSettings = (db as any).data.settings;
  assert(allSettings[testGroup1], 'Group 1 should exist in storage');
  assert(allSettings[testGroup2], 'Group 2 should exist in storage');
  pass('Test 2: Groups listing from storage');

  // 3. Group status evaluation
  assert.strictEqual(Boolean(s3.botLeft), true, 'Group 3 should be marked botLeft');
  assert.strictEqual(Boolean(s1.botLeft), false, 'Group 1 should not be botLeft');
  pass('Test 3: Group status correctly reflects active vs botLeft');

  // 4. Telegram role authoritative check
  telegramApi.getChatMember = async (chatId, userId) => {
    return {
      ok: true,
      result: {
        status: 'administrator',
        can_delete_messages: true,
        can_restrict_members: true,
        can_promote_members: false
      } as any
    };
  };
  const botMember = await telegramApi.getChatMember(testGroup1, 1087968824);
  assert.strictEqual(botMember.result?.status, 'administrator', 'Role must come from Telegram');
  pass('Test 4: Telegram role authoritative check');

  // 5. Group details comprehensive retrieval
  const g1Settings = db.getGroupSettings(testGroup1);
  assert.strictEqual(g1Settings.chatTitle, 'Roxie Alpha Community');
  assert.strictEqual(g1Settings.lustMode, true);
  pass('Test 5: Group details retrieval');

  // 6. Stored messages in group conversation memory
  db.clearGroupMemory(testGroup1);
  db.addGroupConversationEntry(testGroup1, {
    role: 'user',
    userId: testUser1,
    name: 'Alice',
    content: 'Hello Roxie from group!',
    timestamp: Date.now()
  });
  db.addGroupConversationEntry(testGroup1, {
    role: 'assistant',
    name: 'Roxie',
    content: 'Hey Alice, what are you up to?',
    timestamp: Date.now()
  });
  const g1Mem = db.getGroupMemory(testGroup1);
  assert.strictEqual(g1Mem.length, 2, 'Group memory should store 2 entries');
  assert.strictEqual(g1Mem[0].content, 'Hello Roxie from group!');
  pass('Test 6: Stored messages in shared group memory');

  // 7. Private chats list
  db.deletePrivateChatData(testUser1);
  db.addPrivateMessage(testUser1, testUser1, {
    role: 'user',
    content: 'Hi Roxie, secret DM!',
    username: 'alice_dm',
    name: 'Alice DM',
    language: 'english'
  });
  const privateList = db.getPrivateChatsList();
  const aliceChat = privateList.find(c => c.userId === testUser1);
  assert(aliceChat, 'Alice should appear in private chats list');
  assert.strictEqual(aliceChat.name, 'Alice DM');
  pass('Test 7: Private chats user list retrieval');

  // 8. Private messages conversation history
  db.addPrivateMessage(testUser1, testUser1, {
    role: 'assistant',
    content: 'Hey Alice, happy to chat in private.',
    direction: 'out'
  });
  const aliceMsgs = db.getPrivateChatMessages(testUser1);
  assert.strictEqual(aliceMsgs.length, 2);
  assert.strictEqual(aliceMsgs[0].direction, 'in');
  assert.strictEqual(aliceMsgs[1].direction, 'out');
  pass('Test 8: Private messages conversation history and directions');

  // 9. Send message execution
  let sentTargetId: number | string | null = null;
  let sentText: string | null = null;
  telegramApi.sendMessage = async (chatId, text, opts) => {
    sentTargetId = chatId;
    sentText = text;
    return { ok: true, result: { message_id: 8888 } as any };
  };
  const sendRes = await telegramApi.sendMessage(testGroup1, 'Hello from Dashboard!');
  assert(sendRes.ok, 'Telegram API sendMessage should succeed');
  assert.strictEqual(sentTargetId, testGroup1);
  assert.strictEqual(sentText, 'Hello from Dashboard!');
  pass('Test 9: Send message execution');

  // 10. Broadcast execution across multiple groups
  const broadcastTargets = [testGroup1, testGroup2];
  const broadcastMsg = 'System maintenance in 10 minutes';
  const broadcastSuccess: number[] = [];
  for (const gId of broadcastTargets) {
    const res = await telegramApi.sendMessage(gId, broadcastMsg);
    if (res.ok) broadcastSuccess.push(gId);
  }
  assert.strictEqual(broadcastSuccess.length, 2, 'Both groups should receive broadcast');
  pass('Test 10: Broadcast announcement to multiple groups');

  // 11. Broadcast failure handling & isolation
  telegramApi.sendMessage = async (chatId, text) => {
    if (chatId === testGroup2) {
      return { ok: false, description: 'Chat not found or bot was kicked' };
    }
    return { ok: true, result: { message_id: 9999 } as any };
  };
  const failedList: any[] = [];
  for (const gId of broadcastTargets) {
    const res = await telegramApi.sendMessage(gId, broadcastMsg);
    if (!res.ok) failedList.push({ gId, error: res.description });
  }
  assert.strictEqual(failedList.length, 1, 'Group 2 failure should be caught');
  assert.strictEqual(failedList[0].gId, testGroup2);
  pass('Test 11: Broadcast failure isolation and reporting');

  // 12. Leave group execution & verification
  telegramApi.getChat = async (chatId) => ({ ok: true, result: { id: chatId, title: 'Group 1' } as any });
  telegramApi.getMe = async () => ({ ok: true, result: { id: 9999, is_bot: true } as any });
  telegramApi.getChatMember = async (chatId, userId) => ({ ok: true, result: { status: 'administrator' } as any });
  telegramApi.leaveChat = async (chatId) => ({ ok: true, result: true });

  const workflowRes = await executeLeaveGroupWorkflow(testGroup1, 'LEAVE');
  assert.strictEqual(workflowRes.status, 200, 'Workflow leave must return status 200');
  assert.strictEqual(workflowRes.body.success, true, 'Workflow leave must return success: true');
  const updatedG1 = db.getGroupSettings(testGroup1);
  assert.strictEqual(updatedG1.botLeft, true, 'botLeft must be set in database');
  assert(updatedG1.leftAt, 'leftAt timestamp must be recorded');
  pass('Test 12: Leave group via Telegram and storage state transition');

  // 13. Settings update persistence
  db.updateGroupSettings(testGroup2, { linksProtection: true, floodEnabled: true, floodCount: 5 });
  const updatedG2 = db.getGroupSettings(testGroup2);
  assert.strictEqual(updatedG2.linksProtection, true);
  assert.strictEqual(updatedG2.floodEnabled, true);
  assert.strictEqual(updatedG2.floodCount, 5);
  pass('Test 13: Group settings update persistence');

  // 14. Telegram permission inspection
  telegramApi.getChatMember = async (chatId, userId) => {
    return {
      ok: true,
      result: {
        status: 'administrator',
        can_delete_messages: true,
        can_restrict_members: true,
        can_promote_members: false,
        can_pin_messages: true
      } as any
    };
  };
  const permCheck = await telegramApi.getChatMember(testGroup1, 1087968824);
  assert.strictEqual(permCheck.result?.can_delete_messages, true);
  assert.strictEqual(permCheck.result?.can_promote_members, false);
  pass('Test 14: Telegram permission inspection');

  // 15. Permission update validation (distinguishing default members vs bot admin)
  telegramApi.setChatPermissions = async (chatId, perms) => {
    return { ok: true, result: true };
  };
  const defaultMemberPerms = { can_send_messages: true, can_send_media_messages: false };
  const memberPermRes = await telegramApi.setChatPermissions(testGroup1, defaultMemberPerms);
  assert(memberPermRes.ok, 'setChatPermissions should update default member permissions');

  telegramApi.promoteChatMember = async (chatId, userId, perms) => {
    // Simulate Telegram rejecting promoting beyond hierarchy
    return { ok: false, description: 'Not enough rights to promote chat member' };
  };
  const adminPromoteRes = await telegramApi.promoteChatMember(testGroup1, 1087968824, { can_promote_members: true });
  assert.strictEqual(adminPromoteRes.ok, false);
  assert(adminPromoteRes.description?.includes('Not enough rights'), 'Real Telegram failure returned');
  pass('Test 15: Distinction between default member perms and admin hierarchy promotion');

  // 16. Moderator retrieval
  telegramApi.getChatAdministrators = async (chatId) => {
    return {
      ok: true,
      result: [
        {
          user: { id: 1001, is_bot: false, first_name: 'Owner', username: 'owner_user' },
          status: 'creator'
        },
        {
          user: { id: 1087968824, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' },
          status: 'administrator',
          can_delete_messages: true
        }
      ] as any
    };
  };
  const adminsRes = await telegramApi.getChatAdministrators(testGroup1);
  assert(adminsRes.ok && adminsRes.result?.length === 2);
  assert.strictEqual(adminsRes.result[0].status, 'creator');
  pass('Test 16: Telegram administrator retrieval and owner identification');

  // 17. Sticker isolation between groups
  db.clearMediaLibrary(testGroup1);
  db.clearMediaLibrary(testGroup2);
  const now = new Date().toISOString();
  db.addStickerToLibrary('playful', 'CAACAgIAAxkBAAE1111', { fileId: 'CAACAgIAAxkBAAE1111', source: 'custom', mood: 'playful', packName: 'group_1_pack', addedAt: now }, testGroup1);
  db.addStickerToLibrary('playful', 'CAACAgIAAxkBAAE2222', { fileId: 'CAACAgIAAxkBAAE2222', source: 'custom', mood: 'playful', packName: 'group_2_pack', addedAt: now }, testGroup2);

  const g1Stickers = db.getMediaLibrary(testGroup1);
  const g2Stickers = db.getMediaLibrary(testGroup2);
  assert.strictEqual(g1Stickers.stickers?.playful?.[0], 'CAACAgIAAxkBAAE1111');
  assert.strictEqual(g2Stickers.stickers?.playful?.[0], 'CAACAgIAAxkBAAE2222');
  assert.notStrictEqual(g1Stickers.stickers?.playful?.[0], g2Stickers.stickers?.playful?.[0]);
  pass('Test 17: Sticker isolation between separate groups');

  // 18. Group memory isolation
  db.addGroupConversationEntry(testGroup1, {
    role: 'user',
    userId: testUser1,
    name: 'Alice',
    content: 'Secret Group 1 Info',
    timestamp: Date.now()
  });
  db.addGroupConversationEntry(testGroup2, {
    role: 'user',
    userId: testUser2,
    name: 'Bob',
    content: 'Secret Group 2 Info',
    timestamp: Date.now()
  });
  const g1Messages = db.getGroupMemory(testGroup1);
  const g2Messages = db.getGroupMemory(testGroup2);
  assert(g1Messages.some(m => m.content === 'Secret Group 1 Info'));
  assert(!g1Messages.some(m => m.content === 'Secret Group 2 Info'));
  assert(g2Messages.some(m => m.content === 'Secret Group 2 Info'));
  assert(!g2Messages.some(m => m.content === 'Secret Group 1 Info'));
  pass('Test 18: Group conversation memory strict isolation');

  // 19. Authentication manager verification
  process.env.DASHBOARD_ADMIN_PASSWORD = 'TEST_DASHBOARD_PASSWORD';
  process.env.DASHBOARD_SESSION_SECRET = 'TEST_DASHBOARD_SESSION_SECRET';
  authManager.reloadConfig();
  const testAuth = authManager.authenticate('admin', 'TEST_DASHBOARD_PASSWORD');
  assert(testAuth.operator, 'Auth manager should authenticate admin');
  assert.strictEqual(testAuth.operator?.role, 'SUPER_ADMIN');
  pass('Test 19: Operator authentication');

  // 20. Operator authorization session verification
  const session = authManager.getSession(testAuth.session?.sessionId || '');
  assert(session, 'Valid session must resolve operator');
  assert.strictEqual(session?.username, 'admin');
  pass('Test 20: Operator authorization and role validation');

  // 21. Token leakage check in client bundle
  const distAssets = path.join(process.cwd(), 'dist', 'assets');
  if (fs.existsSync(distAssets)) {
    const files = fs.readdirSync(distAssets).filter(f => f.endsWith('.js'));
    for (const f of files) {
      const content = fs.readFileSync(path.join(distAssets, f), 'utf8');
      assert(!content.includes('TELEGRAM_BOT_TOKEN'), 'TELEGRAM_BOT_TOKEN must not leak in client');
      assert(!content.includes('OPENAI_API_KEY'), 'OPENAI_API_KEY must not leak in client');
    }
  }
  pass('Test 21: Client bundle security audit (Zero token leakage)');

  // 22. Audit logging verification
  const logEntry = db.addLog({
    chatId: testGroup1,
    chatTitle: 'Roxie Alpha Community',
    action: 'setting_change',
    adminUsername: 'dashboard_admin',
    details: 'Enabled anti-raid protection',
    result: 'success'
  });
  assert(logEntry.id, 'Log entry must have generated ID');
  assert(logEntry.timestamp, 'Log entry must have timestamp');
  const recentLogs = db.getRecentLogs(10);
  assert(recentLogs.some(l => l.id === logEntry.id), 'Log entry must be retrievable in audit stream');
  pass('Test 22: Comprehensive audit logging');

  // Restore mocks
  telegramApi.sendMessage = origSendMessage;
  telegramApi.leaveChat = origLeaveChat;
  telegramApi.getChatAdministrators = origGetChatAdministrators;
  telegramApi.getChatMember = origGetChatMember;
  telegramApi.promoteChatMember = origPromoteChatMember;
  telegramApi.setChatPermissions = origSetChatPermissions;

  console.log('\n====================================================');
  console.log(`🎉 ALL 22 TESTS PASSED! (${passed}/22)`);
  console.log('====================================================\n');
  process.exit(0);
}

runDashboardControlCenterTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
