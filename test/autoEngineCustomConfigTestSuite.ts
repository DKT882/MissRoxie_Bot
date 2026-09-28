process.env.ENABLE_PROACTIVE_TEXT = 'true';

import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService, AUTO_ENGINE_PRESETS } from '../server/telegram/autoEngineService.js';
import { AutoEngineConfig } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runAutoEngineCustomConfigTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting 13-Case AutoEngine Custom Configuration & Activity Gate Suite');
  console.log('===================================================================\n');

  const botId = 812999444;
  const testChatId = -1004223070652;

  // Track API calls
  let sentStickers: Array<{ chatId: number; fileId: string }> = [];
  let sentMessages: Array<{ chatId: number; text: string }> = [];

  telegramApi.sendSticker = async (chatId: number, sticker: string): Promise<any> => {
    sentStickers.push({ chatId, fileId: sticker });
    return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendMessage = async (chatId: number, text: string): Promise<any> => {
    sentMessages.push({ chatId, text });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
  };

  telegramApi.sendChatAction = async (): Promise<any> => ({ ok: true, result: true });

  db.setBotIdentity({ id: botId, username: 'MissRoxie_Bot' });

  // TEST 1: Custom 120-250s sticker delay calculation produces values in [120000, 250000] ms
  {
    const customConfig = { preset: 'custom' as const, minSeconds: 120, maxSeconds: 250, randomize: true };
    for (let i = 0; i < 50; i++) {
      const delay = autoEngineService.calculateDelayMs(customConfig, 120, 250, 120, 'stickers');
      assert.ok(delay >= 120000, `Delay ${delay}ms is less than 120,000ms`);
      assert.ok(delay <= 250000, `Delay ${delay}ms is greater than 250,000ms`);
    }
    pass('Test 1: Custom 120-250s delay calculation strictly produces values between 120,000ms and 250,000ms');
  }

  // TEST 2: Sub-120s interval (e.g. minSeconds: 30, maxSeconds: 60) is clamped to the 120s server floor
  {
    const subMinConfig = { preset: 'custom' as const, minSeconds: 30, maxSeconds: 60, randomize: true };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(subMinConfig, 30, 60, 30, 'stickers');
      assert.ok(delay >= 120000, `Delay ${delay}ms should be at least 120,000ms (clamped to floor)`);
    }
    pass('Test 2: Sub-120s interval is clamped to 120s server floor');
  }

  // TEST 3: Inverted range (maxSeconds < minSeconds, e.g. min=200, max=150) normalizes safely (max = min)
  {
    const invertedConfig = { preset: 'custom' as const, minSeconds: 200, maxSeconds: 150, randomize: true };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(invertedConfig, 200, 150, 200, 'stickers');
      assert.strictEqual(delay, 200000, `Inverted delay ${delay}ms should normalize to 200,000ms`);
    }
    pass('Test 3: Inverted range (min > max) normalizes safely to min (max = min)');
  }

  // TEST 4: Predefined presets (normal, low, high, very_low) continue using preset intervals when no custom override is set
  {
    const normalConfig = { preset: 'normal' as const, minSeconds: 600, maxSeconds: 1200, cooldownSeconds: 600 };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(normalConfig, 600, 1200, 600, 'stickers');
      assert.ok(delay >= 600000 && delay <= 1200000, `Normal sticker delay ${delay}ms outside [600s, 1200s]`);
    }

    const highConfig = { preset: 'high' as const, minSeconds: 300, maxSeconds: 600, cooldownSeconds: 300 };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(highConfig, 300, 600, 300, 'stickers');
      assert.ok(delay >= 300000 && delay <= 600000, `High sticker delay ${delay}ms outside [300s, 600s]`);
    }

    const lowConfig = { preset: 'low' as const, minSeconds: 1200, maxSeconds: 2400, cooldownSeconds: 1200 };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(lowConfig, 1200, 2400, 1200, 'stickers');
      assert.ok(delay >= 1200000 && delay <= 2400000, `Low sticker delay ${delay}ms outside [1200s, 2400s]`);
    }

    const veryLowConfig = { preset: 'very_low' as const, minSeconds: 1800, maxSeconds: 3600, cooldownSeconds: 1800 };
    for (let i = 0; i < 20; i++) {
      const delay = autoEngineService.calculateDelayMs(veryLowConfig, 1800, 3600, 1800, 'stickers');
      assert.ok(delay >= 1800000 && delay <= 3600000, `Very low sticker delay ${delay}ms outside [1800s, 3600s]`);
    }
    pass('Test 4: Predefined presets (normal, low, high, very_low) strictly preserve standard preset intervals');
  }

  // TEST 5: Mode 'stickers_only' enables stickers and keeps text messages disabled
  {
    db.updateGroupSettings(testChatId, {
      botId,
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 120, maxSeconds: 250, randomize: true },
        messages: { preset: 'normal', minSeconds: 480, maxSeconds: 900, cooldownSeconds: 480, randomize: true }
      }
    });

    const settings = db.getGroupSettings(testChatId);
    assert.strictEqual(settings.autoEngine?.mode, 'stickers_only');
    assert.strictEqual(settings.autoEngine?.enabled, true);
    assert.strictEqual(settings.autoSticker?.enabled, true);
    assert.strictEqual(settings.autoResponse?.enabled, false);
    pass('Test 5: stickers_only mode enables autoSticker and disables autoResponse');
  }

  // TEST 6: Activity gate blocks sticker delivery when human messages count is 0 (0 < N)
  {
    db.updateGroupSettings(testChatId, {
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 14,
      stickerActivityMin: 10,
      stickerActivityMax: 20
    });

    const check = db.checkAutoStickerEligibility(testChatId);
    assert.strictEqual(check.allowed, false, 'Sticker delivery should be blocked when human message count is 0');
    assert.strictEqual(check.remainingMessages, 14);
    assert.ok(check.reason?.includes('activity_cooldown'), `Expected reason activity_cooldown, got: ${check.reason}`);
    pass('Test 6: Activity gate strictly blocks sticker delivery when humanMessagesSinceLastSticker (0) < requiredStickerGap (14)');
  }

  // TEST 7: Human messages arriving increment humanMessagesSinceLastSticker
  {
    const countBefore = db.getHumanMessagesSinceLastSticker(testChatId);
    assert.strictEqual(countBefore, 0);

    for (let i = 1; i <= 10; i++) {
      db.incrementHumanMessageCount(testChatId);
      assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatId), i);
    }
    pass('Test 7: Incoming human messages increment humanMessagesSinceLastSticker accurately');
  }

  // TEST 8: Activity gate allows sticker delivery once threshold N/N is reached
  {
    // Currently at 10/14. Increment 4 more times to reach 14/14
    for (let i = 11; i <= 14; i++) {
      db.incrementHumanMessageCount(testChatId);
    }
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatId), 14);

    const check = db.checkAutoStickerEligibility(testChatId);
    assert.strictEqual(check.allowed, true, 'Sticker delivery should be allowed once requiredStickerGap is reached');
    pass('Test 8: Activity gate allows sticker delivery once threshold 14/14 is reached');
  }

  // TEST 9: recordAutoStickerSent resets counter to 0 and randomizes new gap
  {
    db.recordAutoStickerSent(testChatId);
    const countAfter = db.getHumanMessagesSinceLastSticker(testChatId);
    assert.strictEqual(countAfter, 0, 'Human message counter must reset to 0 after sticker sent');

    const newGap = db.getRequiredStickerGap(testChatId);
    assert.ok(newGap >= 10 && newGap <= 20, `New gap ${newGap} should be between 10 and 20`);
    pass('Test 9: recordAutoStickerSent resets human message count to 0 and regenerates requiredStickerGap (10-20)');
  }

  // TEST 10: storage.updateGroupSettings with custom bounds stores preset = 'custom'
  {
    db.updateGroupSettings(testChatId, {
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { minSeconds: 120, maxSeconds: 250 }
      }
    });

    const settings = db.getGroupSettings(testChatId);
    assert.strictEqual(settings.autoEngine?.stickers?.preset, 'custom');
    assert.strictEqual(settings.autoEngine?.stickers?.minSeconds, 120);
    assert.strictEqual(settings.autoEngine?.stickers?.maxSeconds, 250);
    assert.strictEqual(settings.autoSticker?.minSeconds, 120);
    assert.strictEqual(settings.autoSticker?.maxSeconds, 250);
    pass('Test 10: updateGroupSettings with custom interval bounds stores preset = custom with exact bounds');
  }

  // TEST 11: storage.updateGroupSettings with predefined preset stores preset timings
  {
    db.updateGroupSettings(testChatId, {
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        stickers: { preset: 'high' }
      }
    });

    const settings = db.getGroupSettings(testChatId);
    assert.strictEqual(settings.autoEngine?.stickers?.preset, 'high');
    assert.strictEqual(settings.autoEngine?.stickers?.minSeconds, 300);
    assert.strictEqual(settings.autoEngine?.stickers?.maxSeconds, 600);
    assert.strictEqual(settings.autoSticker?.minSeconds, 300);
    assert.strictEqual(settings.autoSticker?.maxSeconds, 600);
    pass('Test 11: updateGroupSettings with preset = high sets minSeconds: 300 and maxSeconds: 600');
  }

  // TEST 12: Legacy autoSticker config updates synchronize bidirectionally to autoEngine.stickers
  {
    db.updateGroupSettings(testChatId, {
      autoSticker: {
        enabled: true,
        mode: 'random',
        minSeconds: 150,
        maxSeconds: 320,
        cooldownSeconds: 150
      }
    });

    const settings = db.getGroupSettings(testChatId);
    assert.strictEqual(settings.autoEngine?.stickers?.preset, 'custom');
    assert.strictEqual(settings.autoEngine?.stickers?.minSeconds, 150);
    assert.strictEqual(settings.autoEngine?.stickers?.maxSeconds, 320);
    pass('Test 12: Legacy autoSticker updates bidirectionally propagate to autoEngine.stickers as custom preset');
  }

  // TEST 13: Multi-bot isolation: autoEngine jobs only run for groups belonging to the active bot
  {
    const foreignChatId = -100999888777;
    db.updateGroupSettings(foreignChatId, {
      botId: 999999999, // Different bot ID
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 120, maxSeconds: 250 }
      }
    });

    autoEngineService.start(botId);
    autoEngineService.syncGroup(botId, foreignChatId);
    const stickerJob = autoEngineService.getJob(botId, foreignChatId, 'sticker');
    const responseJob = autoEngineService.getJob(botId, foreignChatId, 'response');
    assert.strictEqual(stickerJob, undefined, 'AutoEngine must not schedule sticker job for group belonging to another botId');
    assert.strictEqual(responseJob, undefined, 'AutoEngine must not schedule response job for group belonging to another botId');
    autoEngineService.stop();
    pass('Test 13: Multi-bot isolation strictly prevents job execution for non-owned groups');
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL 13 AUTOENGINE CUSTOM CONFIG & ACTIVITY GATE TESTS PASSED (${passed}/13)`);
  console.log('===================================================================');
}

runAutoEngineCustomConfigTestSuite().catch(err => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
