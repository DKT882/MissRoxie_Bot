import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StorageManager } from '../server/db/storage.js';

console.log('====================================================');
console.log('🧪 RUNNING DM RECIPIENTS & CONVERSATIONS SYNC TEST');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`✅ [PASS] ${desc}`);
        passed++;
      }).catch((err: any) => {
        console.error(`❌ [FAIL] ${desc}: ${err.message}`);
        failed++;
      });
    } else {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  const testTempDir = path.join(os.tmpdir(), `roxie_dm_sync_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  const db = new StorageManager(testTempDir);
  db.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

  const testChatId1 = 99881001;
  const testChatId2 = 99881002;
  const testChatId3 = 99881003;
  const testChatId4 = 99881004;
  const testChatId5 = 99881005;

  try {
    // -------------------------------------------------------------------------
    // Test 1: A recipient saved in DM Recipients appears in Conversations without any message history
    // -------------------------------------------------------------------------
    await it('1. A recipient saved in DM Recipients appears in Conversations without any message history', () => {
      const saved = db.savePrivateRecipient({
        chatId: testChatId1,
        username: 'sync_user_zero_msg',
        firstName: 'Zero Messages User',
        displayName: 'Zero Messages User',
        source: 'welcome_dm',
        status: 'active'
      });
      assert(saved, 'Recipient must be saved in registry');

      const conversations = db.getPrivateChatsList();
      const found = conversations.find(c => Number(c.chatId) === testChatId1);
      assert(found, 'Recipient must appear in Conversations contact list');
      assert.strictEqual(found.messageCount, 0, 'Message count must be exactly 0');
      assert.strictEqual(found.lastMessage, '', 'lastMessage must be empty string');
      assert.strictEqual(found.name, 'Zero Messages User');
      assert.strictEqual(found.username, 'sync_user_zero_msg');

      const messages = db.getPrivateChatMessages(testChatId1);
      assert.strictEqual(messages.length, 0, 'Conversation messages array must be empty');
    });

    // -------------------------------------------------------------------------
    // Test 2: An existing conversation appears once, not twice, after merging with the recipient registry
    // -------------------------------------------------------------------------
    await it('2. An existing conversation appears once, not twice, after merging with the recipient registry', () => {
      const conversations = db.getPrivateChatsList();
      const duplicates = conversations.filter(c => Number(c.chatId) === testChatId1);
      assert.strictEqual(duplicates.length, 1, 'Exactly one entry must exist for testChatId1 (no duplicates)');
    });

    // -------------------------------------------------------------------------
    // Test 3: A recipient with message history retains all existing messages
    // -------------------------------------------------------------------------
    await it('3. A recipient with message history retains all existing messages', () => {
      db.addPrivateMessage(testChatId2, testChatId2, {
        role: 'user',
        content: 'Hello Roxie, test message 1',
        timestamp: Date.now() - 1000,
        username: 'user_with_history',
        name: 'History User'
      });

      db.addPrivateMessage(testChatId2, testChatId2, {
        role: 'assistant',
        content: 'Hi there! Glad to assist you.',
        timestamp: Date.now(),
        direction: 'out'
      });

      const conversations = db.getPrivateChatsList();
      const contact = conversations.find(c => Number(c.chatId) === testChatId2);
      assert(contact, 'Contact with messages must appear in list');
      assert.strictEqual(contact.messageCount, 2, 'Message count must be 2');
      assert.strictEqual(contact.lastMessage, 'Hi there! Glad to assist you.');

      const messages = db.getPrivateChatMessages(testChatId2);
      assert.strictEqual(messages.length, 2, 'Both messages must be returned');
      assert.strictEqual(messages[0].content, 'Hello Roxie, test message 1');
      assert.strictEqual(messages[1].content, 'Hi there! Glad to assist you.');
    });

    // -------------------------------------------------------------------------
    // Test 4: A recipient whose username changes remains the same contact by numeric Telegram ID
    // -------------------------------------------------------------------------
    await it('4. A recipient whose username changes remains the same contact by numeric Telegram ID', () => {
      db.savePrivateRecipient({
        chatId: testChatId2,
        username: 'user_history_renamed_2026',
        displayName: 'History User Updated'
      });

      const conversations = db.getPrivateChatsList();
      const matches = conversations.filter(c => Number(c.chatId) === testChatId2);
      assert.strictEqual(matches.length, 1, 'Contact must not duplicate when username changes');
      assert.strictEqual(matches[0].username, 'user_history_renamed_2026', 'Username must reflect updated handle');
      assert.strictEqual(matches[0].name, 'History User Updated', 'Display name must reflect update');
      assert.strictEqual(matches[0].messageCount, 2, 'Existing messages must remain completely intact');
    });

    // -------------------------------------------------------------------------
    // Test 5: A recipient remains visible after storage reload and application restart
    // -------------------------------------------------------------------------
    await it('5. A recipient remains visible after storage reload and application restart', () => {
      db.savePrivateRecipient({
        chatId: testChatId3,
        username: 'persisted_sync_user',
        firstName: 'Persistent Tester',
        displayName: 'Persistent Tester'
      });

      // Verify recipient was recorded
      const recipientBefore = db.getPrivateRecipient(testChatId3);
      assert(recipientBefore, 'Recipient must exist in database before reload');

      // Simulate startup hydration & reverse synchronization via new storage instance pointing to same dir
      const reloadedDb = new StorageManager(testTempDir);
      reloadedDb.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot' });

      const conversationsAfter = reloadedDb.getPrivateChatsList();
      const foundAfter = conversationsAfter.find(c => Number(c.chatId) === testChatId3);
      assert(foundAfter, 'Recipient must remain visible in Conversations after reload');
      assert.strictEqual(foundAfter.username, 'persisted_sync_user');
    });

    // -------------------------------------------------------------------------
    // Test 6: A newly registered private user appears in both tabs
    // -------------------------------------------------------------------------
    await it('6. A newly registered private user appears in both tabs', () => {
      db.addPrivateMessage(testChatId4, testChatId4, {
        role: 'user',
        content: 'Hey, just started using Roxie bot',
        username: 'brand_new_interactor',
        name: 'Brand New User'
      });

      // Tab 1 (Conversations):
      const convList = db.getPrivateChatsList();
      const inConv = convList.find(c => Number(c.chatId) === testChatId4);
      assert(inConv, 'User must appear in Conversations tab');
      assert.strictEqual(inConv.username, 'brand_new_interactor');

      // Tab 2 (DM Recipients):
      const recipientsList = db.getPrivateRecipients();
      const inRecipients = recipientsList.find(r => r.chatId === testChatId4);
      assert(inRecipients, 'User must automatically appear in DM Recipients tab');
      assert.strictEqual(inRecipients.source, 'private_interaction');
    });

    // -------------------------------------------------------------------------
    // Test 7: Selecting a recipient without history opens an empty conversation and allows the existing individual-message workflow to be used
    // -------------------------------------------------------------------------
    await it('7. Selecting a recipient without history opens empty conversation and allows individual message', () => {
      // Zero-message recipient from Test 1
      const beforeMessages = db.getPrivateChatMessages(testChatId1);
      assert.strictEqual(beforeMessages.length, 0, 'Initially 0 messages');

      // Simulate sending personalized reply from dashboard
      db.addPrivateMessage(testChatId1, testChatId1, {
        role: 'assistant',
        content: 'Welcome! Here is your personalized introductory guide.',
        direction: 'out'
      });

      const afterMessages = db.getPrivateChatMessages(testChatId1);
      assert.strictEqual(afterMessages.length, 1, 'Delivered message must be stored in conversation');
      assert.strictEqual(afterMessages[0].content, 'Welcome! Here is your personalized introductory guide.');

      const updatedContact = db.getPrivateChatsList().find(c => Number(c.chatId) === testChatId1);
      assert(updatedContact, 'Contact must exist in updated conversation list');
      assert.strictEqual(updatedContact.messageCount, 1);
      assert.strictEqual(updatedContact.lastMessage, 'Welcome! Here is your personalized introductory guide.');
      // Check that recipient registry was updated
      const reg = db.getPrivateRecipient(testChatId1);
      assert(reg, 'Recipient record must exist in registry');
    });

    // -------------------------------------------------------------------------
    // Test 8: Opt-out/block status remains intact and is not bypassed
    // -------------------------------------------------------------------------
    await it('8. Opt-out/block status remains intact and is not bypassed', () => {
      db.savePrivateRecipient({
        chatId: testChatId5,
        username: 'opted_out_user',
        firstName: 'Opted Out User',
        status: 'active'
      });

      // Mark opted out
      const okOptOut = db.updatePrivateRecipientStatus(testChatId5, 'opted_out');
      assert(okOptOut, 'Status update to opted_out must succeed');

      const convList = db.getPrivateChatsList();
      const contact = convList.find(c => Number(c.chatId) === testChatId5);
      assert(contact, 'Opted out user must still appear in Conversations list');
      assert.strictEqual(contact.status, 'opted_out', 'Conversations contact must show opted_out status');

      // Verify active filter for broadcast excludes this user
      const activeRecipients = db.getPrivateRecipients({ status: 'active' });
      assert(!activeRecipients.some(r => r.chatId === testChatId5), 'Opted out recipient must NOT be in active list');

      // Mark blocked
      const okBlocked = db.updatePrivateRecipientStatus(testChatId5, 'blocked', 'Forbidden: bot was blocked by the user');
      assert(okBlocked, 'Status update to blocked must succeed');

      const contactBlocked = db.getPrivateChatsList().find(c => Number(c.chatId) === testChatId5);
      assert.strictEqual(contactBlocked?.status, 'blocked', 'Conversations contact must show blocked status');
    });

    // -------------------------------------------------------------------------
    // Test 9: Existing search and contact selection work with both historical conversations and recipient-only contacts
    // -------------------------------------------------------------------------
    await it('9. Existing search and contact selection work with both historical and recipient-only contacts', () => {
      const all = db.getPrivateChatsList();

      // Search by display name
      const searchByName = all.filter(c => c.name?.toLowerCase().includes('zero messages'));
      assert(searchByName.some(c => Number(c.chatId) === testChatId1), 'Search by name must find 0-message contact');

      // Search by username
      const searchByUsername = all.filter(c => c.username?.toLowerCase().includes('user_history_renamed'));
      assert(searchByUsername.some(c => Number(c.chatId) === testChatId2), 'Search by username must find historical contact');

      // Search by numeric Telegram ID
      const searchById = all.filter(c => String(c.chatId).includes(String(testChatId5)));
      assert.strictEqual(searchById.length, 1, 'Search by numeric ID must find exact contact');
    });

    // -------------------------------------------------------------------------
    // Test 10: Existing recipient and conversation data is not deleted or overwritten during synchronization
    // -------------------------------------------------------------------------
    await it('10. Existing recipient and conversation data is not deleted or overwritten during synchronization', () => {
      // Run cleanupInactivePrivateConversations
      const cleaned = db.cleanupInactivePrivateConversations();
      assert(typeof cleaned === 'number', 'Cleanup returns cleaned count');

      // Confirm all 5 test users remain intact in recipient registry
      assert(db.getPrivateRecipient(testChatId1), 'testChatId1 must still exist');
      assert(db.getPrivateRecipient(testChatId2), 'testChatId2 must still exist');
      assert(db.getPrivateRecipient(testChatId3), 'testChatId3 must still exist');
      assert(db.getPrivateRecipient(testChatId4), 'testChatId4 must still exist');
      assert(db.getPrivateRecipient(testChatId5), 'testChatId5 must still exist');

      // Confirm conversations still exist in list
      const finalList = db.getPrivateChatsList();
      assert(finalList.some(c => Number(c.chatId) === testChatId1), 'testChatId1 must still be in conversations');
      assert(finalList.some(c => Number(c.chatId) === testChatId2), 'testChatId2 must still be in conversations');
      assert(finalList.some(c => Number(c.chatId) === testChatId3), 'testChatId3 must still be in conversations');
      assert(finalList.some(c => Number(c.chatId) === testChatId4), 'testChatId4 must still be in conversations');
      assert(finalList.some(c => Number(c.chatId) === testChatId5), 'testChatId5 must still be in conversations');

      // Confirm messages for testChatId2 were not overwritten or cleared
      const historyMsgs = db.getPrivateChatMessages(testChatId2);
      assert.strictEqual(historyMsgs.length, 2, 'Message history for testChatId2 must not be overwritten');
    });
  } finally {
    // Clean up temporary storage directory
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests().then(() => {
  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch((err) => {
  console.error('Test run error:', err);
  process.exit(1);
});
