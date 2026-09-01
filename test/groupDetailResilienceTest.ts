import assert from 'assert';
import http from 'http';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';

process.env.PORT = '9922';
process.env.NODE_ENV = 'production';

function getJson(urlPath: string): Promise<{ status: number; data: any; durationMs: number }> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:9922${urlPath}`, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const durationMs = Date.now() - start;
        try {
          resolve({ status: res.statusCode || 0, data: JSON.parse(body), durationMs });
        } catch {
          resolve({ status: res.statusCode || 0, data: body, durationMs });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Group Detail Resilience & Timeout Test Suite');
  console.log('================================================================');

  const { startServer } = await import('../dist/server.cjs');
  await startServer();
  console.log('✅ Server listening on port 9922');

  const testGroups = [-1004331070653, -100999888101, -1004450308963];

  for (const chatId of testGroups) {
    console.log(`\n--- Testing Group ${chatId} Endpoints ---`);

    // 1. Group Details Core
    const detailRes = await getJson(`/api/dashboard/groups/${chatId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(String(detailRes.data.chatId), String(chatId));
    console.log(`✅ [PASS] Group detail endpoint resolved in ${detailRes.durationMs}ms`);

    // 2. Moderators (even if Telegram API is offline/unreachable)
    const modsRes = await getJson(`/api/dashboard/groups/${chatId}/moderators`);
    assert.strictEqual(modsRes.status, 200);
    assert.ok(Array.isArray(modsRes.data.administrators));
    assert.ok(modsRes.durationMs < 6000, `Moderators call did not hang (${modsRes.durationMs}ms)`);
    console.log(`✅ [PASS] Moderators endpoint resolved in ${modsRes.durationMs}ms (source: ${modsRes.data.source})`);

    // 3. Permissions (even if Telegram API is offline/unreachable)
    const permsRes = await getJson(`/api/dashboard/groups/${chatId}/permissions`);
    assert.strictEqual(permsRes.status, 200);
    assert.ok(permsRes.data.roxiePermissions !== undefined);
    assert.ok(permsRes.durationMs < 6000, `Permissions call did not hang (${permsRes.durationMs}ms)`);
    console.log(`✅ [PASS] Permissions endpoint resolved in ${permsRes.durationMs}ms`);

    // 4. Group Stickers
    const stickersRes = await getJson(`/api/dashboard/groups/${chatId}/stickers`);
    assert.strictEqual(stickersRes.status, 200);
    console.log(`✅ [PASS] Stickers endpoint resolved in ${stickersRes.durationMs}ms`);

    // 5. Abuse Words
    const abuseRes = await getJson(`/api/dashboard/groups/${chatId}/abuse-words`);
    assert.strictEqual(abuseRes.status, 200);
    console.log(`✅ [PASS] Abuse words endpoint resolved in ${abuseRes.durationMs}ms`);

    // 6. Members
    const membersRes = await getJson(`/api/dashboard/groups/${chatId}/members`);
    assert.strictEqual(membersRes.status, 200);
    console.log(`✅ [PASS] Members endpoint resolved in ${membersRes.durationMs}ms`);

    // 7. Lust Users
    const lustRes = await getJson(`/api/dashboard/groups/${chatId}/lust/users`);
    assert.strictEqual(lustRes.status, 200);
    console.log(`✅ [PASS] Lust users endpoint resolved in ${lustRes.durationMs}ms`);

    // 8. Backup History
    const historyRes = await getJson(`/api/dashboard/groups/${chatId}/backup/history`);
    assert.strictEqual(historyRes.status, 200);
    console.log(`✅ [PASS] Backup history endpoint resolved in ${historyRes.durationMs}ms`);
  }

  // Test Telegram API timeout behavior directly
  console.log('\n--- Testing TelegramApi Timeout & Error Resilience ---');
  const nonExistentRes = await telegramApi.call('invalidEndpointTest', {}, { timeoutMs: 500, maxRetries: 0 });
  assert.ok(nonExistentRes.ok === false, 'Invalid/offline call returns ok: false without throwing or hanging');
  console.log('✅ [PASS] TelegramApi.call safely returns controlled error on timeout/failure');

  console.log('\n================================================================');
  console.log('🎉 ALL GROUP DETAIL RESILIENCE & TIMEOUT TESTS PASSED!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
