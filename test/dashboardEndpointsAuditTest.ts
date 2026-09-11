import assert from 'assert';
import http from 'http';
import { db } from '../server/db/storage.js';
import { COMMAND_CATALOG } from '../server/telegram/commandCatalog.js';
import { CommandHandler } from '../server/telegram/commands.js';

process.env.PORT = '9911';
process.env.NODE_ENV = 'production';
process.env.ROXIE_TEST_MODE = 'true';

function getJson(urlPath: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9911${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode || 0, data: body });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Complete Dashboard & Command API Audit Suite');
  console.log('================================================================');

  const { startServer } = await import('../dist/server.cjs');
  await startServer();
  console.log('✅ Server listening on port 9911');

  // Test 1: Health & Diagnostics
  console.log('\n--- TEST 1: Health & Diagnostics Endpoints ---');
  const healthRes = await getJson('/health');
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.data.status, 'healthy');
  console.log('✅ [PASS] /health returns status: healthy');

  const apiHealthRes = await getJson('/api/health');
  assert.strictEqual(apiHealthRes.status, 200);
  assert.ok(apiHealthRes.data.components);
  console.log('✅ [PASS] /api/health returns full diagnostics component matrix');

  // Test 2: Commands API & Single Source of Truth
  console.log('\n--- TEST 2: Commands API & Single Source of Truth ---');
  const cmdsRes = await getJson('/api/commands');
  assert.strictEqual(cmdsRes.status, 200);
  assert.ok(Array.isArray(cmdsRes.data));
  assert.strictEqual(cmdsRes.data.length, COMMAND_CATALOG.length);
  const bulkItem = cmdsRes.data.find((c: any) => c.command === '/addbulkstickers');
  assert.ok(bulkItem, 'COMMAND_CATALOG includes /addbulkstickers');
  assert.strictEqual(bulkItem.permission, 'Admin');
  console.log(`✅ [PASS] /api/commands returns all ${COMMAND_CATALOG.length} commands including /addbulkstickers`);

  // Test 3: Dashboard Overview & Groups
  console.log('\n--- TEST 3: Dashboard Overview & Groups List ---');
  const overviewRes = await getJson('/api/dashboard/overview');
  assert.strictEqual(overviewRes.status, 200);
  assert.ok(overviewRes.data.groupsCount !== undefined);
  assert.ok(overviewRes.data.botStatus !== undefined);
  console.log(`✅ [PASS] /api/dashboard/overview returns stats for ${overviewRes.data.groupsCount} groups`);

  const groupsRes = await getJson('/api/dashboard/groups');
  assert.strictEqual(groupsRes.status, 200);
  assert.ok(Array.isArray(groupsRes.data));
  console.log(`✅ [PASS] /api/dashboard/groups returns ${groupsRes.data.length} groups`);

  // Test 4: Group Details & Sub-resources
  if (groupsRes.data.length > 0) {
    const testGroup = groupsRes.data[0];
    const testChatId = testGroup.chatId;
    console.log(`\n--- TEST 4: Group ${testChatId} Details & Sub-resources ---`);

    const detailRes = await getJson(`/api/dashboard/groups/${testChatId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(String(detailRes.data.chatId), String(testChatId));
    console.log('✅ [PASS] /api/dashboard/groups/:chatId returned valid group detail payload');

    const modsRes = await getJson(`/api/dashboard/groups/${testChatId}/moderators`);
    assert.strictEqual(modsRes.status, 200);
    assert.ok(Array.isArray(modsRes.data.admins));
    console.log('✅ [PASS] /api/dashboard/groups/:chatId/moderators returned admins list');

    const permsRes = await getJson(`/api/dashboard/groups/${testChatId}/permissions`);
    assert.strictEqual(permsRes.status, 200);
    assert.ok(permsRes.data.roxiePermissions !== undefined);
    console.log('✅ [PASS] /api/dashboard/groups/:chatId/permissions returned permission matrix');

    const stickersRes = await getJson(`/api/dashboard/groups/${testChatId}/stickers`);
    assert.strictEqual(stickersRes.status, 200);
    console.log('✅ [PASS] /api/dashboard/groups/:chatId/stickers returned stickers data');

    const abuseRes = await getJson(`/api/dashboard/groups/${testChatId}/abuse-words`);
    assert.strictEqual(abuseRes.status, 200);
    assert.ok(Array.isArray(abuseRes.data.words));
    console.log('✅ [PASS] /api/dashboard/groups/:chatId/abuse-words returned abuse words list');
  }

  // Test 5: Private Chats & Global Controls
  console.log('\n--- TEST 5: Private Chats & Global Control Center ---');
  const dmsRes = await getJson('/api/dashboard/private-chats');
  assert.strictEqual(dmsRes.status, 200);
  assert.ok(Array.isArray(dmsRes.data));
  console.log(`✅ [PASS] /api/dashboard/private-chats returned ${dmsRes.data.length} private chats`);

  const globalRes = await getJson('/api/dashboard/control-center/global');
  assert.strictEqual(globalRes.status, 200);
  assert.strictEqual(globalRes.data.botEnabled, true);
  console.log('✅ [PASS] /api/dashboard/control-center/global returned master engine flags');

  // Test 6: Verify /addbulkstickers Command Dispatch
  console.log('\n--- TEST 6: Verify /addbulkstickers Command Dispatch ---');
  const hasInAdminCmds = COMMAND_CATALOG.some(c => c.command === '/addbulkstickers' && c.permission === 'Admin');
  assert.ok(hasInAdminCmds, 'COMMAND_CATALOG contains /addbulkstickers with Admin permission');
  assert.ok(CommandHandler.SENSITIVE_COMMANDS.has('/addbulkstickers'), 'SENSITIVE_COMMANDS contains /addbulkstickers');
  console.log('✅ [PASS] /addbulkstickers is verified in command registry and permission sets');

  console.log('\n================================================================');
  console.log('🎉 ALL DASHBOARD & COMMAND SYSTEM AUDIT TESTS PASSED!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
