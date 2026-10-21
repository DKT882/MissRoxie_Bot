import assert from 'assert';
import { db } from '../server/db/storage.js';
import { PostResolverService, PostResolutionError } from '../server/telegram/postResolver.js';

console.log('====================================================');
console.log('🧪 RUNNING UNIFIED ID-BASED CONTENT SYSTEM TESTS');
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
  const testChatId1 = -10099494679;
  const testChatId2 = -10099494680;

  // 1. Unified Content Registry: Saved Posts
  await it('REG-01: db.saveSavedPost registers post with stable POST-XXXXX format', () => {
    const post = db.saveSavedPost({
      title: 'Member Welcome Rules',
      contentType: 'text',
      text: 'Welcome to the community! Please read our rules.',
      buttons: [[{ text: 'Rules Channel', url: 'https://t.me/rules' }]],
      protectContent: true,
      pinAfterSend: true,
      createdBy: { userId: 12345, username: 'admin1', role: 'GROUP_OWNER' }
    });

    assert(post && post.id, 'Post must be saved with ID');
    assert(post.id.startsWith('POST-'), `Post ID "${post.id}" must start with POST-`);
    assert.strictEqual(post.title, 'Member Welcome Rules');

    // Retrieve via getContentItem
    const item = db.getContentItem(post.id);
    assert(item, 'getContentItem must resolve saved post');
    assert.strictEqual(item.type, 'post');
    assert.strictEqual(item.id, post.id);
    assert.strictEqual(item.text, 'Welcome to the community! Please read our rules.');
    assert.strictEqual(item.options?.protectContent, true);
    assert.strictEqual(item.options?.pinAfterSend, true);
    assert.strictEqual(item.buttons?.length, 1);
  });

  // 2. Unified Content Registry: Schedules (Execution State Isolation)
  let scheduleId = '';
  await it('REG-02: db.addSchedule creates schedule; getContentItem isolates reusable content from execution state', () => {
    const sched = db.addSchedule({
      chatId: testChatId1,
      name: 'Hourly Community Reminder',
      message: 'Don\'t forget our weekly voice AMA today!',
      contentType: 'text',
      scheduleType: 'interval',
      intervalFormatted: '1h',
      intervalMs: 3600000,
      nextRun: new Date(Date.now() + 3600000).toISOString(),
      lastRun: new Date().toISOString(),
      enabled: true,
      pinAfterSend: true,
      replyToLatest: true
    });

    assert(sched && sched.id, 'Schedule must have an ID');
    scheduleId = sched.id;

    // getContentItem lookup
    const item = db.getContentItem(scheduleId);
    assert(item, 'getContentItem must resolve schedule');
    assert.strictEqual(item.type, 'schedule');
    assert.strictEqual(item.id, scheduleId);
    assert.strictEqual(item.text, 'Don\'t forget our weekly voice AMA today!');
    assert.strictEqual(item.options?.pinAfterSend, true);
    assert.strictEqual(item.options?.replyToLatest, true);
    assert.strictEqual(item.scheduleConfig?.intervalStr, '1h');
    assert.strictEqual(item.sourceGroupId, testChatId1);

    // CRITICAL: Ensure execution state is NOT in reusable options or item root
    const rawItem = item as any;
    assert.strictEqual(rawItem.nextRun, undefined, 'Execution state nextRun must NOT be in reusable item');
    assert.strictEqual(rawItem.lastRun, undefined, 'Execution state lastRun must NOT be in reusable item');
    assert.strictEqual(rawItem.runsCount, undefined, 'Execution state runsCount must NOT be in reusable item');
    assert.strictEqual(rawItem.enabled, undefined, 'Execution state enabled must NOT be in reusable item');
  });

  // 3. Unified Content Registry: Content Templates (Broadcast & Buttons)
  let broadcastTmplId = '';
  let buttonTmplId = '';
  await it('REG-03: db.saveContentTemplate stores broadcast and inline button templates', () => {
    const tmpl1 = db.saveContentTemplate({
      type: 'broadcast',
      title: 'Weekend Promo Template',
      contentType: 'text',
      text: 'Special weekend announcement: 50% discount on VIP access!',
      options: { protectContent: true }
    });
    assert(tmpl1 && tmpl1.id, 'Broadcast template must have ID');
    assert(tmpl1.id.startsWith('TMPL-'), `Template ID "${tmpl1.id}" must start with TMPL-`);
    broadcastTmplId = tmpl1.id;

    const tmpl2 = db.saveContentTemplate({
      type: 'inline_button',
      title: 'Standard Social Links',
      contentType: 'text',
      buttons: [
        [{ text: 'Website', url: 'https://example.com' }],
        [{ text: 'Support', url: 'https://t.me/support' }]
      ]
    });
    assert(tmpl2 && tmpl2.id, 'Button template must have ID');
    assert(tmpl2.id.startsWith('BTN-'), `Button template ID "${tmpl2.id}" must start with BTN-`);
    buttonTmplId = tmpl2.id;

    const res1 = db.getContentItem(broadcastTmplId);
    assert(res1 && res1.type === 'broadcast');
    assert.strictEqual(res1.text, 'Special weekend announcement: 50% discount on VIP access!');

    const res2 = db.getContentItem(buttonTmplId);
    assert(res2 && res2.type === 'inline_button');
    assert.strictEqual(res2.buttons?.length, 2);
  });

  // 4. Case-Insensitive Lookup
  await it('REG-04: getContentItem resolves case-insensitively', () => {
    const itemUpper = db.getContentItem(scheduleId.toUpperCase());
    const itemLower = db.getContentItem(scheduleId.toLowerCase());
    assert(itemUpper && itemLower, 'Both upper and lower case lookups must succeed');
    assert.strictEqual(itemUpper.id, itemLower.id);
  });

  // 5. Group Isolation Enforcement
  await it('REG-05: Group isolation blocks unauthorized cross-group schedule access', () => {
    // Attempt to access schedule of testChatId1 with context of testChatId2 as regular admin
    const unauthorized = db.getContentItem(scheduleId, {
      chatId: testChatId2,
      role: 'GROUP_ADMIN'
    });
    assert.strictEqual(unauthorized, undefined, 'Regular group admin from another group must NOT access schedule');

    // Authorized group access
    const authorizedSameGroup = db.getContentItem(scheduleId, {
      chatId: testChatId1,
      role: 'GROUP_ADMIN'
    });
    assert(authorizedSameGroup, 'Same group admin must be authorized');

    // Global Exception Admin / Owner access across groups
    const globalAdminAccess = db.getContentItem(scheduleId, {
      chatId: testChatId2,
      role: 'EXCEPTION_ADMIN'
    });
    assert(globalAdminAccess, 'EXCEPTION_ADMIN must be authorized across groups');
  });

  // 6. PostResolverService: Universal Reference Syntax
  await it('RES-01: PostResolverService resolves universal {{item:ID}} syntax', () => {
    const resolvedSchedule = PostResolverService.resolveMessage(`{{item:${scheduleId}}}`);
    assert.strictEqual(resolvedSchedule.text, 'Don\'t forget our weekly voice AMA today!');
    assert.strictEqual(resolvedSchedule.pinAfterSend, true);

    const resolvedTemplate = PostResolverService.resolveMessage(`{{item:${broadcastTmplId}}}`);
    assert.strictEqual(resolvedTemplate.text, 'Special weekend announcement: 50% discount on VIP access!');
    assert.strictEqual(resolvedTemplate.protectContent, true);
  });

  // 7. PostResolverService: Explicit Type Tags
  await it('RES-02: PostResolverService resolves typed references {{schedule:ID}} and {{template:ID}}', () => {
    const schedPayload = PostResolverService.resolveMessage(`{{schedule:${scheduleId}}}`);
    assert.strictEqual(schedPayload.text, 'Don\'t forget our weekly voice AMA today!');

    const tmplPayload = PostResolverService.resolveMessage(`{{template:${broadcastTmplId}}}`);
    assert.strictEqual(tmplPayload.text, 'Special weekend announcement: 50% discount on VIP access!');
  });

  // 8. PostResolverService: Type Mismatch Validation
  await it('RES-03: PostResolverService rejects mismatched type tag (e.g. referencing schedule as post)', () => {
    assert.throws(
      () => PostResolverService.resolveMessage(`{{post:${scheduleId}}}`),
      (err: any) => {
        assert(err instanceof PostResolutionError);
        assert(err.message.includes('is a schedule, but was referenced as post'));
        return true;
      }
    );
  });

  // 9. PostResolverService: Embedded References
  await it('RES-04: PostResolverService resolves embedded placeholders inside composite text', () => {
    const composite = `Notice for all members: {{item:${scheduleId}}} - Thanks!`;
    const resolved = PostResolverService.resolveMessage(composite);
    assert.strictEqual(
      resolved.text,
      `Notice for all members: Don't forget our weekly voice AMA today! - Thanks!`
    );
  });

  // 10. PostResolverService: Circular Reference Protection
  await it('RES-05: PostResolverService prevents infinite loops on circular references', () => {
    // Create post A referencing post B
    const postB = db.saveSavedPost({
      title: 'Post B',
      contentType: 'text',
      text: 'Content of B'
    });

    const postA = db.saveSavedPost({
      title: 'Post A',
      contentType: 'text',
      text: `Content of A including {{item:${postB.id}}}`
    });

    // Update post B to reference post A (cycle)
    db.updateSavedPost(postB.id, {
      text: `Content of B including {{item:${postA.id}}}`
    });

    // Resolving post A must terminate safely without Maximum call stack size exceeded
    const resolved = PostResolverService.resolveMessage(`Message: {{item:${postA.id}}}`);
    assert(resolved && typeof resolved.text === 'string');
    assert(resolved.text.includes('Content of A'));
  });

  // 11. Content Listing & Search
  await it('REG-06: getContentItems lists and filters items across types', () => {
    const allItems = db.getContentItems();
    assert(allItems.length >= 3, 'Must return items from saved posts, schedules, and templates');

    const postsOnly = db.getContentItems({ type: 'post' });
    assert(postsOnly.every(i => i.type === 'post'), 'Must only return posts');

    const schedulesOnly = db.getContentItems({ type: 'schedule' });
    assert(schedulesOnly.every(i => i.type === 'schedule'), 'Must only return schedules');

    const searched = db.getContentItems({ search: 'AMA' });
    assert(searched.some(i => i.id === scheduleId), 'Must find schedule by search keyword');
  });

  console.log('\n====================================================');
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
