import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { StorageManager, AUTHORITATIVE_GROUP_METADATA, db } from '../server/db/storage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { MongoStorageService, MongoGroupDocument } from '../server/db/mongoStorage.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { metricsTracker } from '../server/observability/metricsService.js';

let passedTests = 0;
let totalTests = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      await res;
    }
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${name}:`, err);
    throw err;
  }
}

// In-Memory MongoDB Collection Mock with full mutation telemetry
class MockMongoGroupsCollection {
  public docs: Map<string, any> = new Map();
  public stats = {
    reads: 0,
    insertOne: 0,
    insertMany: 0,
    updateOne: 0,
    updateMany: 0,
    replaceOne: 0,
    deleteOne: 0,
    deleteMany: 0,
    drop: 0
  };

  public resetStats() {
    this.stats = {
      reads: 0,
      insertOne: 0,
      insertMany: 0,
      updateOne: 0,
      updateMany: 0,
      replaceOne: 0,
      deleteOne: 0,
      deleteMany: 0,
      drop: 0
    };
  }

  public find(query: any = {}): { toArray: () => Promise<any[]> } {
    this.stats.reads++;
    const all = Array.from(this.docs.values());
    const filtered = all.filter(doc => {
      if (query.botId !== undefined && query.botId !== null) {
        if (doc.botId !== query.botId) return false;
      }
      return true;
    });
    return {
      toArray: async () => JSON.parse(JSON.stringify(filtered))
    };
  }

  public async findOne(query: any): Promise<any | null> {
    this.stats.reads++;
    const all = Array.from(this.docs.values());
    for (const doc of all) {
      if (query.botId !== undefined && doc.botId !== query.botId) continue;
      if (query.$or) {
        const matchesOr = query.$or.some((clause: any) => {
          if (clause.chatId && String(doc.chatId) === String(clause.chatId)) return true;
          if (clause.numChatId && Number(doc.numChatId) === Number(clause.numChatId)) return true;
          return false;
        });
        if (matchesOr) return JSON.parse(JSON.stringify(doc));
      }
      if (query.chatId && String(doc.chatId) === String(query.chatId)) return JSON.parse(JSON.stringify(doc));
    }
    return null;
  }

  public async updateOne(query: any, update: any, options: any = {}): Promise<{ upsertedCount: number; modifiedCount: number }> {
    this.stats.updateOne++;
    const key = query.chatId ? `${query.botId ?? 'nobot'}_${query.chatId}` : `${query.botId ?? 'nobot'}_${Math.random()}`;
    const existing = this.docs.get(key) || {};
    const setFields = update.$set || {};
    const setOnInsert = options.upsert && !this.docs.has(key) ? (update.$setOnInsert || {}) : {};
    const merged = { ...existing, ...setOnInsert, ...setFields };
    this.docs.set(key, merged);
    return { upsertedCount: existing ? 0 : 1, modifiedCount: 1 };
  }

  public async insertOne(doc: any): Promise<{ insertedId: string }> {
    this.stats.insertOne++;
    const key = `${doc.botId ?? 'nobot'}_${doc.chatId || Math.random()}`;
    this.docs.set(key, JSON.parse(JSON.stringify(doc)));
    return { insertedId: key };
  }

  public async deleteOne(query: any): Promise<{ deletedCount: number }> {
    this.stats.deleteOne++;
    let deletedCount = 0;
    for (const [k, doc] of this.docs.entries()) {
      let matches = true;
      if (query.botId !== undefined && doc.botId !== query.botId) matches = false;
      if (query.$or) {
        matches = query.$or.some((clause: any) => {
          if (clause.chatId && String(doc.chatId) === String(clause.chatId)) return true;
          if (clause.numChatId && Number(doc.numChatId) === Number(clause.numChatId)) return true;
          return false;
        });
      }
      if (matches) {
        this.docs.delete(k);
        deletedCount++;
        break;
      }
    }
    return { deletedCount };
  }

  public async deleteMany(query: any): Promise<{ deletedCount: number }> {
    this.stats.deleteMany++;
    let deletedCount = 0;
    for (const [k, doc] of Array.from(this.docs.entries())) {
      let matches = true;
      if (query.$and) {
        // e.g. nin
        for (const clause of query.$and) {
          if (clause.chatId?.$nin && clause.chatId.$nin.includes(String(doc.chatId))) matches = false;
          if (clause.numChatId?.$nin && clause.numChatId.$nin.includes(Number(doc.numChatId))) matches = false;
        }
      }
      if (matches) {
        this.docs.delete(k);
        deletedCount++;
      }
    }
    return { deletedCount };
  }

  public async drop(): Promise<boolean> {
    this.stats.drop++;
    this.docs.clear();
    return true;
  }

  public async countDocuments(query: any = {}): Promise<number> {
    this.stats.reads++;
    return Array.from(this.docs.values()).filter(doc => {
      if (query.botId !== undefined && doc.botId !== query.botId) return false;
      return true;
    }).length;
  }

  public async indexes(): Promise<any[]> {
    return [
      { key: { botId: 1, chatId: 1 }, unique: true, name: 'botId_1_chatId_1' }
    ];
  }

  public async createIndex(): Promise<string> {
    return 'mock_index';
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('🧪 RUNNING MONGO PERSISTENCE ACROSS RESTART TEST SUITE');
  console.log('====================================================\n');

  const botId = 812999000;
  const mockCollection = new MockMongoGroupsCollection();

  // Patch mongoManager to use mock collection for groups
  (mongoManager as any).getGroupsCollection = () => mockCollection;
  (mongoManager as any).getStatus = () => ({ isConnected: true, uriConfigured: true, dbName: 'testdb' });

  const testTempDir = path.resolve(process.cwd(), 'scratch', 'test_mongo_persistence_data');
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTempDir, { recursive: true });

  // ----------------------------------------------------
  // TEST 1: Hydration performs ZERO mutations to MongoDB
  // ----------------------------------------------------
  await runTest('Test 1: hydrateGroupsFromMongo performs strictly 0 mutations on MongoDB (0 writes, 0 updates, 0 deletes, 0 drops)', async () => {
    mockCollection.resetStats();
    
    // Seed 10 groups in Mongo
    for (let i = 1; i <= 10; i++) {
      const chatId = -1004000000000 - i;
      const key = `${botId}_${chatId}`;
      mockCollection.docs.set(key, {
        chatId: String(chatId),
        numChatId: chatId,
        botId,
        settings: {
          chatId,
          chatTitle: `Persistent Group ${i}`,
          botId,
          botLeft: false,
          unavailable: false
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    mockCollection.resetStats();

    const dbInstance = new StorageManager(testTempDir);
    dbInstance.setBotIdentity({ id: botId, username: 'RoxieBot' });

    const result = await dbInstance.hydrateGroupsFromMongo(botId);

    // Verify Read-Only Invariants
    assert.strictEqual(mockCollection.stats.insertOne, 0, 'Must have 0 insertOne calls');
    assert.strictEqual(mockCollection.stats.insertMany, 0, 'Must have 0 insertMany calls');
    assert.strictEqual(mockCollection.stats.updateOne, 0, 'Must have 0 updateOne calls');
    assert.strictEqual(mockCollection.stats.updateMany, 0, 'Must have 0 updateMany calls');
    assert.strictEqual(mockCollection.stats.replaceOne, 0, 'Must have 0 replaceOne calls');
    assert.strictEqual(mockCollection.stats.deleteOne, 0, 'Must have 0 deleteOne calls');
    assert.strictEqual(mockCollection.stats.deleteMany, 0, 'Must have 0 deleteMany calls');
    assert.strictEqual(mockCollection.stats.drop, 0, 'Must have 0 drop calls');
    assert.ok(mockCollection.stats.reads > 0, 'Must have performed reads');
    assert.strictEqual(result.hydratedCount, 10);
    assert.strictEqual(result.syncedToMongoCount, 0);
  });

  // ----------------------------------------------------
  // TEST 2: Survival of 6 Authoritative + 14 Additional Groups (20 Total)
  // ----------------------------------------------------
  await runTest('Test 2: Survival of 20 diverse groups (6 authoritative + 14 additional) across startup hydration', async () => {
    mockCollection.docs.clear();
    mockCollection.resetStats();

    // 6 Authoritative groups
    for (const [idStr, meta] of Object.entries(AUTHORITATIVE_GROUP_METADATA)) {
      const numId = Number(idStr);
      mockCollection.docs.set(`${botId}_${numId}`, {
        chatId: idStr,
        numChatId: numId,
        botId,
        settings: {
          chatId: numId,
          chatTitle: meta.title,
          botId,
          botLeft: false,
          unavailable: false
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // 14 Additional legitimate groups
    for (let i = 1; i <= 14; i++) {
      const numId = -1005000000000 - i;
      mockCollection.docs.set(`${botId}_${numId}`, {
        chatId: String(numId),
        numChatId: numId,
        botId,
        settings: {
          chatId: numId,
          chatTitle: `Legitimate Additional Community ${i}`,
          botId,
          botLeft: false,
          unavailable: false
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    assert.strictEqual(mockCollection.docs.size, 20);

    const freshDir = path.resolve(testTempDir, 'fresh_run');
    fs.mkdirSync(freshDir, { recursive: true });

    const dbInstance = new StorageManager(freshDir);
    dbInstance.setBotIdentity({ id: botId, username: 'RoxieBot' });

    await dbInstance.hydrateGroupsFromMongo(botId);

    const activeSettings = dbInstance.getAllGroupSettings();
    const groupIds = Object.keys(activeSettings).map(Number).filter(k => k < 0);
    assert.strictEqual(groupIds.length, 20, `Expected exactly 20 surviving groups in RAM, got ${groupIds.length}`);
    assert.strictEqual(mockCollection.docs.size, 20, 'Expected exactly 20 groups remaining in MongoDB');
  });

  // ----------------------------------------------------
  // TEST 3: Render Cold Restart Simulation (Empty Local Disk)
  // ----------------------------------------------------
  await runTest('Test 3: Render cold restart with empty local disk reconstructs RAM and cache without deleting Mongo data', async () => {
    const emptyContainerDir = path.resolve(testTempDir, 'empty_render_container');
    fs.mkdirSync(emptyContainerDir, { recursive: true });

    mockCollection.resetStats();

    // Start with 0 local files
    assert.strictEqual(fs.readdirSync(emptyContainerDir).length, 0);

    const renderDb = new StorageManager(emptyContainerDir);
    renderDb.setBotIdentity({ id: botId, username: 'RoxieBot' });

    // Initial local load produces 0 groups
    assert.strictEqual(Object.keys(renderDb.getAllGroupSettings()).length, 0);

    // Hydrate from Mongo
    const hydrateResult = await renderDb.hydrateGroupsFromMongo(botId);
    assert.strictEqual(hydrateResult.hydratedCount, 20);

    // RAM now has all 20 groups
    const ramGroups = renderDb.getAllGroupSettings();
    assert.strictEqual(Object.keys(ramGroups).filter(k => Number(k) < 0).length, 20);

    // Local disk cache was reconstructed
    const diskGroupFiles = fs.readdirSync(renderDb.groupsDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(diskGroupFiles.length, 20);

    // Zero mutations to Mongo
    assert.strictEqual(mockCollection.stats.deleteOne, 0);
    assert.strictEqual(mockCollection.stats.deleteMany, 0);
    assert.strictEqual(mockCollection.stats.updateOne, 0);
    assert.strictEqual(mockCollection.stats.insertOne, 0);
  });

  // ----------------------------------------------------
  // TEST 4: Stale Local Disk Isolation (Never Push/Resurrect on Startup)
  // ----------------------------------------------------
  await runTest('Test 4: Stale local disk groups missing from MongoDB are pruned from local cache and NEVER pushed into MongoDB', async () => {
    const staleLocalDir = path.resolve(testTempDir, 'stale_local_test');
    const staleGroupsDir = path.resolve(staleLocalDir, 'groups');
    fs.mkdirSync(staleGroupsDir, { recursive: true });

    // Write a stale dummy group to local disk that does NOT exist in Mongo
    const staleChatId = -100999888777;
    const staleFile = path.resolve(staleGroupsDir, `${staleChatId}.json`);
    fs.writeFileSync(staleFile, JSON.stringify({
      chatId: staleChatId,
      botId,
      chatTitle: 'Stale Ghost Group from Old Image',
      botLeft: false,
      unavailable: false
    }));

    mockCollection.resetStats();
    const initialMongoCount = mockCollection.docs.size;

    // Boot StorageManager from this local disk
    const dbWithStaleDisk = new StorageManager(staleLocalDir);
    dbWithStaleDisk.setBotIdentity({ id: botId, username: 'RoxieBot' });

    // Prior to hydration, RAM contains the stale disk group
    assert.ok(dbWithStaleDisk.getGroupSettings(staleChatId));

    // Execute startup hydration
    await dbWithStaleDisk.hydrateGroupsFromMongo(botId);

    // Assert: The stale group was NOT inserted or updated in MongoDB
    assert.strictEqual(mockCollection.docs.size, initialMongoCount, 'Mongo group count must not increase');
    assert.strictEqual(mockCollection.stats.insertOne, 0, 'Must have 0 insertOne calls');
    assert.strictEqual(mockCollection.stats.updateOne, 0, 'Must have 0 updateOne calls');
    
    // Assert: The stale group was pruned from RAM cache to maintain single source of truth
    assert.strictEqual(dbWithStaleDisk.getGroupSettingsIfExists(staleChatId), undefined, 'Stale group must be purged from RAM');
  });

  // ----------------------------------------------------
  // TEST 5: Group Availability Flags (unavailable, botLeft) Are Preserved
  // ----------------------------------------------------
  await runTest('Test 5: Groups marked unavailable or botLeft are preserved in MongoDB & RAM with 0 deletions', async () => {
    // Mark two existing groups in Mongo as unavailable and botLeft
    const unavailId = -1005000000001;
    const leftId = -1005000000002;

    const unavailDoc = mockCollection.docs.get(`${botId}_${unavailId}`);
    if (unavailDoc) {
      unavailDoc.settings.unavailable = true;
    }
    const leftDoc = mockCollection.docs.get(`${botId}_${leftId}`);
    if (leftDoc) {
      leftDoc.settings.botLeft = true;
    }

    mockCollection.resetStats();

    const dbInstance = new StorageManager(testTempDir);
    dbInstance.setBotIdentity({ id: botId, username: 'RoxieBot' });

    await dbInstance.hydrateGroupsFromMongo(botId);

    // Assert MongoDB still holds all 20 groups
    assert.strictEqual(mockCollection.docs.size, 20);
    assert.strictEqual(mockCollection.stats.deleteOne, 0);
    assert.strictEqual(mockCollection.stats.deleteMany, 0);

    // Assert RAM correctly reflects the states
    const unavailSettings = dbInstance.getGroupSettings(unavailId);
    assert.strictEqual(unavailSettings.unavailable, true);

    const leftSettings = dbInstance.getGroupSettings(leftId);
    assert.strictEqual(leftSettings.botLeft, true);
  });

  // ----------------------------------------------------
  // TEST 6: AutoEngine Timer Safety with Unavailable / Left Groups
  // ----------------------------------------------------
  await runTest('Test 6: AutoEngine schedules timers ONLY for active groups without deleting or impacting unavailable groups', () => {
    db.setBotIdentity({ id: botId, username: 'RoxieBot' });

    // Populate singleton db with 20 groups: 18 active, 1 unavailable, 1 botLeft
    const dbInstance = new StorageManager(testTempDir);
    dbInstance.setBotIdentity({ id: botId, username: 'RoxieBot' });

    for (const [idStr, s] of Object.entries(dbInstance.getAllGroupSettings())) {
      const numId = Number(idStr);
      if (numId < 0) {
        const targetSettings = db.getGroupSettings(numId, s.chatTitle);
        targetSettings.botId = botId;
        targetSettings.botLeft = s.botLeft === true;
        targetSettings.unavailable = s.unavailable === true;
        targetSettings.autoEngine = {
          enabled: true,
          mode: 'messages_and_stickers',
          messages: { preset: 'normal', cooldownSeconds: 60, randomize: false, minSeconds: 60, maxSeconds: 120 },
          stickers: { preset: 'normal', cooldownSeconds: 60, randomize: false, minSeconds: 60, maxSeconds: 120 }
        };
        targetSettings.updatedAt = new Date().toISOString();
      }
    }

    autoEngineService.start(botId);

    // 20 total groups: 18 active, 1 unavailable, 1 botLeft
    // Each active group gets 2 timers (response + sticker) = 18 * 2 = 36 timers
    const status = autoEngineService.getStatus();
    assert.strictEqual(status.activeResponseTimers, 18, `Expected 18 response timers, got ${status.activeResponseTimers}`);
    assert.strictEqual(status.activeStickerTimers, 18, `Expected 18 sticker timers, got ${status.activeStickerTimers}`);
    assert.strictEqual(status.totalActiveJobs, 36, `Expected 36 total active jobs, got ${status.totalActiveJobs}`);

    autoEngineService.stop();

    // Clean up singleton db
    for (const idStr of Object.keys(db.getAllGroupSettings())) {
      const numId = Number(idStr);
      if (numId < 0 && numId !== -1004223070652 && numId !== -1004449422619 && numId !== -1004450389363 && numId !== -1004329420383 && numId !== -1003834290759 && numId !== -1004384873993) {
        db.deleteGroupData(numId);
      }
    }
  });

  // ----------------------------------------------------
  // TEST 7: Dynamic Live Onboarding & Survival across 3 Cold Restarts
  // ----------------------------------------------------
  await runTest('Test 7: Dynamically onboarding group 21 & 22 persists to Mongo and survives 3 cold container restarts', async () => {
    const liveDb = new StorageManager(testTempDir);
    liveDb.setBotIdentity({ id: botId, username: 'RoxieBot' });

    const newGroup21Id = -100777000021;
    const newGroup22Id = -100777000022;

    // Simulate explicit live onboarding event
    const s21 = liveDb.getGroupSettings(newGroup21Id, 'New Community 21');
    s21.botId = botId;
    s21.botLeft = false;
    s21.unavailable = false;
    const safeData21 = liveDb.sanitizeGroupData(liveDb.buildGroupDataObject(newGroup21Id));
    await MongoStorageService.saveGroup(safeData21, botId, 'RoxieBot');

    const s22 = liveDb.getGroupSettings(newGroup22Id, 'New Community 22');
    s22.botId = botId;
    s22.botLeft = false;
    s22.unavailable = false;
    const safeData22 = liveDb.sanitizeGroupData(liveDb.buildGroupDataObject(newGroup22Id));
    await MongoStorageService.saveGroup(safeData22, botId, 'RoxieBot');

    assert.strictEqual(mockCollection.docs.size, 22);

    // Simulate 3 consecutive cold restarts
    for (let restart = 1; restart <= 3; restart++) {
      const restartDir = path.resolve(testTempDir, `cold_restart_${restart}`);
      fs.mkdirSync(restartDir, { recursive: true });

      mockCollection.resetStats();

      const restartDb = new StorageManager(restartDir);
      restartDb.setBotIdentity({ id: botId, username: 'RoxieBot' });

      await restartDb.hydrateGroupsFromMongo(botId);

      // Assert 0 mutations
      assert.strictEqual(mockCollection.stats.deleteOne, 0, `Restart ${restart}: must have 0 deletes`);
      assert.strictEqual(mockCollection.stats.deleteMany, 0, `Restart ${restart}: must have 0 deleteMany`);
      assert.strictEqual(mockCollection.stats.updateOne, 0, `Restart ${restart}: must have 0 updates`);
      assert.strictEqual(mockCollection.stats.insertOne, 0, `Restart ${restart}: must have 0 inserts`);

      // Assert all 22 groups exist
      const loaded = restartDb.getAllGroupSettings();
      const loadedCount = Object.keys(loaded).filter(k => Number(k) < 0).length;
      assert.strictEqual(loadedCount, 22, `Restart ${restart}: expected 22 groups in RAM, got ${loadedCount}`);
      assert.ok(loaded[newGroup21Id], `Restart ${restart}: missing group 21`);
      assert.ok(loaded[newGroup22Id], `Restart ${restart}: missing group 22`);
    }
  });

  // ----------------------------------------------------
  // TEST 8: Explicit Dashboard Deletion Scopes Only to Deleted Group
  // ----------------------------------------------------
  await runTest('Test 8: Explicit user dashboard deletion removes ONLY target group, keeping remaining 21 groups intact', async () => {
    const dbInstance = new StorageManager(testTempDir);
    dbInstance.setBotIdentity({ id: botId, username: 'RoxieBot' });
    await dbInstance.hydrateGroupsFromMongo(botId);

    const targetDeleteId = -100777000022;

    // Explicit user action via dashboard API
    dbInstance.removeGroupFromDashboard(targetDeleteId, botId);
    await MongoStorageService.deleteGroup(targetDeleteId, botId);

    // Assert 21 groups remain in Mongo
    assert.strictEqual(mockCollection.docs.size, 21);

    // Next restart hydrates exactly 21 groups
    const postDeleteDir = path.resolve(testTempDir, 'post_delete_restart');
    fs.mkdirSync(postDeleteDir, { recursive: true });

    const postDeleteDb = new StorageManager(postDeleteDir);
    postDeleteDb.setBotIdentity({ id: botId, username: 'RoxieBot' });

    await postDeleteDb.hydrateGroupsFromMongo(botId);

    const loadedCount = Object.keys(postDeleteDb.getAllGroupSettings()).filter(k => Number(k) < 0).length;
    assert.strictEqual(loadedCount, 21);
    assert.strictEqual(postDeleteDb.getGroupSettingsIfExists(targetDeleteId), undefined);
  });

  // Cleanup test scratch directory
  try {
    fs.rmSync(testTempDir, { recursive: true, force: true });
  } catch {}

  metricsTracker.stop();

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passedTests}/${totalTests} MONGO PERSISTENCE & ZERO-MUTATION TESTS PASSED!`);
  console.log('====================================================\n');
}

runTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test suite failed:', err);
    process.exit(1);
  });
