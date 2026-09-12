import fs from 'fs';
import path from 'path';
import { StorageManager } from '../server/db/storage.js';
import { MongoStorageService, MongoGroupDocument } from '../server/db/mongoStorage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { telegramApi } from '../server/telegram/api.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING ROXIE MONGODB HYDRATION & RESPONSE FAILURE TEST SUITE');
  console.log('================================================================\n');

  const testTempDir = path.join(process.cwd(), 'data_test_hydration_' + Date.now());
  const testGroupsDir = path.join(testTempDir, 'groups');

  try {
    // ----------------------------------------------------------------
    // TEST 1: Startup MongoDB Hydration with 54 Groups & Empty Local Disk
    // ----------------------------------------------------------------
    console.log('--- TEST 1: Startup Hydration from MongoDB (54 groups, empty local disk) ---');

    // Ensure fresh, empty test directory
    if (fs.existsSync(testTempDir)) {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testGroupsDir, { recursive: true });

    // Mock MongoStorageService.getAllGroups to return 54 group documents
    const mock54Groups: MongoGroupDocument[] = [];
    for (let i = 1; i <= 54; i++) {
      const chatId = -1002000000000 - i;
      mock54Groups.push({
        chatId: String(chatId),
        numChatId: chatId,
        title: `Production Group ${i}`,
        type: 'supergroup',
        username: `group_${i}`,
        schemaVersion: 1,
        status: { botLeft: false, unavailable: false },
        settings: {
          chatId,
          chatTitle: `Production Group ${i}`,
          chatbotEnabled: true,
          personality: 'normal',
          language: 'hinglish',
          autoResponse: { mode: 'smart_random', probability: 0.1 },
          autoSticker: { mode: 'smart_random', probability: 0.1 },
          updatedAt: new Date(Date.now() - 10000).toISOString()
        },
        members: [{ userId: 1000 + i, username: `user_${i}` }],
        messages: [{ role: 'user', name: `User ${i}`, content: `Hello in group ${i}`, timestamp: Date.now() }],
        createdAt: new Date(),
        updatedAt: new Date(Date.now() - 10000)
      });
    }

    // Mock mongoManager status
    const origGetStatus = mongoManager.getStatus;
    const origGetAllGroups = MongoStorageService.getAllGroups;
    const savedToMongo: any[] = [];
    const origSaveGroup = MongoStorageService.saveGroup;

    (mongoManager as any).getStatus = () => ({
      isConfigured: true,
      isConnected: true,
      dbName: 'roxie',
      lastError: null,
      lastConnectedAt: new Date().toISOString()
    });

    (MongoStorageService as any).getAllGroups = async () => mock54Groups;
    (MongoStorageService as any).saveGroup = async (data: any) => {
      savedToMongo.push(data);
      return true;
    };

    // Instantiate StorageManager pointing to empty directory
    const testDb = new StorageManager(testTempDir);

    // Verify local disk starts empty
    const filesBefore = fs.readdirSync(testGroupsDir);
    assert(filesBefore.length === 0, `Local data/groups is initially empty (found ${filesBefore.length} files)`);

    // Perform startup hydration
    const hydrateResult = await testDb.hydrateGroupsFromMongo();
    assert(hydrateResult.hydratedCount === 54, `Hydrated exactly 54 groups from MongoDB into RAM (got ${hydrateResult.hydratedCount})`);
    assert(hydrateResult.errorsCount === 0, `Zero errors during MongoDB hydration (got ${hydrateResult.errorsCount})`);

    // Verify all 54 groups exist in RAM
    for (let i = 1; i <= 54; i++) {
      const chatId = -1002000000000 - i;
      const settings = testDb.getGroupSettings(chatId);
      assert(settings.chatTitle === `Production Group ${i}`, `Group ${chatId} correctly loaded in RAM with title "Production Group ${i}"`);
    }

    // Verify local JSON files are populated on disk cache
    const filesAfter = fs.readdirSync(testGroupsDir).filter(f => f.endsWith('.json'));
    assert(filesAfter.length === 54, `Local data/groups cache now contains exactly 54 .json files (found ${filesAfter.length})`);

    // ----------------------------------------------------------------
    // TEST 2: Deterministic Conflict Resolution (Mongo vs Local)
    // ----------------------------------------------------------------
    console.log('\n--- TEST 2: Deterministic Conflict Resolution ---');

    // Case A: MongoDB is newer -> MongoDB wins
    const conflictChatIdA = -1002000000001;
    // Update local RAM with older timestamp
    const oldLocalSettings = testDb.getGroupSettings(conflictChatIdA);
    oldLocalSettings.chatTitle = 'Old Local Title A';
    oldLocalSettings.updatedAt = new Date('2026-01-01T00:00:00Z').toISOString();

    // Mongo doc has newer timestamp
    const newerMongoDoc: MongoGroupDocument = {
      ...mock54Groups[0],
      chatId: String(conflictChatIdA),
      numChatId: conflictChatIdA,
      title: 'Newer MongoDB Title A',
      settings: {
        ...mock54Groups[0].settings,
        chatTitle: 'Newer MongoDB Title A',
        updatedAt: new Date('2026-06-01T00:00:00Z').toISOString()
      },
      updatedAt: new Date('2026-06-01T00:00:00Z')
    };

    (MongoStorageService as any).getAllGroups = async () => [newerMongoDoc];
    const hydrateConflictA = await testDb.hydrateGroupsFromMongo();
    assert(hydrateConflictA.hydratedCount === 1, 'MongoDB newer document hydrated into RAM');
    const resolvedSettingsA = testDb.getGroupSettings(conflictChatIdA);
    assert(resolvedSettingsA.chatTitle === 'Newer MongoDB Title A', 'MongoDB won conflict when Mongo timestamp is newer');

    // Case B: Local is strictly newer -> Local wins and pushes to MongoDB
    savedToMongo.length = 0;
    const conflictChatIdB = -1002000000002;
    const newerLocalSettings = testDb.getGroupSettings(conflictChatIdB);
    newerLocalSettings.chatTitle = 'Strictly Newer Local Title B';
    newerLocalSettings.updatedAt = new Date('2026-09-01T00:00:00Z').toISOString();

    const olderMongoDoc: MongoGroupDocument = {
      ...mock54Groups[1],
      chatId: String(conflictChatIdB),
      numChatId: conflictChatIdB,
      title: 'Older Mongo Title B',
      settings: {
        ...mock54Groups[1].settings,
        chatTitle: 'Older Mongo Title B',
        updatedAt: new Date('2026-03-01T00:00:00Z').toISOString()
      },
      updatedAt: new Date('2026-03-01T00:00:00Z')
    };

    (MongoStorageService as any).getAllGroups = async () => [olderMongoDoc];
    const hydrateConflictB = await testDb.hydrateGroupsFromMongo();
    assert(hydrateConflictB.syncedToMongoCount >= 1, `Local newer document pushed/synced to MongoDB (synced total: ${hydrateConflictB.syncedToMongoCount})`);
    const resolvedSettingsB = testDb.getGroupSettings(conflictChatIdB);
    assert(resolvedSettingsB.chatTitle === 'Strictly Newer Local Title B', 'Local strictly newer title preserved');
    const matchingSaved = savedToMongo.find(s => s.chat?.chatId === String(conflictChatIdB) || s.chatId === String(conflictChatIdB));
    assert(Boolean(matchingSaved), 'Local data successfully persisted to MongoDB');

    // ----------------------------------------------------------------
    // TEST 3: Telegram Send Failure Recovery & Gate/Slot Release
    // ----------------------------------------------------------------
    console.log('\n--- TEST 3: Telegram Send Failure Recovery ---');

    const origSendMessage = telegramApi.sendMessage;
    const origSendChatAction = telegramApi.sendChatAction;

    // Simulate Telegram API failing with 502 / network error
    (telegramApi as any).sendMessage = async () => ({
      ok: false,
      error_code: 502,
      description: 'Bad Gateway / Telegram API timeout'
    });
    (telegramApi as any).sendChatAction = async () => ({ ok: true });

    // Inbound explicit message
    const incomingMsg: any = {
      message_id: 998811,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -1002000000010, type: 'supergroup', title: 'Test Group' },
      from: { id: 77777, first_name: 'TestUser', username: 'testuser' },
      text: '@RoxieBot tell me a joke'
    };

    const botUser: any = { id: 88888, username: 'RoxieBot', first_name: 'Roxie' };

    const sendResult = await ChatbotService.handleMessage(incomingMsg, botUser);
    assert(sendResult === false, 'handleMessage gracefully returns false when Telegram API fails to send');

    // Verify in-flight active gate was released in finally block
    const isStillActive = (ChatbotService as any).activeProcessingKeys.has('-1002000000010_998811');
    assert(isStillActive === false, 'Message in-flight gate was cleanly removed from activeProcessingKeys');

    // Verify subsequent new message acquires gate cleanly
    const canAcquireNew = ChatbotService.acquireGate(-1002000000010, 998813);
    assert(canAcquireNew === true, 'Subsequent message acquires gate cleanly');
    ChatbotService.releaseGate(-1002000000010, 998813);

    // ----------------------------------------------------------------
    // TEST 4: Spontaneous SKIP Zero-Typing Verification
    // ----------------------------------------------------------------
    console.log('\n--- TEST 4: Spontaneous SKIP Zero-Typing Verification ---');

    let typingSent = 0;
    (telegramApi as any).sendChatAction = async (chatId: number, action: string) => {
      if (action === 'typing') typingSent++;
      return { ok: true };
    };

    // Spontaneous un-triggered message in group where AI decides not to respond
    const spontaneousMsg: any = {
      message_id: 998814,
      date: Math.floor(Date.now() / 1000),
      chat: { id: -1002000000010, type: 'supergroup', title: 'Test Group' },
      from: { id: 55555, first_name: 'RandomMember' },
      text: 'Just chatting about random things with another member.'
    };

    typingSent = 0;
    const spontaneousResult = await ChatbotService.handleMessage(spontaneousMsg, botUser);
    assert(spontaneousResult === false, 'Spontaneous message with no trigger produces no reply (INTENTIONAL_NO_RESPONSE)');
    assert(typingSent === 0, `Zero typing indicators sent for spontaneous skip (sent: ${typingSent})`);

    // ----------------------------------------------------------------
    // TEST 5: Group Document Size Boundedness (< 500 KB vs 16 MB limit)
    // ----------------------------------------------------------------
    console.log('\n--- TEST 5: Document Size Bounding Verification ---');

    const bigChatId = -1002000000099;
    testDb.getGroupSettings(bigChatId);

    // Populate large arrays
    for (let m = 0; m < 800; m++) {
      testDb.addGroupConversationEntry(bigChatId, {
        role: m % 2 === 0 ? 'user' : 'assistant',
        name: `User_${m}`,
        content: `Long test message content number ${m} with detailed sentences to test storage size.`,
        timestamp: Date.now() - (800 - m) * 1000,
        messageId: 10000 + m
      });
    }

    const builtDoc = testDb.buildGroupDataObject(bigChatId);
    assert(builtDoc.messages.length <= 500, `Messages array bounded to <= 500 (got ${builtDoc.messages.length})`);
    assert(builtDoc.moderation.warnings.length <= 200, `Warnings array bounded to <= 200 (got ${builtDoc.moderation.warnings.length})`);
    assert(builtDoc.moderation.tempActions.length <= 200, `TempActions array bounded to <= 200 (got ${builtDoc.moderation.tempActions.length})`);
    assert(builtDoc.statistics.schedules.length <= 50, `Schedules array bounded to <= 50 (got ${builtDoc.statistics.schedules.length})`);
    assert(builtDoc.activity.length <= 50, `Activity logs bounded to <= 50 (got ${builtDoc.activity.length})`);

    const serializedSize = Buffer.byteLength(JSON.stringify(builtDoc), 'utf-8');
    const sizeKB = (serializedSize / 1024).toFixed(1);
    console.log(`  Document serialized size with max capacity: ${sizeKB} KB`);
    assert(serializedSize < 500 * 1024, `Document size (${sizeKB} KB) is well within safety margin (< 500 KB, << 16 MB limit)`);

    // Cleanup mocks
    mongoManager.getStatus = origGetStatus;
    MongoStorageService.getAllGroups = origGetAllGroups;
    MongoStorageService.saveGroup = origSaveGroup;
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendChatAction = origSendChatAction;

  } finally {
    // Clean up temporary test data directory
    if (fs.existsSync(testTempDir)) {
      try {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      } catch {}
    }
  }

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
