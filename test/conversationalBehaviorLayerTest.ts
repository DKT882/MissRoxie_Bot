import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { CommandContext } from '../server/telegram/middleware.js';
import { TelegramChatMember } from '../server/telegram/types.js';

let passed = 0;
function pass(msg: string) {
  console.log(`✅ [PASS] ${msg}`);
  passed++;
}

async function runConversationalBehaviorLayerSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Final Conversational Behavior Layer Test Suite');
  console.log('====================================================\n');

  const groupA = -100999888111;
  const groupB = -100999888222;
  const user1 = 10001;
  const user2 = 10002;
  const ownerId = 777000;

  // Mock Telegram API & Fetch
  process.env.OPENROUTER_API_KEY = 'test_key_conversational_behavior';
  process.env.OPENROUTER_MODEL = 'test/model';

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 900000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendSticker = async () => ({ ok: true, result: { message_id: 950000 } });
  (telegramApi as any).getChatMember = async (cId: number, uId: number): Promise<{ ok: boolean; result: TelegramChatMember }> => {
    return { ok: true, result: { status: 'creator', user: { id: uId, is_bot: false, first_name: 'Admin' } } };
  };

  try {
    // ----------------------------------------------------
    // TEST 1: English detection
    // ----------------------------------------------------
    console.log('--- TEST 1: English detection ---');
    const en1 = ChatbotService.detectLanguage("hello roxie");
    const en2 = ChatbotService.detectLanguage("Roxie, how are you doing?");
    const en3 = ChatbotService.detectLanguage("What is the meaning of life?");
    assert.strictEqual(en1.language, 'english');
    assert.strictEqual(en2.language, 'english');
    assert.strictEqual(en3.language, 'english');
    pass('TEST 1: English messages correctly detected.');

    // ----------------------------------------------------
    // TEST 2: Hindi detection (Devanagari script)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Hindi detection ---');
    const hi1 = ChatbotService.detectLanguage("भाई क्या कर रही हो?");
    const hi2 = ChatbotService.detectLanguage("कैसी हो रॉक्सी?");
    const hi3 = ChatbotService.detectLanguage("नमस्ते, आप कैसी हैं?");
    assert.strictEqual(hi1.language, 'hindi');
    assert.strictEqual(hi1.isDevanagari, true);
    assert.strictEqual(hi2.language, 'hindi');
    assert.strictEqual(hi3.language, 'hindi');
    pass('TEST 2: Hindi Devanagari messages correctly detected.');

    // ----------------------------------------------------
    // TEST 3: Hinglish detection
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Hinglish detection ---');
    const hg1 = ChatbotService.detectLanguage("kaisi ho roxie?");
    const hg2 = ChatbotService.detectLanguage("bro kya kr rhi ho");
    const hg3 = ChatbotService.detectLanguage("aaj kya scene hai?");
    assert.strictEqual(hg1.language, 'hinglish');
    assert.strictEqual(hg1.isHinglish, true);
    assert.strictEqual(hg2.language, 'hinglish');
    assert.strictEqual(hg3.language, 'hinglish');
    pass('TEST 3: Hinglish messages correctly detected.');

    // ----------------------------------------------------
    // TEST 4: Mixed Hindi/English detection
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Mixed Hindi/English detection ---');
    const mx1 = ChatbotService.detectLanguage("Roxie aaj kya kar rahi ho?");
    const mx2 = ChatbotService.detectLanguage("bro you're funny but kya scene hai");
    assert.strictEqual(mx1.language, 'hinglish');
    assert.strictEqual(mx1.isMixed, true);
    assert.strictEqual(mx2.language, 'hinglish');
    assert.strictEqual(mx2.isMixed, true);
    pass('TEST 4: Mixed Hindi/English messages detected as Hinglish with code-switching.');

    // ----------------------------------------------------
    // TEST 5: "bro" detection
    // ----------------------------------------------------
    console.log('\n--- TEST 5: "bro" detection ---');
    const bro1 = ChatbotService.detectBrotherZoneTrigger("bro");
    const bro2 = ChatbotService.detectBrotherZoneTrigger("Bro, what's up?");
    assert.strictEqual(bro1.isTriggered, true);
    assert.strictEqual(bro1.termCategory, 'bro');
    assert.strictEqual(bro2.isTriggered, true);
    pass('TEST 5: "bro" recognized without false positives on words like "problem" or "brown".');
    assert.strictEqual(ChatbotService.detectBrotherZoneTrigger("problem").isTriggered, false);
    assert.strictEqual(ChatbotService.detectBrotherZoneTrigger("brought").isTriggered, false);
    assert.strictEqual(ChatbotService.detectBrotherZoneTrigger("brown").isTriggered, false);

    // ----------------------------------------------------
    // TEST 6: "brooo" detection (repeated characters)
    // ----------------------------------------------------
    console.log('\n--- TEST 6: "brooo" detection ---');
    const brooo1 = ChatbotService.detectBrotherZoneTrigger("brooo");
    const brooo2 = ChatbotService.detectBrotherZoneTrigger("brooooo kaha ho?");
    assert.strictEqual(brooo1.isTriggered, true);
    assert.strictEqual(brooo2.isTriggered, true);
    pass('TEST 6: "brooo" with repeated characters normalized and recognized.');

    // ----------------------------------------------------
    // TEST 7: "bhai" detection
    // ----------------------------------------------------
    console.log('\n--- TEST 7: "bhai" detection ---');
    const bhai1 = ChatbotService.detectBrotherZoneTrigger("bhai");
    const bhai2 = ChatbotService.detectBrotherZoneTrigger("BHAI");
    const bhai3 = ChatbotService.detectBrotherZoneTrigger("bhai kya kar rahi ho?");
    assert.strictEqual(bhai1.isTriggered, true);
    assert.strictEqual(bhai1.termCategory, 'bhai');
    assert.strictEqual(bhai2.isTriggered, true);
    assert.strictEqual(bhai3.isTriggered, true);
    pass('TEST 7: "bhai" and case variations recognized.');

    // ----------------------------------------------------
    // TEST 8: "bhaiii" detection
    // ----------------------------------------------------
    console.log('\n--- TEST 8: "bhaiii" detection ---');
    const bhaiii1 = ChatbotService.detectBrotherZoneTrigger("bhaiii");
    const bhaiii2 = ChatbotService.detectBrotherZoneTrigger("bhaiiii sun na");
    assert.strictEqual(bhaiii1.isTriggered, true);
    assert.strictEqual(bhaiii2.isTriggered, true);
    pass('TEST 8: "bhaiii" with trailing repeated letters recognized.');

    // ----------------------------------------------------
    // TEST 9: Hindi-script "भाई" detection
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Hindi-script "भाई" detection ---');
    const devBhai = ChatbotService.detectBrotherZoneTrigger("भाई");
    const devBhaiya = ChatbotService.detectBrotherZoneTrigger("भैया");
    const devBhaisaab = ChatbotService.detectBrotherZoneTrigger("भाईसाहब");
    const devSentence = ChatbotService.detectBrotherZoneTrigger("भाई क्या कर रही हो?");
    assert.strictEqual(devBhai.isTriggered, true);
    assert.strictEqual(devBhaiya.isTriggered, true);
    assert.strictEqual(devBhaisaab.isTriggered, true);
    assert.strictEqual(devSentence.isTriggered, true);
    pass('TEST 9: Devanagari brother words (भाई, भैया, भाईसाहब) accurately recognized.');

    // ----------------------------------------------------
    // TEST 10: "brother" detection
    // ----------------------------------------------------
    console.log('\n--- TEST 10: "brother" detection ---');
    const brother1 = ChatbotService.detectBrotherZoneTrigger("brother");
    const brother2 = ChatbotService.detectBrotherZoneTrigger("brother ji");
    const bruh = ChatbotService.detectBrotherZoneTrigger("bruh");
    const dude = ChatbotService.detectBrotherZoneTrigger("dude");
    assert.strictEqual(brother1.isTriggered, true);
    assert.strictEqual(brother1.termCategory, 'brother');
    assert.strictEqual(brother2.isTriggered, true);
    assert.strictEqual(bruh.isTriggered, true);
    assert.strictEqual(dude.isTriggered, true);
    pass('TEST 10: "brother", "brother ji", "bruh", "dude" recognized.');

    // ----------------------------------------------------
    // TEST 11: Lust Mode OFF -> normal behavior
    // ----------------------------------------------------
    console.log('\n--- TEST 11: Lust Mode OFF -> normal behavior ---');
    db.getGroupSettings(groupA);
    db.updateGroupSettings(groupA, { lustMode: false });
    db.resetLustLevel(groupA, user1);

    const normalRes = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "bhai sun",
      lustMode: false
    });
    assert.strictEqual(normalRes.lustLevel, 0, 'Lust level remains 0 when Lust Mode is OFF');
    assert(!normalRes.text.includes('couple wali vibe'), 'No couple pushback when Lust Mode is OFF');
    pass('TEST 11: Normal moderation/chatbot behavior retained when Lust Mode is OFF.');

    // ----------------------------------------------------
    // TEST 12: Lust Mode ON -> playful couple response
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Lust Mode ON -> playful couple response ---');
    db.updateGroupSettings(groupA, { lustMode: true });

    const lustRes = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "bhai kya kar rahi ho?",
      lustMode: true
    });
    assert.strictEqual(lustRes.brotherZoneTriggered, true);
    assert.strictEqual(lustRes.lustLevel, 1, 'First trigger escalates lust level to 1');
    assert(
      lustRes.text.toLowerCase().includes('bhai') ||
      lustRes.text.toLowerCase().includes('bulao') ||
      lustRes.text.toLowerCase().includes('thodi hoon'),
      `Response pushes back against brother-zone: "${lustRes.text}"`
    );
    pass('TEST 12: Lust Mode ON produces playful romantic pushback response.');

    // ----------------------------------------------------
    // TEST 13: Trigger increases lust level
    // ----------------------------------------------------
    console.log('\n--- TEST 13: Trigger increases lust level ---');
    db.resetLustLevel(groupA, user1);
    assert.strictEqual(db.getLustLevel(groupA, user1), 0);

    const resL1 = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "bhai sun",
      lustMode: true
    });
    assert.strictEqual(resL1.lustLevel, 1);
    assert.strictEqual(db.getLustLevel(groupA, user1), 1);
    pass('TEST 13: Single trigger increases level from 0 to 1.');

    // ----------------------------------------------------
    // TEST 14: Repeated triggers increase level gradually
    // ----------------------------------------------------
    console.log('\n--- TEST 14: Repeated triggers increase level gradually ---');
    const resL2 = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "bhaiii",
      lustMode: true
    });
    assert.strictEqual(resL2.lustLevel, 2);

    const resL3 = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "brooo",
      lustMode: true
    });
    assert.strictEqual(resL3.lustLevel, 3);

    const resL4 = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "arre bhai",
      lustMode: true
    });
    assert.strictEqual(resL4.lustLevel, 4);
    pass('TEST 14: Repeated triggers increase level progressively from 1 -> 2 -> 3 -> 4.');

    // ----------------------------------------------------
    // TEST 15: Level does not exceed configured maximum (4)
    // ----------------------------------------------------
    console.log('\n--- TEST 15: Level does not exceed maximum (4) ---');
    for (let i = 0; i < 5; i++) {
      const extraRes = await ChatbotService.generateRoxieResponse({
        groupId: groupA,
        userId: user1,
        message: "bhai",
        lustMode: true
      });
      assert.strictEqual(extraRes.lustLevel, 4, 'Lust level must not exceed level 4');
    }
    assert.strictEqual(db.getLustLevel(groupA, user1), 4);
    pass('TEST 15: Lust level capped at maximum Level 4.');

    // ----------------------------------------------------
    // TEST 16: Level decays correctly
    // ----------------------------------------------------
    console.log('\n--- TEST 16: Level decays correctly ---');
    db.setLustLevel(groupA, user1, 4);
    // Simulate elapsed time: 2 hours ago
    const record = (db as any).data.userLustLevels[`${groupA}_${user1}`];
    assert(record);
    record.lastUpdated = Date.now() - (2 * 3600 * 1000 + 1000); // 2 hours + 1s ago

    // With 1-hour decay, after 2 hours level 4 should decay to 2
    const decayedLevel = db.getLustLevel(groupA, user1, 1);
    assert.strictEqual(decayedLevel, 2, 'Level 4 decays by 2 steps over 2 hours');

    // Simulate 5 hours elapsed -> decays completely to 0
    record.lastUpdated = Date.now() - (5 * 3600 * 1000);
    const fullyDecayed = db.getLustLevel(groupA, user1, 1);
    assert.strictEqual(fullyDecayed, 0, 'Level decays to 0 after extended inactivity');
    pass('TEST 16: Lust level decays gracefully over inactivity periods.');

    // ----------------------------------------------------
    // TEST 17: /lust off resets level
    // ----------------------------------------------------
    console.log('\n--- TEST 17: /lust off resets level ---');
    db.setLustLevel(groupA, user1, 3);
    assert.strictEqual(db.getLustLevel(groupA, user1), 3);

    const fakeSender = { id: ownerId, is_bot: false, first_name: 'Owner' };
    const fakeCtx: CommandContext = {
      message: {
        message_id: 501,
        date: Math.floor(Date.now() / 1000),
        chat: { id: groupA, type: 'supergroup', title: 'Group A' },
        from: fakeSender,
        text: '/lust off'
      },
      chatId: groupA,
      chatTitle: 'Group A',
      sender: fakeSender,
      isAnonymousAdmin: false,
      adminDisplayName: 'Owner',
      command: '/lust',
      args: ['off'],
      rawArgs: 'off'
    };

    await CommandHandler.handleCommand(fakeCtx);
    assert.strictEqual(db.getLustLevel(groupA, user1), 0, 'Lust level must be reset to 0 upon /lust off');
    pass('TEST 17: Disabling Lust Mode via command resets group user lust levels.');

    // ----------------------------------------------------
    // TEST 18: User state isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 18: User state isolation ---');
    db.setLustLevel(groupA, user1, 3);
    db.setLustLevel(groupA, user2, 1);
    assert.strictEqual(db.getLustLevel(groupA, user1), 3);
    assert.strictEqual(db.getLustLevel(groupA, user2), 1);
    pass('TEST 18: Distinct users in the same group maintain separate lust levels.');

    // ----------------------------------------------------
    // TEST 19: Group A and Group B isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 19: Group A and Group B isolation ---');
    db.setLustLevel(groupA, user1, 4);
    db.setLustLevel(groupB, user1, 0);
    assert.strictEqual(db.getLustLevel(groupA, user1), 4);
    assert.strictEqual(db.getLustLevel(groupB, user1), 0);

    db.resetLustLevel(groupA);
    assert.strictEqual(db.getLustLevel(groupA, user1), 0, 'Group A reset');
    db.setLustLevel(groupB, user1, 2);
    db.resetLustLevel(groupA);
    assert.strictEqual(db.getLustLevel(groupB, user1), 2, 'Group B state untouched by Group A reset');
    pass('TEST 19: Complete state isolation between Group A and Group B.');

    // ----------------------------------------------------
    // TEST 20: No response duplication / spam
    // ----------------------------------------------------
    console.log('\n--- TEST 20: Response variation and anti-spam ---');
    const responses = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const template = ChatbotService.getBrotherZonePushbackTemplate('hinglish', 2, 'bhai', 'bhai sun');
      responses.add(template);
    }
    assert(responses.size > 1, 'Templates must produce varied, non-repetitive responses');
    pass(`TEST 20: Response variation verified (${responses.size} unique variations generated).`);

    // ----------------------------------------------------
    // TEST 21: No unhandled errors on edge-case inputs
    // ----------------------------------------------------
    console.log('\n--- TEST 21: Edge case inputs handled safely ---');
    assert.doesNotThrow(() => ChatbotService.detectLanguage(""));
    assert.doesNotThrow(() => ChatbotService.detectLanguage(null as any));
    assert.doesNotThrow(() => ChatbotService.detectBrotherZoneTrigger(""));
    assert.doesNotThrow(() => ChatbotService.detectBrotherZoneTrigger(undefined as any));
    assert.doesNotThrow(() => db.getLustLevel(0, 0));
    assert.doesNotThrow(() => db.setLustLevel(0, 0, 999));
    pass('TEST 21: All edge-case and nil inputs safely handled without unhandled errors.');

    // ----------------------------------------------------
    // TEST 22: Hindi script response generation
    // ----------------------------------------------------
    console.log('\n--- TEST 22: Hindi script response generation ---');
    const hindiPushback = await ChatbotService.generateRoxieResponse({
      groupId: groupA,
      userId: user1,
      message: "भाई क्या कर रही हो?",
      lustMode: true,
      lustLevel: 2
    });
    assert.strictEqual(hindiPushback.language, 'hindi');
    assert(/[\u0900-\u097F]/.test(hindiPushback.text), 'Response to Hindi input must be in Devanagari Hindi');
    pass('TEST 22: Hindi Devanagari prompt generates natural Hindi Devanagari pushback response.');

    console.log('\n====================================================');
    console.log(`🎉 ALL 22 CONVERSATIONAL BEHAVIOR LAYER TESTS PASSED! (${passed} checks)`);
    console.log('====================================================\n');
  } catch (err) {
    console.error('Test suite failure:', err);
    process.exit(1);
  }
}

runConversationalBehaviorLayerSuite().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
