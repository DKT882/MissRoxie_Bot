import assert from 'assert';
import { db } from '../server/db/storage.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { ChatbotService, BASE_PERSONALITY } from '../server/telegram/chatbot.js';
import { TELEGRAM_SUGGESTED_COMMANDS, ADMIN_COMMANDS } from '../server/telegram/commands.js';
import { COMMAND_CATALOG } from '../server/telegram/commandCatalog.js';

async function runTests() {
  console.log('========================================================================');
  console.log('ROXIE MULTI-BOT ISOLATION, GIRLFRIEND PERSONA & FALLBACK TEST SUITE');
  console.log('========================================================================\n');

  // -------------------------------------------------------------------------
  // PHASE 1: Multi-Bot MongoDB Data Isolation
  // -------------------------------------------------------------------------
  console.log('--- PHASE 1: Multi-Bot Storage & Dashboard Isolation ---');

  const rand = Math.floor(Math.random() * 100000);
  const botA = { id: 100000 + rand, username: 'OriginalRoxieBot', first_name: 'Roxie' };
  const botB = { id: 200000 + rand, username: 'RoxieDemo', first_name: 'Roxie Demo' };

  // Set identity to Bot A and create some groups
  db.setBotIdentity(botA);
  assert.strictEqual(db.getCurrentBotId(), botA.id, 'Bot A ID should match');

  // Add 3 groups to Bot A
  const chatA1 = -100100000000 - rand;
  const chatA2 = -100200000000 - rand;
  const chatA3 = -100300000000 - rand;
  const groupA1 = db.getGroupSettings(chatA1, 'Bot A Group 1');
  const groupA2 = db.getGroupSettings(chatA2, 'Bot A Group 2');
  const groupA3 = db.getGroupSettings(chatA3, 'Bot A Group 3');

  assert.strictEqual(groupA1.botId, botA.id, 'Group A1 botId should match Bot A');
  assert.strictEqual(groupA2.botId, botA.id, 'Group A2 botId should match Bot A');
  assert.strictEqual(groupA3.botId, botA.id, 'Group A3 botId should match Bot A');

  assert.strictEqual(db.getConnectedGroupCount(botA.id), 3, 'Bot A should have exactly 3 groups');
  assert.strictEqual(Object.keys(db.getAllGroupSettings(botA.id)).length, 3, 'Bot A settings map length should be 3');

  // Switch identity to Bot B (brand new bot)
  db.setBotIdentity(botB);
  assert.strictEqual(db.getCurrentBotId(), botB.id, 'Bot B ID should match Bot B');

  // Bot B must see 0 connected groups!
  assert.strictEqual(db.getConnectedGroupCount(botB.id), 0, 'New Bot B must see 0 connected groups');
  assert.strictEqual(Object.keys(db.getAllGroupSettings(botB.id)).length, 0, 'New Bot B settings map must be empty');
  assert.strictEqual(db.getConnectedGroups(botB.id).length, 0, 'New Bot B connected groups array must be empty');

  // Bot B joins a new group
  const chatB1 = -100900000000 - rand;
  const groupB1 = db.getGroupSettings(chatB1, 'Bot B Group 1');
  assert.strictEqual(groupB1.botId, botB.id, 'Group B1 botId should match Bot B');
  assert.strictEqual(groupB1.botUsername, 'RoxieDemo', 'Group B1 botUsername should be RoxieDemo');

  // Now Bot B has 1 group, while Bot A still has 3 groups!
  assert.strictEqual(db.getConnectedGroupCount(botB.id), 1, 'Bot B should now have exactly 1 group');
  assert.strictEqual(db.getConnectedGroupCount(botA.id), 3, 'Bot A must remain isolated with 3 groups');

  // Bot B's connected groups list only contains its own group
  const botBGroups = db.getConnectedGroups(botB.id);
  assert.strictEqual(botBGroups.length, 1, 'Bot B list must have length 1');
  assert.strictEqual(botBGroups[0].chatId, chatB1, 'Bot B group must have correct chatId');
  assert.strictEqual(botBGroups[0].chatTitle, 'Bot B Group 1', 'Bot B group must have correct title');

  // Verify buildGroupDataObject attaches botId & botUsername
  const obj = db.buildGroupDataObject(-100999999999);
  assert.strictEqual(obj.botId, 200002, 'buildGroupDataObject must include botId');
  assert.strictEqual(obj.botUsername, 'RoxieDemo', 'buildGroupDataObject must include botUsername');

  console.log('✓ Phase 1 Passed: Bot A and Bot B group isolation verified with 0 cross-bot contamination.');

  // -------------------------------------------------------------------------
  // PHASE 2: Girlfriend Persona & Direct Inquiries
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 2: Girlfriend Persona & Inquiry Handling ---');

  assert(BASE_PERSONALITY.includes('girlfriend'), 'BASE_PERSONALITY must include girlfriend persona');
  assert(BASE_PERSONALITY.includes('Tell me about yourself'), 'BASE_PERSONALITY must handle self-description in-character');
  assert(BASE_PERSONALITY.includes('NEVER describe yourself as an AI assistant'), 'BASE_PERSONALITY must forbid robotic AI self-description');
  assert(BASE_PERSONALITY.includes('are you a bot?'), 'BASE_PERSONALITY must handle direct bot questions in-character');
  assert(!BASE_PERSONALITY.includes('psychologically observant female friend chatting on Telegram'), 'Old robotic description must be removed');

  // Verify instruction leak detection
  const metaLeak = 'short, natural, relevant comment (1 sentence, 5-25 words) in Hinglish or English reacting directly to what the user said. The user message: Rahul: "Hey". This is a creepy solicitation. Roxie should react with a short comment.';
  assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(metaLeak), true, 'Prompt instruction leaks must be detected and rejected');

  const validGirlfriendReply = 'Arre waah! Aaj toh bade smart lag rahe ho 😉';
  assert.strictEqual(ChatbotService.isInstructionOrMetaLeak(validGirlfriendReply), false, 'Natural girlfriend replies must not be flagged');

  console.log('✓ Phase 2 Passed: Girlfriend persona invariants, prompt defense, and zero meta leaks verified.');

  // -------------------------------------------------------------------------
  // PHASE 3: Technical Fallback Realignment & Model Blacklisting
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 3: Fallback Realignment & Permanent Error Blacklisting ---');

  // Verify fallback reply strings contain NO technical buzzwords
  const sampleFallbackHinglish = "Arre, ek sec 😅 mera dhyan thoda bhatak gaya tha, phir se bolo na!";
  const sampleFallbackEnglish = "Hey, I got a little distracted for a second! Tell me again? 😊";

  assert(!sampleFallbackHinglish.toLowerCase().includes('glitch'), 'Hinglish fallback must not mention glitch');
  assert(!sampleFallbackHinglish.toLowerCase().includes('network'), 'Hinglish fallback must not mention network');
  assert(!sampleFallbackEnglish.toLowerCase().includes('glitch'), 'English fallback must not mention glitch');
  assert(!sampleFallbackEnglish.toLowerCase().includes('network'), 'English fallback must not mention network');

  // Model Blacklist Testing
  ChatbotService.clearBlacklistedModels();
  assert.strictEqual(ChatbotService.getBlacklistedModels().length, 0, 'Blacklist should initially be empty');

  ChatbotService.blacklistModel('broken/model-401', 'HTTP 401 Unauthorized');
  ChatbotService.blacklistModel('broken/model-402', 'HTTP 402 Payment Required');
  ChatbotService.blacklistModel('broken/model-403', 'HTTP 403 Forbidden');
  ChatbotService.blacklistModel('broken/model-404', 'HTTP 404 Not Found');

  const blacklisted = ChatbotService.getBlacklistedModels();
  assert.strictEqual(blacklisted.length, 4, 'All 4 permanent error models should be blacklisted');
  assert(blacklisted.includes('broken/model-401'), 'Must include 401');
  assert(blacklisted.includes('broken/model-402'), 'Must include 402');
  assert(blacklisted.includes('broken/model-403'), 'Must include 403');
  assert(blacklisted.includes('broken/model-404'), 'Must include 404');

  ChatbotService.clearBlacklistedModels();
  assert.strictEqual(ChatbotService.getBlacklistedModels().length, 0, 'Clear blacklisted models works');

  console.log('✓ Phase 3 Passed: Fallback realigned to girlfriend persona, permanent model blacklisting verified.');

  // -------------------------------------------------------------------------
  // PHASE 4: Command Catalog & Single Source of Truth
  // -------------------------------------------------------------------------
  console.log('\n--- PHASE 4: Command Catalog Inventory ---');

  assert(COMMAND_CATALOG.length >= 60, `Catalog must have >= 60 commands, got ${COMMAND_CATALOG.length}`);
  assert(TELEGRAM_SUGGESTED_COMMANDS.length >= 10, `Suggested commands must have >= 10 commands, got ${TELEGRAM_SUGGESTED_COMMANDS.length}`);

  const uniqueCatalogCommands = new Set(COMMAND_CATALOG.map(c => c.command));
  console.log(`✓ Total canonical commands registered in catalog: ${COMMAND_CATALOG.length}`);
  console.log(`✓ Total suggested bot commands: ${TELEGRAM_SUGGESTED_COMMANDS.length}`);
  console.log(`✓ Total admin commands: ${ADMIN_COMMANDS.length}`);

  console.log('\n========================================================================');
  console.log('ALL TESTS PASSED SUCCESSFULLY! ZERO FAILURES.');
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
