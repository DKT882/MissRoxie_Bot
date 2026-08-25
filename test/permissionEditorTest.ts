import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from '../server/telegram/middleware.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember, TelegramCallbackQuery, AdminPermissions } from '../server/telegram/types.js';

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

async function runPermissionEditorTests() {
  console.log('====================================================');
  console.log('STARTING ADMIN PERMISSION EDITOR TEST MATRIX (PERM-01 to PERM-27)');
  console.log('====================================================\n');

  const chatId = -1001234567890;
  const ownerId = 1001;
  const adminWithPromoteId = 2001;
  const adminWithoutPromoteId = 2002;
  const adminTargetEditableId = 2003;
  const adminTargetUneditableId = 2004;
  const modId = 3001;
  const member1Id = 4001;
  const botId = 9999;
  const anonAdminProxyId = 1087968824;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;
  let lastEditedMessage: { chatId: number; messageId: number; text: string; options?: any } | null = null;
  let lastCallbackAnswer: { queryId: string; options?: any } | null = null;
  let lastPromoteCall: { chatId: number; userId: number; perms: AdminPermissions } | null = null;

  // Mock Telegram API
  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
  });

  telegramApi.sendMessage = async (cId: number, text: string, opts?: any) => {
    lastSentMessage = { chatId: cId, text, options: opts };
    return { ok: true, result: { message_id: 8888, chat: { id: cId, type: 'supergroup' }, text, date: Date.now() } as any };
  };

  telegramApi.editMessageText = async (cId: number, msgId: number, text: string, opts?: any) => {
    lastEditedMessage = { chatId: cId, messageId: msgId, text, options: opts };
    return { ok: true, result: { message_id: msgId, chat: { id: cId, type: 'supergroup' }, text, date: Date.now() } as any };
  };

  telegramApi.answerCallbackQuery = async (qId: string, opts?: any) => {
    lastCallbackAnswer = { queryId: qId, options: opts };
    return { ok: true, result: true };
  };

  telegramApi.deleteMessage = async (cId: number, msgId: number) => {
    return { ok: true, result: true };
  };

  let mockPromoteResult: { ok: boolean; description?: string; error_code?: number } = { ok: true };
  telegramApi.promoteChatMember = async (cId: number, uId: number, perms: AdminPermissions) => {
    lastPromoteCall = { chatId: cId, userId: uId, perms };
    return mockPromoteResult;
  };

  const memberStatusMap: Record<number, TelegramChatMember> = {
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
      can_delete_messages: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_change_info: false,
      can_manage_video_chats: false,
      can_promote_members: false,
      can_invite_users: true,
      can_manage_topics: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_be_edited: true,
      user: { id: adminTargetEditableId, is_bot: false, first_name: 'TargetEditable', username: 'target_editable' }
    },
    [adminTargetUneditableId]: {
      status: 'administrator',
      can_delete_messages: true,
      can_restrict_members: true,
      can_pin_messages: true,
      can_be_edited: false,
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
    [botId]: {
      status: 'administrator',
      can_promote_members: true,
      can_restrict_members: true,
      can_delete_messages: true,
      user: { id: botId, is_bot: true, first_name: 'TestBot', username: 'TestBot' }
    }
  };

  telegramApi.getChatMember = async (cId: number, uId: number) => {
    const member = memberStatusMap[uId];
    if (member) return { ok: true, result: JSON.parse(JSON.stringify(member)) };
    return { ok: false, description: 'PARTICIPANT_ID_INVALID', error_code: 400 };
  };

  db.cacheUser({ id: adminTargetEditableId, username: 'target_editable', first_name: 'TargetEditable' }, chatId);
  db.setCustomRole(chatId, modId, 'MODERATOR');

  const makeCtx = (
    senderId: number,
    cmd: string,
    args: string[] = [],
    replyTo?: Partial<TelegramMessage>,
    isAnon = false
  ): CommandContext => {
    const sender = isAnon
      ? { id: anonAdminProxyId, is_bot: false, first_name: 'Group' }
      : (memberStatusMap[senderId]?.user || { id: senderId, is_bot: false, first_name: 'User' });

    const message: TelegramMessage = {
      message_id: 100,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup', title: 'Test Supergroup' },
      from: sender,
      text: `${cmd} ${args.join(' ')}`.trim(),
      reply_to_message: replyTo as TelegramMessage
    };

    return {
      message,
      chatId,
      chatTitle: 'Test Supergroup',
      sender,
      isAnonymousAdmin: isAnon,
      adminDisplayName: isAnon ? 'Anonymous Admin' : sender.first_name,
      args,
      command: cmd
    };
  };

  // PERM-01: Command invocation via reply to admin
  {
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('ADMIN PERMISSIONS') &&
      lastSentMessage.text.includes('target_editable') &&
      lastSentMessage.options?.reply_markup !== undefined,
      'PERM-01: Command invocation via reply to admin opens editor UI'
    );
  }

  // PERM-02: Command invocation via @username
  {
    const ctx = makeCtx(ownerId, '/permissions', ['@target_editable']);
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('ADMIN PERMISSIONS') &&
      lastSentMessage.text.includes('target_editable'),
      'PERM-02: Command invocation via @username opens editor UI'
    );
  }

  // PERM-03: Command invocation via numeric Telegram ID
  {
    const ctx = makeCtx(ownerId, '/permissions', [String(adminTargetEditableId)]);
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('ADMIN PERMISSIONS') &&
      lastSentMessage.text.includes(String(adminTargetEditableId)),
      'PERM-03: Command invocation via numeric Telegram ID opens editor UI'
    );
  }

  // PERM-04: Missing target
  {
    const ctx = makeCtx(ownerId, '/permissions', []);
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes("couldn't identify that user"),
      'PERM-04: Missing target gives friendly resolution error'
    );
  }

  // PERM-05: Target is regular member (not admin)
  {
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[member1Id].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('That user is not currently an administrator'),
      'PERM-05: Target is regular member -> rejected'
    );
  }

  // PERM-06: Target is group owner
  {
    const ctx = makeCtx(adminWithPromoteId, '/permissions', [], { from: memberStatusMap[ownerId].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('The group owner cannot have their permissions edited'),
      'PERM-06: Target is group owner -> rejected'
    );
  }

  // PERM-07: Target is bot itself
  {
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[botId].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes("Roxie's permissions cannot be edited"),
      'PERM-07: Target is bot itself -> rejected'
    );
  }

  // PERM-08: Target is actor themselves
  {
    const ctx = makeCtx(adminWithPromoteId, '/permissions', [], { from: memberStatusMap[adminWithPromoteId].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('You cannot edit your own permissions'),
      'PERM-08: Target is actor themselves -> rejected'
    );
  }

  // PERM-09: Target is anonymous admin proxy / sender_chat
  {
    const ctx = makeCtx(ownerId, '/permissions', [String(anonAdminProxyId)]);
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('Anonymous administrators and channels cannot have their permissions edited'),
      'PERM-09: Target is anonymous admin proxy -> rejected'
    );
  }

  // PERM-10: Target has can_be_edited = false
  {
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetUneditableId].user });
    await CommandHandler.handleCommand(ctx);
    assert(
      lastSentMessage !== null &&
      lastSentMessage.text.includes('Telegram does not allow Roxie to modify this administrator'),
      'PERM-10: Target has can_be_edited = false -> rejected'
    );
  }

  // PERM-11: Actor is group owner -> allowed
  {
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user }),
      'permissions'
    );
    assert(res.allowed === true, 'PERM-11: Actor is group owner -> allowed');
  }

  // PERM-12: Actor is admin with can_promote_members = true -> allowed
  {
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(adminWithPromoteId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user }),
      'permissions'
    );
    assert(res.allowed === true, 'PERM-12: Actor is admin with can_promote_members = true -> allowed');
  }

  // PERM-13: Actor is admin without can_promote_members -> blocked
  {
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(adminWithoutPromoteId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user }),
      'permissions'
    );
    assert(
      res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission'),
      'PERM-13: Actor is admin without can_promote_members -> blocked'
    );
  }

  // PERM-14: Actor is custom MODERATOR -> blocked
  {
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(modId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user }),
      'permissions'
    );
    assert(
      res.allowed === false && res.reason?.includes('You need the "Add New Admins" administrator permission'),
      'PERM-14: Actor is custom MODERATOR -> blocked'
    );
  }

  // PERM-15: Actor is anonymous admin -> allowed
  {
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(anonAdminProxyId, '/permissions', ['@target_editable'], undefined, true),
      'permissions'
    );
    assert(res.allowed === true, 'PERM-15: Actor is anonymous admin -> allowed');
  }

  // PERM-16: Bot lacks can_promote_members -> blocked
  {
    const origBot = memberStatusMap[botId].can_promote_members;
    memberStatusMap[botId].can_promote_members = false;
    const res = await TelegramMiddleware.validateModerationAction(
      makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user }),
      'permissions'
    );
    assert(
      res.allowed === false && res.reason?.includes('The bot needs the "Add New Admins" administrator permission'),
      'PERM-16: Bot lacks can_promote_members -> blocked'
    );
    memberStatusMap[botId].can_promote_members = origBot;
  }

  // PERM-17: UI rendering displays all permissions with toggles and SAVE button
  {
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user });
    await CommandHandler.handleCommand(ctx);
    const markup = lastSentMessage?.options?.reply_markup;
    const flatButtons = markup?.inline_keyboard.flat() || [];
    const hasSave = flatButtons.some((b: any) => b.text.includes('SAVE PERMISSIONS'));
    const hasDelete = flatButtons.some((b: any) => b.text.includes('Delete'));
    const hasRestrict = flatButtons.some((b: any) => b.text.includes('Restrict'));
    assert(hasSave && hasDelete && hasRestrict, 'PERM-17: UI rendering displays all permissions with toggles and SAVE button');
  }

  // PERM-18: Callback query with invalid / cross-chat ID -> rejected
  {
    const badQuery: TelegramCallbackQuery = {
      id: 'cb_18',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: -999999, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:del`
    };
    await CommandHandler.handleCallbackQuery(badQuery);
    assert(
      lastCallbackAnswer?.options?.text?.includes('invalid for this chat'),
      'PERM-18: Callback query with cross-chat ID is rejected'
    );
  }

  // PERM-19: Unauthorized user clicks callback toggle -> rejected
  {
    const unauthQuery: TelegramCallbackQuery = {
      id: 'cb_19',
      from: memberStatusMap[adminWithoutPromoteId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:del`
    };
    await CommandHandler.handleCallbackQuery(unauthQuery);
    assert(
      lastCallbackAnswer?.options?.text?.includes('You need the "Add New Admins" administrator permission'),
      'PERM-19: Unauthorized user clicking callback toggle is rejected'
    );
  }

  // PERM-20: Toggle permission in session updates UI state without calling API yet
  {
    lastPromoteCall = null;
    const toggleQuery: TelegramCallbackQuery = {
      id: 'cb_20',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:del`
    };
    await CommandHandler.handleCallbackQuery(toggleQuery);
    const session = CommandHandler.permissionSessions.get(`${chatId}:${adminTargetEditableId}`);
    assert(
      session !== undefined &&
      session.currentPermissions.can_delete_messages === false &&
      lastPromoteCall === null &&
      lastEditedMessage !== null,
      'PERM-20: Toggle permission in session updates UI state without calling promote API'
    );
  }

  // PERM-21: Toggling can_promote_members from false to true triggers confirmation dialog
  {
    const promoteToggleQuery: TelegramCallbackQuery = {
      id: 'cb_21',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:prom`
    };
    await CommandHandler.handleCallbackQuery(promoteToggleQuery);
    const session = CommandHandler.permissionSessions.get(`${chatId}:${adminTargetEditableId}`);
    assert(
      session?.confirmingPromote === true &&
      lastEditedMessage?.text.includes('Add New Admins') &&
      lastEditedMessage?.text.includes('Are you sure you want to enable this permission?'),
      'PERM-21: Toggling can_promote_members triggers confirmation dialog'
    );
  }

  // PERM-22: Confirming can_promote_members updates state to true
  {
    const confirmPromoteQuery: TelegramCallbackQuery = {
      id: 'cb_22',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:conf_prom`
    };
    await CommandHandler.handleCallbackQuery(confirmPromoteQuery);
    const session = CommandHandler.permissionSessions.get(`${chatId}:${adminTargetEditableId}`);
    assert(
      session?.currentPermissions.can_promote_members === true &&
      session?.confirmingPromote === false,
      'PERM-22: Confirming can_promote_members updates state to true'
    );
  }

  // PERM-23: Cancelling can_promote_members confirmation keeps state false
  {
    // First toggle it back to false
    const session = CommandHandler.permissionSessions.get(`${chatId}:${adminTargetEditableId}`)!;
    session.currentPermissions.can_promote_members = false;
    session.confirmingPromote = true;

    const cancelPromoteQuery: TelegramCallbackQuery = {
      id: 'cb_23',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:canc_prom`
    };
    await CommandHandler.handleCallbackQuery(cancelPromoteQuery);
    assert(
      session.currentPermissions.can_promote_members === false &&
      !session.confirmingPromote,
      'PERM-23: Cancelling can_promote_members confirmation keeps state false'
    );
  }

  // PERM-24: Save execution calls promoteChatMember() with new permissions and verifies with getChatMember()
  {
    lastPromoteCall = null;
    const session = CommandHandler.permissionSessions.get(`${chatId}:${adminTargetEditableId}`)!;
    session.currentPermissions.can_delete_messages = false; // changed from true to false
    session.currentPermissions.can_pin_messages = true;

    const saveQuery: TelegramCallbackQuery = {
      id: 'cb_24',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:save`
    };
    await CommandHandler.handleCallbackQuery(saveQuery);
    assert(
      lastPromoteCall !== null &&
      lastPromoteCall.userId === adminTargetEditableId &&
      lastPromoteCall.perms.can_delete_messages === false &&
      lastEditedMessage?.text.includes('Administrator permissions updated for @target_editable'),
      'PERM-24: Save execution calls promoteChatMember() and updates UI on success'
    );
  }

  // PERM-25: Stale state protection: target permissions changed on Telegram while editing
  {
    // Reopen editor
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user });
    await CommandHandler.handleCommand(ctx);

    // Simulate external change in Telegram state
    memberStatusMap[adminTargetEditableId].can_pin_messages = false;

    const staleSaveQuery: TelegramCallbackQuery = {
      id: 'cb_25',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:save`
    };
    await CommandHandler.handleCallbackQuery(staleSaveQuery);
    assert(
      lastEditedMessage?.text.includes('Administrator permissions changed while you were editing'),
      'PERM-25: Stale state protection detects external Telegram change and aborts'
    );

    // Restore mock
    memberStatusMap[adminTargetEditableId].can_pin_messages = true;
  }

  // PERM-26: Telegram API error on save -> maps error cleanly and refreshes editor
  {
    // Reopen editor
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user });
    await CommandHandler.handleCommand(ctx);

    // Mock API failure
    mockPromoteResult = { ok: false, description: 'CANNOT_EDIT_THIS_USER', error_code: 400 };

    const errorSaveQuery: TelegramCallbackQuery = {
      id: 'cb_26',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:save`
    };
    await CommandHandler.handleCallbackQuery(errorSaveQuery);
    assert(
      lastCallbackAnswer?.options?.text?.includes('Telegram does not allow Roxie to modify this administrator'),
      'PERM-26: Telegram API error on save maps cleanly and alerts user'
    );

    mockPromoteResult = { ok: true };
  }

  // PERM-27: Close button closes session and deletes/cleans up editor message
  {
    // Reopen editor
    const ctx = makeCtx(ownerId, '/permissions', [], { from: memberStatusMap[adminTargetEditableId].user });
    await CommandHandler.handleCommand(ctx);
    assert(CommandHandler.permissionSessions.has(`${chatId}:${adminTargetEditableId}`), 'Session created before close');

    const closeQuery: TelegramCallbackQuery = {
      id: 'cb_27',
      from: memberStatusMap[ownerId].user,
      message: { message_id: 8888, date: Date.now(), chat: { id: chatId, type: 'supergroup' } },
      data: `p:${chatId}:${adminTargetEditableId}:close`
    };
    await CommandHandler.handleCallbackQuery(closeQuery);
    assert(
      !CommandHandler.permissionSessions.has(`${chatId}:${adminTargetEditableId}`),
      'PERM-27: Close button cleans up session'
    );
  }

  console.log('\n====================================================');
  console.log(`PERMISSION EDITOR AUDIT COMPLETE: ${passedCount} PASSED / ${failedCount} FAILED`);
  console.log('====================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runPermissionEditorTests().catch(err => {
  console.error('Fatal error running permission editor test suite:', err);
  process.exit(1);
});
