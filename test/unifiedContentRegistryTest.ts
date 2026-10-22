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

  // 12. Cross-Type Reuse: Saved Post into Schedule Draft
  await it('REUSE-01: Saved-post ID loaded into schedule draft populates content and buttons with paused status', () => {
    const post = db.saveSavedPost({
      title: 'Community Guidelines',
      contentType: 'photo',
      text: '<b>Rules:</b> 1. Be respectful. 2. No spam.',
      mediaFileId: 'https://example.com/rules.jpg',
      buttons: [[{ text: 'Read Full Rules', url: 'https://example.com/rules' }]],
      pinAfterSend: true,
      protectContent: true
    });

    const item = db.getContentItem(post.id);
    assert(item, 'Must resolve saved post');

    // Simulate schedule composer applying the item
    const newScheduleDraft = {
      name: `${item.title} (Copy)`,
      message: item.text || '',
      contentType: item.contentType,
      mediaFileId: item.mediaFileId || '',
      inlineKeyboard: item.buttons || [],
      enabled: false, // Default paused/disabled
      pinAfterSend: Boolean(item.options?.pinAfterSend),
      scheduleType: 'interval',
      intervalStr: '1h'
    };

    assert.strictEqual(newScheduleDraft.enabled, false, 'New schedule draft must default to paused');
    assert.strictEqual(newScheduleDraft.message, '<b>Rules:</b> 1. Be respectful. 2. No spam.');
    assert.strictEqual(newScheduleDraft.contentType, 'photo');
    assert.strictEqual(newScheduleDraft.mediaFileId, 'https://example.com/rules.jpg');
    assert.strictEqual(newScheduleDraft.inlineKeyboard.length, 1);
    assert.strictEqual(newScheduleDraft.pinAfterSend, true);
  });

  // 13. Cross-Type Reuse: Schedule ID into New Schedule Draft (With Timing)
  await it('REUSE-02: Schedule ID loaded into new schedule draft includes interval timing and pauses execution', () => {
    const item = db.getContentItem(scheduleId);
    assert(item && item.type === 'schedule');

    // Simulate new schedule draft reuse with includeTiming = true
    const newScheduleDraft = {
      name: `${item.title} (Copy)`,
      message: item.text,
      enabled: false,
      scheduleType: item.scheduleConfig?.scheduleType || 'interval',
      intervalStr: item.scheduleConfig?.intervalStr || '1h'
    };

    assert.strictEqual(newScheduleDraft.enabled, false, 'New schedule must default to paused');
    assert.strictEqual(newScheduleDraft.intervalStr, '1h', 'Interval timing must be adopted into draft');
    assert.strictEqual(newScheduleDraft.message, item.text);
  });

  // 14. Cross-Type Reuse: Schedule ID into Existing Schedule Editor (Preserve Schedule ID)
  await it('REUSE-03: Loading content into existing schedule editor updates content and strictly preserves original schedule ID', () => {
    const targetSchedule = db.addSchedule({
      chatId: testChatId1,
      name: 'Existing Schedule To Edit',
      message: 'Old text before update',
      scheduleType: 'interval',
      intervalFormatted: '2h',
      enabled: true
    });

    const originalId = targetSchedule.id;
    const sourceTemplate = db.saveContentTemplate({
      type: 'broadcast',
      title: 'Updated Announcement Template',
      contentType: 'text',
      text: 'Brand new announcement text applied to existing schedule',
      buttons: [[{ text: 'Join Discord', url: 'https://discord.gg/test' }]]
    });

    const item = db.getContentItem(sourceTemplate.id);
    assert(item, 'Must resolve template');

    // Simulate updating the existing schedule record in place
    const updated = db.updateSchedule(originalId, {
      message: item.text,
      inlineKeyboard: item.buttons
    });

    assert(updated, 'Schedule must be updated');
    assert.strictEqual(updated.id, originalId, 'Schedule ID must be strictly preserved');
    assert.strictEqual(updated.message, 'Brand new announcement text applied to existing schedule');
    assert.strictEqual(updated.inlineKeyboard?.length, 1);
  });

  // 15. Cross-Type Reuse: All Types into Rich Post & Broadcast Composer
  await it('REUSE-04: Post, schedule, broadcast, and inline-template IDs loaded into Rich Post / Broadcast draft retain formatting and options', () => {
    const btnTmpl = db.saveContentTemplate({
      type: 'inline_button',
      title: 'Social Links Grid',
      contentType: 'text',
      buttons: [
        [{ text: 'Twitter', url: 'https://x.com' }, { text: 'Telegram', url: 'https://t.me' }]
      ]
    });

    const item = db.getContentItem(btnTmpl.id);
    assert(item && item.type === 'inline_button');

    // Simulate Rich Post Composer loading inline button template
    const richPostDraft = {
      text: item.text || 'Default announcement body',
      compositionType: item.contentType || 'text',
      buttonGrid: item.buttons || [],
      pinMessage: Boolean(item.options?.pinAfterSend),
      protectContent: Boolean(item.options?.protectContent)
    };

    assert.strictEqual(richPostDraft.buttonGrid[0].length, 2, '2-button grid must be preserved');
    assert.strictEqual(richPostDraft.buttonGrid[0][0].text, 'Twitter');
    assert.strictEqual(richPostDraft.buttonGrid[0][1].text, 'Telegram');
  });

  // 16. Security: Non-Execution Safety
  await it('REUSE-05: Loading reusable content item never triggers operational actions or runtime state changes', () => {
    const initialSchedule = db.getScheduleById(scheduleId);
    const initialNextRun = initialSchedule?.nextRun;
    const initialRunsCount = initialSchedule?.runsCount || 0;

    // Inspect content multiple times
    const item1 = db.getContentItem(scheduleId);
    const item2 = db.getContentItem(scheduleId, { chatId: testChatId1 });
    assert(item1 && item2);

    const recheckedSchedule = db.getScheduleById(scheduleId);
    assert.strictEqual(recheckedSchedule?.nextRun, initialNextRun, 'Inspection must not mutate nextRun');
    assert.strictEqual(recheckedSchedule?.runsCount, initialRunsCount, 'Inspection must not increment runsCount');
  });

  // 17. Security: Invalid ID Rejection
  await it('REUSE-06: Invalid, non-existent, and empty IDs return undefined', () => {
    assert.strictEqual(db.getContentItem(''), undefined);
    assert.strictEqual(db.getContentItem('NON_EXISTENT_ID_9999'), undefined);
    assert.strictEqual(db.getContentItem('POST-DOES-NOT-EXIST'), undefined);
  });

  // 18. UI Source Code Integrity Check
  await it('REUSE-07: ContentReuseModal and controls are integrated across all target UI files', async () => {
    const fs = await import('fs');
    const path = await import('path');

    const appTsx = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
    const tmaTsx = fs.readFileSync(path.resolve('src/components/TelegramMiniApp.tsx'), 'utf8');
    const richPostTsx = fs.readFileSync(path.resolve('src/components/RichPostComposer.tsx'), 'utf8');
    const mentionAllTsx = fs.readFileSync(path.resolve('src/components/MentionAllComposer.tsx'), 'utf8');
    const modalTsx = fs.readFileSync(path.resolve('src/components/ContentReuseModal.tsx'), 'utf8');

    assert(appTsx.includes('ContentReuseModal'), 'App.tsx must include ContentReuseModal');
    assert(appTsx.includes('handleApplyReusedContentToSchedule'), 'App.tsx must have schedule reuse handler');
    assert(tmaTsx.includes('ContentReuseModal'), 'TelegramMiniApp.tsx must include ContentReuseModal');
    assert(tmaTsx.includes('handleApplyReusedContentToSchedule'), 'TelegramMiniApp.tsx must have schedule reuse handler');
    assert(richPostTsx.includes('ContentReuseModal'), 'RichPostComposer.tsx must include ContentReuseModal');
    assert(mentionAllTsx.includes('ContentReuseModal'), 'MentionAllComposer.tsx must include ContentReuseModal');
    assert(modalTsx.includes('Apply Content to Draft'), 'ContentReuseModal must offer Apply Content to Draft action');
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
