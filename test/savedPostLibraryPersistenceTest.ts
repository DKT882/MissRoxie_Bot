import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { StorageManager } from '../server/db/storage.js';

console.log('====================================================');
console.log('🧪 RUNNING SAVED POST LIBRARY PERSISTENCE TESTS');
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
  const testTempDir = path.join(os.tmpdir(), `roxie_post_persist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(testTempDir, { recursive: true });

  const db = new StorageManager(testTempDir);
  db.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

  let post1Id = '';
  let post2Id = '';

  try {
    // -------------------------------------------------------------------------
    // Test 1: Creating a saved post persists it
    // -------------------------------------------------------------------------
    await test('1. Creating a saved post persists it to storage and registries', async () => {
      const created = await db.saveSavedPostAsync({
        title: 'VIP Community Announcement',
        contentType: 'photo',
        text: 'Join our exclusive VIP group with special perks!',
        mediaFileId: 'AgACAgIAAxkBAAIC123456789',
        buttons: [
          [{ text: 'Join VIP', url: 'https://t.me/vip_channel' }],
          [{ text: 'Support', url: 'https://t.me/support_bot' }]
        ],
        protectContent: true,
        pinAfterSend: true,
        replyToLatest: false,
        createdBy: { userId: 1001, username: 'admin_sarah', role: 'ADMIN' },
        tags: ['vip', 'announcement']
      });

      assert(created, 'Saved post must be created');
      assert(created.id.startsWith('POST-'), `Post ID must follow POST-XXXXX format, got ${created.id}`);
      post1Id = created.id;

      // Verify retrieval from in-memory getter
      const fetched = db.getSavedPost(post1Id);
      assert(fetched, 'Post must be retrievable via getSavedPost');
      assert.strictEqual(fetched.title, 'VIP Community Announcement');
      assert.strictEqual(fetched.contentType, 'photo');
      assert.strictEqual(fetched.text, 'Join our exclusive VIP group with special perks!');
      assert.strictEqual(fetched.protectContent, true);
      assert.strictEqual(fetched.pinAfterSend, true);
      assert.strictEqual(fetched.buttons?.length, 2);

      // Verify written to disk in global.json and bot_storage.json
      const globalFile = path.join(testTempDir, 'global.json');
      assert(fs.existsSync(globalFile), 'global.json must exist');
      const globalData = JSON.parse(fs.readFileSync(globalFile, 'utf-8'));
      assert(globalData.savedPosts && globalData.savedPosts[post1Id], 'Post must be in global.json');

      const botStorageFile = path.join(testTempDir, 'bot_storage.json');
      assert(fs.existsSync(botStorageFile), 'bot_storage.json must exist');
      const botStorageData = JSON.parse(fs.readFileSync(botStorageFile, 'utf-8'));
      assert(botStorageData.savedPosts && botStorageData.savedPosts[post1Id], 'Post must be in bot_storage.json');
    });

    // -------------------------------------------------------------------------
    // Test 2: Listing saved posts after application restart restores existing records
    // -------------------------------------------------------------------------
    await test('2. Listing saved posts after application restart restores existing records', async () => {
      // Create a second post before simulating restart
      const post2 = await db.saveSavedPostAsync({
        title: 'Weekly Rules Reminder',
        contentType: 'text',
        text: 'Please review our group rules: No spam, no NSFW.',
        protectContent: false,
        pinAfterSend: false,
        tags: ['rules']
      });
      post2Id = post2.id;

      // Simulate cold server restart by instantiating new StorageManager on the same directory
      const restartedDb = new StorageManager(testTempDir);
      restartedDb.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

      // Verify both posts are restored into memory
      assert.strictEqual(restartedDb.countSavedPosts(), 2, 'Must have exactly 2 posts restored after restart');
      const allPosts = restartedDb.getSavedPosts();
      assert.strictEqual(allPosts.length, 2, 'getSavedPosts() must return 2 posts');

      const restored1 = restartedDb.getSavedPost(post1Id);
      assert(restored1, 'Post 1 must be restored');
      assert.strictEqual(restored1.title, 'VIP Community Announcement');
      assert.strictEqual(restored1.contentType, 'photo');
      assert.strictEqual(restored1.buttons?.length, 2);
      assert.strictEqual(restored1.protectContent, true);

      const restored2 = restartedDb.getSavedPost(post2Id);
      assert(restored2, 'Post 2 must be restored');
      assert.strictEqual(restored2.title, 'Weekly Rules Reminder');
      assert.strictEqual(restored2.contentType, 'text');
    });

    // -------------------------------------------------------------------------
    // Test 3: Editing a post updates the same record
    // -------------------------------------------------------------------------
    await test('3. Editing a post updates the same record without creating duplicates', async () => {
      const initialCount = db.getSavedPosts().length;
      const original = db.getSavedPost(post1Id);
      assert(original, 'Original post must exist');
      const originalCreatedAt = original.createdAt;

      // Update post 1
      const updated = await db.updateSavedPostAsync(post1Id, {
        title: 'VIP Community Announcement (Updated 2026)',
        text: 'Updated perks text for VIP members!'
      });

      assert(updated, 'Update must return the updated post');
      assert.strictEqual(updated.id, post1Id, 'Post ID must remain identical');
      assert.strictEqual(updated.title, 'VIP Community Announcement (Updated 2026)');
      assert.strictEqual(updated.text, 'Updated perks text for VIP members!');
      assert.strictEqual(updated.createdAt, originalCreatedAt, 'createdAt must not change');
      assert(new Date(updated.updatedAt).getTime() >= new Date(original.updatedAt).getTime(), 'updatedAt must be updated');

      // Post count must not increase (no duplicate created)
      const afterCount = db.getSavedPosts().length;
      assert.strictEqual(afterCount, initialCount, 'Total post count must remain unchanged after edit');
    });

    // -------------------------------------------------------------------------
    // Test 4: Deleting a post deletes only the selected record and remains consistent after restart
    // -------------------------------------------------------------------------
    await test('4. Deleting a post deletes only selected record and remains consistent after restart', async () => {
      // Delete post 1
      const deleted = await db.deleteSavedPostAsync(post1Id);
      assert.strictEqual(deleted, true, 'deleteSavedPostAsync must return true');

      // Post 1 must be gone, Post 2 must remain
      assert.strictEqual(db.getSavedPost(post1Id), undefined, 'Post 1 must not exist');
      const post2 = db.getSavedPost(post2Id);
      assert(post2, 'Post 2 must remain intact');
      assert.strictEqual(post2.id, post2Id);
      assert.strictEqual(db.getSavedPosts().length, 1, 'Only 1 post must remain');

      // Simulate restart after deletion
      const restartedDb = new StorageManager(testTempDir);
      restartedDb.setBotIdentity({ id: 7770001, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' });

      assert.strictEqual(restartedDb.getSavedPost(post1Id), undefined, 'Post 1 must stay deleted across restart');
      const post2Restored = restartedDb.getSavedPost(post2Id);
      assert(post2Restored, 'Post 2 must still exist across restart');
      assert.strictEqual(post2Restored.id, post2Id);
      assert.strictEqual(restartedDb.getSavedPosts().length, 1);
    });

    // -------------------------------------------------------------------------
    // Test 5: An empty cache cannot erase existing database records
    // -------------------------------------------------------------------------
    await test('5. An empty cache cannot erase existing records during hydration or querying', async () => {
      // Re-add Post 1 so we have multiple posts
      await db.saveSavedPostAsync({
        id: post1Id,
        title: 'Restored VIP Post',
        contentType: 'text',
        text: 'Re-added VIP post'
      });
      assert.strictEqual(db.countSavedPosts(), 2);

      // Filtering with query that yields 0 results must NOT mutate or erase stored records
      const emptySearchResults = db.getSavedPosts({ search: 'nonexistent_post_query_xyz' });
      assert.strictEqual(emptySearchResults.length, 0);
      assert.strictEqual(db.countSavedPosts(), 2, 'Stored posts must not be erased by empty search query');

      // Invalid ID lookup must return undefined without wiping registry
      assert.strictEqual(db.getSavedPost('POST-NONEXISTENT'), undefined);
      assert.strictEqual(db.countSavedPosts(), 2, 'Stored posts must remain intact after invalid lookup');
    });

    // -------------------------------------------------------------------------
    // Test 6: Database read/write failures are surfaced without silently losing existing posts
    // -------------------------------------------------------------------------
    await test('6. Database failures are surfaced without silently losing existing posts', async () => {
      // Attempting to overwrite an existing post ID with saveSavedPost must throw an error
      let caughtError: any = null;
      try {
        db.saveSavedPost({
          id: post1Id,
          title: 'Illegal Overwrite Post',
          contentType: 'text',
          text: 'Should fail'
        });
      } catch (err: any) {
        caughtError = err;
      }
      assert(caughtError, 'Overwriting an existing ID must throw an explicit error');
      assert(/already exists/i.test(caughtError.message), 'Error message must explain ID collision');

      // The existing post must remain completely untouched
      const originalPost1 = db.getSavedPost(post1Id);
      assert(originalPost1, 'Original post must still exist');
      assert.strictEqual(originalPost1.title, 'Restored VIP Post', 'Title must not be overwritten');
      assert.strictEqual(db.countSavedPosts(), 2, 'Post count must remain 2');
    });

    // -------------------------------------------------------------------------
    // Test 7: Existing post formats, media, buttons, broadcasts, and scheduled-post references continue working
    // -------------------------------------------------------------------------
    await test('7. Existing post formats, media, buttons, and dependent references continue working', async () => {
      const richPost = await db.saveSavedPostAsync({
        title: 'Rich Video Template',
        contentType: 'video',
        text: 'Check out our latest tutorial video! 🎥',
        mediaFileId: 'BAACAgIAAxkBAAIC2345678',
        buttons: [
          [
            { text: 'Watch Video', url: 'https://youtube.com/watch?v=123' },
            { text: 'Download Resources', url: 'https://github.com/resources' }
          ]
        ],
        protectContent: true,
        pinAfterSend: true,
        replyToLatest: true,
        tags: ['tutorial', 'video', 'education']
      });

      assert(richPost, 'Rich post must be created');
      assert.strictEqual(richPost.contentType, 'video');
      assert.strictEqual(richPost.mediaFileId, 'BAACAgIAAxkBAAIC2345678');
      assert.strictEqual(richPost.buttons?.length, 1);
      assert.strictEqual(richPost.buttons?.[0]?.length, 2);

      // Add a schedule that references this saved post ID
      db.addSchedule({
        id: 'SCHED-TEST-1',
        chatId: -1001234567890,
        name: 'Weekly Tutorial Broadcast',
        message: `{{POST:${richPost.id}}}`,
        interval: 60,
        enabled: true
      });

      // Verify dependents detection recognizes the active schedule reference
      const dependents = db.getSavedPostDependents(richPost.id);
      assert(dependents.length >= 1, 'getSavedPostDependents must identify referencing schedule');
      assert.strictEqual(dependents[0].id, 'SCHED-TEST-1');
      assert.strictEqual(dependents[0].type, 'schedule');
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
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
