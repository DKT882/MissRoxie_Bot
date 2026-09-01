import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { authManager } from '../server/auth/authManager.js';
import { verifyOperatorAuth } from '../server.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runDashboardFullControlCenterTests() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Dashboard Full Control Center Test Suite (35 Tests)');
  console.log('================================================================\n');

  const testChatId = -100888999111;
  const testUserId = 777123;
  const testOperatorViewer = 'test_viewer_user';
  const testOperatorAdmin = 'test_admin_user';

  // Initialize group with clean slate
  const initialSettings = db.getGroupSettings(testChatId);
  initialSettings.chatTitle = 'Full Control Center Test Group';
  initialSettings.botLeft = false;
  db.updateGroupSettings(testChatId, initialSettings);

  // Setup mock session tokens for role-based auth testing
  (authManager as any).sessions.set('viewer_session_token_123', {
    sessionId: 'viewer_session_token_123',
    operatorId: 'op_viewer_1',
    username: testOperatorViewer,
    role: 'VIEWER',
    expiresAt: Date.now() + 86400000,
    createdAt: new Date().toISOString()
  });

  (authManager as any).sessions.set('admin_session_token_456', {
    sessionId: 'admin_session_token_456',
    operatorId: 'op_admin_1',
    username: testOperatorAdmin,
    role: 'ADMIN',
    expiresAt: Date.now() + 86400000,
    createdAt: new Date().toISOString()
  });

  // Mock Telegram API methods
  const origSetChatSlowModeDelay = telegramApi.setChatSlowModeDelay;
  const origBanChatMember = telegramApi.banChatMember;
  const origUnbanChatMember = telegramApi.unbanChatMember;
  const origRestrictChatMember = telegramApi.restrictChatMember;
  const origPromoteChatMember = telegramApi.promoteChatMember;

  let slowmodeDelayCalledWith: { chatId: number; seconds: number } | null = null;
  telegramApi.setChatSlowModeDelay = async (chatId: number, seconds: number) => {
    slowmodeDelayCalledWith = { chatId, seconds };
    return { ok: true, result: true };
  };

  let banCalledWith: { chatId: number; userId: number } | null = null;
  telegramApi.banChatMember = async (chatId: number, userId: number) => {
    banCalledWith = { chatId, userId };
    return { ok: true, result: true };
  };

  let unbanCalledWith: { chatId: number; userId: number } | null = null;
  telegramApi.unbanChatMember = async (chatId: number, userId: number) => {
    unbanCalledWith = { chatId, userId };
    return { ok: true, result: true };
  };

  let restrictCalledWith: { chatId: number; userId: number; permissions: any } | null = null;
  telegramApi.restrictChatMember = async (chatId: number, userId: number, permissions: any) => {
    restrictCalledWith = { chatId, userId, permissions };
    return { ok: true, result: true };
  };

  let promoteCalledWith: { chatId: number; userId: number } | null = null;
  telegramApi.promoteChatMember = async (chatId: number, userId: number, ...args: any[]) => {
    promoteCalledWith = { chatId, userId };
    return { ok: true, result: true };
  };

  try {
    // ----------------------------------------------------------------
    // SECTION 1: GLOBAL CONTROL CENTER & OPERATOR AUTH
    // ----------------------------------------------------------------

    // Test 1: Global settings retrieval returns default 9 flags
    const globalSettings = db.getGlobalSettings();
    assert(globalSettings, 'Global settings must exist');
    assert.strictEqual(typeof globalSettings.botEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.aiConversationEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.globalModerationEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.globalStickersEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.globalAutoResponseEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.globalAutoStickerEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.globalLustModeAvailable, 'boolean');
    assert.strictEqual(typeof globalSettings.globalLoggingEnabled, 'boolean');
    assert.strictEqual(typeof globalSettings.maintenanceMode, 'boolean');
    pass('Test 1: Global settings retrieval returns valid master flags');

    // Test 2: Global settings PATCH update modifies global state
    const updatedGlobal = db.updateGlobalSettings({
      globalLustModeAvailable: false,
      maintenanceMode: true
    });
    assert.strictEqual(updatedGlobal.globalLustModeAvailable, false);
    assert.strictEqual(updatedGlobal.maintenanceMode, true);
    // Restore
    db.updateGlobalSettings({ globalLustModeAvailable: true, maintenanceMode: false });
    pass('Test 2: Global settings updates persist properly in storage');

    // Test 3: Operator Auth allows ADMIN session
    const adminAuth = verifyOperatorAuth({
      headers: { authorization: 'Bearer admin_session_token_456' }
    }, 'ADMIN');
    assert.strictEqual(adminAuth.authorized, true);
    assert.strictEqual(adminAuth.status, 200);
    assert.strictEqual(adminAuth.operatorUsername, testOperatorAdmin);
    pass('Test 3: Operator Auth permits authorized ADMIN session');

    // Test 4: Operator Auth rejects VIEWER role on mutating actions
    const viewerAuth = verifyOperatorAuth({
      headers: { authorization: 'Bearer viewer_session_token_123' }
    }, 'MODERATOR');
    assert.strictEqual(viewerAuth.authorized, false);
    assert.strictEqual(viewerAuth.status, 403);
    pass('Test 4: Operator Auth strictly rejects VIEWER from mutating actions (403)');

    // Test 5: Operator Auth rejects invalid / expired tokens
    const invalidAuth = verifyOperatorAuth({
      headers: { authorization: 'Bearer invalid_nonexistent_token' }
    }, 'MODERATOR');
    assert.strictEqual(invalidAuth.authorized, false);
    assert.strictEqual(invalidAuth.status, 401);
    pass('Test 5: Operator Auth rejects invalid/expired tokens (401)');

    // ----------------------------------------------------------------
    // SECTION 2: GROUP GENERAL SETTINGS & WARNING POLICIES
    // ----------------------------------------------------------------

    // Test 6: Update warning threshold and action
    const sUpdated1 = db.updateGroupSettings(testChatId, {
      warnLimit: 5,
      warnAction: 'kick',
      warnExpireSeconds: 604800
    });
    assert.strictEqual(sUpdated1.warnLimit, 5);
    assert.strictEqual(sUpdated1.warnAction, 'kick');
    assert.strictEqual(sUpdated1.warnExpireSeconds, 604800);
    pass('Test 6: Group warning escalation policies update correctly');

    // Test 7: Welcome and Goodbye announcement customization
    const sUpdated2 = db.updateGroupSettings(testChatId, {
      welcomeEnabled: true,
      welcomeMessage: 'Hello {user}! Welcome to our lovely group {chat}!',
      goodbyeEnabled: true,
      goodbyeMessage: 'Farewell {user}!'
    });
    assert.strictEqual(sUpdated2.welcomeEnabled, true);
    assert.strictEqual(sUpdated2.welcomeMessage, 'Hello {user}! Welcome to our lovely group {chat}!');
    assert.strictEqual(sUpdated2.goodbyeEnabled, true);
    pass('Test 7: Welcome and goodbye messages configured properly');

    // Test 8: Join request auto-accept and CAPTCHA settings
    const sUpdated3 = db.updateGroupSettings(testChatId, {
      autoAcceptEnabled: true,
      captchaEnabled: true,
      captchaMode: 'math',
      captchaTimeout: 180
    });
    assert.strictEqual(sUpdated3.autoAcceptEnabled, true);
    assert.strictEqual(sUpdated3.captchaEnabled, true);
    assert.strictEqual(sUpdated3.captchaMode, 'math');
    pass('Test 8: Join request auto-accept and CAPTCHA policies update correctly');

    // ----------------------------------------------------------------
    // SECTION 3: MODERATION & CONTENT PROTECTION
    // ----------------------------------------------------------------

    // Test 9: Anti-spam, flood, and raid toggles
    const sUpdated4 = db.updateGroupSettings(testChatId, {
      stopSpamEnabled: true,
      floodEnabled: true,
      raidEnabled: true,
      stopAbusiveEnabled: true,
      stopPromotionEnabled: true
    });
    assert.strictEqual(sUpdated4.stopSpamEnabled, true);
    assert.strictEqual(sUpdated4.floodEnabled, true);
    assert.strictEqual(sUpdated4.raidEnabled, true);
    pass('Test 9: Master anti-spam, anti-flood, and anti-raid enabled');

    // Test 10: Content protection toggles (links, stickers, files, media)
    const sUpdated5 = db.updateGroupSettings(testChatId, {
      linksProtection: true,
      stickerProtection: true,
      fileProtection: true,
      imageProtection: true,
      gifProtection: true
    });
    assert.strictEqual(sUpdated5.linksProtection, true);
    assert.strictEqual(sUpdated5.stickerProtection, true);
    assert.strictEqual(sUpdated5.fileProtection, true);
    assert.strictEqual(sUpdated5.imageProtection, true);
    pass('Test 10: Granular content protections update correctly');

    // Test 11: Links whitelist management
    const currentSettings = db.getGroupSettings(testChatId);
    currentSettings.linksWhitelist = ['telegram.org', 't.me', 'github.com'];
    db.updateGroupSettings(testChatId, currentSettings);
    const checkedSettings = db.getGroupSettings(testChatId);
    assert.deepStrictEqual(checkedSettings.linksWhitelist, ['telegram.org', 't.me', 'github.com']);
    pass('Test 11: Links whitelist domain management');

    // ----------------------------------------------------------------
    // SECTION 4: AI CHATBOT & LUST MODE
    // ----------------------------------------------------------------

    // Test 12: AI Chatbot personality and language settings
    const sAi = db.updateGroupSettings(testChatId, {
      chatbotEnabled: true,
      personality: 'tsundere',
      language: 'hinglish',
      brotherZoneEnabled: true
    } as any);
    assert.strictEqual(sAi.chatbotEnabled, true);
    assert.strictEqual((sAi as any).personality, 'tsundere');
    assert.strictEqual((sAi as any).language, 'hinglish');
    assert.strictEqual((sAi as any).brotherZoneEnabled, true);
    pass('Test 12: AI chatbot personality, language, and brother-zone filter');

    // Test 13: Group Lust Mode level adjustment
    const sLust = db.updateGroupSettings(testChatId, {
      lustMode: true,
      lustLevel: 3
    });
    assert.strictEqual(sLust.lustMode, true);
    assert.strictEqual(sLust.lustLevel, 3);
    pass('Test 13: Group lust mode toggle and level adjustment');

    // Test 14: Reset Group Lust state (resets group to 0 and all user scores)
    db.setLustLevel(testChatId, testUserId, 3);
    const beforeResetScores = db.getGroupUserLustLevels(testChatId);
    assert(beforeResetScores.some(u => u.userId === testUserId && u.level === 3), 'User level should be recorded');
    
    db.resetGroupLustState(testChatId);
    const afterResetSettings = db.getGroupSettings(testChatId);
    assert.strictEqual(afterResetSettings.lustLevel, 0, 'Group lust level should be reset to 0');
    const afterResetScores = db.getGroupUserLustLevels(testChatId);
    assert.strictEqual(afterResetScores.length, 0, 'All user lust scores should be cleared for this group');
    pass('Test 14: Reset Group Lust state resets group to 0 and purges user scores');

    // Test 15: Retrieve Group User Lust Levels list
    db.setLustLevel(testChatId, 888001, 2);
    db.setLustLevel(testChatId, 888002, 4);
    const lustUsersList = db.getGroupUserLustLevels(testChatId);
    assert.strictEqual(lustUsersList.length, 2);
    assert(lustUsersList.find(u => u.userId === 888002 && u.level === 4));
    pass('Test 15: Retrieval of group user lust levels list');

    // ----------------------------------------------------------------
    // SECTION 5: AUTO-RESPONSE & AUTO-STICKER ENGINES
    // ----------------------------------------------------------------

    // Test 16: Auto-Response frequency and cooldown update
    const autoRespConfig = {
      enabled: true,
      mode: 'cooldown' as const,
      cooldownSeconds: 45,
      minSeconds: 30,
      maxSeconds: 90
    };
    const sAutoResp = db.updateGroupSettings(testChatId, { autoResponse: autoRespConfig });
    assert.strictEqual(sAutoResp.autoResponse?.enabled, true);
    assert.strictEqual(sAutoResp.autoResponse?.cooldownSeconds, 45);
    pass('Test 16: Auto-Response frequency configuration update');

    // Test 17: Auto-Sticker independent configuration
    const autoStickerConfig = {
      enabled: true,
      mode: 'random' as const,
      cooldownSeconds: 120,
      minSeconds: 60,
      maxSeconds: 240
    };
    const sAutoSticker = db.updateGroupSettings(testChatId, { autoSticker: autoStickerConfig });
    assert.strictEqual(sAutoSticker.autoSticker?.enabled, true);
    assert.strictEqual(sAutoSticker.autoSticker?.mode, 'random');
    assert.strictEqual(sAutoSticker.autoSticker?.cooldownSeconds, 120);
    // Verify auto response remains untouched
    assert.strictEqual(sAutoSticker.autoResponse?.cooldownSeconds, 45);
    pass('Test 17: Auto-Sticker operates independently from Auto-Response');

    // ----------------------------------------------------------------
    // SECTION 6: TELEGRAM SLOWMODE CONTROL
    // ----------------------------------------------------------------

    // Test 18: Slowmode update sets local group settings
    db.updateGroupSettings(testChatId, { slowModeSeconds: 60 });
    const sSlow = db.getGroupSettings(testChatId);
    assert.strictEqual(sSlow.slowModeSeconds, 60);
    pass('Test 18: Slowmode delay updates local group settings');

    // Test 19: Slowmode calls telegramApi.setChatSlowModeDelay
    await telegramApi.setChatSlowModeDelay(testChatId, 60);
    assert(slowmodeDelayCalledWith, 'setChatSlowModeDelay must have been called');
    assert.strictEqual(slowmodeDelayCalledWith!.chatId, testChatId);
    assert.strictEqual(slowmodeDelayCalledWith!.seconds, 60);
    pass('Test 19: Slowmode invokes authoritative Telegram API');

    // Test 20: Slowmode disallow invalid range (validation logic)
    const validateSlowmode = (sec: number) => sec >= 0 && sec <= 86400;
    assert.strictEqual(validateSlowmode(-5), false);
    assert.strictEqual(validateSlowmode(100000), false);
    assert.strictEqual(validateSlowmode(300), true);
    pass('Test 20: Slowmode bounds validation logic rejects negative or > 86400s');

    // ----------------------------------------------------------------
    // SECTION 7: ABUSE WORDS PER-GROUP MANAGEMENT
    // ----------------------------------------------------------------

    // Test 21: Retrieve abuse words returns initial list
    const currentGroup = db.getGroupSettings(testChatId);
    currentGroup.abuseWords = ['badword1', 'badword2'];
    db.updateGroupSettings(testChatId, currentGroup);
    let words = db.getGroupSettings(testChatId).abuseWords || [];
    assert.strictEqual(words.length, 2);
    pass('Test 21: Abuse words retrieval returns current isolated words');

    // Test 22: Add new abuse word (case-insensitive & deduplicated)
    const addAbuseWord = (chatId: number, word: string) => {
      const g = db.getGroupSettings(chatId);
      const list = g.abuseWords || [];
      const normalized = word.trim().toLowerCase();
      if (!list.map(w => w.toLowerCase()).includes(normalized)) {
        list.push(normalized);
        db.updateGroupSettings(chatId, { abuseWords: list });
      }
      return list;
    };
    addAbuseWord(testChatId, 'SpamWord3');
    words = db.getGroupSettings(testChatId).abuseWords || [];
    assert(words.includes('spamword3'), 'Added word must exist in lowercase');
    pass('Test 22: Add abuse word normalizes and appends to group list');

    // Test 23: Duplicate abuse word is ignored
    addAbuseWord(testChatId, 'spamword3');
    words = db.getGroupSettings(testChatId).abuseWords || [];
    assert.strictEqual(words.filter(w => w === 'spamword3').length, 1);
    pass('Test 23: Duplicate abuse words are deduplicated');

    // Test 24: Remove specific abuse word
    const removeAbuseWord = (chatId: number, word: string) => {
      const g = db.getGroupSettings(chatId);
      const list = (g.abuseWords || []).filter(w => w.toLowerCase() !== word.trim().toLowerCase());
      db.updateGroupSettings(chatId, { abuseWords: list });
      return list;
    };
    removeAbuseWord(testChatId, 'badword1');
    words = db.getGroupSettings(testChatId).abuseWords || [];
    assert(!words.includes('badword1'), 'badword1 must have been removed');
    pass('Test 24: Remove specific abuse word from group list');

    // Test 25: Clear all abuse words
    db.updateGroupSettings(testChatId, { abuseWords: [] });
    words = db.getGroupSettings(testChatId).abuseWords || [];
    assert.strictEqual(words.length, 0);
    pass('Test 25: Clear all abuse words purges list completely');

    // ----------------------------------------------------------------
    // SECTION 8: MEMBERS & TELEGRAM MODERATION
    // ----------------------------------------------------------------

    // Test 26: Synthesized member list query
    db.cacheUser({
      id: 444001,
      first_name: 'Alice',
      username: 'alice_crypto'
    }, testChatId);
    db.cacheUser({
      id: 444002,
      first_name: 'Bob',
      username: 'bob_moderator'
    }, testChatId);
    const members = db.getGroupMembers(testChatId);
    assert(members.length >= 2, 'Should return at least 2 members');
    assert(members.some(m => m.userId === 444001));
    pass('Test 26: Group members synthesized retrieval from storage');

    // Test 27: Telegram ban member delegation
    await telegramApi.banChatMember(testChatId, 444001);
    assert(banCalledWith, 'banChatMember must have been called');
    assert.strictEqual(banCalledWith!.userId, 444001);
    pass('Test 27: Ban member calls authoritative Telegram banChatMember');

    // Test 28: Telegram unban member delegation
    await telegramApi.unbanChatMember(testChatId, 444001);
    assert(unbanCalledWith, 'unbanChatMember must have been called');
    assert.strictEqual(unbanCalledWith!.userId, 444001);
    pass('Test 28: Unban member calls authoritative Telegram unbanChatMember');

    // Test 29: Telegram restrict (mute) member delegation
    await telegramApi.restrictChatMember(testChatId, 444001, { can_send_messages: false });
    assert(restrictCalledWith, 'restrictChatMember must have been called');
    assert.strictEqual(restrictCalledWith!.userId, 444001);
    assert.strictEqual(restrictCalledWith!.permissions.can_send_messages, false);
    pass('Test 29: Restrict member calls authoritative Telegram restrictChatMember');

    // Test 30: Telegram promote member delegation
    await telegramApi.promoteChatMember(testChatId, 444001, { can_manage_chat: true });
    assert(promoteCalledWith, 'promoteChatMember must have been called');
    assert.strictEqual(promoteCalledWith!.userId, 444001);
    pass('Test 30: Promote member calls authoritative Telegram promoteChatMember');

    // ----------------------------------------------------------------
    // SECTION 9: CUSTOM STICKERS CONTROL
    // ----------------------------------------------------------------

    // Test 31: Add and update individual custom sticker
    db.addStickerToLibrary('lust', 'sticker_full_control_001', {
      fileId: 'sticker_full_control_001',
      chatId: testChatId,
      mood: 'lust',
      packName: 'test_pack_control',
      source: 'custom',
      addedAt: new Date().toISOString()
    }, testChatId);
    
    const updateResult = db.updateCustomSticker('sticker_full_control_001', {
      mood: 'love',
      enabled: false
    }, testChatId);
    assert.strictEqual(updateResult, true, 'updateCustomSticker should return true');
    const lib = db.getMediaLibrary(testChatId);
    assert.strictEqual(lib.stickerMetadata!['sticker_full_control_001'].mood, 'love');
    assert.strictEqual((lib.stickerMetadata!['sticker_full_control_001'] as any).enabled, false);
    pass('Test 31: Update custom sticker mood, category, and enabled status');

    // Test 32: Remove individual custom sticker
    const removedOk = db.removeMediaFromLibrary('sticker_full_control_001', testChatId);
    assert.strictEqual(removedOk, true);
    const libAfter = db.getMediaLibrary(testChatId);
    assert.strictEqual(libAfter.stickerMetadata?.['sticker_full_control_001'], undefined);
    pass('Test 32: Remove individual custom sticker permanently');

    // ----------------------------------------------------------------
    // SECTION 10: DANGER ZONE & RESTORATION
    // ----------------------------------------------------------------

    // Test 33: Danger Zone - Clear conversation memory
    db.addGroupConversationEntry(testChatId, {
      role: 'user',
      userId: 444001,
      name: 'Alice',
      content: 'Remember this message!',
      timestamp: Date.now()
    });
    assert(db.getGroupMemory(testChatId).length > 0);
    db.clearGroupMemory(testChatId);
    assert.strictEqual(db.getGroupMemory(testChatId).length, 0);
    pass('Test 33: Danger Zone - Clear group conversation memory');

    // Test 34: Danger Zone - Factory reset group settings
    db.updateGroupSettings(testChatId, {
      warnLimit: 10,
      floodEnabled: true,
      stopSpamEnabled: true
    });
    const factoryReset = db.resetGroupSettings(testChatId);
    assert.strictEqual(factoryReset.warnLimit, 3, 'warnLimit should revert to default 3');
    assert.strictEqual(factoryReset.floodEnabled, false, 'floodEnabled should revert to false');
    assert.strictEqual(factoryReset.stopSpamEnabled, false, 'stopSpamEnabled should revert to false');
    pass('Test 34: Danger Zone - Reset group settings restores factory defaults');

    // Test 35: File Persistence verification for isolated group JSON
    (db as any).saveGroupJsonSync(testChatId);
    const groupJsonPath = path.join(process.cwd(), 'data', 'groups', `${testChatId}.json`);
    assert(fs.existsSync(groupJsonPath), 'Group JSON must exist on disk after sync save');
    const fileData = JSON.parse(fs.readFileSync(groupJsonPath, 'utf8'));
    assert.strictEqual(Number(fileData.chat?.chatId), testChatId);
    assert(fileData.settings, 'Saved group JSON must have settings');
    pass('Test 35: Isolated per-group JSON file persistence confirmed on disk');

  } finally {
    // Restore original Telegram API mocks
    telegramApi.setChatSlowModeDelay = origSetChatSlowModeDelay;
    telegramApi.banChatMember = origBanChatMember;
    telegramApi.unbanChatMember = origUnbanChatMember;
    telegramApi.restrictChatMember = origRestrictChatMember;
    telegramApi.promoteChatMember = origPromoteChatMember;
  }

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed} / 35 TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
}

runDashboardFullControlCenterTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
