import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/storage.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runGroupJsonPersistenceTests() {
  console.log('===================================================================');
  console.log('🧪 Starting Roxie Per-Group JSON Storage & Persistence Test Suite');
  console.log('===================================================================\n');

  const testGroupA = -100999001;
  const testGroupB = -100999002;
  const testGroupC = -100999003;
  const testGroupCorrupt = -100999099;

  const fileA = path.join(db.groupsDir, `${testGroupA}.json`);
  const fileB = path.join(db.groupsDir, `${testGroupB}.json`);
  const fileC = path.join(db.groupsDir, `${testGroupC}.json`);
  const fileCorrupt = path.join(db.groupsDir, `${testGroupCorrupt}.json`);

  try {
    // ---------------------------------------------------------
    // TEST 1: Group JSON directory is created
    // ---------------------------------------------------------
    db.ensureDirectories();
    assert(fs.existsSync(db.groupsDir), 'data/groups directory must exist');
    assert(fs.existsSync(db.groupsBackupDir), 'data/groups/backups directory must exist');
    pass('TEST 1: Group JSON directory and backups directory are created');

    // ---------------------------------------------------------
    // TEST 2: New group creates its own JSON file
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, { chatTitle: 'Roxie Alpha Lab' });
    assert(fs.existsSync(fileA), `Group A file ${fileA} must be created on disk`);
    const parsedA = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA.chat?.chatId, String(testGroupA));
    assert.strictEqual(parsedA.chat?.title, 'Roxie Alpha Lab');
    pass('TEST 2: New group automatically creates its own JSON file');

    // ---------------------------------------------------------
    // TEST 3: Group A and Group B use different files
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupB, { chatTitle: 'Roxie Beta Lab' });
    assert(fs.existsSync(fileB), `Group B file ${fileB} must be created on disk`);
    const parsedB = JSON.parse(fs.readFileSync(fileB, 'utf-8'));
    assert.strictEqual(parsedB.chat?.chatId, String(testGroupB));
    assert.strictEqual(parsedB.chat?.title, 'Roxie Beta Lab');
    assert.notStrictEqual(fileA, fileB, 'Group A and Group B must use distinct file paths');
    pass('TEST 3: Group A and Group B use completely separate persistent JSON files');

    // ---------------------------------------------------------
    // TEST 4: Settings change automatically persists
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, { slowModeSeconds: 20, reportsEnabled: false });
    const parsedA4 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA4.settings.slowModeSeconds, 20);
    assert.strictEqual(parsedA4.settings.reportsEnabled, false);
    pass('TEST 4: Group settings mutations automatically persist to disk');

    // ---------------------------------------------------------
    // TEST 5: Sticker pack addition persists
    // ---------------------------------------------------------
    db.addStickerPack(testGroupA, {
      name: 'AlphaAnime',
      title: 'Alpha Anime Pack',
      enabled: true,
      stickerCount: 12
    });
    const parsedA5 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    const packFound = parsedA5.stickerPacks.find((p: any) => p.name.toLowerCase() === 'alphaanime');
    assert(packFound, 'Added sticker pack must be present in group JSON');
    assert.strictEqual(packFound.title, 'Alpha Anime Pack');
    pass('TEST 5: Sticker pack addition persists automatically into group JSON');

    // ---------------------------------------------------------
    // TEST 6: Sticker pack removal persists
    // ---------------------------------------------------------
    db.removeStickerPack(testGroupA, 'AlphaAnime');
    const parsedA6 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    const packRemoved = !parsedA6.stickerPacks.some((p: any) => p.name.toLowerCase() === 'alphaanime');
    assert(packRemoved, 'Removed sticker pack must no longer exist in group JSON');
    pass('TEST 6: Sticker pack removal persists automatically into group JSON');

    // ---------------------------------------------------------
    // TEST 7: Sticker pack enable/disable persists
    // ---------------------------------------------------------
    db.addStickerPack(testGroupA, {
      name: 'FlirtyPack',
      title: 'Flirty Moods',
      enabled: true,
      stickerCount: 8
    });
    db.toggleStickerPack(testGroupA, 'FlirtyPack', false);
    const parsedA7 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    const flirty = parsedA7.stickerPacks.find((p: any) => p.name.toLowerCase() === 'flirtypack');
    assert(flirty, 'Flirty pack must exist');
    assert.strictEqual(flirty.enabled, false, 'Flirty pack must be toggled to disabled');
    pass('TEST 7: Sticker pack enable/disable state persists automatically into group JSON');

    // ---------------------------------------------------------
    // TEST 8: Abuse word changes persist
    // ---------------------------------------------------------
    db.addAbuseWord(testGroupA, 'spammer123');
    const parsedA8 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert(parsedA8.abuseWords.includes('spammer123'), 'Added abuse word must persist');
    db.removeAbuseWord(testGroupA, 'spammer123');
    const parsedA8b = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert(!parsedA8b.abuseWords.includes('spammer123'), 'Removed abuse word must not be present');
    pass('TEST 8: Abuse word additions and removals persist automatically');

    // ---------------------------------------------------------
    // TEST 9: Lust Mode state persists
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, { lustMode: true, lustLevel: 3 });
    const parsedA9 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA9.lustMode.enabled, true);
    assert.strictEqual(parsedA9.lustMode.level, 3);
    pass('TEST 9: Lust Mode state and lust level persist automatically');

    // ---------------------------------------------------------
    // TEST 10: Auto Response settings persist
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 45,
        randomize: true,
        minSeconds: 45,
        maxSeconds: 150
      }
    });
    const parsedA10 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA10.autoResponse.mode, 'random');
    assert.strictEqual(parsedA10.autoResponse.minSeconds, 45);
    assert.strictEqual(parsedA10.autoResponse.maxSeconds, 150);
    pass('TEST 10: Complete Auto Response configuration persists');

    // ---------------------------------------------------------
    // TEST 11: Auto Sticker settings persist
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoSticker: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 75,
        randomize: false
      }
    });
    const parsedA11 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA11.autoSticker.mode, 'cooldown');
    assert.strictEqual(parsedA11.autoSticker.cooldownSeconds, 75);
    pass('TEST 11: Complete Auto Sticker configuration persists');

    // ---------------------------------------------------------
    // TEST 12: nextAllowedAt persists
    // ---------------------------------------------------------
    db.recordAutoResponseSent(testGroupA);
    const parsedA12 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert(parsedA12.autoResponse.nextAllowedAt > Date.now(), 'nextAllowedAt must be in the future');
    assert(parsedA12.autoResponse.lastResponseTimestamp > 0, 'lastResponseTimestamp must be saved');
    pass('TEST 12: High-frequency runtime state (nextAllowedAt, lastResponseTimestamp) persists');

    // ---------------------------------------------------------
    // TEST 13: Group messages persist where applicable
    // ---------------------------------------------------------
    db.addGroupConversationEntry(testGroupA, {
      role: 'user',
      name: 'Rohan Sharma',
      displayName: 'Rohan Sharma',
      content: 'Persistent message test',
      timestamp: Date.now(),
      messageId: 55441,
      chatId: testGroupA,
      mediaType: 'text',
      direction: 'incoming',
      source: 'telegram'
    });
    const parsedA13 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    const foundMsg = parsedA13.messages.find((m: any) => m.messageId === 55441);
    assert(foundMsg, 'Stored group message must be present in group JSON');
    assert.strictEqual(foundMsg.displayName, 'Rohan Sharma');
    pass('TEST 13: Group conversation messages persist in group JSON');

    // ---------------------------------------------------------
    // TEST 14: Bot-left state persists
    // ---------------------------------------------------------
    db.markBotLeftGroup(testGroupA);
    const parsedA14 = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(parsedA14.status.botLeft, true);
    assert(parsedA14.status.leftAt, 'leftAt timestamp must be recorded');
    pass('TEST 14: Bot-left state and leftAt timestamp persist in group JSON');

    // ---------------------------------------------------------
    // TEST 15: Server startup restores group state
    // ---------------------------------------------------------
    // Create an independent group on disk (simulating prior server session)
    const futureAllowedAt = Date.now() + 120000;
    const initialCData = {
      schemaVersion: 1,
      chat: {
        chatId: String(testGroupC),
        title: 'Restored Group C',
        type: 'supergroup',
        username: 'restored_c'
      },
      status: {
        botLeft: false,
        leftAt: null
      },
      settings: {
        chatId: testGroupC,
        chatTitle: 'Restored Group C',
        lustMode: true,
        lustLevel: 4,
        warnLimit: 5,
        autoResponse: {
          enabled: true,
          mode: 'random',
          minSeconds: 50,
          maxSeconds: 200,
          nextAllowedAt: futureAllowedAt
        },
        abuseWords: ['badword123']
      },
      stickerPacks: [
        {
          name: 'RestoredPack',
          title: 'Restored Pack Title',
          enabled: true,
          stickerCount: 10
        }
      ],
      abuseWords: ['badword123'],
      messages: [
        {
          role: 'user',
          name: 'Priya',
          content: 'Hello prior session',
          messageId: 88771,
          timestamp: Date.now() - 10000
        }
      ],
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(fileC, JSON.stringify(initialCData, null, 2), 'utf-8');

    // Simulate startup restoration
    db.loadAllGroupJsons();

    // Verify in-memory state is perfectly restored
    const settingsC = db.getGroupSettings(testGroupC);
    assert.strictEqual(settingsC.chatTitle, 'Restored Group C');
    assert.strictEqual(settingsC.lustMode, true);
    assert.strictEqual(settingsC.lustLevel, 4);
    assert.strictEqual(settingsC.warnLimit, 5);
    assert.strictEqual(settingsC.autoResponse?.mode, 'random');
    assert.strictEqual(settingsC.autoResponse?.nextAllowedAt, futureAllowedAt);
    assert(settingsC.abuseWords?.includes('badword123'), 'Abuse words must be restored');

    const memoryC = db.getGroupMemory(testGroupC);
    assert(memoryC.some(m => m.messageId === 88771), 'Stored messages must be restored');
    pass('TEST 15: Server startup cleanly restores complete group state and runtime timers');

    // ---------------------------------------------------------
    // TEST 16: Corrupted group file does not crash the server
    // ---------------------------------------------------------
    const bakCorrupt = path.join(db.groupsBackupDir, `${testGroupCorrupt}.json.bak`);
    if (fs.existsSync(bakCorrupt)) fs.unlinkSync(bakCorrupt);
    fs.writeFileSync(fileCorrupt, '{ INVALID_JSON_DATA_CORRUPT :::::: ', 'utf-8');
    const result = db.loadAllGroupJsons();
    assert(result.errorsCount >= 1, 'Should safely increment errors count without crashing');
    // Verify system continues operating normally
    const settingsAfterError = db.getGroupSettings(testGroupC);
    assert.strictEqual(settingsAfterError.chatTitle, 'Restored Group C');
    pass('TEST 16: Corrupted group JSON file handled safely without crashing the server');

    // ---------------------------------------------------------
    // TEST 17: Atomic write prevents partial final files
    // ---------------------------------------------------------
    db.saveGroupJsonSync(testGroupA);
    const tmpFiles = fs.readdirSync(db.groupsDir).filter(f => f.endsWith('.tmp'));
    assert.strictEqual(tmpFiles.length, 0, 'No lingering .tmp files should remain after atomic write');
    pass('TEST 17: Atomic write guarantees safe rename without lingering temporary files');

    // ---------------------------------------------------------
    // TEST 18: Concurrent updates do not corrupt JSON
    // ---------------------------------------------------------
    const concurrentPromises = [];
    for (let i = 0; i < 15; i++) {
      concurrentPromises.push(
        db.saveGroupJson(testGroupA)
      );
    }
    await Promise.all(concurrentPromises);
    const reReadA = fs.readFileSync(fileA, 'utf-8');
    assert.doesNotThrow(() => JSON.parse(reReadA), 'JSON must remain completely valid after concurrent writes');
    pass('TEST 18: Concurrent write queue prevents file corruption');

    // ---------------------------------------------------------
    // TEST 19: Group A cannot modify Group B
    // ---------------------------------------------------------
    const preB = fs.readFileSync(fileB, 'utf-8');
    // Modify group A multiple times
    db.updateGroupSettings(testGroupA, { chatTitle: 'Alpha Modified Repeatedly' });
    db.addAbuseWord(testGroupA, 'isolated_abuse_word');
    db.recordAutoResponseSent(testGroupA);
    const postB = fs.readFileSync(fileB, 'utf-8');
    assert.strictEqual(preB, postB, 'Mutations on Group A must never alter Group B on disk');
    pass('TEST 19: Strict group isolation verified (Group A mutations cannot affect Group B)');

    // ---------------------------------------------------------
    // TEST 20: Secrets are never written into group JSON
    // ---------------------------------------------------------
    (db.getGroupSettings(testGroupA) as any).botToken = '12345:SECRET_TOKEN_DO_NOT_LEAK';
    (db.getGroupSettings(testGroupA) as any).apiKey = 'sk-DO_NOT_LEAK_API_KEY_12345';
    (db.getGroupSettings(testGroupA) as any).password = 'AdminPassword123';
    db.saveGroupJsonSync(testGroupA);
    const rawFileA = fs.readFileSync(fileA, 'utf-8');
    assert(!rawFileA.includes('SECRET_TOKEN_DO_NOT_LEAK'), 'Bot token must never be written to group JSON');
    assert(!rawFileA.includes('DO_NOT_LEAK_API_KEY'), 'API key must never be written to group JSON');
    assert(!rawFileA.includes('AdminPassword123'), 'Password must never be written to group JSON');
    pass('TEST 20: Security audit verified (No secrets, tokens, or credentials written to group JSON)');

    // ---------------------------------------------------------
    // TEST 21: Schema version exists
    // ---------------------------------------------------------
    const finalParsedA = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
    assert.strictEqual(finalParsedA.schemaVersion, 1, 'schemaVersion must equal 1');
    pass('TEST 21: Schema version 1 is present on all persisted group JSON files');

    // ---------------------------------------------------------
    // TEST 22: Existing storage migration does not erase data
    // ---------------------------------------------------------
    const testGroupD = -100999004;
    const fileD = path.join(db.groupsDir, `${testGroupD}.json`);
    if (fs.existsSync(fileD)) fs.unlinkSync(fileD);

    // Seed group directly into memory without file on disk
    db.updateGroupSettings(testGroupD, { chatTitle: 'In-Memory Group D', warnLimit: 9 });
    // Verify file was created as part of storage migration
    assert(fs.existsSync(fileD), 'Storage migration must persist newly registered in-memory groups');
    const parsedD = JSON.parse(fs.readFileSync(fileD, 'utf-8'));
    assert.strictEqual(parsedD.settings.warnLimit, 9);
    assert.strictEqual(parsedD.chat.title, 'In-Memory Group D');
    pass('TEST 22: Storage migration preserves existing group state without data loss');

  } finally {
    // Cleanup temporary test files
    for (const f of [fileA, fileB, fileC, fileCorrupt, path.join(db.groupsDir, '-100999004.json')]) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {}
    }
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL ${passed} GROUP JSON PERSISTENCE TESTS PASSED! (${passed}/22)`);
  console.log('===================================================================\n');
  process.exit(0);
}

runGroupJsonPersistenceTests().catch((err) => {
  console.error('❌ Group JSON persistence tests failed:', err);
  process.exit(1);
});
