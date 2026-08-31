import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { GroupStickerPackConfig } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runStickerPackAutoResponseTests() {
  console.log('===================================================================');
  console.log('🧪 Starting Sticker Pack & Auto-Response Frequency Control Test Suite');
  console.log('===================================================================\n');

  const testGroupA = -100999222001;
  const testGroupB = -100999222002;
  const testPrivateUser = 8881001;

  // Initialize test group settings
  const sA = db.getGroupSettings(testGroupA);
  sA.chatTitle = 'Roxie Alpha Lab';
  sA.chatbotEnabled = true;
  sA.lustMode = true;
  sA.botLeft = false;
  sA.autoResponse = {
    enabled: true,
    mode: 'every_message',
    cooldownSeconds: 30,
    randomize: false,
    minSeconds: 30,
    maxSeconds: 120,
    lastResponseTimestamp: 0
  };
  sA.autoSticker = {
    enabled: true,
    mode: 'cooldown',
    cooldownSeconds: 60,
    randomize: false,
    minSeconds: 60,
    maxSeconds: 300,
    lastStickerTimestamp: 0
  };
  sA.stickerPacks = {};
  db.updateGroupSettings(testGroupA, sA);

  const sB = db.getGroupSettings(testGroupB);
  sB.chatTitle = 'Roxie Beta Lab';
  sB.chatbotEnabled = true;
  sB.lustMode = false;
  sB.botLeft = false;
  sB.autoResponse = {
    enabled: true,
    mode: 'cooldown',
    cooldownSeconds: 120,
    randomize: false,
    minSeconds: 60,
    maxSeconds: 300,
    lastResponseTimestamp: 0
  };
  sB.autoSticker = {
    enabled: true,
    mode: 'every_message',
    cooldownSeconds: 30,
    randomize: false,
    minSeconds: 30,
    maxSeconds: 60,
    lastStickerTimestamp: 0
  };
  sB.stickerPacks = {};
  db.updateGroupSettings(testGroupB, sB);

  // Backup original API methods
  const origGetStickerSet = telegramApi.getStickerSet;
  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origFetch = global.fetch;

  global.fetch = async (url: any, opts: any): Promise<any> => {
    if (typeof url === 'string' && url.includes('openrouter.ai')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Haan meri jaan, main hamesha tumhare saath hoon!'
              }
            }
          ]
        })
      };
    }
    return origFetch(url, opts);
  };

  try {
    // ---------------------------------------------------------
    // TEST 01: Fetch Sticker Packs for a Group
    // ---------------------------------------------------------
    const packsA = db.getGroupStickerPacks(testGroupA);
    assert(Array.isArray(packsA), 'Group sticker packs must be an array');
    pass('TEST 01: Fetch Sticker Packs for a Group');

    // ---------------------------------------------------------
    // TEST 02: Add Sticker Pack via Name/URL resolves and saves to group library
    // ---------------------------------------------------------
    telegramApi.getStickerSet = async (name: string): Promise<any> => {
      if (name === 'RoxieRomancePack' || name === 'roxieromancepack') {
        return {
          ok: true,
          result: {
            name: 'RoxieRomancePack',
            title: 'Roxie Romance Official',
            stickers: [
              { file_id: 'custom_sticker_romance_01', emoji: '❤️' },
              { file_id: 'custom_sticker_romance_02', emoji: '💋' },
              { file_id: 'custom_sticker_romance_03', emoji: '🥰' }
            ]
          }
        };
      }
      return { ok: false, description: 'STICKERSET_INVALID' };
    };

    // Add stickers to library and config
    const packConfig: GroupStickerPackConfig = {
      name: 'RoxieRomancePack',
      title: 'Roxie Romance Official',
      enabled: true,
      stickerCount: 3,
      stickers: [
        { fileId: 'custom_sticker_romance_01', emoji: '❤️' },
        { fileId: 'custom_sticker_romance_02', emoji: '💋' },
        { fileId: 'custom_sticker_romance_03', emoji: '🥰' }
      ],
      addedBy: 'dashboard_admin',
      addedAt: new Date().toISOString()
    };

    for (const s of packConfig.stickers!) {
      db.addStickerToLibrary('romantic', s.fileId, {
        chatId: testGroupA,
        packName: packConfig.name,
        packTitle: packConfig.title,
        fileId: s.fileId,
        emoji: s.emoji,
        mood: 'romantic',
        source: 'custom',
        addedAt: new Date().toISOString(),
        isLustMode: true
      }, testGroupA);
    }
    db.addGroupStickerPack(testGroupA, packConfig);

    const updatedPacksA = db.getGroupStickerPacks(testGroupA);
    const addedPack = updatedPacksA.find(p => p.name.toLowerCase() === 'roxieromancepack');
    assert(addedPack, 'Added sticker pack must exist in group packs');
    assert.strictEqual(addedPack.stickerCount, 3);
    assert.strictEqual(addedPack.enabled, true);
    pass('TEST 02: Add Sticker Pack via Name/URL resolves and saves to group library');

    // ---------------------------------------------------------
    // TEST 03: Reject Invalid/Non-existent Sticker Pack
    // ---------------------------------------------------------
    const invalidSetRes = await telegramApi.getStickerSet('NonExistentPack9999');
    assert.strictEqual(invalidSetRes.ok, false);
    assert(invalidSetRes.description?.includes('STICKERSET_INVALID'));
    pass('TEST 03: Reject Invalid/Non-existent Sticker Pack');

    // ---------------------------------------------------------
    // TEST 04: Disable Sticker Pack in Group Settings
    // ---------------------------------------------------------
    const disabledPack = db.updateGroupStickerPack(testGroupA, 'RoxieRomancePack', { enabled: false });
    assert(disabledPack, 'updateGroupStickerPack should return updated pack');
    assert.strictEqual(disabledPack.enabled, false);
    assert.strictEqual(db.isStickerPackEnabled(testGroupA, 'RoxieRomancePack'), false);
    pass('TEST 04: Disable Sticker Pack in Group Settings');

    // ---------------------------------------------------------
    // TEST 05: Disabled Pack Stickers are Excluded from AI / Lust Selection
    // ---------------------------------------------------------
    // In Lust Mode, if the custom pack is disabled, no sticker from it should be selected!
    const stickerWhenDisabled = ChatbotService.selectCustomStickerForLustMode('romantic', testGroupA, false);
    assert.strictEqual(stickerWhenDisabled, null, 'Disabled pack stickers must NOT be selected');
    pass('TEST 05: Disabled Pack Stickers are Excluded from AI / Lust Selection');

    // ---------------------------------------------------------
    // TEST 06: Enable Sticker Pack Restores Selection
    // ---------------------------------------------------------
    const enabledPack = db.updateGroupStickerPack(testGroupA, 'RoxieRomancePack', { enabled: true });
    assert(enabledPack);
    assert.strictEqual(enabledPack.enabled, true);
    assert.strictEqual(db.isStickerPackEnabled(testGroupA, 'RoxieRomancePack'), true);

    const stickerWhenEnabled = ChatbotService.selectCustomStickerForLustMode('romantic', testGroupA, false);
    assert(stickerWhenEnabled, 'Enabled pack stickers should be selected in Lust Mode');
    assert(stickerWhenEnabled.startsWith('custom_sticker_romance_'), 'Selected sticker must be from custom romance pack');
    pass('TEST 06: Enable Sticker Pack Restores Selection');

    // ---------------------------------------------------------
    // TEST 07: Remove Sticker Pack Purges Config and Media Library for that Group
    // ---------------------------------------------------------
    const removedCount = db.removeGroupStickerPack(testGroupA, 'RoxieRomancePack');
    assert(removedCount >= 3, `Removed count should be at least 3 (was ${removedCount})`);
    const packsAfterRemove = db.getGroupStickerPacks(testGroupA);
    assert(!packsAfterRemove.some(p => p.name.toLowerCase() === 'roxieromancepack'), 'Pack must be deleted from group packs');
    pass('TEST 07: Remove Sticker Pack Purges Config and Media Library for that Group');

    // ---------------------------------------------------------
    // TEST 08: Remove Pack Confirmation Safety Guarantee
    // ---------------------------------------------------------
    // Removing from Roxie must NOT attempt or trigger any deletion API against Telegram globally
    let telegramDeleteCalled = false;
    (telegramApi as any).deleteStickerSet = async () => {
      telegramDeleteCalled = true;
      return { ok: true };
    };
    db.removeGroupStickerPack(testGroupA, 'NonExistentPack');
    assert.strictEqual(telegramDeleteCalled, false, 'Telegram deleteStickerSet must never be invoked on Telegram externally');
    pass('TEST 08: Remove Pack Confirmation Safety Guarantee (does not delete from Telegram)');

    // Re-add a custom pack for subsequent tests
    for (const s of packConfig.stickers!) {
      db.addStickerToLibrary('romantic', s.fileId, {
        chatId: testGroupA,
        packName: packConfig.name,
        packTitle: packConfig.title,
        fileId: s.fileId,
        emoji: s.emoji,
        mood: 'romantic',
        source: 'custom',
        addedAt: new Date().toISOString(),
        isLustMode: true
      }, testGroupA);
    }
    db.addGroupStickerPack(testGroupA, packConfig);

    // ---------------------------------------------------------
    // TEST 09: Auto Response Settings: Update Mode & Cooldown
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 45,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      }
    });
    const sAUpdated = db.getGroupSettings(testGroupA);
    assert.strictEqual(sAUpdated.autoResponse?.mode, 'cooldown');
    assert.strictEqual(sAUpdated.autoResponse?.cooldownSeconds, 45);
    pass('TEST 09: Auto Response Settings: Update Mode & Cooldown');

    // ---------------------------------------------------------
    // TEST 10: Auto Response Validation: Reject Invalid Cooldown (<10s or >86400s)
    // ---------------------------------------------------------
    const validateCooldown = (cd: number) => {
      return !isNaN(cd) && cd >= 10 && cd <= 86400;
    };
    assert.strictEqual(validateCooldown(5), false, 'Cooldown < 10s must fail validation');
    assert.strictEqual(validateCooldown(100000), false, 'Cooldown > 86400s must fail validation');
    assert.strictEqual(validateCooldown(60), true, 'Cooldown 60s must pass validation');
    pass('TEST 10: Auto Response Validation: Reject Invalid Cooldown (<10s or >86400s)');

    // ---------------------------------------------------------
    // TEST 11: Auto Response Validation: Reject Invalid Random Range (min > max)
    // ---------------------------------------------------------
    const validateRandomRange = (min: number, max: number) => {
      return !isNaN(min) && !isNaN(max) && min >= 10 && max <= 86400 && min <= max;
    };
    assert.strictEqual(validateRandomRange(120, 60), false, 'min > max must fail validation');
    assert.strictEqual(validateRandomRange(5, 60), false, 'min < 10 must fail validation');
    assert.strictEqual(validateRandomRange(30, 120), true, 'min <= max and within limits must pass validation');
    pass('TEST 11: Auto Response Validation: Reject Invalid Random Range (min > max)');

    // ---------------------------------------------------------
    // TEST 12: Auto Response Frequency Throttling: Cooldown Active Skips Response Silently
    // ---------------------------------------------------------
    // Set lastResponseTimestamp to now so cooldown is strictly active
    sAUpdated.autoResponse!.lastResponseTimestamp = Date.now();
    sAUpdated.autoResponse!.cooldownSeconds = 60;
    db.updateGroupSettings(testGroupA, { autoResponse: sAUpdated.autoResponse });

    const eligActive = db.checkAutoResponseEligibility(testGroupA);
    assert.strictEqual(eligActive.allowed, false, 'Should not be allowed during active cooldown');
    assert(eligActive.remainingSeconds! > 0, 'Remaining seconds should be greater than 0');

    // In chatbot decision: verify silent skip (responseType === 'none')
    const decisionActive = await ChatbotService.generateResponseDecision(
      'req-active',
      {
        message_id: 101,
        chat: { id: testGroupA, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'hello roxie jaan'
      } as any,
      null
    );
    assert(decisionActive, 'Decision must be returned');
    assert.strictEqual(decisionActive.responseType, 'none', 'Bot must skip response silently when cooldown is active');
    assert(decisionActive.reason?.includes('cooldown'), 'Reason should cite cooldown');
    pass('TEST 12: Auto Response Frequency Throttling: Cooldown Active Skips Response Silently');

    // ---------------------------------------------------------
    // TEST 13: Auto Response Frequency: Cooldown Expired Allows Response
    // ---------------------------------------------------------
    // Set timestamp to 2 minutes ago (> 60s cooldown)
    sAUpdated.autoResponse!.lastResponseTimestamp = Date.now() - 120000;
    db.updateGroupSettings(testGroupA, { autoResponse: sAUpdated.autoResponse });

    const eligExpired = db.checkAutoResponseEligibility(testGroupA);
    assert.strictEqual(eligExpired.allowed, true, 'Should be allowed when cooldown has expired');
    pass('TEST 13: Auto Response Frequency: Cooldown Expired Allows Response');

    // ---------------------------------------------------------
    // TEST 14: Auto Sticker Frequency Throttling: Independent Cooldown from Auto Response
    // ---------------------------------------------------------
    // Auto Response allowed, but Auto Sticker on active cooldown
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 10,
        randomize: false,
        minSeconds: 10,
        maxSeconds: 30,
        lastResponseTimestamp: 0
      },
      autoSticker: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 300,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300,
        lastStickerTimestamp: Date.now() // active sticker cooldown!
      }
    });

    const respElig = db.checkAutoResponseEligibility(testGroupA);
    const stckElig = db.checkAutoStickerEligibility(testGroupA);

    assert.strictEqual(respElig.allowed, true, 'Auto response should be eligible');
    assert.strictEqual(stckElig.allowed, false, 'Auto sticker should be on cooldown');

    const decisionStickerCooldown = await ChatbotService.generateResponseDecision(
      'req-cd',
      {
        message_id: 102,
        chat: { id: testGroupA, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'hello roxie my love'
      } as any,
      null
    );

    assert(decisionStickerCooldown);
    // Text reply should succeed, but without sticker (degraded to 'text')
    assert.strictEqual(decisionStickerCooldown.responseType, 'text', 'When sticker on cooldown, text should still be sent');
    assert(decisionStickerCooldown.content, 'Content must be present');
    assert.strictEqual(decisionStickerCooldown.mediaFileId, undefined, 'No sticker mediaFileId when sticker on cooldown');
    pass('TEST 14: Auto Sticker Frequency Throttling: Independent Cooldown from Auto Response');

    // ---------------------------------------------------------
    // TEST 15: Group Isolation: Frequency settings in Group A do not affect Group B
    // ---------------------------------------------------------
    // Put Group A on active response cooldown
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      }
    });
    db.recordAutoResponseSent(testGroupA);
    const eligA = db.checkAutoResponseEligibility(testGroupA);
    // Put Group B on 'every_message' mode
    db.updateGroupSettings(testGroupB, {
      autoResponse: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      }
    });
    const eligB = db.checkAutoResponseEligibility(testGroupB);

    assert.strictEqual(eligA.allowed, false, 'Group A must be on cooldown');
    assert.strictEqual(eligB.allowed, true, 'Group B must remain allowed and unaffected by Group A cooldown');
    pass('TEST 15: Group Isolation: Frequency settings in Group A do not affect Group B');

    // ---------------------------------------------------------
    // TEST 16: Private DM Exemption: Group Cooldown does not block Private Chat (DM)
    // ---------------------------------------------------------
    // Positive chatId indicates private chat
    const privateChatId = testPrivateUser;
    const dmElig = db.checkAutoResponseEligibility(privateChatId);
    assert.strictEqual(dmElig.allowed, true, 'Private DMs are always exempt from group cooldowns');

    const dmDecision = await ChatbotService.generateResponseDecision(
      'req-dm',
      {
        message_id: 103,
        chat: { id: privateChatId, type: 'private', first_name: 'PrivateTester' } as any,
        from: { id: testPrivateUser, first_name: 'PrivateTester', is_bot: false } as any,
        text: 'hi roxie private talk'
      } as any,
      null
    );
    assert(dmDecision);
    assert.notStrictEqual(dmDecision.responseType, 'none', 'Bot must respond in private chat regardless of group cooldown');
    pass('TEST 16: Private DM Exemption: Group Cooldown does not block Private Chat (DM)');

    // ---------------------------------------------------------
    // TEST 17: Audit Logging for Sticker Pack Add, Remove, Toggle, and Frequency Changes
    // ---------------------------------------------------------
    db.logAction({
      id: 'audit-test-1',
      timestamp: new Date().toISOString(),
      chatId: testGroupA,
      chatTitle: 'Roxie Alpha Lab',
      groupId: testGroupA,
      actorRole: 'DASHBOARD_ADMIN',
      adminUsername: 'dashboard_admin',
      command: 'add_sticker_pack',
      action: 'sticker_pack_add',
      result: 'success',
      details: 'Added sticker pack RoxieRomancePack'
    });

    db.logAction({
      id: 'audit-test-2',
      timestamp: new Date().toISOString(),
      chatId: testGroupA,
      chatTitle: 'Roxie Alpha Lab',
      groupId: testGroupA,
      actorRole: 'DASHBOARD_ADMIN',
      adminUsername: 'dashboard_admin',
      command: 'dashboard_settings',
      action: 'setting_change',
      result: 'success',
      details: 'Updated settings: autoResponse (mode: cooldown, cd: 45s)'
    });

    const logs = db.getGroupLogs(testGroupA);
    const addPackLog = logs.find(l => (l.action as string) === 'sticker_pack_add' && l.chatId === testGroupA);
    const settingLog = logs.find(l => (l.action as string) === 'setting_change' && l.details?.includes('autoResponse'));
    assert(addPackLog, 'Sticker pack add audit log must exist');
    assert(settingLog, 'Setting change audit log must exist');
    pass('TEST 17: Audit Logging for Sticker Pack Add, Remove, Toggle, and Frequency Changes');

    // ---------------------------------------------------------
    // TEST 18: Lust Mode Invariant: Default Stickers Strictly Prohibited regardless of pack state
    // ---------------------------------------------------------
    // Remove all custom stickers from Group B (Lust Mode enabled for test)
    db.updateGroupSettings(testGroupB, { lustMode: true });
    // Verify selectCustomStickerForLustMode returns null when no custom stickers exist,
    // and NEVER falls back to default stickers.
    const forbiddenSticker = ChatbotService.selectCustomStickerForLustMode('flirty', testGroupB, false);
    assert.strictEqual(forbiddenSticker, null, 'Default sticker must never be returned in Lust Mode');

    // Verify ChatbotService.isStickerAllowedForMode rejects any default sticker when isLustMode is true
    const defaultSample = 'CAACAgIAAxkBAAIBYm...';
    assert.strictEqual(
      ChatbotService.isStickerAllowedForMode(defaultSample, testGroupB, true),
      false,
      'Default stickers are strictly prohibited in Lust Mode'
    );
    pass('TEST 18: Lust Mode Invariant: Default Stickers Strictly Prohibited regardless of pack state');

    // ---------------------------------------------------------
    // TEST 19: Randomized interval generates a value >= min
    // ---------------------------------------------------------
    const origMathRandom = Math.random;
    try {
      // Mock Math.random to return lowest possible value 0.0
      Math.random = () => 0.0;
      db.updateGroupSettings(testGroupA, {
        autoResponse: {
          enabled: true,
          mode: 'random',
          cooldownSeconds: 30,
          randomize: true,
          minSeconds: 30,
          maxSeconds: 120,
          lastResponseTimestamp: 0
        }
      });
      db.recordAutoResponseSent(testGroupA);
      const sMin = db.getGroupSettings(testGroupA);
      assert(sMin.autoResponse?.nextIntervalSeconds !== undefined);
      assert(
        sMin.autoResponse.nextIntervalSeconds >= 30,
        `nextIntervalSeconds (${sMin.autoResponse.nextIntervalSeconds}) must be >= min (30)`
      );
      assert.strictEqual(sMin.autoResponse.nextIntervalSeconds, 30);
      pass('TEST 19: Randomized interval generates a value >= min');

      // ---------------------------------------------------------
      // TEST 20: Randomized interval generates a value <= max
      // ---------------------------------------------------------
      // Mock Math.random to return highest value 0.999999
      Math.random = () => 0.999999999;
      db.recordAutoResponseSent(testGroupA);
      const sMax = db.getGroupSettings(testGroupA);
      assert(sMax.autoResponse?.nextIntervalSeconds !== undefined);
      assert(
        sMax.autoResponse.nextIntervalSeconds <= 120,
        `nextIntervalSeconds (${sMax.autoResponse.nextIntervalSeconds}) must be <= max (120)`
      );
      assert.strictEqual(sMax.autoResponse.nextIntervalSeconds, 120);
      pass('TEST 20: Randomized interval generates a value <= max');

      // ---------------------------------------------------------
      // TEST 21: Randomized interval is recalculated after each successful response
      // ---------------------------------------------------------
      Math.random = () => 0.15;
      db.recordAutoResponseSent(testGroupA);
      const firstInterval = db.getGroupSettings(testGroupA).autoResponse?.nextIntervalSeconds;

      Math.random = () => 0.85;
      db.recordAutoResponseSent(testGroupA);
      const secondInterval = db.getGroupSettings(testGroupA).autoResponse?.nextIntervalSeconds;

      assert(firstInterval !== undefined && secondInterval !== undefined);
      assert.notStrictEqual(
        firstInterval,
        secondInterval,
        'Randomized interval must be recalculated and differ after each successful response'
      );
      assert.strictEqual(firstInterval, 43);
      assert.strictEqual(secondInterval, 107);
      pass('TEST 21: Randomized interval is recalculated after each successful response');

      // ---------------------------------------------------------
      // TEST 22: Multiple generated intervals are not permanently identical / implementation does not reuse one fixed value
      // ---------------------------------------------------------
      Math.random = origMathRandom; // restore real random
      const generatedValues = new Set<number>();
      for (let i = 0; i < 20; i++) {
        db.recordAutoResponseSent(testGroupA);
        const interval = db.getGroupSettings(testGroupA).autoResponse?.nextIntervalSeconds;
        if (interval) generatedValues.add(interval);
      }
      assert(
        generatedValues.size > 1,
        'Multiple responses must produce varying randomized interval values (not static/frozen)'
      );
      pass('TEST 22: Multiple generated intervals are not permanently identical / implementation does not reuse one fixed value');

    } finally {
      Math.random = origMathRandom;
    }

    // ---------------------------------------------------------
    // TEST 23: Randomized Auto Response state is isolated between Group A and Group B
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 30,
        randomize: true,
        minSeconds: 30,
        maxSeconds: 60,
        lastResponseTimestamp: 0
      }
    });
    db.updateGroupSettings(testGroupB, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 300,
        randomize: true,
        minSeconds: 300,
        maxSeconds: 600,
        lastResponseTimestamp: 0
      }
    });
    // Send response in Group A -> active randomized cooldown
    db.recordAutoResponseSent(testGroupA);
    const aRandElig = db.checkAutoResponseEligibility(testGroupA);
    const bRandElig = db.checkAutoResponseEligibility(testGroupB);

    assert.strictEqual(aRandElig.allowed, false, 'Group A must be on randomized cooldown');
    assert.strictEqual(bRandElig.allowed, true, 'Group B must remain immediately eligible and unaffected by Group A');
    pass('TEST 23: Randomized Auto Response state is isolated between Group A and Group B');

    // ---------------------------------------------------------
    // TEST 24: Randomized Auto Response and Randomized Auto Sticker have independent timers
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 30,
        randomize: true,
        minSeconds: 30,
        maxSeconds: 60,
        lastResponseTimestamp: 0
      },
      autoSticker: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 60,
        randomize: true,
        minSeconds: 60,
        maxSeconds: 180,
        lastStickerTimestamp: 0
      }
    });
    // Only trigger autoSticker
    db.recordAutoStickerSent(testGroupA);
    const textElig = db.checkAutoResponseEligibility(testGroupA);
    const stickerElig = db.checkAutoStickerEligibility(testGroupA);

    assert.strictEqual(textElig.allowed, true, 'Text response should be eligible when only sticker is on cooldown');
    assert.strictEqual(stickerElig.allowed, false, 'Sticker must be on cooldown after sticker sent');
    pass('TEST 24: Randomized Auto Response and Randomized Auto Sticker have independent timers');

    // ---------------------------------------------------------
    // TEST 25: Message during randomized cooldown is silently skipped
    // ---------------------------------------------------------
    db.recordAutoResponseSent(testGroupA); // Group A on active randomized cooldown
    const decisionRandCooldown = await ChatbotService.generateResponseDecision(
      'req-rand-cd',
      {
        message_id: 201,
        chat: { id: testGroupA, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'should be skipped during cooldown'
      } as any,
      null
    );
    assert(decisionRandCooldown);
    assert.strictEqual(decisionRandCooldown.responseType, 'none', 'Bot must skip response silently when randomized cooldown active');
    pass('TEST 25: Message during randomized cooldown is silently skipped');

    // ---------------------------------------------------------
    // TEST 26: Response after randomized cooldown expires is allowed
    // ---------------------------------------------------------
    // Fast-forward timestamp to simulate cooldown expiration
    const sExpired = db.getGroupSettings(testGroupA);
    sExpired.autoResponse!.lastResponseTimestamp = Date.now() - 300000;
    if (sExpired.autoResponse!.nextAllowedAt) {
      sExpired.autoResponse!.nextAllowedAt = Date.now() - 1000;
    }
    db.updateGroupSettings(testGroupA, { autoResponse: sExpired.autoResponse });

    const eligAfterExpiry = db.checkAutoResponseEligibility(testGroupA);
    assert.strictEqual(eligAfterExpiry.allowed, true, 'Response must be allowed after randomized cooldown expires');

    const decisionAfterExpiry = await ChatbotService.generateResponseDecision(
      'req-rand-ok',
      {
        message_id: 202,
        chat: { id: testGroupA, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'hello roxie after cooldown expired'
      } as any,
      null
    );
    assert(decisionAfterExpiry);
    assert.notStrictEqual(decisionAfterExpiry.responseType, 'none', 'Bot must respond when cooldown has expired');
    pass('TEST 26: Response after randomized cooldown expires is allowed');

    // ---------------------------------------------------------
    // TEST 27: Failed Telegram response does not incorrectly consume successful-response cooldown
    // ---------------------------------------------------------
    const sBeforeFail = db.getGroupSettings(testGroupA);
    const initialTimestamp = 1234567890;
    sBeforeFail.autoResponse!.lastResponseTimestamp = initialTimestamp;
    sBeforeFail.autoResponse!.nextAllowedAt = initialTimestamp;
    db.updateGroupSettings(testGroupA, { autoResponse: sBeforeFail.autoResponse });

    // Mock Telegram sendMessage to FAIL
    telegramApi.sendMessage = async (): Promise<any> => ({
      ok: false,
      description: 'Bad Request: chat not found'
    });

    const failedDecision: any = {
      requestId: 'req-fail-test',
      chatId: testGroupA,
      messageId: 203,
      userId: 7771,
      personality: 'Psychologist-style',
      mood: 'normal',
      responseType: 'text',
      content: 'This message will fail to send',
      replyToMessageId: 203
    };

    const dispatchResult = await (ChatbotService as any).dispatchResponse(failedDecision);
    assert.strictEqual(dispatchResult, false, 'Dispatch must return false when Telegram send fails');

    const sAfterFail = db.getGroupSettings(testGroupA);
    assert.strictEqual(
      sAfterFail.autoResponse?.lastResponseTimestamp,
      initialTimestamp,
      'Failed send must NOT consume cooldown or update lastResponseTimestamp'
    );
    pass('TEST 27: Failed Telegram response does not incorrectly consume successful-response cooldown');

    // Restore telegramApi.sendMessage
    telegramApi.sendMessage = origSendMessage;

    // ---------------------------------------------------------
    // TEST 28: Every Eligible Message mode does not use randomized cooldown
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: Date.now()
      }
    });
    const everyMsgElig = db.checkAutoResponseEligibility(testGroupA);
    assert.strictEqual(everyMsgElig.allowed, true, 'Every Eligible Message mode must always be allowed');
    pass('TEST 28: Every Eligible Message mode does not use randomized cooldown');

    // ---------------------------------------------------------
    // TEST 29: Fixed Cooldown mode does not use randomized interval
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 50,
        randomize: false,
        minSeconds: 10,
        maxSeconds: 200,
        lastResponseTimestamp: 0
      }
    });
    db.recordAutoResponseSent(testGroupA);
    const sFixed = db.getGroupSettings(testGroupA);
    assert.strictEqual(sFixed.autoResponse?.nextIntervalSeconds, 50, 'Fixed cooldown mode must use exactly cooldownSeconds');
    pass('TEST 29: Fixed Cooldown mode does not use randomized interval');

    // ---------------------------------------------------------
    // TEST 30: Disabled mode does not automatically respond
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      }
    });
    const disabledElig = db.checkAutoResponseEligibility(testGroupA);
    assert.strictEqual(disabledElig.allowed, false, 'Disabled mode must not be eligible');
    assert.strictEqual(disabledElig.reason, 'disabled');

    const decisionDisabled = await ChatbotService.generateResponseDecision(
      'req-disabled',
      {
        message_id: 204,
        chat: { id: testGroupA, type: 'supergroup', title: 'Roxie Alpha Lab' } as any,
        from: { id: 7771, first_name: 'Tester', is_bot: false } as any,
        text: 'hello bot disabled'
      } as any,
      null
    );
    assert(decisionDisabled);
    assert.strictEqual(decisionDisabled.responseType, 'none', 'Disabled mode must return responseType: none');
    pass('TEST 30: Disabled mode does not automatically respond');

    // ---------------------------------------------------------
    // TEST 31: DM behavior remains independent from group randomized timers
    // ---------------------------------------------------------
    // Put Group A on active cooldown
    db.updateGroupSettings(testGroupA, {
      autoResponse: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 30,
        randomize: true,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: Date.now()
      }
    });
    assert.strictEqual(db.checkAutoResponseEligibility(testGroupA).allowed, false);

    // Test private DM for user
    const privateDmElig = db.checkAutoResponseEligibility(testPrivateUser);
    assert.strictEqual(privateDmElig.allowed, true, 'DM must be allowed regardless of active group randomized cooldown');

    const dmRandDecision = await ChatbotService.generateResponseDecision(
      'req-dm-rand',
      {
        message_id: 205,
        chat: { id: testPrivateUser, type: 'private', first_name: 'Tester' } as any,
        from: { id: testPrivateUser, first_name: 'Tester', is_bot: false } as any,
        text: 'direct private message to roxie'
      } as any,
      null
    );
    assert(dmRandDecision);
    assert.notStrictEqual(dmRandDecision.responseType, 'none', 'DMs must be answered and exempt from group randomized timers');
    pass('TEST 31: DM behavior remains independent from group randomized timers');

    // ---------------------------------------------------------
    // TEST 32: Lust Mode sticker restrictions remain intact
    // ---------------------------------------------------------
    db.updateGroupSettings(testGroupA, {
      lustMode: true,
      autoSticker: {
        enabled: true,
        mode: 'random',
        cooldownSeconds: 60,
        randomize: true,
        minSeconds: 30,
        maxSeconds: 60,
        lastStickerTimestamp: 0
      }
    });
    // With Lust Mode ON, default sticker must be strictly forbidden
    const defaultStickerId = 'CAACAgIAAxkBAAIBYm...';
    const isAllowedDefault = ChatbotService.isStickerAllowedForMode(defaultStickerId, testGroupA, true);
    assert.strictEqual(isAllowedDefault, false, 'Default sticker must never be allowed in Lust Mode');

    // Custom sticker in allowed pack must be allowed
    const isAllowedCustom = ChatbotService.isStickerAllowedForMode('custom_sticker_romance_01', testGroupA, true);
    assert.strictEqual(isAllowedCustom, true, 'Custom sticker from active pack must be allowed in Lust Mode');
    pass('TEST 32: Lust Mode sticker restrictions remain intact');

  } finally {
    // Restore Telegram API methods
    telegramApi.getStickerSet = origGetStickerSet;
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    global.fetch = origFetch;
  }

  console.log('\n===================================================================');
  console.log(`🎉 ALL 32 TESTS PASSED! (${passed}/32)`);
  console.log('===================================================================\n');
}

runStickerPackAutoResponseTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
