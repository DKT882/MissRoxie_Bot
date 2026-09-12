import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { migrateGroupsToMongo } from '../scripts/migrateGroupsToMongo.js';

let passed = 0;
let failed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`  ✅ PASS: ${name}`);
        passed++;
      }).catch((err) => {
        console.error(`  ❌ FAIL: ${name}`, err);
        failed++;
      });
    } else {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
      return Promise.resolve();
    }
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`, err);
    failed++;
    return Promise.resolve();
  }
}

async function main() {
  console.log('\n==================================================');
  console.log('🧪 RUNNING AI RELIABILITY & MONGODB TEST SUITE');
  console.log('==================================================\n');

  const testChatId = -100999888777;
  const testUserId = 8881234;
  const botUser = { id: 777999, is_bot: true, first_name: 'RoxieBot', username: 'MissRoxieBot' };

  // Setup test group settings
  db.getGroupSettings(testChatId);
  db.updateGroupSettings(testChatId, {
    chatbotEnabled: true,
    lustMode: false
  });

  // Track chat actions
  const sentActions: Array<{ chatId: number; action: string }> = [];
  const sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];

  const origSendChatAction = telegramApi.sendChatAction;
  const origSendMessage = telegramApi.sendMessage;

  (telegramApi as any).sendChatAction = async (cId: number, action: string) => {
    sentActions.push({ chatId: cId, action });
    return { ok: true };
  };

  (telegramApi as any).sendMessage = async (cId: number, text: string, options?: any) => {
    sentMessages.push({ chatId: cId, text, options });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } };
  };

  try {
    // -------------------------------------------------------------
    // TEST SECTION 1: AI RELIABILITY & TYPING BEHAVIOR
    // -------------------------------------------------------------
    console.log('\n--- Section 1: AI Reliability & Terminal Delivery ---');

    await runTest('1.1: Explicit Trigger with Failed OpenRouter Delivers Terminal Fallback (No Ghost Typing)', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      // Mock fetch to simulate complete API failure across all models
      const origFetch = global.fetch;
      global.fetch = async () => {
        return {
          ok: false,
          status: 500,
          text: async () => 'Internal Server Error'
        } as any;
      };

      const msg = {
        message_id: 101,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Test Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Aman' },
        text: 'Hey @MissRoxieBot what is the meaning of life?'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      global.fetch = origFetch;

      assert.strictEqual(handled, true, 'Explicit trigger should handle and deliver terminal fallback message');
      assert.strictEqual(sentActions.length, 1, 'Typing action should have been initiated on trigger');
      assert.strictEqual(sentActions[0].action, 'typing');
      assert.strictEqual(sentMessages.length, 1, 'A terminal fallback text message must be delivered to resolve typing state');
      assert.ok(sentMessages[0].text.length > 0, 'Fallback text must not be empty');
      console.log(`      Delivered terminal message: "${sentMessages[0].text}"`);
    });

    await runTest('1.2: Lust Mode Explicit Trigger with Failed OpenRouter Delivers Playful Terminal Fallback', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      db.updateGroupSettings(testChatId, { lustMode: true });

      const origFetch = global.fetch;
      global.fetch = async () => {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable'
        } as any;
      };

      const msg = {
        message_id: 102,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Test Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Aman' },
        text: 'Roxie baby kaisi ho?'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      global.fetch = origFetch;
      db.updateGroupSettings(testChatId, { lustMode: false });

      assert.strictEqual(handled, true, 'Lust mode explicit trigger should deliver fallback message');
      assert.strictEqual(sentMessages.length, 1, 'Terminal fallback message sent');
      assert.ok(sentMessages[0].text.includes('jaan') || sentMessages[0].text.includes('babe'), 'Fallback has affectionate tone');
      console.log(`      Delivered LustMode terminal message: "${sentMessages[0].text}"`);
    });

    await runTest('1.3: Spontaneous Group Chat Message without Trigger Does NOT Send Premature Typing Indicator', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      // Normal un-triggered message
      const msg = {
        message_id: 103,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Test Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Rahul' },
        text: 'Anyone playing football today evening?'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      
      // Since it's not triggered and random cooldown/probability may not hit or model returns SKIP
      // No typing indicator should have been sent if no response was generated!
      if (!handled) {
        assert.strictEqual(sentActions.length, 0, 'No typing indicator should be sent if spontaneous chat does not reply');
        assert.strictEqual(sentMessages.length, 0, 'No message sent');
      }
    });

    // -------------------------------------------------------------
    // TEST SECTION 2: MONGODB ATLAS MANAGER & STORAGE SERVICE
    // -------------------------------------------------------------
    console.log('\n--- Section 2: MongoDB Atlas Storage Layer ---');

    await runTest('2.1: MongoManager reports status safely when unconfigured', () => {
      const status = mongoManager.getStatus();
      assert.strictEqual(typeof status.isConfigured, 'boolean');
      assert.strictEqual(typeof status.isConnected, 'boolean');
      assert.strictEqual(typeof status.dbName, 'string');
    });

    await runTest('2.2: MongoStorageService handles missing connection without throwing', async () => {
      // In environment without real MongoDB URI, calling methods must safely return null / false without crash
      const group = await MongoStorageService.getGroup('-100999888777');
      assert.strictEqual(group, null, 'Should return null gracefully when DB is not connected');

      const saved = await MongoStorageService.saveGroup({ chatId: '-100999888777', title: 'Test' });
      assert.strictEqual(saved, false, 'Should return false gracefully when DB is not connected');

      const all = await MongoStorageService.getAllGroups();
      assert.deepStrictEqual(all, [], 'Should return empty array gracefully');
    });

    await runTest('2.3: Local Group JSON Storage Write Still Works and Triggers Background Push', () => {
      const gId = -100888205;
      db.updateGroupSettings(gId, {
        chatTitle: 'Mongo Reliability Group',
        lustMode: true,
        autoResponse: { mode: 'cooldown', cooldownSeconds: 45 } as any
      });
      db.saveGroupJsonSync(gId);

      // Verify file was written to disk
      const filePath = path.join(db.groupsDir, `${gId}.json`);
      assert.ok(fs.existsSync(filePath), 'Group JSON file must exist on disk');

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      assert.strictEqual(content.settings.chatTitle, 'Mongo Reliability Group');
      assert.strictEqual(content.settings.lustMode, true);
    });

    await runTest('2.4: Migration Script discovers group JSON files idempotently', async () => {
      const report = await migrateGroupsToMongo();
      assert.ok(report.filesDiscovered > 0, 'Should discover existing group JSON files in data/groups');
      assert.strictEqual(typeof report.documentsMigrated, 'number');
      assert.strictEqual(typeof report.documentsSkipped, 'number');
    });

    console.log('\n==================================================');
    console.log(`🏁 TEST RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log('==================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendChatAction = origSendChatAction;
    telegramApi.sendMessage = origSendMessage;
  }
}

main().catch(err => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
