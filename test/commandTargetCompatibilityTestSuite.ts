process.env.NODE_ENV = 'test';

import assert from 'node:assert';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { CommandContext } from '../server/telegram/middleware.js';

let passed = 0;
let failed = 0;

function pass(name: string) {
  console.log(`✅ [PASS] ${name}`);
  passed++;
}

function fail(name: string, err: any) {
  console.error(`❌ [FAIL] ${name}:`, err?.message || err);
  failed++;
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Command Target Compatibility & Resolution Test Suite');
  console.log('====================================================\n');

  const testGroupChatId = -1004494299999;
  const adminUserId = 111001;
  const regularUserId = 444001;
  const targetUserId = 777001;
  const targetUsername = 'known_target_user';
  const otherUserId = 888001;
  const otherUsername = 'other_target_user';
  const botUserId = 99999999;

  // Cache test users in DB
  db.cacheUser(
    { id: targetUserId, is_bot: false, first_name: 'TargetUser', username: targetUsername },
    testGroupChatId
  );
  db.cacheUser(
    { id: otherUserId, is_bot: false, first_name: 'OtherUser', username: otherUsername },
    testGroupChatId
  );
  db.cacheUser(
    { id: adminUserId, is_bot: false, first_name: 'AdminUser' },
    testGroupChatId
  );

  let lastSentMessage = '';
  let lastSentOpts: any = null;
  let deleteCalls: Array<{ chatId: number; messageId: number }> = [];
  let mutedUsers: Array<{ userId: number; untilDate?: number }> = [];
  let bannedUsers: Array<{ userId: number; untilDate?: number }> = [];
  let kickedUsers: number[] = [];
  let promotedUsers: number[] = [];
  let demotedUsers: number[] = [];

  function resetState() {
    lastSentMessage = '';
    lastSentOpts = null;
    deleteCalls = [];
    mutedUsers = [];
    bannedUsers = [];
    kickedUsers = [];
    promotedUsers = [];
    demotedUsers = [];
  }

  (telegramApi as any).sendMessage = async (cId: any, text: string, opts?: any) => {
    lastSentMessage = text;
    lastSentOpts = opts;
    return { ok: true, result: { message_id: 9999, chat: { id: cId, type: 'supergroup' }, date: Math.floor(Date.now() / 1000) } };
  };

  (telegramApi as any).deleteMessage = async (cId: any, mId: number) => {
    deleteCalls.push({ chatId: cId, messageId: mId });
    return { ok: true };
  };

  (telegramApi as any).restrictChatMember = async (cId: any, uId: number, perms: any, opts?: any) => {
    mutedUsers.push({ userId: uId, untilDate: typeof opts === 'number' ? opts : opts?.until_date });
    return { ok: true };
  };

  (telegramApi as any).banChatMember = async (cId: any, uId: number, opts?: any) => {
    bannedUsers.push({ userId: uId, untilDate: typeof opts === 'number' ? opts : opts?.until_date });
    return { ok: true };
  };

  (telegramApi as any).unbanChatMember = async (cId: any, uId: number, onlyIfBanned?: boolean) => {
    kickedUsers.push(uId);
    return { ok: true };
  };

  (telegramApi as any).promoteChatMember = async (cId: any, uId: number, perms: any) => {
    const isDemote = Object.values(perms || {}).every((v) => v === false);
    if (isDemote) {
      demotedUsers.push(uId);
    } else {
      promotedUsers.push(uId);
    }
    return { ok: true };
  };

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: botUserId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' }
  });

  const demoteTargetId = 666001;
  const demoteTargetUsername = 'admin_to_demote';
  db.cacheUser(
    { id: demoteTargetId, is_bot: false, first_name: 'AdminToDemote', username: demoteTargetUsername },
    testGroupChatId
  );

  (telegramApi as any).getChatMember = async (cId: any, uId: number) => {
    if (uId === botUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: botUserId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' },
          can_delete_messages: true,
          can_restrict_members: true,
          can_promote_members: true
        }
      };
    }
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'creator',
          user: { id: adminUserId, is_bot: false, first_name: 'AdminUser' },
          can_delete_messages: true,
          can_restrict_members: true,
          can_promote_members: true
        }
      };
    }
    if (uId === demoteTargetId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: demoteTargetId, is_bot: false, first_name: 'AdminToDemote', username: demoteTargetUsername },
          can_be_edited: true
        }
      };
    }
    if (uId === targetUserId) {
      return {
        ok: true,
        result: {
          status: 'member',
          user: { id: targetUserId, is_bot: false, first_name: 'TargetUser', username: targetUsername }
        }
      };
    }
    if (uId === otherUserId) {
      return {
        ok: true,
        result: {
          status: 'member',
          user: { id: otherUserId, is_bot: false, first_name: 'OtherUser', username: otherUsername }
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: `User ${uId}` }
      }
    };
  };

  const makeCtx = (opts: {
    command: string;
    args?: string[];
    msgId?: number;
    userId?: number;
    chatType?: 'supergroup' | 'group' | 'channel' | 'private';
    chatId?: number;
    replyTo?: {
      messageId: number;
      from?: { id: number; first_name: string; username?: string; is_bot?: boolean };
      sender_chat?: { id: number; title: string };
    } | null;
  }): CommandContext => {
    const cId = opts.chatId ?? testGroupChatId;
    const uId = opts.userId ?? adminUserId;
    const type = opts.chatType ?? 'supergroup';
    const msgId = opts.msgId ?? 6001;

    let replyToMsg: any = undefined;
    if (opts.replyTo) {
      replyToMsg = {
        message_id: opts.replyTo.messageId,
        date: Math.floor(Date.now() / 1000) - 10,
        chat: { id: cId, type: type as any },
        from: opts.replyTo.from,
        sender_chat: opts.replyTo.sender_chat
      };
    }

    return {
      chatId: cId,
      chatTitle: 'Target Compatibility Supergroup',
      command: opts.command,
      args: opts.args ?? [],
      rawArgs: (opts.args ?? []).join(' '),
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      sender: { id: uId, first_name: 'AdminUser', is_bot: false },
      message: {
        message_id: msgId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: cId, type: type as any },
        from: { id: uId, first_name: 'AdminUser', is_bot: false },
        reply_to_message: replyToMsg
      }
    };
  };

  // ----------------------------------------------------
  // TEST 1: Reply Target for Standard Moderation (/mute, /ban, /kick)
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      replyTo: { messageId: 4001, from: { id: targetUserId, first_name: 'TargetUser', username: targetUsername } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === targetUserId), 'Target user must be muted via reply');
    pass('COMPAT-01: /mute resolves target from replied message correctly');
  } catch (err) {
    fail('COMPAT-01: /mute via reply failed', err);
  }

  // ----------------------------------------------------
  // TEST 2: Reply Target with Duration (/mute 300 or /mute 10m)
  // Ensures duration argument does not become target user ID
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      args: ['300', 'Spamming in chat'],
      replyTo: { messageId: 4002, from: { id: targetUserId, first_name: 'TargetUser', username: targetUsername } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === targetUserId), 'Target user must be muted, NOT user 300');
    assert(!mutedUsers.some((u) => u.userId === 300), 'Numeric duration 300 must NOT become target ID');
    assert(mutedUsers[0].untilDate && mutedUsers[0].untilDate > Math.floor(Date.now() / 1000), 'Duration must be set');
    pass('COMPAT-02: /mute 300 on reply targets replied user and parses 300 as duration seconds');
  } catch (err) {
    fail('COMPAT-02: /mute 300 duration disambiguation failed', err);
  }

  // ----------------------------------------------------
  // TEST 3: Reply Target with Compound Duration (/mute 1h30m reason)
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      args: ['1h30m', 'Cooldown'],
      replyTo: { messageId: 4003, from: { id: targetUserId, first_name: 'TargetUser' } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === targetUserId), 'Target user must be muted');
    assert(lastSentMessage.includes('1 hour 30 minutes'), 'Formatted duration must be present in response');
    pass('COMPAT-03: /mute 1h30m on reply resolves target and parses compound duration');
  } catch (err) {
    fail('COMPAT-03: Compound duration parsing failed', err);
  }

  // ----------------------------------------------------
  // TEST 4: Delete Moderation Commands (/dmute, /dban, /dkick) on Reply
  // Deletes both command message and replied message, and moderates target
  // ----------------------------------------------------
  try {
    resetState();
    const cmdMsgId = 6004;
    const repliedMsgId = 4004;
    const ctx = makeCtx({
      command: '/dmute',
      msgId: cmdMsgId,
      replyTo: { messageId: repliedMsgId, from: { id: targetUserId, first_name: 'TargetUser', username: targetUsername } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === targetUserId), 'Target user must be muted');
    assert(deleteCalls.some((c) => c.messageId === cmdMsgId), 'Command message must be deleted');
    assert(deleteCalls.some((c) => c.messageId === repliedMsgId), 'Replied message must be deleted');
    pass('COMPAT-04: /dmute deletes command message and replied message, and mutes target');
  } catch (err) {
    fail('COMPAT-04: /dmute on reply failed', err);
  }

  // ----------------------------------------------------
  // TEST 5: Silent Moderation Commands (/smute, /sban, /skick) on Reply
  // ----------------------------------------------------
  try {
    resetState();
    const cmdMsgId = 6005;
    const repliedMsgId = 4005;
    const ctx = makeCtx({
      command: '/smute',
      msgId: cmdMsgId,
      args: ['10m', 'Silent reason'],
      replyTo: { messageId: repliedMsgId, from: { id: targetUserId, first_name: 'TargetUser' } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === targetUserId), 'Target user must be muted');
    assert(deleteCalls.some((c) => c.messageId === cmdMsgId), 'Command message must be deleted');
    assert(deleteCalls.some((c) => c.messageId === repliedMsgId), 'Replied message must be deleted');
    pass('COMPAT-05: /smute silently mutes target user and deletes both messages');
  } catch (err) {
    fail('COMPAT-05: /smute failed', err);
  }

  // ----------------------------------------------------
  // TEST 6: Explicit @username Target (without reply)
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/ban',
      args: [`@${targetUsername}`, 'Banned for spam']
    });
    await CommandHandler.handleCommand(ctx);
    assert(bannedUsers.some((u) => u.userId === targetUserId), 'User resolved via @username must be banned');
    pass('COMPAT-06: /ban @username resolves target user from database cache');
  } catch (err) {
    fail('COMPAT-06: /ban @username failed', err);
  }

  // ----------------------------------------------------
  // TEST 7: Explicit Numeric User ID Target (without reply, >= 5 digits)
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/kick',
      args: [String(targetUserId), 'Kicked for inactivity']
    });
    await CommandHandler.handleCommand(ctx);
    assert(kickedUsers.includes(targetUserId), 'Numeric user ID must be kicked');
    pass('COMPAT-07: /kick <numeric_id> resolves target user ID directly');
  } catch (err) {
    fail('COMPAT-07: /kick <numeric_id> failed', err);
  }

  // ----------------------------------------------------
  // TEST 8: Explicit @username Overriding Replied Message
  // When an admin replies to User A but explicitly types @UserB
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      args: [`@${otherUsername}`, '10m'],
      replyTo: { messageId: 4008, from: { id: targetUserId, first_name: 'TargetUser' } }
    });
    await CommandHandler.handleCommand(ctx);
    assert(mutedUsers.some((u) => u.userId === otherUserId), 'Explicit @username must take precedence over replied user');
    assert(!mutedUsers.some((u) => u.userId === targetUserId), 'Replied user must NOT be muted when explicit @username given');
    pass('COMPAT-08: Explicit @username takes precedence over replied message sender');
  } catch (err) {
    fail('COMPAT-08: Explicit @username precedence test failed', err);
  }

  // ----------------------------------------------------
  // TEST 9: Unresolved Duration/Reason Tokens Do NOT Guess Usernames
  // When no reply is present and admin passes /mute 10m or /mute spam
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      args: ['10m']
    });
    await CommandHandler.handleCommand(ctx);
    assert.strictEqual(mutedUsers.length, 0, 'No user should be muted without a target');
    assert(lastSentMessage.includes('Please reply to the user\'s message or specify @username / user ID'), 'Must return standard target prompt');
    assert(!lastSentMessage.includes('@10m'), 'Must NOT treat "10m" as a username lookup');
    pass('COMPAT-09: /mute 10m without reply correctly prompts for target instead of guessing @10m');
  } catch (err) {
    fail('COMPAT-09: Unresolved duration target test failed', err);
  }

  // ----------------------------------------------------
  // TEST 10: Non-Telegram Numeric Values (< 5 digits) Without Reply Prompt for Target
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/mute',
      args: ['300']
    });
    await CommandHandler.handleCommand(ctx);
    assert.strictEqual(mutedUsers.length, 0, 'No user should be muted when 300 is passed without reply');
    assert(lastSentMessage.includes('Please reply to the user\'s message or specify @username / user ID'), 'Must prompt for target');
    pass('COMPAT-10: /mute 300 without reply prompts for target instead of attempting to mute ID 300');
  } catch (err) {
    fail('COMPAT-10: Short numeric target test failed', err);
  }

  // ----------------------------------------------------
  // TEST 11: Service Message Reply Informs Admin
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/ban',
      replyTo: { messageId: 4011 } // Service message has no from or sender_chat
    });
    await CommandHandler.handleCommand(ctx);
    assert.strictEqual(bannedUsers.length, 0, 'Service message must not trigger ban');
    assert(lastSentMessage.includes('Cannot moderate a service message'), 'Must state service messages cannot be moderated');
    pass('COMPAT-11: Moderation commands replying to service messages return informative error');
  } catch (err) {
    fail('COMPAT-11: Service message reply test failed', err);
  }

  // ----------------------------------------------------
  // TEST 12: Anonymous Admin / Channel Sender Target Rejection
  // ----------------------------------------------------
  try {
    resetState();
    const ctx = makeCtx({
      command: '/ban',
      replyTo: { messageId: 4012, sender_chat: { id: testGroupChatId, title: 'Anonymous Sender' } }
    });
    await CommandHandler.handleCommand(ctx);
    assert.strictEqual(bannedUsers.length, 0, 'Anonymous admin must not be banned');
    assert(lastSentMessage.includes('anonymous') || lastSentMessage.includes('channels'), 'Must reject anonymous admin / channel target');
    pass('COMPAT-12: Moderation actions against anonymous administrators or channels are safely rejected');
  } catch (err) {
    fail('COMPAT-12: Anonymous admin target test failed', err);
  }

  // ----------------------------------------------------
  // TEST 13: Role & Permission Commands (/promote, /demote) Compatibility
  // ----------------------------------------------------
  try {
    resetState();
    // Demote via reply
    const ctxDemoteReply = makeCtx({
      command: '/demote',
      replyTo: { messageId: 4013, from: { id: demoteTargetId, first_name: 'AdminToDemote', username: demoteTargetUsername } }
    });
    await CommandHandler.handleCommand(ctxDemoteReply);
    assert(demotedUsers.includes(demoteTargetId), '/demote via reply must demote target user');

    // Demote via @username
    resetState();
    const ctxDemoteUsername = makeCtx({
      command: '/demote',
      args: [`@${demoteTargetUsername}`]
    });
    await CommandHandler.handleCommand(ctxDemoteUsername);
    assert(demotedUsers.includes(demoteTargetId), '/demote @username must demote target user');

    pass('COMPAT-13: /demote supports both reply and @username target resolutions');
  } catch (err) {
    fail('COMPAT-13: /demote target compatibility test failed', err);
  }

  // ----------------------------------------------------
  // TEST 14: Warning Commands (/warn, /warnings, /resetwarns) Compatibility
  // ----------------------------------------------------
  try {
    resetState();
    // Warn via reply
    const ctxWarn = makeCtx({
      command: '/warn',
      args: ['Rule violation'],
      replyTo: { messageId: 4014, from: { id: targetUserId, first_name: 'TargetUser', username: targetUsername } }
    });
    await CommandHandler.handleCommand(ctxWarn);
    assert(lastSentMessage.includes('Warning issued'), 'Warning must be issued to replied user');

    // Reset warns via @username
    resetState();
    const ctxReset = makeCtx({
      command: '/resetwarns',
      args: [`@${targetUsername}`]
    });
    await CommandHandler.handleCommand(ctxReset);
    assert(lastSentMessage.includes('Warnings reset') || lastSentMessage.includes('reset'), 'Warnings must be reset for @username');

    pass('COMPAT-14: Warning commands (/warn, /resetwarns) work across reply and @username targets');
  } catch (err) {
    fail('COMPAT-14: Warning commands compatibility test failed', err);
  }

  // ----------------------------------------------------
  // TEST 15: Media Exemption Commands (/free, /unfree) Compatibility
  // ----------------------------------------------------
  try {
    resetState();
    // Free via reply
    const ctxFreeReply = makeCtx({
      command: '/free',
      replyTo: { messageId: 4015, from: { id: targetUserId, first_name: 'TargetUser', username: targetUsername } }
    });
    await CommandHandler.handleCommand(ctxFreeReply);
    assert(lastSentMessage.includes('Member Freed!'), '/free via reply must grant media exemption');

    // Unfree via @username
    resetState();
    const ctxUnfreeUsername = makeCtx({
      command: '/unfree',
      args: [`@${targetUsername}`]
    });
    await CommandHandler.handleCommand(ctxUnfreeUsername);
    assert(lastSentMessage.includes('Exemption Revoked') || lastSentMessage.includes('revoked'), '/unfree @username must revoke exemption');

    pass('COMPAT-15: Media exemption commands (/free, /unfree) work consistently with reply and mention');
  } catch (err) {
    fail('COMPAT-15: Media exemption compatibility test failed', err);
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
