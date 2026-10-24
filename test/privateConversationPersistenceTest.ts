import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StorageManager } from '../server/db/storage.js';

console.log('====================================================');
console.log('🧪 RUNNING PRIVATE CONVERSATION PERSISTENCE TESTS');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

async function test(desc: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`✅ [PASS] ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function runTestSuite() {
  const testTempDir = path.join(os.tmpdir(), `roxie_priv_persist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  const db = new StorageManager(testTempDir);
  db.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

  const userA = { chatId: 8881001, username: 'user_alice', name: 'Alice Walker' };
  const userB = { chatId: 8881002, username: 'user_bob', name: 'Bob Roberts' };
  const userC = { chatId: 8881003, username: 'user_charlie', name: 'Charlie Day' };

  try {
    // -------------------------------------------------------------------------
    // Test 1: A newly discovered private recipient is persisted
    // -------------------------------------------------------------------------
    await test('1. Newly discovered private recipient is persisted in storage and registries', async () => {
      // Simulate an incoming private DM Establishing a new conversation
      db.addPrivateMessage(userA.chatId, userA.chatId, {
        role: 'user',
        content: 'Hello Miss Roxie!',
        timestamp: Date.now() - 5000,
        username: userA.username,
        name: userA.name,
        language: 'en'
      });

      // Wait for debounce flush to disk
      await new Promise(r => setTimeout(r, 150));

      // Verify in Private Recipients registry
      const recipients = db.getPrivateRecipients();
      const recipientA = recipients.find(r => r.chatId === userA.chatId);
      assert(recipientA, 'Recipient Alice must be saved in privateRecipients');
      assert.strictEqual(recipientA.username, userA.username);
      assert.strictEqual(recipientA.status, 'active');
      assert(recipientA.firstSeenAt, 'firstSeenAt must be populated');
      assert(recipientA.lastSeenAt, 'lastSeenAt must be populated');

      // Verify in Private Chats list
      const chats = db.getPrivateChatsList();
      const chatA = chats.find(c => Number(c.chatId) === userA.chatId);
      assert(chatA, 'Alice must be in getPrivateChatsList()');
      assert.strictEqual(chatA.username, userA.username);
      assert.strictEqual(chatA.messageCount, 1);

      // Verify persisted on disk in private JSON file
      const privateFilePath = path.join(testTempDir, 'private', `${userA.chatId}.json`);
      assert(fs.existsSync(privateFilePath), `Private JSON file must exist at ${privateFilePath}`);
      const rawFile = JSON.parse(fs.readFileSync(privateFilePath, 'utf-8'));
      assert.strictEqual(rawFile.userId, userA.chatId);
      assert.strictEqual(rawFile.messages.length, 1);
    });

    // -------------------------------------------------------------------------
    // Test 2: A duplicate incoming message updates the recipient without creating duplicates
    // -------------------------------------------------------------------------
    await test('2. Duplicate incoming message updates existing recipient rather than creating duplicate', async () => {
      const initialCount = db.getPrivateRecipients().length;
      assert.strictEqual(initialCount, 1);

      // Send another message from Alice with an updated display name
      const updatedName = 'Alice Walker (Updated)';
      db.addPrivateMessage(userA.chatId, userA.chatId, {
        role: 'user',
        content: 'Second message from Alice',
        timestamp: Date.now(),
        username: userA.username,
        name: updatedName,
        language: 'en'
      });

      const recipients = db.getPrivateRecipients();
      const matchingRecipients = recipients.filter(r => r.chatId === userA.chatId);
      assert.strictEqual(matchingRecipients.length, 1, 'Exactly one recipient record must exist for Alice');
      assert.strictEqual(matchingRecipients[0].firstName, updatedName, 'Display name must be updated');

      const chats = db.getPrivateChatsList();
      const matchingChats = chats.filter(c => Number(c.chatId) === userA.chatId);
      assert.strictEqual(matchingChats.length, 1, 'Exactly one conversation record must exist for Alice');
      assert.strictEqual(matchingChats[0].messageCount, 2, 'Message count must be 2');
    });

    // -------------------------------------------------------------------------
    // Test 3: Restarting application and reloading recipients restores saved list
    // -------------------------------------------------------------------------
    await test('3. Restarting application and reloading recipients restores saved list', async () => {
      // Add Bob before restarting
      db.savePrivateRecipient({
        chatId: userB.chatId,
        username: userB.username,
        firstName: userB.name,
        source: 'welcome_dm',
        status: 'active'
      });
      await new Promise(r => setTimeout(r, 150));

      // Simulate application restart by creating a new StorageManager on the same directory
      const restartedDb = new StorageManager(testTempDir);
      restartedDb.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

      // Verify both Alice and Bob are loaded
      const reloadedRecipients = restartedDb.getPrivateRecipients();
      assert.strictEqual(reloadedRecipients.length, 2, 'Both recipients must be restored after restart');

      const reloadedAlice = reloadedRecipients.find(r => r.chatId === userA.chatId);
      assert(reloadedAlice, 'Alice must be restored');
      assert.strictEqual(reloadedAlice.username, userA.username);

      const reloadedBob = reloadedRecipients.find(r => r.chatId === userB.chatId);
      assert(reloadedBob, 'Bob must be restored');
      assert.strictEqual(reloadedBob.username, userB.username);

      const reloadedChats = restartedDb.getPrivateChatsList();
      assert.strictEqual(reloadedChats.length, 2, 'Both chats must be present after restart');

      const aliceMessages = restartedDb.getPrivateChatMessages(userA.chatId);
      assert.strictEqual(aliceMessages.length, 2, 'Alice message history must be fully preserved across restart');
    });

    // -------------------------------------------------------------------------
    // Test 4: An empty frontend or in-memory list cannot erase saved recipients
    // -------------------------------------------------------------------------
    await test('4. Empty frontend or in-memory list cannot erase saved recipients', async () => {
      // Ensure that getPrivateRecipients or filter queries with empty results do not mutate storage
      const emptySearch = db.getPrivateRecipients({ search: 'nonexistent_user_xyz' });
      assert.strictEqual(emptySearch.length, 0);

      // The actual registry must remain intact
      const fullList = db.getPrivateRecipients();
      assert.strictEqual(fullList.length, 2, 'All 2 recipients must remain intact');

      // If an update or empty sync occurs, ensure existing keys are not wiped
      db.savePrivateRecipient({
        chatId: userA.chatId,
        username: userA.username
      });
      const verifiedList = db.getPrivateRecipients();
      assert.strictEqual(verifiedList.length, 2, 'Recipient count must still be 2');
    });

    // -------------------------------------------------------------------------
    // Test 5: Database read/write failures do not silently erase or hide previously saved recipients
    // -------------------------------------------------------------------------
    await test('5. Database read/write failures do not silently erase previously saved recipients', async () => {
      // Simulate file corruption or read error on an individual file
      const corruptFile = path.join(testTempDir, 'private', 'corrupt_test.json');
      fs.writeFileSync(corruptFile, '{ invalid json content !!!', 'utf-8');

      // Loading should safely bypass or recover corrupted files without crashing or wiping existing data
      const loadResult = db.loadAllPrivateJsons();
      assert(loadResult.errorsCount >= 1, 'Should safely record corrupt file error');

      // Existing recipients must remain intact
      const recipients = db.getPrivateRecipients();
      assert(recipients.length >= 2, 'Recipients must remain intact after corrupt file error');

      // Clean up the corrupt test file
      if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
    });

    // -------------------------------------------------------------------------
    // Test 6: Existing private-chat history and recipient-selection behavior still work
    // -------------------------------------------------------------------------
    await test('6. Existing private-chat history and recipient-selection behavior still work', async () => {
      // Bot sends a reply to Alice
      db.addPrivateMessage(userA.chatId, userA.chatId, {
        role: 'assistant',
        content: 'Here is your requested information.',
        timestamp: Date.now() + 100,
        direction: 'out'
      });

      const aliceMessages = db.getPrivateChatMessages(userA.chatId);
      assert.strictEqual(aliceMessages.length, 3, 'Must have 3 messages in Alice conversation');
      assert.strictEqual(aliceMessages[2].role, 'assistant');
      assert.strictEqual(aliceMessages[2].direction, 'out');
      assert.strictEqual(aliceMessages[2].content, 'Here is your requested information.');

      // Check recipient selection query
      const singleRecipient = db.getPrivateRecipient(userA.chatId);
      assert(singleRecipient, 'Direct recipient lookup must succeed');
      assert.strictEqual(singleRecipient.chatId, userA.chatId);
    });

    // -------------------------------------------------------------------------
    // Test 7: Existing recipient records remain intact when new recipients are added
    // -------------------------------------------------------------------------
    await test('7. Existing recipient records remain intact when new recipients are added', async () => {
      // Add Charlie
      db.addPrivateMessage(userC.chatId, userC.chatId, {
        role: 'user',
        content: 'Hi from Charlie',
        timestamp: Date.now(),
        username: userC.username,
        name: userC.name
      });

      const recipients = db.getPrivateRecipients();
      assert.strictEqual(recipients.length, 3, 'Should now have 3 recipients');

      // Verify Alice and Bob are unmodified
      const alice = db.getPrivateRecipient(userA.chatId);
      const bob = db.getPrivateRecipient(userB.chatId);
      const charlie = db.getPrivateRecipient(userC.chatId);

      assert(alice && alice.username === userA.username, 'Alice must be intact');
      assert(bob && bob.username === userB.username, 'Bob must be intact');
      assert(charlie && charlie.username === userC.username, 'Charlie must be intact');
    });

  } finally {
    // Clean up temporary test directory
    try {
      fs.rmSync(testTempDir, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n----------------------------------------------------');
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('----------------------------------------------------');
  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
