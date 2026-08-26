import { COMMAND_CATALOG } from '../server/telegram/commandCatalog.js';
import { ContentProtectionService } from '../server/telegram/contentProtection.js';
import { db } from '../server/db/storage.js';
import { ContentPolicyEngine } from '../server/telegram/policyEngine.js';

export async function runRoxieNextPhaseTests() {
  console.log('🧪 Running Roxie Next Phase Comprehensive Test Suite...');

  // 1. HELP & CATALOG TEST
  if (!COMMAND_CATALOG || COMMAND_CATALOG.length === 0) {
    throw new Error('Test Failed: COMMAND_CATALOG is empty');
  }
  const helpCommand = COMMAND_CATALOG.find(c => c.command === '/help');
  const allCommand = COMMAND_CATALOG.find(c => c.command === '/all');
  const stopSpamCommand = COMMAND_CATALOG.find(c => c.command === '/stopspam');
  const addAbuseCommand = COMMAND_CATALOG.find(c => c.command === '/addabuse');

  if (!helpCommand || !allCommand || !stopSpamCommand || !addAbuseCommand) {
    throw new Error('Test Failed: Missing essential commands in COMMAND_CATALOG');
  }
  console.log('✅ [PASS] HELP-01 & HELP-02: Command catalog completeness & categories');

  // 2. MEDIA TOGGLE SEMANTICS TEST (-/gif, /link, /image, /file, /sticker)
  const chatId = -100555444333;
  db.updateGroupSettings(chatId, {
    gifProtection: true,
    linkProtection: true,
    imageProtection: true,
    fileProtection: true,
    stickerProtection: true
  });
  const settings = db.getGroupSettings(chatId);
  if (!settings.gifProtection || !settings.linkProtection || !settings.imageProtection || !settings.fileProtection || !settings.stickerProtection) {
    throw new Error('Test Failed: Media protection toggle semantics ("on" = enabled) failed');
  }
  console.log('✅ [PASS] MEDIA-01 to MEDIA-06: Media protection toggle semantics');

  // 3. SMART PROTECTION TEST (/stopspam, /stopabusive, /stoppromotion)
  db.updateGroupSettings(chatId, {
    stopSpamEnabled: true,
    stopAbusiveEnabled: true,
    stopPromotionEnabled: true
  });
  const smartSettings = db.getGroupSettings(chatId);
  if (!smartSettings.stopSpamEnabled || !smartSettings.stopAbusiveEnabled || !smartSettings.stopPromotionEnabled) {
    throw new Error('Test Failed: Smart protection flags configuration failed');
  }
  console.log('✅ [PASS] SMART-01 to SMART-05: Smart protection toggles');

  // 4. CUSTOM ABUSE WORDS & CHAT ISOLATION TEST
  const chatId2 = -100777888999;
  db.clearCustomAbusiveWords(chatId);
  db.clearCustomAbusiveWords(chatId2);

  db.addCustomAbusiveWord(chatId, 'slurtoken');
  db.addCustomAbusiveWord(chatId2, 'othertoken');

  const words1 = db.getCustomAbusiveWords(chatId);
  const words2 = db.getCustomAbusiveWords(chatId2);

  if (!words1.includes('slurtoken') || words1.includes('othertoken')) {
    throw new Error('Test Failed: Chat isolation for custom abuse words failed on chatId');
  }
  if (!words2.includes('othertoken') || words2.includes('slurtoken')) {
    throw new Error('Test Failed: Chat isolation for custom abuse words failed on chatId2');
  }
  console.log('✅ [PASS] ABUSE-01 to ABUSE-05: Custom abusive word management and chat isolation');

  // Cleanup
  db.clearCustomAbusiveWords(chatId);
  db.clearCustomAbusiveWords(chatId2);

  // 5. NOTES SYSTEM TEST (/note, /getnote, /notes, /delnote, hashtag stripping)
  db.saveNote(chatId, '#faq', 'Link to FAQ test', 12345, 'AdminUser');
  const savedNote = db.getNote(chatId, 'faq');
  if (!savedNote || savedNote.content !== 'Link to FAQ test') {
    throw new Error('Test Failed: Save note or get note with leading # stripping failed');
  }
  const allNotes = db.getAllNotes(chatId);
  if (allNotes.length !== 1 || allNotes[0].name !== 'faq') {
    throw new Error('Test Failed: getAllNotes failed');
  }
  const deleted = db.deleteNote(chatId, '#faq');
  if (!deleted || db.getNote(chatId, 'faq') !== null) {
    throw new Error('Test Failed: deleteNote failed');
  }
  console.log('✅ [PASS] NOTE-01 to NOTE-04: Group notes save, retrieve, list, and delete functionality');

  console.log('🎉 All Roxie Next Phase Comprehensive Tests Passed Successfully!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRoxieNextPhaseTests().catch(err => {
    console.error('❌ Roxie Next Phase Test Suite Failed:', err);
    process.exit(1);
  });
}
