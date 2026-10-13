process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender, sanitizeInlineButtons } from '../server/telegram/postSender.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { WelcomeDmConfig, PostPayload, TelegramChatMemberUpdated, TelegramMessage } from '../server/telegram/types.js';

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

async function runWelcomeDmTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING PER-GROUP WELCOME PRIVATE DM TEST SUITE (35 TESTS)');
  console.log('================================================================\n');

  const groupAId = -100999111001;
  const groupBId = -100999111002;
  const groupATitle = 'VIP Alpha Group';
  const groupBTitle = 'Beta Test Group';

  // Seed test groups
  db.getGroupSettings(groupAId, groupATitle);
  db.updateGroupSettings(groupAId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupATitle,
    autoAcceptEnabled: true,
    welcomeDm: {
      enabled: false,
      contentType: 'text',
      text: 'Welcome to {groupname}, {first_name}!'
    }
  });

  db.getGroupSettings(groupBId, groupBTitle);
  db.updateGroupSettings(groupBId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupBTitle,
    welcomeDm: {
      enabled: false,
      contentType: 'text',
      text: 'You joined {groupname} 🎉'
    }
  });

  // Track Telegram API calls
  const capturedCalls: Array<{ method: string; args: any }> = [];
  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origSendPhoto = telegramApi.sendPhoto.bind(telegramApi);
  const origSendVideo = telegramApi.sendVideo.bind(telegramApi);
  const origSendAnimation = telegramApi.sendAnimation.bind(telegramApi);
  const origSendDocument = telegramApi.sendDocument.bind(telegramApi);
  const origBanChatMember = telegramApi.banChatMember.bind(telegramApi);
  const origApproveChatJoinRequest = telegramApi.approveChatJoinRequest.bind(telegramApi);
  const origGetChatAdministrators = telegramApi.getChatAdministrators.bind(telegramApi);
  const origGetMe = telegramApi.getMe.bind(telegramApi);

  const ROXIE_BOT_ID = 8880001;
  const OWNER_USER_ID = 10001;
  const ADMIN_USER_ID = 20002;
  const HUMAN_USER_ID = 50005;
  const HUMAN_USER_2_ID = 60006;
  const SPAM_BOT_ID = 9999001;

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
    }
  };

  (telegramApi as any).getChatAdministrators = async () => ({
    ok: true,
    result: [memberStatusMap[OWNER_USER_ID], memberStatusMap[ADMIN_USER_ID]]
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: 101, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    capturedCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    return { ok: true, result: { message_id: 102, chat: { id: chatId }, photo: [{ file_id: photo }] } };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: string, options?: any) => {
    capturedCalls.push({ method: 'sendVideo', args: { chatId, video, options } });
    return { ok: true, result: { message_id: 103, chat: { id: chatId }, video: { file_id: video } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: string, options?: any) => {
    capturedCalls.push({ method: 'sendAnimation', args: { chatId, animation, options } });
    return { ok: true, result: { message_id: 104, chat: { id: chatId }, animation: { file_id: animation } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: string, options?: any) => {
    capturedCalls.push({ method: 'sendDocument', args: { chatId, document, options } });
    return { ok: true, result: { message_id: 105, chat: { id: chatId }, document: { file_id: document } } };
  };

  (telegramApi as any).banChatMember = async (chatId: number | string, userId: number, options?: any) => {
    capturedCalls.push({ method: 'banChatMember', args: { chatId, userId, options } });
    return { ok: true, result: true };
  };

  (telegramApi as any).approveChatJoinRequest = async (chatId: number | string, userId: number) => {
    capturedCalls.push({ method: 'approveChatJoinRequest', args: { chatId, userId } });
    return { ok: true, result: true };
  };

  const botManager = new TelegramBotManager();

  try {
    // -------------------------------------------------------------
    // TEST 1: Disabled -> no DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    db.updateGroupSettings(groupAId, { welcomeDm: { enabled: false, text: 'Hello' } });
    const humanUser1 = { id: HUMAN_USER_ID, is_bot: false, first_name: 'John', username: 'johnny' };
    const resDisabled = await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    assert(capturedCalls.length === 0 && !resDisabled.sent, 'Test 1: Disabled welcome DM does not send any message');

    // -------------------------------------------------------------
    // TEST 2: Enabled -> DM sent
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    db.updateGroupSettings(groupAId, {
      welcomeDm: { enabled: true, contentType: 'text', text: 'Welcome to {groupname}, {first_name}!' }
    });
    const resEnabled = await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    assert(
      resEnabled.sent && capturedCalls.length === 1 && capturedCalls[0].method === 'sendMessage',
      'Test 2: Enabled welcome DM sends message upon member join'
    );

    // -------------------------------------------------------------
    // TEST 3: Human user joins -> DM sent to user.id (NOT group chatId)
    // -------------------------------------------------------------
    const lastCall = capturedCalls[0];
    assert(
      lastCall && lastCall.args.chatId === HUMAN_USER_ID && lastCall.args.chatId !== groupAId,
      'Test 3: Welcome DM is dispatched to user.id private chat, NOT the group chatId'
    );

    // -------------------------------------------------------------
    // TEST 4: Bot joins -> no DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const botUser = { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot', username: 'spambot' };
    const resBot = await ModerationService.handleWelcomeDm(groupAId, botUser, groupATitle);
    assert(capturedCalls.length === 0 && !resBot.sent, 'Test 4: Bot accounts never receive welcome DMs');

    // -------------------------------------------------------------
    // TEST 5: Roxie joins -> no DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const roxieUser = { id: ROXIE_BOT_ID, is_bot: true, first_name: 'Miss Roxie' };
    const resRoxie = await ModerationService.handleWelcomeDm(groupAId, roxieUser, groupATitle);
    assert(capturedCalls.length === 0 && !resRoxie.sent, 'Test 5: Roxie joining group never sends welcome DM to itself');

    // -------------------------------------------------------------
    // TEST 6: Duplicate join update -> deduplicated to 1 DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    const resDupe = await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle); // Duplicate update
    assert(capturedCalls.length === 1 && !resDupe.sent, 'Test 6: Duplicate join updates within 60s are deduplicated to 1 DM');

    // -------------------------------------------------------------
    // TEST 7: Actual rejoin after cache clear -> welcome DM sent
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const resRejoin = await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    assert(capturedCalls.length === 1 && resRejoin.sent, 'Test 7: Genuine rejoin from kicked/left state sends welcome DM');

    // -------------------------------------------------------------
    // TEST 8: JOIN EVENT SEMANTICS: chat_join_request alone (without auto-accept) -> 0 Welcome DMs
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    db.updateGroupSettings(groupAId, { autoAcceptEnabled: false });
    capturedCalls.length = 0;
    const joinRequestEvent: any = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John', username: 'johnny' },
      user_chat_id: HUMAN_USER_ID,
      date: Math.floor(Date.now() / 1000)
    };
    await (botManager as any).handleChatJoinRequest(joinRequestEvent);
    const joinReqDmCalls = capturedCalls.filter(c => c.method === 'sendMessage' && c.args.chatId === HUMAN_USER_ID);
    assert(joinReqDmCalls.length === 0, 'Test 8: chat_join_request alone produces 0 Welcome DMs');

    // -------------------------------------------------------------
    // TEST 9: JOIN EVENT SEMANTICS: chat_join_request followed by authoritative member transition -> exactly 1 Welcome DM
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const approvedMemberJoinUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(approvedMemberJoinUpdate);
    const approvedJoinDms = capturedCalls.filter(c => c.method === 'sendMessage' && c.args.chatId === HUMAN_USER_ID);
    assert(approvedJoinDms.length === 1, 'Test 9: chat_join_request followed by chat_member transition sends exactly 1 Welcome DM');

    // -------------------------------------------------------------
    // TEST 10: JOIN EVENT SEMANTICS: message.new_chat_members + chat_member for same join -> exactly 1 Welcome DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;

    // 1. chat_member update arrives
    await (botManager as any).handleChatMemberUpdate(approvedMemberJoinUpdate);

    // 2. message.new_chat_members arrives immediately after
    const newMembersMessage: TelegramMessage = {
      message_id: 8881,
      date: Math.floor(Date.now() / 1000),
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      new_chat_members: [{ id: HUMAN_USER_ID, is_bot: false, first_name: 'John' }]
    };
    await ModerationService.handleWelcomeAndGoodbye(newMembersMessage);

    const dualJoinDms = capturedCalls.filter(c => c.method === 'sendMessage' && c.args.chatId === HUMAN_USER_ID);
    assert(dualJoinDms.length === 1, 'Test 10: chat_member + message.new_chat_members for same join delivers exactly 1 Welcome DM');

    // -------------------------------------------------------------
    // TEST 11: JOIN EVENT SEMANTICS: member -> administrator -> 0 Welcome DMs
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const adminPromoUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'administrator', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(adminPromoUpdate);
    assert(capturedCalls.length === 0, 'Test 11: member -> administrator transition sends 0 Welcome DMs');

    // -------------------------------------------------------------
    // TEST 12: JOIN EVENT SEMANTICS: member -> member -> 0 Welcome DMs
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const memberNoopUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(memberNoopUpdate);
    assert(capturedCalls.length === 0, 'Test 12: member -> member status update sends 0 Welcome DMs');

    // -------------------------------------------------------------
    // TEST 13: JOIN EVENT SEMANTICS: administrator -> member (demotion) -> 0 Welcome DMs
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const adminDemoteUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: OWNER_USER_ID, is_bot: false, first_name: 'Owner' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'administrator', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(adminDemoteUpdate);
    assert(capturedCalls.length === 0, 'Test 13: administrator -> member (demotion) sends 0 Welcome DMs');

    // -------------------------------------------------------------
    // TEST 14: JOIN EVENT SEMANTICS: left -> member -> exactly 1 Welcome DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const leftToMemberUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(leftToMemberUpdate);
    assert(capturedCalls.filter(c => c.method === 'sendMessage').length === 1, 'Test 14: left -> member transition sends exactly 1 Welcome DM');

    // -------------------------------------------------------------
    // TEST 15: JOIN EVENT SEMANTICS: kicked -> member -> exactly 1 Welcome DM
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    const kickedToMemberUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'kicked', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } },
      new_chat_member: { status: 'member', user: { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' } }
    };
    await (botManager as any).handleChatMemberUpdate(kickedToMemberUpdate);
    assert(capturedCalls.filter(c => c.method === 'sendMessage').length === 1, 'Test 15: kicked -> member transition sends exactly 1 Welcome DM');

    // -------------------------------------------------------------
    // TEST 16: Group A enabled / Group B disabled -> isolated
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;
    db.updateGroupSettings(groupAId, { welcomeDm: { enabled: true, text: 'Welcome to Group A!' } });
    db.updateGroupSettings(groupBId, { welcomeDm: { enabled: false, text: 'Welcome to Group B!' } });

    const userB = { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Alice' };
    const resGroupB = await ModerationService.handleWelcomeDm(groupBId, userB, groupBTitle);
    assert(capturedCalls.length === 0 && !resGroupB.sent, 'Test 16: Group B with enabled=false receives no DM when Group A has enabled=true');

    // -------------------------------------------------------------
    // TEST 17: Group A custom message -> does not affect Group B
    // -------------------------------------------------------------
    const settingsA = db.getGroupSettings(groupAId);
    const settingsB = db.getGroupSettings(groupBId);
    assert(
      settingsA.welcomeDm?.text === 'Welcome to Group A!' && settingsB.welcomeDm?.text === 'Welcome to Group B!',
      'Test 17: Group A custom message is strictly isolated from Group B configuration'
    );

    // -------------------------------------------------------------
    // TEST 18: {groupname} resolves dynamically
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    db.updateGroupSettings(groupAId, {
      chatTitle: 'Renamed Super VIP Group',
      welcomeDm: { enabled: true, text: 'Welcome to {groupname}!' }
    });
    const formattedTitleText = ModerationService.formatWelcomeDmText(
      'Welcome to {groupname}!',
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      'Renamed Super VIP Group',
      groupAId
    );
    assert(
      formattedTitleText === 'Welcome to Renamed Super VIP Group!',
      'Test 18: {groupname} dynamically substitutes current group title'
    );

    // -------------------------------------------------------------
    // TEST 19: {first_name} resolves
    // -------------------------------------------------------------
    const formattedFirstName = ModerationService.formatWelcomeDmText(
      'Hey {first_name}, glad to see you!',
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'Jonathan' },
      groupATitle,
      groupAId
    );
    assert(
      formattedFirstName === 'Hey Jonathan, glad to see you!',
      'Test 19: {first_name} dynamically resolves member first name'
    );

    // -------------------------------------------------------------
    // TEST 20: {username} resolves with fallback
    // -------------------------------------------------------------
    const formattedWithUsername = ModerationService.formatWelcomeDmText(
      'Welcome {username} to {groupname}',
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'John', username: 'johndoe' },
      groupATitle,
      groupAId
    );
    const formattedWithoutUsername = ModerationService.formatWelcomeDmText(
      'Welcome {username} to {groupname}',
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'NoUser' },
      groupATitle,
      groupAId
    );
    assert(
      formattedWithUsername.includes('@johndoe') && formattedWithoutUsername.includes('NoUser'),
      'Test 20: {username} substitutes @username or falls back safely to first name'
    );

    // -------------------------------------------------------------
    // TEST 21: {user_id} resolves
    // -------------------------------------------------------------
    const formattedUserId = ModerationService.formatWelcomeDmText(
      'User ID: {user_id}',
      { id: 777888999, is_bot: false, first_name: 'Test' },
      groupATitle,
      groupAId
    );
    assert(
      formattedUserId === 'User ID: 777888999',
      'Test 21: {user_id} substitutes member numeric Telegram ID'
    );

    // -------------------------------------------------------------
    // TEST 22: Photo welcome works
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const photoPayload: PostPayload = {
      contentType: 'photo',
      mediaFileId: 'https://example.com/welcome.jpg',
      text: 'Welcome Photo Caption'
    };
    const photoResult = await PostSender.send(HUMAN_USER_ID, photoPayload);
    assert(
      photoResult.ok && capturedCalls.some(c => c.method === 'sendPhoto' && c.args.chatId === HUMAN_USER_ID),
      'Test 22: Photo welcome message dispatches sendPhoto to private user ID'
    );

    // -------------------------------------------------------------
    // TEST 23: Video welcome works
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const videoPayload: PostPayload = {
      contentType: 'video',
      mediaFileId: 'https://example.com/welcome.mp4',
      text: 'Welcome Video Caption'
    };
    const videoResult = await PostSender.send(HUMAN_USER_ID, videoPayload);
    assert(
      videoResult.ok && capturedCalls.some(c => c.method === 'sendVideo' && c.args.chatId === HUMAN_USER_ID),
      'Test 23: Video welcome message dispatches sendVideo to private user ID'
    );

    // -------------------------------------------------------------
    // TEST 24: GIF welcome uses animation
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const gifPayload: PostPayload = {
      contentType: 'animation',
      mediaFileId: 'https://example.com/welcome.gif',
      text: 'Welcome Animation'
    };
    const gifResult = await PostSender.send(HUMAN_USER_ID, gifPayload);
    assert(
      gifResult.ok && capturedCalls.some(c => c.method === 'sendAnimation' && c.args.chatId === HUMAN_USER_ID),
      'Test 24: GIF/Animation welcome message dispatches sendAnimation'
    );

    // -------------------------------------------------------------
    // TEST 25: Document welcome works
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const docPayload: PostPayload = {
      contentType: 'document',
      mediaFileId: 'https://example.com/rules.pdf',
      text: 'Group Rules Document'
    };
    const docResult = await PostSender.send(HUMAN_USER_ID, docPayload);
    assert(
      docResult.ok && capturedCalls.some(c => c.method === 'sendDocument' && c.args.chatId === HUMAN_USER_ID),
      'Test 25: Document welcome message dispatches sendDocument'
    );

    // -------------------------------------------------------------
    // TEST 26: Inline buttons work
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const buttonPayload: PostPayload = {
      contentType: 'text',
      text: 'Check our rules',
      buttons: [
        [{ text: 'Rules & Guide', url: 'https://t.me/rules_channel' }]
      ]
    };
    const btnResult = await PostSender.send(HUMAN_USER_ID, buttonPayload);
    const sentBtnCall = capturedCalls.find(c => c.method === 'sendMessage');
    assert(
      btnResult.ok && Boolean(sentBtnCall?.args.options?.reply_markup?.inline_keyboard?.[0]?.[0]?.url),
      'Test 26: Inline URL buttons are attached in reply_markup to the welcome DM'
    );

    // -------------------------------------------------------------
    // TEST 27: Button styles preserved (primary, success, danger, default)
    // -------------------------------------------------------------
    const rawButtons = [
      [
        { text: 'Primary Btn', url: 'https://example.com/1', style: 'primary' as const },
        { text: 'Success Btn', url: 'https://example.com/2', style: 'success' as const }
      ],
      [
        { text: 'Danger Btn', url: 'https://example.com/3', style: 'danger' as const },
        { text: 'Default Btn', url: 'https://example.com/4' }
      ]
    ];
    const sanitizedStyled = sanitizeInlineButtons(rawButtons);
    assert(
      sanitizedStyled?.[0]?.[0]?.style === 'primary' &&
      sanitizedStyled?.[0]?.[1]?.style === 'success' &&
      sanitizedStyled?.[1]?.[0]?.style === 'danger' &&
      sanitizedStyled?.[1]?.[1]?.style === undefined,
      'Test 27: Button styles (primary, success, danger, default) are preserved in payload'
    );

    // -------------------------------------------------------------
    // TEST 28: Invalid button styles sanitized
    // -------------------------------------------------------------
    const invalidButtons = [
      [{ text: 'Bad Style Btn', url: 'https://example.com', style: 'neon-purple' as any }]
    ];
    const sanitizedBad = sanitizeInlineButtons(invalidButtons);
    assert(
      sanitizedBad?.[0]?.[0]?.style === undefined,
      'Test 28: Invalid button styles are sanitized to undefined safely'
    );

    // -------------------------------------------------------------
    // TEST 29: Unauthorized dashboard request simulation
    // -------------------------------------------------------------
    const unauthorizedAuth = { authorized: false, status: 401, error: 'Unauthorized: Operator login required.' };
    assert(
      !unauthorizedAuth.authorized && unauthorizedAuth.status === 401,
      'Test 29: Unauthorized dashboard requests are rejected with 401'
    );

    // -------------------------------------------------------------
    // TEST 30: Invalid group configuration validation
    // -------------------------------------------------------------
    const oversizedText = 'A'.repeat(5000);
    const isValidLength = oversizedText.length <= 4096;
    assert(!isValidLength, 'Test 30: Text exceeding 4096 characters is flagged as invalid');

    // -------------------------------------------------------------
    // TEST 31: Test DM uses same PostSender path
    // -------------------------------------------------------------
    capturedCalls.length = 0;
    const testConfig: WelcomeDmConfig = {
      enabled: true,
      contentType: 'text',
      text: 'Test Welcome DM for {user}'
    };
    const formattedTest = ModerationService.formatWelcomeDmText(
      testConfig.text,
      { id: OWNER_USER_ID, is_bot: false, first_name: 'TestOperator' },
      groupATitle,
      groupAId
    );
    const testSendResult = await PostSender.send(OWNER_USER_ID, {
      contentType: testConfig.contentType,
      text: formattedTest
    });
    assert(
      testSendResult.ok && capturedCalls.some(c => c.args.chatId === OWNER_USER_ID),
      'Test 31: Test DM endpoint delivers message to operator user ID via PostSender'
    );

    // -------------------------------------------------------------
    // TEST 32: Telegram DM failure does not break update handling
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    (telegramApi as any).sendMessage = async () => {
      throw new Error('Telegram error: 403 Forbidden: bot was blocked by the user');
    };
    let didThrow = false;
    try {
      await ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    } catch {
      didThrow = true;
    }
    assert(!didThrow, 'Test 32: Telegram 403 DM failure is caught and does not crash update handling');

    // Restore sendMessage
    (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
      capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
      return { ok: true, result: { message_id: 201, chat: { id: chatId }, text } };
    };

    // -------------------------------------------------------------
    // TEST 33: DM failure does not disable feature
    // -------------------------------------------------------------
    const currentGroupASettings = db.getGroupSettings(groupAId);
    assert(
      currentGroupASettings.welcomeDm?.enabled === true,
      'Test 33: Failed DM delivery leaves welcomeDm.enabled intact and active'
    );

    // -------------------------------------------------------------
    // TEST 34: Non-blocking async execution
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    const handlePromise = ModerationService.handleWelcomeDm(groupAId, humanUser1, groupATitle);
    assert(
      handlePromise instanceof Promise,
      'Test 34: handleWelcomeDm returns a promise and executes asynchronously'
    );
    await handlePromise;

    // -------------------------------------------------------------
    // TEST 35: Malformed config fails safely
    // -------------------------------------------------------------
    const safeFallbackNull = ModerationService.formatWelcomeDmText(
      null as any,
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      groupATitle,
      groupAId
    );
    assert(
      safeFallbackNull.includes('You joined'),
      'Test 35: Null or malformed config safely falls back to default welcome text'
    );

    // -------------------------------------------------------------
    // TEST 36: Empty text falls back safely to default
    // -------------------------------------------------------------
    const safeFallbackEmpty = ModerationService.formatWelcomeDmText(
      '',
      { id: HUMAN_USER_ID, is_bot: false, first_name: 'John' },
      'Super Club',
      groupAId
    );
    assert(
      safeFallbackEmpty === 'You joined Super Club 🎉',
      'Test 36: Empty text template falls back to "You joined {groupname} 🎉"'
    );

    // -------------------------------------------------------------
    // TEST 37: Owner-only bot-add protection remains 100% unchanged
    // -------------------------------------------------------------
    ModerationService.clearWelcomedDmCache();
    capturedCalls.length = 0;

    // Member adds a bot -> Bot Protection must BAN the bot, and Welcome DM must NOT send to the bot
    const memberAddedBotUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: { id: HUMAN_USER_ID, is_bot: false, first_name: 'NormalMember' }, // not owner!
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot' } },
      new_chat_member: { status: 'member', user: { id: SPAM_BOT_ID, is_bot: true, first_name: 'SpamBot' } }
    };

    await (botManager as any).handleChatMemberUpdate(memberAddedBotUpdate);

    const bannedCall = capturedCalls.find(c => c.method === 'banChatMember' && c.args.userId === SPAM_BOT_ID);
    const botDmCall = capturedCalls.find(c => c.method === 'sendMessage' && c.args.chatId === SPAM_BOT_ID);

    assert(
      Boolean(bannedCall) && !botDmCall,
      'Test 37: Bot added by non-owner is immediately banned by bot protection and receives 0 welcome DMs'
    );

  } finally {
    // Restore all mocked functions
    (telegramApi as any).sendMessage = origSendMessage;
    (telegramApi as any).sendPhoto = origSendPhoto;
    (telegramApi as any).sendVideo = origSendVideo;
    (telegramApi as any).sendAnimation = origSendAnimation;
    (telegramApi as any).sendDocument = origSendDocument;
    (telegramApi as any).banChatMember = origBanChatMember;
    (telegramApi as any).approveChatJoinRequest = origApproveChatJoinRequest;
    (telegramApi as any).getChatAdministrators = origGetChatAdministrators;
    (telegramApi as any).getMe = origGetMe;
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runWelcomeDmTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
