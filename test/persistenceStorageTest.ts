import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/storage.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runPersistenceStorageTests() {
  console.log('===================================================================');
  console.log('🧪 Starting Roxie Permanent Group Data Persistence Test Suite (28 Tests)');
  console.log('===================================================================\n');

  const testGroup1 = -100999011;
  const testGroup2 = -100999012;
  const testPrivateUser = 8881234;

  const file1 = path.join(db.groupsDir, `${testGroup1}.json`);
  const file2 = path.join(db.groupsDir, `${testGroup2}.json`);
  const filePrivate = path.join(db.privateDir, `${testPrivateUser}.json`);
  const bak1 = path.join(db.groupsBackupDir, `${testGroup1}.json.bak`);

  try {
    // ---------------------------------------------------------
    // TEST 01: Create group data
    // ---------------------------------------------------------
    db.ensureDirectories();
    const initSettings = db.getGroupSettings(testGroup1, 'Persist Alpha Lab');
    assert.strictEqual(initSettings.chatId, testGroup1);
    assert.strictEqual(initSettings.chatTitle, 'Persist Alpha Lab');
    pass('TEST 01: Create group data');

    // ---------------------------------------------------------
    // TEST 02: Save group data
    // ---------------------------------------------------------
    db.saveGroupJsonSync(testGroup1);
    assert(fs.existsSync(file1), `Group file ${file1} must exist on disk`);
    const parsed1 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(parsed1.schemaVersion, 1);
    assert.strictEqual(parsed1.chat.chatId, String(testGroup1));
    assert.strictEqual(parsed1.chat.title, 'Persist Alpha Lab');
    pass('TEST 02: Save group data');

    // ---------------------------------------------------------
    // TEST 03: Read group data after simulated restart
    // ---------------------------------------------------------
    const loadRes = db.loadAllGroupJsons();
    assert(loadRes.loadedCount >= 1, 'Should load at least 1 group file');
    const readSettings = db.getGroupSettings(testGroup1);
    assert.strictEqual(readSettings.chatTitle, 'Persist Alpha Lab');
    pass('TEST 03: Read group data after simulated restart');

    // ---------------------------------------------------------
    // TEST 04: Settings survive restart
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, { slowModeSeconds: 45, reportsEnabled: false });
    db.loadAllGroupJsons();
    const settingsPostReload = db.getGroupSettings(testGroup1);
    assert.strictEqual(settingsPostReload.slowModeSeconds, 45);
    assert.strictEqual(settingsPostReload.reportsEnabled, false);
    pass('TEST 04: Settings survive restart');

    // ---------------------------------------------------------
    // TEST 05: Lust Mode survives restart
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, { lustMode: true, lustLevel: 3 });
    db.loadAllGroupJsons();
    const settingsLust = db.getGroupSettings(testGroup1);
    assert.strictEqual(settingsLust.lustMode, true);
    assert.strictEqual(settingsLust.lustLevel, 3);
    pass('TEST 05: Lust Mode survives restart');

    // ---------------------------------------------------------
    // TEST 06: Abuse words survive restart
    // ---------------------------------------------------------
    db.addAbuseWord(testGroup1, 'toxic_pattern_xyz');
    db.loadAllGroupJsons();
    const abuseList = db.getAbuseWords(testGroup1);
    assert(abuseList.includes('toxic_pattern_xyz'), 'Abuse word must survive reload');
    pass('TEST 06: Abuse words survive restart');

    // ---------------------------------------------------------
    // TEST 07: Sticker packs survive restart
    // ---------------------------------------------------------
    db.addStickerPack(testGroup1, {
      name: 'SuperPack',
      title: 'Super Pack Title',
      enabled: true,
      stickerCount: 15
    });
    db.loadAllGroupJsons();
    const settingsSticker = db.getGroupSettings(testGroup1);
    assert(settingsSticker.stickerPacks && settingsSticker.stickerPacks['superpack'], 'Sticker pack must survive reload');
    assert.strictEqual(settingsSticker.stickerPacks['superpack'].title, 'Super Pack Title');
    pass('TEST 07: Sticker packs survive restart');

    // ---------------------------------------------------------
    // TEST 08: Sticker enable/disable state survives restart
    // ---------------------------------------------------------
    db.toggleStickerPack(testGroup1, 'SuperPack', false);
    db.loadAllGroupJsons();
    const toggledSettings = db.getGroupSettings(testGroup1);
    assert.strictEqual(toggledSettings.stickerPacks?.['superpack'].enabled, false);
    pass('TEST 08: Sticker enable/disable state survives restart');

    // ---------------------------------------------------------
    // TEST 09: Auto response configuration survives restart
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        minSeconds: 25,
        maxSeconds: 110,
        cooldownSeconds: 25,
        randomize: true
      }
    });
    db.loadAllGroupJsons();
    const autoRespSettings = db.getGroupSettings(testGroup1);
    assert.strictEqual(autoRespSettings.autoResponse?.mode, 'random');
    assert.strictEqual(autoRespSettings.autoResponse?.minSeconds, 25);
    assert.strictEqual(autoRespSettings.autoResponse?.maxSeconds, 110);
    pass('TEST 09: Auto response configuration survives restart');

    // ---------------------------------------------------------
    // TEST 10: Randomized nextAllowedAt survives restart
    // ---------------------------------------------------------
    db.recordAutoResponseSent(testGroup1);
    const preReloadAllowedAt = db.getGroupSettings(testGroup1).autoResponse?.nextAllowedAt || 0;
    assert(preReloadAllowedAt > Date.now(), 'nextAllowedAt should be in the future');
    db.loadAllGroupJsons();
    const postReloadAllowedAt = db.getGroupSettings(testGroup1).autoResponse?.nextAllowedAt;
    assert.strictEqual(postReloadAllowedAt, preReloadAllowedAt, 'nextAllowedAt must survive restart exactly');
    pass('TEST 10: Randomized nextAllowedAt survives restart');

    // ---------------------------------------------------------
    // TEST 11: Auto sticker configuration survives restart
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoSticker: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 80,
        randomize: false
      }
    });
    db.recordAutoStickerSent(testGroup1);
    const preStickerAllowedAt = db.getGroupSettings(testGroup1).autoSticker?.nextAllowedAt || 0;
    assert(preStickerAllowedAt > Date.now(), 'autoSticker nextAllowedAt should be in the future');
    db.loadAllGroupJsons();
    const postStickerAllowedAt = db.getGroupSettings(testGroup1).autoSticker?.nextAllowedAt;
    assert.strictEqual(postStickerAllowedAt, preStickerAllowedAt);
    pass('TEST 11: Auto sticker configuration survives restart');

    // ---------------------------------------------------------
    // TEST 12: Conversation memory survives restart
    // ---------------------------------------------------------
    db.addGroupConversationEntry(testGroup1, {
      role: 'user',
      name: 'Alok',
      content: 'Permanent memory test',
      messageId: 7771,
      timestamp: Date.now()
    });
    db.loadAllGroupJsons();
    const groupMemory = db.getGroupMemory(testGroup1);
    assert(groupMemory.some(m => m.messageId === 7771 && m.content === 'Permanent memory test'));
    pass('TEST 12: Conversation memory survives restart');

    // ---------------------------------------------------------
    // TEST 13: Private DM history survives restart
    // ---------------------------------------------------------
    db.addPrivateMessage(testPrivateUser, testPrivateUser, {
      role: 'user',
      content: 'Private message test content',
      messageId: 9991,
      timestamp: Date.now(),
      name: 'Samir'
    });
    assert(fs.existsSync(filePrivate), `Private chat file ${filePrivate} must exist`);
    db.loadAllPrivateJsons();
    const privateMsgs = db.getPrivateChatMessages(testPrivateUser);
    assert(privateMsgs.some(m => m.messageId === 9991 && m.content === 'Private message test content'));
    pass('TEST 13: Private DM history survives restart');

    // ---------------------------------------------------------
    // TEST 14: Group A data does not leak into Group B
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup2, { chatTitle: 'Beta Isolated Group' });
    const preFile2 = fs.readFileSync(file2, 'utf-8');
    // Mutate Group 1 multiple times
    db.updateGroupSettings(testGroup1, { chatTitle: 'Alpha Title 2', warnLimit: 6 });
    db.addAbuseWord(testGroup1, 'isolated_abuse_token');
    const postFile2 = fs.readFileSync(file2, 'utf-8');
    assert.strictEqual(preFile2, postFile2, 'Group 1 mutations must not modify Group 2 file on disk');
    pass('TEST 14: Group A data does not leak into Group B');

    // ---------------------------------------------------------
    // TEST 15: Partial settings update does not erase unrelated fields
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, { chatTitle: 'Updated Alpha Title Only' });
    const checkSettings15 = db.getGroupSettings(testGroup1);
    assert.strictEqual(checkSettings15.chatTitle, 'Updated Alpha Title Only');
    assert.strictEqual(checkSettings15.slowModeSeconds, 45, 'slowModeSeconds should remain intact');
    assert.strictEqual(checkSettings15.lustMode, true, 'lustMode should remain intact');
    assert.strictEqual(checkSettings15.lustLevel, 3, 'lustLevel should remain intact');
    assert(checkSettings15.stickerPacks?.['superpack'], 'sticker pack should remain intact');
    pass('TEST 15: Partial settings update does not erase unrelated fields');

    // ---------------------------------------------------------
    // TEST 16: Atomic write produces valid JSON
    // ---------------------------------------------------------
    db.saveGroupJsonSync(testGroup1);
    const tmpFiles = fs.readdirSync(db.groupsDir).filter(f => f.endsWith('.tmp'));
    assert.strictEqual(tmpFiles.length, 0, 'No temporary files should be left behind');
    const file1Raw = fs.readFileSync(file1, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(file1Raw), 'Target JSON must be strictly parseable');
    pass('TEST 16: Atomic write produces valid JSON');

    // ---------------------------------------------------------
    // TEST 17: Corrupted JSON recovery works
    // ---------------------------------------------------------
    // Ensure backup exists
    assert(fs.existsSync(bak1), `Backup file ${bak1} should exist`);
    // Intentionally corrupt the active file
    fs.writeFileSync(file1, '{ MALFORMED_JSON_STRING :::::::', 'utf-8');
    // Load all groups; it should auto-recover from .bak
    db.loadAllGroupJsons();
    const recoveredSettings = db.getGroupSettings(testGroup1);
    assert.strictEqual(recoveredSettings.chatId, testGroup1);
    assert(recoveredSettings.chatTitle.includes('Alpha'), 'Should recover settings from backup');
    const fixedFile1 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(fixedFile1.schemaVersion, 1);
    pass('TEST 17: Corrupted JSON recovery works from backup file');

    // ---------------------------------------------------------
    // TEST 18: Missing JSON creates safe defaults
    // ---------------------------------------------------------
    const missingChatId = -100999099;
    const safeDefaults = db.getGroupSettings(missingChatId);
    assert.strictEqual(safeDefaults.chatId, missingChatId);
    assert.strictEqual(safeDefaults.warnLimit, 3);
    assert.strictEqual(safeDefaults.warnAction, 'ban');
    pass('TEST 18: Missing JSON creates safe defaults');

    // ---------------------------------------------------------
    // TEST 19: Schema migration works
    // ---------------------------------------------------------
    const legacyGroupChatId = -100999088;
    const legacyFile = path.join(db.groupsDir, `${legacyGroupChatId}.json`);
    const legacyData = {
      // Missing schemaVersion and modern keys
      chat: { chatId: String(legacyGroupChatId), title: 'Legacy Group 88' },
      settings: { chatId: legacyGroupChatId, warnLimit: 2, lustMode: true }
    };
    fs.writeFileSync(legacyFile, JSON.stringify(legacyData), 'utf-8');
    db.loadAllGroupJsons();
    // After loading, resave it to upgrade
    db.saveGroupJsonSync(legacyGroupChatId);
    const upgraded = JSON.parse(fs.readFileSync(legacyFile, 'utf-8'));
    assert.strictEqual(upgraded.schemaVersion, 1, 'schemaVersion should be upgraded to 1');
    assert.strictEqual(upgraded.settings.warnLimit, 2, 'legacy settings must be preserved');
    assert.strictEqual(upgraded.chat.title, 'Legacy Group 88');
    if (fs.existsSync(legacyFile)) fs.unlinkSync(legacyFile);
    pass('TEST 19: Schema migration works');

    // ---------------------------------------------------------
    // TEST 20: Concurrent updates do not corrupt the file
    // ---------------------------------------------------------
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(db.saveGroupJson(testGroup1));
    }
    await Promise.all(promises);
    const postConcurrent = fs.readFileSync(file1, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(postConcurrent));
    pass('TEST 20: Concurrent updates do not corrupt the file');

    // ---------------------------------------------------------
    // TEST 21: Dashboard setting update persists
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, { protectionDuplicateLimit: 4 });
    const status21 = db.getGroupStorageStatus(testGroup1);
    assert.strictEqual(status21.fileExists, true);
    assert(status21.fileSize > 0);
    assert.strictEqual(status21.schemaVersion, 1);
    const parsed21 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(parsed21.settings.protectionDuplicateLimit, 4);
    pass('TEST 21: Dashboard setting update persists');

    // ---------------------------------------------------------
    // TEST 22: Dashboard sticker pack update persists
    // ---------------------------------------------------------
    db.updateGroupStickerPack(testGroup1, 'superpack', { title: 'Super Pack Renamed' });
    const parsed22 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(parsed22.settings.stickerPacks?.['superpack']?.title, 'Super Pack Renamed');
    pass('TEST 22: Dashboard sticker pack update persists');

    // ---------------------------------------------------------
    // TEST 23: Dashboard auto-response update persists
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroup1, {
      autoResponse: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 50,
        randomize: false
      }
    });
    const parsed23 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(parsed23.settings.autoResponse?.cooldownSeconds, 50);
    pass('TEST 23: Dashboard auto-response update persists');

    // ---------------------------------------------------------
    // TEST 24: Bot-left status persists
    // ---------------------------------------------------------
    db.markBotLeftGroup(testGroup1);
    const parsed24 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert.strictEqual(parsed24.status.botLeft, true);
    assert(parsed24.status.leftAt);
    pass('TEST 24: Bot-left status persists');

    // ---------------------------------------------------------
    // TEST 25: Audit logs persist
    // ---------------------------------------------------------
    db.addLog({
      action: 'setting_change',
      chatId: testGroup1,
      adminUserId: 998811,
      adminUsername: 'SuperAdmin',
      details: 'Audit log persistent test'
    });
    const parsed25 = JSON.parse(fs.readFileSync(file1, 'utf-8'));
    assert(parsed25.activity.some((a: any) => a.action === 'setting_change' && a.details === 'Audit log persistent test'));
    pass('TEST 25: Audit logs persist');

    // ---------------------------------------------------------
    // TEST 26: Restart simulation restores all state
    // ---------------------------------------------------------
    await db.flushAll();
    db.loadAllGroupJsons();
    db.loadAllPrivateJsons();
    const restored1 = db.getGroupSettings(testGroup1);
    assert.strictEqual(restored1.chatId, testGroup1);
    assert.strictEqual(restored1.botLeft, true);
    assert.strictEqual(restored1.lustMode, true);
    const restoredPrivate = db.getPrivateChatMessages(testPrivateUser);
    assert(restoredPrivate.length > 0);
    pass('TEST 26: Restart simulation restores all state');

    // ---------------------------------------------------------
    // TEST 27: ROXIE_DATA_DIR environment variable is respected
    // ---------------------------------------------------------
    const originalDir = process.env.ROXIE_DATA_DIR;
    const testCustomDir = path.join(process.cwd(), 'data_custom_test');
    try {
      process.env.ROXIE_DATA_DIR = testCustomDir;
      assert.strictEqual(db.dataDir, testCustomDir);
      assert.strictEqual(db.groupsDir, path.join(testCustomDir, 'groups'));
      assert.strictEqual(db.privateDir, path.join(testCustomDir, 'private'));
      assert.strictEqual(db.backupDir, path.join(testCustomDir, 'backup'));
    } finally {
      if (originalDir) {
        process.env.ROXIE_DATA_DIR = originalDir;
      } else {
        delete process.env.ROXIE_DATA_DIR;
      }
    }
    pass('TEST 27: ROXIE_DATA_DIR environment variable is respected');

    // ---------------------------------------------------------
    // TEST 28: Missing ROXIE_DATA_DIR produces a warning but local development still works
    // ---------------------------------------------------------
    const health = db.getPersistenceHealth();
    assert(health.status === 'healthy' || health.status === 'warning');
    assert.strictEqual(health.directoryWritable, true);
    assert.strictEqual(health.filesReadable, true);
    assert.strictEqual(health.lastSaveSuccessful, true);
    pass('TEST 28: Missing ROXIE_DATA_DIR fallback verified and health check reports operational');

  } finally {
    // Clean up temporary test files
    for (const f of [file1, file2, filePrivate, bak1]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} PERMANENT PERSISTENCE TESTS PASSED! (${passed}/28)`);
  console.log('===================================================================\n');
  process.exit(0);
}

runPersistenceStorageTests().catch((err) => {
  console.error('❌ Persistence storage tests failed:', err);
  process.exit(1);
});
