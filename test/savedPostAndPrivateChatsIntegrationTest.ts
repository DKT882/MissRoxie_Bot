import assert from 'assert';
import { db } from '../server/db/storage.js';
import { PostResolverService } from '../server/telegram/postResolver.js';
import { ScheduledPostButton } from '../server/telegram/types.js';

console.log('====================================================');
console.log('🧪 RUNNING SAVED POSTS & PRIVATE CHATS INTEGRATION TEST');
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
  const testChatId = -1009949468999;
  let createdPostId = '';
  let testScheduleId = '';

  // =========================================================================
  // GROUP 1: Saved Post Library (Feature 1)
  // =========================================================================

  await it('POST-01: Create saved post with stable POST-XXXXX ID and visual buttons', () => {
    const buttons: ScheduledPostButton[][] = [
      [
        { text: 'Official Website', url: 'https://example.com' },
        { text: 'Support Bot', url: 'https://t.me/support_bot' }
      ],
      [
        { text: 'Community Channel', url: 'https://t.me/my_channel' }
      ]
    ];

    const post = db.saveSavedPost({
      title: 'Community Welcome Hub',
      contentType: 'photo',
      mediaFileId: 'https://example.com/welcome-banner.png',
      text: '<b>Welcome to the Official Community!</b>\nPlease visit our links below.',
      buttons
    });

    assert(post && post.id, 'Saved post must be created with ID');
    assert(/^POST-[A-Z0-9]{5}$/.test(post.id), `ID "${post.id}" must match POST-XXXXX format`);
    assert.strictEqual(post.contentType, 'photo');
    assert.strictEqual(post.mediaFileId, 'https://example.com/welcome-banner.png');
    assert.strictEqual(post.buttons?.length, 2, 'Buttons must have 2 rows');
    assert.strictEqual(post.buttons[0].length, 2, 'Row 0 must have 2 buttons');
    assert.strictEqual(post.buttons[1].length, 1, 'Row 1 must have 1 button');

    createdPostId = post.id;
  });

  await it('POST-02: Retrieve saved post by ID via getSavedPost & getContentItem', () => {
    const directPost = db.getSavedPost(createdPostId);
    assert(directPost, 'Direct lookup must find the created post');
    assert.strictEqual(directPost.id, createdPostId);

    const unifiedItem = db.getContentItem(createdPostId);
    assert(unifiedItem, 'Unified content registry must resolve post by ID');
    assert.strictEqual(unifiedItem.id, createdPostId);
    assert.strictEqual(unifiedItem.type, 'post');
    assert.strictEqual(unifiedItem.contentType, 'photo');
    assert.strictEqual(unifiedItem.buttons?.length, 2);
  });

  await it('POST-03: Update saved post preserving ID and updating button matrix', () => {
    const updatedButtons: ScheduledPostButton[][] = [
      [
        { text: 'Docs', url: 'https://docs.example.com' },
        { text: 'Portal', url: 'https://portal.example.com' },
        { text: 'FAQ', url: 'https://faq.example.com' }
      ]
    ];

    const updated = db.updateSavedPost(createdPostId, {
      title: 'Updated Community Welcome Hub',
      text: '<b>Updated Welcome Message!</b>',
      buttons: updatedButtons
    });

    assert(updated, 'Update must return true/updated post');
    const fetched = db.getSavedPost(createdPostId);
    assert(fetched, 'Post must exist after update');
    assert.strictEqual(fetched.id, createdPostId, 'Post ID must remain unchanged');
    assert.strictEqual(fetched.title, 'Updated Community Welcome Hub');
    assert.strictEqual(fetched.text, '<b>Updated Welcome Message!</b>');
    assert.strictEqual(fetched.buttons?.length, 1, 'Button grid must update to 1 row');
    assert.strictEqual(fetched.buttons[0].length, 3, 'Row 0 must have 3 buttons');
  });

  // =========================================================================
  // GROUP 2: Unified ID References in Broadcast & Scheduling (Feature 2)
  // =========================================================================

  await it('REF-01: PostResolverService resolves {{post:ID}} into full text, media and buttons', () => {
    const refSyntax = `{{post:${createdPostId}}}`;
    const resolved = PostResolverService.resolveMessage(refSyntax);

    assert(resolved, 'Resolution must return a payload');
    assert.strictEqual(resolved.contentType, 'photo', 'Must adopt referenced content type');
    assert.strictEqual(resolved.mediaFileId, 'https://example.com/welcome-banner.png', 'Must adopt mediaFileId');
    assert.strictEqual(resolved.text, '<b>Updated Welcome Message!</b>', 'Must adopt referenced text');
    assert(resolved.buttons && resolved.buttons.length === 1, 'Must adopt referenced inline buttons');
    assert.strictEqual(resolved.buttons[0].length, 3, 'Must adopt 3 buttons from row 0');
  });

  await it('REF-02: PostResolverService resolves {{item:ID}} interchangeably', () => {
    const itemSyntax = `{{item:${createdPostId}}}`;
    const resolved = PostResolverService.resolveMessage(itemSyntax);

    assert(resolved, 'Resolution must return a payload');
    assert.strictEqual(resolved.contentType, 'photo');
    assert.strictEqual(resolved.buttons?.length, 1);
  });

  await it('REF-03: Create schedule referencing post ID and verify dependency tracking', () => {
    const sched = db.addSchedule({
      chatId: testChatId,
      name: 'Recurring Broadcast Hub',
      message: `Check our links: {{post:${createdPostId}}}`,
      scheduleType: 'interval',
      intervalFormatted: '1 hour',
      intervalMs: 3600000,
      nextRun: new Date(Date.now() + 3600000).toISOString(),
      enabled: true,
      postRef: createdPostId
    });

    assert(sched && sched.id, 'Schedule must be created');
    testScheduleId = sched.id;

    // Check dependents
    const dependents = db.getSavedPostDependents(createdPostId);
    assert(dependents.length >= 1, 'Must find at least one dependent schedule');
    const found = dependents.find(d => d.id === testScheduleId && d.type === 'schedule');
    assert(found, `Dependent schedule ${testScheduleId} must be listed in dependents`);
  });

  await it('REF-04: Schedule reference content reuse {{schedule:ID}} without altering timing', () => {
    const schedRefSyntax = `{{schedule:${testScheduleId}}}`;
    const resolved = PostResolverService.resolveMessage(schedRefSyntax, { chatId: testChatId });

    assert(resolved, 'Schedule reference must resolve');
    assert(resolved.text.includes('Check our links'), 'Resolved text must contain schedule message');
  });

  // =========================================================================
  // GROUP 3: Unified Private Chats & Database-Backed Recipient Registry (Feature 3 & 4)
  // =========================================================================

  const testUserId = 99887766;

  await it('DM-01: savePrivateRecipient adds new recipient deduplicated by Telegram numeric chatId', () => {
    const recipient = db.savePrivateRecipient({
      chatId: testUserId,
      username: 'AliceTelegram',
      firstName: 'Alice',
      displayName: 'Alice Wonderland'
    });

    assert(recipient, 'Recipient must be saved');
    assert.strictEqual(recipient.chatId, testUserId);
    assert.strictEqual(recipient.username, 'AliceTelegram');
    assert.strictEqual(recipient.status, 'active');

    const list = db.getPrivateRecipients();
    const matches = list.filter(r => r.chatId === testUserId);
    assert.strictEqual(matches.length, 1, 'Exactly one entry must exist for this chatId');
  });

  await it('DM-02: Upserting recipient with updated username/display name preserves identity without duplicates', () => {
    const updatedRecipient = db.savePrivateRecipient({
      chatId: testUserId,
      username: 'Alice_Renamed_2026',
      firstName: 'Alice V2',
      displayName: 'Alice Queen'
    });

    assert(updatedRecipient, 'Updated recipient must return');
    assert.strictEqual(updatedRecipient.chatId, testUserId);
    assert.strictEqual(updatedRecipient.username, 'Alice_Renamed_2026');
    assert.strictEqual(updatedRecipient.displayName, 'Alice Queen');

    const list = db.getPrivateRecipients();
    const matches = list.filter(r => r.chatId === testUserId);
    assert.strictEqual(matches.length, 1, 'Recipient count must remain 1 (no duplicates on update)');
  });

  await it('DM-03: addPrivateMessage automatically updates recipient registry and lastSeenAt', () => {
    const beforeTimestamp = new Date(Date.now() - 5000).toISOString();

    db.addPrivateMessage(testUserId, testUserId, {
      role: 'user',
      content: 'Hello Miss Roxie, checking in!',
      timestamp: Date.now(),
      username: 'Alice_Renamed_2026',
      name: 'Alice Queen'
    });

    const recipient = db.getPrivateRecipient(testUserId);
    assert(recipient, 'Recipient must exist in database');
    assert(recipient.lastSeenAt, 'lastSeenAt must be populated');
    assert(recipient.lastSeenAt >= beforeTimestamp, 'lastSeenAt must reflect recent interaction');
  });

  await it('DM-04: Toggle recipient opt-out status and verify persistence', () => {
    const successOptOut = db.updatePrivateRecipientStatus(testUserId, 'opted_out');
    assert(successOptOut, 'Opt-out update must succeed');

    let recipient = db.getPrivateRecipient(testUserId);
    assert.strictEqual(recipient?.status, 'opted_out');

    const successReactivate = db.updatePrivateRecipientStatus(testUserId, 'active');
    assert(successReactivate, 'Reactivate update must succeed');

    recipient = db.getPrivateRecipient(testUserId);
    assert.strictEqual(recipient?.status, 'active');
  });

  // Cleanup test schedule
  if (testScheduleId) {
    db.deleteSchedule(testScheduleId);
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
