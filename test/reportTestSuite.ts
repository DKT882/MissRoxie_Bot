import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext } from '../server/telegram/middleware.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { db } from '../server/db/storage.js';
import { TelegramMessage, TelegramChatMember } from '../server/telegram/types.js';

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

async function runReportTestSuite() {
  console.log('====================================================');
  console.log('STARTING REPORT & PUBLIC COMMAND TEST SUITE (REPORT-01 to REPORT-13)');
  console.log('====================================================\n');

  const chatId = -1001234567890;
  const ownerId = 1001;
  const adminId = 2001;
  const normalMemberId = 4001;
  const targetMemberId = 4002;
  const botId = 9999;

  let lastSentMessage: { chatId: number; text: string; options?: any } | null = null;
  let moderationCalls: string[] = [];

  // Track moderation calls to ensure /report never triggers any moderation action
  telegramApi.banChatMember = async () => { moderationCalls.push('ban'); return { ok: true }; };
  telegramApi.restrictChatMember = async () => { moderationCalls.push('restrict'); return { ok: true }; };
  telegramApi.promoteChatMember = async () => { moderationCalls.push('promote'); return { ok: true, result: true }; };

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
        chat: { id: cId, type: typeof cId === 'number' && cId < 0 ? 'supergroup' : 'private' },
        text,
        date: Date.now()
      } as any
    };
  };

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
    [normalMemberId]: {
      status: 'member',
      user: { id: normalMemberId, is_bot: false, first_name: 'MemberUser', username: 'member_user' }
    },
    [targetMemberId]: {
      status: 'member',
      user: { id: targetMemberId, is_bot: false, first_name: 'SpamUser', username: 'spam_user' }
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

  function makeContext(
    actorId: number,
    text: string,
    replyToMessage?: TelegramMessage,
    chatType: 'supergroup' | 'group' | 'private' = 'supergroup',
    customChatId: number = chatId,
    isAnonymous: boolean = false
  ): CommandContext {
    const parts = text.trim().split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);
    const member = memberStatusMap[actorId];

    const message: TelegramMessage = {
      message_id: Math.floor(Math.random() * 10000) + 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: customChatId, type: chatType, title: 'Security Test Group' },
      from: isAnonymous ? undefined : member?.user,
      sender_chat: isAnonymous ? { id: customChatId, title: 'Security Test Group', type: 'supergroup' } : undefined,
      text,
      reply_to_message: replyToMessage
    };

    return {
      message,
      chatId: customChatId,
      chatTitle: 'Security Test Group',
      sender: member?.user || { id: actorId, is_bot: false, first_name: 'User' },
      command,
      args,
      isAnonymousAdmin: isAnonymous,
      authorSignature: isAnonymous ? 'Admin Signature' : undefined,
      adminDisplayName: member?.user?.first_name || 'User'
    };
  }

  const reportedMessage: TelegramMessage = {
    message_id: 12345,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup', title: 'Security Test Group' },
    from: memberStatusMap[targetMemberId].user,
    text: 'Check out this spam link: https://malicious.example.com'
  };

  // --- REPORT-01: Normal member can use /report ---
  {
    ModerationService.clearReportCooldowns();
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/report spamming links', reportedMessage);
    const handled = await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      handled === true &&
      text.includes('🚨 <b>NEW REPORT</b>') &&
      (text.includes('spam_user') || text.includes('4002')) &&
      text.includes('spamming links') &&
      !text.includes('❌ This bot is available only to group administrators.'),
      'REPORT-01: normal member can use /report'
    );
  }

  // --- REPORT-02: Normal member cannot use /kick ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/kick @spam_user');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-02: normal member cannot use /kick'
    );
  }

  // --- REPORT-03: Normal member cannot use /ban ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/ban @spam_user');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-03: normal member cannot use /ban'
    );
  }

  // --- REPORT-04: Normal member cannot use /promote ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/promote @spam_user');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-04: normal member cannot use /promote'
    );
  }

  // --- REPORT-05: Normal member cannot use /demote ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/demote @admin_user');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-05: normal member cannot use /demote'
    );
  }

  // --- REPORT-06: Normal member cannot use /permissions ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/permissions @admin_user');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-06: normal member cannot use /permissions'
    );
  }

  // --- REPORT-07: Normal member cannot use /clear ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/clear 10');
    const handled = await CommandHandler.handleCommand(ctx);
    assert(
      handled === true &&
      lastSentMessage?.text === '❌ This bot is available only to group administrators.',
      'REPORT-07: normal member cannot use /clear'
    );
  }

  // --- REPORT-08: Admin can use /report ---
  {
    ModerationService.clearReportCooldowns();
    lastSentMessage = null;
    const ctx = makeContext(adminId, '/report advertising', reportedMessage);
    const handled = await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      handled === true &&
      text.includes('🚨 <b>NEW REPORT</b>') &&
      text.includes('advertising'),
      'REPORT-08: admin can use /report'
    );
  }

  // --- REPORT-09: Anonymous admin can use /report ---
  {
    ModerationService.clearReportCooldowns();
    lastSentMessage = null;
    const ctx = makeContext(1087968824, '/report offending content', reportedMessage, 'supergroup', chatId, true);
    const handled = await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      handled === true &&
      text.includes('🚨 <b>NEW REPORT</b>') &&
      text.includes('offending content'),
      'REPORT-09: anonymous admin can use /report'
    );
  }

  // --- REPORT-10: /report in private chat is rejected ---
  {
    ModerationService.clearReportCooldowns();
    lastSentMessage = null;
    const privateChatId = 12345678;
    const ctx = makeContext(normalMemberId, '/report spam', reportedMessage, 'private', privateChatId);
    const handled = await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      handled === true &&
      text.includes('Group Command Only'),
      'REPORT-10: /report in private chat is rejected'
    );
  }

  // --- REPORT-11: /report cannot trigger any moderation action ---
  {
    ModerationService.clearReportCooldowns();
    moderationCalls = [];
    const ctx = makeContext(normalMemberId, '/report malicious user', reportedMessage);
    await CommandHandler.handleCommand(ctx);
    assert(
      moderationCalls.length === 0,
      'REPORT-11: /report cannot trigger any moderation action'
    );
  }

  // --- REPORT-12: Report reaches group administrators and logs to audit ---
  {
    ModerationService.clearReportCooldowns();
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/report Rule 1 violation', reportedMessage);
    await CommandHandler.handleCommand(ctx);
    const logs = db.getGroupLogs(chatId);
    const lastLog = logs[0];
    assert(
      lastSentMessage !== null &&
      lastSentMessage.chatId === chatId &&
      lastSentMessage.text.includes('🚨 <b>NEW REPORT</b>') &&
      lastSentMessage.text.includes('Rule 1 violation') &&
      lastLog?.action === 'report' &&
      lastLog?.targetUserId === targetMemberId,
      'REPORT-12: report reaches group administrators'
    );
  }

  // --- REPORT-13: Malformed report (no replied message) is rejected safely ---
  {
    lastSentMessage = null;
    const ctx = makeContext(normalMemberId, '/report without replying');
    const handled = await CommandHandler.handleCommand(ctx);
    const text = lastSentMessage?.text || '';
    assert(
      handled === true &&
      text.includes('Please reply to the message you wish to report'),
      'REPORT-13: malformed report is rejected safely'
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

runReportTestSuite().catch((err) => {
  console.error('Fatal Report Test Suite Error:', err);
  process.exit(1);
});
