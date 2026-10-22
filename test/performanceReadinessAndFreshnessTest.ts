/**
 * Targeted Regression Tests for Performance, Readiness, and Polling Freshness
 */
import assert from 'assert';
import { db } from '../server/db/storage.js';
import { getApplicationReadiness } from '../server.ts';

async function runTests() {
  console.log('====================================================');
  console.log('🧪 RUNNING READINESS, REFRESH & FRESHNESS REGRESSION TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Application Readiness Diagnostics Test
  await test('READINESS-01: getApplicationReadiness reflects current system state accurately', () => {
    const readiness = getApplicationReadiness();
    assert(readiness !== null && typeof readiness === 'object', 'Readiness object must be returned');
    assert(typeof readiness.ready === 'boolean', 'Readiness must have boolean ready field');
    assert(typeof readiness.activeGroupsCount === 'number', 'Must report active groups count');
    assert(readiness.activeGroupsCount > 0, 'Active groups count must be > 0');
    assert(readiness.storage === 'HEALTHY', 'Storage must report HEALTHY');
  });

  // 2. Pre-indexed Group Statistics Correctness
  await test('FRESHNESS-01: db.getConnectedGroups pre-indexed stats match exact raw calculations', () => {
    const groups = db.getConnectedGroups(undefined, true);
    assert(Array.isArray(groups) && groups.length > 0, 'Must return groups list');

    // Verify first group has valid stats
    const sampleGroup = groups[0];
    assert(sampleGroup.chatId < 0, 'Supergroup chatId must be negative');
    assert(typeof sampleGroup.stats === 'object', 'Group must have stats object');
    assert(typeof sampleGroup.stats.schedules === 'number', 'Stats must include numeric schedule count');
    assert(typeof sampleGroup.stats.bans === 'number', 'Stats must include numeric ban count');

    // Cross-verify with raw schedules for that group
    const rawSchedules = db.getGroupSchedules(sampleGroup.chatId);
    assert.strictEqual(sampleGroup.stats.schedules, rawSchedules.length, 'Pre-indexed schedule count must exactly match getGroupSchedules count');
  });

  // 3. Immutability of Reused Content Grids
  await test('FRESHNESS-02: db.getContentItem shallow copy protects underlying storage from caller mutation', () => {
    // Add a test schedule with inline buttons
    const sched = db.addSchedule({
      chatId: -100111222333,
      name: 'Freshness Test Schedule',
      message: 'Original message text',
      inlineKeyboard: [[{ text: 'Button A', url: 'https://example.com' }]],
      scheduleType: 'interval',
      intervalFormatted: '1h',
      enabled: false
    });

    const item1 = db.getContentItem(sched.id);
    assert(item1 && item1.buttons && item1.buttons.length > 0);

    // Caller mutates the returned button array
    item1.buttons[0][0].text = 'MUTATED_BUTTON_TEXT';

    // Retrieve item again and confirm underlying database was NOT mutated
    const item2 = db.getContentItem(sched.id);
    assert(item2 && item2.buttons);
    assert.strictEqual(item2.buttons[0][0].text, 'Button A', 'Underlying database record must remain un-mutated');
  });

  // 4. Group Settings Scoping by Bot ID
  await test('READINESS-02: getAllGroupSettings scopes groups correctly', () => {
    const allGroups = db.getAllGroupSettings();
    const countAll = Object.keys(allGroups).length;
    assert(countAll > 0, 'Must return all groups when un-scoped');

    // Scoping to non-existent bot ID returns empty set without throwing
    const emptyBotGroups = db.getAllGroupSettings(999999999);
    assert(typeof emptyBotGroups === 'object');
  });

  // 5. Verification of Non-Blocking App State Integrity
  await test('READINESS-03: Storage mode and indicator remain valid during runtime', () => {
    const mode = db.getStorageMode();
    assert(mode === 'persistent' || mode === 'local_fallback', 'Storage mode must be persistent or local_fallback');
    const stats = db.getStats();
    assert(typeof stats.groupsCount === 'number' && stats.groupsCount > 0, 'Total groups count must be positive');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
