import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from '../server/telegram/middleware.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember } from '../server/telegram/types.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    const msg = `❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`;
    console.error(msg);
    failedCount++;
    throw new Error(msg);
  }
}

async function runAdminAuthorizationTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING COMPREHENSIVE ADMIN AUTHORIZATION TEST SUITE');
  console.log('====================================================\n');

  const chatId = -1001987654321;
  const otherChatId = -1001122334455;
  const creatorId = 111001;
  const admin1Id = 222001;
  const admin2Id = 222002;
  const admin3Id = 222003;
  const normalMemberId = 333001;
  const restrictedMemberId = 444001;
  const leftMemberId = 555001;
  const kickedMemberId = 666001;
  const dynamicAdminId = 777001;
  const botId = 999999;
  const anonProxyId = 1087968824;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;

  // Mock Telegram API
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'MissRoxieBot', username: 'MissRoxieBot' }
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
    [creatorId]: {
      status: 'creator',
      user: { id: creatorId, is_bot: false, first_name: 'GroupCreator', username: 'original_creator_handle' }
    },
    [admin1Id]: {
      status: 'administrator',
      can_restrict_members: true,
      can_delete_messages: true,
      can_promote_members: true,
      can_be_edited: false,
      user: { id: admin1Id, is_bot: false, first_name: 'AdminOne', username: 'admin_one' }
    },
    [admin2Id]: {
      status: 'administrator',
      can_restrict_members: true,
      can_delete_messages: true,
      can_promote_members: false,
      can_be_edited: true,
      user: { id: admin2Id, is_bot: false, first_name: 'AdminTwo', username: 'admin_two' }
    },
    [admin3Id]: {
      status: 'administrator',
      can_restrict_members: false,
      can_delete_messages: true,
      can_promote_members: false,
      can_be_edited: true,
      user: { id: admin3Id, is_bot: false, first_name: 'AdminThree', username: 'admin_three' }
    },
    [normalMemberId]: {
      status: 'member',
      user: { id: normalMemberId, is_bot: false, first_name: 'NormalMember', username: 'normal_user' }
    },
    [restrictedMemberId]: {
      status: 'restricted',
      user: { id: restrictedMemberId, is_bot: false, first_name: 'RestrictedMember', username: 'restricted_user' }
    },
    [leftMemberId]: {
      status: 'left',
      user: { id: leftMemberId, is_bot: false, first_name: 'LeftMember', username: 'left_user' }
    },
    [kickedMemberId]: {
      status: 'kicked',
      user: { id: kickedMemberId, is_bot: false, first_name: 'KickedMember', username: 'kicked_user' }
    },
    [botId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'MissRoxieBot', username: 'MissRoxieBot' }
    }
  };

  // Mock getChatAdministrators returning all creators & administrators
  telegramApi.getChatAdministrators = async (cId: number | string) => {
    const admins = Object.values(memberStatusMap).filter(
      m => m.status === 'creator' || m.status === 'administrator'
    );
    return { ok: true, result: admins };
  };

  telegramApi.getChatMember = async (cId: number | string, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: false, error_code: 400, description: 'Bad Request: user not found' };
  };

  function makeContext(
    actorId: number,
    command: string,
    args: string[] = [],
    replyTo?: Partial<TelegramMessage>,
    isAnon: boolean = false,
    chatType: 'supergroup' | 'group' | 'private' = 'supergroup',
    targetChatId: number = chatId,
    customUsername?: string
  ): CommandContext {
    const baseUser = memberStatusMap[actorId]?.user || {
      id: actorId,
      is_bot: false,
      first_name: `User${actorId}`
    };

    const actorUser = {
      ...baseUser,
      username: customUsername !== undefined ? customUsername : baseUser.username
    };

    const message: TelegramMessage = {
      message_id: Math.floor(Math.random() * 10000) + 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: targetChatId, type: chatType, title: 'Auth Test Group' },
      from: isAnon ? { id: anonProxyId, is_bot: false, first_name: 'Group' } : actorUser,
      sender_chat: isAnon ? { id: targetChatId, type: 'supergroup', title: 'Auth Test Group' } : undefined,
      text: `${command} ${args.join(' ')}`.trim(),
      reply_to_message: replyTo as TelegramMessage
    };

    return {
      message,
      chatId: targetChatId,
      chatTitle: 'Auth Test Group',
      sender: actorUser,
      isAnonymousAdmin: isAnon,
      adminDisplayName: actorUser.username ? `@${actorUser.username}` : actorUser.first_name,
      args,
      command
    };
  }

  // Clear cache before starting
  TelegramMiddleware.clearMemberCache();

  // =========================================================================
  // TEST 1: Group Creator -> Authorized
  // =========================================================================
  console.log('--- TEST 1: Group Creator Authorization ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(creatorId, '/status');
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === true && auth.actor?.actorRole === 'OWNER' && auth.actor?.actorRank === RoleRank.OWNER, 'Test 1: Group creator is authorized as OWNER');
  }

  // =========================================================================
  // TEST 2: Group Administrator -> Authorized
  // =========================================================================
  console.log('\n--- TEST 2: Group Administrator Authorization ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(admin1Id, '/status');
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === true && auth.actor?.actorRole === 'ADMIN' && auth.actor?.actorRank === RoleRank.ADMIN, 'Test 2: Group administrator is authorized as ADMIN');
  }

  // =========================================================================
  // TEST 3: Regular Member -> Rejected
  // =========================================================================
  console.log('\n--- TEST 3: Regular Member Rejection ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/status');
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === false, 'Test 3: Regular member is rejected by requireAdmin');
    
    // Command handler sends denial message
    const handled = await CommandHandler.handleCommand(ctx);
    assert(handled === true && lastSentMessage?.text === '❌ This bot is available only to group administrators.', 'Test 3: Denial message sent to regular member');
  }

  // =========================================================================
  // TEST 4: Restricted Member -> Rejected
  // =========================================================================
  console.log('\n--- TEST 4: Restricted Member Rejection ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(restrictedMemberId, '/warn', [String(normalMemberId)]);
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === false, 'Test 4: Restricted member is rejected by requireAdmin');
  }

  // =========================================================================
  // TEST 5: Left Member -> Rejected
  // =========================================================================
  console.log('\n--- TEST 5: Left Member Rejection ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(leftMemberId, '/ban', [String(normalMemberId)]);
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === false, 'Test 5: Left member is rejected by requireAdmin');
  }

  // =========================================================================
  // TEST 6: Kicked / Banned Member -> Rejected
  // =========================================================================
  console.log('\n--- TEST 6: Kicked Member Rejection ---');
  {
    lastSentMessage = null;
    const ctx = makeContext(kickedMemberId, '/kick', [String(normalMemberId)]);
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(auth.allowed === false, 'Test 6: Kicked member is rejected by requireAdmin');
  }

  // =========================================================================
  // TEST 7: Username Changed -> Authorization Still Works by Numeric User ID
  // =========================================================================
  console.log('\n--- TEST 7: Username Changed (Numeric ID Identity) ---');
  {
    lastSentMessage = null;
    // Admin 1 changes handle to completely different username or removes username
    const ctxWithNewUsername = makeContext(admin1Id, '/status', [], undefined, false, 'supergroup', chatId, 'totally_new_cool_handle');
    const auth1 = await TelegramMiddleware.requireAdmin(ctxWithNewUsername);
    assert(auth1.allowed === true && auth1.actor?.actorUserId === admin1Id, 'Test 7.1: Admin authorized after username changed');

    const ctxWithNoUsername = makeContext(admin1Id, '/status', [], undefined, false, 'supergroup', chatId, '');
    const auth2 = await TelegramMiddleware.requireAdmin(ctxWithNoUsername);
    assert(auth2.allowed === true && auth2.actor?.actorUserId === admin1Id, 'Test 7.2: Admin authorized with no username (numeric ID only)');

    // Non-admin spoofing admin's username handle -> Rejected because numeric ID is checked
    const ctxImposter = makeContext(normalMemberId, '/status', [], undefined, false, 'supergroup', chatId, 'admin_one');
    const authImposter = await TelegramMiddleware.requireAdmin(ctxImposter);
    assert(authImposter.allowed === false, 'Test 7.3: Imposter with admin username is rejected due to numeric ID check');
  }

  // =========================================================================
  // TEST 8: Admin Promoted After Cache Creation -> Recognized Upon Cache Refresh / Invalidation
  // =========================================================================
  console.log('\n--- TEST 8: Admin Promotion & Cache Invalidation ---');
  {
    TelegramMiddleware.clearMemberCache();
    memberStatusMap[dynamicAdminId] = {
      status: 'member',
      user: { id: dynamicAdminId, is_bot: false, first_name: 'DynamicUser', username: 'dynamic_user' }
    };

    const ctxBefore = makeContext(dynamicAdminId, '/status');
    const authBefore = await TelegramMiddleware.requireAdmin(ctxBefore);
    assert(authBefore.allowed === false, 'Test 8.1: Dynamic user is initially non-admin');

    // Promotion event occurs: status updated & clearMemberCache called
    memberStatusMap[dynamicAdminId] = {
      status: 'administrator',
      can_restrict_members: true,
      can_delete_messages: true,
      user: { id: dynamicAdminId, is_bot: false, first_name: 'DynamicUser', username: 'dynamic_user' }
    };
    TelegramMiddleware.clearMemberCache(chatId, dynamicAdminId);

    const ctxAfter = makeContext(dynamicAdminId, '/status');
    const authAfter = await TelegramMiddleware.requireAdmin(ctxAfter);
    assert(authAfter.allowed === true && authAfter.actor?.actorRole === 'ADMIN', 'Test 8.2: Dynamic user recognized as ADMIN after promotion and cache invalidation');
  }

  // =========================================================================
  // TEST 9: Admin Demoted -> Rejected
  // =========================================================================
  console.log('\n--- TEST 9: Admin Demotion & Cache Invalidation ---');
  {
    // Demote dynamicAdminId back to regular member
    memberStatusMap[dynamicAdminId] = {
      status: 'member',
      user: { id: dynamicAdminId, is_bot: false, first_name: 'DynamicUser', username: 'dynamic_user' }
    };
    TelegramMiddleware.clearMemberCache(chatId, dynamicAdminId);

    const ctxDemoted = makeContext(dynamicAdminId, '/status');
    const authDemoted = await TelegramMiddleware.requireAdmin(ctxDemoted);
    assert(authDemoted.allowed === false, 'Test 9: Demoted admin is immediately rejected upon cache invalidation');
  }

  // =========================================================================
  // TEST 10: Multiple Administrators -> All Recognized
  // =========================================================================
  console.log('\n--- TEST 10: Multiple Administrators Recognized ---');
  {
    const ctxA1 = makeContext(admin1Id, '/status');
    const ctxA2 = makeContext(admin2Id, '/status');
    const ctxA3 = makeContext(admin3Id, '/status');

    const [auth1, auth2, auth3] = await Promise.all([
      TelegramMiddleware.requireAdmin(ctxA1),
      TelegramMiddleware.requireAdmin(ctxA2),
      TelegramMiddleware.requireAdmin(ctxA3)
    ]);

    assert(
      auth1.allowed === true && auth2.allowed === true && auth3.allowed === true,
      'Test 10: Multiple administrators are all recognized and authorized simultaneously'
    );
  }

  // =========================================================================
  // TEST 11: Creator + Multiple Administrators -> All Recognized
  // =========================================================================
  console.log('\n--- TEST 11: Creator + Administrators Complete Set ---');
  {
    const isCreatorAdmin = await TelegramMiddleware.isUserGroupAdmin(chatId, creatorId);
    const isAdmin1Admin = await TelegramMiddleware.isUserGroupAdmin(chatId, admin1Id);
    const isAdmin2Admin = await TelegramMiddleware.isUserGroupAdmin(chatId, admin2Id);
    const isMemberAdmin = await TelegramMiddleware.isUserGroupAdmin(chatId, normalMemberId);

    assert(
      isCreatorAdmin === true && isAdmin1Admin === true && isAdmin2Admin === true && isMemberAdmin === false,
      'Test 11: isUserGroupAdmin correctly resolves creator and all administrators while denying regular members'
    );
  }

  // =========================================================================
  // TEST 12: Unknown User (ID not found / 0) -> Rejected
  // =========================================================================
  console.log('\n--- TEST 12: Unknown User Rejection ---');
  {
    const unknownUserId = 999888777;
    const ctxUnknown = makeContext(unknownUserId, '/status');
    const auth = await TelegramMiddleware.requireAdmin(ctxUnknown);
    assert(auth.allowed === false, 'Test 12.1: Unknown user ID is safely rejected');

    const ctxZero = makeContext(0, '/status');
    const authZero = await TelegramMiddleware.requireAdmin(ctxZero);
    assert(authZero.allowed === false, 'Test 12.2: Zero user ID is safely rejected');
  }

  // =========================================================================
  // TEST 13: Wrong Chat (Private Chat / DM) -> Rejected
  // =========================================================================
  console.log('\n--- TEST 13: Private Chat / DM Command Rejection ---');
  {
    lastSentMessage = null;
    const ctxDM = makeContext(creatorId, '/ban', [String(normalMemberId)], undefined, false, 'private');
    const auth = await TelegramMiddleware.requireAdmin(ctxDM);
    assert(auth.allowed === false, 'Test 13.1: requireAdmin rejects DM / private chat');
    
    const handled = await CommandHandler.handleCommand(ctxDM);
    assert(
      handled === true && lastSentMessage?.text === '❌ Roxie moderation commands are available only inside groups.',
      'Test 13.2: CommandHandler returns group-only notice for DM commands'
    );
  }

  // =========================================================================
  // TEST 14: Bot Administrator Status Does Not Substitute Caller Admin Status
  // =========================================================================
  console.log('\n--- TEST 14: Bot Admin Status vs. Caller Admin Status Independence ---');
  {
    // The bot is an administrator (botId = 999999 has status: administrator)
    // A regular member runs the command
    const ctx = makeContext(normalMemberId, '/mute', [String(admin1Id)]);
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    assert(
      auth.allowed === false,
      'Test 14: Regular user is rejected even though bot itself is full group administrator'
    );
  }

  // =========================================================================
  // TEST 15: Centralized Helper Consistency Across Diverse Admin Commands
  // =========================================================================
  console.log('\n--- TEST 15: Centralized Authorization Consistency Across Commands ---');
  {
    const sampleAdminCommands = ['/ban', '/unban', '/kick', '/mute', '/warn', '/promote', '/demote', '/permissions', '/status', '/locks', '/rules'];
    let allAuthorizedForAdmin = true;
    let allDeniedForMember = true;

    for (const cmd of sampleAdminCommands) {
      const adminCtx = makeContext(admin1Id, cmd);
      const memberCtx = makeContext(normalMemberId, cmd);

      const adminAuth = await TelegramMiddleware.requireAdmin(adminCtx, true);
      const memberAuth = await TelegramMiddleware.requireAdmin(memberCtx, true);

      if (!adminAuth.allowed) {
        allAuthorizedForAdmin = false;
        console.error(`Admin was falsely rejected for command ${cmd}`);
      }
      if (memberAuth.allowed) {
        allDeniedForMember = false;
        console.error(`Member was falsely allowed for command ${cmd}`);
      }
    }

    assert(
      allAuthorizedForAdmin && allDeniedForMember,
      'Test 15: Centralized requireAdmin consistently authorizes real admin and blocks normal member across all commands'
    );
  }

  // =========================================================================
  // TEST 16: Regression: getChatMember Failure/Timeout Falls Back to getChatAdministrators
  // =========================================================================
  console.log('\n--- TEST 16: Resilience When getChatMember Fails But getChatAdministrators Succeeds ---');
  {
    TelegramMiddleware.clearMemberCache();
    const oldGetChatMember = telegramApi.getChatMember;
    // Simulate getChatMember returning 400 user not found (common Telegram supergroup issue)
    telegramApi.getChatMember = async () => ({
      ok: false,
      error_code: 400,
      description: 'Bad Request: user not found'
    });

    try {
      const ctx = makeContext(admin2Id, '/status');
      const auth = await TelegramMiddleware.requireAdmin(ctx);
      assert(
        auth.allowed === true && auth.actor?.actorRole === 'ADMIN',
        'Test 16: Admin is successfully authorized via getChatAdministrators even when getChatMember fails/times out'
      );
    } finally {
      telegramApi.getChatMember = oldGetChatMember;
    }
  }

  // =========================================================================
  // TEST 17: Anonymous Admin Authorization In Matching Chat
  // =========================================================================
  console.log('\n--- TEST 17: Anonymous Admin Verification ---');
  {
    // Valid anonymous admin in current chat
    const anonCtxValid = makeContext(0, '/status', [], undefined, true, 'supergroup', chatId);
    const authValid = await TelegramMiddleware.requireAdmin(anonCtxValid);
    assert(authValid.allowed === true && authValid.actor?.isAnonymousAdmin === true, 'Test 17.1: Valid anonymous admin in current group is authorized');

    // Mismatched sender_chat from another chat -> Rejected
    const anonCtxInvalid = makeContext(0, '/status', [], undefined, true, 'supergroup', otherChatId);
    anonCtxInvalid.message.sender_chat = { id: otherChatId, type: 'supergroup', title: 'Other Group' };
    anonCtxInvalid.chatId = chatId;
    const authInvalid = await TelegramMiddleware.requireAdmin(anonCtxInvalid);
    assert(authInvalid.allowed === false, 'Test 17.2: Anonymous admin with mismatched sender_chat is rejected');
  }

  // =========================================================================
  // TEST 18: 30-Second Admin List Cache Verification
  // =========================================================================
  console.log('\n--- TEST 18: Admin Cache TTL & Efficiency ---');
  {
    let getChatAdminsCallCount = 0;
    const oldGetChatAdmins = telegramApi.getChatAdministrators;
    telegramApi.getChatAdministrators = async (cId: number | string) => {
      getChatAdminsCallCount++;
      return oldGetChatAdmins(cId);
    };

    try {
      TelegramMiddleware.clearMemberCache(chatId);
      getChatAdminsCallCount = 0;

      // First call -> hits API
      await TelegramMiddleware.getChatAdministrators(chatId);
      assert(getChatAdminsCallCount === 1, 'Test 18.1: First call queries getChatAdministrators API');

      // Second call immediately -> serves from 30s cache (no API call)
      await TelegramMiddleware.getChatAdministrators(chatId);
      assert(getChatAdminsCallCount === 1, 'Test 18.2: Second consecutive call uses 30s in-memory cache');

      // Force fresh -> hits API
      await TelegramMiddleware.getChatAdministrators(chatId, true);
      assert(getChatAdminsCallCount === 2, 'Test 18.3: forceFresh = true bypasses cache and hits API');
    } finally {
      telegramApi.getChatAdministrators = oldGetChatAdmins;
    }
  }

  // =========================================================================
  // TEST 19: Request-Scoped Context Authorization Reuse (0ms duplicate checks)
  // =========================================================================
  console.log('\n--- TEST 19: Request-Scoped Context Reuse ---');
  {
    let getChatAdminsCallCount = 0;
    let getChatMemberCallCount = 0;
    const oldGetChatAdmins = telegramApi.getChatAdministrators;
    const oldGetChatMember = telegramApi.getChatMember;
    telegramApi.getChatAdministrators = async (cId: number | string) => {
      getChatAdminsCallCount++;
      return oldGetChatAdmins(cId);
    };
    telegramApi.getChatMember = async (cId: number | string, uId: number) => {
      getChatMemberCallCount++;
      return oldGetChatMember(cId, uId);
    };

    try {
      TelegramMiddleware.clearMemberCache(chatId);
      getChatAdminsCallCount = 0;
      getChatMemberCallCount = 0;

      const singleCtx = makeContext(admin1Id, '/status');
      // 1st check (e.g. in handleCommand)
      const auth1 = await TelegramMiddleware.requireAdmin(singleCtx);
      assert(auth1.allowed === true, 'Test 19.1: First auth check succeeds');
      assert(getChatAdminsCallCount === 1, 'Test 19.2: First auth check called getChatAdministrators once');

      // 2nd check with same ctx (e.g. defense-in-depth inside handleStatus / resolveActor)
      const auth2 = await TelegramMiddleware.requireAdmin(singleCtx);
      const actor2 = await TelegramMiddleware.resolveActor(singleCtx);
      assert(auth2.allowed === true && actor2.actorRole === 'ADMIN', 'Test 19.3: Second check with same ctx matches');
      assert(getChatAdminsCallCount === 1, 'Test 19.4: Second check with same ctx reused ctx.auth without duplicate API call');
      assert(getChatMemberCallCount === 0, 'Test 19.5: Zero getChatMember calls made for admin in list');
    } finally {
      telegramApi.getChatAdministrators = oldGetChatAdmins;
      telegramApi.getChatMember = oldGetChatMember;
    }
  }

  // =========================================================================
  // TEST 20: Fast Non-Admin Resolution (Avoids fallback getChatMember timeout penalty)
  // =========================================================================
  console.log('\n--- TEST 20: Fast Non-Admin Resolution ---');
  {
    let getChatAdminsCallCount = 0;
    let getChatMemberCallCount = 0;
    const oldGetChatAdmins = telegramApi.getChatAdministrators;
    const oldGetChatMember = telegramApi.getChatMember;
    telegramApi.getChatAdministrators = async (cId: number | string) => {
      getChatAdminsCallCount++;
      return oldGetChatAdmins(cId);
    };
    telegramApi.getChatMember = async (cId: number | string, uId: number) => {
      getChatMemberCallCount++;
      return oldGetChatMember(cId, uId);
    };

    try {
      TelegramMiddleware.clearMemberCache(chatId);
      getChatAdminsCallCount = 0;
      getChatMemberCallCount = 0;

      const nonAdminCtx = makeContext(normalMemberId, '/status');
      const auth = await TelegramMiddleware.requireAdmin(nonAdminCtx, true);
      assert(auth.allowed === false, 'Test 20.1: Non-admin correctly rejected');
      assert(getChatAdminsCallCount === 1, 'Test 20.2: Exactly 1 getChatAdministrators call made');
      assert(getChatMemberCallCount === 0, 'Test 20.3: Zero fallback getChatMember calls made since admin list was definitive');
    } finally {
      telegramApi.getChatAdministrators = oldGetChatAdmins;
      telegramApi.getChatMember = oldGetChatMember;
    }
  }

  // =========================================================================
  // FINAL SCORECARD
  // =========================================================================
  console.log('\n====================================================');
  console.log(`🎉 ADMIN AUTHORIZATION TEST SUITE FINISHED`);
  console.log(`TOTAL PASSED: ${passedCount} / ${passedCount + failedCount}`);
  console.log(`TOTAL FAILED: ${failedCount}`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdminAuthorizationTestSuite().catch((err) => {
  console.error('Fatal Admin Authorization Test Suite Error:', err);
  process.exit(1);
});
