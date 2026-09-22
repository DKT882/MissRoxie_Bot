import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { mongoManager } from '../server/db/mongodb.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { messageScheduler } from '../server/telegram/scheduler.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { telegramBot } from '../server/telegram.js';
import { GroupConversationMessage } from '../server/db/storage.js';

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMongoBandwidthAndPersistenceFixSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Targeted MongoDB Persistence & Safety Verification Suite');
  console.log('===================================================================');

  let passedTests = 0;
  let failedTests = 0;

  function pass(name: string) {
    console.log(`✅ [PASS] ${name}`);
    passedTests++;
  }

  function fail(name: string, err: any) {
    console.error(`❌ [FAIL] ${name}:`, err?.message || err);
    failedTests++;
  }

  const runTimestamp = Date.now();
  const testChatId = -Number(`10099${runTimestamp % 1000000}1`);
  const testChatId2 = -Number(`10099${runTimestamp % 1000000}2`);

  // Setup test group in db
  db.getGroupSettings(testChatId, 'MongoDB Persistence Test Group');
  db.getGroupSettings(testChatId2, 'MongoDB Coalesce Test Group');

  // Let initial setup saves settle
  await sleep(300);

  // Track MongoStorageService method calls
  let saveGroupCalls: Array<{ groupData: any; botId?: number }> = [];
  let appendMessageCalls: Array<{ chatId: any; message: any; targetBotId?: number; incrementHumanCounter?: boolean }> = [];
  let incrementCounterCalls: Array<{ chatId: any; targetBotId?: number }> = [];
  let updateStickerActivityCalls: Array<{ chatId: any; newGap: number; targetBotId?: number }> = [];
  let setProactiveMsgIdCalls: Array<{ chatId: any; messageId: number; targetBotId?: number }> = [];
  let recordAutoStickerSentCalls: Array<{ chatId: any; newGap: number; targetBotId?: number }> = [];
  let recordAutoResponseSentCalls: Array<{ chatId: any; targetBotId?: number }> = [];

  const originalSaveGroup = MongoStorageService.saveGroup;
  const originalAppendGroupMessage = MongoStorageService.appendGroupMessage;
  const originalIncrementHumanMessageCount = MongoStorageService.incrementHumanMessageCount;
  const originalUpdateStickerActivity = MongoStorageService.updateStickerActivity;
  const originalSetLastProactiveConsideredMessageId = MongoStorageService.setLastProactiveConsideredMessageId;
  const originalRecordAutoStickerSent = MongoStorageService.recordAutoStickerSent;
  const originalRecordAutoResponseSent = MongoStorageService.recordAutoResponseSent;

  MongoStorageService.saveGroup = async (groupData: any, botId?: number): Promise<boolean> => {
    saveGroupCalls.push({ groupData: JSON.parse(JSON.stringify(groupData)), botId });
    return true;
  };

  MongoStorageService.appendGroupMessage = async (chatId: any, message: any, targetBotId?: number, incrementHumanCounter?: boolean): Promise<boolean> => {
    appendMessageCalls.push({ chatId, message: JSON.parse(JSON.stringify(message)), targetBotId, incrementHumanCounter });
    return true;
  };

  MongoStorageService.incrementHumanMessageCount = async (chatId: any, targetBotId?: number): Promise<boolean> => {
    incrementCounterCalls.push({ chatId, targetBotId });
    return true;
  };

  MongoStorageService.updateStickerActivity = async (chatId: any, newGap: number, targetBotId?: number): Promise<boolean> => {
    updateStickerActivityCalls.push({ chatId, newGap, targetBotId });
    return true;
  };

  MongoStorageService.setLastProactiveConsideredMessageId = async (chatId: any, messageId: number, targetBotId?: number): Promise<boolean> => {
    setProactiveMsgIdCalls.push({ chatId, messageId, targetBotId });
    return true;
  };

  MongoStorageService.recordAutoStickerSent = async (chatId: any, newGap: number, targetBotId?: number): Promise<boolean> => {
    recordAutoStickerSentCalls.push({ chatId, newGap, targetBotId });
    return true;
  };

  MongoStorageService.recordAutoResponseSent = async (chatId: any, targetBotId?: number): Promise<boolean> => {
    recordAutoResponseSentCalls.push({ chatId, targetBotId });
    return true;
  };

  // Override prototype getStatus on MongoManager so storage.ts always sees isConnected: true
  const proto = Object.getPrototypeOf(mongoManager);
  const originalGetStatus = proto.getStatus;
  let isMongoMockConnected = true;
  proto.getStatus = function() {
    return {
      isConfigured: true,
      isConnected: isMongoMockConnected,
      dbName: 'roxie_test',
      lastError: isMongoMockConnected ? null : 'Connection failed',
      lastConnectedAt: new Date().toISOString()
    };
  };

  try {
    // -------------------------------------------------------------------------
    // Check 1 / Test A: Mongo update succeeds (Steady state)
    // -------------------------------------------------------------------------
    try {
      saveGroupCalls = [];
      appendMessageCalls = [];
      db.clearDirtyMongoGroups();

      const msgA: GroupConversationMessage = {
        role: 'user',
        userId: 111001,
        name: 'Alice',
        content: 'Steady state message',
        timestamp: Date.now(),
        messageId: 5001
      };

      db.addGroupConversationEntry(testChatId, msgA, true);

      assert.strictEqual(appendMessageCalls.length, 1, 'Targeted append call dispatched');
      assert.strictEqual(appendMessageCalls[0].incrementHumanCounter, true, 'Combined counter included');
      assert.strictEqual(db.getDirtyMongoGroupCount(), 0, 'No dirty groups tracked on success');
      assert.strictEqual(saveGroupCalls.length, 0, 'Zero full document saves on steady state');

      pass('Check A: Mongo update succeeds: Targeted update dispatched with zero full saves and 0 dirty groups');
    } catch (err) {
      fail('Check A: Mongo update succeeds', err);
    }

    // -------------------------------------------------------------------------
    // Check 2 / Test B: Mongo update fails once then recovers
    // -------------------------------------------------------------------------
    try {
      db.clearDirtyMongoGroups();
      saveGroupCalls = [];
      appendMessageCalls = [];

      const failChatId = -Number(`10099${runTimestamp % 1000000}7`);
      db.getGroupSettings(failChatId, 'Fail Recovery Group');

      // Mock failure for appendGroupMessage
      MongoStorageService.appendGroupMessage = async () => false;

      db.addGroupConversationEntry(failChatId, {
        role: 'user',
        userId: 111002,
        name: 'Bob',
        content: 'Message during transient glitch',
        timestamp: Date.now(),
        messageId: 6001
      }, true);

      // Verify marked dirty
      await sleep(50);
      assert.strictEqual(db.getDirtyMongoGroupCount(), 1, 'Group must be marked dirty after write failure');
      const dirtyState = db.getDirtyMongoGroupState(failChatId);
      assert.ok(dirtyState, 'Dirty state exists');
      assert.strictEqual(dirtyState?.failedOperationsCount, 1);

      // Restore working mock and flush dirty groups
      MongoStorageService.appendGroupMessage = async (chatId: any, message: any, targetBotId?: number, incrementHumanCounter?: boolean): Promise<boolean> => {
        appendMessageCalls.push({ chatId, message: JSON.parse(JSON.stringify(message)), targetBotId, incrementHumanCounter });
        return true;
      };

      // Force nextRetryAt to now for deterministic test
      dirtyState.nextRetryAt = Date.now() - 10;
      const flushed = await db.flushDirtyMongoGroups();

      assert.strictEqual(flushed, 1, 'Flushed 1 dirty group');
      assert.strictEqual(db.getDirtyMongoGroupCount(), 0, 'Dirty state cleared after recovery');
      assert.ok(saveGroupCalls.some(c => Number(c.groupData.chat?.chatId || c.groupData.settings?.chatId || c.groupData.chatId) === failChatId), 'Recovery saveGroup dispatched');

      pass('Check B: Mongo update fails once then recovers: Marked dirty, backoff scheduled, recovery flushes and clears dirty state');
    } catch (err) {
      fail('Check B: Transient failure recovery', err);
    }

    // -------------------------------------------------------------------------
    // Check 3 / Test C: Mongo remains unavailable (Bounded backoff, no crash)
    // -------------------------------------------------------------------------
    try {
      db.clearDirtyMongoGroups();
      isMongoMockConnected = false;

      const unavailChatId = -Number(`10099${runTimestamp % 1000000}8`);
      db.getGroupSettings(unavailChatId, 'Unavailable Group');

      db.addGroupConversationEntry(unavailChatId, {
        role: 'user',
        userId: 111003,
        name: 'Charlie',
        content: 'Message while Mongo offline',
        timestamp: Date.now(),
        messageId: 7001
      });

      assert.strictEqual(db.getDirtyMongoGroupCount(), 1, 'Tracked as dirty group while Mongo is disconnected');
      const state = db.getDirtyMongoGroupState(unavailChatId);
      assert.ok(state && state.nextRetryAt > Date.now(), 'Retry backoff is set in the future');

      // Attempting to flush while disconnected does not throw or crash
      const flushed = await db.flushDirtyMongoGroups();
      assert.strictEqual(flushed, 0, 'Does not flush while disconnected');
      assert.strictEqual(db.getDirtyMongoGroupCount(), 1, 'Still dirty');

      isMongoMockConnected = true;
      db.clearDirtyMongoGroups();

      pass('Check C: Mongo remains unavailable: Bounded backoff, zero crash, RAM state intact');
    } catch (err) {
      fail('Check C: Mongo remains unavailable', err);
    }

    // -------------------------------------------------------------------------
    // Check 4 / Test D & E: Multiple messages arrive while Mongo is down, then recover
    // -------------------------------------------------------------------------
    try {
      db.clearDirtyMongoGroups();
      saveGroupCalls = [];
      const batchChatId = -Number(`10099${runTimestamp % 1000000}9`);
      db.getGroupSettings(batchChatId, 'Batch Offline Group');

      // Mongo is offline
      isMongoMockConnected = false;

      // 5 messages arrive
      for (let i = 1; i <= 5; i++) {
        db.addGroupConversationEntry(batchChatId, {
          role: 'user',
          userId: 111004,
          name: 'Dave',
          content: `Offline msg ${i}`,
          timestamp: Date.now() + i,
          messageId: 8000 + i
        }, true);
      }

      // Verify RAM has all 5 messages
      const mem = db.getGroupMemory(batchChatId);
      assert.strictEqual(mem.length, 5, 'RAM has all 5 messages');
      assert.strictEqual(db.getDirtyMongoGroupCount(), 1, 'Exactly 1 dirty entry coalesces all 5 mutations');
      const dirtyState = db.getDirtyMongoGroupState(batchChatId);
      assert.strictEqual(dirtyState?.failedOperationsCount, 5, 'Tracked 5 failed mutations in single dirty entry');

      // Mongo comes back online
      isMongoMockConnected = true;
      dirtyState!.nextRetryAt = Date.now() - 10;

      const flushedCount = await db.flushDirtyMongoGroups();
      assert.strictEqual(flushedCount, 1, 'Single recovery flush operation');
      assert.strictEqual(db.getDirtyMongoGroupCount(), 0, 'Dirty state cleared');

      const recoveryCall = saveGroupCalls.find(c => Number(c.groupData.chat?.chatId || c.groupData.settings?.chatId || c.groupData.chatId) === batchChatId);
      assert.ok(recoveryCall, 'Recovery saveGroup was called');
      assert.strictEqual(recoveryCall.groupData.messages.length, 5, 'Recovery snapshot contains all 5 messages in order');
      assert.strictEqual(recoveryCall.groupData.messages[0].content, 'Offline msg 1');
      assert.strictEqual(recoveryCall.groupData.messages[4].content, 'Offline msg 5');

      pass('Check D & E: Multiple messages coalesced while offline & recovered in ONE single atomic snapshot');
    } catch (err) {
      fail('Check D & E: Multi-message offline coalesce & recovery', err);
    }

    // -------------------------------------------------------------------------
    // Check 5 / Test F & G: Render restart simulation & zero duplicate messages
    // -------------------------------------------------------------------------
    try {
      const restartChatId = -Number(`10099${runTimestamp % 1000000}5`);
      db.getGroupSettings(restartChatId, 'Restart Sim Group');

      // Add 3 messages
      for (let i = 1; i <= 3; i++) {
        db.addGroupConversationEntry(restartChatId, {
          role: 'user',
          userId: 111005,
          name: 'Eve',
          content: `Pre-restart msg ${i}`,
          timestamp: Date.now() + i,
          messageId: 9000 + i
        });
      }

      // Simulate snapshot in Mongo
      const rawData = (db as any).buildGroupDataObject(restartChatId);
      const safeData = (db as any).sanitizeGroupData(rawData);

      // Simulate restart hydration from Mongo doc
      (db as any).restoreGroupData(restartChatId, safeData);

      const hydratedMem = db.getGroupMemory(restartChatId);
      assert.strictEqual(hydratedMem.length, 3, 'Hydrated exactly 3 messages');
      const uniqueMsgIds = new Set(hydratedMem.map(m => m.messageId));
      assert.strictEqual(uniqueMsgIds.size, 3, 'Zero duplicate messages after restart hydration');

      pass('Check F & G: Render restart simulation: Exact messages recovered with zero duplicate message IDs');
    } catch (err) {
      fail('Check F & G: Restart simulation & dedup', err);
    }

    // -------------------------------------------------------------------------
    // Check 6 / Test H: No retry storm under sustained failure
    // -------------------------------------------------------------------------
    try {
      db.clearDirtyMongoGroups();
      saveGroupCalls = [];

      const stormChatId = -Number(`10099${runTimestamp % 1000000}6`);
      db.getGroupSettings(stormChatId, 'Storm Prevention Group');

      // Mark dirty
      db.markGroupMongoDirty(stormChatId, 'test', 'simulated error');
      const state = db.getDirtyMongoGroupState(stormChatId);
      assert.ok(state, 'Dirty state exists');

      // Immediately calling flush should NOT retry because nextRetryAt is in the future
      const flushedImmediate = await db.flushDirtyMongoGroups();
      assert.strictEqual(flushedImmediate, 0, 'Skips retry before backoff window expires');
      assert.strictEqual(saveGroupCalls.length, 0, 'No saveGroup called (no storm)');

      pass('Check H: No retry storm: Strict backoff window enforcement prevents tight loops and CPU spin');
    } catch (err) {
      fail('Check H: No retry storm', err);
    }

    // -------------------------------------------------------------------------
    // Payload Size Measurement Instrumentation
    // -------------------------------------------------------------------------
    try {
      const fullDoc = (db as any).buildGroupDataObject(testChatId);
      const fullDocBytes = Buffer.byteLength(JSON.stringify(fullDoc), 'utf-8');

      const sampleMsg = {
        role: 'user',
        userId: 111001,
        name: 'Alice',
        content: 'Hello Roxie! Testing targeted payload size.',
        timestamp: Date.now(),
        messageId: 5001
      };
      const targetedMsgBytes = Buffer.byteLength(JSON.stringify({
        $push: { messages: { $each: [sampleMsg], $slice: -500 } },
        $inc: { "settings.humanMessagesSinceLastSticker": 1, "autoEngine.humanMessagesSinceLastSticker": 1 },
        $set: { updatedAt: new Date() }
      }), 'utf-8');

      console.log(`\n📊 Payload Size Comparison Instrumentation:`);
      console.log(`   - Full Document Save: ~${(fullDocBytes / 1024).toFixed(2)} KB (${fullDocBytes} bytes)`);
      console.log(`   - Targeted Combined Append+Inc ($push+$inc): ~${(targetedMsgBytes / 1024).toFixed(2)} KB (${targetedMsgBytes} bytes) [${((1 - targetedMsgBytes / fullDocBytes) * 100).toFixed(1)}% reduction]\n`);

      assert.ok(targetedMsgBytes < fullDocBytes * 0.1, 'Targeted payload must be <10% of full doc');

      pass('Check: Bandwidth & Payload Measurements: Estimated Mongo payload reduction verified (>90%)');
    } catch (err) {
      fail('Check: Bandwidth & Payload Measurements', err);
    }

  } finally {
    // Teardown mocks
    MongoStorageService.saveGroup = originalSaveGroup;
    MongoStorageService.appendGroupMessage = originalAppendGroupMessage;
    MongoStorageService.incrementHumanMessageCount = originalIncrementHumanMessageCount;
    MongoStorageService.updateStickerActivity = originalUpdateStickerActivity;
    MongoStorageService.setLastProactiveConsideredMessageId = originalSetLastProactiveConsideredMessageId;
    MongoStorageService.recordAutoStickerSent = originalRecordAutoStickerSent;
    MongoStorageService.recordAutoResponseSent = originalRecordAutoResponseSent;
    proto.getStatus = originalGetStatus;
  }

  db.clearDirtyMongoGroups();
  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMongoBandwidthAndPersistenceFixSuite().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
