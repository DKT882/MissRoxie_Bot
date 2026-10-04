process.env.NODE_ENV = 'test';

import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { SmartProtectionService } from '../server/telegram/smartProtection.js';
import { mtprotoParticipantService } from '../server/telegram/mtprotoParticipantService.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';
import { CommandContext, TelegramMiddleware } from '../server/telegram/middleware.js';

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING /ALL ISOLATION & MODERATION POLICY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // Setup mock environments and IDs
  const chatA = -100999111001;
  const chatB = -100999111002;
  const adminUser: TelegramUser = { id: 1001, first_name: 'AdminUser', username: 'admin_user', is_bot: false };
  const targetUser1: TelegramUser = { id: 2001, first_name: 'Violator1', username: 'violator_1', is_bot: false };
  const targetUser2: TelegramUser = { id: 2002, first_name: 'Violator2', username: 'violator_2', is_bot: false };
  const botId = 99999;

  db.setBotIdentity({ id: botId, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' });
  db.cacheUser(adminUser, chatA);
  db.cacheUser(targetUser1, chatA);
  db.cacheUser(targetUser2, chatA);
  db.cacheUser(adminUser, chatB);

  // Set admin status in storage
  db.updateGroupSettings(chatA, { warnLimit: 3, warnAction: 'mute' });
  db.updateGroupSettings(chatB, { warnLimit: 3, warnAction: 'mute' });

  // Store sent API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let restrictCalls: Array<{ chatId: number; userId: number; permissions: any; options?: any }> = [];
  let banCalls: Array<{ chatId: number; userId: number; options?: any }> = [];

  // Mock API methods
  telegramApi.sendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } } } as any;
  };

  telegramApi.sendPhoto = async (chatId: number, photo: string, options?: any) => {
    sentMessages.push({ chatId, text: options?.caption || photo, options });
    return { ok: true, result: { message_id: 2000 + sentMessages.length, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } } } as any;
  };

  telegramApi.restrictChatMember = async (chatId: number, userId: number, permissions: any, options?: any) => {
    restrictCalls.push({ chatId, userId, permissions, options });
    return { ok: true, result: true } as any;
  };

  telegramApi.banChatMember = async (chatId: number, userId: number, options?: any) => {
    banCalls.push({ chatId, userId, options });
    return { ok: true, result: true } as any;
  };

  telegramApi.getChatMember = async (chatId: number, userId: number) => {
    if (userId === adminUser.id) {
      return { ok: true, result: { status: 'administrator', user: adminUser, can_restrict_members: true, can_delete_messages: true } } as any;
    }
    return { ok: true, result: { status: 'member', user: userId === targetUser1.id ? targetUser1 : targetUser2 } } as any;
  };

  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }
  } as any);

  telegramApi.getChatAdministrators = async (_chatId: number) => ({
    ok: true,
    result: [{ status: 'administrator', user: adminUser, can_restrict_members: true }]
  } as any);

  // ----------------------------------------------------
  // SECTION 1: /all ISOLATION & CONCURRENCY
  // ----------------------------------------------------
  console.log('--- SECTION 1: /all ISOLATION & CONCURRENCY ---');

  // Test 1.1: acquireChatLock & releaseChatLock lifecycle
  mtprotoParticipantService.releaseChatLock(chatA);
  const lock1 = mtprotoParticipantService.acquireChatLock(chatA);
  assert(lock1 === true, 'Test 1.1: Successfully acquired chat lock for Chat A');

  const lock2 = mtprotoParticipantService.acquireChatLock(chatA);
  assert(lock2 === false, 'Test 1.2: Second acquireChatLock for Chat A is blocked while lock is held');

  const lockChatB = mtprotoParticipantService.acquireChatLock(chatB);
  assert(lockChatB === true, 'Test 1.3: Chat B lock can be acquired independently of Chat A');
  mtprotoParticipantService.releaseChatLock(chatB);
  mtprotoParticipantService.releaseChatLock(chatA);

  // Test 1.4: /all execution with mock members in fresh Chat A
  const uniqueChatA = -100999555111;
  db.updateGroupSettings(uniqueChatA, { warnLimit: 3, warnAction: 'mute' });
  const membersList = Array.from({ length: 25 }, (_, i) => ({
    id: 3000 + i,
    firstName: `Member${i}`,
    username: `mem_${i}`
  }));

  for (const m of membersList) {
    db.cacheUser({ id: m.id, first_name: m.firstName, username: m.username, is_bot: false }, uniqueChatA);
  }

  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 5; // Fast for test execution

  const allCmdCtx: CommandContext = {
    command: '/all',
    chatId: uniqueChatA,
    chatTitle: 'Test Group A',
    sender: adminUser,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    message: {
      message_id: 501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: uniqueChatA, type: 'supergroup', title: 'Test Group A' },
      from: adminUser,
      text: '/all Team Meeting Announcement'
    },
    args: ['Team', 'Meeting', 'Announcement']
  };

  await CommandHandler.handleCommand(allCmdCtx);

  assert(sentMessages.length === 3, `Test 1.4: 25 members produced exactly 3 mention messages (got ${sentMessages.length})`);
  assert(sentMessages.every(m => m.text.includes('Team Meeting Announcement')), 'Test 1.5: All /all batches include custom announcement text');
  assert(!mtprotoParticipantService.isChatLocked(uniqueChatA), 'Test 1.6: Chat A lock released cleanly after worker completion');

  // Test 1.7: 429 Retry handling with retry_after
  let attemptCount = 0;
  const origSendMessage = telegramApi.sendMessage;
  telegramApi.sendMessage = async (chatId: number, text: string, options?: any) => {
    attemptCount++;
    if (attemptCount === 1) {
      return { ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 0.01 } } as any;
    }
    return origSendMessage(chatId, text, options);
  };

  sentMessages = [];
  await CommandHandler.handleCommand(allCmdCtx);
  assert(attemptCount >= 4, `Test 1.7: Handled 429 retry_after and completed all batches (attempts: ${attemptCount})`);
  telegramApi.sendMessage = origSendMessage;

  // ----------------------------------------------------
  // SECTION 2: MODERATION ESCALATION POLICY (3 WARNINGS = 1 HOUR MUTE)
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: MODERATION ESCALATION POLICY (3 WARNINGS = 1 HOUR MUTE) ---');

  // Reset counters
  db.resetUserWarnings(chatA, targetUser1.id);
  restrictCalls = [];
  banCalls = [];
  sentMessages = [];

  const warnCmdCtx: CommandContext = {
    command: '/warn',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminUser,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    message: {
      message_id: 601,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
      from: adminUser,
      text: `/warn ${targetUser1.id} Inappropriate behavior`
    },
    args: [`${targetUser1.id}`, 'Inappropriate', 'behavior']
  };

  // Warning 1
  await CommandHandler.handleCommand(warnCmdCtx);
  let user1Warns = db.getUserWarnings(chatA, targetUser1.id);
  assert(user1Warns.length === 1, `Test 2.1: Warning 1 recorded in DB (length=${user1Warns.length})`);
  assert(restrictCalls.length === 0, 'Test 2.2: Warning 1 does NOT mute user (restrictChatMember calls = 0)');
  assert(banCalls.length === 0, 'Test 2.3: Warning 1 does NOT ban user (banChatMember calls = 0)');

  // Warning 2
  await CommandHandler.handleCommand(warnCmdCtx);
  user1Warns = db.getUserWarnings(chatA, targetUser1.id);
  assert(user1Warns.length === 2, `Test 2.4: Warning 2 recorded in DB (length=${user1Warns.length})`);
  assert(restrictCalls.length === 0, 'Test 2.5: Warning 2 does NOT mute user (restrictChatMember calls = 0)');
  assert(banCalls.length === 0, 'Test 2.6: Warning 2 does NOT ban user (banChatMember calls = 0)');

  // Warning 3 (THRESHOLD -> 1 HOUR MUTE)
  const preMuteTimeSec = Math.floor(Date.now() / 1000);
  await CommandHandler.handleCommand(warnCmdCtx);

  assert(restrictCalls.length === 1, `Test 2.7: Warning 3 triggers restrictChatMember (got ${restrictCalls.length})`);
  assert(banCalls.length === 0, 'Test 2.8: Warning 3 NEVER calls banChatMember (got 0 ban calls)');

  const muteCall = restrictCalls[0];
  assert(muteCall?.userId === targetUser1.id, 'Test 2.9: Mute targeted correct userId');
  assert(muteCall?.options?.until_date !== undefined, 'Test 2.10: Mute contains until_date timestamp');

  const durationSec = muteCall.options.until_date - preMuteTimeSec;
  assert(durationSec >= 3590 && durationSec <= 3610, `Test 2.11: Mute duration is exactly 1 hour (3600s, got ${durationSec}s)`);

  user1Warns = db.getUserWarnings(chatA, targetUser1.id);
  assert(user1Warns.length === 0, `Test 2.12: Warning counter is reset after 3rd warning threshold action (length=${user1Warns.length})`);

  const lastNotice = sentMessages[sentMessages.length - 1]?.text || '';
  assert(lastNotice.includes('muted for 1 hour') || lastNotice.includes('Warning limit reached'), `Test 2.13: Notice indicates 1-hour mute (${lastNotice})`);

  // Test 2.14: Failed mute does NOT reset warnings prematurely
  const failTarget: TelegramUser = { id: 2009, first_name: 'FailUser', username: 'fail_user', is_bot: false };
  db.cacheUser(failTarget, chatA);
  db.resetUserWarnings(chatA, failTarget.id);

  // Seed 2 warnings
  db.addWarning({ chatId: chatA, userId: failTarget.id, adminId: adminUser.id, reason: 'Test 1' });
  db.addWarning({ chatId: chatA, userId: failTarget.id, adminId: adminUser.id, reason: 'Test 2' });

  // Simulate Telegram restriction failure (e.g. permission issue)
  const origRestrict = telegramApi.restrictChatMember;
  telegramApi.restrictChatMember = async () => ({ ok: false, description: 'Not enough rights to restrict/mute member', error_code: 400 } as any);

  await CommandHandler.handleCommand({
    command: '/warn',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminUser,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    message: {
      message_id: 699,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
      from: adminUser,
      text: `/warn ${failTarget.id} Violation 3`
    },
    args: [`${failTarget.id}`, 'Violation', '3']
  });

  const failUserWarns = db.getUserWarnings(chatA, failTarget.id);
  assert(failUserWarns.length === 3, `Test 2.14: Failed mute does NOT reset warnings (warnings remain at ${failUserWarns.length})`);
  telegramApi.restrictChatMember = origRestrict;

  // ----------------------------------------------------
  // SECTION 3: LINK PROTECTION = IMMEDIATE PERMANENT MUTE
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: LINK PROTECTION = IMMEDIATE PERMANENT MUTE ---');

  restrictCalls = [];
  banCalls = [];
  sentMessages = [];

  const linkViolator: TelegramUser = { id: 2020, first_name: 'LinkSpammer', username: 'link_spammer', is_bot: false };
  db.cacheUser(linkViolator, chatA);

  const linkMsg: TelegramMessage = {
    message_id: 701,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
    from: linkViolator,
    text: 'Join our channel now: https://t.me/spam_group_invite'
  };

  // Test 3.1: Link violation immediately permanently mutes
  const intercepted = await ModerationService.handleLinkProtection(linkMsg);
  assert(intercepted === true, 'Test 3.1: Link violation intercepted and processed');
  assert(restrictCalls.length === 1, 'Test 3.2: Link violation immediately triggers restrictChatMember');
  assert(restrictCalls[0].userId === linkViolator.id, 'Test 3.3: Correct violator user was restricted');
  assert(restrictCalls[0].options?.until_date === undefined, 'Test 3.4: Link mute is PERMANENT (until_date is undefined)');
  assert(banCalls.length === 0, 'Test 3.5: Link violation NEVER calls banChatMember');

  // Test 3.6: Link violation does NOT record a temporary action in storage
  const tempActions = db.getActiveTempActions(chatA);
  assert(!tempActions.some(t => t.userId === linkViolator.id), 'Test 3.6: Permanent link mute is NOT recorded as a temporary action');

  // Test 3.7: Owner / Admin exemption
  const ownerUser: TelegramUser = { id: 1000, first_name: 'GroupOwner', username: 'group_owner', is_bot: false };
  telegramApi.getChatMember = async (_chatId: number, userId: number) => {
    if (userId === ownerUser.id) {
      return { ok: true, result: { status: 'creator', user: ownerUser } } as any;
    }
    return { ok: true, result: { status: 'member', user: linkViolator } } as any;
  };

  restrictCalls = [];
  const ownerLinkMsg: TelegramMessage = {
    message_id: 702,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
    from: ownerUser,
    text: 'Official group link: https://t.me/official_channel'
  };
  const ownerIntercepted = await ModerationService.handleLinkProtection(ownerLinkMsg);
  assert(ownerIntercepted === false, 'Test 3.7: Group owner link message is bypassed (not deleted/muted)');
  assert(restrictCalls.length === 0, 'Test 3.8: Owner was not restricted');

  // ----------------------------------------------------
  // SECTION 4: GRANULAR PERMISSION CHECKS PER COMMAND
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: GRANULAR PERMISSION CHECKS PER COMMAND ---');

  TelegramMiddleware.clearMemberCache();

  const regularMember: TelegramUser = { id: 4001, first_name: 'RegularMember', username: 'reg_member', is_bot: false };
  const adminWithoutRestrict: TelegramUser = { id: 4002, first_name: 'AdminNoRestrict', username: 'admin_no_rest', is_bot: false };
  const adminWithRestrict: TelegramUser = { id: 4003, first_name: 'AdminWithRestrict', username: 'admin_rest', is_bot: false };

  db.cacheUser(regularMember, chatA);
  db.cacheUser(adminWithoutRestrict, chatA);
  db.cacheUser(adminWithRestrict, chatA);

  telegramApi.getChatMember = async (_chatId: number, userId: number) => {
    if (userId === botId) {
      return { ok: true, result: { status: 'administrator', user: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, can_restrict_members: true, can_delete_messages: true } } as any;
    }
    if (userId === adminWithRestrict.id) {
      return { ok: true, result: { status: 'administrator', user: adminWithRestrict, can_restrict_members: true, can_delete_messages: true } } as any;
    }
    if (userId === adminWithoutRestrict.id) {
      return { ok: true, result: { status: 'administrator', user: adminWithoutRestrict, can_restrict_members: false, can_delete_messages: true } } as any;
    }
    if (userId === regularMember.id) {
      return { ok: true, result: { status: 'member', user: regularMember } } as any;
    }
    return { ok: true, result: { status: 'member', user: targetUser1 } } as any;
  };

  telegramApi.getChatAdministrators = async (_chatId: number) => ({
    ok: true,
    result: [
      { status: 'administrator', user: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, can_restrict_members: true, can_delete_messages: true },
      { status: 'administrator', user: adminWithRestrict, can_restrict_members: true, can_delete_messages: true },
      { status: 'administrator', user: adminWithoutRestrict, can_restrict_members: false, can_delete_messages: true }
    ]
  } as any);

  // Test 4.1: /mute by regular member -> REJECTED
  sentMessages = [];
  restrictCalls = [];
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: regularMember,
    isAnonymousAdmin: false,
    adminDisplayName: 'RegularMember',
    message: { message_id: 801, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: regularMember, text: `/mute ${targetUser1.id}` },
    args: [`${targetUser1.id}`]
  });
  assert(restrictCalls.length === 0, 'Test 4.1: /mute by regular member rejected (0 restrict calls)');
  assert(sentMessages[0]?.text.includes('group administrators'), 'Test 4.2: Regular member receives admin requirement notice');

  // Test 4.3: /mute by admin WITHOUT can_restrict_members -> REJECTED
  sentMessages = [];
  restrictCalls = [];
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithoutRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminNoRestrict',
    message: { message_id: 802, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithoutRestrict, text: `/mute ${targetUser1.id}` },
    args: [`${targetUser1.id}`]
  });
  assert(restrictCalls.length === 0, 'Test 4.3: /mute by admin without can_restrict_members rejected');
  assert(sentMessages[0]?.text.includes('Restrict Members') || sentMessages[0]?.text.includes('Ban Users'), 'Test 4.4: Admin without restrict permission receives specific permission notice');

  // Test 4.5: /ban by admin WITHOUT can_restrict_members -> REJECTED
  sentMessages = [];
  banCalls = [];
  await CommandHandler.handleCommand({
    command: '/ban',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithoutRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminNoRestrict',
    message: { message_id: 803, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithoutRestrict, text: `/ban ${targetUser1.id}` },
    args: [`${targetUser1.id}`]
  });
  assert(banCalls.length === 0, 'Test 4.5: /ban by admin without can_restrict_members rejected');

  // Test 4.6: /warn by admin WITHOUT can_restrict_members -> REJECTED
  sentMessages = [];
  const preWarnCount = db.getUserWarnings(chatA, targetUser1.id).length;
  await CommandHandler.handleCommand({
    command: '/warn',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithoutRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminNoRestrict',
    message: { message_id: 804, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithoutRestrict, text: `/warn ${targetUser1.id} spam` },
    args: [`${targetUser1.id}`, 'spam']
  });
  assert(db.getUserWarnings(chatA, targetUser1.id).length === preWarnCount, 'Test 4.6: /warn by admin without can_restrict_members rejected (warnings unchanged)');

  // ----------------------------------------------------
  // SECTION 5: MODERATION COMMAND DURATION & REASON PARSING
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: MODERATION COMMAND DURATION & REASON PARSING ---');

  TelegramMiddleware.clearMemberCache();

  // Reset API handlers to allow adminWithRestrict
  telegramApi.getChatAdministrators = async (_chatId: number) => ({
    ok: true,
    result: [
      { status: 'administrator', user: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, can_restrict_members: true, can_delete_messages: true },
      { status: 'administrator', user: adminWithRestrict, can_restrict_members: true, can_delete_messages: true }
    ]
  } as any);

  telegramApi.getChatMember = async (_chatId: number, userId: number) => {
    if (userId === botId) {
      return { ok: true, result: { status: 'administrator', user: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }, can_restrict_members: true, can_delete_messages: true } } as any;
    }
    if (userId === adminWithRestrict.id) {
      return { ok: true, result: { status: 'administrator', user: adminWithRestrict, can_restrict_members: true, can_delete_messages: true } } as any;
    }
    return { ok: true, result: { status: 'member', user: targetUser1 } } as any;
  };

  // Test 5.1: /mute @user => permanent mute (no duration, no reason)
  restrictCalls = [];
  sentMessages = [];
  db.removeTempAction(chatA, targetUser1.id, 'tmute');
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 901, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/mute @violator_1` },
    args: ['@violator_1']
  });
  assert(restrictCalls.length === 1, 'Test 5.1: /mute @user executed restrictChatMember');
  assert(restrictCalls[0].options?.until_date === undefined, 'Test 5.2: /mute @user without duration is PERMANENT (until_date undefined)');
  assert(db.getActiveTempActions(chatA).filter(t => t.userId === targetUser1.id).length === 0, 'Test 5.3: Permanent /mute does NOT add temporary action');

  // Test 5.4: /mute @user 1h => 1-hour temporary mute
  restrictCalls = [];
  sentMessages = [];
  const preMuteTime54 = Math.floor(Date.now() / 1000);
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 902, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/mute @violator_1 1h` },
    args: ['@violator_1', '1h']
  });
  assert(restrictCalls.length === 1, 'Test 5.4: /mute @user 1h executed');
  assert(restrictCalls[0].options?.until_date !== undefined, 'Test 5.5: /mute @user 1h has until_date');
  const dur54 = restrictCalls[0].options.until_date - preMuteTime54;
  assert(dur54 >= 3590 && dur54 <= 3610, `Test 5.6: 1h mute duration is 3600s (got ${dur54}s)`);
  const activeMutes54 = db.getActiveTempActions(chatA).filter(t => t.userId === targetUser1.id && t.action === 'tmute');
  assert(activeMutes54.length === 1, 'Test 5.7: Temporary /mute records temp action in DB');

  // Test 5.8: /mute @user 1h reason_xyz => 1-hour mute with reason
  restrictCalls = [];
  sentMessages = [];
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 903, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/mute @violator_1 1h repeated spam links` },
    args: ['@violator_1', '1h', 'repeated', 'spam', 'links']
  });
  assert(restrictCalls.length === 1, 'Test 5.8: /mute @user 1h reason executed');
  assert(sentMessages[0]?.text.includes('repeated spam links'), 'Test 5.9: Mute message includes multi-word reason');

  // Test 5.10: /mute @user reason_xyz => permanent mute with reason
  restrictCalls = [];
  sentMessages = [];
  db.removeTempAction(chatA, targetUser1.id, 'tmute');
  await CommandHandler.handleCommand({
    command: '/mute',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 904, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/mute @violator_1 spamming memes` },
    args: ['@violator_1', 'spamming', 'memes']
  });
  assert(restrictCalls[0]?.options?.until_date === undefined, 'Test 5.10: /mute @user reason_xyz is PERMANENT (until_date undefined)');
  assert(sentMessages[0]?.text.includes('spamming memes'), 'Test 5.11: Permanent mute message includes reason');
  assert(db.getActiveTempActions(chatA).filter(t => t.userId === targetUser1.id).length === 0, 'Test 5.12: Permanent mute with reason does not create tempAction');

  // Test 5.13: /ban @user => permanent ban
  banCalls = [];
  sentMessages = [];
  db.removeTempAction(chatA, targetUser1.id, 'tban');
  await CommandHandler.handleCommand({
    command: '/ban',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 905, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/ban @violator_1` },
    args: ['@violator_1']
  });
  assert(banCalls.length === 1, 'Test 5.13: /ban @user executed');
  assert(banCalls[0].options === undefined || banCalls[0].options?.until_date === undefined, 'Test 5.14: /ban @user is PERMANENT');

  // Test 5.15: /ban @user 7d severe violation => 7-day temporary ban with reason
  banCalls = [];
  sentMessages = [];
  const preBanTime = Math.floor(Date.now() / 1000);
  await CommandHandler.handleCommand({
    command: '/ban',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminWithRestrict,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminWithRestrict',
    message: { message_id: 906, date: Math.floor(Date.now() / 1000), chat: { id: chatA, type: 'supergroup' }, from: adminWithRestrict, text: `/ban @violator_1 7d severe violation` },
    args: ['@violator_1', '7d', 'severe', 'violation']
  });
  assert(banCalls.length === 1, 'Test 5.15: /ban @user 7d executed');
  const banDur = banCalls[0].options.until_date - preBanTime;
  assert(banDur >= 7 * 86400 - 10 && banDur <= 7 * 86400 + 10, `Test 5.16: 7d ban duration is ~604800s (got ${banDur}s)`);
  assert(sentMessages[0]?.text.includes('severe violation'), 'Test 5.17: Temporary ban message includes reason');
  const activeBans = db.getActiveTempActions(chatA).filter(t => t.userId === targetUser1.id && t.action === 'tban');
  assert(activeBans.length === 1, 'Test 5.18: Temporary ban is tracked in DB');

  // ----------------------------------------------------
  // SECTION 6: DURATION PARSER EDGE CASES
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: DURATION PARSER EDGE CASES ---');

  const { parseDuration: testParseDur } = await import('../server/telegram/moderation.js');

  assert(testParseDur('30s')?.seconds === 30, 'Test 6.1: parseDuration("30s") = 30s');
  assert(testParseDur('10m')?.seconds === 600, 'Test 6.2: parseDuration("10m") = 600s');
  assert(testParseDur('1h')?.seconds === 3600, 'Test 6.3: parseDuration("1h") = 3600s');
  assert(testParseDur('2d')?.seconds === 172800, 'Test 6.4: parseDuration("2d") = 172800s');
  assert(testParseDur('1h30m')?.seconds === 5400, 'Test 6.5: parseDuration("1h30m") = 5400s');
  assert(testParseDur('0s') === null, 'Test 6.6: parseDuration("0s") rejected (null)');
  assert(testParseDur('-5m') === null, 'Test 6.7: parseDuration("-5m") rejected (null)');
  assert(testParseDur('10meters') === null, 'Test 6.8: parseDuration("10meters") rejected (null)');
  assert(testParseDur('invalid_text') === null, 'Test 6.9: parseDuration("invalid_text") rejected (null)');
  assert(testParseDur('') === null, 'Test 6.10: parseDuration("") rejected (null)');

  console.log('\n====================================================');
  console.log(`🎉 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled exception in test suite:', err);
  process.exit(1);
});
