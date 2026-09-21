import assert from 'assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { ContentPolicyEngine } from '../server/telegram/policyEngine.js';
import { messageScheduler } from '../server/telegram/scheduler.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { TelegramMessage, TelegramUser, CachedMember } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`✅ PASS: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ FAIL: ${name}`);
      console.error(err);
      failed++;
    }
  })();
}

async function runFinalPreCommitVerification() {
  console.log('================================================================');
  console.log('   MISSROXIE FINAL PRE-COMMIT VERIFICATION SUITE');
  console.log('================================================================\n');

  const testChatId = -1009998889999;
  const testChatTitle = 'Pre-Commit Verification Supergroup';

  // Helper to mock Telegram API calls and record every single operation
  const originalSendMessage = telegramApi.sendMessage;
  const originalSendPhoto = telegramApi.sendPhoto;
  const originalSendAnimation = telegramApi.sendAnimation;
  const originalSendVideo = telegramApi.sendVideo;
  const originalSendDocument = telegramApi.sendDocument;
  const originalGetChatAdministrators = telegramApi.getChatAdministrators;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;
  const originalDeleteMessage = telegramApi.deleteMessage;

  const capturedCalls: Array<{ method: string; args: any[] }> = [];

  telegramApi.sendMessage = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendMessage', args });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } } as any;
  };
  telegramApi.sendPhoto = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendPhoto', args });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } } as any;
  };
  telegramApi.sendAnimation = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendAnimation', args });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } } as any;
  };
  telegramApi.sendVideo = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendVideo', args });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } } as any;
  };
  telegramApi.sendDocument = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendDocument', args });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } } as any;
  };
  telegramApi.deleteMessage = async (...args: any[]) => {
    capturedCalls.push({ method: 'deleteMessage', args });
    return { ok: true, result: true } as any;
  };
  telegramApi.getChatAdministrators = async () => {
    return {
      ok: true,
      result: [
        { user: { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' }, status: 'administrator' }
      ]
    } as any;
  };
  telegramApi.getChatMember = async (chatId: number, userId: number) => {
    if (userId === 999001) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' }
        }
      } as any;
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: userId, is_bot: false, first_name: 'Member' }
      }
    } as any;
  };
  telegramApi.getMe = async () => {
    return {
      ok: true,
      result: { id: 7770001, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' }
    } as any;
  };

  try {
    // =========================================================================
    // SECTION 1: /all SINGLE-MESSAGE VERIFICATION (5 members, 1 member, edge cases)
    // =========================================================================
    await test('1.1: /all with exactly 5 eligible members produces exactly 1 Telegram operation and 1 message', async () => {
      capturedCalls.length = 0;
      db.clearGroupMemory(testChatId);

      // Clean group member cache for this testChatId to isolate test
      for (const key of Object.keys((db as any).data.groupMembers || {})) {
        if (key.startsWith(`${testChatId}_`)) {
          delete (db as any).data.groupMembers[key];
        }
      }

      // Seed 4 members + Admin User (total exactly 5 eligible human members) + 1 Bot
      const membersToSeed = [
        { id: 1001, is_bot: false, first_name: 'Alice', username: 'alice_1' },
        { id: 1002, is_bot: false, first_name: 'Bob', username: 'bob_2' },
        { id: 1003, is_bot: false, first_name: 'Charlie', username: 'charlie_3' },
        { id: 1004, is_bot: false, first_name: 'Diana' }, // No username
        { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' },
        { id: 8888, is_bot: true, first_name: 'SpamBot', username: 'spambot' } // Bot to be excluded
      ];

      for (const m of membersToSeed) {
        db.cacheUser(m, testChatId);
      }

      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: { message_id: 1101, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender, text: '/all' },
        args: [],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleAll(ctx);

      // Verify exact operation count
      assert.strictEqual(capturedCalls.length, 1, `Must produce exactly 1 Telegram operation, got ${capturedCalls.length}`);
      assert.strictEqual(capturedCalls[0].method, 'sendMessage', 'Method must be sendMessage');

      const sentText = capturedCalls[0].args[1];
      assert.ok(sentText.includes('Hiee'), 'Default message header must be present');
      assert.ok(sentText.includes('@alice_1'), 'Alice must be mentioned');
      assert.ok(sentText.includes('@bob_2'), 'Bob must be mentioned');
      assert.ok(sentText.includes('@charlie_3'), 'Charlie must be mentioned');
      assert.ok(sentText.includes('<a href="tg://user?id=1004">Diana</a>'), 'Diana (no username) must have clickable HTML mention');
      assert.ok(sentText.includes('@admin_user'), 'Admin User must be mentioned');
      assert.ok(!sentText.includes('spambot'), 'Bot must NOT be mentioned');

      // Verify each member line has emoji
      const lines = sentText.split('\n').filter((l: string) => l.includes('→'));
      assert.strictEqual(lines.length, 5, `Must have exactly 5 member mention lines, got ${lines.length}`);
      for (const line of lines) {
        assert.match(line, /^[^\s]+ → (@[a-zA-Z0-9_]+|<a href="tg:\/\/user\?id=\d+">.*<\/a>)$/, `Line "${line}" must have emoji arrow mention`);
      }
    });

    await test('1.2: /all edge cases: 1 member, member without username, bot present, deleted/unavailable member', () => {
      // 1 member
      const singleMember: CachedMember[] = [{ userId: 501, username: 'solouser', firstName: 'Solo', lastSeen: new Date().toISOString() }];
      const res1 = CommandHandler.buildAllMentionsChunks(singleMember, 'Hey', 7770001, 12);
      assert.strictEqual(res1.chunks.length, 1);
      assert.strictEqual(res1.mentions.length, 1);
      assert.ok(res1.mentions[0].includes('@solouser'));

      // Member without username
      const noUnameMember: CachedMember[] = [{ userId: 502, firstName: 'NoUsername User', lastSeen: new Date().toISOString() }];
      const res2 = CommandHandler.buildAllMentionsChunks(noUnameMember, 'Hey', 7770001, 12);
      assert.strictEqual(res2.chunks.length, 1);
      assert.ok(res2.mentions[0].includes('<a href="tg://user?id=502">NoUsername User</a>'));

      // Bot present (must be excluded)
      const botMember: CachedMember[] = [
        { userId: 503, username: 'test_bot', firstName: 'Test Bot', lastSeen: new Date().toISOString(), is_bot: true } as any,
        { userId: 504, username: 'realperson', firstName: 'Real Person', lastSeen: new Date().toISOString() }
      ];
      const res3 = CommandHandler.buildAllMentionsChunks(botMember, 'Hey', 7770001, 12);
      assert.strictEqual(res3.mentions.length, 1);
      assert.ok(res3.mentions[0].includes('@realperson'));

      // Null/corrupted member entries
      const nullMember: any[] = [null, undefined, { userId: 0 }, { userId: 505, username: 'validguy', firstName: 'Valid', lastSeen: new Date().toISOString() }];
      const res4 = CommandHandler.buildAllMentionsChunks(nullMember, 'Hey', 7770001, 12);
      assert.strictEqual(res4.mentions.length, 1);
      assert.ok(res4.mentions[0].includes('@validguy'));
    });

    // =========================================================================
    // SECTION 2: /all + MEDIA (Photo, GIF, Video, Custom Text)
    // =========================================================================
    await test('2.1: Reply to photo + /all sends exactly ONE sendPhoto with mentions in caption', async () => {
      capturedCalls.length = 0;
      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: {
          message_id: 1201,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: adminSender,
          text: '/all',
          reply_to_message: {
            message_id: 1199,
            date: Date.now(),
            chat: { id: testChatId, type: 'supergroup' },
            photo: [{ file_id: 'photo_file_id_xyz', file_unique_id: 'p_u_1', width: 400, height: 400 }]
          }
        },
        args: [],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleAll(ctx);

      assert.strictEqual(capturedCalls.length, 1, 'Must execute exactly ONE Telegram API call');
      assert.strictEqual(capturedCalls[0].method, 'sendPhoto');
      assert.strictEqual(capturedCalls[0].args[0], testChatId);
      assert.strictEqual(capturedCalls[0].args[1], 'photo_file_id_xyz');
      assert.ok(capturedCalls[0].args[2].caption.includes('@alice_1'), 'Caption must contain mentions');
      assert.strictEqual(capturedCalls[0].args[2].parse_mode, 'HTML');
      assert.strictEqual(capturedCalls[0].args[2].reply_to_message_id, 1199);
    });

    await test('2.2: Reply to GIF + /all sends exactly ONE sendAnimation with mentions in caption', async () => {
      capturedCalls.length = 0;
      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: {
          message_id: 1202,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: adminSender,
          text: '/all',
          reply_to_message: {
            message_id: 1198,
            date: Date.now(),
            chat: { id: testChatId, type: 'supergroup' },
            animation: { file_id: 'anim_file_id_xyz', file_unique_id: 'a_u_1', width: 400, height: 400, duration: 4 }
          }
        },
        args: [],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleAll(ctx);

      assert.strictEqual(capturedCalls.length, 1, 'Must execute exactly ONE Telegram API call');
      assert.strictEqual(capturedCalls[0].method, 'sendAnimation');
      assert.strictEqual(capturedCalls[0].args[0], testChatId);
      assert.strictEqual(capturedCalls[0].args[1], 'anim_file_id_xyz');
      assert.ok(capturedCalls[0].args[2].caption.includes('@alice_1'), 'Caption must contain mentions');
      assert.strictEqual(capturedCalls[0].args[2].parse_mode, 'HTML');
      assert.strictEqual(capturedCalls[0].args[2].reply_to_message_id, 1198);
    });

    await test('2.3: Reply to Video + /all xyy sends exactly ONE sendVideo with custom text + mentions in caption', async () => {
      capturedCalls.length = 0;
      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: {
          message_id: 1203,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: adminSender,
          text: '/all xyy',
          reply_to_message: {
            message_id: 1197,
            date: Date.now(),
            chat: { id: testChatId, type: 'supergroup' },
            video: { file_id: 'video_file_id_xyz', file_unique_id: 'v_u_1', width: 400, height: 400, duration: 10 }
          }
        },
        args: ['xyy'],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleAll(ctx);

      assert.strictEqual(capturedCalls.length, 1, 'Must execute exactly ONE Telegram API call');
      assert.strictEqual(capturedCalls[0].method, 'sendVideo');
      assert.strictEqual(capturedCalls[0].args[0], testChatId);
      assert.strictEqual(capturedCalls[0].args[1], 'video_file_id_xyz');
      assert.ok(capturedCalls[0].args[2].caption.includes('xyy'), 'Caption must contain custom text xyy');
      assert.ok(capturedCalls[0].args[2].caption.includes('@alice_1'), 'Caption must contain mentions');
      assert.strictEqual(capturedCalls[0].args[2].parse_mode, 'HTML');
      assert.strictEqual(capturedCalls[0].args[2].reply_to_message_id, 1197);
    });

    // =========================================================================
    // SECTION 3: /IMAGE OFF/ON RUNTIME BEHAVIOR
    // =========================================================================
    await test('3.1: /image off -> photo NOT deleted, GIF/Video unchanged', async () => {
      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: { message_id: 1301, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender },
        args: ['off'],
        command: '/image',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleImageSetting(ctx);

      const normalUser: TelegramUser = { id: 444111, is_bot: false, first_name: 'User Photo', username: 'user_photo' };

      // Photo message
      const photoMsg: TelegramMessage = {
        message_id: 1302,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        photo: [{ file_id: 'p1', file_unique_id: 'pu1', width: 100, height: 100 }]
      };
      const photoDecision = await ContentPolicyEngine.evaluateMessage(photoMsg, testChatId, normalUser.id);
      assert.notStrictEqual(photoDecision.decision, 'BLOCK', 'Photo must NOT be blocked when /image is off');

      // GIF message
      const gifMsg: TelegramMessage = {
        message_id: 1303,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        animation: { file_id: 'g1', file_unique_id: 'gu1', width: 100, height: 100, duration: 2 }
      };
      const gifDecision = await ContentPolicyEngine.evaluateMessage(gifMsg, testChatId, normalUser.id);
      assert.notStrictEqual(gifDecision.decision, 'BLOCK', 'GIF must NOT be blocked when /image is off and gif lock is off');

      // Video message
      const videoMsg: TelegramMessage = {
        message_id: 1304,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        video: { file_id: 'v1', file_unique_id: 'vu1', width: 100, height: 100, duration: 5 }
      };
      const videoDecision = await ContentPolicyEngine.evaluateMessage(videoMsg, testChatId, normalUser.id);
      assert.notStrictEqual(videoDecision.decision, 'BLOCK', 'Video must NOT be blocked when /image is off and video lock is off');
    });

    await test('3.2: /image on -> photo protection restored and persists across state read', async () => {
      const adminSender: TelegramUser = { id: 999001, is_bot: false, first_name: 'Admin User', username: 'admin_user' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: { message_id: 1305, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender },
        args: ['on'],
        command: '/image',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin User'
      };

      await (CommandHandler as any).handleImageSetting(ctx);

      const normalUser: TelegramUser = { id: 444111, is_bot: false, first_name: 'User Photo', username: 'user_photo' };
      const photoMsg: TelegramMessage = {
        message_id: 1306,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        photo: [{ file_id: 'p1', file_unique_id: 'pu1', width: 100, height: 100 }]
      };
      const photoDecision = await ContentPolicyEngine.evaluateMessage(photoMsg, testChatId, normalUser.id);
      assert.strictEqual(photoDecision.decision, 'BLOCK', 'Photo MUST be blocked when /image is on');
      assert.strictEqual(photoDecision.lockType, 'photos');

      // Verify persistent settings reflect the update
      const freshSettings = db.getGroupSettings(testChatId);
      assert.strictEqual(freshSettings.imageProtection, true);
      assert.strictEqual(db.isLocked(testChatId, 'photos'), true);
    });

    // =========================================================================
    // SECTION 4: DM/MSG REGRESSION
    // =========================================================================
    await test('4.1: "dm", "msg", "DM", "MSG", "dm me later", "send me a msg" are NOT auto-deleted', async () => {
      const normalUser: TelegramUser = { id: 666111, is_bot: false, first_name: 'Normal Chatter' };
      const sampleTexts = [
        'dm',
        'msg',
        'DM',
        'MSG',
        'dm me',
        'dm me later',
        'send me a msg',
        'drop a msg',
        'please drop me a message in DM',
        'can you msg me tomorrow'
      ];

      for (const text of sampleTexts) {
        const msg: TelegramMessage = {
          message_id: Math.floor(Math.random() * 10000),
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup' },
          from: normalUser,
          text
        };
        const deleted = await ModerationService.handleLinkProtection(msg);
        assert.strictEqual(deleted, false, `Message "${text}" must NEVER be deleted`);
      }
    });

    await test('4.2: Legitimate spam URLs and unauthorized links ARE blocked', async () => {
      const normalUser: TelegramUser = { id: 666111, is_bot: false, first_name: 'Spammer' };
      db.updateGroupSettings(testChatId, { linksProtection: true, linksWhitelist: [] });

      const linkMsg: TelegramMessage = {
        message_id: 1401,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        text: 'Visit https://crypto-giveaway-scam.com now!'
      };
      const deleted = await ModerationService.handleLinkProtection(linkMsg);
      assert.strictEqual(deleted, true, 'Spam URL must be deleted');
    });

    // =========================================================================
    // SECTION 5: STICKERS ONLY & AUTOENGINE MODES
    // =========================================================================
    await test('5.1: Operating Mode STICKERS ONLY never sends fallback text', async () => {
      capturedCalls.length = 0;
      db.updateGroupSettings(testChatId, {
        autoEngine: {
          enabled: true,
          mode: 'stickers_only',
          lustMode: false,
          lustLevel: 0,
          reactionLevel: 0
        } as any
      });

      const decision = {
        chatId: testChatId,
        targetMessageId: 1501,
        action: 'sticker' as const,
        responseType: 'proactive' as const,
        content: 'I should say something witty to the group',
        reason: 'AutoEngine proactive'
      };

      await (ChatbotService as any).dispatchResponse(decision);

      const textCalls = capturedCalls.filter(c => c.method === 'sendMessage');
      assert.strictEqual(textCalls.length, 0, 'No text fallback must EVER be dispatched in stickers_only mode');
    });

    // =========================================================================
    // SECTION 6: PROMPT LEAK SOURCE & PARSER VERIFICATION
    // =========================================================================
    await test('6.1: Pipeline verification: meta/instruction prompts are intercepted and never sent to users', () => {
      const forbiddenOutputs = [
        'the user say /help',
        'the user says /rules',
        'the user said /ban',
        'the user is asking /settings',
        'reacting to the user message...',
        'TARGET MESSAGE TO REACT TO: hello',
        '[INSTRUCTION]: Respond warmly as girlfriend.',
        '[TASK]: Chime in with 1 sentence.',
        'System: You are Roxie, an AI companion.',
        'Assistant: I am replying now.',
        'User: tell me more'
      ];

      for (const output of forbiddenOutputs) {
        const cleaned = ChatbotService.cleanAiText(output, 'hello', 'User');
        const isLeak = ChatbotService.isInstructionOrMetaLeak(output) || (cleaned.length > 0 && ChatbotService.isInstructionOrMetaLeak(cleaned));
        assert.ok(isLeak, `Output "${output}" must be detected as meta leak`);
      }

      // Verify legitimate response passes cleanly
      const legitimateOutput = 'Yeah, that sounds fun 😄';
      const cleanLegit = ChatbotService.cleanAiText(legitimateOutput, 'hello', 'User');
      const isLegitLeak = ChatbotService.isInstructionOrMetaLeak(cleanLegit);
      assert.strictEqual(isLegitLeak, false, 'Legitimate response must pass normally');
      assert.strictEqual(cleanLegit, 'Yeah, that sounds fun 😄');
    });

    // =========================================================================
    // SECTION 7: REPEATING SCHEDULE PERSISTENCE & MEMBER ROTATION
    // =========================================================================
    await test('7.1: Schedule with text + @random rotates members and persists state across simulated reload', async () => {
      process.env.ENABLE_SCHEDULER = 'true';
      capturedCalls.length = 0;

      // Seed 3 members
      db.cacheUser({ id: 8001, first_name: 'Member 1', username: 'm_one' }, testChatId);
      db.cacheUser({ id: 8002, first_name: 'Member 2', username: 'm_two' }, testChatId);
      db.cacheUser({ id: 8003, first_name: 'Member 3', username: 'm_three' }, testChatId);

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        999001,
        'Admin User',
        '1m',
        'Hello @random, have an awesome day!',
        'text'
      );

      assert.strictEqual(schedRes.success, true);
      const scheduleId = schedRes.schedule!.id;
      assert.strictEqual(schedRes.schedule!.mentionMode, 'random_member');

      // Run 1
      db.updateSchedule(scheduleId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      const run1Msg = capturedCalls[capturedCalls.length - 1]?.args[1];
      const run1State = db.getScheduleById(scheduleId)!;
      assert.ok(run1State.lastMentionedUserId, 'Run 1 must record lastMentionedUserId');
      const firstUserId = run1State.lastMentionedUserId;

      // Run 2
      capturedCalls.length = 0;
      db.updateSchedule(scheduleId, { nextRun: new Date(Date.now() - 1000).toISOString() });
      await messageScheduler.checkAndExecuteSchedules();

      const run2Msg = capturedCalls[capturedCalls.length - 1]?.args[1];
      const run2State = db.getScheduleById(scheduleId)!;
      const secondUserId = run2State.lastMentionedUserId;

      assert.notStrictEqual(firstUserId, secondUserId, `Run 2 member (${secondUserId}) must NOT repeat Run 1 member (${firstUserId})`);
      assert.notStrictEqual(run1Msg, run2Msg, 'Run 2 broadcast text must differ from Run 1');

      // Simulate reload / retrieval from database storage
      const reloadedSchedule = db.getScheduleById(scheduleId);
      assert.ok(reloadedSchedule);
      assert.strictEqual(reloadedSchedule.mentionMode, 'random_member', 'mentionMode must be preserved');
      assert.strictEqual(reloadedSchedule.lastMentionedUserId, secondUserId, 'lastMentionedUserId must be preserved');

      messageScheduler.deleteSchedule(testChatId, scheduleId, 999001);
    });

    // =========================================================================
    // SECTION 8: SCHEDULE MEDIA COMBINED OPERATIONS
    // =========================================================================
    await test('8.1: Scheduler text + media + tag dispatches ONE combined media+caption operation', async () => {
      process.env.ENABLE_SCHEDULER = 'true';
      capturedCalls.length = 0;

      const mediaTypes: Array<{ type: 'photo' | 'video' | 'animation' | 'document'; fileId: string; expectedMethod: string }> = [
        { type: 'photo', fileId: 'sched_p_1', expectedMethod: 'sendPhoto' },
        { type: 'video', fileId: 'sched_v_1', expectedMethod: 'sendVideo' },
        { type: 'animation', fileId: 'sched_a_1', expectedMethod: 'sendAnimation' },
        { type: 'document', fileId: 'sched_d_1', expectedMethod: 'sendDocument' }
      ];

      for (const item of mediaTypes) {
        capturedCalls.length = 0;
        const res = messageScheduler.createSchedule(
          testChatId,
          testChatTitle,
          999001,
          'Admin User',
          '1m',
          `Check out this media @member!`,
          item.type,
          item.fileId
        );

        assert.strictEqual(res.success, true);
        const schedId = res.schedule!.id;
        db.updateSchedule(schedId, { nextRun: new Date(Date.now() - 1000).toISOString() });

        await messageScheduler.checkAndExecuteSchedules();

        assert.strictEqual(capturedCalls.length, 1, `Must execute exactly ONE operation for ${item.type}`);
        assert.strictEqual(capturedCalls[0].method, item.expectedMethod);
        assert.strictEqual(capturedCalls[0].args[0], testChatId);
        assert.strictEqual(capturedCalls[0].args[1], item.fileId);
        const caption = capturedCalls[0].args[2].caption;
        assert.ok(!caption.includes('@member'), 'Placeholder @member must be replaced');
        assert.ok(caption.includes('@') || caption.includes('tg://user?id='), 'Caption must contain member mention');
        assert.strictEqual(capturedCalls[0].args[2].parse_mode, 'HTML');

        messageScheduler.deleteSchedule(testChatId, schedId, 999001);
      }
    });

    // =========================================================================
    // SECTION 9: FAILURE ISOLATION
    // =========================================================================
    await test('9.1: One failing schedule (invalid file ID / Telegram failure) does NOT stop other schedules', async () => {
      process.env.ENABLE_SCHEDULER = 'true';
      capturedCalls.length = 0;

      // Mock failure for file ID 'failing_file_id'
      const failingSendPhoto = telegramApi.sendPhoto;
      telegramApi.sendPhoto = async (chatId: number, fileId: string, options?: any) => {
        if (fileId === 'failing_file_id') {
          return { ok: false, error_code: 400, description: 'Bad Request: wrong file identifier' } as any;
        }
        return failingSendPhoto(chatId, fileId, options);
      };

      const schedFail = messageScheduler.createSchedule(testChatId, testChatTitle, 999001, 'Admin User', '1m', 'Failing schedule', 'photo', 'failing_file_id');
      const schedGood = messageScheduler.createSchedule(testChatId, testChatTitle, 999001, 'Admin User', '1m', 'Good schedule', 'photo', 'working_photo_id');

      assert.ok(schedFail.schedule);
      assert.ok(schedGood.schedule);

      db.updateSchedule(schedFail.schedule.id, { nextRun: new Date(Date.now() - 1000).toISOString() });
      db.updateSchedule(schedGood.schedule.id, { nextRun: new Date(Date.now() - 1000).toISOString() });

      await messageScheduler.checkAndExecuteSchedules();

      // Good schedule must still have executed successfully despite schedFail failing
      const goodCall = capturedCalls.find(c => c.args[1] === 'working_photo_id');
      assert.ok(goodCall, 'Working schedule MUST execute even if another schedule fails');

      messageScheduler.deleteSchedule(testChatId, schedFail.schedule.id, 999001);
      messageScheduler.deleteSchedule(testChatId, schedGood.schedule.id, 999001);
      telegramApi.sendPhoto = failingSendPhoto;
    });

  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.sendPhoto = originalSendPhoto;
    telegramApi.sendAnimation = originalSendAnimation;
    telegramApi.sendVideo = originalSendVideo;
    telegramApi.sendDocument = originalSendDocument;
    telegramApi.getChatAdministrators = originalGetChatAdministrators;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
    telegramApi.deleteMessage = originalDeleteMessage;
    delete process.env.ENABLE_SCHEDULER;
  }

  console.log('\n================================================================');
  console.log(`FINAL PRE-COMMIT VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runFinalPreCommitVerification().catch(err => {
  console.error('Fatal error in final verification suite:', err);
  process.exit(1);
});
