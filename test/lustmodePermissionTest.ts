import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext } from '../server/telegram/middleware.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    const msg = `❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.error(msg);
    failed++;
    throw new Error(msg);
  }
}

async function runLustmodePermissionTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting STRICT /LUSTMODE PERMISSION TEST SUITE');
  console.log('====================================================\n');

  const chatId = -100777888999;
  const otherChatId = -100444555666;
  const ownerId = 10001;
  const directlyPromotedAdminId = 20001;
  const otherAdminId = 30001;
  const moderatorId = 40001;
  const regularUserId = 50001;
  const botId = 99999;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;

  // Mock Telegram API
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'RoxieBot', username: 'RoxieBot' }
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

  const memberStatusMap: Record<number, TelegramChatMember> = {
    // 1. Group Owner
    [ownerId]: {
      status: 'creator',
      user: { id: ownerId, is_bot: false, first_name: 'GroupOwner', username: 'group_owner' }
    },
    // 2. Admin directly promoted by group owner (can_be_edited: false)
    [directlyPromotedAdminId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_delete_messages: true,
      can_promote_members: false,
      can_be_edited: false,
      user: { id: directlyPromotedAdminId, is_bot: false, first_name: 'DirectAdmin', username: 'direct_admin' }
    },
    // 3. Other Admin (promoted by bot or sub-admin -> can_be_edited: true)
    [otherAdminId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_delete_messages: true,
      can_promote_members: false,
      can_be_edited: true,
      user: { id: otherAdminId, is_bot: false, first_name: 'OtherAdmin', username: 'other_admin' }
    },
    // 4. Custom Moderator (status: member with bot custom role)
    [moderatorId]: {
      status: 'member',
      user: { id: moderatorId, is_bot: false, first_name: 'ModUser', username: 'mod_user' }
    },
    // 5. Regular User
    [regularUserId]: {
      status: 'member',
      user: { id: regularUserId, is_bot: false, first_name: 'RegularUser', username: 'regular_user' }
    },
    // Bot
    [botId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'RoxieBot', username: 'RoxieBot' }
    }
  };

  telegramApi.getChatMember = async (cId: number | string, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
  };

  // Set custom role for moderator
  db.setCustomRole(chatId, moderatorId, 'MODERATOR');

  function makeContext(
    actorId: number,
    command: string,
    args: string[] = [],
    chatType: 'supergroup' | 'group' | 'private' = 'supergroup',
    targetChatId: number = chatId
  ): CommandContext {
    const actorUser = memberStatusMap[actorId]?.user || {
      id: actorId,
      is_bot: false,
      first_name: `User${actorId}`
    };

    const message: TelegramMessage = {
      message_id: Math.floor(Math.random() * 10000) + 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChatId, type: chatType, title: 'LustMode Test Group' },
      from: actorUser,
      text: `${command} ${args.join(' ')}`.trim()
    };

    return {
      message,
      chatId: targetChatId,
      chatTitle: 'LustMode Test Group',
      sender: actorUser,
      isAnonymousAdmin: false,
      adminDisplayName: actorUser.username ? `@${actorUser.username}` : actorUser.first_name,
      args,
      command
    };
  }

  // Ensure initial setting is clean (false)
  db.updateGroupSettings(chatId, { lustMode: false });
  db.updateGroupSettings(otherChatId, { lustMode: false });

  console.log('--- 1. GROUP OWNER TESTS (ALLOWED) ---');
  // 1.1 Owner /lustmode on
  {
    lastSentMessage = null;
    const ctx = makeContext(ownerId, '/lustmode', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '1.1 Group Owner can execute /lustmode on');
    assert(lastSentMessage?.text.includes('Roxie Lust Mode:</b> 🟢 <b>ON'), '1.1 Confirmation message sent for /lustmode on');
  }

  // 1.2 Owner /lustmode status
  {
    lastSentMessage = null;
    const ctx = makeContext(ownerId, '/lustmode', ['status']);
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('Roxie Lust Mode Settings'), '1.2 Group Owner can execute /lustmode status');
  }

  // 1.3 Owner /lustmode off
  {
    lastSentMessage = null;
    const ctx = makeContext(ownerId, '/lustmode', ['off']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === false, '1.3 Group Owner can execute /lustmode off');
    assert(lastSentMessage?.text.includes('Roxie Lust Mode:</b> 🔴 <b>OFF'), '1.3 Confirmation message sent for /lustmode off');
  }

  console.log('\n--- 2. ADMIN DIRECTLY PROMOTED BY OWNER TESTS (ALLOWED) ---');
  // 2.1 Directly promoted admin /lustmode on
  {
    lastSentMessage = null;
    const ctx = makeContext(directlyPromotedAdminId, '/lustmode', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '2.1 Directly promoted admin can execute /lustmode on');
    assert(lastSentMessage?.text.includes('Roxie Lust Mode:</b> 🟢 <b>ON'), '2.1 Confirmation message sent for /lustmode on');
  }

  // 2.2 Directly promoted admin /lustmode status
  {
    lastSentMessage = null;
    const ctx = makeContext(directlyPromotedAdminId, '/lustmode', ['status']);
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('Roxie Lust Mode Settings'), '2.2 Directly promoted admin can execute /lustmode status');
  }

  // 2.3 Directly promoted admin /lustmode off
  {
    lastSentMessage = null;
    const ctx = makeContext(directlyPromotedAdminId, '/lustmode', ['off']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === false, '2.3 Directly promoted admin can execute /lustmode off');
    assert(lastSentMessage?.text.includes('Roxie Lust Mode:</b> 🔴 <b>OFF'), '2.3 Confirmation message sent for /lustmode off');
  }

  // 2.4 Alias /lustmod on by directly promoted admin
  {
    lastSentMessage = null;
    const ctx = makeContext(directlyPromotedAdminId, '/lustmod', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '2.4 Directly promoted admin can execute /lustmod alias on');
  }

  console.log('\n--- 3. OTHER ADMINS TESTS (DENIED) ---');
  // 3.1 Other admin /lustmode on -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: false });
    lastSentMessage = null;
    const ctx = makeContext(otherAdminId, '/lustmode', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === false, '3.1 Other admin cannot execute /lustmode on (setting untouched)');
    assert(lastSentMessage?.text.includes('Only the group owner and administrators directly promoted by the owner'), '3.1 Error message sent to other admin for /lustmode on');
  }

  // 3.2 Other admin /lustmode off -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: true });
    lastSentMessage = null;
    const ctx = makeContext(otherAdminId, '/lustmode', ['off']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '3.2 Other admin cannot execute /lustmode off (setting untouched)');
    assert(lastSentMessage?.text.includes('Only the group owner and administrators directly promoted by the owner'), '3.2 Error message sent to other admin for /lustmode off');
  }

  // 3.3 Other admin /lustmode status -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(otherAdminId, '/lustmode', ['status']);
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('Only the group owner and administrators directly promoted by the owner'), '3.3 Other admin denied /lustmode status');
  }

  console.log('\n--- 4. MODERATORS TESTS (DENIED) ---');
  // 4.1 Moderator /lustmode on -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: false });
    lastSentMessage = null;
    const ctx = makeContext(moderatorId, '/lustmode', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === false, '4.1 Moderator cannot execute /lustmode on');
    assert(lastSentMessage !== null, '4.1 Denial message sent to moderator');
  }

  // 4.2 Moderator /lustmode off -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: true });
    lastSentMessage = null;
    const ctx = makeContext(moderatorId, '/lustmode', ['off']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '4.2 Moderator cannot execute /lustmode off');
  }

  // 4.3 Moderator /lustmode status -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(moderatorId, '/lustmode', ['status']);
    await CommandHandler.handleCommand(ctx);
    assert(!lastSentMessage?.text.includes('Roxie Lust Mode Settings'), '4.3 Moderator denied /lustmode status view');
  }

  console.log('\n--- 5. REGULAR MEMBERS TESTS (DENIED) ---');
  // 5.1 Regular member /lustmode on -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: false });
    lastSentMessage = null;
    const ctx = makeContext(regularUserId, '/lustmode', ['on']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === false, '5.1 Regular member cannot execute /lustmode on');
    assert(lastSentMessage !== null, '5.1 Denial message sent to regular member');
  }

  // 5.2 Regular member /lustmode off -> DENIED
  {
    db.updateGroupSettings(chatId, { lustMode: true });
    lastSentMessage = null;
    const ctx = makeContext(regularUserId, '/lustmode', ['off']);
    await CommandHandler.handleCommand(ctx);
    const settings = db.getGroupSettings(chatId);
    assert(settings.lustMode === true, '5.2 Regular member cannot execute /lustmode off');
  }

  // 5.3 Regular member /lustmode status -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(regularUserId, '/lustmode', ['status']);
    await CommandHandler.handleCommand(ctx);
    assert(!lastSentMessage?.text.includes('Roxie Lust Mode Settings'), '5.3 Regular member denied /lustmode status');
  }

  console.log('\n--- 6. DM / PRIVATE CHAT TESTS (DENIED) ---');
  // 6.1 Owner in DM -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(ownerId, '/lustmode', ['on'], 'private');
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('groups'), '6.1 Owner in DM cannot use /lustmode');
  }

  // 6.2 Directly Promoted Admin in DM -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(directlyPromotedAdminId, '/lustmode', ['status'], 'private');
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('groups'), '6.2 Admin in DM cannot use /lustmode');
  }

  // 6.3 Regular User in DM -> DENIED
  {
    lastSentMessage = null;
    const ctx = makeContext(regularUserId, '/lustmode', ['on'], 'private');
    await CommandHandler.handleCommand(ctx);
    assert(lastSentMessage?.text.includes('groups'), '6.3 Regular User in DM cannot use /lustmode');
  }

  console.log('\n--- 7. CHAT ID ISOLATION & AUDIT LOGGING ---');
  // 7.1 Group ChatId Isolation
  {
    db.updateGroupSettings(chatId, { lustMode: true });
    db.updateGroupSettings(otherChatId, { lustMode: false });
    assert(db.getGroupSettings(chatId).lustMode === true, '7.1 Group 1 has lustMode = true');
    assert(db.getGroupSettings(otherChatId).lustMode === false, '7.1 Group 2 has lustMode = false (isolated)');
  }

  // 7.2 Audit log verification
  {
    const logs = db.getGroupLogs(chatId, 20);
    const lustLogs = logs.filter(l => l.command === 'lustmod' || l.command === 'lustmode' || l.command === '/lustmode');
    assert(lustLogs.length > 0, '7.2 Audit logs recorded for lustmode changes and attempts');
  }

  console.log('\n====================================================');
  console.log(`🎉 LUSTMODE PERMISSION TEST SUITE COMPLETED: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================\n');

  process.exit(0);
}

runLustmodePermissionTestSuite().catch((err) => {
  console.error('Fatal error during lustmode permission test suite:', err);
  process.exit(1);
});
