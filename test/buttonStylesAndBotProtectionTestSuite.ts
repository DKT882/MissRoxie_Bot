process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender, sanitizeInlineButtons, isValidHttpUrl } from '../server/telegram/postSender.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { TelegramMiddleware } from '../server/telegram/middleware.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { ScheduledPostButton, PostPayload, TelegramChatMemberUpdated } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING BUTTON STYLES & BOT-ADD PROTECTION TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -100888999000;
  const testChatTitle = 'Bot & Button Protection Test Group';

  // Seed test group in DB
  db.getGroupSettings(testChatId, testChatTitle);
  db.updateGroupSettings(testChatId, {
    botLeft: false,
    unavailable: false,
    chatTitle: testChatTitle
  });

  // Track Telegram API calls
  const capturedApiMethodCalls: Array<{ method: string; args: any }> = [];
  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origSendPhoto = telegramApi.sendPhoto.bind(telegramApi);
  const origBanChatMember = telegramApi.banChatMember.bind(telegramApi);
  const origGetChatAdministrators = telegramApi.getChatAdministrators.bind(telegramApi);
  const origGetChatMember = telegramApi.getChatMember.bind(telegramApi);
  const origGetMe = telegramApi.getMe.bind(telegramApi);

  const ROXIE_BOT_ID = 8880001;
  const OWNER_USER_ID = 10001;
  const ADMIN_USER_ID = 20002;
  const MOD_USER_ID = 30003;
  const MEMBER_USER_ID = 40004;
  const SPAM_BOT_ID = 9999001;
  const SPAM_BOT_2_ID = 9999002;
  const HUMAN_USER_ID = 50005;

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: ROXIE_BOT_ID, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Roxie' }
  });

  const memberStatusMap: Record<number, any> = {
    [OWNER_USER_ID]: {
      status: 'creator',
      user: { id: OWNER_USER_ID, is_bot: false, first_name: 'GroupOwner', username: 'group_owner' }
    },
    [ADMIN_USER_ID]: {
      status: 'administrator',
      can_restrict_members: true,
      can_promote_members: true,
      user: { id: ADMIN_USER_ID, is_bot: false, first_name: 'AdminUser', username: 'admin_user' }
    },
    [MOD_USER_ID]: {
      status: 'member',
      user: { id: MOD_USER_ID, is_bot: false, first_name: 'ModUser', username: 'mod_user' }
    },
    [MEMBER_USER_ID]: {
      status: 'member',
      user: { id: MEMBER_USER_ID, is_bot: false, first_name: 'NormalMember', username: 'normal_member' }
    },
    [HUMAN_USER_ID]: {
      status: 'member',
      user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'NewHuman', username: 'new_human' }
    }
  };

  (telegramApi as any).getChatAdministrators = async (cId: number) => ({
    ok: true,
    result: [
      memberStatusMap[OWNER_USER_ID],
      memberStatusMap[ADMIN_USER_ID]
    ]
  });

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (memberStatusMap[uId]) {
      return { ok: true, result: memberStatusMap[uId] };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: `User${uId}` } } };
  };

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedApiMethodCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: 88801, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    capturedApiMethodCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    return { ok: true, result: { message_id: 88802, chat: { id: chatId }, photo: [{ file_id: photo }] } };
  };

  let banMockShouldFail = false;
  (telegramApi as any).banChatMember = async (chatId: number | string, userId: number, options?: any) => {
    capturedApiMethodCalls.push({ method: 'banChatMember', args: { chatId, userId, options } });
    if (banMockShouldFail) {
      return { ok: false, error_code: 400, description: 'Bad Request: USER_NOT_PARTICIPANT' };
    }
    return { ok: true, result: true };
  };

  TelegramMiddleware.clearMemberCache();
  ModerationService.clearRecentBotBans();

  // =================================================================
  // PART 1: POST / BUTTON STYLES & TELEGRAM COMPATIBILITY
  // =================================================================
  console.log('--- PART 1: BUTTON COLOR / STYLE TESTS ---');

  // Test 1: Default Button Style
  const defaultButtons: ScheduledPostButton[][] = [
    [{ text: 'Default Link', url: 'https://example.com/default' }]
  ];
  const sanitizedDefault = sanitizeInlineButtons(defaultButtons);
  assert(
    sanitizedDefault !== undefined && sanitizedDefault[0][0].text === 'Default Link' && sanitizedDefault[0][0].style === undefined,
    '1. Default button style works without adding unsupported fields'
  );

  // Test 2: Primary Style
  const primaryButtons: ScheduledPostButton[][] = [
    [{ text: 'Primary Button', url: 'https://example.com/primary', style: 'primary' }]
  ];
  const sanitizedPrimary = sanitizeInlineButtons(primaryButtons);
  assert(
    sanitizedPrimary !== undefined && sanitizedPrimary[0][0].style === 'primary',
    '2. Primary style is validated and preserved'
  );

  // Test 3: Success Style
  const successButtons: ScheduledPostButton[][] = [
    [{ text: 'Success Button', url: 'https://example.com/success', style: 'success' }]
  ];
  const sanitizedSuccess = sanitizeInlineButtons(successButtons);
  assert(
    sanitizedSuccess !== undefined && sanitizedSuccess[0][0].style === 'success',
    '3. Success style is validated and preserved'
  );

  // Test 4: Danger Style
  const dangerButtons: ScheduledPostButton[][] = [
    [{ text: 'Danger Button', url: 'https://example.com/danger', style: 'danger' }]
  ];
  const sanitizedDanger = sanitizeInlineButtons(dangerButtons);
  assert(
    sanitizedDanger !== undefined && sanitizedDanger[0][0].style === 'danger',
    '4. Danger style is validated and preserved'
  );

  // Test 5: Multi-row Style Grid Survives Serialization and PostSender
  const mixedGrid: ScheduledPostButton[][] = [
    [
      { text: 'Row 1 Default', url: 'https://example.com/r1c1' },
      { text: 'Row 1 Primary', url: 'https://example.com/r1c2', style: 'primary' }
    ],
    [
      { text: 'Row 2 Success', url: 'https://example.com/r2c1', style: 'success' },
      { text: 'Row 2 Danger', url: 'https://example.com/r2c2', style: 'danger' }
    ]
  ];
  capturedApiMethodCalls.length = 0;
  const postResult = await PostSender.send(testChatId, {
    contentType: 'text',
    text: 'Mixed styled buttons post',
    buttons: mixedGrid
  });
  assert(postResult.ok === true, '5a. PostSender sends post with styled buttons');
  const sendCall = capturedApiMethodCalls.find(c => c.method === 'sendMessage');
  assert(sendCall !== undefined, '5b. Dispatched via TelegramApi.sendMessage');
  const sentKeyboard = sendCall?.args?.options?.reply_markup?.inline_keyboard;
  assert(Array.isArray(sentKeyboard) && sentKeyboard.length === 2, '5c. Preserved 2 button rows');
  assert(sentKeyboard[0][0].style === undefined, '5d. Row 1 Button 1 has default style');
  assert(sentKeyboard[0][1].style === 'primary', '5e. Row 1 Button 2 has primary style');
  assert(sentKeyboard[1][0].style === 'success', '5f. Row 2 Button 1 has success style');
  assert(sentKeyboard[1][1].style === 'danger', '5g. Row 2 Button 2 has danger style');

  // Test 6: Invalid Styles Sanitized
  const invalidStyleButtons = [
    [
      { text: 'Invalid Style 1', url: 'https://example.com/bad1', style: 'neon-purple' as any },
      { text: 'Invalid Style 2', url: 'https://example.com/bad2', style: '#ff0000' as any },
      { text: 'Valid Style', url: 'https://example.com/good', style: 'success' as any }
    ]
  ];
  const sanitizedInvalid = sanitizeInlineButtons(invalidStyleButtons);
  assert(sanitizedInvalid !== undefined && sanitizedInvalid[0].length === 3, '6a. All 3 buttons retained');
  assert(sanitizedInvalid![0][0].style === undefined, '6b. Invalid style "neon-purple" stripped');
  assert(sanitizedInvalid![0][1].style === undefined, '6c. Invalid hex style "#ff0000" stripped');
  assert(sanitizedInvalid![0][2].style === 'success', '6d. Valid style "success" preserved');

  // Test 7: Backward Compatibility with Existing Buttons Without Style
  const legacyButtons = [
    [{ text: 'Legacy Button', url: 'https://example.com/legacy' }]
  ];
  const legacySanitized = sanitizeInlineButtons(legacyButtons);
  assert(
    legacySanitized !== undefined &&
    legacySanitized[0][0].text === 'Legacy Button' &&
    legacySanitized[0][0].url === 'https://example.com/legacy' &&
    !('style' in legacySanitized[0][0]),
    '7. Legacy button payloads without style remain 100% backward compatible'
  );

  // Test 8: No Unsupported Telegram Bubble/Post Color Fields
  const payloadWithClientTheme: any = {
    contentType: 'text',
    text: 'Testing no bubble color to Telegram',
    bubbleColor: '#123456',
    post_color: 'blue',
    previewTheme: 'dark',
    buttons: [
      [{ text: 'Btn', url: 'https://example.com', style: 'primary' }]
    ]
  };
  capturedApiMethodCalls.length = 0;
  await PostSender.send(testChatId, payloadWithClientTheme);
  const lastSend = capturedApiMethodCalls[capturedApiMethodCalls.length - 1];
  assert(
    lastSend.args.options.bubbleColor === undefined &&
    lastSend.args.options.post_color === undefined &&
    lastSend.args.options.previewTheme === undefined,
    '8. Post bubble color is never sent as an unsupported Telegram API field'
  );

  // =================================================================
  // PART 2: ONLY GROUP OWNER MAY ADD BOTS
  // =================================================================
  console.log('\n--- PART 2: ONLY GROUP OWNER MAY ADD BOTS TESTS ---');

  // Test 9: Owner adds bot -> Bot is ALLOWED (No ban)
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const ownerAddBotUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: OWNER_USER_ID, is_bot: false, first_name: 'GroupOwner', username: 'group_owner' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const ownerAddResult = await ModerationService.handleBotAddProtection(testChatId, ownerAddBotUpdate);
  assert(ownerAddResult.handled === true, '9a. Owner add bot handled');
  assert(ownerAddResult.allowed === true && ownerAddResult.banned === false, '9b. Owner add bot -> Allowed (banned=false)');
  const banCallsOwner = capturedApiMethodCalls.filter(c => c.method === 'banChatMember');
  assert(banCallsOwner.length === 0, '9c. No banChatMember called when owner adds bot');

  // Test 10: Normal member adds bot -> Bot is BANNED immediately
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const memberAddBotUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: MEMBER_USER_ID, is_bot: false, first_name: 'NormalMember', username: 'normal_member' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const memberAddResult = await ModerationService.handleBotAddProtection(testChatId, memberAddBotUpdate);
  assert(memberAddResult.handled === true && memberAddResult.banned === true, '10a. Normal member adds bot -> Bot is banned');
  const banCallsMember = capturedApiMethodCalls.filter(c => c.method === 'banChatMember');
  assert(banCallsMember.length === 1 && banCallsMember[0].args.userId === SPAM_BOT_ID, '10b. banChatMember called with exact bot user ID');
  const logsAfterMemberAdd = db.getAuditLogs({ chatId: testChatId });
  const botBanLog = logsAfterMemberAdd.find(l => l.targetUserId === SPAM_BOT_ID && l.action === 'auto_ban');
  assert(botBanLog !== undefined, '10c. Moderation action logged to audit system with auto_ban action');

  // Test 11: Admin adds bot -> Bot is BANNED (Only creator/owner is exempt)
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const adminAddBotUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: ADMIN_USER_ID, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_2_ID, is_bot: true, first_name: 'SpamBot2', username: 'spam_bot_2' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_2_ID, is_bot: true, first_name: 'SpamBot2', username: 'spam_bot_2' } }
  };
  const adminAddResult = await ModerationService.handleBotAddProtection(testChatId, adminAddBotUpdate);
  assert(adminAddResult.handled === true && adminAddResult.banned === true, '11a. Admin adds bot -> Bot is banned immediately');
  const banCallsAdmin = capturedApiMethodCalls.filter(c => c.method === 'banChatMember');
  assert(banCallsAdmin.length === 1 && banCallsAdmin[0].args.userId === SPAM_BOT_2_ID, '11b. Administrator is not treated as owner');

  // Test 12: Moderator / Custom Role adds bot -> Bot is BANNED
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const modAddBotUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: MOD_USER_ID, is_bot: false, first_name: 'ModUser', username: 'mod_user' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const modAddResult = await ModerationService.handleBotAddProtection(testChatId, modAddBotUpdate);
  assert(modAddResult.handled === true && modAddResult.banned === true, '12. Moderator / custom-role adds bot -> Bot is banned');

  // Test 13: Human user joins -> No bot-ban action
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const humanJoinUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'NewHuman', username: 'new_human' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'NewHuman', username: 'new_human' } },
    new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'NewHuman', username: 'new_human' } }
  };
  const humanJoinResult = await ModerationService.handleBotAddProtection(testChatId, humanJoinUpdate);
  assert(humanJoinResult.handled === false, '13a. Human user joins -> handleBotAddProtection returns handled=false');
  assert(capturedApiMethodCalls.filter(c => c.method === 'banChatMember').length === 0, '13b. No ban executed for human user');

  // Test 14: Existing Bot Membership Update (already in chat, e.g. member -> admin promotion) -> No ban
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const existingBotPromotionUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: ADMIN_USER_ID, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'administrator', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const existingBotResult = await ModerationService.handleBotAddProtection(testChatId, existingBotPromotionUpdate);
  assert(existingBotResult.handled === false, '14. Existing bot status change (member -> admin) does not trigger bot-add ban');

  // Test 15: Bot leaves group -> No ban action
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const botLeaveUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const botLeaveResult = await ModerationService.handleBotAddProtection(testChatId, botLeaveUpdate);
  assert(botLeaveResult.handled === false, '15. Bot leaves group -> No ban action triggered');

  // Test 16: Bot is removed/kicked -> No duplicate ban action
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const botRemovedUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: ADMIN_USER_ID, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'kicked', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const botRemovedResult = await ModerationService.handleBotAddProtection(testChatId, botRemovedUpdate);
  assert(botRemovedResult.handled === false, '16. Bot removed update -> No duplicate ban');

  // Test 17: Roxie itself is added -> Never bans itself
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const roxieAddUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: MEMBER_USER_ID, is_bot: false, first_name: 'NormalMember', username: 'normal_member' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: ROXIE_BOT_ID, is_bot: true, first_name: 'Roxie', username: 'MissRoxie_Bot' } },
    new_chat_member: { status: 'administrator', user: { id: ROXIE_BOT_ID, is_bot: true, first_name: 'Roxie', username: 'MissRoxie_Bot' } }
  };
  const roxieResult = await ModerationService.handleBotAddProtection(testChatId, roxieAddUpdate);
  assert(roxieResult.handled === false, '17a. Roxie itself -> Never bans itself');
  assert(capturedApiMethodCalls.filter(c => c.method === 'banChatMember').length === 0, '17b. No ban called on Roxie');

  // Test 18: Missing or Ambiguous Actor -> Safe handling, do not assume owner, ban the bot
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const ambiguousActorUpdate: any = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const ambiguousResult = await ModerationService.handleBotAddProtection(testChatId, ambiguousActorUpdate);
  assert(ambiguousResult.handled === true && ambiguousResult.banned === true, '18. Missing actor -> Safe handling, bans bot without assuming owner');

  // Test 19: Telegram Ban Failure Handled Safely without Crashing
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  banMockShouldFail = true;
  const failUpdate: TelegramChatMemberUpdated = {
    chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
    from: { id: MEMBER_USER_ID, is_bot: false, first_name: 'NormalMember', username: 'normal_member' },
    date: Math.floor(Date.now() / 1000),
    old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } },
    new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' } }
  };
  const failResult = await ModerationService.handleBotAddProtection(testChatId, failUpdate);
  assert(failResult.handled === true && failResult.banned === false && failResult.error !== undefined, '19. Telegram ban API failure handled gracefully without crashing');
  banMockShouldFail = false;

  // Test 20: Duplicate Membership Updates Deduplication (Idempotency Guard)
  ModerationService.clearRecentBotBans();
  capturedApiMethodCalls.length = 0;
  const firstRes = await ModerationService.handleBotAddProtection(testChatId, memberAddBotUpdate);
  const secondRes = await ModerationService.handleBotAddProtection(testChatId, memberAddBotUpdate);
  assert(firstRes.banned === true, '20a. First membership update bans the bot');
  assert(secondRes.handled === true && secondRes.banned === true, '20b. Second duplicate update caught by idempotency cache');
  const totalBans = capturedApiMethodCalls.filter(c => c.method === 'banChatMember').length;
  assert(totalBans === 1, '20c. Exactly 1 banChatMember call issued for duplicate updates');

  // Clean up mocks
  telegramApi.sendMessage = origSendMessage;
  telegramApi.sendPhoto = origSendPhoto;
  telegramApi.banChatMember = origBanChatMember;
  telegramApi.getChatAdministrators = origGetChatAdministrators;
  telegramApi.getChatMember = origGetChatMember;
  telegramApi.getMe = origGetMe;

  console.log('\n================================================================');
  console.log(`🎉 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
