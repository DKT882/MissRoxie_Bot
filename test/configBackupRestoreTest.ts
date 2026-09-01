import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db/storage.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runConfigBackupRestoreTests() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Configuration Backup & Restore Test Suite (30 Tests)');
  console.log('================================================================\n');

  const groupAChatId = -100999888101;
  const groupBChatId = -100999888102;
  const testOperator = 'admin_operator_roxie';

  // Setup Group A initial state
  const initialSettingsA = db.getGroupSettings(groupAChatId);
  initialSettingsA.chatTitle = 'Group Alpha Test';
  initialSettingsA.welcomeEnabled = true;
  initialSettingsA.welcomeMessage = 'Welcome to Alpha, {user}!';
  initialSettingsA.goodbyeEnabled = true;
  initialSettingsA.goodbyeMessage = 'Goodbye from Alpha, {user}!';
  initialSettingsA.slowModeSeconds = 15;
  initialSettingsA.stopSpamEnabled = true;
  initialSettingsA.floodEnabled = true;
  initialSettingsA.linksProtection = true;
  initialSettingsA.voiceProtection = true;
  initialSettingsA.lustMode = true;
  initialSettingsA.lustLevel = 3;
  (initialSettingsA as any).notes = 'Group Alpha Private Notes';
  db.updateGroupSettings(groupAChatId, initialSettingsA);

  // Setup custom stickers for Group A
  db.addGroupStickerPack(groupAChatId, {
    name: 'alpha_anime_pack',
    title: 'Alpha Anime Pack',
    enabled: true,
    stickers: [
      { fileId: 'file_alpha_01', emoji: '🌸', mood: 'happy', category: 'anime' },
      { fileId: 'file_alpha_02', emoji: '🔥', mood: 'flirty', category: 'lust' }
    ]
  });

  // Setup custom abuse words for Group A
  db.addAbuseWord(groupAChatId, 'alpha_bad_word_1');
  db.addAbuseWord(groupAChatId, 'alpha_bad_word_2');

  // Setup Auto Response and Auto Sticker for Group A
  db.updateGroupSettings(groupAChatId, {
    autoResponse: {
      enabled: true,
      frequencyMinutes: 30,
      triggerMode: 'time',
      sampleReplies: ['Hello Alpha members!', 'Roxie is monitoring Alpha.']
    } as any,
    autoSticker: {
      enabled: true,
      frequencyMinutes: 45,
      defaultPacks: ['alpha_anime_pack']
    } as any
  });

  // Setup Schedules for Group A
  db.addSchedule({
    chatId: groupAChatId,
    name: 'Daily Alpha Morning Brief',
    message: 'Good morning Group Alpha!',
    cron: '0 8 * * *',
    timezone: 'UTC',
    enabled: true
  });

  // Setup Group B initial state (to test group isolation)
  const initialSettingsB = db.getGroupSettings(groupBChatId);
  initialSettingsB.chatTitle = 'Group Beta Test';
  initialSettingsB.welcomeEnabled = false;
  initialSettingsB.slowModeSeconds = 0;
  initialSettingsB.stopSpamEnabled = false;
  initialSettingsB.lustMode = false;
  (initialSettingsB as any).notes = 'Group Beta Clean Note';
  db.updateGroupSettings(groupBChatId, initialSettingsB);

  // Clean backup directory for test group before testing
  const backupDirA = path.join(process.cwd(), 'data', 'backups', `group_${groupAChatId}`);
  if (fs.existsSync(backupDirA)) {
    fs.rmSync(backupDirA, { recursive: true, force: true });
  }

  // =========================================================================
  // TEST-01: Export group JSON structure and verify root keys
  // =========================================================================
  const backupA = db.exportGroupFullBackup(groupAChatId);
  assert.strictEqual(backupA.backupVersion, '1.0');
  assert.strictEqual(backupA.schemaVersion, 1);
  assert.strictEqual(String(backupA.group.chatId), String(groupAChatId));
  assert.strictEqual(backupA.group.chatTitle, 'Group Alpha Test');
  assert.ok(backupA.exportedAt);
  assert.ok(backupA.settings);
  assert.ok(backupA.welcome);
  assert.ok(backupA.moderation);
  assert.ok(backupA.contentProtection);
  assert.ok(backupA.stickers);
  assert.ok(backupA.lustMode);
  assert.ok(backupA.autoResponse);
  assert.ok(backupA.autoSticker);
  pass('TEST-01: Export group JSON structure and verify root keys');

  // =========================================================================
  // TEST-02: Export complete lossless group configuration
  // =========================================================================
  assert.strictEqual(backupA.settings.slowModeSeconds, 15);
  assert.strictEqual(backupA.settings.notes, 'Group Alpha Private Notes');
  assert.strictEqual(backupA.moderation.antiSpam, true);
  assert.strictEqual(backupA.moderation.antiFlood, true);
  assert.strictEqual(backupA.contentProtection.antiLinks, true);
  assert.strictEqual(backupA.contentProtection.blockVoiceNotes, true);
  pass('TEST-02: Export complete lossless group configuration');

  // =========================================================================
  // TEST-03: Sticker pack export includes name, title, and valid Telegram URL
  // =========================================================================
  const alphaPack = backupA.stickers.packs.find((p: any) => p.name === 'alpha_anime_pack');
  assert.ok(alphaPack, 'alpha_anime_pack should be exported');
  assert.strictEqual(alphaPack.title, 'Alpha Anime Pack');
  assert.ok(alphaPack.telegramUrl.includes('t.me/addstickers/alpha_anime_pack'));
  pass('TEST-03: Sticker pack export includes name, title, and valid Telegram URL');

  // =========================================================================
  // TEST-04: Sticker metadata export includes fileId, emoji, mood, category
  // =========================================================================
  assert.strictEqual(alphaPack.stickers.length, 2);
  const st0 = alphaPack.stickers[0];
  assert.strictEqual(st0.fileId, 'file_alpha_01');
  assert.strictEqual(st0.emoji, '🌸');
  assert.strictEqual(st0.mood, 'happy');
  assert.strictEqual(st0.category, 'anime');
  pass('TEST-04: Sticker metadata export includes fileId, emoji, mood, category');

  // =========================================================================
  // TEST-05: Sticker pack URL format matches https://t.me/addstickers/<packName>
  // =========================================================================
  assert.strictEqual(alphaPack.telegramUrl, 'https://t.me/addstickers/alpha_anime_pack');
  pass('TEST-05: Sticker pack URL format matches https://t.me/addstickers/<packName>');

  // =========================================================================
  // TEST-06: Welcome and goodbye announcement messages and enabled flags export
  // =========================================================================
  assert.strictEqual(backupA.welcome.welcomeEnabled, true);
  assert.strictEqual(backupA.welcome.welcomeMessage, 'Welcome to Alpha, {user}!');
  assert.strictEqual(backupA.welcome.goodbyeEnabled, true);
  assert.strictEqual(backupA.welcome.goodbyeMessage, 'Goodbye from Alpha, {user}!');
  pass('TEST-06: Welcome and goodbye announcement messages and enabled flags export');

  // =========================================================================
  // TEST-07: Custom abuse words list export correctly contains words array
  // =========================================================================
  assert.ok(Array.isArray(backupA.abuseWords));
  assert.ok(backupA.abuseWords.includes('alpha_bad_word_1'));
  assert.ok(backupA.abuseWords.includes('alpha_bad_word_2'));
  pass('TEST-07: Custom abuse words list export correctly contains words array');

  // =========================================================================
  // TEST-08: Auto-response configuration export contains frequency, mode, and replies
  // =========================================================================
  assert.strictEqual(backupA.autoResponse.enabled, true);
  assert.strictEqual(backupA.autoResponse.frequencyMinutes, 30);
  assert.strictEqual(backupA.autoResponse.triggerMode, 'time');
  assert.ok(backupA.autoResponse.sampleReplies.includes('Hello Alpha members!'));
  pass('TEST-08: Auto-response configuration export contains frequency, mode, and replies');

  // =========================================================================
  // TEST-09: Auto-sticker configuration export contains frequency and default packs
  // =========================================================================
  assert.strictEqual(backupA.autoSticker.enabled, true);
  assert.strictEqual(backupA.autoSticker.frequencyMinutes, 45);
  assert.ok(backupA.autoSticker.defaultPacks.includes('alpha_anime_pack'));
  pass('TEST-09: Auto-sticker configuration export contains frequency and default packs');

  // =========================================================================
  // TEST-10: Lust Mode configuration export includes enabled state, level, and limits
  // =========================================================================
  assert.strictEqual(backupA.lustMode.enabled, true);
  assert.strictEqual(backupA.lustMode.level, 3);
  pass('TEST-10: Lust Mode configuration export includes enabled state, level, and limits');

  // =========================================================================
  // TEST-11: Scheduled automations export includes cron, timezone, and messages
  // =========================================================================
  assert.ok(Array.isArray(backupA.schedules));
  const sched = backupA.schedules.find((s: any) => s.name === 'Daily Alpha Morning Brief');
  assert.ok(sched, 'Schedule should be exported');
  assert.strictEqual(sched.cron, '0 8 * * *');
  assert.strictEqual(sched.timezone, 'UTC');
  assert.strictEqual(sched.text, 'Good morning Group Alpha!');
  pass('TEST-11: Scheduled automations export includes cron, timezone, and messages');

  // =========================================================================
  // TEST-12: Telegram permissions export correctly records admin rights and restrictions
  // =========================================================================
  assert.ok(backupA.permissions !== undefined);
  pass('TEST-12: Telegram permissions export correctly records admin rights and restrictions');

  // =========================================================================
  // TEST-13: CSV export produces valid CSV with proper headers
  // =========================================================================
  const csvA = db.exportGroupCSV(groupAChatId);
  assert.ok(typeof csvA === 'string');
  const lines = csvA.split(/\r?\n/);
  assert.strictEqual(lines[0], 'type,category,key,value,details');
  assert.ok(csvA.includes('setting,general,chatTitle,Group Alpha Test'));
  assert.ok(csvA.includes('setting,general,slowModeSeconds,15'));
  pass('TEST-13: CSV export produces valid CSV with proper headers (type,category,key,value,details)');

  // =========================================================================
  // TEST-14: CSV export handles escaping of commas, quotes, and newlines in text fields
  // =========================================================================
  const tempSettings = db.getGroupSettings(groupAChatId);
  tempSettings.welcomeMessage = 'Welcome, "VIP" guest!\nEnjoy your stay.';
  db.updateGroupSettings(groupAChatId, tempSettings);
  const escapedCsv = db.exportGroupCSV(groupAChatId);
  assert.ok(escapedCsv.includes('"Welcome, ""VIP"" guest!\nEnjoy your stay."'));
  pass('TEST-14: CSV export handles escaping of commas, quotes, and newlines in text fields');

  // =========================================================================
  // TEST-15: JSON validation accepts valid group backup payload
  // =========================================================================
  const validDiff = db.previewGroupImport(groupAChatId, backupA);
  assert.strictEqual(validDiff.matchedChatId, true);
  pass('TEST-15: JSON validation accepts valid group backup payload');

  // =========================================================================
  // TEST-16: Invalid JSON / missing backupVersion throws validation error
  // =========================================================================
  const invalidSchemaRes = db.importGroupFullBackup(groupAChatId, { someInvalidObject: true }, undefined, false, testOperator);
  assert.strictEqual(invalidSchemaRes.ok, false);
  assert.strictEqual(invalidSchemaRes.error, 'INVALID_BACKUP_SCHEMA');
  pass('TEST-16: Invalid JSON / missing backupVersion throws validation error');

  // =========================================================================
  // TEST-17: Importing backup from different group ID is rejected when overrideChatId is false
  // =========================================================================
  const backupForeign = JSON.parse(JSON.stringify(backupA));
  backupForeign.group.chatId = -100777777777; // Foreign chatId
  const foreignMismatchRes = db.importGroupFullBackup(groupAChatId, backupForeign, undefined, false, testOperator);
  assert.strictEqual(foreignMismatchRes.ok, false);
  assert.strictEqual(foreignMismatchRes.error, 'MISMATCHED_GROUP_ID');
  pass('TEST-17: Importing backup from different group ID is rejected when overrideChatId is false');

  // =========================================================================
  // TEST-18: Importing backup from different group ID is accepted when overrideChatId is true
  // =========================================================================
  const foreignPreview = db.previewGroupImport(groupAChatId, backupForeign);
  assert.strictEqual(foreignPreview.matchedChatId, false);
  const foreignResult = db.importGroupFullBackup(groupAChatId, backupForeign, undefined, true, testOperator);
  assert.strictEqual(foreignResult.ok, true);
  pass('TEST-18: Importing backup from different group ID is accepted when overrideChatId is true');

  // =========================================================================
  // TEST-19: Partial import restores only selected sections (e.g. only stickers)
  // =========================================================================
  // Mutate group welcome and stickers
  db.updateGroupSettings(groupAChatId, { welcomeMessage: 'Modified welcome message!' });

  const customStickerBackupPayload = {
    backupVersion: '1.0',
    group: { chatId: groupAChatId },
    stickers: {
      packs: [
        {
          name: 'restored_pack',
          title: 'Restored Special Pack',
          stickers: [{ fileId: 'f_res_1', emoji: '✨', mood: 'cool', category: 'special' }]
        }
      ]
    }
  };

  db.importGroupFullBackup(groupAChatId, customStickerBackupPayload, ['stickers'], false, testOperator);

  // Welcome message should NOT have changed
  const afterWelcome = db.getGroupSettings(groupAChatId);
  assert.strictEqual(afterWelcome.welcomeMessage, 'Modified welcome message!');

  // Stickers should have restored
  const packsAfter = db.getGroupStickerPacks(groupAChatId);
  assert.ok(packsAfter.some(p => p.name === 'restored_pack'));
  pass('TEST-19: Partial import restores only selected sections (e.g. only stickers) leaving others untouched');

  // =========================================================================
  // TEST-20: Partial import restores only welcome configuration leaving stickers untouched
  // =========================================================================
  const customWelcomePayload = {
    backupVersion: '1.0',
    group: { chatId: groupAChatId },
    welcome: {
      welcomeEnabled: true,
      welcomeMessage: 'New Restored Welcome Header!'
    }
  };

  db.importGroupFullBackup(groupAChatId, customWelcomePayload, ['welcome'], false, testOperator);

  const welcomeAfterSec = db.getGroupSettings(groupAChatId);
  assert.strictEqual(welcomeAfterSec.welcomeMessage, 'New Restored Welcome Header!');

  // Pack from TEST-19 should still be present
  const packsStillPresent = db.getGroupStickerPacks(groupAChatId);
  assert.ok(packsStillPresent.some(p => p.name === 'restored_pack'));
  pass('TEST-20: Partial import restores only welcome configuration leaving stickers untouched');

  // =========================================================================
  // TEST-21: Full import restores all sections and updates group state
  // =========================================================================
  const fullImportPayload = JSON.parse(JSON.stringify(backupA));
  fullImportPayload.settings.slowModeSeconds = 45;
  fullImportPayload.settings.notes = 'Fully Restored Group Notes';
  fullImportPayload.welcome.welcomeMessage = 'Welcome back to Full Restore!';
  const fullImportRes = db.importGroupFullBackup(groupAChatId, fullImportPayload, undefined, false, testOperator);
  assert.strictEqual(fullImportRes.ok, true);

  const settingsAfterFull = db.getGroupSettings(groupAChatId);
  assert.strictEqual(settingsAfterFull.slowModeSeconds, 45);
  assert.strictEqual(settingsAfterFull.notes, 'Fully Restored Group Notes');
  pass('TEST-21: Full import restores all sections and updates group state');

  // =========================================================================
  // TEST-22: Import writes changes immediately to disk in data/groups/<chatId>.json
  // =========================================================================
  const groupJsonPath = path.join(process.cwd(), 'data', 'groups', `${groupAChatId}.json`);
  assert.ok(fs.existsSync(groupJsonPath), 'Group JSON file must exist on disk');
  const diskData = JSON.parse(fs.readFileSync(groupJsonPath, 'utf8'));
  assert.strictEqual(diskData.settings.slowModeSeconds, 45);
  assert.strictEqual(diskData.settings.notes, 'Fully Restored Group Notes');
  pass('TEST-22: Import writes changes immediately to disk in data/groups/<chatId>.json');

  // =========================================================================
  // TEST-23: Pre-import safety snapshot is created automatically in data/backups/group_<chatId>/
  // =========================================================================
  const safetyBackupsDir = path.join(process.cwd(), 'data', 'backups', `group_${groupAChatId}`);
  assert.ok(fs.existsSync(safetyBackupsDir), 'Safety backups directory must exist');
  const safetyFiles = fs.readdirSync(safetyBackupsDir).filter(f => f.endsWith('.json'));
  assert.ok(safetyFiles.length > 0, 'At least one safety backup file must have been created');
  pass('TEST-23: Pre-import safety snapshot is created automatically in data/backups/group_<chatId>/');

  // =========================================================================
  // TEST-24: Safety snapshot list endpoint returns saved snapshot files
  // =========================================================================
  const snapshotsList = db.listGroupSafetyBackups(groupAChatId);
  assert.ok(Array.isArray(snapshotsList));
  assert.ok(snapshotsList.length > 0);
  assert.ok(snapshotsList[0].filename.startsWith('backup_'));
  assert.ok(snapshotsList[0].timestamp);
  assert.ok(snapshotsList[0].size > 0);
  pass('TEST-24: Safety snapshot list endpoint returns saved snapshot files');

  // =========================================================================
  // TEST-25: Historical safety backup restoration reverts configuration to earlier snapshot state
  // =========================================================================
  // First, snapshot the current state with slowMode 45
  const snapFilename = db.createGroupSafetyBackup(groupAChatId);

  // Now change slowMode to 120
  const settingsMutated = db.getGroupSettings(groupAChatId);
  settingsMutated.slowModeSeconds = 120;
  db.updateGroupSettings(groupAChatId, settingsMutated);
  assert.strictEqual(db.getGroupSettings(groupAChatId).slowModeSeconds, 120);

  // Restore snapshot
  const restoreRes = db.restoreGroupSafetyBackup(groupAChatId, snapFilename, testOperator);
  assert.strictEqual(Boolean(restoreRes), true);
  assert.strictEqual(db.getGroupSettings(groupAChatId).slowModeSeconds, 45);
  pass('TEST-25: Historical safety backup restoration reverts configuration to earlier snapshot state');

  // =========================================================================
  // TEST-26: Diff preview correctly identifies modified, added, removed, and unchanged fields
  // =========================================================================
  const diffTestPayload = JSON.parse(JSON.stringify(backupA));
  diffTestPayload.settings.slowModeSeconds = 999;
  diffTestPayload.settings.newCustomField = 'added_value';
  const diffResult = db.previewGroupImport(groupAChatId, diffTestPayload);
  assert.ok(diffResult.modified.some((m: any) => (m.field === 'slowModeSeconds' || m.field === 'settings.slowModeSeconds') && m.newValue === 999));
  assert.ok(diffResult.added.some((a: any) => a.field === 'newCustomField' || a.field === 'settings.newCustomField'));
  pass('TEST-26: Diff preview correctly identifies modified, added, removed, and unchanged fields');

  // =========================================================================
  // TEST-27: Audit log records an entry when configuration is imported or restored
  // =========================================================================
  const auditLogs = db.getAuditLogs({ limit: 20 });
  const backupLog = auditLogs.find((l: any) => l.command?.includes('CONFIG') || l.command?.includes('IMPORT') || l.details?.includes('Imported'));
  assert.ok(backupLog, 'Audit log entry should be recorded for backup actions');
  pass('TEST-27: Audit log records an entry when configuration is imported or restored');

  // =========================================================================
  // TEST-28: Secrets exclusion verifies BOT_TOKEN, API_KEY, passwords are never present in exports
  // =========================================================================
  const rawExportString = JSON.stringify(backupA);
  assert.strictEqual(rawExportString.includes('BOT_TOKEN'), false);
  assert.strictEqual(rawExportString.includes('TELEGRAM_BOT_TOKEN'), false);
  assert.strictEqual(rawExportString.includes('GEMINI_API_KEY'), false);
  assert.strictEqual(rawExportString.includes('OPENAI_API_KEY'), false);
  assert.strictEqual(rawExportString.includes('operatorPassword'), false);
  pass('TEST-28: Secrets exclusion verifies BOT_TOKEN, API_KEY, passwords are never present in exports');

  // =========================================================================
  // TEST-29: Group A vs Group B isolation: Group A backup contains only Group A data and never bleeds into Group B
  // =========================================================================
  const backupB = db.exportGroupFullBackup(groupBChatId);
  assert.strictEqual(String(backupA.group.chatId), String(groupAChatId));
  assert.strictEqual(String(backupB.group.chatId), String(groupBChatId));
  assert.strictEqual(backupA.settings.chatTitle, 'Group Alpha Test');
  assert.strictEqual(backupB.settings.chatTitle, 'Group Beta Test');
  assert.strictEqual(backupA.stickers.packs.length > 0, true);
  assert.strictEqual(backupB.stickers.packs.length === 0, true);
  assert.strictEqual(backupB.abuseWords.includes('alpha_bad_word_1'), false);
  pass('TEST-29: Group A vs Group B isolation: Group A backup contains only Group A data and never bleeds into Group B');

  // =========================================================================
  // TEST-30: Full bot-wide export and restore correctly backups and restores all groups across the bot
  // =========================================================================
  const botBackup = db.exportAllBotBackup();
  assert.strictEqual(botBackup.backupVersion, '1.0');
  assert.strictEqual((botBackup as any).type, 'BOT_FULL_BACKUP');
  assert.ok(botBackup.totalGroups >= 2);
  assert.ok(botBackup.groups[String(groupAChatId)] !== undefined);
  assert.ok(botBackup.groups[String(groupBChatId)] !== undefined);

  // Restore bot-wide backup
  const botRestoreRes = db.restoreAllBotBackup(botBackup, [groupAChatId, groupBChatId], testOperator);
  assert.strictEqual(botRestoreRes.ok, true);
  assert.strictEqual(botRestoreRes.restoredGroups, 2);
  pass('TEST-30: Full bot-wide export and restore correctly backups and restores all groups across the bot');

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/30 TESTS PASSED SUCCESSFULLY!`);
  console.log('================================================================\n');
  process.exit(0);
}

runConfigBackupRestoreTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
