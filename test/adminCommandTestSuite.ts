import { telegramApi } from '../server/telegram/api.js';
import { TelegramMiddleware, CommandContext } from '../server/telegram/middleware.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { TelegramChatMember } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runAdminCommandTestSuite() {
  console.log('====================================================');
  console.log('🛡️ RUNNING /ADMIN COMMAND TEST SUITE');
  console.log('====================================================\n');

  const groupChatId = -1001999888777;
  const privateChatId = 8881234;
  const botId = 99990001;

  let sentMessages: Array<{ chatId: number | string; text: string; options?: any }> = [];

  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origGetChatAdministrators = telegramApi.getChatAdministrators.bind(telegramApi);
  const origGetMe = telegramApi.getMe.bind(telegramApi);
  const origDeleteMessage = telegramApi.deleteMessage.bind(telegramApi);

  telegramApi.deleteMessage = async () => ({ ok: true });

  telegramApi.getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' } as any
  });

  telegramApi.sendMessage = async (cId: number | string, text: string, options?: any) => {
    sentMessages.push({ chatId: cId, text, options });
    return {
      ok: true,
      result: {
        message_id: 55555,
        chat: { id: typeof cId === 'number' ? cId : Number(cId), type: typeof cId === 'number' && cId < 0 ? 'supergroup' : 'private' },
        date: Math.floor(Date.now() / 1000),
        text
      } as any
    };
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Rejection in Private Chat (Group-only command convention)
    // -------------------------------------------------------------------------
    sentMessages = [];
    const privateCtx: CommandContext = {
      message: {
        message_id: 101,
        date: Math.floor(Date.now() / 1000),
        chat: { id: privateChatId, type: 'private', first_name: 'User1' },
        from: { id: privateChatId, is_bot: false, first_name: 'User1' }
      },
      chatId: privateChatId,
      chatTitle: 'User1',
      sender: { id: privateChatId, is_bot: false, first_name: 'User1' },
      isAnonymousAdmin: false,
      adminDisplayName: 'User1',
      args: [],
      command: '/admin'
    };

    const privateHandled = await CommandHandler.handleCommand(privateCtx);
    assert(privateHandled === true, 'ADMIN-01: /admin in private chat is recognized and handled');
    assert(
      sentMessages.length === 1 && sentMessages[0].text.includes('Group Command Only'),
      'ADMIN-02: /admin in private chat replies with Group Command Only notice'
    );

    // -------------------------------------------------------------------------
    // TEST 2: Successful Mention of All Admins and Owner in ONE Single Message
    // -------------------------------------------------------------------------
    sentMessages = [];
    const mockAdmins: TelegramChatMember[] = [
      {
        status: 'creator',
        user: { id: 1001, is_bot: false, first_name: 'Alice <Owner>', last_name: 'Smith' } as any
      },
      {
        status: 'administrator',
        user: { id: 2002, is_bot: false, first_name: 'Bob', username: 'bob_admin' } as any
      },
      {
        status: 'administrator',
        user: { id: 3003, is_bot: false, first_name: 'Charlie & Co' } as any // No username, special HTML characters
      },
      {
        status: 'administrator',
        user: { id: botId, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' } as any // Bot itself
      },
      {
        status: 'administrator',
        user: { id: 88880001, is_bot: true, first_name: 'HelperBot', username: 'Helper_Bot' } as any // Another bot
      }
    ];

    telegramApi.getChatAdministrators = async (cId: number | string) => {
      if (Number(cId) === groupChatId) {
        return { ok: true, result: mockAdmins };
      }
      return { ok: true, result: [] };
    };

    const groupCtx: CommandContext = {
      message: {
        message_id: 201,
        date: Math.floor(Date.now() / 1000),
        chat: { id: groupChatId, type: 'supergroup', title: 'Test Group' },
        from: { id: 7771, is_bot: false, first_name: 'RegularMember' }
      },
      chatId: groupChatId,
      chatTitle: 'Test Group',
      sender: { id: 7771, is_bot: false, first_name: 'RegularMember' },
      isAnonymousAdmin: false,
      adminDisplayName: 'RegularMember',
      args: ['Need', 'help', 'with', 'spammer'],
      command: '/admin'
    };

    const groupHandled = await CommandHandler.handleCommand(groupCtx);
    assert(groupHandled === true, 'ADMIN-03: /admin in group chat handled successfully');
    assert(sentMessages.length === 1, 'ADMIN-04: Exactly ONE message dispatched by Roxie');

    const msg = sentMessages[0];
    assert(msg.chatId === groupChatId, 'ADMIN-05: Message sent to target group chat');
    assert(msg.options?.parse_mode === 'HTML', 'ADMIN-06: Message sent with parse_mode HTML');

    // Clickable mentions check:
    assert(
      msg.text.includes('<a href="tg://user?id=1001">👑 Alice &lt;Owner&gt; Smith</a>') ||
      msg.text.includes('👑 <a href="tg://user?id=1001">Alice &lt;Owner&gt; Smith</a>'),
      'ADMIN-07: Group owner mentioned with user ID clickable link and HTML escaped'
    );
    assert(
      msg.text.includes('<a href="tg://user?id=2002">🛡️ Bob</a>') ||
      msg.text.includes('🛡️ <a href="tg://user?id=2002">Bob</a>'),
      'ADMIN-08: Admin Bob mentioned with user ID clickable link'
    );
    assert(
      msg.text.includes('<a href="tg://user?id=3003">🛡️ Charlie &amp; Co</a>') ||
      msg.text.includes('🛡️ <a href="tg://user?id=3003">Charlie &amp; Co</a>'),
      'ADMIN-09: Admin without username (Charlie & Co) mentioned with user ID link and properly escaped HTML'
    );

    // Bot exclusion check:
    assert(!msg.text.includes('tg://user?id=99990001'), 'ADMIN-10: Roxie bot itself is strictly excluded from mentions');
    assert(!msg.text.includes('tg://user?id=88880001'), 'ADMIN-11: Other admin bots are strictly excluded from mentions');

    // Reason inclusion check:
    assert(msg.text.includes('Need help with spammer'), 'ADMIN-12: User reason argument included in the broadcast message');

    // -------------------------------------------------------------------------
    // TEST 3: Replying to a Specific Message
    // -------------------------------------------------------------------------
    sentMessages = [];
    const replyCtx: CommandContext = {
      ...groupCtx,
      message: {
        ...groupCtx.message,
        message_id: 202,
        reply_to_message: {
          message_id: 999123,
          date: Math.floor(Date.now() / 1000),
          chat: { id: groupChatId, type: 'supergroup', title: 'Test Group' },
          from: { id: 6661, is_bot: false, first_name: 'Spammer' },
          text: 'Buy crypto now!'
        }
      },
      args: []
    };

    await CommandHandler.handleCommand(replyCtx);
    assert(sentMessages.length === 1, 'ADMIN-13: Exactly one message sent when replying to message');
    assert(sentMessages[0].options?.reply_to_message_id === 999123, 'ADMIN-14: Roxie replies to the target reported message');

    // -------------------------------------------------------------------------
    // TEST 4: Error Handling when getChatAdministrators Fails
    // -------------------------------------------------------------------------
    sentMessages = [];
    telegramApi.getChatAdministrators = async () => ({
      ok: false,
      description: 'Chat not found or bot kicked'
    });

    await CommandHandler.handleCommand(groupCtx);
    assert(sentMessages.length === 1, 'ADMIN-15: Error response sent when getChatAdministrators fails');
    assert(
      sentMessages[0].text.includes('Failed to retrieve group administrators'),
      'ADMIN-16: Appropriate error notice sent on API failure'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Error Handling when No Mentionable Admins Remain (Only Bots)
    // -------------------------------------------------------------------------
    sentMessages = [];
    telegramApi.getChatAdministrators = async () => ({
      ok: true,
      result: [
        {
          status: 'administrator',
          user: { id: botId, is_bot: true, first_name: 'MissRoxie' } as any
        }
      ]
    });

    await CommandHandler.handleCommand(groupCtx);
    assert(sentMessages.length === 1, 'ADMIN-17: Exactly one response sent when no mentionable admins exist');
    assert(
      sentMessages[0].text.includes('No mentionable group administrators found'),
      'ADMIN-18: Appropriate notice sent when only bots are administrators'
    );

  } finally {
    telegramApi.sendMessage = origSendMessage;
    telegramApi.getChatAdministrators = origGetChatAdministrators;
    telegramApi.getMe = origGetMe;
    telegramApi.deleteMessage = origDeleteMessage;
  }

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} /ADMIN COMMAND TESTS PASSED! (0 FAILED)`);
  console.log('====================================================\n');
}

runAdminCommandTestSuite().catch(err => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
