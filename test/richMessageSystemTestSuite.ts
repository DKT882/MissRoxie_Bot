process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender, sanitizeInlineButtons, validateMediaReference } from '../server/telegram/postSender.js';
import { ModerationService, clearWelcomeAndGoodbyeCaches, formatRichMessageText, formatRichMessageButtons } from '../server/telegram/moderation.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { RichMessageConfig, PostPayload, TelegramChatMemberUpdated, TelegramMessage, TelegramUser, TelegramChat } from '../server/telegram/types.js';

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

async function runRichMessageSystemTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING REUSABLE RICH MESSAGE SYSTEM TEST SUITE (35+ TESTS)');
  console.log('================================================================\n');

  const groupAId = -100888111001;
  const groupBId = -100888111002;
  const groupATitle = 'Alpha Mega Chat';
  const groupBTitle = 'Beta Prime Lounge';

  // Seed test groups
  db.getGroupSettings(groupAId, groupATitle);
  db.updateGroupSettings(groupAId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupATitle,
    groupWelcome: {
      enabled: true,
      mode: 'rich',
      contentType: 'text',
      text: '👋 Welcome {user} to {groupname}!',
      buttons: [[{ text: 'Rules', url: 'https://t.me/rules', style: 'primary' }]]
    },
    groupGoodbye: {
      enabled: true,
      mode: 'simple',
      contentType: 'text',
      text: '👋 Farewell {name}, we will miss you!'
    },
    welcomeDm: {
      enabled: true,
      mode: 'rich',
      contentType: 'text',
      text: 'You joined {groupname} 🎉',
      buttons: [[{ text: 'Join VIP', url: 'https://t.me/vip', style: 'success' }]]
    }
  });

  db.getGroupSettings(groupBId, groupBTitle);
  db.updateGroupSettings(groupBId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupBTitle,
    groupWelcome: {
      enabled: false,
      mode: 'simple',
      contentType: 'text',
      text: 'Welcome {user} to {groupname}!'
    },
    groupGoodbye: {
      enabled: false,
      mode: 'simple',
      contentType: 'text',
      text: 'Goodbye {user}!'
    },
    welcomeDm: {
      enabled: false,
      mode: 'simple',
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
  const origGetChatAdministrators = telegramApi.getChatAdministrators.bind(telegramApi);
  const origGetMe = telegramApi.getMe.bind(telegramApi);

  const ROXIE_BOT_ID = 8880001;
  const HUMAN_USER_ID = 50005;
  const HUMAN_USER_2_ID = 60006;
  const SPAM_BOT_ID = 9999001;

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: ROXIE_BOT_ID, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Roxie' }
  });

  (telegramApi as any).getChatAdministrators = async () => ({
    ok: true,
    result: [{ status: 'creator', user: { id: 10001, is_bot: false, first_name: 'Owner', username: 'owner' } }]
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: Number(chatId) } } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    capturedCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: Number(chatId) } } };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: string, options?: any) => {
    capturedCalls.push({ method: 'sendVideo', args: { chatId, video, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: Number(chatId) } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: string, options?: any) => {
    capturedCalls.push({ method: 'sendAnimation', args: { chatId, animation, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: Number(chatId) } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: string, options?: any) => {
    capturedCalls.push({ method: 'sendDocument', args: { chatId, document, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: Number(chatId) } } };
  };

  try {
    // =========================================================================
    // SECTION 1: STORAGE & BACKWARD COMPATIBILITY
    // =========================================================================
    console.log('--- SECTION 1: STORAGE & BACKWARD COMPATIBILITY ---');

    const sA = db.getGroupSettings(groupAId);
    assert(sA.groupWelcome !== undefined && sA.groupWelcome.enabled === true, 'TEST 1: Storage maintains groupWelcome config');
    assert(sA.groupGoodbye !== undefined && sA.groupGoodbye.enabled === true, 'TEST 2: Storage maintains groupGoodbye config');
    assert(sA.welcomeDm !== undefined && sA.welcomeDm.enabled === true, 'TEST 3: Storage maintains welcomeDm config');
    assert(sA.welcomeEnabled === true, 'TEST 4: groupWelcome.enabled syncs to legacy welcomeEnabled');
    assert(sA.goodbyeEnabled === true, 'TEST 5: groupGoodbye.enabled syncs to legacy goodbyeEnabled');

    // Test legacy update synchronization
    db.updateGroupSettings(groupAId, {
      welcomeEnabled: false,
      welcomeMessage: 'Legacy Welcome {user}'
    });
    const sAUpdated = db.getGroupSettings(groupAId);
    assert(sAUpdated.groupWelcome?.enabled === false, 'TEST 6: Legacy welcomeEnabled update synchronizes to groupWelcome.enabled');
    assert(sAUpdated.groupWelcome?.text === 'Legacy Welcome {user}', 'TEST 7: Legacy welcomeMessage update synchronizes to groupWelcome.text');

    db.updateGroupSettings(groupAId, {
      goodbyeEnabled: false,
      goodbyeMessage: 'Legacy Goodbye {user}'
    });
    const sAGoodbyeUpdated = db.getGroupSettings(groupAId);
    assert(sAGoodbyeUpdated.groupGoodbye?.enabled === false, 'TEST 8: Legacy goodbyeEnabled update synchronizes to groupGoodbye.enabled');
    assert(sAGoodbyeUpdated.groupGoodbye?.text === 'Legacy Goodbye {user}', 'TEST 9: Legacy goodbyeMessage update synchronizes to groupGoodbye.text');

    // Restore groupA settings for dispatch tests
    db.updateGroupSettings(groupAId, {
      groupWelcome: {
        enabled: true,
        mode: 'rich',
        contentType: 'text',
        text: '👋 Welcome {user} to {groupname}!',
        buttons: [[{ text: 'Rules', url: 'https://t.me/rules', style: 'primary' }]]
      },
      groupGoodbye: {
        enabled: true,
        mode: 'simple',
        contentType: 'text',
        text: '👋 Farewell {name}, we will miss you!'
      },
      welcomeDm: {
        enabled: true,
        mode: 'rich',
        contentType: 'text',
        text: 'You joined {groupname} 🎉',
        buttons: [[{ text: 'Join VIP', url: 'https://t.me/vip', style: 'success' }]]
      }
    });

    // =========================================================================
    // SECTION 2: DYNAMIC PLACEHOLDERS & BUTTON FORMATTING
    // =========================================================================
    console.log('\n--- SECTION 2: DYNAMIC PLACEHOLDERS & BUTTON FORMATTING ---');

    const sampleUser: TelegramUser = {
      id: 777123,
      is_bot: false,
      first_name: 'John',
      last_name: 'Doe',
      username: 'johndoe'
    };

    const templateText = 'Hi {first_name} {last_name} ({user}) @{username} [id:{user_id}] from {groupname} [{group_id}] {mention}';
    const formattedText = formatRichMessageText(templateText, sampleUser, groupATitle, groupAId);

    assert(formattedText.includes('John Doe'), 'TEST 10: {first_name} and {last_name} format correctly');
    assert(formattedText.includes('Alpha Mega Chat'), 'TEST 11: {groupname} formats correctly');
    assert(formattedText.includes('777123'), 'TEST 12: {user_id} formats correctly');
    assert(formattedText.includes(String(groupAId)), 'TEST 13: {group_id} formats correctly');
    assert(formattedText.includes('@johndoe'), 'TEST 14: @{username} formats correctly');
    assert(formattedText.includes('tg://user?id=777123'), 'TEST 15: {mention} produces Telegram link');

    const sampleButtons = [[
      { text: 'Welcome {user}', url: 'https://t.me/channel?user={user_id}', style: 'primary' as const }
    ]];
    const formattedButtons = formatRichMessageButtons(sampleButtons, sampleUser, groupATitle, groupAId);
    assert(formattedButtons[0][0].text === 'Welcome John Doe', 'TEST 16: Button text placeholder substitution works');
    assert(formattedButtons[0][0].url === 'https://t.me/channel?user=777123', 'TEST 17: Button URL placeholder substitution works');
    assert(formattedButtons[0][0].style === 'primary', 'TEST 18: Button style is preserved');

    // =========================================================================
    // SECTION 3: IN-GROUP WELCOME DELIVERY
    // =========================================================================
    console.log('\n--- SECTION 3: IN-GROUP WELCOME DELIVERY ---');

    clearWelcomeAndGoodbyeCaches();
    capturedCalls.length = 0;

    await ModerationService.sendWelcome(groupAId, sampleUser);
    assert(capturedCalls.length === 1, 'TEST 19: sendWelcome dispatches exactly one call');
    assert(capturedCalls[0].args.chatId === groupAId, 'TEST 20: sendWelcome dispatches to in-group chatId (negative)');
    assert(capturedCalls[0].args.text.includes('Welcome John Doe to Alpha Mega Chat'), 'TEST 21: sendWelcome contains formatted in-group text');
    assert(capturedCalls[0].args.options?.reply_markup?.inline_keyboard?.length === 1, 'TEST 22: sendWelcome includes inline button row');

    // In-flight / deduplication test for group welcome
    capturedCalls.length = 0;
    await ModerationService.sendWelcome(groupAId, sampleUser);
    assert(capturedCalls.length === 0, 'TEST 23: sendWelcome deduplication prevents duplicate greeting within 15s');

    // Disabled group welcome in Group B
    capturedCalls.length = 0;
    clearWelcomeAndGoodbyeCaches();
    await ModerationService.sendWelcome(groupBId, sampleUser);
    assert(capturedCalls.length === 0, 'TEST 24: sendWelcome suppresses dispatch when groupWelcome.enabled is false');

    // =========================================================================
    // SECTION 4: IN-GROUP GOODBYE DELIVERY (CRITICAL: NEVER SENDS DM)
    // =========================================================================
    console.log('\n--- SECTION 4: IN-GROUP GOODBYE DELIVERY ---');

    clearWelcomeAndGoodbyeCaches();
    capturedCalls.length = 0;

    await ModerationService.sendGoodbye(groupAId, sampleUser);
    assert(capturedCalls.length === 1, 'TEST 25: sendGoodbye dispatches exactly one call');
    assert(capturedCalls[0].args.chatId === groupAId, 'TEST 26: sendGoodbye dispatches to group chatId (chatId < 0)');
    assert(capturedCalls[0].args.chatId !== sampleUser.id, 'TEST 27: CRITICAL — sendGoodbye NEVER dispatches to user private DM');
    assert(capturedCalls[0].args.text.includes('Farewell John Doe, we will miss you!'), 'TEST 28: sendGoodbye contains formatted goodbye text');

    // Disabled group goodbye in Group B
    capturedCalls.length = 0;
    clearWelcomeAndGoodbyeCaches();
    await ModerationService.sendGoodbye(groupBId, sampleUser);
    assert(capturedCalls.length === 0, 'TEST 29: sendGoodbye suppresses dispatch when groupGoodbye.enabled is false');

    // =========================================================================
    // SECTION 5: WELCOME PRIVATE DM DELIVERY
    // =========================================================================
    console.log('\n--- SECTION 5: WELCOME PRIVATE DM DELIVERY ---');

    clearWelcomeAndGoodbyeCaches();
    capturedCalls.length = 0;

    await ModerationService.handleWelcomeDm(groupAId, sampleUser);
    assert(capturedCalls.length === 1, 'TEST 30: handleWelcomeDm dispatches exactly one call');
    assert(capturedCalls[0].args.chatId === sampleUser.id, 'TEST 31: handleWelcomeDm dispatches to private user.id (positive ID)');
    assert(capturedCalls[0].args.text.includes('You joined Alpha Mega Chat 🎉'), 'TEST 32: handleWelcomeDm contains formatted DM text');
    assert(capturedCalls[0].args.options?.reply_markup?.inline_keyboard?.length === 1, 'TEST 33: handleWelcomeDm attaches interactive buttons');

    // Deduplication test for welcome DM
    capturedCalls.length = 0;
    await ModerationService.handleWelcomeDm(groupAId, sampleUser);
    assert(capturedCalls.length === 0, 'TEST 34: handleWelcomeDm deduplication prevents duplicate DM within 60s');

    // =========================================================================
    // SECTION 6: DUAL-DISPATCH ON GENUINE JOIN EVENT
    // =========================================================================
    console.log('\n--- SECTION 6: DUAL-DISPATCH ON GENUINE JOIN EVENT ---');

    clearWelcomeAndGoodbyeCaches();
    capturedCalls.length = 0;

    const freshHumanUser: TelegramUser = {
      id: 998811,
      is_bot: false,
      first_name: 'Sarah',
      last_name: 'Connor',
      username: 'sarahc'
    };

    const joinUpdate: TelegramChatMemberUpdated = {
      chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
      from: freshHumanUser,
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: freshHumanUser },
      new_chat_member: { status: 'member', user: freshHumanUser }
    };

    // Bot manager processUpdate simulation
    const botManager = new TelegramBotManager();
    await botManager.processUpdate({
      update_id: 100001,
      chat_member: joinUpdate
    });

    assert(capturedCalls.length === 2, 'TEST 35: Genuine join fires both Group Welcome and Private Welcome DM independently');
    const groupCall = capturedCalls.find(c => c.args.chatId === groupAId);
    const dmCall = capturedCalls.find(c => c.args.chatId === freshHumanUser.id);
    assert(groupCall !== undefined, 'TEST 36: Group Welcome delivered to group chatId');
    assert(dmCall !== undefined, 'TEST 37: Private Welcome DM delivered to user.id');

    // Bot member join should NOT trigger welcome DM
    capturedCalls.length = 0;
    clearWelcomeAndGoodbyeCaches();

    const botUser: TelegramUser = {
      id: SPAM_BOT_ID,
      is_bot: true,
      first_name: 'SpamBot',
      username: 'spambot'
    };

    await botManager.processUpdate({
      update_id: 100002,
      chat_member: {
        chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
        from: botUser,
        date: Math.floor(Date.now() / 1000),
        old_chat_member: { status: 'left', user: botUser },
        new_chat_member: { status: 'member', user: botUser }
      }
    });

    const botDmCall = capturedCalls.find(c => c.args.chatId === SPAM_BOT_ID);
    assert(botDmCall === undefined, 'TEST 38: Bot join does NOT trigger Welcome Private DM');

    // =========================================================================
    // SECTION 7: MEDIA DELIVERY SUPPORT (PHOTO, VIDEO, GIF, DOCUMENT)
    // =========================================================================
    console.log('\n--- SECTION 7: MEDIA DELIVERY SUPPORT ---');

    clearWelcomeAndGoodbyeCaches();
    capturedCalls.length = 0;

    // Test GIF animation delivery (sendAnimation)
    db.updateGroupSettings(groupAId, {
      groupWelcome: {
        enabled: true,
        mode: 'rich',
        contentType: 'animation',
        text: 'GIF Welcome {user}',
        mediaFileId: 'https://example.com/welcome.gif'
      }
    });

    const freshUser3: TelegramUser = { id: 777003, is_bot: false, first_name: 'GifUser' };
    await ModerationService.sendWelcome(groupAId, freshUser3);
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendAnimation', 'TEST 39: GIF animation uses sendAnimation for group welcome');

    // Test Photo delivery (sendPhoto)
    capturedCalls.length = 0;
    clearWelcomeAndGoodbyeCaches();
    db.updateGroupSettings(groupAId, {
      welcomeDm: {
        enabled: true,
        mode: 'rich',
        contentType: 'photo',
        text: 'Photo DM {user}',
        mediaFileId: 'AgACAgIAAxkBAAI...'
      }
    });

    const freshUser4: TelegramUser = { id: 777004, is_bot: false, first_name: 'PhotoUser' };
    await ModerationService.handleWelcomeDm(groupAId, freshUser4);
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendPhoto', 'TEST 40: Photo message uses sendPhoto for welcome DM');

    // =========================================================================
    // SECTION 8: EPHEMERAL RENDER SCHEDULED MEDIA SAFETY
    // =========================================================================
    console.log('\n--- SECTION 8: EPHEMERAL RENDER SCHEDULED MEDIA SAFETY ---');

    const validFileIdCheck = validateMediaReference('AgACAgIAAxkBAAI123456');
    assert(validFileIdCheck.valid === true, 'TEST 41: Telegram file_id passes media reference validation');

    const validUrlCheck = validateMediaReference('https://images.unsplash.com/photo-12345.jpg');
    assert(validUrlCheck.valid === true, 'TEST 42: Public HTTPS URL passes media reference validation');

    const invalidBlobCheck = validateMediaReference('blob:http://localhost:5173/abc-123');
    assert(invalidBlobCheck.valid === false, 'TEST 43: Local browser blob: URL is rejected for direct dispatch');

    // PostSender button style sanitization
    const rawButtonsWithStyles = [
      [
        { text: 'Default Btn', url: 'https://example.com/1', style: 'default' as any },
        { text: 'Primary Btn', url: 'https://example.com/2', style: 'primary' as const },
        { text: 'Success Btn', url: 'https://example.com/3', style: 'success' as const },
        { text: 'Danger Btn', url: 'https://example.com/4', style: 'danger' as const }
      ]
    ];
    const sanitized = sanitizeInlineButtons(rawButtonsWithStyles as any);
    assert(sanitized !== undefined && sanitized.length === 1, 'TEST 44: sanitizeInlineButtons returns rows');
    assert(sanitized![0][1].style === 'primary', 'TEST 45: Primary button style preserved');
    assert(sanitized![0][2].style === 'success', 'TEST 46: Success button style preserved');
    assert(sanitized![0][3].style === 'danger', 'TEST 47: Danger button style preserved');
    assert(sanitized![0][0].style === undefined, 'TEST 48: Default button style normalized');

  } finally {
    // Restore mocks
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendPhoto = origSendPhoto;
    telegramApi.sendVideo = origSendVideo;
    telegramApi.sendAnimation = origSendAnimation;
    telegramApi.sendDocument = origSendDocument;
    telegramApi.getChatAdministrators = origGetChatAdministrators;
    telegramApi.getMe = origGetMe;
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runRichMessageSystemTestSuite().catch((err) => {
  console.error('Test suite failed unexpectedly:', err);
  process.exit(1);
});
