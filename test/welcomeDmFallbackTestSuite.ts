process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { WelcomeDmFallbackService } from '../server/telegram/welcomeDmFallback.js';
import { WelcomeDmConfig, PostPayload, TelegramUser, TelegramMessage } from '../server/telegram/types.js';
import { CommandContext, RoleRank } from '../server/telegram/middleware.js';

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

async function runWelcomeDmFallbackTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING WELCOME DM FIRST-CONTACT FALLBACK TEST SUITE');
  console.log('================================================================\n');

  const groupChatId = -100999555111;
  const groupTitle = 'Alpha Community';
  const ROXIE_BOT_ID = 8880001;

  const USER_STARTED: TelegramUser = { id: 10001, is_bot: false, first_name: 'Alice', username: 'alice_started' };
  const USER_FIRST_CONTACT: TelegramUser = { id: 20002, is_bot: false, first_name: 'Bob', username: 'bob_new' };
  const USER_BLOCKED: TelegramUser = { id: 30003, is_bot: false, first_name: 'Charlie', username: 'charlie_blocked' };
  const USER_OTHER: TelegramUser = { id: 40004, is_bot: false, first_name: 'Dave', username: 'dave_intruder' };

  // Track Telegram API calls
  const capturedCalls: Array<{ method: string; chatId: number | string; payload: any; options?: any }> = [];

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: ROXIE_BOT_ID, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' }
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    const numId = Number(chatId);

    // Simulate Telegram Bot API behavior:
    // 1. Started user -> Succeeds
    if (numId === USER_STARTED.id) {
      return { ok: true, result: { message_id: 101, chat: { id: numId }, text } };
    }
    // 2. First-contact user -> 403 Forbidden: bot can't initiate conversation with a user
    if (numId === USER_FIRST_CONTACT.id) {
      return {
        ok: false,
        error_code: 403,
        description: "Forbidden: bot can't initiate conversation with a user"
      };
    }
    // 3. Blocked user -> 403 Forbidden: bot was blocked by the user
    if (numId === USER_BLOCKED.id) {
      return {
        ok: false,
        error_code: 403,
        description: 'Forbidden: bot was blocked by the user'
      };
    }
    // 4. Group or other destinations -> Succeeds
    return { ok: true, result: { message_id: 999, chat: { id: numId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: any, options?: any) => {
    capturedCalls.push({ method: 'sendPhoto', chatId, payload: photo, options });
    const numId = Number(chatId);
    if (numId === USER_FIRST_CONTACT.id) {
      return {
        ok: false,
        error_code: 403,
        description: "Forbidden: bot can't initiate conversation with a user"
      };
    }
    return { ok: true, result: { message_id: 102, chat: { id: numId } } };
  };

  // Seed group with Welcome DM enabled and fallback enabled
  db.getGroupSettings(groupChatId, groupTitle);
  db.updateGroupSettings(groupChatId, {
    chatTitle: groupTitle,
    welcomeDm: {
      enabled: true,
      mode: 'rich',
      contentType: 'text',
      text: 'Welcome to {groupname}, {first_name}! 🎉',
      buttons: [[{ text: 'Rules', url: 'https://example.com/rules', style: 'primary' }]],
      fallbackEnabled: true,
      fallbackText: '👋 Welcome {first_name}! Click below to start Roxie and get your welcome DM.',
      fallbackButtonText: '💬 Start Roxie'
    }
  });

  // -------------------------------------------------------------
  // TEST 1: User who already started Roxie receives direct private DM
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  ModerationService.clearWelcomedDmCache();
  WelcomeDmFallbackService.clear();

  const directRes = await ModerationService.handleWelcomeDm(groupChatId, USER_STARTED, groupTitle);
  assert(directRes.sent === true, 'Test 1a: Direct Welcome DM succeeds for user who previously started Roxie');
  assert(
    capturedCalls.some(c => c.chatId === USER_STARTED.id && c.method === 'sendMessage'),
    'Test 1b: Direct Welcome DM dispatched to user.id private chat'
  );
  assert(
    !capturedCalls.some(c => c.chatId === groupChatId),
    'Test 1c: No fallback message sent to group when direct DM succeeds'
  );

  // -------------------------------------------------------------
  // TEST 2: First-contact user fails direct DM -> Fallback sent to group
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  ModerationService.clearWelcomedDmCache();
  WelcomeDmFallbackService.clear();

  const firstContactRes = await ModerationService.handleWelcomeDm(groupChatId, USER_FIRST_CONTACT, groupTitle);
  assert(firstContactRes.sent === false, 'Test 2a: Direct DM returns sent=false on first-contact 403');
  assert(firstContactRes.fallbackSent === true, 'Test 2b: fallbackSent is true for first-contact user');
  assert(Boolean(firstContactRes.token), 'Test 2c: Opaque token generated for pending welcome');
  assert(
    !firstContactRes.token?.includes(String(groupChatId)) && !firstContactRes.token?.includes(String(USER_FIRST_CONTACT.id)),
    'Test 2d: Opaque token DOES NOT leak raw group_id or user_id'
  );

  const groupFallbackCall = capturedCalls.find(c => c.chatId === groupChatId && c.method === 'sendMessage');
  assert(Boolean(groupFallbackCall), 'Test 2e: Fallback message dispatched to group chatId');
  assert(
    groupFallbackCall?.payload?.includes('Bob'),
    'Test 2f: Fallback message formats {first_name} dynamically'
  );
  const inlineButtons = groupFallbackCall?.options?.reply_markup?.inline_keyboard;
  assert(
    inlineButtons?.[0]?.[0]?.text === '💬 Start Roxie',
    'Test 2g: Fallback button contains configured button text'
  );
  assert(
    inlineButtons?.[0]?.[0]?.url?.includes(`start=welcome_${firstContactRes.token}`),
    'Test 2h: Fallback button deep link points to https://t.me/MissRoxie_Bot?start=welcome_<token>'
  );

  // -------------------------------------------------------------
  // TEST 3: User clicks deep link -> /start welcome_<token> delivers DM
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const token = firstContactRes.token!;

  const startMsg: TelegramMessage = {
    message_id: 501,
    date: Math.floor(Date.now() / 1000),
    chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
    from: USER_FIRST_CONTACT,
    text: `/start welcome_${token}`
  };

  const commandCtx: CommandContext = {
    message: startMsg,
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${token}`]
  };

  // Allow sending to Bob now that he has /started the bot
  const origSendMessage = (telegramApi as any).sendMessage;
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    return { ok: true, result: { message_id: 601, chat: { id: Number(chatId) }, text } };
  };

  await CommandHandler.handleCommand(commandCtx);

  const deliveredDmCall = capturedCalls.find(c => c.chatId === USER_FIRST_CONTACT.id && c.payload?.includes('Welcome to Alpha Community, Bob!'));
  assert(Boolean(deliveredDmCall), 'Test 3a: Deferred Welcome DM successfully delivered to user upon /start welcome_<token>');
  assert(
    deliveredDmCall?.options?.reply_markup?.inline_keyboard?.[0]?.[0]?.text === 'Rules',
    'Test 3b: Deferred Welcome DM preserves configured rich buttons'
  );
  assert(
    WelcomeDmFallbackService.getPending(token) === undefined,
    'Test 3c: Token was consumed immediately after successful delivery'
  );

  // -------------------------------------------------------------
  // TEST 4: Invalid token is rejected
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const invalidCtx: CommandContext = {
    message: {
      message_id: 502,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: '/start welcome_invalidtoken123'
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: ['welcome_invalidtoken123']
  };

  await CommandHandler.handleCommand(invalidCtx);
  assert(
    capturedCalls.some(c => c.payload?.includes('invalid or has already been used')),
    'Test 4: Invalid welcome token rejected with warning notice'
  );

  // -------------------------------------------------------------
  // TEST 5: Expired token is rejected
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const expiredPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    db.getGroupSettings(groupChatId).welcomeDm!,
    -1000 // Negative TTL -> already expired
  );

  const expiredCtx: CommandContext = {
    message: {
      message_id: 503,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${expiredPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${expiredPending.token}`]
  };

  await CommandHandler.handleCommand(expiredCtx);
  assert(
    capturedCalls.some(c => c.payload?.includes('has expired')),
    'Test 5: Expired welcome token rejected with expiration notice'
  );

  // -------------------------------------------------------------
  // TEST 6: Token used by wrong Telegram user is rejected & preserved
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const userBobPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    db.getGroupSettings(groupChatId).welcomeDm!
  );

  const wrongUserCtx: CommandContext = {
    message: {
      message_id: 504,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_OTHER.id, type: 'private' },
      from: USER_OTHER,
      text: `/start welcome_${userBobPending.token}`
    },
    chatId: USER_OTHER.id,
    chatTitle: 'Private Chat',
    sender: USER_OTHER,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${userBobPending.token}`]
  };

  await CommandHandler.handleCommand(wrongUserCtx);
  assert(
    capturedCalls.some(c => c.payload?.includes('generated for another member')),
    'Test 6a: Token used by another user is rejected'
  );
  assert(
    WelcomeDmFallbackService.getPending(userBobPending.token) !== undefined,
    'Test 6b: Token is PRESERVED so the intended user can still claim their welcome DM'
  );

  // -------------------------------------------------------------
  // TEST 7: Blocked user does NOT trigger misleading fallback
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  ModerationService.clearWelcomedDmCache();
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_BLOCKED.id) {
      return { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' };
    }
    return { ok: true, result: { message_id: 999, chat: { id: Number(chatId) }, text } };
  };

  const blockedRes = await ModerationService.handleWelcomeDm(groupChatId, USER_BLOCKED, groupTitle);
  assert(blockedRes.sent === false, 'Test 7a: Blocked user returns sent=false');
  assert(blockedRes.fallbackSent === false, 'Test 7b: fallbackSent is FALSE for blocked user (no misleading fallback)');
  assert(
    !capturedCalls.some(c => c.chatId === groupChatId),
    'Test 7c: No in-group fallback notification sent when user has blocked the bot'
  );

  // -------------------------------------------------------------
  // TEST 8: Disabled fallback does NOT send in-group notification
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  ModerationService.clearWelcomedDmCache();
  db.updateGroupSettings(groupChatId, {
    welcomeDm: {
      enabled: true,
      fallbackEnabled: false, // Fallback explicitly disabled
      text: 'Welcome {first_name}!'
    }
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_FIRST_CONTACT.id) {
      return { ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    }
    return { ok: true, result: { message_id: 999, chat: { id: Number(chatId) }, text } };
  };

  const disabledFallbackRes = await ModerationService.handleWelcomeDm(groupChatId, USER_FIRST_CONTACT, groupTitle);
  assert(disabledFallbackRes.sent === false, 'Test 8a: Direct DM failed');
  assert(disabledFallbackRes.fallbackSent === false, 'Test 8b: fallbackSent is false when fallbackEnabled=false');
  assert(
    !capturedCalls.some(c => c.chatId === groupChatId),
    'Test 8c: Group notification suppressed when fallback is disabled'
  );

  // -------------------------------------------------------------
  // TEST 9: Existing groups without fallbackEnabled default to FALSE
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  ModerationService.clearWelcomedDmCache();
  const legacyGroupChatId = -100888111001;
  const legacyGroupTitle = 'Legacy Community';
  db.getGroupSettings(legacyGroupChatId, legacyGroupTitle);
  db.updateGroupSettings(legacyGroupChatId, {
    chatTitle: legacyGroupTitle,
    welcomeDm: {
      enabled: true,
      // fallbackEnabled is UNDEFINED (existing group before feature was introduced)
      text: 'Welcome to legacy group, {first_name}!'
    }
  });

  const legacyRes = await ModerationService.handleWelcomeDm(legacyGroupChatId, USER_FIRST_CONTACT, legacyGroupTitle);
  assert(legacyRes.sent === false, 'Test 9a: Direct DM returns sent=false on first contact in legacy group');
  assert(legacyRes.fallbackSent === false, 'Test 9b: fallbackSent is FALSE by default when fallbackEnabled is undefined');
  assert(
    !capturedCalls.some(c => c.chatId === legacyGroupChatId),
    'Test 9c: Zero fallback messages sent to legacy group (preserves zero unexpected notifications)'
  );

  // -------------------------------------------------------------
  // TEST 10: DM delivery failure releases claim so user can retry
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const retryPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    { enabled: true, text: 'Welcome {first_name}!' }
  );

  // First attempt: Telegram returns a network/server error when bot tries to send DM
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_FIRST_CONTACT.id && text.includes('Welcome Bob!')) {
      return { ok: false, error_code: 502, description: 'Bad Gateway' };
    }
    return { ok: true, result: { message_id: 888, chat: { id: Number(chatId) }, text } };
  };

  const retryCtx1: CommandContext = {
    message: {
      message_id: 506,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${retryPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${retryPending.token}`]
  };

  await CommandHandler.handleCommand(retryCtx1);
  assert(
    capturedCalls.some(c => c.payload?.includes('Could not deliver your welcome message at this moment')),
    'Test 10a: User notified of temporary delivery failure'
  );
  assert(
    WelcomeDmFallbackService.getPending(retryPending.token) !== undefined,
    'Test 10b: Token is NOT deleted when delivery fails'
  );
  assert(
    WelcomeDmFallbackService.getPending(retryPending.token)?.claimedAt === undefined,
    'Test 10c: In-flight lock is released when delivery fails'
  );

  // Second attempt: User retries /start after temporary failure resolved
  capturedCalls.length = 0;
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    return { ok: true, result: { message_id: 889, chat: { id: Number(chatId) }, text } };
  };

  const retryCtx2: CommandContext = {
    message: {
      message_id: 507,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${retryPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${retryPending.token}`]
  };

  await CommandHandler.handleCommand(retryCtx2);
  assert(
    capturedCalls.some(c => c.chatId === USER_FIRST_CONTACT.id && c.payload?.includes('Welcome Bob!')),
    'Test 10d: Retry succeeds and delivers welcome DM'
  );
  assert(
    WelcomeDmFallbackService.getPending(retryPending.token) === undefined,
    'Test 10e: Token is permanently consumed after successful retry delivery'
  );

  // -------------------------------------------------------------
  // TEST 11: Concurrent /start requests cannot deliver twice
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const concurrentPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    { enabled: true, text: 'Welcome {first_name}!' }
  );

  let deliveryAttempts = 0;
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_FIRST_CONTACT.id && text.includes('Welcome Bob!')) {
      deliveryAttempts++;
      // Simulate slight network latency
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return { ok: true, result: { message_id: 990, chat: { id: Number(chatId) }, text } };
  };

  const concurrentCtx1: CommandContext = {
    message: {
      message_id: 508,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${concurrentPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${concurrentPending.token}`]
  };

  const concurrentCtx2: CommandContext = {
    message: {
      message_id: 509,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${concurrentPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${concurrentPending.token}`]
  };

  // Launch two /start commands simultaneously
  await Promise.all([
    CommandHandler.handleCommand(concurrentCtx1),
    CommandHandler.handleCommand(concurrentCtx2)
  ]);

  assert(
    deliveryAttempts === 1,
    `Test 11a: Welcome DM delivered exactly ONCE despite rapid concurrent /start requests (attempts=${deliveryAttempts})`
  );
  assert(
    WelcomeDmFallbackService.getPending(concurrentPending.token) === undefined,
    'Test 11b: Token is consumed after single successful delivery'
  );

  // -------------------------------------------------------------
  // TEST 12: Slow delivery beyond 15s prevents duplicate claim
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const slowPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    { enabled: true, text: 'Welcome {first_name}!' }
  );

  let slowDeliveryCount = 0;
  let slowDeliveryResolve: (() => void) | null = null;
  const slowDeliveryPromise = new Promise<void>(res => { slowDeliveryResolve = res; });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_FIRST_CONTACT.id && text.includes('Welcome Bob!')) {
      slowDeliveryCount++;
      // Wait for test controller signal to finish delivery
      await slowDeliveryPromise;
    }
    return { ok: true, result: { message_id: 991, chat: { id: Number(chatId) }, text } };
  };

  const slowCtx1: CommandContext = {
    message: {
      message_id: 510,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${slowPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${slowPending.token}`]
  };

  // Start first delivery
  const deliveryTask = CommandHandler.handleCommand(slowCtx1);

  // Wait 20ms to ensure claim is acquired and PostSender is awaiting
  await new Promise(r => setTimeout(r, 20));

  // Second /start arrives while first is still delivering (even if claimedAt is set to 20s ago)
  const tokenRecord = WelcomeDmFallbackService.getPending(slowPending.token);
  if (tokenRecord) {
    tokenRecord.claimedAt = Date.now() - 20_000; // Simulate 20 seconds elapsed
  }

  const slowCtx2: CommandContext = {
    message: {
      message_id: 511,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${slowPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${slowPending.token}`]
  };

  await CommandHandler.handleCommand(slowCtx2);
  assert(
    slowDeliveryCount === 1,
    'Test 12a: Second /start does not start a second delivery while first is still in progress (>15s elapsed)'
  );

  // Now resolve the first delivery
  slowDeliveryResolve!();
  await deliveryTask;

  assert(
    slowDeliveryCount === 1,
    'Test 12b: Exactly ONE Welcome DM delivered across slow delivery lifecycle'
  );
  assert(
    WelcomeDmFallbackService.getPending(slowPending.token) === undefined,
    'Test 12c: Token consumed after slow delivery completes'
  );

  // -------------------------------------------------------------
  // TEST 13: Wrong user during active claim is rejected without breaking active delivery
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const wrongUserClaimPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    { enabled: true, text: 'Welcome {first_name}!' }
  );

  let activeDeliveryResolve: (() => void) | null = null;
  const activeDeliveryPromise = new Promise<void>(res => { activeDeliveryResolve = res; });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', chatId, payload: text, options });
    if (Number(chatId) === USER_FIRST_CONTACT.id && text.includes('Welcome Bob!')) {
      await activeDeliveryPromise;
    }
    return { ok: true, result: { message_id: 992, chat: { id: Number(chatId) }, text } };
  };

  const validUserCtx: CommandContext = {
    message: {
      message_id: 512,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${wrongUserClaimPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${wrongUserClaimPending.token}`]
  };

  const validTask = CommandHandler.handleCommand(validUserCtx);
  await new Promise(r => setTimeout(r, 20));

  // Intruder tries to send /start with the same token during active delivery
  const intruderCtx: CommandContext = {
    message: {
      message_id: 513,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_OTHER.id, type: 'private' },
      from: USER_OTHER,
      text: `/start welcome_${wrongUserClaimPending.token}`
    },
    chatId: USER_OTHER.id,
    chatTitle: 'Private Chat',
    sender: USER_OTHER,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${wrongUserClaimPending.token}`]
  };

  await CommandHandler.handleCommand(intruderCtx);
  assert(
    capturedCalls.some(c => c.chatId === USER_OTHER.id && c.payload?.includes('generated for another member')),
    'Test 13a: Intruder receives wrong-user notice during active claim'
  );

  // Complete valid user delivery
  activeDeliveryResolve!();
  await validTask;

  assert(
    WelcomeDmFallbackService.getPending(wrongUserClaimPending.token) === undefined,
    'Test 13b: Valid user delivery completes successfully despite intruder attempt'
  );

  // -------------------------------------------------------------
  // TEST 14: Process restart / in-memory store reset behavior
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const preRestartPending = WelcomeDmFallbackService.createPendingWelcome(
    groupChatId,
    groupTitle,
    USER_FIRST_CONTACT,
    { enabled: true, text: 'Welcome {first_name}!' }
  );

  // Simulate process restart by clearing in-memory store
  WelcomeDmFallbackService.clear();

  const postRestartCtx: CommandContext = {
    message: {
      message_id: 514,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_FIRST_CONTACT.id, type: 'private' },
      from: USER_FIRST_CONTACT,
      text: `/start welcome_${preRestartPending.token}`
    },
    chatId: USER_FIRST_CONTACT.id,
    chatTitle: 'Private Chat',
    sender: USER_FIRST_CONTACT,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: [`welcome_${preRestartPending.token}`]
  };

  await CommandHandler.handleCommand(postRestartCtx);
  assert(
    capturedCalls.some(c => c.chatId === USER_FIRST_CONTACT.id && c.payload?.includes('invalid or has already been used')),
    'Test 14: Deep link from before process restart safely returns invalid/used token message without error'
  );

  // -------------------------------------------------------------
  // TEST 15: Standard /start greeting remains intact
  // -------------------------------------------------------------
  capturedCalls.length = 0;
  const standardStartCtx: CommandContext = {
    message: {
      message_id: 515,
      date: Math.floor(Date.now() / 1000),
      chat: { id: USER_STARTED.id, type: 'private' },
      from: USER_STARTED,
      text: '/start'
    },
    chatId: USER_STARTED.id,
    chatTitle: 'Private Chat',
    sender: USER_STARTED,
    command: '/start',
    isAnonymousAdmin: false,
    adminDisplayName: '',
    args: []
  };

  await CommandHandler.handleCommand(standardStartCtx);
  assert(
    capturedCalls.some(c => c.payload?.includes('I am ready to moderate your Telegram groups')),
    'Test 15: Standard /start greeting executes normally when no welcome token is passed'
  );

  console.log(`\n================================================================`);
  console.log(`📊 RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runWelcomeDmFallbackTestSuite().catch(err => {
  console.error('Fatal error running welcome DM fallback test suite:', err);
  process.exit(1);
});
