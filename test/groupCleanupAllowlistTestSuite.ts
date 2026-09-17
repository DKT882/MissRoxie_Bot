import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  StorageManager,
  AUTHORITATIVE_ALLOWED_GROUP_IDS,
  AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS,
  AUTHORITATIVE_GROUP_METADATA,
  MIGRATION_V1_6_GROUP_PURGE
} from '../server/db/storage.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { metricsTracker } from '../server/observability/metricsService.js';

let passedTests = 0;
let totalTests = 0;

function runTest(testName: string, testFn: () => void | Promise<void>) {
  totalTests++;
  try {
    const result = testFn();
    if (result && typeof (result as any).then === 'function') {
      return (result as Promise<void>).then(() => {
        console.log(`✅ [PASS] ${testName}`);
        passedTests++;
      }).catch((err) => {
        console.error(`❌ [FAIL] ${testName}:`, err);
        throw err;
      });
    } else {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    }
  } catch (err) {
    console.error(`❌ [FAIL] ${testName}:`, err);
    throw err;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING GROUP CLEANUP ALLOWLIST TEST SUITE');
  console.log('====================================================\n');

  const testTempDir = path.resolve(process.cwd(), 'scratch', 'test_group_allowlist_data');
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTempDir, { recursive: true });

  const testDb = new StorageManager(testTempDir);
  const botId = 123456789;
  testDb.setBotIdentity({ id: botId, username: 'TestBot' });

  const testGroupsDir = testDb.groupsDir;
  const testGroupsBakDir = testDb.groupsBackupDir;
  const testPrivateDir = testDb.privateDir;
  fs.mkdirSync(testGroupsDir, { recursive: true });
  fs.mkdirSync(testGroupsBakDir, { recursive: true });
  fs.mkdirSync(testPrivateDir, { recursive: true });

  // 1. Validate Authoritative Constants
  runTest('Test 1: Allowlist contains exactly the 6 required authoritative group IDs', () => {
    assert.strictEqual(AUTHORITATIVE_ALLOWED_GROUP_IDS.size, 6);
    assert.strictEqual(AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS.size, 6);
    
    const expectedIds = [
      '-1004223070652', // Bade Log
      '-1004449422619', // horny log
      '-1004450389363', // Nonstop Notification
      '-1004329420383', // OPEN CHAT
      '-1003834290759', // corny peeps
      '-1004384873993'  // No Filter Zone
    ];

    for (const id of expectedIds) {
      assert.ok(AUTHORITATIVE_ALLOWED_GROUP_IDS.has(id), `Missing string ID: ${id}`);
      assert.ok(AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS.has(Number(id)), `Missing number ID: ${id}`);
      assert.ok(AUTHORITATIVE_GROUP_METADATA[id]?.title, `Missing metadata title for: ${id}`);
    }
  });

  // 2. Setup 206 Synthetic Groups (6 authoritative + 200 stale/test/dummy groups)
  runTest('Test 2: Setup 206 synthetic groups in storage & disk, including private chats and global settings', () => {
    // A. Setup 6 Authoritative Groups
    for (const [idStr, meta] of Object.entries(AUTHORITATIVE_GROUP_METADATA)) {
      const numId = Number(idStr);
      const s = testDb.getGroupSettings(numId, meta.title);
      s.botId = botId;
      s.botLeft = false;
      s.unavailable = false;
      s.autoResponse = {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300,
        lastResponseTimestamp: 0
      };
      testDb.saveGroupJsonSync(numId);
    }

    // B. Setup 200 Stale/Legacy/Test Groups
    for (let i = 1; i <= 200; i++) {
      const staleId = -1009000000000 - i;
      const s = testDb.getGroupSettings(staleId, `Stale Test Group ${i}`);
      s.botId = botId;
      s.botLeft = i % 2 === 0;
      s.unavailable = i % 3 === 0;
      s.autoResponse = {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300,
        lastResponseTimestamp: 0
      };
      testDb.saveGroupJsonSync(staleId);

      // Create backup file as well
      const bakFile = path.join(testGroupsBakDir, `${staleId}.json.bak`);
      fs.writeFileSync(bakFile, JSON.stringify({ chatId: staleId }), 'utf-8');
    }

    // C. Setup Private Chat (chatId > 0)
    const privateUserChatId = 987654321;
    testDb.addPrivateMessage(privateUserChatId, 987654321, {
      role: 'user',
      content: 'Hello Roxie private message',
      timestamp: Date.now(),
      direction: 'in',
      name: 'Alice'
    });
    testDb.savePrivateJsonSync(privateUserChatId);

    // Verify initial counts: 206 groups total in settings
    const initialGroups = testDb.getAllGroupSettings();
    const groupCount = Object.keys(initialGroups).filter(k => Number(k) < 0).length;
    assert.strictEqual(groupCount, 206, `Expected 206 initial groups, found ${groupCount}`);

    const filesCount = fs.readdirSync(testGroupsDir).filter(f => f.endsWith('.json')).length;
    assert.strictEqual(filesCount, 206, `Expected 206 initial group files, found ${filesCount}`);
  });

  // 3. Purge Execution via ensureAuthoritativeMigrationApplied (RAM & Disk)
  await runTest('Test 3: ensureAuthoritativeMigrationApplied removes 200 non-authoritative groups and preserves 6 allowed', async () => {
    const report = await testDb.ensureAuthoritativeMigrationApplied({ force: true });
    
    assert.strictEqual(report.applied, true);
    assert.strictEqual(report.details.isMigration, true);
    assert.strictEqual(report.details.existingGroupsCount, 206);
    assert.strictEqual(report.details.removedGroupsCount, 200);
    assert.strictEqual(report.details.finalGroupsCount, 6);
    assert.strictEqual(report.details.allowedGroupsCount, 6);
  });

  // 4. In-Memory Group Verification
  runTest('Test 4: In-memory settings record contains exactly the 6 authoritative groups', () => {
    const survivingGroups = testDb.getAllGroupSettings();
    const groupKeys = Object.keys(survivingGroups).map(Number).filter(k => k < 0);
    assert.strictEqual(groupKeys.length, 6);

    for (const numId of AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS) {
      assert.ok(groupKeys.includes(numId), `Expected surviving group ${numId} in memory`);
      const s = testDb.getGroupSettings(numId);
      assert.strictEqual(s.botLeft, false);
      assert.strictEqual(s.unavailable, false);
    }
  });

  // 5. Disk Files Verification
  runTest('Test 5: Disk files for all 200 stale groups are deleted, 6 allowed group files remain', () => {
    const remainingFiles = fs.readdirSync(testGroupsDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(remainingFiles.length, 6, `Expected 6 files on disk, found ${remainingFiles.length}`);

    for (const numId of AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS) {
      const filePath = path.join(testGroupsDir, `${numId}.json`);
      assert.ok(fs.existsSync(filePath), `Expected file ${filePath} to exist`);
    }

    // Check backup files for stale groups are deleted
    const remainingBak = fs.readdirSync(testGroupsBakDir).filter(f => f.endsWith('.json.bak'));
    for (const bf of remainingBak) {
      const numId = Number(bf.replace('.json.bak', ''));
      assert.ok(AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS.has(numId), `Stale backup file ${bf} should have been deleted`);
    }
  });

  // 6. AutoEngine Timer & Job Isolation
  runTest('Test 6: AutoEngine schedules exactly 6 allowed groups and rejects scheduling deleted groups', () => {
    autoEngineService.start(botId);

    // Verify allowed group timers can be synced
    for (const numId of AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS) {
      const s = testDb.getGroupSettings(numId);
      autoEngineService.syncGroup(botId, numId, s, false);
    }

    // Non-authoritative group attempts to schedule -> rejected by defensive gate
    for (let i = 1; i <= 5; i++) {
      const staleId = -1009000000000 - i;
      autoEngineService.scheduleJob(botId, staleId, 'sticker', 60000, 'test');
    }

    const status = autoEngineService.getStatus();
    assert.strictEqual(status.totalActiveJobs, 12, `Expected exactly 12 active jobs (6 response + 6 sticker) in AutoEngine, got ${status.totalActiveJobs}`);
    assert.strictEqual(status.activeResponseTimers, 6);
    assert.strictEqual(status.activeStickerTimers, 6);

    autoEngineService.stop();
  });

  // 7. Dashboard API Counts
  runTest('Test 7: Dashboard connected groups count is exactly 6', () => {
    const count = testDb.getConnectedGroupCount();
    assert.strictEqual(count, 6, `Expected dashboard connected group count 6, got ${count}`);

    const list = testDb.getConnectedGroups();
    assert.strictEqual(list.length, 6, `Expected dashboard connected groups list length 6, got ${list.length}`);
    
    const listIds = new Set(list.map(g => g.chatId));
    for (const numId of AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS) {
      assert.ok(listIds.has(numId), `Expected group ${numId} in connected groups list`);
    }
  });

  // 8. Migration Marker Verification
  runTest('Test 8: Migration version marker is set in globalSettings', () => {
    assert.strictEqual(testDb.isMigrationApplied(MIGRATION_V1_6_GROUP_PURGE), true);
  });

  // 9. Idempotency on Second Startup / Restart Simulation
  await runTest('Test 9: Simulated restart recognizes migration marker and skips destructive purge', async () => {
    const restartDb = new StorageManager(testTempDir);
    restartDb.setBotIdentity({ id: botId, username: 'TestBot' });

    assert.strictEqual(restartDb.isMigrationApplied(MIGRATION_V1_6_GROUP_PURGE), true);

    const restartCheck = await restartDb.ensureAuthoritativeMigrationApplied();
    assert.strictEqual(restartCheck.applied, false, 'Should skip purge on restart when migration is already applied');
    assert.strictEqual(restartDb.getConnectedGroupCount(), 6);
  });

  // 10. Future Group Onboarding
  await runTest('Test 10: Dynamically onboarding a genuinely new 7th group persists and is NOT purged', async () => {
    const newChatId = -100888999111;
    const newSettings = testDb.getGroupSettings(newChatId, 'Genuinely New Future Group');
    newSettings.botId = botId;
    newSettings.botLeft = false;
    newSettings.unavailable = false;
    testDb.saveGroupJsonSync(newChatId);

    // Now group count is 7
    assert.strictEqual(testDb.getConnectedGroupCount(), 7);
    const groups = testDb.getConnectedGroups();
    assert.strictEqual(groups.length, 7);
    assert.ok(groups.some(g => g.chatId === newChatId));

    // Calling ensureAuthoritativeMigrationApplied (non-force) does NOT purge the new group
    const check = await testDb.ensureAuthoritativeMigrationApplied();
    assert.strictEqual(check.applied, false);
    assert.strictEqual(testDb.getConnectedGroupCount(), 7);
  });

  // 11. Third Restart Simulation with 7 Groups
  await runTest('Test 11: Third restart loads and preserves all 7 groups', async () => {
    const thirdDb = new StorageManager(testTempDir);
    thirdDb.setBotIdentity({ id: botId, username: 'TestBot' });

    assert.strictEqual(thirdDb.getConnectedGroupCount(), 7);
    const groups = thirdDb.getConnectedGroups();
    assert.strictEqual(groups.length, 7);
    assert.ok(groups.some(g => g.chatId === -100888999111));
  });

  // 12. Private Chats and Global Settings Untouched
  runTest('Test 12: Private chats and global settings remain untouched and uncorrupted', () => {
    const privateUserChatId = 987654321;
    const privateMessages = testDb.getPrivateChatMessages(privateUserChatId);
    assert.ok(privateMessages.length > 0, 'Private messages should not be purged');
    assert.strictEqual(privateMessages[0].content, 'Hello Roxie private message');

    const globalSettings = testDb.getGlobalSettings();
    assert.strictEqual(globalSettings.botEnabled, true);
    assert.strictEqual(globalSettings.aiConversationEnabled, true);
  });

  // Cleanup test scratch directory
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch {}

  metricsTracker.stop();

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} GROUP CLEANUP ALLOWLIST TESTS PASSED!`);
  console.log('====================================================\n');
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed with error:', err);
    process.exit(1);
  });
