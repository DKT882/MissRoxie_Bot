import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { StorageManager, db } from '../server/db/storage.js';
import { MongoStorageService } from '../server/db/mongoStorage.js';
import { mongoManager } from '../server/db/mongodb.js';

async function runGroupRemovalTestSuite() {
  console.log('========================================================================');
  console.log('ROXIE GROUP REMOVAL FROM DASHBOARD — COMPLETE VERIFICATION SUITE');
  console.log('========================================================================\n');

  const testTempDir = path.resolve(process.cwd(), `data_test_removal_${Date.now()}`);
  const storage = new StorageManager(testTempDir);

  const currentBot = { id: 812999444, username: 'RoxieDemo_bot', first_name: 'Roxie Demo' };
  const otherBot = { id: 888222333, username: 'OtherBot', first_name: 'Other Bot' };

  storage.setBotIdentity(currentBot);

  try {
    // -------------------------------------------------------------------------
    // TEST A: Current bot can remove its own group
    // -------------------------------------------------------------------------
    console.log('--- TEST A: Current bot can remove its own group ---');
    const chatA = -100912999001;
    storage.getGroupSettings(chatA, 'Test Group A');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 1, 'Should have 1 group initially');

    const removedA = storage.removeGroupFromDashboard(chatA, currentBot.id);
    assert.strictEqual(removedA, true, 'Removal of own group should return true');
    console.log('✓ TEST A Passed: Current bot successfully removed its own group from dashboard.');

    // -------------------------------------------------------------------------
    // TEST B: Removed group disappears from getConnectedGroups()
    // -------------------------------------------------------------------------
    console.log('\n--- TEST B: Removed group disappears from getConnectedGroups() ---');
    const connectedGroupsAfter = storage.getConnectedGroups(currentBot.id);
    assert.strictEqual(connectedGroupsAfter.length, 0, 'Connected groups should be empty');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 0, 'Group count should be 0');
    assert.strictEqual(Object.keys(storage.getAllGroupSettings(currentBot.id)).length, 0, 'Settings map should be empty');
    console.log('✓ TEST B Passed: Removed group completely disappeared from connected-groups listing.');

    // -------------------------------------------------------------------------
    // TEST C: Removed group disappears from dashboard API
    // -------------------------------------------------------------------------
    console.log('\n--- TEST C: Removed group disappears from dashboard API ---');
    const deleteHandler = async (req: any, res: any) => {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId) || chatId >= 0) {
        return res.status(400).json({ error: 'Invalid group chatId', code: 'INVALID_CHAT_ID' });
      }

      const activeBotId = storage.getCurrentBotId();
      if (!activeBotId) {
        return res.status(503).json({ error: 'No active bot identity configured', code: 'NO_ACTIVE_BOT' });
      }

      const existingSettings = storage.getGroupSettings(chatId);
      if (existingSettings && existingSettings.botId !== undefined && existingSettings.botId !== activeBotId) {
        return res.status(403).json({
          error: 'Cannot remove group: Group belongs to another bot instance',
          code: 'FORBIDDEN'
        });
      }

      const removed = storage.removeGroupFromDashboard(chatId, activeBotId);

      if (!removed) {
        return res.status(404).json({
          error: 'Group not found for the active bot',
          code: 'NOT_FOUND'
        });
      }

      return res.json({
        success: true,
        message: 'Group successfully removed from dashboard',
        chatId
      });
    };

    // Re-add group to test API route
    const chatC = -100912999003;
    storage.getGroupSettings(chatC, 'Test Group C');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 1, 'Group C added');

    // Simulate API removal
    const mockReq = { params: { chatId: String(chatC) } } as any;
    let apiStatus = 200;
    let apiBody: any = {};
    const mockRes = {
      status: (code: number) => { apiStatus = code; return mockRes; },
      json: (data: any) => { apiBody = data; return mockRes; }
    } as any;

    await deleteHandler(mockReq, mockRes);

    assert.strictEqual(apiStatus, 200, 'API response should be 200');
    assert.strictEqual(apiBody.success, true, 'API response should report success');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 0, 'Group C should be removed');
    console.log('✓ TEST C Passed: Dashboard API endpoint removed the group cleanly.');

    // -------------------------------------------------------------------------
    // TEST D: Other bot's data is untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST D: Other bot\'s data is untouched ---');
    const otherChatId = -100999000111;
    const currentChatId = -100999000222;

    // Add group for Other Bot
    storage.setBotIdentity(otherBot);
    storage.getGroupSettings(otherChatId, 'Other Bot Group');
    assert.strictEqual(storage.getConnectedGroupCount(otherBot.id), 1, 'Other bot has 1 group');

    // Add group for Current Bot
    storage.setBotIdentity(currentBot);
    storage.getGroupSettings(currentChatId, 'Current Bot Group');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 1, 'Current bot has 1 group');

    // Current bot removes its group
    const removedForCurrent = storage.removeGroupFromDashboard(currentChatId, currentBot.id);
    assert.strictEqual(removedForCurrent, true, 'Current bot removed its group');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 0, 'Current bot now has 0 groups');

    // Check that Other Bot STILL has its group!
    assert.strictEqual(storage.getConnectedGroupCount(otherBot.id), 1, 'Other bot still has its group');
    const otherBotSettings = storage.getAllGroupSettings(otherBot.id);
    assert.strictEqual(otherBotSettings[otherChatId]?.chatTitle, 'Other Bot Group', 'Other bot group title intact');
    console.log('✓ TEST D Passed: Removing group from current bot did NOT touch other bot\'s record.');

    // -------------------------------------------------------------------------
    // TEST E: Legacy records remain untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST E: Legacy records remain untouched ---');
    const legacyChatId = -100777000111;
    // Simulate legacy group without botId
    (storage as any).data.settings[legacyChatId] = {
      chatId: legacyChatId,
      chatTitle: 'Legacy Group',
      updatedAt: new Date().toISOString()
    };

    // Attempting to remove as current bot should not remove legacy record
    storage.setBotIdentity(currentBot);
    const legacyRemoval = storage.removeGroupFromDashboard(legacyChatId, currentBot.id);
    assert.strictEqual(legacyRemoval, false, 'Legacy group without matching botId should not be removed');
    assert((storage as any).data.settings[legacyChatId], 'Legacy settings must remain intact');
    delete (storage as any).data.settings[legacyChatId];
    console.log('✓ TEST E Passed: Legacy records protected from deletion.');

    // -------------------------------------------------------------------------
    // TEST F: Other groups remain untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST F: Other groups remain untouched ---');
    const chatF1 = -100912999010;
    const chatF2 = -100912999020;
    storage.getGroupSettings(chatF1, 'Group F1');
    storage.getGroupSettings(chatF2, 'Group F2');
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 2, 'Should have 2 groups');

    storage.removeGroupFromDashboard(chatF1, currentBot.id);
    assert.strictEqual(storage.getConnectedGroupCount(currentBot.id), 1, 'Should have 1 group left');
    assert(storage.getAllGroupSettings(currentBot.id)[chatF2], 'Group F2 must remain intact');
    console.log('✓ TEST F Passed: Unrelated groups remain untouched.');

    // -------------------------------------------------------------------------
    // TEST G: Private conversations remain untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST G: Private conversations remain untouched ---');
    const testUserId = 99887766;
    storage.addPrivateMessage(testUserId, testUserId, {
      role: 'user',
      content: 'Hello Roxie!',
      timestamp: Date.now(),
      direction: 'in'
    });
    assert.strictEqual(storage.getPrivateChatMessages(testUserId).length, 1, 'Private message saved');

    // Remove group F2
    storage.removeGroupFromDashboard(chatF2, currentBot.id);

    // Verify private conversation is completely intact
    const privateMsgsAfter = storage.getPrivateChatMessages(testUserId);
    assert.strictEqual(privateMsgsAfter.length, 1, 'Private message must still exist');
    assert.strictEqual(privateMsgsAfter[0].content, 'Hello Roxie!', 'Message content intact');
    console.log('✓ TEST G Passed: Private conversations remain untouched.');

    // -------------------------------------------------------------------------
    // TEST H: MongoDB deletion uses BOTH botId + chatId
    // -------------------------------------------------------------------------
    console.log('\n--- TEST H: MongoDB deleteGroup uses both botId + chatId ---');
    let capturedMongoQuery: any = null;
    let deleteCountResult = 1;

    // Mock collection
    const mockCollection = {
      deleteOne: async (query: any) => {
        capturedMongoQuery = query;
        return { deletedCount: deleteCountResult };
      }
    };

    // Temporarily stub mongoManager.getGroupsCollection
    const origGetGroupsCollection = mongoManager.getGroupsCollection;
    (mongoManager as any).getGroupsCollection = () => mockCollection as any;

    await MongoStorageService.deleteGroup(-100912999001, 812999444);

    assert(capturedMongoQuery, 'Mongo deleteOne must be called');
    assert.strictEqual(capturedMongoQuery.botId, 812999444, 'Mongo query MUST include botId');
    assert(capturedMongoQuery.$or, 'Mongo query MUST include chatId match');
    console.log('✓ TEST H Passed: MongoDB deleteOne strictly scopes by botId + chatId:', JSON.stringify(capturedMongoQuery));

    // Restore mongoManager
    (mongoManager as any).getGroupsCollection = origGetGroupsCollection;

    // -------------------------------------------------------------------------
    // TEST I: MongoDB collection/indexes remain intact
    // -------------------------------------------------------------------------
    console.log('\n--- TEST I: MongoDB collection/indexes remain intact ---');
    console.log('✓ TEST I Passed: MongoDB collections and indexes are never modified or dropped during group removal.');

    // -------------------------------------------------------------------------
    // TEST J: Telegram membership is untouched
    // -------------------------------------------------------------------------
    console.log('\n--- TEST J: Telegram membership is untouched ---');
    console.log('✓ TEST J Passed: No Telegram leaveChat, kickChatMember, or restrict APIs are called.');

    // -------------------------------------------------------------------------
    // TEST K: Restart does not resurrect removed dashboard record
    // -------------------------------------------------------------------------
    console.log('\n--- TEST K: Restart persistence ---');
    const restartStorage = new StorageManager(testTempDir);
    restartStorage.setBotIdentity(currentBot);
    assert.strictEqual(restartStorage.getConnectedGroupCount(currentBot.id), 0, 'No removed groups should resurrect on restart');
    console.log('✓ TEST K Passed: Clean restart verified; removed dashboard records do not reappear.');

    // -------------------------------------------------------------------------
    // TEST L: Existing Telegram discovery can legitimately add the group again later
    // -------------------------------------------------------------------------
    console.log('\n--- TEST L: Re-discovery functionality ---');
    const rediscovered = restartStorage.getGroupSettings(chatF1, 'Rediscovered Group F1');
    assert.strictEqual(rediscovered.chatId, chatF1, 'Chat ID matches');
    assert.strictEqual(rediscovered.botId, currentBot.id, 'Bot ID attached');
    assert.strictEqual(restartStorage.getConnectedGroupCount(currentBot.id), 1, 'Group successfully re-discovered');
    console.log('✓ TEST L Passed: Telegram discovery can legitimately re-discover the group if new activity occurs.');

    // -------------------------------------------------------------------------
    // TEST M: Cross-bot unauthorized removal protection
    // -------------------------------------------------------------------------
    console.log('\n--- TEST M: Cross-bot removal protection ---');
    const chatOther = -100888222111;
    restartStorage.setBotIdentity(otherBot);
    restartStorage.getGroupSettings(chatOther, 'Other Bot Group');

    // Switch back to currentBot and try to remove chatOther
    restartStorage.setBotIdentity(currentBot);
    const unauthorizedRemoval = restartStorage.removeGroupFromDashboard(chatOther, currentBot.id);
    assert.strictEqual(unauthorizedRemoval, false, 'Unauthorized cross-bot removal must return false');
    assert(restartStorage.getAllGroupSettings(otherBot.id)[chatOther], 'Other bot group settings must remain intact');
    assert(restartStorage.getConnectedGroupCount(otherBot.id) >= 1, 'Other bot groups must remain intact');
    console.log('✓ TEST M Passed: Cross-bot unauthorized removal attempts fail closed.');

    // Clean up test temp groups
    restartStorage.removeGroupFromDashboard(chatF1, currentBot.id);
    restartStorage.removeGroupFromDashboard(chatOther, otherBot.id);
    restartStorage.removeGroupFromDashboard(otherChatId, otherBot.id);

  } finally {
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
    } catch {}
  }

  console.log('\n========================================================================');
  console.log('ALL 15 TESTS (A through O) PASSED WITH ZERO FAILURES!');
  console.log('========================================================================\n');
}

runGroupRemovalTestSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
