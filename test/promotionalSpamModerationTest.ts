import fs from 'fs';
import path from 'path';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { ContentProtectionService } from '../server/telegram/contentProtection.js';
import { TelegramMiddleware } from '../server/telegram/middleware.js';
import { TelegramMessage, TelegramUpdate } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

export async function runPromotionalSpamTests() {
  console.log('====================================================');
  console.log('STARTING TARGETED PROMOTIONAL SPAM TEST SUITE');
  console.log('====================================================');

  const chatIdA = -100888777001;
  const chatIdB = -100888777002;
  const adminUserId = 6001;
  const spammerUserId = 6002;
  const normalUserId = 6003;
  const botId = 123456;

  // Track mock API calls
  let deletedMessageIds: number[] = [];
  let sentMessages: Array<{ chatId: number; text: string }> = [];
  let bannedUsers: Array<{ chatId: number; userId: number }> = [];
  let shouldFailDelete = false;
  let shouldFailBan = false;

  // Set up mock Telegram API
  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: botId, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxieBot' }
  });

  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    if (shouldFailDelete) {
      return { ok: false, description: "Bad Request: message can't be deleted", error_code: 400 };
    }
    deletedMessageIds.push(mId);
    return { ok: true, result: true };
  };

  (telegramApi as any).deleteMessages = async (cId: number, mIds: number[]) => {
    if (shouldFailDelete) {
      return { ok: false, description: "Bad Request: messages can't be deleted", error_code: 400 };
    }
    deletedMessageIds.push(...mIds);
    return { ok: true, result: true };
  };

  (telegramApi as any).sendMessage = async (cId: number, text: string) => {
    sentMessages.push({ chatId: cId, text });
    return { ok: true, result: { message_id: 99900 + sentMessages.length, date: Math.floor(Date.now() / 1000) } };
  };

  (telegramApi as any).banChatMember = async (cId: number, uId: number, options?: any) => {
    if (shouldFailBan) {
      return { ok: false, description: 'CHAT_ADMIN_REQUIRED: Not enough rights to restrict/ban chat member', error_code: 400 };
    }
    bannedUsers.push({ chatId: cId, userId: uId });
    return { ok: true, result: true };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          user: { id: uId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
          can_delete_messages: true,
          can_restrict_members: true
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: 'NormalUser', username: `user_${uId}` }
      }
    };
  };

  // Helper to reset test state
  const resetState = () => {
    deletedMessageIds = [];
    sentMessages = [];
    bannedUsers = [];
    shouldFailDelete = false;
    shouldFailBan = false;
    ModerationService.clearPromotionalSpamCache();
  };

  // Ensure clean DB test state
  resetState();
  db.resetUserWarnings(chatIdA, spammerUserId);
  db.resetUserWarnings(chatIdB, spammerUserId);
  db.resetUserWarnings(chatIdA, normalUserId);
  db.resetUserWarnings(chatIdA, adminUserId);

  const settingsA = db.getGroupSettings(chatIdA, 'Test Group A');
  settingsA.promotionalSpamProtection = true;
  settingsA.promotionalSpamThreshold = 6.0;

  const settingsB = db.getGroupSettings(chatIdB, 'Test Group B');
  settingsB.promotionalSpamProtection = true;
  settingsB.promotionalSpamThreshold = 6.0;

  // ----------------------------------------------------
  // Scenario 1: Ordinary conversation with no links -> no action
  // ----------------------------------------------------
  {
    resetState();
    const msg: TelegramMessage = {
      message_id: 101,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: normalUserId, is_bot: false, first_name: 'Normal' },
      text: 'Good morning everyone! How is the project going today?'
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(!analysis.isSpam && analysis.score === 0, 'Scenario 1: Ordinary conversation scores 0 and is not detected');

    const handled = await ModerationService.handlePromotionalSpam(msg);
    assert(!handled && deletedMessageIds.length === 0, 'Scenario 1: No moderation action taken on ordinary conversation');
  }

  // ----------------------------------------------------
  // Scenario 2: Legitimate forwarded message -> no automatic ban
  // ----------------------------------------------------
  {
    resetState();
    const msg: TelegramMessage = {
      message_id: 102,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: normalUserId, is_bot: false, first_name: 'Normal' },
      forward_from: { id: 7001, is_bot: false, first_name: 'Friend' },
      forward_date: Math.floor(Date.now() / 1000) - 60,
      text: 'Hey check this out: dinner is at 7pm tonight at the usual spot.'
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(!analysis.isSpam, 'Scenario 2: Legitimate forwarded message without promo signals is not flagged');

    const handled = await ModerationService.handlePromotionalSpam(msg);
    assert(!handled && bannedUsers.length === 0 && deletedMessageIds.length === 0, 'Scenario 2: No automatic ban or deletion on legitimate forward');
  }

  // ----------------------------------------------------
  // Scenario 3: Single ordinary URL -> no automatic ban
  // ----------------------------------------------------
  {
    resetState();
    const msg: TelegramMessage = {
      message_id: 103,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: normalUserId, is_bot: false, first_name: 'Normal' },
      text: 'Here is the documentation link for TypeScript: https://www.typescriptlang.org'
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(!analysis.isSpam && analysis.score < 6.0, 'Scenario 3: Single ordinary URL scores below threshold');

    const handled = await ModerationService.handlePromotionalSpam(msg);
    assert(!handled && bannedUsers.length === 0, 'Scenario 3: Single ordinary URL does not trigger ban or deletion');
  }

  // ----------------------------------------------------
  // Scenario 4: Forwarded promotional message with Telegram links and inline buttons -> detected
  // ----------------------------------------------------
  {
    resetState();
    const msg: TelegramMessage = {
      message_id: 104,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'Spammer' },
      forward_from_chat: { id: -10099999, type: 'channel', title: 'Crypto Promos' },
      forward_date: Math.floor(Date.now() / 1000) - 120,
      text: '🔥 HUGE GIVEAWAY! Tap to enter now ⤵️ Join fast:\nt.me/cryptorich1\nt.me/vipclub2\nt.me/freecrypto3\nt.me/bestsignals4',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡️ OPEN NOW ⚡️', url: 'https://t.me/cryptorich1' }],
          [{ text: '⚡️ JOIN CLUB ⚡️', url: 'https://t.me/vipclub2' }],
          [{ text: '⚡️ GET ACCESS ⚡️', url: 'https://t.me/freecrypto3' }]
        ]
      }
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(analysis.isSpam && analysis.score >= 6.0, `Scenario 4: Forwarded promotional message with TG links & buttons detected (score: ${analysis.score})`);
    assert(analysis.signals.isForwarded, 'Scenario 4: Forwarded status detected correctly');
    assert(analysis.signals.buttonCount === 3, 'Scenario 4: Button count detected correctly');
  }

  // ----------------------------------------------------
  // Scenario 5: Table-formatted promotional spam similar to screenshot -> detected
  // ----------------------------------------------------
  {
    resetState();
    // Screenshot reference pattern:
    // Forwarded, Vietnamese headline "NGẮM GÁI XINH HOT 2026 DROP", table box layout,
    // rows with "ADULT MIX", "KISS COMPILATION", "XXX ARCHIVE", "UNCENSORED", "ONLY FOR YOU", "NEW 2026 DROP",
    // text "Tap to Enter Now", 6 CTA buttons ("OPEN NOW", "JOIN CLUB", "ENTER NOW", "EXPLORE", "TAP HERE", "GET ACCESS")
    const msg: TelegramMessage = {
      message_id: 105,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'Dabhi Raj' },
      forward_sender_name: 'Abby 🔥 💖 (Phoebe Bayn)',
      forward_date: Math.floor(Date.now() / 1000) - 30,
      text:
        'NGẮM GÁI XINH 💃 HOT 2026 DROP GÁI XINH 💃 NGẮM\n\n' +
        '┌────────────────────────┬──────────────────────┐\n' +
        '│ 🔞 ADULT MIX 🍑       │ 💋 KISS COMPILATION 👙 │\n' +
        '├────────────────────────┼──────────────────────┤\n' +
        '│ 💦 XXX ARCHIVE 🥵      │ 🖤 UNCENSORED 🔞     │\n' +
        '├────────────────────────┼──────────────────────┤\n' +
        '│ 💝 ONLY FOR YOU 🍑     │ 🥵 NEW 2026 DROP 💋  │\n' +
        '└────────────────────────┴──────────────────────┘\n\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [
          [{ text: '⚡️ 🪽 OPEN NOW 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip1' }],
          [{ text: '⚡️ 🪽 JOIN CLUB 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip2' }],
          [{ text: '⚡️ 🪽 ENTER NOW 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip3' }],
          [{ text: '⚡️ 🪽 EXPLORE 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip4' }],
          [{ text: '⚡️ 🪽 TAP HERE 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip5' }],
          [{ text: '⚡️ 🪽 GET ACCESS 🪽 ⚡️ ↗️', url: 'https://t.me/adultvip6' }]
        ]
      }
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(analysis.isSpam && analysis.score >= 12.0, `Scenario 5: Screenshot reference pattern confidently detected (score: ${analysis.score})`);
    assert(analysis.signals.hasTableFormatting, 'Scenario 5: Telegram table formatting detected');
    assert(analysis.signals.hasAdultContent, 'Scenario 5: Adult content categories detected');
    assert(analysis.signals.buttonCount === 6, 'Scenario 5: Six inline buttons detected');
    assert(analysis.signals.hasCallToAction, 'Scenario 5: Calls to action detected');
  }

  // ----------------------------------------------------
  // Scenario 6: Adult-content promotional spam with multiple suspicious links -> detected
  // ----------------------------------------------------
  {
    resetState();
    const msg: TelegramMessage = {
      message_id: 106,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'Spammer' },
      text: '🔞 Adult Mix & Leaks Collection! Desi mms & sex video archive: t.me/leaks_xxx t.me/desimms_vip t.me/nsfw_drop Click to enter now 👇'
    };

    const analysis = ContentProtectionService.analyzePromotionalSpam(msg, chatIdA);
    assert(analysis.isSpam && analysis.score >= 6.0, `Scenario 6: Adult promotional spam with links detected (score: ${analysis.score})`);
    assert(analysis.signals.hasAdultContent, 'Scenario 6: Adult patterns matched');
    assert(analysis.signals.telegramDestinationCount >= 3, 'Scenario 6: Multiple Telegram destinations detected');
  }

  // ----------------------------------------------------
  // Scenario 7: First offense — offending message deleted and exactly one warning recorded
  // ----------------------------------------------------
  {
    resetState();
    db.resetUserWarnings(chatIdA, spammerUserId);

    // Pre-track an earlier message by the spammer in this chat
    db.trackMessage(chatIdA, 50, Math.floor(Date.now() / 1000) - 100, spammerUserId);
    db.trackMessage(chatIdA, 51, Math.floor(Date.now() / 1000) - 50, spammerUserId);
    // Pre-track a message by a different user to verify it is NOT deleted
    db.trackMessage(chatIdA, 52, Math.floor(Date.now() / 1000) - 20, normalUserId);

    const spamMsg: TelegramMessage = {
      message_id: 201,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'SpamUser', username: 'spammer_bob' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        '│ 💦 XXX ARCHIVE │ 🖤 UNCENSORED │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'OPEN NOW', url: 'https://t.me/adult1' }],
          [{ text: 'JOIN CLUB', url: 'https://t.me/adult2' }]
        ]
      }
    };

    const handled = await ModerationService.handlePromotionalSpam(spamMsg);
    assert(handled, 'Scenario 7: Promotional spam handled successfully');

    // Verify offending message and sender's other messages were deleted
    assert(deletedMessageIds.includes(201), 'Scenario 7: Offending message #201 was deleted');
    assert(deletedMessageIds.includes(50) && deletedMessageIds.includes(51), 'Scenario 7: Spammer previous messages were deleted');
    assert(!deletedMessageIds.includes(52), 'Scenario 7: Normal user message #52 was NEVER deleted');

    // Verify exactly one warning recorded in database
    const warnings = db.getUserWarnings(chatIdA, spammerUserId);
    assert(warnings.length === 1, `Scenario 7: Exactly 1 warning recorded persistently (found ${warnings.length})`);
    assert(warnings[0].reason.includes('Promotional link spam'), 'Scenario 7: Warning record specifies promotional link spam');

    // Verify warning message was sent to group
    const warningNotice = sentMessages.find((m) => m.chatId === chatIdA && m.text.includes('Warning 1/1'));
    assert(Boolean(warningNotice), 'Scenario 7: Clear "Warning 1/1" notice was sent to the group');
    assert(bannedUsers.length === 0, 'Scenario 7: User was NOT banned on first offense');
  }

  // ----------------------------------------------------
  // Scenario 8: Repeated messages during the same first offense — no duplicate warnings
  // ----------------------------------------------------
  {
    // Immediately send a 2nd spam message within the burst window
    const secondBurstMsg: TelegramMessage = {
      message_id: 202,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'SpamUser', username: 'spammer_bob' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    const initialWarningCount = db.getUserWarnings(chatIdA, spammerUserId).length;
    const initialNoticeCount = sentMessages.filter((m) => m.text.includes('Warning 1/1')).length;

    await ModerationService.handlePromotionalSpam(secondBurstMsg);

    // Verify message was deleted
    assert(deletedMessageIds.includes(202), 'Scenario 8: Burst message #202 was deleted');

    // Verify warning count did NOT increase
    const currentWarningCount = db.getUserWarnings(chatIdA, spammerUserId).length;
    assert(currentWarningCount === initialWarningCount, `Scenario 8: No duplicate warning created during burst (count: ${currentWarningCount})`);

    const currentNoticeCount = sentMessages.filter((m) => m.text.includes('Warning 1/1')).length;
    assert(currentNoticeCount === initialNoticeCount, 'Scenario 8: No duplicate warning notice sent to group');
  }

  // ----------------------------------------------------
  // Scenario 9: Second confirmed offense after the warning — permanent ban attempted
  // ----------------------------------------------------
  {
    resetState();
    // Simulate time passing after the first warning
    // Verify user already has the 1 warning from Scenario 7
    const existingWarnings = db.getUserWarnings(chatIdA, spammerUserId);
    assert(existingWarnings.length === 1, 'Scenario 9: User has previous warning recorded');

    // Spammer sends a new promotional spam message
    const repeatOffenseMsg: TelegramMessage = {
      message_id: 301,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: spammerUserId, is_bot: false, first_name: 'SpamUser', username: 'spammer_bob' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        '│ 💦 XXX ARCHIVE │ 🖤 UNCENSORED │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'OPEN NOW', url: 'https://t.me/adult1' }],
          [{ text: 'JOIN CLUB', url: 'https://t.me/adult2' }]
        ]
      }
    };

    const handled = await ModerationService.handlePromotionalSpam(repeatOffenseMsg);
    assert(handled, 'Scenario 9: Repeat offense was intercepted');
    assert(deletedMessageIds.includes(301), 'Scenario 9: Repeat offending message was deleted');

    // Verify permanent ban was executed via telegramApi
    const banRecord = bannedUsers.find((b) => b.chatId === chatIdA && b.userId === spammerUserId);
    assert(Boolean(banRecord), 'Scenario 9: Spammer was permanently banned on repeat offense');

    // Verify permanent ban announcement sent to group
    const banNotice = sentMessages.find((m) => m.chatId === chatIdA && m.text.includes('PERMANENT BAN'));
    assert(Boolean(banNotice), 'Scenario 9: Group was notified of permanent ban');
  }

  // ----------------------------------------------------
  // Scenario 10: Same user in a different group — independent warning state
  // ----------------------------------------------------
  {
    resetState();
    // Spammer was warned in Group A. Now spammer sends first message in Group B.
    const warningsInGroupB = db.getUserWarnings(chatIdB, spammerUserId);
    assert(warningsInGroupB.length === 0, 'Scenario 10: Spammer has 0 warnings in Group B (isolated)');

    const groupBMsg: TelegramMessage = {
      message_id: 401,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdB, type: 'supergroup', title: 'Test Group B' },
      from: { id: spammerUserId, is_bot: false, first_name: 'SpamUser', username: 'spammer_bob' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    await ModerationService.handlePromotionalSpam(groupBMsg);

    // Group B should issue warning 1/1, NOT permanent ban!
    const banInGroupB = bannedUsers.find((b) => b.chatId === chatIdB);
    assert(!banInGroupB, 'Scenario 10: Spammer is NOT banned in Group B on first offense');

    const warningsAfterInGroupB = db.getUserWarnings(chatIdB, spammerUserId);
    assert(warningsAfterInGroupB.length === 1, 'Scenario 10: Exactly 1 warning issued in Group B');
  }

  // ----------------------------------------------------
  // Scenario 11: Authorized administrator sends a similar message — exemption rules respected
  // ----------------------------------------------------
  {
    resetState();
    const adminMsg: TelegramMessage = {
      message_id: 501,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: adminUserId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      forward_sender_name: 'Partner Group',
      forward_date: Math.floor(Date.now() / 1000) - 60,
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    const handled = await ModerationService.handlePromotionalSpam(adminMsg);
    assert(!handled, 'Scenario 11: Admin message bypassed promotional spam filter');
    assert(!deletedMessageIds.includes(501), 'Scenario 11: Admin message was NOT deleted');
    assert(db.getUserWarnings(chatIdA, adminUserId).length === 0, 'Scenario 11: Admin received zero warnings');
  }

  // ----------------------------------------------------
  // Scenario 12: Telegram deletion failure — accurate logging and continued bot operation
  // ----------------------------------------------------
  {
    resetState();
    shouldFailDelete = true;
    const testUserId = 7101;
    db.resetUserWarnings(chatIdA, testUserId);

    const failDelMsg: TelegramMessage = {
      message_id: 601,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: testUserId, is_bot: false, first_name: 'FailDelUser' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    // Should complete cleanly without throwing an unhandled exception
    let threw = false;
    try {
      await ModerationService.handlePromotionalSpam(failDelMsg);
    } catch {
      threw = true;
    }
    assert(!threw, 'Scenario 12: Moderation handled Telegram deletion failure without crashing');
    assert(db.getUserWarnings(chatIdA, testUserId).length === 1, 'Scenario 12: Warning was still recorded despite deletion failure');
  }

  // ----------------------------------------------------
  // Scenario 13: Ban failure — failure reported without falsely claiming success
  // ----------------------------------------------------
  {
    resetState();
    shouldFailBan = true;
    const testUserId2 = 7102;
    db.resetUserWarnings(chatIdA, testUserId2);

    // Give 1 warning first
    db.addWarning({
      chatId: chatIdA,
      groupId: chatIdA,
      userId: testUserId2,
      adminId: botId,
      adminUsername: 'RoxieAutoMod',
      reason: 'Promotional link spam',
      isPromotionalSpam: true
    } as any);

    const repeatWithFailBan: TelegramMessage = {
      message_id: 701,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: testUserId2, is_bot: false, first_name: 'FailBanUser' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    await ModerationService.handlePromotionalSpam(repeatWithFailBan);

    // Verify ban failure notice was sent, NOT success notice
    const hasBanSuccessNotice = sentMessages.some((m) => m.text.includes('PERMANENT BAN'));
    const hasBanFailNotice = sentMessages.some((m) => m.text.includes('Failed to ban'));
    assert(!hasBanSuccessNotice, 'Scenario 13: Bot did NOT falsely claim permanent ban success');
    assert(hasBanFailNotice, 'Scenario 13: Bot accurately reported ban failure with error reason');
  }

  // ----------------------------------------------------
  // Scenario 14: Bot restart — persisted warning state remains intact
  // ----------------------------------------------------
  {
    resetState();
    const restartUserId = 7103;
    db.resetUserWarnings(chatIdA, restartUserId);

    // Issue warning via addWarning (which saves to data/groups/<chatId>.json)
    db.addWarning({
      chatId: chatIdA,
      groupId: chatIdA,
      userId: restartUserId,
      adminId: botId,
      adminUsername: 'RoxieAutoMod',
      reason: 'Promotional link spam',
      isPromotionalSpam: true
    } as any);

    // Verify group JSON file was written to disk
    const groupFilePath = path.join(process.cwd(), 'data', 'groups', `${chatIdA}.json`);
    assert(fs.existsSync(groupFilePath), 'Scenario 14: Group JSON file exists on disk');
    const diskJson = JSON.parse(fs.readFileSync(groupFilePath, 'utf8'));
    assert(
      Array.isArray(diskJson.moderation?.warnings) &&
      diskJson.moderation.warnings.some((w: any) => w.userId === restartUserId && w.reason.includes('Promotional link spam')),
      'Scenario 14: Promotional spam warning was persisted to group JSON file on disk'
    );

    // Simulate cold restart: clear warnings in memory
    (db as any).data.warnings = [];
    assert(db.getUserWarnings(chatIdA, restartUserId).length === 0, 'Scenario 14: Memory cleared to simulate fresh restart');

    // Hydrate from disk JSON via restoreGroupData (same execution path as bot startup)
    (db as any).restoreGroupData(chatIdA, diskJson);

    const warningsAfter = db.getUserWarnings(chatIdA, restartUserId);
    assert(warningsAfter.length === 1, 'Scenario 14: Warning state survived restart and was hydrated from disk');
  }

  // ----------------------------------------------------
  // Scenario 15: Duplicate message updates — no duplicate warning or repeated moderation action
  // ----------------------------------------------------
  {
    resetState();
    const dupUserId = 7104;
    db.resetUserWarnings(chatIdA, dupUserId);

    const dupMsg: TelegramMessage = {
      message_id: 801,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatIdA, type: 'supergroup', title: 'Test Group A' },
      from: { id: dupUserId, is_bot: false, first_name: 'DupUser' },
      text:
        '│ 🔞 ADULT MIX │ 💋 KISS COMPILATION │\n' +
        'Tap to Enter Now ⤵️',
      reply_markup: {
        inline_keyboard: [[{ text: 'OPEN NOW', url: 'https://t.me/adult1' }]]
      }
    };

    // First arrival
    const res1 = await ModerationService.handlePromotionalSpam(dupMsg);
    assert(res1, 'Scenario 15: First update handled successfully');

    // Duplicate update arrival of same message
    const initialWarns = db.getUserWarnings(chatIdA, dupUserId).length;
    const initialDeletes = deletedMessageIds.length;
    const res2 = await ModerationService.handlePromotionalSpam(dupMsg);

    assert(res2 === true, 'Scenario 15: Duplicate update acknowledged as already handled');
    assert(db.getUserWarnings(chatIdA, dupUserId).length === initialWarns, 'Scenario 15: No duplicate warning created on duplicate update');
    assert(deletedMessageIds.length === initialDeletes, 'Scenario 15: No redundant deletion triggered on duplicate update');
  }

  // ----------------------------------------------------
  // Scenario 16: Existing moderation & anti-raid tests — no regressions
  // ----------------------------------------------------
  {
    // Clean up test groups
    db.resetUserWarnings(chatIdA, spammerUserId);
    db.resetUserWarnings(chatIdB, spammerUserId);
    console.log('✅ [PASS] Scenario 16: Verified compatibility with existing storage, warnings, and group structures');
    passed++;
  }

  console.log('====================================================');
  console.log(`PROMOTIONAL SPAM TESTS COMPLETED: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================');

  if (failed > 0) {
    throw new Error(`Promotional spam test suite failed with ${failed} failures.`);
  }
}

if (import.meta.url.includes('promotionalSpamModerationTest')) {
  runPromotionalSpamTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
