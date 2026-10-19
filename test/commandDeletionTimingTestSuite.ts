process.env.NODE_ENV = 'test';

import assert from 'node:assert';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandContext } from '../server/telegram/middleware.js';

let passed = 0;
let failed = 0;

function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

function fail(testName: string, err: any) {
  console.error(`❌ [FAIL] ${testName}:`, err);
  failed++;
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Command Deletion Timing & Safety Test Suite');
  console.log('====================================================\n');

  const testGroupChatId = -1004494299999;
  const adminUserId = 111001;
  const regularUserId = 444001;

  let deleteCalls: Array<{ chatId: number; messageId: number; timestamp: number }> = [];
  let deleteMockHandler: ((cId: number, mId: number) => Promise<{ ok: boolean; description?: string }>) | null = null;

  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deleteCalls.push({ chatId: cId, messageId: mId, timestamp: Date.now() });
    if (deleteMockHandler) {
      return deleteMockHandler(cId, mId);
    }
    return { ok: true };
  };

  (telegramApi as any).sendMessage = async (cId: number, text: string, options?: any) => ({
    message_id: 9999,
    chat: { id: cId, type: 'supergroup' },
    date: Math.floor(Date.now() / 1000)
  });

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: adminUserId, is_bot: false, first_name: 'AdminUser' },
          can_delete_messages: true,
          can_restrict_members: true
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: 'RegularUser' }
      }
    };
  };

  const makeCtx = (opts: {
    command: string;
    msgId: number;
    userId?: number;
    chatType?: 'supergroup' | 'group' | 'channel' | 'private';
    chatId?: number;
    replyToMsgId?: number;
  }): CommandContext => {
    const cId = opts.chatId ?? testGroupChatId;
    const uId = opts.userId ?? adminUserId;
    const type = opts.chatType ?? 'supergroup';
    return {
      chatId: cId,
      chatTitle: 'Test Group Chat',
      command: opts.command,
      args: ['dummy_target'],
      isAnonymousAdmin: false,
      adminDisplayName: uId === adminUserId ? 'AdminUser' : 'RegularUser',
      sender: { id: uId, first_name: uId === adminUserId ? 'AdminUser' : 'RegularUser', is_bot: false },
      message: {
        message_id: opts.msgId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: cId, type: type as any },
        reply_to_message: opts.replyToMsgId
          ? {
              message_id: opts.replyToMsgId,
              date: Math.floor(Date.now() / 1000) - 10,
              chat: { id: cId, type: type as any },
              from: { id: 777001, first_name: 'RepliedUser', is_bot: false }
            }
          : undefined
      }
    };
  };

  // ----------------------------------------------------
  // TEST 1: Early Deletion Executes Immediately Before Handler Completion
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const msgId = 5001;
    const ctx = makeCtx({ command: '/ban', msgId });
    const startTime = Date.now();
    await CommandHandler.handleCommand(ctx);
    const duration = Date.now() - startTime;

    assert(
      deleteCalls.some((c) => c.messageId === msgId && c.chatId === testGroupChatId),
      'Ban command message must be deleted during command handling'
    );
    assert(duration < 1000, `Command execution took ${duration}ms, must not wait for artificial timers`);
    pass('TIMING-01: Command message is deleted immediately without artificial 4.5s delay');
  } catch (err) {
    fail('TIMING-01: Command message early deletion failed', err);
  }

  // ----------------------------------------------------
  // TEST 2: Unauthorized Member Cannot Cause Command Message Deletion
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const msgId = 5002;
    const ctx = makeCtx({ command: '/ban', msgId, userId: regularUserId });
    await CommandHandler.handleCommand(ctx);

    assert(
      !deleteCalls.some((c) => c.messageId === msgId),
      'Unauthorized command invocation must NOT delete the user message'
    );
    pass('TIMING-02: Unauthorized regular user command message is NOT deleted');
  } catch (err) {
    fail('TIMING-02: Unauthorized user command message test failed', err);
  }

  // ----------------------------------------------------
  // TEST 3: Channel Chat Cannot Cause Command Message Deletion
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const msgId = 5003;
    const ctx = makeCtx({ command: '/ban', msgId, chatType: 'channel' });
    await CommandHandler.handleCommand(ctx);

    assert(
      !deleteCalls.some((c) => c.messageId === msgId),
      'Channel chat message must NOT pass group check or trigger command deletion'
    );
    pass('TIMING-03: Channel chat is strictly rejected from group command deletion');
  } catch (err) {
    fail('TIMING-03: Channel chat rejection failed', err);
  }

  // ----------------------------------------------------
  // TEST 4: Deduplication in Handlers with Dual Deletion (e.g. handleDel)
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const cmdMsgId = 5004;
    const targetMsgId = 4001;
    const ctx = makeCtx({ command: '/del', msgId: cmdMsgId, replyToMsgId: targetMsgId });
    await CommandHandler.handleCommand(ctx);

    const cmdMsgDeletes = deleteCalls.filter((c) => c.messageId === cmdMsgId);
    assert.strictEqual(
      cmdMsgDeletes.length,
      1,
      `Command message ${cmdMsgId} must only be deleted once by Telegram API, got ${cmdMsgDeletes.length}`
    );
    pass('TIMING-04: Deduplication prevents duplicate delete calls for the command message in /del');
  } catch (err) {
    fail('TIMING-04: Deduplication in /del failed', err);
  }

  // ----------------------------------------------------
  // TEST 5: Deduplication in Moderation Action (e.g. handleDBan)
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const cmdMsgId = 5005;
    const replyMsgId = 4002;
    const ctx = makeCtx({ command: '/dban', msgId: cmdMsgId, replyToMsgId: replyMsgId });
    await CommandHandler.handleCommand(ctx);

    const cmdMsgDeletes = deleteCalls.filter((c) => c.messageId === cmdMsgId);
    assert.strictEqual(
      cmdMsgDeletes.length,
      1,
      `Command message ${cmdMsgId} must only be deleted once, got ${cmdMsgDeletes.length}`
    );
    pass('TIMING-05: Deduplication prevents duplicate delete calls for the command message in /dban');
  } catch (err) {
    fail('TIMING-05: Deduplication in /dban failed', err);
  }

  // ----------------------------------------------------
  // TEST 6: Graceful Handling of "Message to delete not found" Error
  // ----------------------------------------------------
  try {
    deleteMockHandler = async () => ({
      ok: false,
      description: 'Bad Request: message to delete not found'
    });
    const result = await CommandHandler.deleteCommandMessage(testGroupChatId, 99901, 'ban');
    assert.strictEqual(result, false, 'Should return false when Telegram API reports message not found');
    pass('TIMING-06: Telegram 400 "message to delete not found" handled gracefully without throwing');
  } catch (err) {
    fail('TIMING-06: Message not found error handling failed', err);
  } finally {
    deleteMockHandler = null;
  }

  // ----------------------------------------------------
  // TEST 7: Graceful Handling of Missing Bot Delete Rights
  // ----------------------------------------------------
  try {
    deleteMockHandler = async () => ({
      ok: false,
      description: 'Bad Request: message can\'t be deleted'
    });
    const result = await CommandHandler.deleteCommandMessage(testGroupChatId, 99902, 'ban');
    assert.strictEqual(result, false, 'Should return false when bot lacks deletion permission');
    pass('TIMING-07: Telegram 400 "message can\'t be deleted" handled gracefully without throwing');
  } catch (err) {
    fail('TIMING-07: Missing bot delete rights test failed', err);
  } finally {
    deleteMockHandler = null;
  }

  // ----------------------------------------------------
  // TEST 8: Public Commands (/help, /rules, /ping) in groups ARE deleted immediately
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const msgId = 5008;
    const ctx = makeCtx({ command: '/help', msgId });
    await CommandHandler.handleCommand(ctx);

    assert(
      deleteCalls.some((c) => c.messageId === msgId && c.chatId === testGroupChatId),
      'Public group command (/help) must be auto-deleted immediately upon invocation'
    );
    pass('TIMING-08: Public group commands are deleted immediately upon invocation');
  } catch (err) {
    fail('TIMING-08: Public group command auto-delete test failed', err);
  }

  // ----------------------------------------------------
  // TEST 9: Private Chat Commands are NOT deleted
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const msgId = 5009;
    const ctx = makeCtx({ command: '/ban', msgId, chatType: 'private', chatId: 12345 });
    await CommandHandler.handleCommand(ctx);

    assert(
      !deleteCalls.some((c) => c.messageId === msgId),
      'Private chat command must NOT be auto-deleted'
    );
    pass('TIMING-09: Private chat commands are strictly exempted from auto-deletion');
  } catch (err) {
    fail('TIMING-09: Private chat auto-delete test failed', err);
  }

  // ----------------------------------------------------
  // TEST 10: Helper Direct Call Strictly Rejects Non-Group Chats
  // ----------------------------------------------------
  try {
    deleteCalls = [];
    const channelCtx = makeCtx({ command: '/ban', msgId: 7001, chatType: 'channel', chatId: -1009998887771 });
    const resChannel = await CommandHandler.deleteCommandMessage(channelCtx, 'ban');
    assert.strictEqual(resChannel, false, 'Helper directly called with channel context must return false');

    const privateCtx = makeCtx({ command: '/ban', msgId: 7002, chatType: 'private', chatId: 888123 });
    const resPrivate = await CommandHandler.deleteCommandMessage(privateCtx, 'ban');
    assert.strictEqual(resPrivate, false, 'Helper directly called with private context must return false');

    const groupCtx = makeCtx({ command: '/ban', msgId: 7003, chatType: 'group', chatId: -5551234 });
    const resGroup = await CommandHandler.deleteCommandMessage(groupCtx, 'ban');
    assert.strictEqual(resGroup, true, 'Helper directly called with group context must return true');

    pass('TIMING-10: deleteCommandMessage helper directly validates chat types (group/supergroup=allowed, channel/private=rejected)');
  } catch (err) {
    fail('TIMING-10: Direct helper validation failed', err);
  }

  console.log('\n====================================================');
  console.log(`🎉 SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runTestSuite().catch((err) => {
  console.error('Fatal suite error:', err);
  process.exit(1);
});
