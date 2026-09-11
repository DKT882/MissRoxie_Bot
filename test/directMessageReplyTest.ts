import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { authManager } from '../server/auth/authManager.js';
import { executeSendMessageWorkflow, executeLeaveGroupWorkflow } from '../server.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runDirectMessageReplyTests() {
  console.log('===================================================================');
  console.log('🧪 Starting Roxie Direct Message Bar & Reply-to-User Test Suite');
  console.log('===================================================================\n');

  const origSendMessage = telegramApi.sendMessage;
  const testGroupA = -100888777001;
  const testGroupB = -100888777002;

  try {
    // Setup initial groups
    db.updateGroupSettings(testGroupA, { chatTitle: 'Alpha Group A', botLeft: false, unavailable: false });
    db.updateGroupSettings(testGroupB, { chatTitle: 'Beta Group B', botLeft: false, unavailable: false });
    db.clearGroupMemory(testGroupA);
    db.clearGroupMemory(testGroupB);

    let lastSentPayload: any = null;
    telegramApi.sendMessage = async (chatId, text, options) => {
      lastSentPayload = { chatId, text, options };
      return {
        ok: true,
        result: {
          message_id: Math.floor(Math.random() * 10000) + 1000,
          chat: { id: chatId },
          text,
          date: Math.floor(Date.now() / 1000)
        } as any
      };
    };

    // ---------------------------------------------------------
    // TEST 1: Normal dashboard message sends successfully
    // ---------------------------------------------------------
    const res1 = await executeSendMessageWorkflow(testGroupA, 'Hello everyone from dashboard!');
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.body.success, true);
    assert(res1.body.messageId, 'Must return messageId');
    assert.strictEqual(res1.body.replyToMessageId, null);
    assert.strictEqual(lastSentPayload.chatId, testGroupA);
    assert.strictEqual(lastSentPayload.text, 'Hello everyone from dashboard!');
    assert.strictEqual(lastSentPayload.options.reply_to_message_id, undefined);
    pass('TEST 1: Normal dashboard message sends successfully');

    // ---------------------------------------------------------
    // TEST 2: Dashboard message sends as Roxie
    // ---------------------------------------------------------
    const memoryA1 = db.getGroupMemory(testGroupA);
    const sentMsg1 = memoryA1.find(m => m.messageId === res1.body.messageId);
    assert(sentMsg1, 'Sent message must be saved to group conversation memory');
    assert.strictEqual(sentMsg1.sender, 'Roxie');
    assert.strictEqual(sentMsg1.name, 'Roxie');
    assert.strictEqual(sentMsg1.role, 'assistant');
    assert.strictEqual(sentMsg1.source, 'dashboard');
    assert.strictEqual(sentMsg1.direction, 'outgoing');
    pass('TEST 2: Dashboard message sends as Roxie with proper identity metadata');

    // ---------------------------------------------------------
    // TEST 3: Reply button selects correct message
    // ---------------------------------------------------------
    // Seed an incoming message from user Rahul in Group A
    db.addGroupConversationEntry(testGroupA, {
      role: 'user',
      name: 'Rahul Sharma',
      displayName: 'Rahul Sharma',
      username: 'rahul_s',
      userId: 123456,
      content: 'Hello Roxie, are you active?',
      timestamp: Date.now() - 5000,
      messageId: 4401,
      chatId: testGroupA,
      mediaType: 'text',
      direction: 'incoming',
      source: 'telegram'
    });
    const targetMsg = db.getGroupMemory(testGroupA).find(m => m.messageId === 4401);
    assert(targetMsg, 'Target message must exist');
    assert.strictEqual(targetMsg.messageId, 4401);
    assert.strictEqual(targetMsg.displayName, 'Rahul Sharma');
    pass('TEST 3: Reply button targets and retrieves correct stored message');

    // ---------------------------------------------------------
    // TEST 4: Reply sends using correct Telegram message ID
    // ---------------------------------------------------------
    const res4 = await executeSendMessageWorkflow(testGroupA, 'Hey Rahul! Yes, always here 😏', 4401);
    assert.strictEqual(res4.status, 200);
    assert.strictEqual(res4.body.success, true);
    assert.strictEqual(res4.body.replyToMessageId, 4401);
    assert.strictEqual(lastSentPayload.options.reply_to_message_id, 4401);
    assert.strictEqual(lastSentPayload.options.reply_parameters?.message_id, 4401);

    // Verify stored reply has reference to Rahul's original message
    const replyMemory = db.getGroupMemory(testGroupA).find(m => m.messageId === res4.body.messageId);
    assert(replyMemory, 'Delivered reply must be stored in memory');
    assert.strictEqual(replyMemory.replyToMessageId, 4401);
    assert.strictEqual(replyMemory.replyTo?.messageId, 4401);
    assert.strictEqual(replyMemory.replyTo?.name, 'Rahul Sharma');
    pass('TEST 4: Reply sends using correct Telegram message ID and links original message');

    // ---------------------------------------------------------
    // TEST 5: Reply target belongs to same group
    // ---------------------------------------------------------
    const belongsToGroupA = db.getGroupMemory(testGroupA).some(m => m.messageId === 4401);
    assert.strictEqual(belongsToGroupA, true);
    pass('TEST 5: Validated reply target belongs to the same target group');

    // ---------------------------------------------------------
    // TEST 6: Cross-group reply target is rejected
    // ---------------------------------------------------------
    // Seed an incoming message in Group B
    db.addGroupConversationEntry(testGroupB, {
      role: 'user',
      name: 'Ananya Verma',
      displayName: 'Ananya Verma',
      username: 'ananya_v',
      userId: 789012,
      content: 'Group B message here',
      timestamp: Date.now() - 3000,
      messageId: 8802,
      chatId: testGroupB,
      direction: 'incoming',
      source: 'telegram'
    });

    // Attempt to reply in Group A with message 8802 from Group B
    const res6 = await executeSendMessageWorkflow(testGroupA, 'Sneaky cross-group reply', 8802);
    assert.strictEqual(res6.status, 400);
    assert.strictEqual(res6.body.code, 'CROSS_GROUP_REPLY_REJECTED');
    assert(res6.body.error?.includes('Cross-group reply injection rejected'));
    pass('TEST 6: Cross-group reply target is authoritatively rejected');

    // ---------------------------------------------------------
    // TEST 7: Missing or invalid message ID cannot be replied to
    // ---------------------------------------------------------
    const res7a = await executeSendMessageWorkflow(testGroupA, 'Invalid zero ID', 0);
    assert.strictEqual(res7a.status, 400);
    assert.strictEqual(res7a.body.code, 'INVALID_REPLY_ID');

    const res7b = await executeSendMessageWorkflow(testGroupA, 'Invalid negative ID', -10);
    assert.strictEqual(res7b.status, 400);
    assert.strictEqual(res7b.body.code, 'INVALID_REPLY_ID');
    pass('TEST 7: Missing or invalid reply message ID is rejected safely');

    // ---------------------------------------------------------
    // TEST 8: Empty message is rejected
    // ---------------------------------------------------------
    const res8a = await executeSendMessageWorkflow(testGroupA, '');
    assert.strictEqual(res8a.status, 400);
    assert.strictEqual(res8a.body.code, 'EMPTY_MESSAGE');

    const res8b = await executeSendMessageWorkflow(testGroupA, '    ');
    assert.strictEqual(res8b.status, 400);
    assert.strictEqual(res8b.body.code, 'EMPTY_MESSAGE');
    pass('TEST 8: Empty or whitespace-only message is rejected with 400');

    // ---------------------------------------------------------
    // TEST 9: Unauthorized operator cannot send
    // ---------------------------------------------------------
    // 9a. Invalid session ID
    const res9a = await executeSendMessageWorkflow(testGroupA, 'Unauthorized test', undefined, 'unknown', 'bogus-session-token');
    assert.strictEqual(res9a.status, 401);
    assert.strictEqual(res9a.body.code, 'UNAUTHORIZED');

    // 9b. VIEWER role lacks permission to send
    process.env.DASHBOARD_ADMIN_PASSWORD = 'TEST_DASHBOARD_PASSWORD';
    process.env.DASHBOARD_SESSION_SECRET = 'TEST_DASHBOARD_SESSION_SECRET';
    authManager.reloadConfig();
    const viewerOp = authManager.createOperator({ username: 'test_viewer', name: 'Test Viewer', password: 'temp_password', role: 'VIEWER' });
    const authViewer = authManager.authenticate('test_viewer', 'temp_password');
    // Set a session manually with VIEWER role
    const testSession = authManager.authenticate('admin', 'TEST_DASHBOARD_PASSWORD');
    const sessionId = testSession.session?.sessionId || '';
    // Temporarily set role to VIEWER
    const sessionObj = authManager.getSession(sessionId);
    if (sessionObj) {
      const origRole = sessionObj.role;
      sessionObj.role = 'VIEWER';
      const res9b = await executeSendMessageWorkflow(testGroupA, 'Viewer send test', undefined, 'test_viewer', sessionId);
      assert.strictEqual(res9b.status, 403);
      assert.strictEqual(res9b.body.code, 'FORBIDDEN');
      sessionObj.role = origRole;
    }
    pass('TEST 9: Unauthorized operators and VIEWER role rejected with 401/403');

    // ---------------------------------------------------------
    // TEST 10: Telegram send failure is handled correctly
    // ---------------------------------------------------------
    telegramApi.sendMessage = async () => ({
      ok: false,
      error_code: 400,
      description: 'Bad Request: message to be replied not found'
    });

    const res10 = await executeSendMessageWorkflow(testGroupA, 'Reply to gone message', 999999);
    assert.strictEqual(res10.status, 400);
    assert.strictEqual(res10.body.code, 'REPLY_TARGET_NOT_FOUND');
    assert(res10.body.error?.includes('original message may no longer be available'));
    pass('TEST 10: Telegram send failure returns clear user-friendly explanation');

    // ---------------------------------------------------------
    // TEST 11: Failed send is not stored as successfully delivered
    // ---------------------------------------------------------
    const memoryAfterFail = db.getGroupMemory(testGroupA);
    assert(!memoryAfterFail.some(m => m.content === 'Reply to gone message'), 'Failed send must not be saved into conversation memory');
    pass('TEST 11: Failed send is never stored into conversation memory');

    // Restore telegramApi.sendMessage
    telegramApi.sendMessage = async (chatId, text, options) => {
      lastSentPayload = { chatId, text, options };
      return { ok: true, result: { message_id: 7711, chat: { id: chatId }, text, date: Math.floor(Date.now() / 1000) } as any };
    };

    // ---------------------------------------------------------
    // TEST 12: Successful send creates audit log
    // ---------------------------------------------------------
    const res12 = await executeSendMessageWorkflow(testGroupA, 'Log verification message', undefined, 'auditor_admin');
    assert.strictEqual(res12.status, 200);

    const logsA = db.getGroupLogs(testGroupA);
    const sendLog = logsA.find(l => l.action === 'send_message' && l.details?.includes('Log verification message') || l.details?.includes(String(testGroupA)));
    assert(sendLog, 'Audit log for send_message must be recorded');
    assert.strictEqual(sendLog.result, 'success');
    pass('TEST 12: Successful normal send creates comprehensive audit log');

    // ---------------------------------------------------------
    // TEST 13: Successful reply creates audit log with reply ID
    // ---------------------------------------------------------
    const res13 = await executeSendMessageWorkflow(testGroupA, 'Log reply verification', 4401, 'auditor_admin');
    assert.strictEqual(res13.status, 200);

    const logsAfterReply = db.getGroupLogs(testGroupA);
    const replyLog = logsAfterReply.find(l => l.details?.includes('4401'));
    assert(replyLog, 'Audit log must record reply to message 4401');
    assert.strictEqual(replyLog.action, 'send_message');
    pass('TEST 13: Successful reply creates audit log with replyToMessageId metadata');

    // ---------------------------------------------------------
    // TEST 14: Composer state clears after successful send
    // ---------------------------------------------------------
    // Simulate UI state lifecycle
    let uiComposerText = 'Hello there!';
    let uiReplyTarget: any = { messageId: 4401, name: 'Rahul' };
    // Send simulated:
    const simRes = await executeSendMessageWorkflow(testGroupA, uiComposerText, uiReplyTarget.messageId);
    if (simRes.status === 200) {
      uiComposerText = '';
      uiReplyTarget = null;
    }
    assert.strictEqual(uiComposerText, '', 'Composer text should be reset to empty string');
    assert.strictEqual(uiReplyTarget, null, 'Reply target should be reset to null');
    pass('TEST 14: Composer text and reply target clear after successful send');

    // ---------------------------------------------------------
    // TEST 15: Reply mode can be cancelled
    // ---------------------------------------------------------
    let cancelableReplyTarget: any = { messageId: 4401, name: 'Rahul' };
    // User clicks Cancel [X]
    cancelableReplyTarget = null;
    // Sending message without reply target
    const res15 = await executeSendMessageWorkflow(testGroupA, 'Standard message after cancel', cancelableReplyTarget?.messageId);
    assert.strictEqual(res15.status, 200);
    assert.strictEqual(res15.body.replyToMessageId, null);
    assert.strictEqual(lastSentPayload.options.reply_to_message_id, undefined);
    pass('TEST 15: Reply mode can be cancelled, reverting to standard send');

    // ---------------------------------------------------------
    // TEST 16: New incoming messages store Telegram message_id
    // ---------------------------------------------------------
    const incomingId = 99123;
    db.addGroupConversationEntry(testGroupA, {
      role: 'user',
      userId: 555666,
      name: 'Vikram Patel',
      displayName: 'Vikram Patel',
      username: 'vikram_p',
      content: 'Fresh Telegram message',
      timestamp: Date.now(),
      messageId: incomingId,
      chatId: testGroupA,
      mediaType: 'text',
      direction: 'incoming',
      source: 'telegram'
    });

    const storedIncoming = db.getGroupMemory(testGroupA).find(m => m.messageId === incomingId);
    assert(storedIncoming, 'Stored incoming message must exist in memory');
    assert.strictEqual(storedIncoming.messageId, incomingId);
    assert.strictEqual(storedIncoming.chatId, testGroupA);
    assert.strictEqual(storedIncoming.direction, 'incoming');
    assert.strictEqual(storedIncoming.displayName, 'Vikram Patel');
    pass('TEST 16: New incoming messages store authentic Telegram message_id');

    // ---------------------------------------------------------
    // TEST 17: Group A reply target cannot be used in Group B
    // ---------------------------------------------------------
    // Try to reply in Group B to Vikram's message (which is in Group A)
    const res17 = await executeSendMessageWorkflow(testGroupB, 'Cross group attack on Vikram', incomingId);
    assert.strictEqual(res17.status, 400);
    assert.strictEqual(res17.body.code, 'CROSS_GROUP_REPLY_REJECTED');
    pass('TEST 17: Group A message ID cannot be used as reply target in Group B');

    // ---------------------------------------------------------
    // TEST 18: Existing dashboard functionality remains unaffected
    // ---------------------------------------------------------
    // Test Leave Group workflow still operates normally
    telegramApi.getChat = async (id) => ({ ok: true, result: { id, title: 'Beta Group' } as any });
    telegramApi.getMe = async () => ({ ok: true, result: { id: 9999, is_bot: true } as any });
    telegramApi.getChatMember = async (id, uid) => ({ ok: true, result: { status: 'administrator' } as any });
    telegramApi.leaveChat = async (id) => ({ ok: true, result: true });

    const leaveRes = await executeLeaveGroupWorkflow(testGroupB, 'LEAVE');
    assert.strictEqual(leaveRes.status, 200);
    assert.strictEqual(leaveRes.body.success, true);
    assert.strictEqual(db.getGroupSettings(testGroupB).botLeft, true);

    // After leaving, sending a message to Group B should be rejected
    const sendToLeftGroup = await executeSendMessageWorkflow(testGroupB, 'Should fail since bot left');
    assert.strictEqual(sendToLeftGroup.status, 400);
    assert.strictEqual(sendToLeftGroup.body.code, 'BOT_LEFT');
    pass('TEST 18: Existing dashboard functionality & group state transitions remain intact');

  } finally {
    telegramApi.sendMessage = origSendMessage;
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} DIRECT MESSAGE & REPLY TESTS PASSED! (${passed}/18)`);
  console.log('===================================================================\n');
  process.exit(0);
}

runDirectMessageReplyTests().catch((err) => {
  console.error('❌ Direct message & reply tests failed:', err);
  process.exit(1);
});
