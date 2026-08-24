import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from '../server/telegram/middleware.js';
import { db } from '../server/db/storage.js';
import { mapTelegramError } from '../server/telegram/errorMapper.js';

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING MODERATION & /DEMOTE PERMISSION REGRESSION TESTS');
  console.log('====================================================\n');

  const chatId = -1001234567890;
  const ownerId = 1001;
  const adminWithPromoteId = 2001; // Admin with can_promote_members = true
  const adminWithoutPromoteId = 2002; // Admin with can_promote_members = false
  const adminTargetEditableId = 2003; // Target admin with can_be_edited = true
  const adminTargetUneditableId = 2004; // Target admin with can_be_edited = false
  const modId = 3001;
  const member1Id = 4001;
  const memberNoUsernameId = 4002;
  const leftUserId = 5001;
  const botId = 9999;
  const anonAdminProxyId = 1087968824;

  // Mock getMe
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
  });

  // Track promoteChatMember API invocations for verification
  let promoteCalls: Array<{ chatId: number; userId: number; permissions: any }> = [];
  telegramApi.promoteChatMember = async (cId: number, uId: number, perms: any) => {
    promoteCalls.push({ chatId: cId, userId: uId, permissions: perms });
    return { ok: true };
  };

  // Mock getChatMember
  const memberStatusMap: Record<number, any> = {
    [ownerId]: {
      status: 'creator',
      user: { id: ownerId, is_bot: false, first_name: 'OwnerUser', username: 'owner_user' }
    },
    [adminWithPromoteId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      can_be_edited: false,
      user: { id: adminWithPromoteId, is_bot: false, first_name: 'AdminWithPromote', username: 'admin_promote' }
    },
    [adminWithoutPromoteId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: false,
      can_delete_messages: true,
      can_be_edited: false,
      user: { id: adminWithoutPromoteId, is_bot: false, first_name: 'AdminNoPromote', username: 'admin_nopromote' }
    },
    [adminTargetEditableId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: false,
      can_delete_messages: true,
      can_be_edited: true, // Bot is allowed to edit this administrator
      user: { id: adminTargetEditableId, is_bot: false, first_name: 'TargetEditable', username: 'target_editable' }
    },
    [adminTargetUneditableId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: false,
      can_delete_messages: true,
      can_be_edited: false, // Promoted by owner/higher admin; Bot cannot edit
      user: { id: adminTargetUneditableId, is_bot: false, first_name: 'TargetUneditable', username: 'target_uneditable' }
    },
    [modId]: {
      status: 'member',
      user: { id: modId, is_bot: false, first_name: 'ModUser', username: 'mod_user' }
    },
    [member1Id]: {
      status: 'member',
      user: { id: member1Id, is_bot: false, first_name: 'Member1', username: 'member1_user' }
    },
    [memberNoUsernameId]: {
      status: 'member',
      user: { id: memberNoUsernameId, is_bot: false, first_name: 'NoUser' }
    },
    [leftUserId]: {
      status: 'left',
      user: { id: leftUserId, is_bot: false, first_name: 'LeftUser', username: 'left_user' }
    },
    [botId]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
    }
  };

  telegramApi.getChatMember = async (_cId: number, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: false, error_code: 400, description: 'USER_NOT_PARTICIPANT' };
  };

  // Set custom moderator role in DB
  db.setCustomRole(chatId, modId, 'MODERATOR');

  // Seed DB cache for usernames
  db.cacheUser({ id: ownerId, username: 'owner_user', first_name: 'OwnerUser' }, chatId);
  db.cacheUser({ id: adminWithPromoteId, username: 'admin_promote', first_name: 'AdminWithPromote' }, chatId);
  db.cacheUser({ id: adminWithoutPromoteId, username: 'admin_nopromote', first_name: 'AdminNoPromote' }, chatId);
  db.cacheUser({ id: adminTargetEditableId, username: 'target_editable', first_name: 'TargetEditable' }, chatId);
  db.cacheUser({ id: adminTargetUneditableId, username: 'target_uneditable', first_name: 'TargetUneditable' }, chatId);
  db.cacheUser({ id: modId, username: 'mod_user', first_name: 'ModUser' }, chatId);
  db.cacheUser({ id: member1Id, username: 'member1_user', first_name: 'Member1' }, chatId);
  db.cacheUser({ id: memberNoUsernameId, first_name: 'NoUser' }, chatId);
  db.cacheUser({ id: leftUserId, username: 'left_user', first_name: 'LeftUser' }, chatId);

  const makeCtx = (actorId: number, cmd: string, args: string[], replyToUser?: any, isAnon: boolean = false): CommandContext => ({
    message: {
      message_id: 100,
      date: Date.now(),
      chat: { id: chatId, type: 'supergroup', title: 'Test Group' },
      from: isAnon ? { id: anonAdminProxyId, is_bot: false, first_name: 'Group' } : memberStatusMap[actorId]?.user || { id: actorId, is_bot: false, first_name: 'Actor' },
      sender_chat: isAnon ? { id: chatId, type: 'supergroup', title: 'Test Group' } : undefined,
      reply_to_message: replyToUser ? {
        message_id: 99,
        date: Date.now() - 1000,
        chat: { id: chatId, type: 'supergroup' },
        from: replyToUser.from,
        sender_chat: replyToUser.sender_chat
      } : undefined,
      text: `${cmd} ${args.join(' ')}`
    },
    chatId,
    chatTitle: 'Test Group',
    sender: isAnon ? { id: anonAdminProxyId, is_bot: false, first_name: 'Group' } : memberStatusMap[actorId]?.user || { id: actorId, is_bot: false, first_name: 'Actor' },
    isAnonymousAdmin: isAnon,
    adminDisplayName: isAnon ? 'Anonymous Admin' : (memberStatusMap[actorId]?.user?.username || 'Actor'),
    args,
    command: cmd
  });

  // ==========================================
  // SECTION 1: SECTION 13 EXPLICIT TEST CASES
  // ==========================================
  console.log('--- Section 13: Core Actor vs Bot vs Target Matrix ---');

  // CASE 1: Admin (can_promote=true), Bot (can_promote=true), Target (can_be_edited=true) -> Allowed
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === true && res.target?.targetUserId === adminTargetEditableId, 'CASE 1: Admin with can_promote=true demotes editable admin when bot has can_promote=true -> Allowed');
  }

  // CASE 2: Admin (can_promote=true), Bot (can_promote=false), Target (can_be_edited=true) -> Bot permission error
  {
    const originalBot = memberStatusMap[botId];
    memberStatusMap[botId] = { ...originalBot, can_promote_members: false };

    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('The bot needs the "Add New Admins" administrator permission'), 'CASE 2: Bot lacks can_promote_members -> Clean bot permission error');

    memberStatusMap[botId] = originalBot;
  }

  // CASE 3: Admin (can_promote=false), Bot (can_promote=true), Target (can_be_edited=true) -> Actor permission error
  {
    const ctx = makeCtx(adminWithoutPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission'), 'CASE 3: Actor lacks can_promote_members -> Clean actor permission error (NOT bot error)');
  }

  // CASE 4: Admin (can_promote=true), Bot (can_promote=true), Target is Creator -> Owner protection
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[ownerId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('The group owner cannot be demoted'), 'CASE 4: Demote target is Creator -> Owner protection error');
  }

  // CASE 5: Admin (can_promote=true), Bot (can_promote=true), Target (can_be_edited=false) -> Target editability error
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminTargetUneditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('don\'t have permission to modify this administrator'), 'CASE 5: Target can_be_edited=false -> Clean target editability/hierarchy error');
  }

  // CASE 6: Anonymous Admin -> /kick normal member
  {
    const ctx = makeCtx(0, '/kick', [], { from: memberStatusMap[member1Id].user }, true);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'kick');
    assert(res.allowed === true && res.target?.targetUserId === member1Id, 'CASE 6: Anonymous admin resolves cleanly and target resolves independently');
  }

  // CASE 7: Actor targets bot
  {
    const ctx = makeCtx(ownerId, '/demote', [], { from: memberStatusMap[botId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('Cannot demote the bot itself'), 'CASE 7: Actor targets bot -> Bot protection');
  }

  // CASE 8: Actor targets self
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminWithPromoteId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('You cannot demote yourself'), 'CASE 8: Actor targets self -> Self-target protection');
  }

  // ==========================================
  // SECTION 2: SECTION 17 MANUAL TEST MATRIX
  // ==========================================
  console.log('\n--- Section 17: Full Moderation Test Matrix ---');

  // A. Owner -> demote admin
  {
    const ctx = makeCtx(ownerId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === true, 'Matrix A: Owner demotes admin with can_be_edited=true -> Allowed');
  }

  // B. Admin with Add New Admins -> demote another admin
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === true, 'Matrix B: Admin with Add New Admins demotes another admin -> Allowed');
  }

  // C. Admin without Add New Admins -> demote admin
  {
    const ctx = makeCtx(adminWithoutPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission'), 'Matrix C: Admin without Add New Admins demotes admin -> Blocked');
  }

  // D. Anonymous admin -> demote admin
  {
    const ctx = makeCtx(0, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user }, true);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === true, 'Matrix D: Anonymous admin demotes admin -> Allowed');
  }

  // E. Owner -> demote owner
  {
    const ctx = makeCtx(ownerId, '/demote', [], { from: memberStatusMap[ownerId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && (res.reason?.includes('The group owner cannot be demoted') || res.reason?.includes('You cannot demote yourself')), 'Matrix E: Owner demotes owner -> Blocked');
  }

  // F. Owner -> demote bot
  {
    const ctx = makeCtx(ownerId, '/demote', [], { from: memberStatusMap[botId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('Cannot demote the bot itself'), 'Matrix F: Owner demotes bot -> Blocked');
  }

  // G. Owner -> demote normal member
  {
    const ctx = makeCtx(ownerId, '/demote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('That user is not currently an administrator'), 'Matrix G: Owner demotes normal member -> Target not admin');
  }

  // H. Admin -> demote normal member
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('That user is not currently an administrator'), 'Matrix H: Admin demotes normal member -> Target not admin');
  }

  // I. Reply-based /demote
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === adminTargetEditableId && resolved.source === 'reply', 'Matrix I: Reply-based /demote resolves target via reply');
  }

  // J. Username-based /demote
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', ['@target_editable']);
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === adminTargetEditableId && resolved.source === 'username', 'Matrix J: Username-based /demote resolves target via cached username');
  }

  // K. Numeric-ID /demote
  {
    const ctx = makeCtx(adminWithPromoteId, '/demote', [String(adminTargetEditableId)]);
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === adminTargetEditableId && resolved.source === 'numeric_id', 'Matrix K: Numeric-ID /demote resolves target via numeric ID');
  }

  // L. Custom Role MODERATOR cannot bypass Telegram and cannot demote
  {
    const ctx = makeCtx(modId, '/demote', [], { from: memberStatusMap[adminTargetEditableId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'demote');
    assert(res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission'), 'Matrix L: Custom Role MODERATOR cannot execute /demote');
  }

  // ==========================================
  // SECTION 3: /PROMOTE DEDICATED TEST MATRIX (PROMOTE-01 to PROMOTE-18)
  // ==========================================
  console.log('\n--- Section 3: /promote Dedicated Test Matrix ---');

  // PROMOTE-01: Owner -> promote normal member -> success
  {
    const ctx = makeCtx(ownerId, '/promote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === true && res.target?.targetUserId === member1Id, 'PROMOTE-01: Owner promotes normal member -> Success');
  }

  // PROMOTE-02: Admin with can_promote_members -> promote normal member -> success
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === true && res.target?.targetUserId === member1Id, 'PROMOTE-02: Admin with can_promote_members promotes normal member -> Success');
  }

  // PROMOTE-03: Admin without can_promote_members -> blocked
  {
    const ctx = makeCtx(adminWithoutPromoteId, '/promote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission to promote members'), 'PROMOTE-03: Admin without can_promote_members -> Blocked');
  }

  // PROMOTE-04: Custom MODERATOR -> blocked
  {
    const ctx = makeCtx(modId, '/promote', [], { from: memberStatusMap[member1Id].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission to promote members'), 'PROMOTE-04: Custom MODERATOR -> Blocked');
  }

  // PROMOTE-05: Anonymous admin -> correct actor handling
  {
    const ctx = makeCtx(anonAdminProxyId, '/promote', ['@member1_user'], undefined, true);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === true && res.actor?.isAnonymousAdmin === true, 'PROMOTE-05: Anonymous admin -> Correct actor handling and allowed');
  }

  // PROMOTE-06: Reply target -> correct user promoted
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', [], { from: memberStatusMap[member1Id].user });
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === member1Id && resolved.source === 'reply', 'PROMOTE-06: Reply target -> Correct user resolved');
  }

  // PROMOTE-07: Username target -> correct user promoted
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', ['@member1_user']);
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === member1Id && resolved.source === 'username', 'PROMOTE-07: Username target -> Correct user resolved');
  }

  // PROMOTE-08: Numeric ID target -> correct user promoted
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', [String(member1Id)]);
    const resolved = await TelegramMiddleware.resolveTargetUser(ctx);
    assert(resolved.type === 'user' && resolved.userId === member1Id && resolved.source === 'numeric_id', 'PROMOTE-08: Numeric ID target -> Correct user resolved');
  }

  // PROMOTE-09: No target -> friendly error
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', []);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && (res.reason?.includes('identify that user') || res.reason?.includes('reply to the target')), 'PROMOTE-09: No target -> Friendly error');
  }

  // PROMOTE-10: Target already administrator -> blocked
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', ['@admin_nopromote']);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('That user is already an administrator'), 'PROMOTE-10: Target already administrator -> Blocked');
  }

  // PROMOTE-11: Target is group owner -> blocked
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', ['@owner_user']);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('That user is already the group owner'), 'PROMOTE-11: Target is group owner -> Blocked');
  }

  // PROMOTE-12: Target is bot -> blocked
  {
    const ctx = makeCtx(ownerId, '/promote', [], { from: memberStatusMap[botId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('Cannot promote the bot itself'), 'PROMOTE-12: Target is bot -> Blocked');
  }

  // PROMOTE-13: Actor promotes themselves -> blocked
  {
    const ctx = makeCtx(adminWithPromoteId, '/promote', [String(adminWithPromoteId)]);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('You cannot promote yourself'), 'PROMOTE-13: Actor promotes themselves -> Blocked');
  }

  // PROMOTE-14: Target left group -> blocked
  {
    const ctx = makeCtx(ownerId, '/promote', ['@left_user']);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('not currently a member of this group'), 'PROMOTE-14: Target left group -> Blocked');
  }

  // PROMOTE-15: Bot lacks can_promote_members -> blocked
  {
    // Temporarily remove bot's can_promote_members permission
    const origBotPerm = memberStatusMap[botId].can_promote_members;
    memberStatusMap[botId].can_promote_members = false;

    const ctx = makeCtx(ownerId, '/promote', ['@member1_user']);
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'promote');
    assert(res.allowed === false && res.reason?.includes('needs the "Add New Admins" administrator permission to promote members'), 'PROMOTE-15: Bot lacking can_promote_members -> Blocked');

    // Restore bot permission
    memberStatusMap[botId].can_promote_members = origBotPerm;
  }

  // PROMOTE-16: Telegram rejects promotion -> friendly mapped error
  {
    const err1 = mapTelegramError('promote', 'Bad Request: CANNOT_PROMOTE_USER', 400);
    const err2 = mapTelegramError('promote', 'Bad Request: RIGHT_FORBIDDEN', 400);
    const err3 = mapTelegramError('promote', 'Bad Request: CHAT_ADMIN_REQUIRED', 400);
    assert(
      err1.includes('Telegram rejected the promotion') &&
      err2.includes('Telegram rejected the promotion') &&
      err3.includes('requires the "Add New Admins" administrator permission'),
      'PROMOTE-16: Telegram rejects promotion -> Friendly mapped errors'
    );
  }

  // PROMOTE-17 & PROMOTE-18: promoteChatMember API call & permissions profile verification
  {
    promoteCalls = [];
    const targetUserId = member1Id;
    const permissions = {
      is_anonymous: false,
      can_manage_chat: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_delete_messages: true,
      can_manage_video_chats: true,
      can_restrict_members: true,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: true,
      can_pin_messages: true,
      can_manage_topics: true,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false
    };

    const res = await telegramApi.promoteChatMember(chatId, targetUserId, permissions);
    assert(res.ok === true && promoteCalls.length === 1, 'PROMOTE-17: Promotion API execution succeeds');

    const call = promoteCalls[0];
    assert(
      call.userId === targetUserId &&
      call.permissions.can_promote_members === false &&
      call.permissions.can_delete_messages === true &&
      call.permissions.can_restrict_members === true &&
      call.permissions.can_invite_users === true &&
      call.permissions.can_pin_messages === true &&
      call.permissions.can_manage_topics === true,
      'PROMOTE-18: Promoted administrator has can_promote_members === false and standard admin permissions'
    );
  }

  // ==========================================
  // SECTION 4: OTHER MODERATION COMMANDS AUDIT
  // ==========================================
  console.log('\n--- Section 4: Kick, Ban, Warn Verifications ---');

  // Kicking/Banning/Warning by Admin with can_restrict_members
  {
    const ctxKick = makeCtx(adminWithPromoteId, '/kick', [], { from: memberStatusMap[member1Id].user });
    const resKick = await TelegramMiddleware.validateModerationAction(ctxKick, 'kick');
    assert(resKick.allowed === true, 'Case: Admin kicks normal member -> Allowed');

    const ctxBan = makeCtx(adminWithPromoteId, '/ban', ['Spam'], { from: memberStatusMap[member1Id].user });
    const resBan = await TelegramMiddleware.validateModerationAction(ctxBan, 'ban');
    assert(resBan.allowed === true, 'Case: Admin bans normal member -> Allowed');

    const ctxWarn = makeCtx(adminWithPromoteId, '/warn', ['Warn'], { from: memberStatusMap[member1Id].user });
    const resWarn = await TelegramMiddleware.validateModerationAction(ctxWarn, 'warn');
    assert(resWarn.allowed === true, 'Case: Admin warns normal member -> Allowed');
  }

  // Admin kicking peer admin (Blocked by hierarchy)
  {
    const ctx = makeCtx(adminWithPromoteId, '/kick', [], { from: memberStatusMap[adminWithoutPromoteId].user });
    const res = await TelegramMiddleware.validateModerationAction(ctx, 'kick');
    assert(res.allowed === false && res.reason?.includes('another administrator'), 'Case: Admin cannot kick peer admin');
  }

  // Error Mapper
  {
    const err = mapTelegramError('demote', 'Bad Request: NOT_ENOUGH_RIGHTS_TO_DEMOTE', 400);
    assert(err.includes('appointed by the group owner'), 'Case: Error mapper for demote rights translates correctly');
  }

  console.log('\n====================================================');
  console.log(`AUDIT COMPLETE: ${passedCount} PASSED / ${failedCount} FAILED`);
  console.log('====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite();
