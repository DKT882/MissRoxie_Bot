import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  COMMAND_CATALOG,
  getCatalogItem,
  getCatalogByCategory,
  getCommandsForTelegramScope,
  CommandCatalogItem
} from '../server/telegram/commandCatalog.js';
import { isGroupProtected, normalizeTitle, runDummyDataCleanup } from '../server/operations/cleanupDummyData.js';
import { db } from '../server/db/storage.js';

async function runTests() {
  console.log('====================================================');
  console.log('ROXIE COMMAND CATALOG & CLEANUP COMPREHENSIVE TEST');
  console.log('====================================================\n');

  // TEST 1: Command Catalog Integrity
  console.log('--- TEST 1: Command Catalog Single Source of Truth ---');
  assert(COMMAND_CATALOG.length >= 60, `Expected >= 60 commands in catalog, got ${COMMAND_CATALOG.length}`);
  console.log(`✓ Total canonical commands registered: ${COMMAND_CATALOG.length}`);

  for (const item of COMMAND_CATALOG) {
    assert(item.command.startsWith('/'), `Command ${item.command} must start with /`);
    assert(item.category, `Command ${item.command} must have a category`);
    assert(item.description, `Command ${item.command} must have a description`);
    assert(item.syntax, `Command ${item.command} must have a syntax`);
    assert(item.example, `Command ${item.command} must have an example`);
    assert(['Everyone', 'Admin', 'Owner'].includes(item.permission), `Invalid permission for ${item.command}`);
  }
  console.log('✓ All catalog entries validated with required metadata fields');

  // TEST 2: Alias Resolution via getCatalogItem
  console.log('\n--- TEST 2: Alias Resolution & Normalization ---');
  const aliasTests = [
    { input: 'del', canonical: '/del' },
    { input: '/delete', canonical: '/del' },
    { input: 'addbulkstickers', canonical: '/addbulkstickers' },
    { input: '/addbulksticker', canonical: '/addbulkstickers' },
    { input: 'purge', canonical: '/clear' },
    { input: '/lust', canonical: '/lustmode' },
    { input: '/lustmod', canonical: '/lustmode' },
    { input: 'reaction', canonical: '/roxiereaction' },
    { input: '/help', canonical: '/help' },
    { input: '/settings', canonical: '/settings' }
  ];

  for (const t of aliasTests) {
    const item = getCatalogItem(t.input);
    assert(item, `Failed to resolve item for input: ${t.input}`);
    assert.strictEqual(item.command, t.canonical, `Input ${t.input} expected ${t.canonical}, got ${item.command}`);
  }
  console.log(`✓ Verified ${aliasTests.length} alias and command resolution paths`);

  // TEST 3: Telegram Bot API Scope Limits (<= 100 per scope)
  console.log('\n--- TEST 3: Telegram Scopes & 100-Command Limits ---');
  const scopes: Array<'all_chat_administrators' | 'all_group_chats' | 'all_private_chats' | 'default'> = [
    'all_chat_administrators',
    'all_group_chats',
    'all_private_chats',
    'default'
  ];

  for (const s of scopes) {
    const list = getCommandsForTelegramScope(s);
    assert(list.length > 0, `Scope ${s} returned empty command list`);
    assert(list.length <= 100, `Scope ${s} exceeded 100 commands limit: ${list.length}`);
    const names = list.map(c => c.command);
    const uniqueNames = new Set(names);
    assert.strictEqual(names.length, uniqueNames.size, `Scope ${s} contains duplicate command names`);
    console.log(`✓ Scope "${s}": ${list.length} commands (<= 100, deduplicated)`);
  }

  // TEST 4: Protected Real Groups Normalization & Identification
  console.log('\n--- TEST 4: Real Group Protection & Normalization ---');
  const protectedScenarios = [
    { chatId: -1004331070653, title: '𓄂❄𝐵𝐴𝐷𝐸 𝐿𝑂𝐺', expectedProtected: true },
    { chatId: -1004356470022, title: '♡LOVERS𒅆❥᭄', expectedProtected: true },
    { chatId: -1004494262619, title: 'Horney Log', expectedProtected: true },
    { chatId: -5377649576, title: 'Horney Log', expectedProtected: true },
    { chatId: -999999999, title: 'bade log', expectedProtected: true },
    { chatId: -888888888, title: 'lovers', expectedProtected: true },
    { chatId: -777777777, title: 'horny log', expectedProtected: true },
    // Non-protected / dummy groups
    { chatId: -1009999999, title: 'horny log 2', expectedProtected: false },
    { chatId: -1008888888, title: 'Group A', expectedProtected: false },
    { chatId: -1007777777, title: 'SVGI Developers', expectedProtected: false },
    { chatId: -1006666666, title: 'Test Lab', expectedProtected: false }
  ];

  for (const sc of protectedScenarios) {
    const norm = normalizeTitle(sc.title);
    const isProt = isGroupProtected(sc.chatId, sc.title);
    assert.strictEqual(isProt, sc.expectedProtected, `Group "${sc.title}" (${sc.chatId}) expected protected=${sc.expectedProtected}, got ${isProt}`);
    console.log(`✓ Group: "${sc.title}" -> Normalized: "${norm}" -> Protected: ${isProt}`);
  }

  // TEST 5: Dummy Cleanup Dry Run
  console.log('\n--- TEST 5: Dummy Cleanup Dry-Run Mode ---');
  const dryReport = await runDummyDataCleanup({ dryRun: true });
  assert.strictEqual(dryReport.dryRun, true);
  assert(dryReport.protectedGroups.length >= 3, `Expected at least 3 protected groups, found ${dryReport.protectedGroups.length}`);
  for (const pg of dryReport.protectedGroups) {
    assert.strictEqual(pg.action, 'PROTECTED');
  }
  console.log(`✓ Dry run scanned ${dryReport.summary.totalGroupsScanned} groups`);
  console.log(`✓ Protected groups: ${dryReport.summary.totalProtected}`);
  console.log(`✓ Dummy groups marked for leave: ${dryReport.summary.totalDummy}`);
  console.log(`✓ Unresolved groups: ${dryReport.summary.totalUnresolved}`);
  console.log(`✓ Private chats scanned: ${dryReport.summary.totalPrivateChatsScanned}`);

  // Print verification table
  console.log('\n--- VERIFICATION TABLE (PROTECTED REAL GROUPS) ---');
  console.table(dryReport.protectedGroups.map(g => ({
    chatId: g.chatId,
    title: g.rawTitle,
    normalized: g.normTitle,
    status: g.action
  })));

  // TEST 6: Command Router Switch-Case Coverage Check
  console.log('\n--- TEST 6: Command Router Coverage Verification ---');
  const commandsFilePath = path.join(process.cwd(), 'server', 'telegram', 'commands.ts');
  const commandsFileContent = fs.readFileSync(commandsFilePath, 'utf8');

  let orphanCount = 0;
  for (const item of COMMAND_CATALOG) {
    const hasCase = commandsFileContent.includes(`case '${item.command}':`) || commandsFileContent.includes(`case "${item.command}":`);
    if (!hasCase) {
      console.warn(`⚠️ Warning: No explicit case '${item.command}' in commands.ts router`);
      orphanCount++;
    }
  }
  assert.strictEqual(orphanCount, 0, `Found ${orphanCount} catalog commands without router switch cases`);
  console.log(`✓ Verified all ${COMMAND_CATALOG.length} catalog commands have active switch case handlers (0 orphans)`);

  console.log('\n====================================================');
  console.log('ALL COMMAND CATALOG & CLEANUP AUDIT TESTS PASSED 🎉');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
