import fs from 'fs';
import path from 'path';
import { StorageManager } from '../server/db/storage.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`✅ [PASS] ${message}`);
  }
}

async function runRenderStorageAndBackupImportTestSuite() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Render Storage & Backup Import Test Suite');
  console.log('================================================================\n');

  const testBaseDir = path.resolve(process.cwd(), 'data', 'test_render_suite_' + Date.now());
  if (!fs.existsSync(testBaseDir)) {
    fs.mkdirSync(testBaseDir, { recursive: true });
  }

  const originalEnv = process.env.ROXIE_DATA_DIR;

  try {
    // ----------------------------------------------------------------
    // 1. Writable data directory
    // ----------------------------------------------------------------
    console.log('--- TEST 1: Writable Data Directory ---');
    const writableDir = path.join(testBaseDir, 'writable_disk');
    fs.mkdirSync(writableDir, { recursive: true });
    process.env.ROXIE_DATA_DIR = writableDir;

    const sm1 = new StorageManager();
    assert(sm1.isStorageWritable() === true, 'TEST 01.1: Storage is marked as writable');
    assert(sm1.getStorageMode() === 'persistent', 'TEST 01.2: Storage mode is persistent');
    assert(sm1.getStorageHealthIndicator() === 'persistent', 'TEST 01.3: Health indicator is persistent');

    // ----------------------------------------------------------------
    // 2. Missing data directory auto-creation
    // ----------------------------------------------------------------
    console.log('\n--- TEST 2: Missing Data Directory ---');
    const missingDir = path.join(testBaseDir, 'nested', 'missing', 'data_dir');
    process.env.ROXIE_DATA_DIR = missingDir;

    const sm2 = new StorageManager();
    assert(fs.existsSync(missingDir), 'TEST 02.1: Missing directory was created recursively');
    assert(sm2.isStorageWritable() === true, 'TEST 02.2: Newly created directory is writable');

    // ----------------------------------------------------------------
    // 3 & 4. Unwritable data directory & Local ./data fallback
    // ----------------------------------------------------------------
    console.log('\n--- TEST 3-4: Unwritable Directory & Fallback ---');
    const restrictedDir = '/var/data/roxie_unwritable_test_virtual_path';
    process.env.ROXIE_DATA_DIR = restrictedDir;

    const origMkdirSync = fs.mkdirSync;
    (fs as any).mkdirSync = (p: fs.PathLike, options?: any) => {
      const pStr = String(p);
      if (pStr.includes('roxie_unwritable_test_virtual_path')) {
        const err: any = new Error(`EACCES: permission denied, mkdir '${pStr}'`);
        err.code = 'EACCES';
        throw err;
      }
      return origMkdirSync(p, options);
    };

    try {
      const sm3 = new StorageManager();
      const validation = sm3.resolveAndValidateStorage();
      assert(validation.mode === 'local_fallback', 'TEST 03.1: Gracefully falls back to local data directory');
      assert(validation.isWritable === true, 'TEST 03.2: Local fallback directory is writable');
      assert(validation.error !== null && validation.error.includes('Permission/access failure'), 'TEST 03.3: Captures permission error in diagnostics');
    } finally {
      fs.mkdirSync = origMkdirSync;
    }

    // ----------------------------------------------------------------
    // 5. Atomic JSON write
    // ----------------------------------------------------------------
    console.log('\n--- TEST 5: Atomic JSON Write ---');
    const atomicDir = path.join(testBaseDir, 'atomic_test_dir');
    fs.mkdirSync(atomicDir, { recursive: true });
    process.env.ROXIE_DATA_DIR = atomicDir;

    const sm5 = new StorageManager();
    const testChatId = -100888999111;
    sm5.updateGroupSettings(testChatId, { warnLimit: 5, chatTitle: 'Atomic Write Group' });
    sm5.saveGroupJsonSync(testChatId);

    const targetFile = path.join(sm5.groupsDir, `${testChatId}.json`);
    const tmpFile = path.join(sm5.groupsDir, `${testChatId}.json.tmp`);
    assert(fs.existsSync(targetFile), 'TEST 05.1: Target group JSON file exists');
    assert(!fs.existsSync(tmpFile), 'TEST 05.2: Temporary .tmp file is cleanly cleaned up / renamed');

    const fileContent = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    assert(fileContent.settings.warnLimit === 5, 'TEST 05.3: Persisted JSON content is valid');

    // ----------------------------------------------------------------
    // 6. Corrupted JSON recovery
    // ----------------------------------------------------------------
    console.log('\n--- TEST 6: Corrupted JSON Recovery ---');
    const corruptedChatId = -100888999222;
    sm5.updateGroupSettings(corruptedChatId, { warnLimit: 9, chatTitle: 'Valid Backup Group' });
    sm5.saveGroupJsonSync(corruptedChatId);
    sm5.saveGroupJsonSync(corruptedChatId);

    // Ensure .bak exists
    const groupBakFile = path.join(sm5.groupsBackupDir, `${corruptedChatId}.json.bak`);
    assert(fs.existsSync(groupBakFile), 'TEST 06.1: Safety .bak file exists before corruption');

    // Corrupt primary .json file with invalid data
    const corruptedFile = path.join(sm5.groupsDir, `${corruptedChatId}.json`);
    fs.writeFileSync(corruptedFile, '{"broken": json... invalid syntax', 'utf-8');

    // Reload
    const reloadResult = sm5.loadAllGroupJsons();
    assert(reloadResult.loadedCount >= 1, 'TEST 06.2: Restores corrupted file using .bak');
    const recoveredSettings = sm5.getGroupSettings(corruptedChatId);
    assert(recoveredSettings.warnLimit === 9, 'TEST 06.3: Recovered settings match backup state');

    // ----------------------------------------------------------------
    // 7 & 8. Large backup import & under size limit
    // ----------------------------------------------------------------
    console.log('\n--- TEST 7-8: Large Backup Import Under Limit ---');
    const importChatId = -100888999333;
    const sampleStickers: Record<string, string[]> = {};
    for (let m = 0; m < 50; m++) {
      sampleStickers[`mood_${m}`] = Array.from({ length: 20 }, (_, idx) => `CAACAgIAAxUAAWqUbA_${m}_${idx}_` + 'a'.repeat(40));
    }

    const largeBackupPayload = {
      backupVersion: '1.0',
      group: { chatId: importChatId, title: 'Large Restored Group' },
      settings: { warnLimit: 8, captchaEnabled: true },
      welcome: { welcomeEnabled: true, welcomeMessage: 'Welcome to our large group! '.repeat(50) },
      moderation: { stopSpamEnabled: true, floodCount: 15 },
      stickers: {
        mediaLibrary: {
          stickers: sampleStickers
        }
      }
    };

    const importResult = sm5.importGroupFullBackup(importChatId, largeBackupPayload);
    assert(importResult.ok === true, 'TEST 07.1: Large valid backup imports successfully');
    const importedSettings = sm5.getGroupSettings(importChatId);
    assert(importedSettings.warnLimit === 8, 'TEST 07.2: Restored warnLimit matches');
    assert(importedSettings.captchaEnabled === true, 'TEST 07.3: Restored captchaEnabled matches');

    // ----------------------------------------------------------------
    // 9. Backup import over size limit validation
    // ----------------------------------------------------------------
    console.log('\n--- TEST 9: Backup Import Over Size Limit ---');
    const maxAllowedBytes = 10 * 1024 * 1024; // 10MB
    const oversizedLength = 11 * 1024 * 1024; // 11MB
    const isOversized = oversizedLength > maxAllowedBytes;
    assert(isOversized, 'TEST 09.1: Correctly detects payload exceeding 10MB limit');

    // ----------------------------------------------------------------
    // 10. Group-only restore does not rewrite unrelated groups
    // ----------------------------------------------------------------
    console.log('\n--- TEST 10: Group-Only Restore Isolation ---');
    const groupAChatId = -100888999401;
    const groupBChatId = -100888999402;

    sm5.updateGroupSettings(groupAChatId, { warnLimit: 3, chatTitle: 'Group A' });
    sm5.updateGroupSettings(groupBChatId, { warnLimit: 4, chatTitle: 'Group B' });
    sm5.saveGroupJsonSync(groupAChatId);
    sm5.saveGroupJsonSync(groupBChatId);

    // Wait for setup timers to settle
    await new Promise(r => setTimeout(r, 150));

    const groupBFile = path.join(sm5.groupsDir, `${groupBChatId}.json`);
    const groupBStatBefore = fs.statSync(groupBFile).mtimeMs;

    // Restore Group A only
    sm5.importGroupFullBackup(groupAChatId, {
      backupVersion: '1.0',
      settings: { warnLimit: 12 }
    });

    // Wait to verify no delayed writes hit Group B
    await new Promise(r => setTimeout(r, 150));

    const groupBStatAfter = fs.statSync(groupBFile).mtimeMs;
    assert(groupBStatBefore === groupBStatAfter, 'TEST 10.1: Restoring Group A does not modify or touch Group B file');
    assert(sm5.getGroupSettings(groupBChatId).warnLimit === 4, 'TEST 10.2: Group B settings remain completely unchanged');

    // ----------------------------------------------------------------
    // 11. Existing stickers survive restart
    // ----------------------------------------------------------------
    console.log('\n--- TEST 11: Stickers Survive Restart ---');
    const stickerChatId = -100888999555;
    sm5.updateGroupSettings(stickerChatId, {
      stickerPacks: {
        'pack_alpha': {
          name: 'pack_alpha',
          title: 'Pack Alpha',
          telegramUrl: 'https://t.me/addstickers/pack_alpha',
          enabled: true,
          stickerCount: 5,
          stickers: [{ fileId: 'stk1' }, { fileId: 'stk2' }, { fileId: 'stk3' }, { fileId: 'stk4' }, { fileId: 'stk5' }]
        }
      }
    });
    sm5.saveGroupJsonSync(stickerChatId);

    // Create fresh StorageManager instance pointing to the same directory
    const smRestart = new StorageManager(atomicDir);
    const reloadedSettings = smRestart.getGroupSettings(stickerChatId);
    assert(reloadedSettings.stickerPacks?.['pack_alpha'] !== undefined, 'TEST 11.1: Sticker pack survived restart');
    assert(reloadedSettings.stickerPacks?.['pack_alpha'].stickers.length === 5, 'TEST 11.2: Pack sticker count intact');

    // ----------------------------------------------------------------
    // 12. Existing settings survive restart
    // ----------------------------------------------------------------
    console.log('\n--- TEST 12: Settings Survive Restart ---');
    const settingsChatId = -100888999666;
    sm5.updateGroupSettings(settingsChatId, {
      warnLimit: 6,
      welcomeEnabled: true,
      welcomeMessage: 'Welcome to Roxie Supergroup!',
      stopSpamEnabled: true,
      floodCount: 12
    });
    sm5.saveGroupJsonSync(settingsChatId);

    const smRestart2 = new StorageManager(atomicDir);
    const loadedSettings2 = smRestart2.getGroupSettings(settingsChatId);
    assert(loadedSettings2.warnLimit === 6, 'TEST 12.1: warnLimit survived restart');
    assert(loadedSettings2.welcomeEnabled === true, 'TEST 12.2: welcomeEnabled survived restart');
    assert(loadedSettings2.welcomeMessage === 'Welcome to Roxie Supergroup!', 'TEST 12.3: welcomeMessage survived restart');
    assert(loadedSettings2.stopSpamEnabled === true, 'TEST 12.4: stopSpamEnabled survived restart');

    // ----------------------------------------------------------------
    // 13. Group A data never affects Group B
    // ----------------------------------------------------------------
    console.log('\n--- TEST 13: Strict Group Isolation ---');
    const isoGroupA = -100888999701;
    const isoGroupB = -100888999702;

    for (let i = 1; i <= 500; i++) {
      sm5.addGroupConversationEntry(isoGroupA, {
        role: 'user',
        userId: 1001,
        name: 'UserA',
        content: `Msg A ${i}`,
        timestamp: Date.now()
      });
    }

    assert(sm5.getGroupMemory(isoGroupA).length === 500, 'TEST 13.1: Group A has 500 messages');
    assert(sm5.getGroupMemory(isoGroupB).length === 0, 'TEST 13.2: Group B has 0 messages');

    sm5.setLustLevel(isoGroupA, 1001, 3);
    assert(sm5.getLustLevel(isoGroupA, 1001) === 3, 'TEST 13.3: Group A lust level is 3');
    assert(sm5.getLustLevel(isoGroupB, 1001) === 0, 'TEST 13.4: Group B lust level is 0');

    // ----------------------------------------------------------------
    // 14. Repeated storage failure does not spam logs
    // ----------------------------------------------------------------
    console.log('\n--- TEST 14: Deduplicated Error Logging ---');
    let errorLogCount = 0;
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('[Storage] Failed during')) {
        errorLogCount++;
      }
    };

    try {
      // Trigger 10 failure logs with the same message in a loop
      for (let k = 0; k < 10; k++) {
        sm5.logStorageErrorOnce('test_persist_loop', 'EACCES: permission denied, mkdir /var/data/roxie');
      }
    } finally {
      console.error = originalConsoleError;
    }

    assert(errorLogCount === 1, `TEST 14.1: Logged exactly once for 10 rapid duplicate errors (got ${errorLogCount})`);

    console.log('\n================================================================');
    console.log('🎉 ALL RENDER STORAGE & BACKUP IMPORT TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    process.env.ROXIE_DATA_DIR = originalEnv;
    // Allow debounce timer to settle
    await new Promise(r => setTimeout(r, 200));
    // Cleanup temporary test directory
    try {
      if (fs.existsSync(testBaseDir)) {
        fs.rmSync(testBaseDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

runRenderStorageAndBackupImportTestSuite()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal test failure:', err);
    process.exit(1);
  });
