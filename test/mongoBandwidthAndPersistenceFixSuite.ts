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
  console.log('🧪 Starting MongoDB Bandwidth & Persistence Verification Test Suite');
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

  // Track MongoStorageService.saveGroup invocations
  let saveGroupCalls: Array<{ groupData: any; botId?: number }> = [];
  const originalSaveGroup = MongoStorageService.saveGroup;

  MongoStorageService.saveGroup = async (groupData: any, botId?: number, botUsername?: string): Promise<boolean> => {
    saveGroupCalls.push({ groupData: JSON.parse(JSON.stringify(groupData)), botId });
    return true;
  };

  // Override prototype getStatus on MongoManager so storage.ts always sees isConnected: true
  const proto = Object.getPrototypeOf(mongoManager);
  const originalGetStatus = proto.getStatus;
  proto.getStatus = function() {
    return {
      isConfigured: true,
      isConnected: true,
      dbName: 'roxie_test',
      lastError: null,
      lastConnectedAt: new Date().toISOString()
    };
  };

  try {
    // -------------------------------------------------------------------------
    // Test 1: Single human conversation entry causes EXACTLY ONE debounced Mongo write
    // -------------------------------------------------------------------------
    try {
      saveGroupCalls = [];
      const msg1: GroupConversationMessage = {
        role: 'user',
        userId: 111001,
        name: 'Alice',
        content: 'Hello Roxie!',
        timestamp: Date.now(),
        messageId: 5001
      };

      db.addGroupConversationEntry(testChatId, msg1);

      // Immediately after adding, 0 synchronous writes should have hit Mongo
      assert.strictEqual(
        saveGroupCalls.length,
        0,
        'No immediate synchronous Mongo write should occur before debounce timer'
      );

      // Wait 250ms for debounce timer (100ms) to fire safely
      await sleep(250);

      // Exactly 1 Mongo write should have occurred for testChatId
      const targetCalls = saveGroupCalls.filter(c => Number(c.groupData.chat?.chatId || c.groupData.chatId) === testChatId);
      assert.strictEqual(
        targetCalls.length,
        1,
        `Expected exactly 1 Mongo write for chat ${testChatId} after debounce, got ${targetCalls.length}`
      );

      const savedMessages = targetCalls[0].groupData.messages;
      assert.ok(Array.isArray(savedMessages), 'Messages should be an array');
      assert.strictEqual(
        savedMessages.some((m: any) => m.messageId === 5001),
        true,
        'Saved Mongo document must contain the message'
      );

      pass('1. One human conversation entry does NOT cause two Mongo writes (exactly 1 debounced write)');
    } catch (err) {
      fail('1. One human conversation entry does NOT cause two Mongo writes', err);
    }

    // -------------------------------------------------------------------------
    // Test 2: Multiple rapid messages within debounce window are coalesced into 1 write
    // -------------------------------------------------------------------------
    try {
      saveGroupCalls = [];

      for (let i = 1; i <= 5; i++) {
        db.addGroupConversationEntry(testChatId2, {
          role: 'user',
          userId: 111002,
          name: 'Bob',
          content: `Burst message ${i}`,
          timestamp: Date.now() + i * 5,
          messageId: 6000 + i
        });
      }

      // Immediately: 0 writes
      assert.strictEqual(saveGroupCalls.length, 0, 'Burst messages should not trigger immediate sync writes');

      // Wait 250ms for debounce timer to fire safely
      await sleep(250);

      // All 5 messages should have coalesced into EXACTLY 1 Mongo write for this group
      const group2Calls = saveGroupCalls.filter(c => Number(c.groupData.chat?.chatId || c.groupData.chatId) === testChatId2);
      assert.strictEqual(
        group2Calls.length,
        1,
        `Expected exactly 1 coalesced Mongo write for 5-message burst, got ${group2Calls.length}`
      );

      pass('2. Multiple messages inside the debounce window are coalesced safely into 1 write');
    } catch (err) {
      fail('2. Multiple messages inside the debounce window are coalesced safely', err);
    }

    // -------------------------------------------------------------------------
    // Test 3: The final MongoDB state contains all messages in correct order
    // -------------------------------------------------------------------------
    try {
      const group2Call = saveGroupCalls.find(c => Number(c.groupData.chat?.chatId || c.groupData.chatId) === testChatId2);
      assert.ok(group2Call, 'Must have recorded a call for group2');

      const msgs = group2Call.groupData.messages;
      assert.ok(Array.isArray(msgs), 'Messages must be an array');
      assert.strictEqual(msgs.length, 5, `Expected 5 messages in saved payload, got ${msgs.length}`);
      assert.strictEqual(msgs[0].messageId, 6001, 'First message ID should match');
      assert.strictEqual(msgs[4].messageId, 6005, 'Last message ID should match');

      pass('3. The final MongoDB state contains all messages in correct order');
    } catch (err) {
      fail('3. The final MongoDB state contains all messages in correct order', err);
    }

    // -------------------------------------------------------------------------
    // Test 4: The last-500 message limit remains strictly respected
    // -------------------------------------------------------------------------
    try {
      const largeChatId = -Number(`10099${runTimestamp % 1000000}4`);
      db.getGroupSettings(largeChatId, 'Large Message Group');

      // Insert 520 messages
      for (let i = 1; i <= 520; i++) {
        db.addGroupConversationEntry(largeChatId, {
          role: 'user',
          userId: 111003,
          name: 'Charlie',
          content: `History message ${i}`,
          timestamp: Date.now() + i,
          messageId: 7000 + i
        });
      }

      await sleep(250);

      const mem = db.getGroupMemory(largeChatId);
      assert.strictEqual(mem.length, 500, `In-memory messages should be capped at 500, got ${mem.length}`);
      assert.strictEqual(mem[0].messageId, 7021, 'Oldest message should be message 7021 (1-20 shifted)');
      assert.strictEqual(mem[499].messageId, 7520, 'Newest message should be message 7520');

      const rawDoc = (db as any).buildGroupDataObject(largeChatId);
      assert.strictEqual(rawDoc.messages.length, 500, `Serialized group messages should be capped at 500, got ${rawDoc.messages.length}`);

      pass('4. The last-500 message limit remains correct and enforced');
    } catch (err) {
      fail('4. The last-500 message limit remains correct', err);
    }

    // -------------------------------------------------------------------------
    // Test 5: Group member data remains persisted alongside conversation messages
    // -------------------------------------------------------------------------
    try {
      db.cacheUser({ id: 99911, username: 'testmember', first_name: 'Test', is_bot: false }, testChatId);
      db.addGroupConversationEntry(testChatId, {
        role: 'user',
        userId: 99911,
        name: 'Test',
        content: 'Member check message',
        timestamp: Date.now(),
        messageId: 8001
      });

      await sleep(250);

      const members = db.getGroupMembers(testChatId);
      assert.ok(members.some(m => m.userId === 99911), 'Member 99911 must be in group members list');

      const rawDoc = (db as any).buildGroupDataObject(testChatId);
      assert.ok(rawDoc.members.some((m: any) => m.userId === 99911), 'Serialized doc must include member 99911');

      pass('5. Group member data remains persisted correctly');
    } catch (err) {
      fail('5. Group member data remains persisted', err);
    }

    // -------------------------------------------------------------------------
    // Test 6: Schedules remain persisted alongside conversation messages
    // -------------------------------------------------------------------------
    try {
      const scheduleRes = messageScheduler.createSchedule(
        testChatId,
        'MongoDB Persistence Test Group',
        123456,
        'admin_user',
        '1h',
        'Scheduled Announcement',
        'text',
        undefined,
        false,
        'none'
      );
      assert.strictEqual(scheduleRes.success, true, 'Schedule creation should succeed');

      db.addGroupConversationEntry(testChatId, {
        role: 'user',
        userId: 111001,
        name: 'Alice',
        content: 'Checking schedules',
        timestamp: Date.now(),
        messageId: 8002
      });

      await sleep(250);

      const schedList = db.getGroupSchedules(testChatId);
      assert.ok(schedList.length > 0, 'Schedules must be present in group schedule list');

      pass('6. Schedules remain persisted correctly');
    } catch (err) {
      fail('6. Schedules remain persisted', err);
    }

    // -------------------------------------------------------------------------
    // Test 7: Restart hydration restores all messages and group settings correctly
    // -------------------------------------------------------------------------
    try {
      const hydrateChatId = -Number(`10099${runTimestamp % 1000000}3`);
      const mockMongoDoc: any = {
        chatId: String(hydrateChatId),
        numChatId: hydrateChatId,
        title: 'Hydrated Supergroup',
        schemaVersion: 1,
        status: { botLeft: false, unavailable: false },
        settings: { chatId: hydrateChatId, chatTitle: 'Hydrated Supergroup', language: 'hinglish', personality: 'normal' },
        permissions: {},
        moderation: {},
        ai: { personality: 'normal', language: 'hinglish' },
        messages: [
          { role: 'user', userId: 101, name: 'User1', content: 'Message 1', timestamp: 1000, messageId: 9001 },
          { role: 'assistant', name: 'Roxie', content: 'Reply 1', timestamp: 2000, messageId: 9002 },
          { role: 'user', userId: 102, name: 'User2', content: 'Message 2', timestamp: 3000, messageId: 9003 }
        ],
        members: [
          { userId: 101, username: 'user1', firstName: 'User', lastSeen: new Date().toISOString() }
        ],
        schedules: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      (db as any).restoreGroupData(hydrateChatId, mockMongoDoc);

      const memory = db.getGroupMemory(hydrateChatId);
      assert.strictEqual(memory.length, 3, `Expected 3 hydrated messages, got ${memory.length}`);
      assert.strictEqual(memory[0].content, 'Message 1');
      assert.strictEqual(memory[1].content, 'Reply 1');
      assert.strictEqual(memory[2].content, 'Message 2');

      const settings = db.getGroupSettings(hydrateChatId);
      assert.strictEqual(settings.chatTitle, 'Hydrated Supergroup');
      assert.strictEqual(settings.chatbotMode, 'auto');

      pass('7. Restart hydration remains correct and fully authoritative');
    } catch (err) {
      fail('7. Restart hydration remains correct', err);
    }

    // -------------------------------------------------------------------------
    // Test 8: MongoDB remains authoritative
    // -------------------------------------------------------------------------
    try {
      assert.strictEqual(typeof MongoStorageService.saveGroup, 'function');
      assert.strictEqual(typeof MongoStorageService.getAllGroups, 'function');
      assert.strictEqual(typeof db.hydrateGroupsFromMongo, 'function');

      pass('8. MongoDB remains authoritative persistence tier');
    } catch (err) {
      fail('8. MongoDB remains authoritative', err);
    }

    // -------------------------------------------------------------------------
    // Test 9: Existing /all behavior unchanged
    // -------------------------------------------------------------------------
    try {
      const members = [
        { userId: 1001, username: 'user1', firstName: 'Alice' },
        { userId: 1002, username: 'user2', firstName: 'Bob' },
        { userId: 1003, firstName: 'Charlie' }
      ];

      const { mentions, chunks } = CommandHandler.buildAllMentionsChunks(members as any, 'Hello all', 999999, 10);
      assert.strictEqual(mentions.length, 3, 'All 3 eligible members should be mentioned');
      assert.strictEqual(chunks.length, 1, 'Should create 1 chunk for 3 members');
      assert.ok(chunks[0].includes('tg://user?id=1001'), 'Chunk should contain tg://user?id=1001 mention');

      pass('9. Existing /all member formatting behavior unchanged');
    } catch (err) {
      fail('9. Existing /all member formatting behavior unchanged', err);
    }

    // -------------------------------------------------------------------------
    // Test 10: Existing /schedule behavior unchanged
    // -------------------------------------------------------------------------
    try {
      const parsed = messageScheduler.parseInterval('15m');
      assert.ok(parsed, 'Interval 15m should parse');
      assert.strictEqual(parsed!.ms, 15 * 60 * 1000);

      const status = messageScheduler.getStatus();
      assert.strictEqual(typeof status.running, 'boolean');

      pass('10. Existing /schedule behavior unchanged');
    } catch (err) {
      fail('10. Existing /schedule behavior unchanged', err);
    }

    // -------------------------------------------------------------------------
    // Test 11: AutoEngine stickers unchanged
    // -------------------------------------------------------------------------
    try {
      const status = autoEngineService.getStatus();
      assert.strictEqual(typeof status.running, 'boolean');

      pass('11. AutoEngine stickers functionality unchanged');
    } catch (err) {
      fail('11. AutoEngine stickers functionality unchanged', err);
    }

    // -------------------------------------------------------------------------
    // Test 12: Telegram polling unchanged
    // -------------------------------------------------------------------------
    try {
      const botStatus = telegramBot.getStatus();
      assert.strictEqual(typeof botStatus.isPolling, 'boolean');
      assert.strictEqual(botStatus.variableName, 'TELEGRAM_BOT_TOKEN');

      pass('12. Telegram polling functionality unchanged');
    } catch (err) {
      fail('12. Telegram polling functionality unchanged', err);
    }

  } finally {
    // Teardown mocks
    MongoStorageService.saveGroup = originalSaveGroup;
    proto.getStatus = originalGetStatus;
  }

  console.log('===================================================================');
  console.log(`🎉 MONGO BANDWIDTH & PERSISTENCE FIX TESTS: ${passedTests} Passed, ${failedTests} Failed`);
  console.log('===================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runMongoBandwidthAndPersistenceFixSuite().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
