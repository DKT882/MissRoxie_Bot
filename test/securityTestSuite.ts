import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from '../server/telegram/middleware.js';
import { CommandHandler, registerBotCommands, ADMIN_COMMANDS } from '../server/telegram/commands.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember, TelegramUser } from '../server/telegram/types.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    const msg = `❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.log(msg);
    failedCount++;
    throw new Error(msg);
  }
}

async function runSecurityTestSuite() {
  console.log('====================================================');
  console.log('STARTING ADMIN-ONLY SECURITY TEST SUITE (AUTH-01 to AUTH-25)');
  console.log('====================================================\n');

  const chatId = -1001234567890;
  const otherChatId = -1009999999999;
  const ownerId = 1001;
  const adminId = 2001;
  const customModId = 3001;
  const normalMemberId = 4001;
  const restrictedUserId = 5001;
  const leftUserId = 6001;
  const kickedUserId = 7001;
  const botId = 9999;
  const anonAdminProxyId = 1087968824;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;
  let setMyCommandsCalls: Array<{ commands: any[]; scope?: any }> = [];

  // Mock Telegram API
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
  });

  telegramApi.sendMessage = async (cId: number, text: string, opts?: any) => {
    lastSentMessage = { chatId: cId, text, options: opts };
    return {
      ok: true,
      result: {
        message_id: Math.floor(Math.random() * 10000) + 1,
        chat: { id: cId, type: 'supergroup' },
        text,
        date: Date.now()
      } as any
    };
  };

  telegramApi.setMyCommands = async (commands: any[], scope?: any) => {
    setMyCommandsCalls.push({ commands, scope });
    return { ok: true, result: true };
  };

  telegramApi.deleteWebhook = async () => ({ ok: true, result: true });

  const memberStatusMap: Record<number, TelegramChatMember> = {
    [ownerId]: {
      status: 'creator',
      user: { id: ownerId, is_bot: false, first_name: 'OwnerUser', username: 'owner_user' }
    },
    [adminId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      can_be_edited: false,
      user: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' }
    },
    [customModId]: {
      status: 'member',
      user: { id: customModId, is_bot: false, first_name: 'ModUser', username: 'mod_user' }
    },
    [normalMemberId]: {
      status: 'member',
      user: { id: normalMemberId, is_bot: false, first_name: 'MemberUser', username: 'member_user' }
    },
    [restrictedUserId]: {
      status: 'restricted',
      user: { id: restrictedUserId, is_bot: false, first_name: 'RestrictedUser', username: 'restricted_user' }
    },
    [leftUserId]: {
      status: 'left',
      user: { id: leftUserId, is_bot: false, first_name: 'LeftUser', username: 'left_user' }
    },
    [kickedUserId]: {
      status: 'kicked',
      user: { id: kickedUserId, is_bot: false, first_name: 'KickedUser', username: 'kicked_user' }
    },
    [botId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
    }
  };

  telegramApi.getChatMember = async (cId: number | string, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
  };

  // Seed custom role for customModId
  db.setCustomRole(chatId, customModId, 'MODERATOR');

  function makeContext(
    actorId: number,
    command: string,
    args: string[] = [],
    replyTo?: Partial<TelegramMessage>,
    isAnon: boolean = false,
    chatType: 'supergroup' | 'group' | 'private' = 'supergroup',
    senderChatId?: number
  ): CommandContext {
    const actorUser = memberStatusMap[actorId]?.user || {
      id: actorId,
      is_bot: false,
      first_name: `User${actorId}`
    };

    const message: TelegramMessage = {
      message_id: Math.floor(Math.random() * 10000) + 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: chatType, title: 'Security Test Group' },
      from: isAnon ? { id: anonAdminProxyId, is_bot: false, first_name: 'Group' } : actorUser,
      sender_chat: isAnon ? { id: senderChatId ?? chatId, type: 'supergroup', title: 'Security Test Group' } : undefined,
      text: `${command} ${args.join(' ')}`.trim(),
      reply_to_message: replyTo as TelegramMessage
    };

    return {
      message,
      chatId,
      chatTitle: 'Security Test Group',
      sender: actorUser,
      isAnonymousAdmin: isAnon,
      adminDisplayName: actorUser.username ? `@${actorUser.username}` : actorUser.first_name,
      args,
      command
    };
  }

  // ==========================================
  // AUTH-01 to AUTH-03: ALLOWED ADMIN EXECUTIONS
  // ==========================================
  console.log('--- Step 1: Admin & Owner Authorization ---');

  // AUTH-01: Group owner executes command -> ALLOWED
  {
    lastSentMessage = null;
    const ctx = makeContext(ownerId, '/ping');
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === true && auth.actor?.actorRole === 'OWNER', 'AUTH-01 Group owner executes command -> ALLOWED');
  }

  // AUTH-02: Group administrator executes command -> ALLOWED
  {
    lastSentMessage = null;
    const ctx = makeContext(adminId, '/status');
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === true && auth.actor?.actorRole === 'ADMIN', 'AUTH-02 Group administrator executes command -> ALLOWED');
  }

  // AUTH-03: Anonymous group administrator -> ALLOWED
  {
    lastSentMessage = null;
    const ctx = makeContext(0, '/help', [], undefined, true);
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === true && auth.actor?.isAnonymousAdmin === true, 'AUTH-03 Anonymous group administrator -> ALLOWED');
  }

  // ==========================================
  // AUTH-04 to AUTH-12: NORMAL MEMBER DENIED
  // ==========================================
  console.log('\n--- Step 2: Normal Group Member Access Denied Matrix ---');

  // AUTH-04: Normal group member executes /ban -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/ban', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-04 Normal group member executes /ban -> DENIED'
    );
  }

  // AUTH-05: Normal group member executes /kick -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/kick', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-05 Normal group member executes /kick -> DENIED'
    );
  }

  // AUTH-06: Normal group member executes /ban -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/ban', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-06 Normal group member executes /ban -> DENIED'
    );
  }

  // AUTH-07: Normal group member executes /promote -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/promote', [String(normalMemberId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-07 Normal group member executes /promote -> DENIED'
    );
  }

  // AUTH-08: Normal group member executes /demote -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/demote', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-08 Normal group member executes /demote -> DENIED'
    );
  }

  // AUTH-09: Normal group member executes /permissions -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/permissions', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-09 Normal group member executes /permissions -> DENIED'
    );
  }

  // AUTH-10: Normal group member executes /warn -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/warn', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-10 Normal group member executes /warn -> DENIED'
    );
  }

  // AUTH-11: Normal group member executes /status -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/status');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-11 Normal group member executes /status -> DENIED'
    );
  }

  // AUTH-12: Normal group member executes /kick -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/kick', [String(adminId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-12 Normal group member executes /kick -> DENIED'
    );
  }

  // ==========================================
  // AUTH-13 to AUTH-16: ROLE & CHAT TYPE BOUNDARIES
  // ==========================================
  console.log('\n--- Step 3: Role & Chat Type Boundaries ---');

  // AUTH-13: Custom MODERATOR without Telegram admin -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(customModId, '/warn', [String(normalMemberId)]);
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-13 Custom MODERATOR without Telegram admin -> DENIED'
    );
  }

  // AUTH-14: Restricted user executes command -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(restrictedUserId, '/status');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-14 Restricted user executes command -> DENIED'
    );
  }

  // AUTH-15: Left/Kicked user executes command -> DENIED
  {
    lastSentMessage = null;
    const ctxLeft = makeContext(leftUserId, '/kick', [String(normalMemberId)]);
    const handledLeft = await CommandHandler.handleCommand(ctxLeft);

    const ctxKicked = makeContext(kickedUserId, '/kick', [String(normalMemberId)]);
    const handledKicked = await CommandHandler.handleCommand(ctxKicked);

    assert(
      handledLeft === true &&
      handledKicked === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'AUTH-15 Left/Kicked user executes command -> DENIED'
    );
  }

  // AUTH-16: Private chat does not execute group moderation commands
  {
    lastSentMessage = null;
    const ctxPrivate = makeContext(ownerId, '/kick', [String(normalMemberId)], undefined, false, 'private');
    const handled = await CommandHandler.handleCommand(ctxPrivate);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ Roxie moderation commands are available only inside groups.',
      'AUTH-16 Private chat does not execute group moderation commands'
    );
  }

  // ==========================================
  // AUTH-17 to AUTH-18: TELEGRAM COMMAND AUTO-COMPLETE SCOPES
  // ==========================================
  console.log('\n--- Step 4: Telegram Command Auto-Complete Scopes ---');

  setMyCommandsCalls = [];
  await registerBotCommands();

  // AUTH-17: Telegram command auto-complete registered for all_chat_administrators
  {
    const adminCall = setMyCommandsCalls.find(c => c.scope?.type === 'all_chat_administrators');
    assert(
      Boolean(adminCall && adminCall.commands.length > 0 && adminCall.commands.some(c => c.command === 'help')),
      'AUTH-17 Telegram command auto-complete registered for all_chat_administrators'
    );
  }

  // AUTH-18: Telegram command auto-complete default scope is populated with public commands
  {
    const defaultCall = setMyCommandsCalls.find(c => c.scope?.type === 'default');
    assert(
      Boolean(defaultCall && defaultCall.commands.length > 0 && defaultCall.commands.some(c => c.command === 'help')),
      'AUTH-18 Telegram command auto-complete default scope is populated with public commands'
    );
  }

  // ==========================================
  // AUTH-19 to AUTH-25: DYNAMIC STATUS, SECURITY & RESILIENCE
  // ==========================================
  console.log('\n--- Step 5: Dynamic Status & Security Invariants ---');

  // AUTH-19: Actor status changes dynamically on Telegram -> next command reflects updated status immediately
  {
    const dynamicUserId = 8801;
    memberStatusMap[dynamicUserId] = {
      status: 'member',
      user: { id: dynamicUserId, is_bot: false, first_name: 'DynamicUser' }
    };

    const ctxBefore = makeContext(dynamicUserId, '/status');
    const authBefore = await TelegramMiddleware.requireAdmin(ctxBefore);

    // Promote user dynamically in Telegram status map
    memberStatusMap[dynamicUserId] = {
      status: 'administrator',
      can_restrict_members: true,
      user: { id: dynamicUserId, is_bot: false, first_name: 'DynamicUser' }
    };

    const ctxAfter = makeContext(dynamicUserId, '/status');
    const authAfter = await TelegramMiddleware.requireAdmin(ctxAfter);

    assert(
      authBefore.allowed === false && authAfter.allowed === true,
      'AUTH-19 Actor status changes dynamically on Telegram -> next command reflects updated status immediately'
    );
  }

  // AUTH-20: Telegram API failure during permission check -> safe fallback, no uncaught exception
  {
    const brokenUserId = 99999;
    const oldGetChatMember = telegramApi.getChatMember;
    telegramApi.getChatMember = async () => {
      throw new Error('Network timeout contacting Telegram API');
    };

    let didThrow = false;
    let authRes: any = null;
    try {
      const ctx = makeContext(brokenUserId, '/ping');
      authRes = await TelegramMiddleware.requireAdmin(ctx);
    } catch {
      didThrow = true;
    } finally {
      telegramApi.getChatMember = oldGetChatMember;
    }

    assert(
      !didThrow && authRes && authRes.allowed === false,
      'AUTH-20 Telegram API failure during permission check -> safe fallback, no uncaught exception'
    );
  }

  // AUTH-21: Command sender spoofing attempt -> rejected
  {
    // Fake context with mismatched sender/from
    const fakeCtx = makeContext(normalMemberId, '/ban', [String(normalMemberId)]);
    fakeCtx.adminDisplayName = '@fake_owner';
    fakeCtx.isAnonymousAdmin = false;
    const auth = await TelegramMiddleware.requireAdmin(fakeCtx);
    assert(auth.allowed === false, 'AUTH-21 Command sender spoofing attempt -> rejected');
  }

  // AUTH-22: Anonymous sender_chat validation -> only matching chat ID accepted
  {
    // Anonymous admin message but sender_chat is from a different chat
    const spoofedAnonCtx = makeContext(0, '/ban', [String(normalMemberId)], undefined, true, 'supergroup', otherChatId);
    const auth = await TelegramMiddleware.requireAdmin(spoofedAnonCtx);
    assert(
      auth.allowed === false,
      'AUTH-22 Anonymous sender_chat validation -> only matching chat ID accepted'
    );
  }

  // AUTH-23: Non-admin denial message does not leak sensitive group info
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/status');
    await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      text === '❌ This bot is available only to group administrators.' &&
      !text.includes('Total') &&
      !text.includes('Warn') &&
      !text.includes('ID'),
      'AUTH-23 Non-admin denial message does not leak sensitive group info'
    );
  }

  // AUTH-24: setMyCommands called during bot startup
  {
    const botManager = new TelegramBotManager();
    setMyCommandsCalls = [];
    process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCDefghIJKlmnOPQRstuvWXyz123456';
    await botManager.startPolling();
    botManager.stopPolling();
    assert(
      setMyCommandsCalls.length >= 2,
      'AUTH-24 setMyCommands called during bot startup'
    );
  }

  // AUTH-25: All admin commands protected by the same centralized admin guard
  {
    const allAdminCommands = Array.from(CommandHandler.ADMIN_ONLY_COMMANDS);

    let allProtected = true;
    for (const cmd of allAdminCommands) {
      lastSentMessage = null;
      const ctx = makeContext(normalMemberId, cmd);
      const handled = await CommandHandler.handleCommand(ctx);
      if (!handled || lastSentMessage?.text !== '❌ This bot is available only to group administrators.') {
        allProtected = false;
        console.error(`Command ${cmd} was NOT blocked by centralized admin guard!`);
        break;
      }
    }

    assert(
      allProtected === true,
      'AUTH-25 All admin commands protected by the same centralized admin guard'
    );
  }

  // ==========================================
  // FINAL SCORECARD
  // ==========================================
  console.log('\n====================================================');
  console.log(`TOTAL PASSED: ${passedCount} / ${passedCount + failedCount}`);
  console.log(`TOTAL FAILED: ${failedCount}`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runSecurityTestSuite().catch((err) => {
  console.error('Fatal Security Test Suite Error:', err);
  process.exit(1);
});
