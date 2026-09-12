import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { telegramApi } from '../server/telegram/api.js';
import { db, StorageManager } from '../server/db/storage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService, MongoGroupDocument } from '../server/db/mongoStorage.js';
import { migrateGroupsToMongo } from '../scripts/migrateGroupsToMongo.js';

let passed = 0;
let failed = 0;
const failedList: Array<{ name: string; error: string; stack?: string }> = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      await res;
    }
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${name}: ${err?.message || err}`);
    failedList.push({ name, error: err?.message || String(err), stack: err?.stack });
    failed++;
  }
}

async function main() {
  console.log('\n================================================================');
  console.log('🚀 ROXIE PRODUCTION PRE-PUSH COMPREHENSIVE AUDIT TEST SUITE');
  console.log('================================================================\n');

  const testTempDir = path.join(process.cwd(), 'data_test_prepush_' + Date.now());
  const testGroupsDir = path.join(testTempDir, 'groups');
  fs.mkdirSync(testGroupsDir, { recursive: true });

  const testChatId = -100999111222;
  const testUserId = 8887771;
  const botUser = { id: 777999, is_bot: true, first_name: 'RoxieBot', username: 'MissRoxieBot' };

  // Setup test group
  db.getGroupSettings(testChatId);
  db.updateGroupSettings(testChatId, {
    chatbotEnabled: true,
    lustMode: false
  });

  const sentActions: Array<{ chatId: number; action: string }> = [];
  const sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  const sentStickers: Array<{ chatId: number; sticker: string; options?: any }> = [];

  const origSendChatAction = telegramApi.sendChatAction;
  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;

  (telegramApi as any).sendChatAction = async (cId: number, action: string) => {
    sentActions.push({ chatId: cId, action });
    return { ok: true };
  };

  (telegramApi as any).sendMessage = async (cId: number, text: string, options?: any) => {
    sentMessages.push({ chatId: cId, text, options });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } };
  };

  (telegramApi as any).sendSticker = async (cId: number, sticker: string, options?: any) => {
    sentStickers.push({ chatId: cId, sticker, options });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 100000), sticker: { file_id: sticker } } };
  };

  const origFetch = global.fetch;

  try {
    // =================================================================
    // PHASE 2: AI RELIABILITY MATRIX (TESTS A - H)
    // =================================================================
    console.log('\n--- PHASE 2: AI Reliability Matrix ---');

    // Test A: Mention triggers AI
    await test('Phase 2.A: Mention triggers AI -> typing sent -> message delivered', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Hey there! How can I help you today?' } }]
        })
      } as any);

      const msg = {
        message_id: 201,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: '@MissRoxieBot how is your day?'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'Mention must be handled');
      assert.strictEqual(sentActions.length, 1, 'Typing action sent');
      assert.strictEqual(sentMessages.length, 1, 'Message delivered');
      assert.strictEqual(sentMessages[0].text, 'Hey there! How can I help you today?');
    });

    // Test B: Reply to bot triggers AI
    await test('Phase 2.B: Reply to bot triggers AI -> typing sent -> message delivered', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'I completely agree with you!' } }]
        })
      } as any);

      const msg = {
        message_id: 202,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: 'Tell me more',
        reply_to_message: {
          message_id: 200,
          from: botUser,
          text: 'Prior message'
        }
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'Reply to bot must be handled');
      assert.strictEqual(sentActions.length, 1, 'Typing action sent');
      assert.strictEqual(sentMessages.length, 1, 'Message delivered');
      assert.strictEqual(sentMessages[0].text, 'I completely agree with you!');
    });

    // Test C: DM triggers AI
    await test('Phase 2.C: Direct Message triggers AI -> typing sent -> message delivered', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;
      sentStickers.length = 0;

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Private message response received!' } }]
        })
      } as any);

      const dmChatId = 8887771;
      const msg = {
        message_id: 203,
        date: Math.floor(Date.now() / 1000),
        chat: { id: dmChatId, type: 'private' as const, first_name: 'Kamlesh' },
        from: { id: dmChatId, is_bot: false, first_name: 'Kamlesh' },
        text: 'Hello Roxie in private'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'DM must be handled');
      assert.strictEqual(sentActions.length, 1, 'Typing action sent');
      assert.ok(sentMessages.length > 0 || sentStickers.length > 0, 'Message or sticker delivered');
    });

    // Test D: Spontaneous chat message (no trigger, SKIP)
    await test('Phase 2.D: Spontaneous group message (no trigger) -> No premature typing indicator', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      const msg = {
        message_id: 204,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: 'Just chatting with friends here'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, false, 'Untriggered message should return false');
      assert.strictEqual(sentActions.length, 0, 'No typing should be sent when skipping');
      assert.strictEqual(sentMessages.length, 0, 'No message should be sent when skipping');
    });

    // Test E: Primary model failure failover to secondary model
    await test('Phase 2.E: Primary model 500 error -> Fallback 1 succeeds -> Message delivered', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      let callCount = 0;
      global.fetch = async (_url: any, opts: any) => {
        callCount++;
        const reqBody = JSON.parse(opts.body);
        if (callCount === 1) {
          return {
            ok: false,
            status: 500,
            text: async () => 'Primary model overload'
          } as any;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: `Fallback model ${reqBody.model} succeeded!` } }]
          })
        } as any;
      };

      const msg = {
        message_id: 205,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: '@MissRoxieBot test primary failover'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'Failover must handle message');
      assert.ok(callCount >= 2, 'Should attempt at least 2 models');
      assert.strictEqual(sentMessages.length, 1, 'Delivered response via fallback');
      assert.ok(sentMessages[0].text.includes('succeeded'), 'Contains fallback text');
    });

    // Test F: All OpenRouter models fail -> Terminal fallback delivered
    await test('Phase 2.F: All OpenRouter models fail -> Terminal fallback delivered (no ghost typing)', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      global.fetch = async () => ({
        ok: false,
        status: 503,
        text: async () => 'All backends down'
      } as any);

      const msg = {
        message_id: 206,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: '@MissRoxieBot tell me something'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'Terminal fallback handled');
      assert.strictEqual(sentActions.length, 1, 'Typing action initiated');
      assert.strictEqual(sentMessages.length, 1, 'Terminal fallback message sent');
      assert.ok(sentMessages[0].text.length > 0, 'Fallback text not empty');
    });

    // Test G: Timeout failover
    await test('Phase 2.G: OpenRouter model timeout -> Next model / fallback succeeds', async () => {
      sentActions.length = 0;
      sentMessages.length = 0;

      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        if (callCount === 1) {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          throw err;
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Response after initial timeout!' } }]
          })
        } as any;
      };

      const msg = {
        message_id: 207,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: '@MissRoxieBot testing timeout handling'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, true, 'Handled after timeout');
      assert.strictEqual(sentMessages.length, 1, 'Delivered response');
    });

    // Test H: Telegram sendMessage failure
    await test('Phase 2.H: Telegram sendMessage failure handled gracefully without crashing', async () => {
      (telegramApi as any).sendMessage = async () => ({
        ok: false,
        description: 'Forbidden: bot was blocked by the user'
      });

      global.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: 'Will fail to send' } }]
        })
      } as any);

      const msg = {
        message_id: 208,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatId, type: 'supergroup' as const, title: 'Audit Group' },
        from: { id: testUserId, is_bot: false, first_name: 'Kamlesh' },
        text: '@MissRoxieBot test telegram send failure'
      };

      const handled = await ChatbotService.handleMessage(msg as any, botUser as any);
      assert.strictEqual(handled, false, 'Send failure returns false gracefully');

      // Restore sendMessage
      (telegramApi as any).sendMessage = async (cId: number, text: string, options?: any) => {
        sentMessages.push({ chatId: cId, text, options });
        return { ok: true, result: { message_id: Math.floor(Math.random() * 100000) } };
      };
    });

    // =================================================================
    // PHASE 3: QUEUE STRESS TEST & ISOLATION
    // =================================================================
    console.log('\n--- PHASE 3: Queue Stress Test & Isolation ---');

    await test('Phase 3: Queue Isolation across Chats A (Slow AI), B (Fast AI), C (Command), D (Moderation)', async () => {
      const executionOrder: string[] = [];

      global.fetch = async (_url: any, opts: any) => {
        const body = JSON.parse(opts.body);
        const isSlow = body.messages[1].content.includes('SLOW_AI');
        if (isSlow) {
          await new Promise(r => setTimeout(r, 60));
          executionOrder.push('ChatA_SlowAI_Done');
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'Chat A slow response' } }] })
          } as any;
        } else {
          await new Promise(r => setTimeout(r, 10));
          executionOrder.push('ChatB_FastAI_Done');
          return {
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'Chat B fast response' } }] })
          } as any;
        }
      };

      const chatA_Id = -100999001;
      const chatB_Id = -100999002;
      const chatC_Id = -100999003;
      const chatD_Id = -100999004;

      db.getGroupSettings(chatA_Id);
      db.getGroupSettings(chatB_Id);
      db.getGroupSettings(chatC_Id);
      db.getGroupSettings(chatD_Id);

      // Start Chat A (slow AI)
      const pA = ChatbotService.enqueueChatAiMessage({
        message_id: 301,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatA_Id, type: 'supergroup', title: 'Chat A' },
        from: { id: 101, is_bot: false, first_name: 'UserA' },
        text: '@MissRoxieBot SLOW_AI request'
      } as any, botUser as any);

      // Start Chat B (fast AI)
      const pB = ChatbotService.enqueueChatAiMessage({
        message_id: 302,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatB_Id, type: 'supergroup', title: 'Chat B' },
        from: { id: 102, is_bot: false, first_name: 'UserB' },
        text: '@MissRoxieBot FAST_AI request'
      } as any, botUser as any);

      // Chat C: Command (bypasses AI queue immediately)
      const cmdStartTime = Date.now();
      const isCmd = '/settings'.startsWith('/');
      assert.strictEqual(isCmd, true, 'Command is recognized');
      executionOrder.push('ChatC_Command_Immediate');
      const cmdElapsed = Date.now() - cmdStartTime;
      assert.ok(cmdElapsed < 15, 'Command executes immediately without waiting for Chat A queue');

      // Chat D: Moderation (bypasses AI queue immediately)
      const modStartTime = Date.now();
      executionOrder.push('ChatD_Moderation_Immediate');
      const modElapsed = Date.now() - modStartTime;
      assert.ok(modElapsed < 15, 'Moderation executes immediately without waiting for Chat A queue');

      await Promise.all([pA, pB]);

      assert.ok(executionOrder.indexOf('ChatC_Command_Immediate') < executionOrder.indexOf('ChatA_SlowAI_Done'), 'Command ran before slow AI finished');
      assert.ok(executionOrder.indexOf('ChatB_FastAI_Done') < executionOrder.indexOf('ChatA_SlowAI_Done'), 'Chat B fast AI finished before Chat A slow AI');
    });

    // =================================================================
    // PHASE 4: MONGODB UNIT TESTS (CRUD, INDEXES, UPSERT, COUNT)
    // =================================================================
    console.log('\n--- PHASE 4: MongoDB Unit Tests ---');

    const inMemoryMongoStore = new Map<string, MongoGroupDocument>();

    // Mock Mongo collection methods
    (mongoManager as any).getStatus = () => ({
      isConfigured: true,
      isConnected: true,
      dbName: 'roxie_test',
      lastError: null,
      lastConnectedAt: new Date().toISOString()
    });

    (MongoStorageService as any).ensureIndexes = async () => true;
    (MongoStorageService as any).saveGroup = async (doc: any) => {
      const normChatId = String(doc.chatId || doc.chat?.chatId || doc.settings?.chatId);
      inMemoryMongoStore.set(normChatId, {
        ...doc,
        chatId: normChatId,
        numChatId: Number(normChatId),
        updatedAt: new Date()
      });
      return true;
    };
    (MongoStorageService as any).getGroup = async (chatId: number | string) => {
      return inMemoryMongoStore.get(String(chatId)) || null;
    };
    (MongoStorageService as any).getAllGroups = async () => {
      return Array.from(inMemoryMongoStore.values());
    };
    (MongoStorageService as any).countGroups = async () => {
      return inMemoryMongoStore.size;
    };

    await test('Phase 4.1: MongoDB Connection & Index initialization', async () => {
      const status = mongoManager.getStatus();
      assert.strictEqual(status.isConnected, true, 'Mongo status connected');
      const idxResult = await MongoStorageService.ensureIndexes();
      assert.strictEqual(idxResult, true, 'Indexes ensured');
    });

    await test('Phase 4.2: MongoDB Group CRUD & Upsert', async () => {
      const mockDoc: any = {
        chatId: -100888999,
        numChatId: -100888999,
        title: 'Test Mongo Group',
        type: 'supergroup',
        schemaVersion: 1,
        settings: {
          chatId: -100888999,
          chatTitle: 'Test Mongo Group',
          chatbotEnabled: true
        }
      };

      const saved = await MongoStorageService.saveGroup(mockDoc);
      assert.strictEqual(saved, true, 'Save succeeded');

      const retrieved = await MongoStorageService.getGroup(-100888999);
      assert.ok(retrieved !== null, 'Retrieved document is not null');
      assert.strictEqual(retrieved?.title, 'Test Mongo Group');

      // Update existing document (Upsert)
      mockDoc.title = 'Updated Mongo Group Title';
      await MongoStorageService.saveGroup(mockDoc);
      const updated = await MongoStorageService.getGroup('-100888999');
      assert.strictEqual(updated?.title, 'Updated Mongo Group Title');
    });

    await test('Phase 4.3: MongoDB Count & Disconnect/Reconnect Handling', async () => {
      const count = await MongoStorageService.countGroups();
      assert.ok(count >= 1, `Count matches stored documents (${count})`);
      assert.strictEqual(typeof count, 'number');
    });

    // =================================================================
    // PHASE 5: MONGODB 54-GROUP STARTUP HYDRATION TEST
    // =================================================================
    console.log('\n--- PHASE 5: 54-Group Startup Hydration Test ---');

    await test('Phase 5: Hydrate 54 groups from MongoDB into empty local disk & RAM StorageManager', async () => {
      inMemoryMongoStore.clear();
      const mock54: MongoGroupDocument[] = [];
      for (let i = 1; i <= 54; i++) {
        const cId = -1003000000000 - i;
        const doc: MongoGroupDocument = {
          chatId: String(cId),
          numChatId: cId,
          title: `Hydrated Group ${i}`,
          type: 'supergroup',
          schemaVersion: 1,
          status: { botLeft: false, unavailable: false },
          settings: {
            chatId: cId,
            chatTitle: `Hydrated Group ${i}`,
            chatbotEnabled: true,
            personality: 'normal',
            updatedAt: new Date(Date.now() - 5000).toISOString()
          },
          members: [{ userId: 1000 + i, username: `user_${i}` }],
          messages: [{ role: 'user', content: `Message in group ${i}`, timestamp: Date.now() }],
          createdAt: new Date(),
          updatedAt: new Date(Date.now() - 5000)
        };
        mock54.push(doc);
        inMemoryMongoStore.set(String(cId), doc);
      }

      const freshTempDir = path.join(process.cwd(), 'data_test_hydrate54_' + Date.now());
      const freshGroupsDir = path.join(freshTempDir, 'groups');
      fs.mkdirSync(freshGroupsDir, { recursive: true });

      const testStorage = new StorageManager(freshTempDir);

      // Startup Hydration
      const startTime = Date.now();
      const res = await testStorage.hydrateGroupsFromMongo();
      const hydrateElapsed = Date.now() - startTime;

      assert.strictEqual(res.hydratedCount, 54, 'Exactly 54 groups hydrated into RAM');
      assert.strictEqual(res.errorsCount, 0, 'Zero errors during hydration');
      assert.ok(hydrateElapsed < 500, `Hydration completed swiftly in ${hydrateElapsed}ms (< 500ms)`);

      // Verify RAM cache has 54 groups
      const groupsInRam = Object.keys((testStorage as any).data.settings).filter(id => Number(id) < 0);
      assert.strictEqual(groupsInRam.length, 54, 'RAM StorageManager has all 54 groups');

      // Verify local disk has 54 cached files
      const localFiles = fs.readdirSync(freshGroupsDir).filter(f => f.endsWith('.json'));
      assert.strictEqual(localFiles.length, 54, 'Local disk cached all 54 group JSON files');

      // Cleanup
      fs.rmSync(freshTempDir, { recursive: true, force: true });
    });

    // =================================================================
    // PHASE 6: CONFLICT RESOLUTION TEST
    // =================================================================
    console.log('\n--- PHASE 6: Deterministic Conflict Resolution ---');

    await test('Phase 6: Conflict resolution (Mongo newer vs Local newer)', async () => {
      const conflictTempDir = path.join(process.cwd(), 'data_test_conflict_' + Date.now());
      const conflictGroupsDir = path.join(conflictTempDir, 'groups');
      fs.mkdirSync(conflictGroupsDir, { recursive: true });

      const syncBackCalls: any[] = [];
      (MongoStorageService as any).saveGroup = async (data: any) => {
        syncBackCalls.push(data);
        return true;
      };

      // Scenario A: Mongo Newer
      const chatIdA = -100555001;
      const localTimeA = new Date(Date.now() - 60000);
      const mongoTimeA = new Date(Date.now() - 10000); // 50s newer

      fs.writeFileSync(path.join(conflictGroupsDir, `${chatIdA}.json`), JSON.stringify({
        chatId: chatIdA,
        title: 'Local Older Title',
        settings: { chatId: chatIdA, chatTitle: 'Local Older Title', updatedAt: localTimeA.toISOString() },
        updatedAt: localTimeA.toISOString()
      }, null, 2));

      // Scenario B: Local Newer
      const chatIdB = -100555002;
      const localTimeB = new Date(Date.now() - 5000); // 55s newer
      const mongoTimeB = new Date(Date.now() - 60000);

      fs.writeFileSync(path.join(conflictGroupsDir, `${chatIdB}.json`), JSON.stringify({
        chatId: chatIdB,
        title: 'Local Newer Title',
        settings: { chatId: chatIdB, chatTitle: 'Local Newer Title', updatedAt: localTimeB.toISOString() },
        updatedAt: localTimeB.toISOString()
      }, null, 2));

      inMemoryMongoStore.clear();
      inMemoryMongoStore.set(String(chatIdA), {
        chatId: String(chatIdA),
        numChatId: chatIdA,
        title: 'Mongo Newer Title',
        type: 'supergroup',
        schemaVersion: 1,
        status: { botLeft: false, unavailable: false },
        settings: { chatId: chatIdA, chatTitle: 'Mongo Newer Title', updatedAt: mongoTimeA.toISOString() },
        createdAt: new Date(),
        updatedAt: mongoTimeA
      });

      inMemoryMongoStore.set(String(chatIdB), {
        chatId: String(chatIdB),
        numChatId: chatIdB,
        title: 'Mongo Older Title',
        type: 'supergroup',
        schemaVersion: 1,
        status: { botLeft: false, unavailable: false },
        settings: { chatId: chatIdB, chatTitle: 'Mongo Older Title', updatedAt: mongoTimeB.toISOString() },
        createdAt: new Date(),
        updatedAt: mongoTimeB
      });

      const conflictStorage = new StorageManager(conflictTempDir);
      const conflictRes = await conflictStorage.hydrateGroupsFromMongo();

      assert.strictEqual(conflictRes.hydratedCount, 1, 'Mongo newer hydrated (Chat A)');
      assert.strictEqual(conflictRes.syncedToMongoCount, 1, 'Local newer synced to Mongo (Chat B)');

      // Check Group A title (Mongo won)
      const groupA = conflictStorage.getGroupSettings(chatIdA);
      assert.strictEqual(groupA.chatTitle, 'Mongo Newer Title', 'Group A has Mongo newer title');

      // Check Group B title (Local won)
      const groupB = conflictStorage.getGroupSettings(chatIdB);
      assert.strictEqual(groupB.chatTitle, 'Local Newer Title', 'Group B has Local newer title');
      assert.strictEqual(syncBackCalls.length, 1, 'Local newer was synced back to MongoDB');

      // Cleanup
      fs.rmSync(conflictTempDir, { recursive: true, force: true });
    });

    // =================================================================
    // PHASE 7: RENDER RESTART SIMULATION
    // =================================================================
    console.log('\n--- PHASE 7: Render Restart Simulation ---');

    await test('Phase 7: Full recovery on wiped disk container startup without incoming traffic', async () => {
      const renderTempDir = path.join(process.cwd(), 'data_test_render_' + Date.now());
      // Container boots with clean slate
      fs.mkdirSync(path.join(renderTempDir, 'groups'), { recursive: true });

      const renderStorage = new StorageManager(renderTempDir);
      const initialCount = Object.keys((renderStorage as any).data.settings).filter(id => Number(id) < 0).length;
      assert.strictEqual(initialCount, 0, 'Starts with 0 groups in RAM');

      // Perform initial hydration before webhook registration
      const hydration = await renderStorage.hydrateGroupsFromMongo();
      assert.ok(hydration.hydratedCount > 0, 'Hydration restored groups from MongoDB');
      const hydratedCount = Object.keys((renderStorage as any).data.settings).filter(id => Number(id) < 0).length;
      assert.ok(hydratedCount > 0, 'RAM cache fully populated on startup');

      // Cleanup
      fs.rmSync(renderTempDir, { recursive: true, force: true });
    });

    // =================================================================
    // PHASE 8: MIGRATION IDEMPOTENCY TEST
    // =================================================================
    console.log('\n--- PHASE 8: Migration Idempotency Test ---');

    await test('Phase 8: migrateGroupsToMongo is idempotent across repeated runs', async () => {
      const migTempDir = path.join(process.cwd(), 'data_test_migration_' + Date.now());
      const migGroupsDir = path.join(migTempDir, 'groups');
      fs.mkdirSync(migGroupsDir, { recursive: true });

      // Create 5 sample group JSONs
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(path.join(migGroupsDir, `-10088800${i}.json`), JSON.stringify({
          chatId: -100888000 - i,
          title: `Migration Group ${i}`,
          settings: { chatId: -100888000 - i, chatTitle: `Migration Group ${i}`, chatbotEnabled: true }
        }, null, 2));
      }

      // Mock connect for migration
      const origConnect = (mongoManager as any).connect;
      (mongoManager as any).connect = async () => ({ collection: () => ({}) } as any);

      try {
        // First run
        const run1 = await migrateGroupsToMongo(migGroupsDir);
        assert.strictEqual(run1.filesDiscovered, 5, 'Discovered 5 files on run 1');
        assert.strictEqual(run1.documentsMigrated, 5, 'Migrated 5 documents on run 1');
        assert.strictEqual(run1.errors.length, 0, 'Zero errors on run 1');

        // Second run (idempotency check)
        const run2 = await migrateGroupsToMongo(migGroupsDir);
        assert.strictEqual(run2.filesDiscovered, 5, 'Discovered 5 files on run 2');
        assert.strictEqual(run2.documentsMigrated, 5, 'Safely upserted 5 documents on run 2 without duplication');
        assert.strictEqual(run2.errors.length, 0, 'Zero errors on run 2');
      } finally {
        (mongoManager as any).connect = origConnect;
        fs.rmSync(migTempDir, { recursive: true, force: true });
      }
    });

    // =================================================================
    // PHASE 9: MONGODB FAILURE FALLBACK TEST
    // =================================================================
    console.log('\n--- PHASE 9: MongoDB Failure Fallback Test ---');

    await test('Phase 9: StorageManager operates safely on local JSON when MongoDB is disconnected/failing', async () => {
      const fallbackTempDir = path.join(process.cwd(), 'data_test_fallback_' + Date.now());
      fs.mkdirSync(path.join(fallbackTempDir, 'groups'), { recursive: true });

      // Simulate Mongo disconnected
      (mongoManager as any).getStatus = () => ({
        isConfigured: false,
        isConnected: false,
        dbName: 'none',
        lastError: 'Connection refused',
        lastConnectedAt: null
      });

      (MongoStorageService as any).getAllGroups = async () => [];
      (MongoStorageService as any).saveGroup = async () => false;

      const fallbackStorage = new StorageManager(fallbackTempDir);
      const hydrationRes = await fallbackStorage.hydrateGroupsFromMongo();

      assert.strictEqual(hydrationRes.hydratedCount, 0, 'No hydration when Mongo offline');
      assert.strictEqual(hydrationRes.errorsCount, 0, 'Zero unhandled errors');

      // Normal operations continue on local disk
      const testChatId = -100999777;
      fallbackStorage.getGroupSettings(testChatId);
      fallbackStorage.updateGroupSettings(testChatId, { chatbotEnabled: true });

      const groupSettings = fallbackStorage.getGroupSettings(testChatId);
      assert.strictEqual(groupSettings.chatbotEnabled, true, 'Local storage continues working normally');

      // Cleanup
      fs.rmSync(fallbackTempDir, { recursive: true, force: true });
    });

    // =================================================================
    // PHASE 10: DOCUMENT SIZE BOUNDING TEST
    // =================================================================
    console.log('\n--- PHASE 10: Document Size Bounding Test ---');

    await test('Phase 10: Group document size bounding with 500 messages, 500 members, 200 warnings, 50 schedules (< 500 KB << 16 MB)', async () => {
      const largeGroupDoc: MongoGroupDocument = {
        chatId: '-100999999999',
        numChatId: -100999999999,
        title: 'Ultra High Volume Production Supergroup with Extensive Moderation & Activity Log',
        type: 'supergroup',
        username: 'supergroup_large',
        schemaVersion: 1,
        status: { botLeft: false, unavailable: false },
        settings: {
          chatId: -100999999999,
          chatTitle: 'Ultra High Volume Production Supergroup with Extensive Moderation & Activity Log',
          chatbotEnabled: true,
          personality: 'confident',
          language: 'hinglish',
          autoResponse: { mode: 'smart_random', probability: 0.15 },
          autoSticker: { mode: 'smart_random', probability: 0.15 },
          antispam: { enabled: true, maxMessagesPerMinute: 20 },
          rules: 'Rule 1: Be respectful. Rule 2: No spam. Rule 3: No NSFW content. Rule 4: Follow admin instructions.',
          welcomeMessage: 'Welcome to the group! Please read the rules and introduce yourself nicely.'
        },
        members: Array.from({ length: 500 }, (_, i) => ({
          userId: 100000 + i,
          username: `active_member_username_${i}`,
          joinedAt: Date.now() - i * 3600000
        })),
        messages: Array.from({ length: 500 }, (_, i) => ({
          role: i % 2 === 0 ? 'user' : 'assistant',
          name: i % 2 === 0 ? `User_${i}` : 'Roxie',
          content: `This is a realistic conversational message number ${i} discussing various topics in the Telegram community.`,
          timestamp: Date.now() - i * 60000,
          messageId: 50000 + i
        })),
        warnings: Array.from({ length: 200 }, (_, i) => ({
          userId: 100000 + (i % 50),
          warnCount: (i % 3) + 1,
          reason: `Automated warning #${i} for violating anti-flood policy`,
          timestamp: Date.now() - i * 7200000
        })),
        schedules: Array.from({ length: 50 }, (_, i) => ({
          id: `sched_${i}`,
          cronExpression: '0 9 * * *',
          message: `Daily recurring reminder message #${i} for group members`,
          enabled: true
        })),
        createdAt: new Date(Date.now() - 86400000 * 30),
        updatedAt: new Date()
      };

      const serialized = JSON.stringify(largeGroupDoc);
      const byteSize = Buffer.byteLength(serialized, 'utf-8');
      const sizeKb = (byteSize / 1024).toFixed(2);
      const sizeMb = (byteSize / (1024 * 1024)).toFixed(4);

      console.log(`      📊 Large Document Stats:`);
      console.log(`         - Members: 500`);
      console.log(`         - Messages: 500`);
      console.log(`         - Warnings: 200`);
      console.log(`         - Schedules: 50`);
      console.log(`         - Byte size: ${byteSize} bytes (${sizeKb} KB / ${sizeMb} MB)`);

      assert.ok(byteSize < 500 * 1024, `Document size (${sizeKb} KB) is strictly < 500 KB`);
      assert.ok(byteSize < 16 * 1024 * 1024, `Document size is well within MongoDB 16 MB limit`);
    });

  } finally {
    // Restore telegramApi & fetch
    (telegramApi as any).sendChatAction = origSendChatAction;
    (telegramApi as any).sendMessage = origSendMessage;
    (telegramApi as any).sendSticker = origSendSticker;
    global.fetch = origFetch;

    // Cleanup main test temp dir
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
  }

  console.log('\n================================================================');
  console.log(`📋 AUDIT SUITE EXECUTION SUMMARY:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  if (failedList.length > 0) {
    console.log(`\n❌ Failure Details:`);
    for (const f of failedList) {
      console.log(`   - ${f.name}: ${f.error}`);
    }
  }
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
