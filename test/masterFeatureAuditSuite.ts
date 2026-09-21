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

async function runAllTests() {
  console.log('====================================================');
  console.log('   MISSROXIE MASTER FEATURE AUDIT & REGRESSION SUITE');
  console.log('====================================================\n');

  const testChatId = -1009998887771;
  const testChatTitle = 'Master Audit Test Group';

  // Helper to mock Telegram API calls
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
  telegramApi.getChatAdministrators = async (...args: any[]) => {
    return {
      ok: true,
      result: [
        { user: { id: 999111, is_bot: false, first_name: 'Admin User', username: 'group_admin' }, status: 'administrator' }
      ]
    } as any;
  };
  telegramApi.getChatMember = async (chatId: number, userId: number) => {
    if (userId === 999111) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: 999111, is_bot: false, first_name: 'Admin User', username: 'group_admin' },
          can_delete_messages: true,
          can_restrict_members: true,
          can_promote_members: true,
          can_change_info: true,
          can_invite_users: true,
          can_pin_messages: true
        }
      } as any;
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: userId, is_bot: false, first_name: 'Regular' }
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
    // ----------------------------------------------------
    // AREA 1: /image off and /image on + Photo Protection
    // ----------------------------------------------------
    await test('AREA 1: /image off disables photo/image protection for normal users', async () => {
      // Set image protection off
      const adminSender: TelegramUser = { id: 999111, is_bot: false, first_name: 'Admin', username: 'group_admin' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: { message_id: 101, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender },
        args: ['off'],
        command: '/image',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin'
      };

      await (CommandHandler as any).handleImageSetting(ctx);
      const settings = db.getGroupSettings(testChatId);
      assert.strictEqual(settings.imageProtection, false, 'imageProtection should be false');
      assert.strictEqual(settings.photosProtection, false, 'photosProtection should be false');
      assert.strictEqual(settings.mediaProtection, false, 'mediaProtection should be false');
      assert.strictEqual(db.isLocked(testChatId, 'photos'), false, 'photos lock should be false');

      // Test message evaluation for regular user with photo
      const normalUser: TelegramUser = { id: 123456, is_bot: false, first_name: 'Regular', username: 'normal_user' };
      const photoMessage: TelegramMessage = {
        message_id: 202,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        photo: [{ file_id: 'photo_abc', file_unique_id: 'u_abc', width: 100, height: 100 }]
      };

      const evalResult = await ContentPolicyEngine.evaluateMessage(photoMessage, testChatId, normalUser.id);
      assert.notStrictEqual(evalResult.decision, 'BLOCK', 'Photo from normal user should NOT be blocked when /image is off');
    });

    await test('AREA 1: /image on enables photo/image protection and blocks normal users', async () => {
      const adminSender: TelegramUser = { id: 999111, is_bot: false, first_name: 'Admin', username: 'group_admin' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: { message_id: 102, date: Date.now(), chat: { id: testChatId, type: 'supergroup', title: testChatTitle }, from: adminSender },
        args: ['on'],
        command: '/image',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin'
      };

      await (CommandHandler as any).handleImageSetting(ctx);
      const settings = db.getGroupSettings(testChatId);
      assert.strictEqual(settings.imageProtection, true, 'imageProtection should be true');

      const normalUser: TelegramUser = { id: 123456, is_bot: false, first_name: 'Regular', username: 'normal_user' };
      const photoMessage: TelegramMessage = {
        message_id: 203,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        photo: [{ file_id: 'photo_abc', file_unique_id: 'u_abc', width: 100, height: 100 }]
      };

      const evalResult = await ContentPolicyEngine.evaluateMessage(photoMessage, testChatId, normalUser.id);
      assert.strictEqual(evalResult.decision, 'BLOCK', 'Photo from normal user MUST be blocked when /image is on');
      assert.strictEqual(evalResult.lockType, 'photos');
    });

    await test('AREA 1: /image on does NOT block GIFs or Videos if their own locks are off', async () => {
      const normalUser: TelegramUser = { id: 123456, is_bot: false, first_name: 'Regular', username: 'normal_user' };
      const gifMessage: TelegramMessage = {
        message_id: 204,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup' },
        from: normalUser,
        animation: { file_id: 'gif_123', file_unique_id: 'u_gif', width: 100, height: 100, duration: 2 }
      };

      const evalResult = await ContentPolicyEngine.evaluateMessage(gifMessage, testChatId, normalUser.id);
      assert.notStrictEqual(evalResult.decision, 'BLOCK', 'GIF should NOT be blocked by /image on if gif lock is off');
    });

    // ----------------------------------------------------
    // AREA 2: Removal of "dm", "msg" auto-deletion
    // ----------------------------------------------------
    await test('AREA 2: Generic phrases "dm", "msg", "send me a msg", "dm me later" are NEVER auto-deleted', async () => {
      const normalUser: TelegramUser = { id: 555666, is_bot: false, first_name: 'Chatter', username: 'regular_chatter' };
      const testPhrases = [
        'dm',
        'msg',
        'send me a msg',
        'send me a message',
        'dm me later',
        'drop me a msg please',
        'mujhe dm kro',
        'DM me for details',
        'MSG me fast',
        'can we chat in dm',
        'check your dm',
        'ping me in private'
      ];

      for (const phrase of testPhrases) {
        const msg: TelegramMessage = {
          message_id: Math.floor(Math.random() * 10000),
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: normalUser,
          text: phrase
        };

        const deleted = await ModerationService.handleLinkProtection(msg);
        assert.strictEqual(deleted, false, `Phrase "${phrase}" must NEVER be deleted by LinkProtection`);
      }
    });

    await test('AREA 2: Legitimate links (http, https, t.me) ARE still blocked and moderated', async () => {
      const normalUser: TelegramUser = { id: 555666, is_bot: false, first_name: 'Spammer', username: 'spammer_user' };
      db.updateGroupSettings(testChatId, { linksProtection: true, linksWhitelist: [] });

      const linkMsg: TelegramMessage = {
        message_id: 301,
        date: Date.now(),
        chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
        from: normalUser,
        text: 'Join my group https://t.me/spam_group_link'
      };

      const deleted = await ModerationService.handleLinkProtection(linkMsg);
      assert.strictEqual(deleted, true, 'Legitimate spam URL must be detected and deleted');
    });

    // ----------------------------------------------------
    // AREA 3: /all formatting with random emoji per member
    // ----------------------------------------------------
    await test('AREA 3: buildAllMentionsChunks formats members with clickable emoji mentions in single row', () => {
      const testMembers: CachedMember[] = [
        { userId: 1001, username: 'alice', firstName: 'Alice', lastSeen: new Date().toISOString() },
        { userId: 1002, firstName: 'Bob', lastSeen: new Date().toISOString() }, // No username
        { userId: 1003, username: 'charlie', firstName: 'Charlie', lastSeen: new Date().toISOString() },
        { userId: 7770001, username: 'MissRoxie_Bot', firstName: 'Bot', lastSeen: new Date().toISOString() } // Bot self
      ];

      const { mentions, chunks } = CommandHandler.buildAllMentionsChunks(testMembers, 'Attention everyone!', 7770001, 10);
      assert.strictEqual(mentions.length, 3, 'Should include 3 real members (excluding bot)');

      // Verify each mention is a clickable HTML link around an emoji
      for (const m of mentions) {
        assert.match(m, /^<a href="tg:\/\/user\?id=\d+">[^<]+<\/a>$/, `Mention "${m}" must be clickable emoji link`);
      }

      assert.strictEqual(chunks.length, 1, 'Should fit in 1 chunk');
      assert.ok(chunks[0].includes('Attention everyone!'), 'Chunk must contain default message');
      assert.ok(chunks[0].includes('tg://user?id=1001'), 'Chunk must include Alice HTML mention');
      assert.ok(chunks[0].includes('tg://user?id=1002'), 'Chunk must include Bob HTML mention');
      assert.ok(chunks[0].includes('tg://user?id=1003'), 'Chunk must include Charlie HTML mention');
      assert.ok(!chunks[0].includes('@alice'), 'Must not display @username');
    });

    // ----------------------------------------------------
    // AREA 4: /all with replied media (photo, GIF, video, doc)
    // ----------------------------------------------------
    await test('AREA 4: /all when replying to a photo sends sendPhoto with mentions in caption', async () => {
      capturedCalls.length = 0;

      // Seed group members in db and set admin rank
      db.cacheUser({ id: 2001, first_name: 'Member One', username: 'm_one' }, testChatId);
      db.cacheUser({ id: 2002, first_name: 'Member Two' }, testChatId);

      const adminSender: TelegramUser = { id: 999111, is_bot: false, first_name: 'Admin User', username: 'group_admin' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: {
          message_id: 501,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: adminSender,
          text: '/all Special photo announcement',
          reply_to_message: {
            message_id: 400,
            date: Date.now(),
            chat: { id: testChatId, type: 'supergroup' },
            photo: [{ file_id: 'file_photo_123', file_unique_id: 'u_p1', width: 200, height: 200 }]
          }
        },
        args: ['Special', 'photo', 'announcement'],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin'
      };

      await (CommandHandler as any).handleAll(ctx);

      const photoCall = capturedCalls.find(c => c.method === 'sendPhoto');
      assert.ok(photoCall, 'Must call sendPhoto when replying to a photo');
      assert.strictEqual(photoCall.args[0], testChatId);
      assert.strictEqual(photoCall.args[1], 'file_photo_123');
      assert.ok(photoCall.args[2].caption.includes('Special photo announcement'), 'Caption must contain custom text');
      assert.ok(photoCall.args[2].caption.includes('<a href="tg://user?id=2001">'), 'Caption must contain member tag');
      assert.strictEqual(photoCall.args[2].parse_mode, 'HTML');
    });

    await test('AREA 4: /all when replying to an animation sends sendAnimation with mentions in caption', async () => {
      capturedCalls.length = 0;
      const adminSender: TelegramUser = { id: 999111, is_bot: false, first_name: 'Admin User', username: 'group_admin' };
      const ctx: CommandContext = {
        chatId: testChatId,
        chatTitle: testChatTitle,
        sender: adminSender,
        message: {
          message_id: 502,
          date: Date.now(),
          chat: { id: testChatId, type: 'supergroup', title: testChatTitle },
          from: adminSender,
          text: '/all Check this GIF',
          reply_to_message: {
            message_id: 401,
            date: Date.now(),
            chat: { id: testChatId, type: 'supergroup' },
            animation: { file_id: 'file_anim_456', file_unique_id: 'u_a1', width: 200, height: 200, duration: 3 }
          }
        },
        args: ['Check', 'this', 'GIF'],
        command: '/all',
        isAnonymousAdmin: false,
        adminDisplayName: 'Admin'
      };

      await (CommandHandler as any).handleAll(ctx);

      const animCall = capturedCalls.find(c => c.method === 'sendAnimation');
      assert.ok(animCall, 'Must call sendAnimation when replying to an animation');
      assert.strictEqual(animCall.args[0], testChatId);
      assert.strictEqual(animCall.args[1], 'file_anim_456');
      assert.ok(animCall.args[2].caption.includes('Check this GIF'), 'Caption must contain custom text');
      assert.strictEqual(animCall.args[2].parse_mode, 'HTML');
    });

    // ----------------------------------------------------
    // AREA 5: Scheduler Text + Tag + Media executed as ONE operation
    // ----------------------------------------------------
    await test('AREA 5: Scheduler with text + @member + photo executes as ONE sendPhoto operation', async () => {
      capturedCalls.length = 0;
      process.env.ENABLE_SCHEDULER = 'true';

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        999111,
        'Admin',
        '1m',
        'Hey @member look at this cool photo!',
        'photo',
        'scheduled_photo_999'
      );

      assert.strictEqual(schedRes.success, true);
      assert.ok(schedRes.schedule);
      assert.strictEqual(schedRes.schedule.mentionMode, 'random_member');

      // Set nextRun to past to trigger immediately
      schedRes.schedule.nextRun = new Date(Date.now() - 1000).toISOString();
      db.updateSchedule(schedRes.schedule.id, { nextRun: schedRes.schedule.nextRun });

      await messageScheduler.checkAndExecuteSchedules();

      const photoCalls = capturedCalls.filter(c => c.method === 'sendPhoto');
      assert.strictEqual(photoCalls.length, 1, 'Must execute exactly ONE sendPhoto operation');
      assert.strictEqual(photoCalls[0].args[0], testChatId);
      assert.strictEqual(photoCalls[0].args[1], 'scheduled_photo_999');
      const caption = photoCalls[0].args[2].caption;
      assert.ok(!caption.includes('@member'), 'Placeholder @member must be replaced');
      assert.ok(caption.includes('@') || caption.includes('tg://user?id='), 'Must contain actual member mention');
      assert.strictEqual(photoCalls[0].args[2].parse_mode, 'HTML');

      // Cleanup schedule
      messageScheduler.deleteSchedule(testChatId, schedRes.schedule.id, 999111);
    });

    // ----------------------------------------------------
    // AREA 6: Repeating schedule member mention rotation
    // ----------------------------------------------------
    await test('AREA 6: Repeating schedule rotates member mentions without repeating the same member consecutively', async () => {
      capturedCalls.length = 0;
      process.env.ENABLE_SCHEDULER = 'true';

      // Seed 3 members
      db.cacheUser({ id: 3001, first_name: 'Member A', username: 'user_a' }, testChatId);
      db.cacheUser({ id: 3002, first_name: 'Member B', username: 'user_b' }, testChatId);
      db.cacheUser({ id: 3003, first_name: 'Member C', username: 'user_c' }, testChatId);

      const schedRes = messageScheduler.createSchedule(
        testChatId,
        testChatTitle,
        999111,
        'Admin',
        '1m',
        'Daily shoutout to @member!',
        'text'
      );

      assert.strictEqual(schedRes.success, true);
      const scheduleId = schedRes.schedule!.id;

      const mentionsSequence: string[] = [];

      // Run 5 consecutive executions
      for (let run = 0; run < 5; run++) {
        capturedCalls.length = 0;
        const currentSched = db.getScheduleById(scheduleId)!;
        db.updateSchedule(scheduleId, { nextRun: new Date(Date.now() - 1000).toISOString() });

        await messageScheduler.checkAndExecuteSchedules();

        const msgCall = capturedCalls.find(c => c.method === 'sendMessage');
        assert.ok(msgCall, `Run ${run + 1} must send message`);
        const text = msgCall.args[1];
        mentionsSequence.push(text);

        const updatedSched = db.getScheduleById(scheduleId)!;
        assert.ok(updatedSched.lastMentionedUserId, `Run ${run + 1} must record lastMentionedUserId`);

        if (run > 0) {
          const prevMention = mentionsSequence[run - 1];
          // Assert rotation: consecutive runs must not mention the exact same user
          assert.notStrictEqual(text, prevMention, `Run ${run + 1} mention (${text}) should not repeat immediate previous run (${prevMention})`);
        }
      }

      messageScheduler.deleteSchedule(testChatId, scheduleId, 999111);
    });

    // ----------------------------------------------------
    // AREA 7: STICKERS ONLY and Prompt Safety invariants
    // ----------------------------------------------------
    await test('AREA 7: AutoEngine stickers_only mode never sends fallback text', async () => {
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

      // Dispatch a decision where sticker fails eligibility
      const decision = {
        chatId: testChatId,
        targetMessageId: 100,
        action: 'sticker' as const,
        responseType: 'proactive' as const,
        content: 'Fallback text that must never be sent in stickers_only mode',
        reason: 'AutoEngine proactive'
      };

      await (ChatbotService as any).dispatchResponse(decision);

      const textCalls = capturedCalls.filter(c => c.method === 'sendMessage');
      assert.strictEqual(textCalls.length, 0, 'Must NOT send fallback text message when mode is stickers_only');
    });

    await test('AREA 7: isInstructionOrMetaLeak catches internal prompt leak patterns', () => {
      const leakedSamples = [
        'the user say /all',
        'As Roxie, I should reply warmly.',
        '[INSTRUCTION]: Respond in one sentence.',
        '[TASK]: Chime into the group.',
        'System: You are Roxie, a helpful assistant.',
        'Here is the response: Hello there!'
      ];

      for (const sample of leakedSamples) {
        const isLeak = (ChatbotService as any).isInstructionOrMetaLeak(sample);
        assert.strictEqual(isLeak, true, `Sample "${sample}" must be recognized as meta leak`);
      }

      const validReplies = [
        'Hey everyone! Kaise ho sab? 😊',
        'Arey waah, kya chal raha hai yahan?',
        'Good morning guys! Hope you all have a great day ✨'
      ];

      for (const valid of validReplies) {
        const isLeak = (ChatbotService as any).isInstructionOrMetaLeak(valid);
        assert.strictEqual(isLeak, false, `Valid reply "${valid}" should NOT be flagged as leak`);
      }
    });

  } finally {
    // Restore original Telegram API methods
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

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
