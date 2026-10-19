import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';

interface TestResult {
  name: string;
  passed: boolean;
  actual?: string;
  expected?: string;
  error?: string;
}

export async function runDMuteRegressionTests(): Promise<{ total: number; passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];

  const adminId = 111001;
  const nonAdminId = 444001;
  const targetId = 777001;
  const targetUsername = 'offending_spammer';
  const peerAdminId = 222001;
  const ownerId = 333001;
  const botId = 99999999;
  const chatId = -1004494299999;

  // Cache target username in local database
  db.cacheUser(
    {
      id: targetId,
      is_bot: false,
      first_name: 'TargetSpammer',
      username: targetUsername
    },
    chatId
  );

  let lastSentMessage = '';
  let lastSentOpts: any = null;
  const deletedMessages: number[] = [];
  const mutedUsers: { userId: number; untilDate?: number }[] = [];
  const bannedUsers: { userId: number; untilDate?: number }[] = [];
  const kickedUsers: number[] = [];

  telegramApi.sendMessage = async (cId: any, text: string, opts?: any) => {
    lastSentMessage = text;
    lastSentOpts = opts;
    return { ok: true, result: { message_id: 9999 } };
  };

  telegramApi.deleteMessage = async (cId: any, msgId: number) => {
    deletedMessages.push(msgId);
    return { ok: true };
  };

  telegramApi.restrictChatMember = async (cId: any, userId: number, permissions: any, options?: any) => {
    mutedUsers.push({ userId, untilDate: typeof options === 'number' ? options : options?.until_date });
    return { ok: true };
  };

  telegramApi.banChatMember = async (cId: any, userId: number, options?: any) => {
    bannedUsers.push({ userId, untilDate: typeof options === 'number' ? options : options?.until_date });
    return { ok: true };
  };

  telegramApi.unbanChatMember = async (cId: any, userId: number) => {
    kickedUsers.push(userId);
    return { ok: true };
  };

  telegramApi.getChatMember = async (cId: any, uId: any) => {
    if (uId === adminId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: adminId, is_bot: false, first_name: 'Admin' },
          can_delete_messages: true,
          can_restrict_members: true
        }
      };
    }
    if (uId === nonAdminId) {
      return {
        ok: true,
        result: {
          status: 'member',
          user: { id: nonAdminId, is_bot: false, first_name: 'NonAdmin' }
        }
      };
    }
    if (uId === peerAdminId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: peerAdminId, is_bot: false, first_name: 'PeerAdmin' },
          can_delete_messages: true,
          can_restrict_members: true
        }
      };
    }
    if (uId === ownerId) {
      return {
        ok: true,
        result: {
          status: 'creator',
          user: { id: ownerId, is_bot: false, first_name: 'Owner' }
        }
      };
    }
    if (uId === botId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: botId, is_bot: true, first_name: 'Roxie' },
          can_delete_messages: true,
          can_restrict_members: true,
          can_promote_members: true
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: 'Target' }
      }
    };
  };

  telegramApi.getChatAdministrators = async () => ({
    ok: true,
    result: [
      { status: 'creator', user: { id: ownerId, is_bot: false, first_name: 'Owner' } },
      { status: 'administrator', user: { id: adminId, is_bot: false, first_name: 'Admin' }, can_delete_messages: true, can_restrict_members: true },
      { status: 'administrator', user: { id: peerAdminId, is_bot: false, first_name: 'PeerAdmin' }, can_delete_messages: true, can_restrict_members: true },
      { status: 'administrator', user: { id: botId, is_bot: true, first_name: 'Roxie' }, can_delete_messages: true, can_restrict_members: true, can_promote_members: true }
    ]
  });

  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'RoxieBot', username: 'MissRoxie_Bot' }
  });

  function resetState() {
    lastSentMessage = '';
    lastSentOpts = null;
    deletedMessages.length = 0;
    mutedUsers.length = 0;
    bannedUsers.length = 0;
    kickedUsers.length = 0;
  }

  // --- CASE 1: /dmute replying to an ordinary user's message ---
  resetState();
  const ctxCase1: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dmute',
      reply_to_message: {
        message_id: 401,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: targetId, first_name: 'TargetSpammer', username: targetUsername },
        text: 'buy cheap crypto now'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase1);
  const case1Passed =
    lastSentMessage.includes('has been muted') &&
    lastSentMessage.includes('their message was deleted') &&
    deletedMessages.includes(401) &&
    mutedUsers.some((u) => u.userId === targetId);
  results.push({
    name: 'Case 1: /dmute replying to an ordinary user message deletes replied message & mutes target',
    passed: case1Passed,
    actual: `msg="${lastSentMessage}", deleted=[${deletedMessages}], muted=[${mutedUsers.map((m) => m.userId)}]`,
    expected: 'Muted target user 777001 and deleted message 401'
  });

  // --- CASE 2: /dmute with a valid @username (no reply) ---
  resetState();
  const ctxCase2: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [`@${targetUsername}`],
    rawArgs: `@${targetUsername}`,
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 502,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: `/dmute @${targetUsername}`
    }
  };
  await CommandHandler.handleCommand(ctxCase2);
  const case2Passed =
    lastSentMessage.includes('has been muted') &&
    mutedUsers.some((u) => u.userId === targetId);
  results.push({
    name: 'Case 2: /dmute with valid @username resolves target & mutes user',
    passed: case2Passed,
    actual: `msg="${lastSentMessage}", muted=[${mutedUsers.map((m) => m.userId)}]`,
    expected: `Muted user ${targetId}`
  });

  // --- CASE 3: /dmute with a supported numeric user ID (no reply) ---
  resetState();
  const ctxCase3: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [`${targetId}`],
    rawArgs: `${targetId}`,
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 503,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: `/dmute ${targetId}`
    }
  };
  await CommandHandler.handleCommand(ctxCase3);
  const case3Passed =
    lastSentMessage.includes('has been muted') &&
    mutedUsers.some((u) => u.userId === targetId);
  results.push({
    name: 'Case 3: /dmute with supported numeric target ID resolves & mutes target',
    passed: case3Passed,
    actual: `msg="${lastSentMessage}", muted=[${mutedUsers.map((m) => m.userId)}]`,
    expected: `Muted user ${targetId}`
  });

  // --- CASE 4: /dmute without a reply or target ---
  resetState();
  const ctxCase4: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 504,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dmute'
    }
  };
  await CommandHandler.handleCommand(ctxCase4);
  const case4Passed =
    lastSentMessage.includes('Please reply to the message you want to delete and mute with /dmute');
  results.push({
    name: 'Case 4: /dmute without reply or target returns clear action-specific requirement',
    passed: case4Passed,
    actual: lastSentMessage,
    expected: '⚠️ Please reply to the message you want to delete and mute with /dmute'
  });

  // --- CASE 5: /dmute replying to a service message (missing sender data) ---
  resetState();
  const ctxCase5: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 505,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dmute',
      reply_to_message: {
        message_id: 301,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' }
        // Service message: no 'from' and no 'sender_chat'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase5);
  const case5Passed =
    lastSentMessage.includes('Cannot moderate a service message') &&
    lastSentMessage.includes('Please reply directly to a message sent by the user');
  results.push({
    name: 'Case 5: /dmute replying to service message informs admin that service messages cannot be moderated',
    passed: case5Passed,
    actual: lastSentMessage,
    expected: '⚠️ Cannot moderate a service message. Please reply directly to a message sent by the user you want to mute.'
  });

  // --- CASE 6: Unauthorized caller (non-admin) ---
  resetState();
  const ctxCase6: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: nonAdminId, is_bot: false, first_name: 'NonAdmin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 506,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: nonAdminId, is_bot: false, first_name: 'NonAdmin' },
      text: '/dmute',
      reply_to_message: {
        message_id: 402,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: targetId, first_name: 'TargetSpammer' },
        text: 'some message'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase6);
  const case6Passed =
    lastSentMessage.includes('available only to group administrators') &&
    mutedUsers.length === 0;
  results.push({
    name: 'Case 6: Unauthorized non-admin caller is rejected without moderating target',
    passed: case6Passed,
    actual: lastSentMessage,
    expected: '❌ This bot is available only to group administrators.'
  });

  // --- CASE 7: Bot target and self target guards ---
  resetState();
  const ctxCase7a: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 507,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dmute',
      reply_to_message: {
        message_id: 403,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: botId, is_bot: true, first_name: 'Roxie' },
        text: 'bot status message'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase7a);
  const case7aPassed = lastSentMessage.includes('Cannot dmute the bot itself');

  resetState();
  const ctxCase7b: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dmute',
    args: [],
    rawArgs: '',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 508,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dmute',
      reply_to_message: {
        message_id: 404,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: adminId, is_bot: false, first_name: 'Admin' },
        text: 'my own message'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase7b);
  const case7bPassed = lastSentMessage.includes('actor and target are the same user');

  results.push({
    name: 'Case 7: Bot target and self-target protection guards trigger safely',
    passed: case7aPassed && case7bPassed,
    actual: `botTarget="${case7aPassed}", selfTarget="${case7bPassed}"`,
    expected: 'Rejected bot target and self-target'
  });

  // --- CASE 8: Related commands (/mute with duration, /dban, /dkick) ---
  resetState();
  const ctxCase8a: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/mute',
    args: ['300', 'Disruption'],
    rawArgs: '300 Disruption',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 509,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/mute 300 Disruption',
      reply_to_message: {
        message_id: 405,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: targetId, first_name: 'TargetSpammer' },
        text: 'noisy chatter'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase8a);
  const case8aPassed =
    lastSentMessage.includes('has been muted') &&
    mutedUsers.some((u) => u.userId === targetId);

  resetState();
  const ctxCase8b: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dban',
    args: ['Spam raid'],
    rawArgs: 'Spam raid',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 510,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dban Spam raid',
      reply_to_message: {
        message_id: 406,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: targetId, first_name: 'TargetSpammer' },
        text: 'raid link'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase8b);
  const case8bPassed =
    lastSentMessage.includes('has been banned') &&
    lastSentMessage.includes('their message was deleted') &&
    deletedMessages.includes(406) &&
    bannedUsers.some((u) => u.userId === targetId);

  resetState();
  const ctxCase8c: any = {
    chatId,
    chatTitle: 'Test Group',
    command: '/dkick',
    args: ['Trolling'],
    rawArgs: 'Trolling',
    sender: { id: adminId, is_bot: false, first_name: 'Admin' },
    isAnonymousAdmin: false,
    message: {
      message_id: 511,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' },
      from: { id: adminId, is_bot: false, first_name: 'Admin' },
      text: '/dkick Trolling',
      reply_to_message: {
        message_id: 407,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' },
        from: { id: targetId, first_name: 'TargetSpammer' },
        text: 'trolling message'
      }
    }
  };
  await CommandHandler.handleCommand(ctxCase8c);
  const case8cPassed =
    lastSentMessage.includes('was removed from the group') &&
    lastSentMessage.includes('their message was deleted') &&
    deletedMessages.includes(407) &&
    kickedUsers.includes(targetId);

  results.push({
    name: 'Case 8: Consistency across /mute with duration argument, /dban, and /dkick',
    passed: case8aPassed && case8bPassed && case8cPassed,
    actual: `/mute="${case8aPassed}", /dban="${case8bPassed}", /dkick="${case8cPassed}"`,
    expected: 'All related moderation commands succeed consistently'
  });

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results
  };
}

// Execute standalone if executed via CLI
if (process.argv[1]?.endsWith('dmuteRegressionTestSuite.ts') || process.argv[1]?.endsWith('dmuteRegressionTestSuite.js')) {
  runDMuteRegressionTests().then((res) => {
    console.log(`\n==================================================`);
    console.log(`  /dmute & Moderation Regression Test Suite Results`);
    console.log(`==================================================`);
    for (const r of res.results) {
      console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}`);
      if (!r.passed) {
        console.log(`   Expected: ${r.expected}`);
        console.log(`   Actual:   ${r.actual}`);
      }
    }
    console.log(`--------------------------------------------------`);
    console.log(`Summary: ${res.passed}/${res.total} tests passed (${res.failed} failed).\n`);
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
