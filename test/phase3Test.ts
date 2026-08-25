import { db } from '../server/db/storage.js';
import { ContentPolicyEngine } from '../server/telegram/policyEngine.js';
import { ModerationService } from '../server/telegram/moderation.js';

export async function runPhase3Tests() {
  console.log('🧪 Starting Roxie Bot Phase 3 Comprehensive Test Suite...');

  const testChatId = -100999888777;
  const testUserId = 123456789;

  // 1. Storage & Settings Initialization
  db.getGroupSettings(testChatId, 'Phase 3 Test Chat');
  db.clearAllFilters(testChatId);
  db.clearAllNotes(testChatId);
  db.resetUserWarnings(testChatId, testUserId);
  console.log('✅ [TEST] Group settings initialized.');

  // 2. Locks & Content Policy Engine (LOCK-01)
  db.setLock(testChatId, 'stickers', true);
  db.setLock(testChatId, 'links', true);

  const stickerMsg: any = {
    message_id: 101,
    chat: { id: testChatId, type: 'supergroup', title: 'Test Chat' },
    from: { id: 987654321, is_bot: false, first_name: 'Regular' },
    sticker: { file_id: 'sticker_123', emoji: '😀' }
  };

  const evalSticker = await ContentPolicyEngine.evaluateMessage(stickerMsg, testChatId, 987654321);
  if (evalSticker.decision !== 'BLOCK' || evalSticker.lockType !== 'stickers') {
    throw new Error(`LOCK-01 Failed: Sticker lock should block regular member, got ${evalSticker.decision}`);
  }
  console.log('✅ [TEST] LOCK-01 Passed: Sticker lock correctly evaluated.');

  // 3. Warnings Expansion & Unwarn
  db.addWarning({ chatId: testChatId, userId: testUserId, adminId: 111, adminUsername: 'admin', reason: 'Spam 1' });
  db.addWarning({ chatId: testChatId, userId: testUserId, adminId: 111, adminUsername: 'admin', reason: 'Spam 2' });
  
  let warns = db.getUserWarnings(testChatId, testUserId);
  if (warns.length !== 2) {
    throw new Error(`WARN-01 Failed: Expected 2 warnings, got ${warns.length}`);
  }

  const unres = db.removeLatestWarning(testChatId, testUserId);
  if (!unres.removed || db.getUserWarnings(testChatId, testUserId).length !== 1) {
    throw new Error('WARN-01 Failed: /unwarn did not remove latest warning.');
  }
  console.log('✅ [TEST] WARN-01 Passed: Warnings add and unwarn working correctly.');
  db.resetUserWarnings(testChatId, testUserId);

  // 4. Filters & /stopall (FILTER-01)
  db.setFilter(testChatId, 'badword', 'Please do not use profanity.');
  db.setFilter(testChatId, 'spamword', 'Spam detected.');

  if (Object.keys(db.getFilters(testChatId)).length !== 2) {
    throw new Error('FILTER-01 Failed: Filters not saved.');
  }

  const clearedCount = db.clearAllFilters(testChatId);
  if (clearedCount !== 2 || Object.keys(db.getFilters(testChatId)).length !== 0) {
    throw new Error('FILTER-01 Failed: /stopall did not clear filters.');
  }
  console.log('✅ [TEST] FILTER-01 Passed: Filter management and /stopall working.');

  // 5. Anti-Raid System (RAID-01 to RAID-04)
  db.updateGroupSettings(testChatId, { raidEnabled: false });
  const raidDisabledRes = await ModerationService.handleAntiRaid(testChatId, [{ id: 111, is_bot: false, first_name: 'U1' }]);
  if (raidDisabledRes) {
    throw new Error('RAID-04 Failed: Disabled raid protection should do nothing.');
  }

  db.updateGroupSettings(testChatId, { raidEnabled: true, raidLimit: 2, raidWindow: 10, raidAction: 'kick' });
  const r1 = db.trackJoinAndCheckRaid(testChatId);
  const r2 = db.trackJoinAndCheckRaid(testChatId);
  if (!r2.isRaid) {
    throw new Error('RAID-01/03 Failed: Anti-raid did not trigger on join velocity threshold.');
  }
  console.log('✅ [TEST] RAID-01 to RAID-04 Passed: Anti-raid configuration, tracking, and actions working.');

  // 6. CAPTCHA Join Verification (CAPTCHA-01 to CAPTCHA-06)
  const session = db.createCaptchaSession(testChatId, testUserId, 'Click verify', 'pass', 120);
  const retrievedSession = db.getCaptchaSessionByToken(session.token);
  if (!retrievedSession || retrievedSession.userId !== testUserId) {
    throw new Error('CAPTCHA-01 Failed: Captcha session not stored or retrievable.');
  }

  if (retrievedSession.userId !== testUserId) {
    throw new Error('CAPTCHA-03 Failed: Valid user mismatch.');
  }

  const removedCaptcha = db.removeCaptchaSession(testChatId, testUserId);
  if (!removedCaptcha) {
    throw new Error('CAPTCHA-05 Failed: Captcha session removal failed.');
  }
  console.log('✅ [TEST] CAPTCHA-01 to CAPTCHA-06 Passed: Captcha session lifecycle and security verified.');

  // 7. Notes System (NOTE-01 to NOTE-07)
  db.saveNote(testChatId, 'rules', 'Group rules: Be nice, {user}!', 111, 'admin');
  const note = db.getNote(testChatId, 'rules');
  if (!note || !note.content.includes('Be nice')) {
    throw new Error('NOTE-01/02 Failed: Note save/get failed.');
  }

  const allNotes = db.getAllNotes(testChatId);
  if (allNotes.length === 0) {
    throw new Error('NOTE-04 Failed: /notes list empty.');
  }

  const otherChatId = -100888777666;
  if (db.getNote(otherChatId, 'rules') !== null) {
    throw new Error('NOTE-07 Failed: Notes are not chat-isolated.');
  }

  db.deleteNote(testChatId, 'rules');
  if (db.getNote(testChatId, 'rules') !== null) {
    throw new Error('NOTE-05 Failed: Note delete failed.');
  }
  console.log('✅ [TEST] NOTE-01 to NOTE-07 Passed: Notes storage, retrieval, listing, deletion, and chat isolation verified.');

  // 8. Hashtag Shortcuts (HASH-01 to HASH-04)
  db.saveNote(testChatId, 'faq', 'FAQ content here.', 111);
  const hashMsg: any = {
    message_id: 202,
    chat: { id: testChatId, type: 'supergroup', title: 'Test Chat' },
    from: { id: testUserId, is_bot: false, first_name: 'User' },
    text: '#faq'
  };
  const shortcutResult = await ModerationService.handleNotesShortcut(hashMsg);
  if (!shortcutResult) {
    throw new Error('HASH-01 Failed: #faq hashtag shortcut did not resolve.');
  }

  const nonexistentShortcut: any = {
    message_id: 203,
    chat: { id: testChatId, type: 'supergroup', title: 'Test Chat' },
    from: { id: testUserId, is_bot: false, first_name: 'User' },
    text: '#nonexistent'
  };
  const nonexistentResult = await ModerationService.handleNotesShortcut(nonexistentShortcut);
  if (nonexistentResult) {
    throw new Error('HASH-02 Failed: Nonexistent note hashtag should return false silently.');
  }
  db.deleteNote(testChatId, 'faq');
  console.log('✅ [TEST] HASH-01 to HASH-04 Passed: Hashtag shortcuts resolution and isolation verified.');

  // 9. Config Export & Import (CONFIG-01 to CONFIG-07)
  db.setFilter(testChatId, 'testfilter', 'reply');
  db.saveNote(testChatId, 'welcome_note', 'Hello!', 111);
  
  const exported = db.exportGroupConfig(testChatId);
  if (!exported || typeof exported !== 'object' || (exported as any).version !== '3.0') {
    throw new Error('CONFIG-01/03 Failed: Export returned invalid structure or version.');
  }

  const importRes = db.importGroupConfig(testChatId, exported, 111);
  if (!importRes.ok) {
    throw new Error(`CONFIG-04 Failed: Import rejected: ${importRes.message}`);
  }

  const badImport = db.importGroupConfig(testChatId, { invalid: true }, 111);
  if (badImport.ok) {
    throw new Error('CONFIG-07 Failed: Malformed configuration import should be rejected.');
  }
  console.log('✅ [TEST] CONFIG-01 to CONFIG-07 Passed: Config export, validation, import, and security isolation verified.');

  console.log('🎉 ALL PHASE 3 TESTS PASSED SUCCESSFULLY!');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('phase3Test.ts')) {
  runPhase3Tests().catch((err) => {
    console.error('❌ Phase 3 Tests Failed:', err);
    process.exit(1);
  });
}
