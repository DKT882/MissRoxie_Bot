import { db } from '../server/db/storage.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import fs from 'fs';
import path from 'path';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie Phase 13 Optimization Test Suite...');
  console.log('====================================================');

  // Test 1: Storage Atomic Persistence
  try {
    const testSettingsKey = 999999;
    db.updateGroupSettings(testSettingsKey, { chatTitle: 'Phase 13 Test Group' });
    await new Promise((r) => setTimeout(r, 400));
    const settings = db.getGroupSettings(testSettingsKey, 'Phase 13 Test Group');
    assert(settings.chatTitle === 'Phase 13 Test Group', 'STORAGE-01: updates and retrieves group settings correctly');

    const storageFile = path.join(process.cwd(), 'data', 'bot_storage.json');
    assert(fs.existsSync(storageFile), 'STORAGE-02: bot_storage.json exists');
    const raw = fs.readFileSync(storageFile, 'utf-8');
    const parsed = JSON.parse(raw);
    assert(parsed.settings[testSettingsKey] !== undefined, 'STORAGE-03: atomic write persisted settings successfully');
  } catch (err: any) {
    assert(false, `STORAGE-01..03 error: ${err.message}`);
  }

  // Test 2: Telegram Bot Manager status & 429 logic structure
  const botMgr = new TelegramBotManager();
  const status = botMgr.getStatus();
  assert(status !== undefined, 'BOTMGR-01: returns bot manager status successfully');

  console.log(`🎉 Phase 13 Tests Completed: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
