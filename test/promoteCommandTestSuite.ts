import assert from 'assert';
import { CommandHandler } from '../server/telegram/commands.js';
import { TelegramMiddleware, CommandContext } from '../server/telegram/middleware.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember } from '../server/telegram/types.js';

let passedTests = 0;
let failedTests = 0;

function pass(name: string) {
  passedTests++;
  console.log(`✅ [PASS] ${name}`);
}

function fail(name: string, error: any) {
  failedTests++;
  console.error(`❌ [FAIL] ${name}:`, error?.message || error);
}

async function runPromoteTestSuite() {
  console.log('\n====================================================');
  console.log('🚀 RUNNING TELEGRAM /promote COMMAND TEST SUITE');
  console.log('====================================================\n');

  const chatId = -1009988776655;
  const ownerId = 111001;
  const adminWithPromoteId = 222001;
  const newlyPromotedAdminId = 222002;
  const normalMemberId = 333001;
  const shortUsernameTargetId = 333002;
  const globalTargetId = 333003;
  const botId = 999999999;
  const anonAdminProxyId = 1087968824;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;
  let promoteCalls: Array<{ chatId: number | string; userId: number; perms: any }> = [];

  const originalSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const originalGetChatMember = telegramApi.getChatMember.bind(telegramApi);
  const originalGetChatAdministrators = telegramApi.getChatAdministrators.bind(telegramApi);
  const originalGetMe = telegramApi.getMe.bind(telegramApi);
  const originalPromote = telegramApi.promoteChatMember.bind(telegramApi);

  const memberStatusMap: Record<number, TelegramChatMember> = {
    [ownerId]: {
      status: 'creator',
      user: { id: ownerId, is_bot: false, first_name: 'GroupOwner', username: 'group_owner' }
    },
    [adminWithPromoteId]: {
      status: 'administrator',
      can_promote_members: true,
      can_delete_messages: true,
      can_restrict_members: true,
      can_invite_users: true,
      user: { id: adminWithPromoteId, is_bot: false, first_name: 'AdminPromote', username: 'admin_promote' }
    },
    [newlyPromotedAdminId]: {
      status: 'administrator',
      can_promote_members: true,
      can_delete_messages: true,
      can_restrict_members: true,
      user: { id: newlyPromotedAdminId, is_bot: false, first_name: 'NewlyPromoted', username: 'newly_promoted' }
    },
    [normalMemberId]: {
      status: 'member',
      user: { id: normalMemberId, is_bot: false, first_name: 'NormalMember', username: 'normal_member' }
    },
    [shortUsernameTargetId]: {
      status: 'member',
      user: { id: shortUsernameTargetId, is_bot: false, first_name: 'AbcUser', username: 'abc' }
    },
    [globalTargetId]: {
      status: 'member',
      user: { id: globalTargetId, is_bot: false, first_name: 'GlobalUser', username: 'global_user' }
    },
    [botId]: {
      status: 'administrator',
      can_promote_members: true,
      can_restrict_members: true,
      can_delete_messages: true,
      can_invite_users: true,
      user: { id: botId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' }
    }
  };

  telegramApi.sendMessage = async (cId: number | string, text: string, options?: any) => {
    lastSentMessage = { chatId: Number(cId), text, options };
    return { ok: true, result: { message_id: 999, text } };
  };

  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'MissRoxie_Bot', username: 'MissRoxie_Bot' }
  });

  telegramApi.getChatMember = async (cId: number | string, uId: number, forceFresh: boolean = false) => {
    const member = memberStatusMap[uId];
    if (member) return { ok: true, result: JSON.parse(JSON.stringify(member)) };
    return { ok: false, description: 'PARTICIPANT_ID_INVALID', error_code: 400 };
  };

  telegramApi.getChatAdministrators = async (cId: number | string, forceFresh: boolean = false) => {
    // Only return owner and adminWithPromoteId initially (simulating newlyPromotedAdminId not yet in cached list)
    const admins = [memberStatusMap[ownerId], memberStatusMap[adminWithPromoteId], memberStatusMap[botId]];
    return { ok: true, result: JSON.parse(JSON.stringify(admins)) };
  };

  telegramApi.promoteChatMember = async (cId: number | string, uId: number, perms: any) => {
    promoteCalls.push({ chatId: cId, userId: uId, perms });
    if (memberStatusMap[uId]) {
      memberStatusMap[uId].status = 'administrator';
    }
    return { ok: true, result: true };
  };

  // Prepopulate test users in DB
  db.cacheUser(memberStatusMap[ownerId].user, chatId);
  db.cacheUser(memberStatusMap[adminWithPromoteId].user, chatId);
  db.cacheUser(memberStatusMap[normalMemberId].user, chatId);
  db.cacheUser(memberStatusMap[shortUsernameTargetId].user, chatId);
  db.cacheUser(memberStatusMap[globalTargetId].user); // Cached globally only

  const makeCtx = (
    senderId: number,
    cmd: string,
    args: string[] = [],
    replyTo?: Partial<TelegramMessage>,
    isAnon: boolean = false
  ): CommandContext => {
    const sender = isAnon
      ? { id: anonAdminProxyId, is_bot: false, first_name: 'Group' }
      : (memberStatusMap[senderId]?.user || { id: senderId, is_bot: false, first_name: 'User' });

    const message: TelegramMessage = {
      message_id: 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup', title: 'Promote Test Supergroup' },
      from: sender,
      text: `${cmd} ${args.join(' ')}`.trim(),
      reply_to_message: replyTo as TelegramMessage
    };

    return {
      message,
      chatId,
      chatTitle: 'Promote Test Supergroup',
      sender,
      isAnonymousAdmin: isAnon,
      adminDisplayName: isAnon ? 'Anonymous Admin' : sender.first_name,
      args,
      command: cmd
    };
  };

  try {
    // ==========================================
    // SECTION 1: BUG 1 INVESTIGATION & FIX
    // Administrator authorization when executing /promote
    // ==========================================
    console.log('--- SECTION 1: Administrator Authorization & Stale Cache Resilience ---');

    // TEST 1: Group Owner executes /promote -> AUTHORIZED
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [`@${memberStatusMap[normalMemberId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 1: Owner successfully promoted member');
      pass('PROMOTE-01: Group owner executes /promote -> AUTHORIZED & executed');
    }

    // Reset target to member for subsequent tests
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 2: Existing Administrator with can_promote_members executes /promote -> AUTHORIZED
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(adminWithPromoteId, '/promote', [`@${memberStatusMap[normalMemberId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 2: Admin successfully promoted member');
      pass('PROMOTE-02: Existing admin with can_promote_members -> AUTHORIZED & executed');
    }

    // Reset target to member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 3: BUG 1 REPRODUCTION & VERIFICATION:
    // User was previously cached in memberCache as a regular member (e.g. spoke 2 minutes ago),
    // and is NOT present in getChatAdministrators cache.
    // Must NOT reject with "This bot is available only to group administrators."
    {
      lastSentMessage = null;
      // Intentionally poison memberCache with stale 'member' status for newlyPromotedAdminId
      (TelegramMiddleware as any).memberCache.set(`${chatId}_${newlyPromotedAdminId}`, {
        member: { status: 'member', user: memberStatusMap[newlyPromotedAdminId].user },
        timestamp: Date.now() - 60000 // Cached 1 minute ago as member
      });

      const ctx = makeCtx(newlyPromotedAdminId, '/promote', [`@${memberStatusMap[normalMemberId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(
        !lastSentMessage?.text.includes('available only to group administrators'),
        'TEST 3: Newly promoted admin was NOT falsely rejected with stale member cache'
      );
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 3: Newly promoted admin successfully executed /promote');
      pass('PROMOTE-03: Newly promoted admin with stale non-admin cache -> AUTHORIZED via fresh verification');
    }

    // Reset target to member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 4: Anonymous administrator executes /promote -> AUTHORIZED
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(anonAdminProxyId, '/promote', [`@${memberStatusMap[normalMemberId].user.username}`], undefined, true);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 4: Anonymous admin successfully promoted member');
      pass('PROMOTE-04: Anonymous admin on behalf of group -> AUTHORIZED & executed');
    }

    // Reset target to member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 5: Normal non-admin member executes /promote -> DENIED
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(normalMemberId, '/promote', [`@${memberStatusMap[shortUsernameTargetId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert.strictEqual(lastSentMessage?.text, '❌ This bot is available only to group administrators.');
      pass('PROMOTE-05: Non-admin member executes /promote -> strictly DENIED with admin notice');
    }

    // ==========================================
    // SECTION 2: BUG 2 INVESTIGATION & FIX
    // Target user resolution with valid/invalid usernames
    // ==========================================
    console.log('\n--- SECTION 2: Target User Resolution & Username Formats ---');

    // TEST 6: BUG 2 REPRODUCTION & VERIFICATION:
    // Target is valid 3-character username @abc (e.g. Fragment / short username)
    // Running `/promote @abc` must resolve user and promote them
    {
      lastSentMessage = null;
      promoteCalls = [];
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['@abc']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(
        !lastSentMessage?.text.includes('not a valid username'),
        'TEST 6: Valid 3-char username @abc was NOT rejected as invalid username'
      );
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 6: Valid username @abc was successfully promoted');
      assert.strictEqual(promoteCalls.length, 1);
      assert.strictEqual(promoteCalls[0].userId, shortUsernameTargetId);
      pass('PROMOTE-06: 3-character username @abc -> recognized and promoted successfully');
    }

    // Reset short target to member
    memberStatusMap[shortUsernameTargetId].status = 'member';

    // TEST 7: Bare username without @ prefix: `/promote abc`
    {
      lastSentMessage = null;
      promoteCalls = [];
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['abc']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 7: Bare username abc successfully promoted');
      assert.strictEqual(promoteCalls.length, 1);
      assert.strictEqual(promoteCalls[0].userId, shortUsernameTargetId);
      pass('PROMOTE-07: Bare 3-char username "abc" without @ -> recognized and promoted');
    }

    // Reset short target to member
    memberStatusMap[shortUsernameTargetId].status = 'member';

    // TEST 8: Global user lookup: `/promote @global_user`
    {
      lastSentMessage = null;
      promoteCalls = [];
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['@global_user']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 8: Global cache user successfully promoted');
      assert.strictEqual(promoteCalls.length, 1);
      assert.strictEqual(promoteCalls[0].userId, globalTargetId);
      pass('PROMOTE-08: Target user known in global cache -> resolved and promoted');
    }

    // Reset global target to member
    memberStatusMap[globalTargetId].status = 'member';

    // TEST 9: Numeric user ID target: `/promote 333001`
    {
      lastSentMessage = null;
      promoteCalls = [];
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [String(normalMemberId)]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 9: Numeric ID target successfully promoted');
      assert.strictEqual(promoteCalls.length, 1);
      assert.strictEqual(promoteCalls[0].userId, normalMemberId);
      pass('PROMOTE-09: Numeric Telegram user ID target -> promoted successfully');
    }

    // Reset normal member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 10: Promotion via reply to member message: `/promote`
    {
      lastSentMessage = null;
      promoteCalls = [];
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [], { from: memberStatusMap[normalMemberId].user });
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 10: Reply target successfully promoted');
      assert.strictEqual(promoteCalls.length, 1);
      assert.strictEqual(promoteCalls[0].userId, normalMemberId);
      pass('PROMOTE-10: Promotion via message reply -> promoted successfully');
    }

    // Reset normal member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 11: Invalid username format: `/promote @invalid!name#`
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['@invalid!name#']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('not a valid Telegram username format'), 'TEST 11: Format validation error returned');
      pass('PROMOTE-11: Invalid username characters -> rejected with clear format error');
    }

    // TEST 12: Too short username: `/promote @ab` (2 chars)
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['@ab']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('not a valid Telegram username format'), 'TEST 12: Length validation error returned');
      pass('PROMOTE-12: Sub-3-character username -> rejected with clear format error');
    }

    // TEST 13: Valid username format but unseen in group: `/promote @unseen_valid_user`
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', ['@unseen_valid_user']);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(
        lastSentMessage?.text.includes('Could not find a member with username @unseen_valid_user in local group memory'),
        'TEST 13: Helpful architectural explanation returned'
      );
      assert(
        !lastSentMessage?.text.includes('not a valid username'),
        'TEST 13: Did NOT claim a valid username format is invalid'
      );
      pass('PROMOTE-13: Valid format but unseen username -> explains Telegram interaction requirement clearly');
    }

    // TEST 14: Missing target entirely: `/promote` (no reply, no args)
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', []);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes("couldn't identify that user"), 'TEST 14: Missing target prompt returned');
      pass('PROMOTE-14: Missing target entirely -> requests reply or numeric ID');
    }

    // ==========================================
    // SECTION 3: Promotion Hierarchy & Safety Guards
    // ==========================================
    console.log('\n--- SECTION 3: Promotion Hierarchy & Safety Guards ---');

    // TEST 15: Cannot promote group owner
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(adminWithPromoteId, '/promote', [`@${memberStatusMap[ownerId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('already the group owner'), 'TEST 15: Owner target rejected');
      pass('PROMOTE-15: Attempting to promote group owner -> rejected');
    }

    // TEST 16: Cannot promote already-administrator member
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [`@${memberStatusMap[adminWithPromoteId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('already an administrator'), 'TEST 16: Already admin target rejected');
      pass('PROMOTE-16: Attempting to promote existing administrator -> rejected');
    }

    // TEST 17: Cannot promote bot itself
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [String(botId)]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('Cannot promote the bot itself'), 'TEST 17: Bot self target rejected');
      pass('PROMOTE-17: Attempting to promote the bot itself -> rejected');
    }

    // TEST 18: Cannot promote yourself
    {
      lastSentMessage = null;
      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(adminWithPromoteId, '/promote', [String(adminWithPromoteId)]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('You cannot promote yourself'), 'TEST 18: Self promote rejected');
      pass('PROMOTE-18: Attempting to promote yourself -> rejected');
    }

    // TEST 19: Cannot promote user who left or is not in chat
    {
      lastSentMessage = null;
      const departedUserId = 444001;
      memberStatusMap[departedUserId] = {
        status: 'left',
        user: { id: departedUserId, is_bot: false, first_name: 'Departed', username: 'departed_user' }
      };
      db.cacheUser(memberStatusMap[departedUserId].user, chatId);

      TelegramMiddleware.clearMemberCache(chatId);
      const ctx = makeCtx(ownerId, '/promote', [String(departedUserId)]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('not currently a member of this group'), 'TEST 19: Departed user rejected');
      pass('PROMOTE-19: Attempting to promote departed/non-member -> rejected');
    }

    // TEST 20: Bot lacks can_promote_members permission -> blocked
    {
      lastSentMessage = null;
      const origBotPromote = memberStatusMap[botId].can_promote_members;
      memberStatusMap[botId].can_promote_members = false;
      TelegramMiddleware.clearMemberCache(chatId);

      const ctx = makeCtx(ownerId, '/promote', [`@${memberStatusMap[normalMemberId].user.username}`]);
      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(
        lastSentMessage?.text.includes('bot needs the "Add New Admins" administrator permission'),
        'TEST 20: Bot missing rights notice returned'
      );
      memberStatusMap[botId].can_promote_members = origBotPromote;
      pass('PROMOTE-20: Bot lacks can_promote_members -> blocked with clear requirement message');
    }

    // ==========================================
    // SECTION 4: Chat Type Boundaries (group, supergroup, channel, private)
    // ==========================================
    console.log('\n--- SECTION 4: Chat Type Boundaries & Channel Rejection ---');

    // TEST 21: TelegramMiddleware.isGroup() unit verification across chat types
    {
      const groupMsg = { chat: { id: -123456, type: 'group' } } as TelegramMessage;
      const supergroupMsg = { chat: { id: -100123456789, type: 'supergroup' } } as TelegramMessage;
      const channelMsg = { chat: { id: -100987654321, type: 'channel' } } as TelegramMessage;
      const privateMsg = { chat: { id: 12345678, type: 'private' } } as TelegramMessage;
      const omittedGroupMsg = { chat: { id: -100111222333 } } as TelegramMessage;
      const omittedPrivateMsg = { chat: { id: 12345678 } } as TelegramMessage;

      assert.strictEqual(TelegramMiddleware.isGroup(groupMsg), true, 'Group type must be true');
      assert.strictEqual(TelegramMiddleware.isGroup(supergroupMsg), true, 'Supergroup type must be true');
      assert.strictEqual(TelegramMiddleware.isGroup(channelMsg), false, 'Channel type with negative ID must be FALSE');
      assert.strictEqual(TelegramMiddleware.isGroup(privateMsg), false, 'Private type must be false');
      assert.strictEqual(TelegramMiddleware.isGroup(omittedGroupMsg), false, 'Omitted/unknown type must be false (strictly requires explicit group/supergroup)');
      assert.strictEqual(TelegramMiddleware.isGroup(omittedPrivateMsg), false, 'Omitted type with positive ID must be false');
      pass('PROMOTE-21: isGroup() strictly allows only explicit group/supergroup and rejects channel/private/omitted');
    }

    // TEST 22: Legitimate basic group chat ('group') executes /promote
    {
      lastSentMessage = null;
      promoteCalls = [];
      const basicGroupId = -5551234;
      db.cacheUser(memberStatusMap[ownerId].user, basicGroupId);
      db.cacheUser(memberStatusMap[normalMemberId].user, basicGroupId);
      TelegramMiddleware.clearMemberCache(basicGroupId);

      const basicGroupMsg: TelegramMessage = {
        message_id: 101,
        date: Math.floor(Date.now() / 1000),
        chat: { id: basicGroupId, type: 'group', title: 'Basic Group' },
        from: memberStatusMap[ownerId].user,
        text: `/promote @${memberStatusMap[normalMemberId].user.username}`
      };

      const ctx: CommandContext = {
        message: basicGroupMsg,
        chatId: basicGroupId,
        chatTitle: 'Basic Group',
        sender: memberStatusMap[ownerId].user,
        isAnonymousAdmin: false,
        adminDisplayName: 'GroupOwner',
        args: [`@${memberStatusMap[normalMemberId].user.username}`],
        command: '/promote'
      };

      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert(lastSentMessage?.text.includes('promoted to administrator'), 'TEST 22: Basic group supported');
      pass('PROMOTE-22: Legitimate basic group chat (type="group") executes /promote successfully');
    }

    // Reset normal member
    memberStatusMap[normalMemberId].status = 'member';

    // TEST 23: Channel chat with negative ID ('channel') is strictly rejected from /promote
    {
      lastSentMessage = null;
      promoteCalls = [];
      const channelId = -1008887776655;
      TelegramMiddleware.clearMemberCache(channelId);

      const channelMsg: TelegramMessage = {
        message_id: 102,
        date: Math.floor(Date.now() / 1000),
        chat: { id: channelId, type: 'channel', title: 'Broadcast Channel' },
        from: memberStatusMap[ownerId].user,
        text: `/promote @${memberStatusMap[normalMemberId].user.username}`
      };

      const ctx: CommandContext = {
        message: channelMsg,
        chatId: channelId,
        chatTitle: 'Broadcast Channel',
        sender: memberStatusMap[ownerId].user,
        isAnonymousAdmin: false,
        adminDisplayName: 'GroupOwner',
        args: [`@${memberStatusMap[normalMemberId].user.username}`],
        command: '/promote'
      };

      const handled = await CommandHandler.handleCommand(ctx);
      assert.strictEqual(handled, true);
      assert.strictEqual(
        lastSentMessage?.text,
        '❌ Roxie moderation commands are available only inside groups.',
        'TEST 23: Channel rejected with group-only notice'
      );
      assert.strictEqual(promoteCalls.length, 0, 'No promote call should occur in a channel');
      pass('PROMOTE-23: Channel chat with negative ID is strictly rejected from group-only commands');
    }

    // TEST 24: Direct requireAdmin() on channel returns allowed = false
    {
      const channelId = -1008887776655;
      const channelMsg: TelegramMessage = {
        message_id: 103,
        date: Math.floor(Date.now() / 1000),
        chat: { id: channelId, type: 'channel', title: 'Broadcast Channel' },
        from: memberStatusMap[ownerId].user,
        text: '/promote'
      };

      const ctx: CommandContext = {
        message: channelMsg,
        chatId: channelId,
        chatTitle: 'Broadcast Channel',
        sender: memberStatusMap[ownerId].user,
        isAnonymousAdmin: false,
        adminDisplayName: 'GroupOwner',
        args: [],
        command: '/promote'
      };

      const auth = await TelegramMiddleware.requireAdmin(ctx, true);
      assert.strictEqual(auth.allowed, false, 'Channel auth must be false');
      assert.strictEqual(auth.reason, '❌ Roxie moderation commands are available only inside groups.');
      pass('PROMOTE-24: requireAdmin() strictly rejects channel chats even with owner credentials');
    }

  } finally {
    // Restore mocks
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getChatAdministrators = originalGetChatAdministrators;
    telegramApi.getMe = originalGetMe;
    telegramApi.promoteChatMember = originalPromote;
  }

  console.log('\n====================================================');
  console.log(`🎉 /promote SUITE COMPLETE: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPromoteTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
