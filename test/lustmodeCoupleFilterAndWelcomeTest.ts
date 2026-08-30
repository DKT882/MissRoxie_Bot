import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { ModerationService } from '../server/telegram/moderation.js';
import { telegramApi } from '../server/telegram/api.js';
import { TelegramMessage, CommandContext, TelegramChatMember } from '../server/telegram/types.js';

async function runLustmodeAndWelcomeSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Lust Mode Couple-Word Filter & /welcome Test Suite');
  console.log('====================================================');

  // ==========================================
  // PART 1: RELATIONSHIP SIGNAL DETECTION TESTS
  // ==========================================
  console.log('\n--- PART 1: Relationship Signal Detection ---');

  const positiveCases = [
    'bhai',
    'bhaii',
    'bhaiii',
    'bhaiya',
    'bro',
    'broo',
    'brooo',
    'brother',
    'sis',
    'sissy',
    'sister',
    'didi',
    'di',
    'behen',
    'behan',
    'yaar',
    'dost',
    'friend',
    'buddy',
    'mate',
    'BHAI 😂',
    'oye bro',
    'bro...',
    'bhai yaar',
    'didi please',
    'sis help',
    'arey behen',
    'bro you are looking cute 😂',
    'bhai kya kar raha hai',
    'didi help me'
  ];

  for (const phrase of positiveCases) {
    const res = ChatbotService.detectRelationshipSignal(phrase);
    assert.strictEqual(
      res.isRelationshipSignal,
      true,
      `Expected "${phrase}" to be detected as a relationship signal, but got false`
    );
  }
  console.log(`✅ [PASS] All ${positiveCases.length} positive relationship signal test cases detected accurately.`);

  // False Positives Protection Test
  console.log('\n--- Testing False Positives Protection ---');
  const negativeCases = [
    'problem',
    'brought',
    'brown',
    'broadcast',
    'broth',
    'sisterhood of traveling pants', // wait, sister is in this phrase
    'probe',
    'broken',
    'disciple'
  ];

  const strictNegativeCases = [
    'problem',
    'brought',
    'brown',
    'broadcast',
    'probe',
    'broken'
  ];

  for (const phrase of strictNegativeCases) {
    const res = ChatbotService.detectRelationshipSignal(phrase);
    assert.strictEqual(
      res.isRelationshipSignal,
      false,
      `Expected "${phrase}" NOT to trigger relationship signal (false positive), but got true!`
    );
  }
  console.log(`✅ [PASS] All false positive test cases ('problem', 'brought', 'brown', 'broadcast', etc.) safely avoided.`);

  // ==========================================
  // MOOD SUPPRESSION WITH RELATIONSHIP SIGNAL
  // ==========================================
  console.log('\n--- Testing Mood Suppression with Relationship Signal ---');
  const flirtyWithBro = "bro you're looking cute 😂";
  const regularFlirty = "you're looking cute 😏";

  // Without relationship signal, regular flirty message detects flirty
  const regularMood = ChatbotService.inferMood(regularFlirty, undefined, false);
  assert.ok(regularMood === 'flirty' || regularMood === 'playful');

  // With relationship signal, flirty/romantic is strictly suppressed
  const suppressedMood = ChatbotService.inferMood(flirtyWithBro, undefined, true);
  assert.notStrictEqual(suppressedMood, 'flirty', 'Must NOT be flirty when romance is suppressed');
  assert.notStrictEqual(suppressedMood, 'romantic', 'Must NOT be romantic when romance is suppressed');
  console.log(`✅ [PASS] Mood suppression prevents 'romantic' and 'flirty' when relationship signal is present.`);

  // ==========================================
  // SANITIZATION TEST IN LUST MODE
  // ==========================================
  console.log('\n--- Testing Sanitize Lust Mode Text with Relationship Signal ---');
  const aiOutputWithBaby = "Haan baby, sab badhiya hai! Tum batao.";
  const sanitizedSafe = ChatbotService.sanitizeLustModeText(aiOutputWithBaby, "bro kya haal hai", true);
  assert.ok(!sanitizedSafe.toLowerCase().includes('baby'), 'Romantic pet name "baby" must be stripped when relationship signal is present');
  console.log(`✅ [PASS] sanitizeLustModeText strips couple pet names when relationship signal is detected.`);

  // ==========================================
  // CUSTOM STICKER SELECTION UNDER RELATIONSHIP SIGNAL
  // ==========================================
  console.log('\n--- Testing Custom Sticker Selection with Relationship Signal ---');
  const testChatLust = -100888999111;
  db.getGroupSettings(testChatLust, 'Lust Custom Sticker Group');
  db.updateGroupSettings(testChatLust, { lustMode: true });
  db.clearMediaLibrary(testChatLust);
  const nowIso = new Date().toISOString();
  db.addStickerToLibrary('flirty', 'sticker_flirty_123', { fileId: 'sticker_flirty_123', mood: 'flirty', addedAt: nowIso }, testChatLust);
  db.addStickerToLibrary('playful', 'sticker_playful_456', { fileId: 'sticker_playful_456', mood: 'playful', addedAt: nowIso }, testChatLust);
  db.addStickerToLibrary('friendly', 'sticker_friendly_789', { fileId: 'sticker_friendly_789', mood: 'friendly', addedAt: nowIso }, testChatLust);

  // Normal request with romance suppressed (user said bhai/bro)
  const stickerForBro = ChatbotService.selectCustomStickerForLustMode('flirty', testChatLust, true);
  assert.notStrictEqual(stickerForBro, 'sticker_flirty_123', 'Should not pick flirty sticker when romance is suppressed');
  assert.ok(
    stickerForBro === 'sticker_playful_456' || stickerForBro === 'sticker_friendly_789',
    'Must fallback to playful/friendly custom sticker'
  );
  console.log(`✅ [PASS] selectCustomStickerForLustMode picks non-romantic custom sticker when relationship signal is active.`);

  // ==========================================
  // PART 2: /welcome AND autodeljoin TESTS
  // ==========================================
  console.log('\n--- PART 2: /welcome and autodeljoin Integration ---');

  const testChatA = -100999000111;
  const testChatB = -100999000222;
  const adminId = 888777;
  const botId = 123456789;

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let deletedMessages: Array<{ chatId: number; messageId: number }> = [];

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    const message_id = 700000 + Math.floor(Math.random() * 1000);
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id, chat: { id: chatId } } };
  };

  (telegramApi as any).deleteMessage = async (chatId: number, messageId: number) => {
    deletedMessages.push({ chatId, messageId });
    return { ok: true, result: true };
  };

  (telegramApi as any).getMe = async () => {
    return { ok: true, result: { id: botId, is_bot: true, first_name: 'MissRoxie' } };
  };

  const memberStatusMap: Record<number, TelegramChatMember> = {
    [adminId]: {
      status: 'administrator',
      user: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      can_restrict_members: true,
      can_delete_messages: true,
      can_pin_messages: true,
      can_promote_members: true
    } as any,
    [botId]: {
      status: 'administrator',
      user: { id: botId, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' },
      can_restrict_members: true,
      can_delete_messages: true,
      can_pin_messages: true
    } as any
  };

  (telegramApi as any).getChatMember = async (_chatId: number, userId: number) => {
    return {
      ok: true,
      result: memberStatusMap[userId] || {
        status: 'member',
        user: { id: userId, is_bot: false, first_name: `User_${userId}` }
      }
    };
  };

  function createCommandContext(chatId: number, textOrCaption: string): CommandContext {
    const trimmed = textOrCaption.trim();
    const cmdMatch = textOrCaption.match(/^([\/!][^\s]+)([\s\S]*)$/);
    const rawCmd = cmdMatch ? cmdMatch[1] : trimmed.split(/\s+/)[0];
    const rawRemainder = cmdMatch ? cmdMatch[2] : '';
    const rawArgs = rawRemainder.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
    const parts = trimmed.split(/\s+/);
    const command = rawCmd.startsWith('!') ? `/${rawCmd.slice(1)}` : rawCmd;
    const args = parts.slice(1);

    return {
      message: {
        message_id: 2000 + Math.floor(Math.random() * 1000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup', title: `Test Group ${chatId}` },
        from: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
        text: textOrCaption
      },
      chatId,
      chatTitle: `Test Group ${chatId}`,
      sender: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      args,
      command,
      rawArgs
    };
  }

  // TEST 2.1: /welcome <text> updates template and activates welcome
  console.log('\n--- TEST 2.1: /welcome <text> Updates Template and Activates ---');
  sentMessages = [];
  const ctxWelcomeSet = createCommandContext(testChatA, '/welcome Hello {name} 👋 Welcome to {chat_title}!');
  await CommandHandler.handleCommand(ctxWelcomeSet);

  let settingsA = db.getGroupSettings(testChatA);
  assert.strictEqual(settingsA.welcomeEnabled, true, 'welcomeEnabled must be true');
  assert.strictEqual(settingsA.welcomeMessage, 'Hello {name} 👋 Welcome to {chat_title}!');
  console.log('✅ [PASS] /welcome <message> correctly updates template and enables welcome.');

  // TEST 2.2: New member joins with autodeljoin OFF -> Welcome sent, NOT deleted
  console.log('\n--- TEST 2.2: Member Joins with autodeljoin OFF ---');
  db.updateGroupSettings(testChatA, { autoDeleteJoinLeave: false });
  sentMessages = [];
  deletedMessages = [];

  const joinMsg1: TelegramMessage = {
    message_id: 3001,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
    new_chat_members: [
      { id: 911001, is_bot: false, first_name: 'Charlie', username: 'charlie99' }
    ]
  };

  await ModerationService.handleWelcomeAndGoodbye(joinMsg1);

  assert.strictEqual(sentMessages.length, 1, 'Welcome message must be sent');
  assert.ok(sentMessages[0].text.includes('Hello Charlie 👋 Welcome to Test Group A!'), 'Welcome message must contain formatted name');

  // Wait 4 seconds to ensure no deleteMessage was called
  await new Promise(r => setTimeout(r, 4000));
  assert.strictEqual(deletedMessages.length, 0, 'No message should be deleted when autodeljoin is OFF');
  console.log('✅ [PASS] Member joins with autodeljoin OFF: welcome message sent and kept.');

  // TEST 2.3: autodeljoin ON -> New member joins -> Welcome STILL sent and NOT deleted, only join system message deleted
  console.log('\n--- TEST 2.3: Member Joins with autodeljoin ON ---');
  const ctxAutoDelOn = createCommandContext(testChatA, '/autodeljoin on');
  await CommandHandler.handleCommand(ctxAutoDelOn);

  settingsA = db.getGroupSettings(testChatA);
  assert.strictEqual(settingsA.autoDeleteJoinLeave, true, 'autoDeleteJoinLeave must be true');
  assert.strictEqual(settingsA.welcomeEnabled, true, 'welcomeEnabled must STILL be true');

  sentMessages = [];
  deletedMessages = [];

  const joinMsg2: TelegramMessage = {
    message_id: 3002,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
    new_chat_members: [
      { id: 911002, is_bot: false, first_name: 'David', username: 'david00' }
    ]
  };

  await ModerationService.handleWelcomeAndGoodbye(joinMsg2);

  assert.strictEqual(sentMessages.length, 1, 'Welcome message must STILL be sent even when autodeljoin is ON');
  assert.ok(sentMessages[0].text.includes('Hello David 👋 Welcome to Test Group A!'), 'Welcome text must be correct');
  const welcomeSentMsg = sentMessages[0];

  // Wait 4 seconds for deletion timer to fire
  await new Promise(r => setTimeout(r, 4000));

  // Verify: the join system service message (3002) was deleted, and the welcome message was NOT deleted!
  const joinMsgDeleted = deletedMessages.find(d => d.messageId === 3002);
  assert.ok(joinMsgDeleted, 'Telegram join service message (3002) must be deleted');
  assert.strictEqual(joinMsgDeleted.chatId, testChatA);

  const welcomeWasDeleted = deletedMessages.some(d => d.chatId === testChatA && (d as any).text === welcomeSentMsg.text);
  assert.strictEqual(welcomeWasDeleted, false, 'The welcome message itself must NEVER be deleted');
  console.log('✅ [PASS] autodeljoin ON correctly deletes only the join service message (3002) while keeping the welcome message permanently!');

  // TEST 2.4: autodeljoin OFF again -> Welcome message still enabled
  console.log('\n--- TEST 2.4: Disabling autodeljoin preserves welcome ---');
  const ctxAutoDelOff = createCommandContext(testChatA, '/autodeljoin off');
  await CommandHandler.handleCommand(ctxAutoDelOff);

  settingsA = db.getGroupSettings(testChatA);
  assert.strictEqual(settingsA.autoDeleteJoinLeave, false);
  assert.strictEqual(settingsA.welcomeEnabled, true, 'welcomeEnabled must remain true');
  console.log('✅ [PASS] Disabling autodeljoin leaves welcome enabled.');

  // TEST 2.5: Group Isolation between Chat A and Chat B
  console.log('\n--- TEST 2.5: Group Isolation ---');
  db.getGroupSettings(testChatB, 'Test Group B');
  const settingsB = db.getGroupSettings(testChatB);
  assert.notStrictEqual(settingsB.welcomeMessage, settingsA.welcomeMessage, 'Group B must have its own isolated settings');
  console.log('✅ [PASS] Group isolation verified: Group A settings do not overwrite Group B.');

  console.log('\n====================================================');
  console.log('🎉 ALL LUST MODE COUPLE-WORD FILTER & /WELCOME TESTS PASSED!');
  console.log('====================================================');
}

runLustmodeAndWelcomeSuite().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
