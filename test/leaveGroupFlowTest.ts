import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { executeLeaveGroupWorkflow } from '../server.js';

function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
}

async function runLeaveGroupFlowTests() {
  console.log('===================================================================');
  console.log('🧪 Starting Dashboard Leave Group Flow Regression Test Suite');
  console.log('===================================================================\n');

  const origGetChat = telegramApi.getChat;
  const origGetMe = telegramApi.getMe;
  const origGetChatMember = telegramApi.getChatMember;
  const origLeaveChat = telegramApi.leaveChat;

  let passed = 0;

  try {
    const testValidGroup = -100999888101;
    const testAlreadyLeftGroup = -100999888102;
    const testTelegramLeftGroup = -100999888103;
    const testKickedGroup = -100999888104;
    const testStaleGroup = -100999888105;
    const testDeletedGroup = -100999888106;
    const testApiFailChatGroup = -100999888107;
    const testApiFailLeaveGroup = -100999888108;
    const testNoConfirmGroup = -100999888109;

    const botUserId = 7770001;

    // Standard bot identity mock
    telegramApi.getMe = async () => ({
      ok: true,
      result: {
        id: botUserId,
        is_bot: true,
        first_name: 'Miss Roxie',
        username: 'MissRoxie_Bot'
      } as any
    });

    // ---------------------------------------------------------
    // TEST 1: Valid group → successful leave
    // ---------------------------------------------------------
    db.updateGroupSettings(testValidGroup, {
      chatTitle: 'Valid Active Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testValidGroup) {
        return { ok: true, result: { id: testValidGroup, title: 'Valid Active Group', type: 'supergroup' } as any };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
    };

    telegramApi.getChatMember = async (chatId, userId) => {
      if (Number(chatId) === testValidGroup && userId === botUserId) {
        return { ok: true, result: { status: 'administrator', user: { id: botUserId } } as any };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
    };

    let leaveChatInvoked = false;
    telegramApi.leaveChat = async (chatId) => {
      if (Number(chatId) === testValidGroup) {
        leaveChatInvoked = true;
        return { ok: true, result: true };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
    };

    const res1 = await executeLeaveGroupWorkflow(testValidGroup, 'LEAVE');
    assert.strictEqual(res1.status, 200, 'Valid group leave must return status 200');
    assert.strictEqual(res1.body.success, true, 'Valid group leave must return success: true');
    assert.strictEqual(leaveChatInvoked, true, 'Telegram leaveChat must have been invoked');

    const s1 = db.getGroupSettings(testValidGroup);
    assert.strictEqual(s1.botLeft, true, 'Database must record botLeft: true');
    assert(s1.leftAt, 'leftAt timestamp must be recorded');
    assert.strictEqual(s1.unavailable, false, 'Group must not be marked unavailable when leave succeeds');
    passed++;
    pass('TEST 1: Valid group → successful leave with authoritative verification');

    // ---------------------------------------------------------
    // TEST 2: Already-left group (Local state check)
    // ---------------------------------------------------------
    db.updateGroupSettings(testAlreadyLeftGroup, {
      chatTitle: 'Locally Already Left Group',
      botLeft: true,
      leftAt: new Date().toISOString()
    });

    leaveChatInvoked = false;
    const res2 = await executeLeaveGroupWorkflow(testAlreadyLeftGroup, 'LEAVE');
    assert.strictEqual(res2.status, 400, 'Already-left group must return 400');
    assert.strictEqual(res2.body.code, 'ALREADY_LEFT', 'Code must be ALREADY_LEFT');
    assert.strictEqual(res2.body.botLeft, true);
    assert.strictEqual(leaveChatInvoked, false, 'leaveChat must not be called when group was already left');
    passed++;
    pass('TEST 2: Already-left group (Local state rejects redundant leave without API call)');

    // ---------------------------------------------------------
    // TEST 3: Already-left group (Telegram authoritative check - status: 'left')
    // ---------------------------------------------------------
    db.updateGroupSettings(testTelegramLeftGroup, {
      chatTitle: 'Telegram Left Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testTelegramLeftGroup) {
        return { ok: true, result: { id: testTelegramLeftGroup, title: 'Telegram Left Group' } as any };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
    };

    telegramApi.getChatMember = async (chatId, userId) => {
      if (Number(chatId) === testTelegramLeftGroup && userId === botUserId) {
        return { ok: true, result: { status: 'left', user: { id: botUserId } } as any };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
    };

    leaveChatInvoked = false;
    const res3 = await executeLeaveGroupWorkflow(testTelegramLeftGroup, 'LEAVE');
    assert.strictEqual(res3.status, 400, 'Authoritatively left group must return 400');
    assert.strictEqual(res3.body.code, 'ALREADY_NOT_MEMBER');
    assert.strictEqual(res3.body.botLeft, true);
    assert.strictEqual(leaveChatInvoked, false, 'leaveChat must not be called when bot already has status: left');

    // Verify local storage was synchronized to botLeft: true
    const s3 = db.getGroupSettings(testTelegramLeftGroup);
    assert.strictEqual(s3.botLeft, true, 'Local database must be synchronized to botLeft: true');
    passed++;
    pass('TEST 3: Already-left group (Authoritative membership status "left" synchronizes local state)');

    // ---------------------------------------------------------
    // TEST 4: Already-kicked group (Telegram getChatMember returns 403)
    // ---------------------------------------------------------
    db.updateGroupSettings(testKickedGroup, {
      chatTitle: 'Kicked From Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testKickedGroup) {
        return { ok: true, result: { id: testKickedGroup, title: 'Kicked From Group' } as any };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
    };

    telegramApi.getChatMember = async (chatId, userId) => {
      if (Number(chatId) === testKickedGroup) {
        return { ok: false, error_code: 403, description: 'Forbidden: bot was kicked from the supergroup chat' };
      }
      return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
    };

    const res4 = await executeLeaveGroupWorkflow(testKickedGroup, 'LEAVE');
    assert.strictEqual(res4.status, 400);
    assert.strictEqual(res4.body.code, 'ALREADY_NOT_MEMBER');
    assert.strictEqual(res4.body.botLeft, true);

    const s4 = db.getGroupSettings(testKickedGroup);
    assert.strictEqual(s4.botLeft, true, 'Local state must synchronize botLeft: true when kicked');
    passed++;
    pass('TEST 4: Already-kicked group (getChatMember 403 synchronizes local state to Bot Left)');

    // ---------------------------------------------------------
    // TEST 5: Invalid/stale chat ID (Telegram returns "chat not found")
    // ---------------------------------------------------------
    db.updateGroupSettings(testStaleGroup, {
      chatTitle: 'Stale Phantom Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testStaleGroup) {
        return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
      }
      return { ok: true, result: { id: chatId } as any };
    };

    const res5 = await executeLeaveGroupWorkflow(testStaleGroup, 'LEAVE');
    assert.strictEqual(res5.status, 404, 'Stale chat must return 404');
    assert.strictEqual(res5.body.code, 'CHAT_NOT_FOUND');
    assert.strictEqual(res5.body.isStale, true);

    // CRITICAL: Do NOT fake success or mark botLeft: true!
    const s5 = db.getGroupSettings(testStaleGroup);
    assert.strictEqual(s5.botLeft, false, 'Must NOT fake success or mark botLeft: true for stale groups');
    assert.strictEqual(s5.unavailable, true, 'Must mark unavailable: true in database');
    assert(s5.unavailableReason?.includes('chat not found'), 'Reason must record "chat not found"');
    passed++;
    pass('TEST 5: Invalid/stale chat ID (Marks group Unavailable/Stale, never fakes success)');

    // ---------------------------------------------------------
    // TEST 6: Deleted/unavailable group (Telegram returns "chat was deleted")
    // ---------------------------------------------------------
    db.updateGroupSettings(testDeletedGroup, {
      chatTitle: 'Deleted Chat Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testDeletedGroup) {
        return { ok: false, error_code: 400, description: 'Bad Request: chat was deleted' };
      }
      return { ok: true, result: { id: chatId } as any };
    };

    const res6 = await executeLeaveGroupWorkflow(testDeletedGroup, 'LEAVE');
    assert.strictEqual(res6.status, 404);
    assert.strictEqual(res6.body.code, 'CHAT_NOT_FOUND');
    assert.strictEqual(res6.body.isStale, true);

    const s6 = db.getGroupSettings(testDeletedGroup);
    assert.strictEqual(s6.botLeft, false, 'Must NOT mark botLeft: true for deleted groups');
    assert.strictEqual(s6.unavailable, true, 'Must mark unavailable: true in database');
    assert(s6.unavailableReason?.includes('chat was deleted'));
    passed++;
    pass('TEST 6: Deleted group (Telegram "chat was deleted" marks local status as Unavailable/Stale)');

    // ---------------------------------------------------------
    // TEST 7: Telegram API failure during getChat (502 / network error)
    // ---------------------------------------------------------
    db.updateGroupSettings(testApiFailChatGroup, {
      chatTitle: 'Temporary API Glitch Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testApiFailChatGroup) {
        return { ok: false, error_code: 502, description: 'Bad Gateway: Telegram network timeout' };
      }
      return { ok: true, result: { id: chatId } as any };
    };

    const res7 = await executeLeaveGroupWorkflow(testApiFailChatGroup, 'LEAVE');
    assert.strictEqual(res7.status, 502, 'Telegram network error must return 502');
    assert.strictEqual(res7.body.code, 'TELEGRAM_API_ERROR');

    const s7 = db.getGroupSettings(testApiFailChatGroup);
    assert.strictEqual(s7.botLeft, false, 'Transient Telegram network failure must NOT alter botLeft');
    assert.strictEqual(s7.unavailable, false, 'Transient Telegram network failure must NOT mark group unavailable');
    passed++;
    pass('TEST 7: Telegram API failure during getChat (Returns 502, leaves local state intact)');

    // ---------------------------------------------------------
    // TEST 8: Telegram API failure during leaveChat (500 Internal Error)
    // ---------------------------------------------------------
    db.updateGroupSettings(testApiFailLeaveGroup, {
      chatTitle: 'Fail On Leave Group',
      botLeft: false,
      unavailable: false
    });

    telegramApi.getChat = async (chatId) => {
      if (Number(chatId) === testApiFailLeaveGroup) {
        return { ok: true, result: { id: testApiFailLeaveGroup, title: 'Fail On Leave Group' } as any };
      }
      return { ok: true, result: { id: chatId } as any };
    };

    telegramApi.getChatMember = async (chatId, userId) => {
      if (Number(chatId) === testApiFailLeaveGroup) {
        return { ok: true, result: { status: 'administrator', user: { id: botUserId } } as any };
      }
      return { ok: true, result: { status: 'member' } as any };
    };

    telegramApi.leaveChat = async (chatId) => {
      if (Number(chatId) === testApiFailLeaveGroup) {
        return { ok: false, error_code: 500, description: 'Internal Server Error: failed to leave' };
      }
      return { ok: true, result: true };
    };

    const res8 = await executeLeaveGroupWorkflow(testApiFailLeaveGroup, 'LEAVE');
    assert.strictEqual(res8.status, 502);
    assert.strictEqual(res8.body.code, 'LEAVE_FAILED');

    const s8 = db.getGroupSettings(testApiFailLeaveGroup);
    assert.strictEqual(s8.botLeft, false, 'Failed leaveChat must NOT mark botLeft: true');
    passed++;
    pass('TEST 8: Telegram API failure during leaveChat (Returns 502, preserves botLeft: false)');

    // ---------------------------------------------------------
    // TEST 9: Confirmation validation (Must require explicit "LEAVE")
    // ---------------------------------------------------------
    const res9 = await executeLeaveGroupWorkflow(testNoConfirmGroup, 'no');
    assert.strictEqual(res9.status, 400);
    assert.strictEqual(res9.body.code, 'CONFIRMATION_REQUIRED');
    passed++;
    pass('TEST 9: Missing explicit confirmation "LEAVE" rejected safely');

  } finally {
    telegramApi.getChat = origGetChat;
    telegramApi.getMe = origGetMe;
    telegramApi.getChatMember = origGetChatMember;
    telegramApi.leaveChat = origLeaveChat;
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} LEAVE GROUP REGRESSION TESTS PASSED! (${passed}/9)`);
  console.log('===================================================================\n');
  process.exit(0);
}

runLeaveGroupFlowTests().catch((err) => {
  console.error('❌ Leave group test failed:', err);
  process.exit(1);
});
