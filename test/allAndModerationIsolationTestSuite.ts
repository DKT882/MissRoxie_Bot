process.env.NODE_ENV = 'test';

import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { SmartProtectionService } from '../server/telegram/smartProtection.js';
import { mtprotoParticipantService } from '../server/telegram/mtprotoParticipantService.js';
import { TelegramMessage, TelegramUser } from '../server/telegram/types.js';
import { CommandContext } from '../server/telegram/middleware.js';

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

  // Test 1.4: /all execution with mock members in Chat A
  const membersList = Array.from({ length: 25 }, (_, i) => ({
    id: 3000 + i,
    firstName: `Member${i}`,
    username: `mem_${i}`
  }));

  for (const m of membersList) {
    db.cacheUser({ id: m.id, first_name: m.firstName, username: m.username, is_bot: false }, chatA);
  }

  sentMessages = [];
  CommandHandler.allMessageIntervalMs = 5; // Fast for test execution

  const allCmdCtx: CommandContext = {
    command: '/all',
    chatId: chatA,
    chatTitle: 'Test Group A',
    sender: adminUser,
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    message: {
      message_id: 501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
      from: adminUser,
      text: '/all Team Meeting Announcement'
    },
    args: ['Team', 'Meeting', 'Announcement']
  };

  await CommandHandler.handleCommand(allCmdCtx);

  assert(sentMessages.length === 3, `Test 1.4: 25 members produced exactly 3 mention messages (got ${sentMessages.length})`);
  assert(sentMessages.every(m => m.text.includes('Team Meeting Announcement')), 'Test 1.5: All /all batches include custom announcement text');
  assert(!mtprotoParticipantService.isChatLocked(chatA), 'Test 1.6: Chat A lock released cleanly after worker completion');

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
  // SECTION 3: LINK PROTECTION WARNING ESCALATION (3 WARNINGS = 1 HOUR MUTE)
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: LINK PROTECTION WARNING ESCALATION ---');

  db.resetUserWarnings(chatA, targetUser2.id);
  restrictCalls = [];
  banCalls = [];
  sentMessages = [];

  const linkMsg: TelegramMessage = {
    message_id: 701,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
    from: targetUser2,
    text: 'Check this link: https://unauthorized-spam-link.com'
  };

  // Link Violation 1
  await ModerationService.handleLinkProtection(linkMsg);
  let user2Warns = db.getUserWarnings(chatA, targetUser2.id);
  assert(user2Warns.length === 1, `Test 3.1: Link Violation 1 recorded (length=${user2Warns.length})`);
  assert(restrictCalls.length === 0, 'Test 3.2: Link Violation 1 does NOT mute user');

  // Link Violation 2
  await ModerationService.handleLinkProtection(linkMsg);
  user2Warns = db.getUserWarnings(chatA, targetUser2.id);
  assert(user2Warns.length === 2, `Test 3.3: Link Violation 2 recorded (length=${user2Warns.length})`);
  assert(restrictCalls.length === 0, 'Test 3.4: Link Violation 2 does NOT mute user');

  // Link Violation 3 (Threshold -> 1-Hour Mute)
  const preLinkMuteTimeSec = Math.floor(Date.now() / 1000);
  await ModerationService.handleLinkProtection(linkMsg);

  assert(restrictCalls.length === 1, 'Test 3.5: Link Violation 3 executes 1-hour mute');
  assert(banCalls.length === 0, 'Test 3.6: Link Violation 3 NEVER calls banChatMember');

  const linkMuteCall = restrictCalls[0];
  const linkMuteDuration = linkMuteCall.options.until_date - preLinkMuteTimeSec;
  assert(linkMuteDuration >= 3590 && linkMuteDuration <= 3610, `Test 3.7: Link mute duration is exactly 1 hour (${linkMuteDuration}s)`);

  user2Warns = db.getUserWarnings(chatA, targetUser2.id);
  assert(user2Warns.length === 0, 'Test 3.8: Link violation warnings reset after 1-hour mute');

  // Test 3.9: Link protection failed mute does NOT reset warnings
  const linkFailUser: TelegramUser = { id: 2010, first_name: 'LinkFail', username: 'link_fail', is_bot: false };
  db.cacheUser(linkFailUser, chatA);
  db.resetUserWarnings(chatA, linkFailUser.id);
  db.addWarning({ chatId: chatA, userId: linkFailUser.id, adminId: botId, reason: 'Link 1' });
  db.addWarning({ chatId: chatA, userId: linkFailUser.id, adminId: botId, reason: 'Link 2' });

  telegramApi.restrictChatMember = async () => ({ ok: false, description: 'CHAT_ADMIN_REQUIRED', error_code: 400 } as any);
  await ModerationService.handleLinkProtection({
    ...linkMsg,
    from: linkFailUser,
    message_id: 799
  });

  const linkFailWarns = db.getUserWarnings(chatA, linkFailUser.id);
  assert(linkFailWarns.length === 3, `Test 3.9: Failed link mute does NOT reset warnings (warnings remain at ${linkFailWarns.length})`);
  telegramApi.restrictChatMember = origRestrict;

  // ----------------------------------------------------
  // SECTION 4: SMART PROTECTION WARNING ESCALATION (3 WARNINGS = 1 HOUR MUTE)
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: SMART PROTECTION WARNING ESCALATION ---');

  const smartTarget: TelegramUser = { id: 2003, first_name: 'SmartViolator', username: 'smart_violator', is_bot: false };
  db.cacheUser(smartTarget, chatA);
  db.resetUserWarnings(chatA, smartTarget.id);
  SmartProtectionService.reset();
  restrictCalls = [];
  banCalls = [];

  const smartMsg: TelegramMessage = {
    message_id: 801,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatA, type: 'supergroup', title: 'Test Group A' },
    from: smartTarget,
    text: 'Repeat text spam message 123'
  };

  // Smart protection flood simulation
  db.updateGroupSettings(chatA, { protectionEnabled: true, protectionFloodCount: 2, protectionFloodWindow: 10, warnLimit: 3, warnAction: 'mute' });

  // Violation 1
  await SmartProtectionService.handleMessage(smartMsg);
  await SmartProtectionService.handleMessage({ ...smartMsg, message_id: 802 });
  let smartWarns = db.getUserWarnings(chatA, smartTarget.id);
  assert(smartWarns.length === 1, `Test 4.1: Smart Protection warning 1 recorded (length=${smartWarns.length})`);
  assert(restrictCalls.length === 0, 'Test 4.2: Smart Protection warning 1 does NOT mute');

  // Violation 2
  SmartProtectionService.reset();
  await SmartProtectionService.handleMessage({ ...smartMsg, message_id: 803 });
  await SmartProtectionService.handleMessage({ ...smartMsg, message_id: 804 });
  smartWarns = db.getUserWarnings(chatA, smartTarget.id);
  assert(smartWarns.length === 2, `Test 4.3: Smart Protection warning 2 recorded (length=${smartWarns.length})`);
  assert(restrictCalls.length === 0, 'Test 4.4: Smart Protection warning 2 does NOT mute (5-min mute removed)');

  // Violation 3 (Threshold -> 1-Hour Mute)
  SmartProtectionService.reset();
  const preSmartMuteTime = Math.floor(Date.now() / 1000);
  await SmartProtectionService.handleMessage({ ...smartMsg, message_id: 805 });
  await SmartProtectionService.handleMessage({ ...smartMsg, message_id: 806 });

  assert(restrictCalls.length === 1, 'Test 4.5: Smart Protection warning 3 triggers 1-hour mute');
  assert(banCalls.length === 0, 'Test 4.6: Smart Protection warning 3 NEVER calls banChatMember');

  const smartMuteCall = restrictCalls[0];
  const smartMuteDuration = smartMuteCall.options.until_date - preSmartMuteTime;
  assert(smartMuteDuration >= 3590 && smartMuteDuration <= 3610, `Test 4.7: Smart protection mute duration is 1 hour (${smartMuteDuration}s)`);

  smartWarns = db.getUserWarnings(chatA, smartTarget.id);
  assert(smartWarns.length === 0, 'Test 4.8: Smart protection warnings reset after 1-hour mute');

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
