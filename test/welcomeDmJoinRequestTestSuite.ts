process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender } from '../server/telegram/postSender.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { WelcomeDmConfig, TelegramChatMemberUpdated, TelegramChatJoinRequest } from '../server/telegram/types.js';

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

async function runWelcomeDmJoinRequestTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING WELCOME DM JOIN REQUEST TEST SUITE (28 TESTS)');
  console.log('================================================================\n');

  const groupAId = -10099494671;
  const groupBId = -10099494672;
  const groupATitle = 'Join Request Alpha';
  const groupBTitle = 'Join Request Beta';

  // Seed test groups
  db.getGroupSettings(groupAId, groupATitle);
  db.updateGroupSettings(groupAId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupATitle,
    autoAcceptEnabled: false,
    welcomeDm: {
      enabled: true,
      mode: 'rich',
      contentType: 'text',
      text: 'Welcome {first_name} to {groupname}!',
      triggerMode: 'normal_join',
      fallbackEnabled: true,
      fallbackText: 'Please start Roxie, {first_name}!',
      fallbackButtonText: 'Start Roxie'
    }
  });

  db.getGroupSettings(groupBId, groupBTitle);
  db.updateGroupSettings(groupBId, {
    botLeft: false,
    unavailable: false,
    chatTitle: groupBTitle,
    autoAcceptEnabled: false,
    welcomeDm: {
      enabled: true,
      mode: 'rich',
      contentType: 'text',
      text: 'Join request received for {groupname}, {first_name}!',
      triggerMode: 'join_request'
    }
  });

  // Track Telegram API calls
  const capturedCalls: Array<{ method: string; args: any }> = [];
  const ROXIE_BOT_ID = 8880001;
  const HUMAN_USER_1_ID = 70001;
  const HUMAN_USER_1_CHAT_ID = 90001; // user_chat_id from Telegram
  const HUMAN_USER_2_ID = 70002;
  const HUMAN_USER_2_CHAT_ID = 90002;
  const BOT_USER_ID = 9999002;

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: ROXIE_BOT_ID, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Roxie' }
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    capturedCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: chatId }, photo: [{ file_id: photo }] } };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: string, options?: any) => {
    capturedCalls.push({ method: 'sendVideo', args: { chatId, video, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: chatId } } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: string, options?: any) => {
    capturedCalls.push({ method: 'sendAnimation', args: { chatId, animation, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: chatId } } };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: string, options?: any) => {
    capturedCalls.push({ method: 'sendDocument', args: { chatId, document, options } });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 1, chat: { id: chatId } } };
  };

  (telegramApi as any).approveChatJoinRequest = async (chatId: number | string, userId: number) => {
    capturedCalls.push({ method: 'approveChatJoinRequest', args: { chatId, userId } });
    return { ok: true, result: true };
  };

  (telegramApi as any).declineChatJoinRequest = async (chatId: number | string, userId: number) => {
    capturedCalls.push({ method: 'declineChatJoinRequest', args: { chatId, userId } });
    return { ok: true, result: true };
  };

  const botManager = new TelegramBotManager();
  (botManager as any).botInfo = { id: ROXIE_BOT_ID, username: 'MissRoxie_Bot' };

  // Helper to reset caches
  const resetDedupeCaches = () => {
    (ModerationService as any).welcomedDmUsersCache.clear();
    (ModerationService as any).inFlightWelcomeDms.clear();
    capturedCalls.length = 0;
  };

  // ==========================================
  // TEST 1: Default trigger mode is 'normal_join' when undefined
  // ==========================================
  resetDedupeCaches();
  const defaultGroup = -10099494673;
  db.getGroupSettings(defaultGroup, 'Default Trigger Group');
  db.updateGroupSettings(defaultGroup, {
    welcomeDm: {
      enabled: true,
      text: 'Default welcome for {first_name}'
      // triggerMode is undefined
    }
  });
  const normalJoinRes = await ModerationService.handleWelcomeDm(defaultGroup, { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'John' }, 'Default Trigger Group', { trigger: 'normal_join' });
  assert(normalJoinRes.sent === true && capturedCalls.some(c => c.args.chatId === HUMAN_USER_1_ID), 'Test 1: Undefined triggerMode defaults to normal_join and sends DM on normal join');

  // ==========================================
  // TEST 2: Undefined triggerMode ignores join_request
  // ==========================================
  resetDedupeCaches();
  const joinReqOnDefault = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: defaultGroup, title: 'Default Trigger Group', type: 'supergroup' },
    from: { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Jane' },
    user_chat_id: HUMAN_USER_2_CHAT_ID,
    date: Date.now()
  });
  assert(joinReqOnDefault.sent === false && joinReqOnDefault.skipped === 'TRIGGER_MODE_MISMATCH', 'Test 2: Undefined triggerMode (defaults to normal_join) skips join_request');

  // ==========================================
  // TEST 3: triggerMode = 'normal_join' sends DM on normal join
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupAId, { welcomeDm: { enabled: true, text: 'Hello {first_name}!', triggerMode: 'normal_join' } });
  const t3Res = await ModerationService.handleWelcomeDm(groupAId, { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Alice' }, groupATitle, { trigger: 'normal_join' });
  assert(t3Res.sent === true && capturedCalls[0].args.chatId === HUMAN_USER_1_ID, 'Test 3: triggerMode normal_join delivers DM to user.id on normal join');

  // ==========================================
  // TEST 4: triggerMode = 'normal_join' ignores join_request
  // ==========================================
  resetDedupeCaches();
  const t4Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Alice' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  assert(t4Res.sent === false && t4Res.skipped === 'TRIGGER_MODE_MISMATCH', 'Test 4: triggerMode normal_join ignores chat_join_request');

  // ==========================================
  // TEST 5: triggerMode = 'join_request' sends DM on chat_join_request
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, { welcomeDm: { enabled: true, text: 'Welcome join requester {first_name}!', triggerMode: 'join_request' } });
  const t5Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Bob' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  assert(t5Res.sent === true && capturedCalls.some(c => c.args.chatId === HUMAN_USER_1_CHAT_ID), 'Test 5: triggerMode join_request sends DM on join request');

  // ==========================================
  // TEST 6: triggerMode = 'join_request' uses user_chat_id NOT from.id
  // ==========================================
  assert(capturedCalls.some(c => c.args.chatId === HUMAN_USER_1_CHAT_ID && c.args.chatId !== HUMAN_USER_1_ID), 'Test 6: Join request DM destination is user_chat_id (90001), distinct from user.id (70001)');

  // ==========================================
  // TEST 7: triggerMode = 'join_request' ignores normal_join
  // ==========================================
  resetDedupeCaches();
  const t7Res = await ModerationService.handleWelcomeDm(groupBId, { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Bob' }, groupBTitle, { trigger: 'normal_join' });
  assert(t7Res.sent === false && t7Res.skipped === 'TRIGGER_MODE_MISMATCH', 'Test 7: triggerMode join_request ignores normal join events');

  // ==========================================
  // TEST 8: triggerMode = 'both' sends DM on chat_join_request
  // ==========================================
  resetDedupeCaches();
  const groupBothId = -10099494674;
  db.getGroupSettings(groupBothId, 'Both Modes Group');
  db.updateGroupSettings(groupBothId, {
    welcomeDm: {
      enabled: true,
      text: 'Welcome {first_name} to {groupname} (Both Mode)',
      triggerMode: 'both'
    }
  });
  const t8Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBothId, title: 'Both Modes Group', type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Charlie' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  assert(t8Res.sent === true && capturedCalls.some(c => c.args.chatId === HUMAN_USER_1_CHAT_ID), 'Test 8: triggerMode both sends DM on join request');

  // ==========================================
  // TEST 9: triggerMode = 'both' deduplicates and suppresses second DM on subsequent normal join approval
  // ==========================================
  const t9Res = await ModerationService.handleWelcomeDm(groupBothId, { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Charlie' }, 'Both Modes Group', { trigger: 'normal_join' });
  assert(t9Res.sent === false && t9Res.skipped === 'ALREADY_WELCOMED_RECENTLY', 'Test 9: triggerMode both suppresses duplicate DM on subsequent normal join approval within 60s');

  // ==========================================
  // TEST 10: triggerMode = 'both' sends DM on direct normal join when no prior join request
  // ==========================================
  resetDedupeCaches();
  const t10Res = await ModerationService.handleWelcomeDm(groupBothId, { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'David' }, 'Both Modes Group', { trigger: 'normal_join' });
  assert(t10Res.sent === true && capturedCalls.some(c => c.args.chatId === HUMAN_USER_2_ID), 'Test 10: triggerMode both sends DM on direct normal join when no prior join request');

  // ==========================================
  // TEST 11: Dynamic variables substitution for join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'text',
      text: 'Hey {first_name} ({username})! Welcome to {groupname}! Your ID is {user_id}.',
      triggerMode: 'join_request'
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: 'Super VIP Room', type: 'supergroup' },
    from: { id: 77777, is_bot: false, first_name: 'Zara', username: 'zarastar' },
    user_chat_id: 99999,
    date: Date.now()
  });
  const t11Call = capturedCalls.find(c => c.args.chatId === 99999);
  const t11Text = t11Call?.args?.text || '';
  assert(
    t11Text.includes('Hey Zara (@zarastar)!') &&
    t11Text.includes('Welcome to Super VIP Room!') &&
    t11Text.includes('Your ID is 77777.'),
    'Test 11: Dynamic variables {first_name}, {username}, {groupname}, {user_id} resolve correctly in join request DM',
    `Received text: ${t11Text}`
  );

  // ==========================================
  // TEST 12: Rich Photo message in join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'photo',
      mediaFileId: 'photo_join_req_123',
      text: 'Photo welcome to {groupname}, {first_name}!',
      triggerMode: 'join_request'
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Elena' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const t12PhotoCall = capturedCalls.find(c => c.method === 'sendPhoto' && c.args.chatId === HUMAN_USER_1_CHAT_ID);
  assert(
    t12PhotoCall !== undefined &&
    t12PhotoCall.args.photo === 'photo_join_req_123' &&
    t12PhotoCall.args.options.caption.includes('Elena'),
    'Test 12: Rich Photo Welcome DM delivered on join request'
  );

  // ==========================================
  // TEST 13: Rich Video message in join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'video',
      mediaFileId: 'video_join_req_456',
      text: 'Video welcome for {first_name}',
      triggerMode: 'join_request'
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Felix' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const t13VideoCall = capturedCalls.find(c => c.method === 'sendVideo' && c.args.chatId === HUMAN_USER_1_CHAT_ID);
  assert(t13VideoCall !== undefined && t13VideoCall.args.video === 'video_join_req_456', 'Test 13: Rich Video Welcome DM delivered on join request');

  // ==========================================
  // TEST 14: Rich Animation/GIF message in join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'animation',
      mediaFileId: 'anim_join_req_789',
      text: 'GIF welcome for {first_name}',
      triggerMode: 'join_request'
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Gina' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const t14AnimCall = capturedCalls.find(c => c.method === 'sendAnimation' && c.args.chatId === HUMAN_USER_1_CHAT_ID);
  assert(t14AnimCall !== undefined && t14AnimCall.args.animation === 'anim_join_req_789', 'Test 14: Rich Animation Welcome DM delivered on join request');

  // ==========================================
  // TEST 15: Rich Document message in join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'document',
      mediaFileId: 'doc_join_req_999',
      text: 'Doc welcome for {first_name}',
      triggerMode: 'join_request'
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Hank' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const t15DocCall = capturedCalls.find(c => c.method === 'sendDocument' && c.args.chatId === HUMAN_USER_1_CHAT_ID);
  assert(t15DocCall !== undefined && t15DocCall.args.document === 'doc_join_req_999', 'Test 15: Rich Document Welcome DM delivered on join request');

  // ==========================================
  // TEST 16: Inline buttons with styled URLs work on join request DM
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'text',
      text: 'Join request with buttons',
      triggerMode: 'join_request',
      buttons: [
        [
          { text: 'Rules Channel', url: 'https://t.me/rules_channel', style: 'primary' },
          { text: 'Support Chat', url: 'https://t.me/support_chat', style: 'success' }
        ]
      ]
    }
  });
  await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Iris' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const t16Call = capturedCalls.find(c => c.args.chatId === HUMAN_USER_1_CHAT_ID);
  const inlineKeyboard = t16Call?.args?.options?.reply_markup?.inline_keyboard;
  assert(
    Array.isArray(inlineKeyboard) &&
    inlineKeyboard[0][0].text === 'Rules Channel' &&
    inlineKeyboard[0][0].url === 'https://t.me/rules_channel' &&
    inlineKeyboard[0][1].text === 'Support Chat',
    'Test 16: Styled inline buttons attached correctly to join request Welcome DM'
  );

  // ==========================================
  // TEST 17: Disabled Welcome DM produces 0 messages on join requests
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, { welcomeDm: { enabled: false, triggerMode: 'join_request' } });
  const t17Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Jack' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  assert(t17Res.sent === false && t17Res.skipped === 'FEATURE_DISABLED' && capturedCalls.length === 0, 'Test 17: Disabled Welcome DM sends 0 messages on join request');

  // ==========================================
  // TEST 18: Bot join requests are completely ignored
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, { welcomeDm: { enabled: true, triggerMode: 'join_request' } });
  const t18Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: BOT_USER_ID, is_bot: true, first_name: 'SpamBot', username: 'spam_bot' },
    user_chat_id: 9999002,
    date: Date.now()
  });
  assert(t18Res.sent === false && t18Res.skipped === 'TARGET_IS_BOT' && capturedCalls.length === 0, 'Test 18: Bot join requests are ignored without sending messages');

  // ==========================================
  // TEST 19: Duplicate join requests within 60s are deduplicated
  // ==========================================
  resetDedupeCaches();
  const joinReqPayload: TelegramChatJoinRequest = {
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Karen' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  };
  const firstReq = await ModerationService.handleJoinRequestWelcomeDm(joinReqPayload);
  const secondReq = await ModerationService.handleJoinRequestWelcomeDm(joinReqPayload);
  assert(firstReq.sent === true && secondReq.sent === false && secondReq.skipped === 'ALREADY_WELCOMED_RECENTLY', 'Test 19: Rapid duplicate join requests within 60s are deduplicated');

  // ==========================================
  // TEST 20: In-flight join requests cannot send duplicate messages concurrently
  // ==========================================
  resetDedupeCaches();
  // Simulate slow PostSender
  const origSend = PostSender.send;
  (PostSender as any).send = async (dest: any, payload: any) => {
    await new Promise(r => setTimeout(r, 50));
    return origSend.call(PostSender, dest, payload);
  };
  const [resA, resB] = await Promise.all([
    ModerationService.handleJoinRequestWelcomeDm(joinReqPayload),
    ModerationService.handleJoinRequestWelcomeDm(joinReqPayload)
  ]);
  (PostSender as any).send = origSend;
  const exactlyOneSent = (resA.sent && !resB.sent) || (!resA.sent && resB.sent);
  assert(exactlyOneSent && (resA.skipped === 'IN_FLIGHT' || resB.skipped === 'IN_FLIGHT'), 'Test 20: In-flight concurrent join requests cannot produce duplicate DMs');

  // ==========================================
  // TEST 21: Telegram 403 failure on join request does NOT trigger group fallback
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      contentType: 'text',
      text: 'Welcome requester!',
      triggerMode: 'join_request',
      fallbackEnabled: true,
      fallbackText: 'Group fallback alert!'
    }
  });
  // Simulate 403 on sendMessage to user_chat_id
  const origApiSendMessage = (telegramApi as any).sendMessage;
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    if (chatId === HUMAN_USER_1_CHAT_ID) {
      capturedCalls.push({ method: 'sendMessageFail', args: { chatId, text } });
      return { ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    }
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: 123, chat: { id: chatId } } };
  };
  const t21Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Leo' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const groupFallbackSent = capturedCalls.some(c => c.args.chatId === groupBId);
  assert(
    t21Res.sent === false &&
    t21Res.fallbackSent === false &&
    !groupFallbackSent,
    'Test 21: Telegram 403 failure on join request does NOT send fallback message into group',
    `t21Res=${JSON.stringify(t21Res)}, fallbackSent=${groupFallbackSent}`
  );

  // Restore sendMessage
  (telegramApi as any).sendMessage = origApiSendMessage;

  // ==========================================
  // TEST 22: Welcome DM does not approve or decline chat join requests
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: { enabled: true, contentType: 'text', text: 'Welcome {first_name}', triggerMode: 'join_request' },
    autoAcceptEnabled: false
  });
  await (botManager as any).handleChatJoinRequest({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Mona' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  await new Promise(r => setTimeout(r, 100));
  const approveCalls = capturedCalls.filter(c => c.method === 'approveChatJoinRequest');
  const declineCalls = capturedCalls.filter(c => c.method === 'declineChatJoinRequest');
  assert(approveCalls.length === 0 && declineCalls.length === 0, 'Test 22: Welcome DM does NOT auto-approve or auto-decline join requests');

  // ==========================================
  // TEST 23: Deterministic chronological ordering: Welcome DM attempt completes BEFORE autoAccept approval
  // ==========================================
  resetDedupeCaches();
  const callSequence: string[] = [];
  const origSendOrder = PostSender.send;
  (PostSender as any).send = async (dest: any, payload: any) => {
    callSequence.push(`dm_start:${dest}`);
    await new Promise(r => setTimeout(r, 30));
    callSequence.push(`dm_complete:${dest}`);
    return origSendOrder.call(PostSender, dest, payload);
  };
  const origApproveOrder = (telegramApi as any).approveChatJoinRequest;
  (telegramApi as any).approveChatJoinRequest = async (chatId: number | string, userId: number) => {
    callSequence.push(`approve:${userId}`);
    capturedCalls.push({ method: 'approveChatJoinRequest', args: { chatId, userId } });
    return { ok: true, result: true };
  };

  db.updateGroupSettings(groupBId, {
    welcomeDm: { enabled: true, contentType: 'text', text: 'Welcome {first_name}', triggerMode: 'join_request' },
    autoAcceptEnabled: true
  });
  await (botManager as any).handleChatJoinRequest({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Noah' },
    user_chat_id: HUMAN_USER_2_CHAT_ID,
    date: Date.now()
  });

  (PostSender as any).send = origSendOrder;
  (telegramApi as any).approveChatJoinRequest = origApproveOrder;

  const dmCompleteIdx = callSequence.indexOf(`dm_complete:${HUMAN_USER_2_CHAT_ID}`);
  const approveIdx = callSequence.indexOf(`approve:${HUMAN_USER_2_ID}`);
  const strictlyOrdered = dmCompleteIdx !== -1 && approveIdx !== -1 && dmCompleteIdx < approveIdx;
  const autoAcceptCalled = capturedCalls.some(c => c.method === 'approveChatJoinRequest' && c.args.userId === HUMAN_USER_2_ID);
  const welcomeDmCalled = capturedCalls.some(c => c.method === 'sendMessage' && c.args.chatId === HUMAN_USER_2_CHAT_ID);

  assert(
    strictlyOrdered && autoAcceptCalled && welcomeDmCalled,
    'Test 23: Welcome DM delivery attempt is strictly awaited before auto-accept executes',
    `callSequence=${JSON.stringify(callSequence)}`
  );

  // ==========================================
  // TEST 24: Multiple different users requesting same group get their own DM
  // ==========================================
  resetDedupeCaches();
  const resUser1 = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Olivia' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const resUser2 = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Paul' },
    user_chat_id: HUMAN_USER_2_CHAT_ID,
    date: Date.now()
  });
  assert(resUser1.sent === true && resUser2.sent === true, 'Test 24: Multiple unique users requesting join each receive their own Welcome DM');

  // ==========================================
  // TEST 25: Same user requesting two different groups gets DM for each group
  // ==========================================
  resetDedupeCaches();
  const groupCId = -10099494675;
  db.getGroupSettings(groupCId, 'Gamma Group');
  db.updateGroupSettings(groupCId, {
    welcomeDm: { enabled: true, contentType: 'text', text: 'Welcome to Gamma!', triggerMode: 'join_request' }
  });
  const resGroupB = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Quinn' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const resGroupC = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupCId, title: 'Gamma Group', type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Quinn' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  assert(resGroupB.sent === true && resGroupC.sent === true, 'Test 25: Same user requesting join to different groups gets DM for each group (isolated dedupe)');

  // ==========================================
  // TEST 26: Missing user_chat_id fails safely
  // ==========================================
  resetDedupeCaches();
  const t26Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Rachel' },
    user_chat_id: undefined as any,
    date: Date.now()
  });
  assert(t26Res.sent === false && t26Res.skipped === 'INVALID_PARAMETERS', 'Test 26: Missing user_chat_id fails gracefully without uncaught exceptions');

  // ==========================================
  // TEST 27: Audit log records Welcome DM action with trigger details
  // ==========================================
  resetDedupeCaches();
  const t27Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Sam', username: 'sammy' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  const logs = db.getGroupLogs(groupBId, 50);
  const joinReqLog = logs.find(l => l.details && l.details.includes('Sent Welcome Private DM (join_request) to Sam'));
  assert(t27Res.sent === true && joinReqLog !== undefined, 'Test 27: Audit log accurately records join_request Welcome DM dispatch');

  // ==========================================
  // TEST 28: Normal join first-contact group fallback remains intact
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupAId, {
    welcomeDm: {
      enabled: true,
      text: 'Normal join text',
      triggerMode: 'normal_join',
      fallbackEnabled: true,
      fallbackText: 'Please start Roxie, {first_name}!',
      fallbackButtonText: 'Start Roxie'
    }
  });
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    if (chatId === HUMAN_USER_1_ID) {
      return { ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    }
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: 999, chat: { id: chatId } } };
  };
  const t28Res = await ModerationService.handleWelcomeDm(groupAId, { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Tara' }, groupATitle, { trigger: 'normal_join' });
  const normalFallbackSent = capturedCalls.some(c => c.args.chatId === groupAId && c.args.text.includes('Please start Roxie, Tara!'));
  assert(
    t28Res.sent === false &&
    t28Res.fallbackSent === true &&
    normalFallbackSent,
    'Test 28: Normal join first-contact group fallback remains fully functional'
  );

  // Restore mock sendMessage
  (telegramApi as any).sendMessage = origApiSendMessage;

  // ==========================================
  // TEST 29: Failed join_request DM is NOT cached as already welcomed (retry succeeds)
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupBId, {
    welcomeDm: {
      enabled: true,
      text: 'Retryable welcome {first_name}!',
      triggerMode: 'join_request'
    }
  });
  let shouldFailDm = true;
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    if (shouldFailDm && chatId === HUMAN_USER_1_CHAT_ID) {
      return { ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    }
    capturedCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: 1001, chat: { id: chatId } } };
  };
  const firstFailedAttempt = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Uma' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  shouldFailDm = false;
  const secondRetryAttempt = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupBId, title: groupBTitle, type: 'supergroup' },
    from: { id: HUMAN_USER_1_ID, is_bot: false, first_name: 'Uma' },
    user_chat_id: HUMAN_USER_1_CHAT_ID,
    date: Date.now()
  });
  (telegramApi as any).sendMessage = origApiSendMessage;
  assert(
    firstFailedAttempt.sent === false && secondRetryAttempt.sent === true,
    'Test 29: Failed Welcome DM is evicted from deduplication cache so subsequent delivery succeeds'
  );

  // ==========================================
  // TEST 30: Auto-Accept enabled with default triggerMode='normal_join' sends DM on join_request before approval
  // ==========================================
  resetDedupeCaches();
  db.updateGroupSettings(groupAId, {
    autoAcceptEnabled: true,
    welcomeDm: {
      enabled: true,
      text: 'AutoAccept Welcome {first_name} to {groupname}!',
      triggerMode: 'normal_join'
    }
  });
  const t30Res = await ModerationService.handleJoinRequestWelcomeDm({
    chat: { id: groupAId, title: groupATitle, type: 'supergroup' },
    from: { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Victor' },
    user_chat_id: HUMAN_USER_2_CHAT_ID,
    date: Date.now()
  });
  const t30FollowUpNormalJoin = await ModerationService.handleWelcomeDm(
    groupAId,
    { id: HUMAN_USER_2_ID, is_bot: false, first_name: 'Victor' },
    groupATitle,
    { trigger: 'normal_join' }
  );
  db.updateGroupSettings(groupAId, { autoAcceptEnabled: false });
  assert(
    t30Res.sent === true &&
    t30FollowUpNormalJoin.sent === false &&
    t30FollowUpNormalJoin.skipped === 'ALREADY_WELCOMED_RECENTLY',
    'Test 30: Auto-accept group with default triggerMode="normal_join" sends Welcome DM on join_request and suppresses duplicate on normal_join'
  );

  console.log('\n================================================================');
  console.log(`📊 TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runWelcomeDmJoinRequestTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
