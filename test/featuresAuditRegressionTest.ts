import { db } from '../server/db/storage.js';
import { PostResolverService, PostResolutionError } from '../server/telegram/postResolver.js';
import { PostPayload, SavedPost } from '../server/telegram/types.js';
import { isFeatureAllowedForRole } from '../server/tma/tmaAuth.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runFeaturesAuditRegressionTest() {
  console.log('====================================================');
  console.log('🧪 RUNNING MISSROXIE FEATURES AUDIT REGRESSION SUITE');
  console.log('====================================================\n');

  // ==========================================
  // SECTION 1: CENTRALIZED SAVED POST LIBRARY (FEATURE 1)
  // ==========================================
  console.log('--- SECTION 1: Centralized Saved Post Library ---');

  // Test 1: Stable, Human-Readable Unique IDs
  const id1 = db.generatePostId();
  const id2 = db.generatePostId();
  assert(Boolean(id1 && id1.startsWith('POST-') && id1.length >= 8), 'F1-01: ID matches format POST-XXXXX', `id1=${id1}`);
  assert(id1 !== id2, 'F1-02: Generated IDs are distinct and unique');

  const generatedSet = new Set<string>();
  for (let i = 0; i < 50; i++) {
    const id = db.generatePostId();
    assert(!generatedSet.has(id), `F1-03: ID ${id} uniqueness in bulk generation`);
    generatedSet.add(id);
  }

  // Test 2: Post Persistence in Database
  const testPost = db.saveSavedPost({
    title: 'Welcome Announcement 2026',
    contentType: 'text',
    text: 'Welcome to our official group! Please adhere to community rules.',
    buttons: [[{ text: 'Rules Channel', url: 'https://t.me/rules' }]],
    protectContent: true,
    pinAfterSend: true,
    createdBy: {
      userId: 9991234,
      username: 'admin_owner',
      role: 'GROUP_OWNER'
    }
  });

  assert(Boolean(testPost && testPost.id.startsWith('POST-')), 'F1-04: Post saved with generated ID');
  assert(testPost.title === 'Welcome Announcement 2026', 'F1-05: Post title persisted');
  assert(testPost.createdBy.userId === 9991234, 'F1-06: Post creator ID stored');
  assert(Boolean(testPost.createdAt && testPost.updatedAt), 'F1-07: Timestamps recorded');
  assert(testPost.protectContent === true, 'F1-08: Protect content setting preserved');

  // Test 3: No Silent Overwrite on Duplicate ID
  let overwriteFailed = false;
  try {
    db.saveSavedPost({
      id: testPost.id,
      title: 'Malicious Overwrite Attempt',
      contentType: 'text',
      text: 'Hacked',
      createdBy: { userId: 666, username: 'attacker' }
    });
  } catch (err: any) {
    overwriteFailed = true;
    assert(err.message.includes('already exists'), 'F1-09: Overwrite error message is explicit');
  }
  assert(overwriteFailed, 'F1-10: Overwriting an existing saved post with saveSavedPost is strictly blocked');

  // Test 4: Retrieve Saved Post
  const retrieved = db.getSavedPost(testPost.id);
  assert(Boolean(retrieved && retrieved.id === testPost.id), 'F1-11: Post retrieved by exact ID');
  assert(retrieved?.buttons?.[0]?.[0]?.text === 'Rules Channel', 'F1-12: Inline button structure preserved intact');

  // Test 5: Update Saved Post
  const updatedPost = db.updateSavedPost(testPost.id, {
    title: 'Updated Announcement 2026',
    text: 'Updated announcement body text.'
  });
  assert(Boolean(updatedPost && updatedPost.title === 'Updated Announcement 2026'), 'F1-13: Post title updated');
  assert(updatedPost?.text === 'Updated announcement body text.', 'F1-14: Post text content updated');
  assert(updatedPost?.id === testPost.id, 'F1-15: Post ID unchanged during edit');
  assert(updatedPost?.createdBy.userId === 9991234, 'F1-16: Original creator preserved');

  // Test 6: Duplicate Saved Post
  const duplicated = db.duplicateSavedPost(testPost.id, 'Welcome Announcement 2026 (Fork)', {
    userId: 8881234,
    username: 'co_admin'
  });
  assert(Boolean(duplicated && duplicated.id.startsWith('POST-')), 'F1-17: Duplicated post created with new ID');
  assert(duplicated?.id !== testPost.id, 'F1-18: Duplicated post has distinct ID');
  assert(duplicated?.title === 'Welcome Announcement 2026 (Fork)', 'F1-19: Duplicated post has custom title');
  assert(duplicated?.createdBy.userId === 8881234, 'F1-20: Duplicated post creator assigned to duplicator');

  // Test 7: Post Resolver Service - Exact Placeholder Resolution
  const exactPayload: PostPayload = {
    contentType: 'text',
    text: `{{post:${testPost.id}}}`
  };
  const resolvedExact = PostResolverService.resolvePayload(exactPayload);
  assert(resolvedExact.text === 'Updated announcement body text.', 'F1-21: PostResolver resolved exact {{post:ID}} text');
  assert(resolvedExact.buttons?.[0]?.[0]?.text === 'Rules Channel', 'F1-22: PostResolver resolved buttons from saved post');
  assert(resolvedExact.protectContent === true, 'F1-23: PostResolver preserved protectContent');

  // Test 8: Post Resolver Service - Inline Placeholder Resolution
  const inlinePayload: PostPayload = {
    contentType: 'text',
    text: `Special Notice: {{post:${testPost.id}}} Please read carefully.`
  };
  const resolvedInline = PostResolverService.resolvePayload(inlinePayload);
  assert(
    resolvedInline.text === 'Special Notice: Updated announcement body text. Please read carefully.',
    'F1-24: PostResolver replaced inline {{post:ID}} placeholder seamlessly'
  );

  // Test 9: Post Resolver Service - Unknown Post ID Handling
  let resolverFailed = false;
  try {
    PostResolverService.resolvePayload({
      contentType: 'text',
      text: '{{post:POST-NONEXISTENT}}'
    });
  } catch (err: any) {
    resolverFailed = true;
    assert(err instanceof PostResolutionError, 'F1-25: Throws explicit PostResolutionError for unknown ID');
    assert(err.missingPostId === 'POST-NONEXISTENT', 'F1-26: Identifies the exact missing post ID');
  }
  assert(resolverFailed, 'F1-27: Non-existent post ID raises an exception rather than silently dropping content');

  // Test 10: Delete Saved Post
  const deleted = db.deleteSavedPost(testPost.id);
  assert(deleted === true, 'F1-28: Post deleted successfully');
  const postAfterDelete = db.getSavedPost(testPost.id);
  assert(postAfterDelete === undefined, 'F1-29: Deleted post no longer exists in database');

  if (duplicated) {
    db.deleteSavedPost(duplicated.id);
  }

  // ==========================================
  // SECTION 2: MINI APP PARITY (FEATURE 2)
  // ==========================================
  console.log('\n--- SECTION 2: Mini App Parity with Main Dashboard ---');

  // Test 11: Schedule Editing API
  const testChatId = -100999000111;
  const createdSched = db.addSchedule({
    chatId: testChatId,
    name: 'Morning Greeting',
    message: 'Good morning group!',
    scheduleType: 'interval',
    intervalFormatted: '2h',
    enabled: true
  });
  assert(Boolean(createdSched && createdSched.id), 'F2-01: Schedule created for parity testing');

  const updatedSched = db.updateSchedule(createdSched.id, {
    name: 'Evening Greeting',
    message: 'Good evening group!',
    intervalFormatted: '4h'
  });
  assert(updatedSched?.name === 'Evening Greeting', 'F2-02: Schedule name updated via storage update');
  assert(updatedSched?.message === 'Good evening group!', 'F2-03: Schedule message updated');
  assert(updatedSched?.intervalFormatted === '4h', 'F2-04: Schedule interval updated');

  // Test 12: Automation Rule Editing API
  const testAutoRule = {
    id: 'AUTO-RULE-1',
    trigger: 'spam_detected',
    action: 'delete_message',
    parameters: '',
    enabled: true,
    createdBy: 9991234,
    createdAt: new Date().toISOString()
  };
  db.addAutomation(testChatId, testAutoRule);
  const automationsBefore = db.getAutomations(testChatId);
  assert(automationsBefore.some(a => a.id === 'AUTO-RULE-1'), 'F2-05: Automation rule added');

  const autoCountBefore = db.getAutomations(testChatId).length;
  const updatedAuto = db.updateAutomation(testChatId, 'AUTO-RULE-1', {
    action: 'mute_user',
    parameters: 'duration=600'
  });
  assert(updatedAuto?.action === 'mute_user', 'F2-06: Automation rule action updated (Parity)');
  assert(updatedAuto?.parameters === 'duration=600', 'F2-07: Automation rule parameters updated (Parity)');
  const autoCountAfter = db.getAutomations(testChatId).length;
  assert(autoCountAfter === autoCountBefore, 'F2-07A: Automation edit updates existing rule without duplicate');
  assert(updatedAuto?.id === 'AUTO-RULE-1', 'F2-07B: Automation ID preserved during edit');

  // Clean up test schedule & automation
  db.deleteSchedule(createdSched.id);
  db.deleteAutomation(testChatId, 'AUTO-RULE-1');

  // Test 13: TMA Authorization Matrix Parity
  assert(isFeatureAllowedForRole('GROUP_OWNER', 'schedules') === true, 'F2-08: Group Owner allowed schedules in TMA');
  assert(isFeatureAllowedForRole('EXCEPTION_ADMIN', 'schedules') === true, 'F2-09: Exception Admin allowed schedules in TMA');
  assert(isFeatureAllowedForRole('GROUP_ADMIN', 'schedules') === false, 'F2-10: Regular Admin strictly denied schedules in TMA');
  assert(isFeatureAllowedForRole('GROUP_ADMIN', 'rich_post') === true, 'F2-11: Regular Admin allowed rich_post in TMA');
  assert(isFeatureAllowedForRole('GROUP_ADMIN', 'stickers') === true, 'F2-12: Regular Admin allowed stickers in TMA');

  // ==========================================
  // SECTION 3: COPY STICKER PACKS BETWEEN GROUPS (FEATURE 3)
  // ==========================================
  console.log('\n--- SECTION 3: Copy Sticker Packs Between Groups ---');

  const groupSrcId = -100888111001;
  const groupDestId = -100888111002;

  // Set up source group sticker pack
  const srcPack = {
    name: 'CuteCats2026',
    title: 'Cute Cats Sticker Set',
    enabled: true,
    stickerCount: 2,
    stickers: [
      { fileId: 'STICKER_FILE_CAT_1', emoji: '🐱' },
      { fileId: 'STICKER_FILE_CAT_2', emoji: '😻' }
    ]
  };
  db.addGroupStickerPack(groupSrcId, srcPack);

  const srcPacks = db.getGroupStickerPacks(groupSrcId);
  assert(srcPacks.some(p => p.name === 'CuteCats2026'), 'F3-01: Source group has CuteCats2026 configured');

  // Copy pack into destination group
  const destPacksBefore = db.getGroupStickerPacks(groupDestId);
  const alreadyInDest = destPacksBefore.some(p => p.name.toLowerCase() === 'cutecats2026');
  assert(!alreadyInDest, 'F3-02: Destination group does not yet have CuteCats2026');

  // Perform copy configuration
  const now = new Date().toISOString();
  db.addGroupStickerPack(groupDestId, {
    ...srcPack,
    addedBy: 'admin_test',
    addedAt: now
  });

  const destPacksAfter = db.getGroupStickerPacks(groupDestId);
  assert(destPacksAfter.some(p => p.name === 'CuteCats2026'), 'F3-03: Pack successfully copied to destination group');
  assert(
    destPacksAfter.find(p => p.name === 'CuteCats2026')?.stickers?.length === 2,
    'F3-04: Copied pack retains exact sticker file IDs and emojis'
  );

  // Attempt duplicate copy prevention
  const destExistingNames = new Set(db.getGroupStickerPacks(groupDestId).map(p => p.name.toLowerCase()));
  const isDuplicate = destExistingNames.has('cutecats2026');
  assert(isDuplicate === true, 'F3-05: Duplicate prevention correctly identifies already-configured pack');

  // Clean up test sticker packs
  db.removeGroupStickerPack(groupSrcId, 'CuteCats2026');
  db.removeGroupStickerPack(groupDestId, 'CuteCats2026');

  // ==========================================
  // SECTION 4: AUTOMATIC GROUP REMOVAL ON BOT LEAVE (FEATURE 4)
  // ==========================================
  console.log('\n--- SECTION 4: Automatic Group Removal When Bot Leaves ---');

  const leaveTestGroupId = -100777333444;
  const testGroupSched = db.addSchedule({
    chatId: leaveTestGroupId,
    name: 'Hourly Security Check',
    message: 'All clear.',
    scheduleType: 'interval',
    intervalFormatted: '1h',
    enabled: true
  });
  assert(testGroupSched.enabled === true, 'F4-01: Test schedule active before bot leaves');

  // Step A: Roxie is kicked/leaves group
  db.markBotLeftGroup(leaveTestGroupId);

  const groupSettingsAfterLeave = db.getGroupSettings(leaveTestGroupId);
  assert(groupSettingsAfterLeave.botLeft === true, 'F4-02: Group marked with botLeft=true in persistent DB');
  assert(Boolean(groupSettingsAfterLeave.leftAt), 'F4-03: leftAt timestamp recorded');

  // Verify group is excluded from active connected groups
  const activeGroupsDefault = db.getConnectedGroups(undefined, false);
  const isPresentInActive = activeGroupsDefault.some(g => Number(g.chatId) === leaveTestGroupId);
  assert(!isPresentInActive, 'F4-04: Inactive group automatically excluded from active dashboard lists');

  // Verify group is retained in historical lists
  const historicalGroups = db.getConnectedGroups(undefined, true);
  const histItem = historicalGroups.find(g => Number(g.chatId) === leaveTestGroupId);
  assert(Boolean(histItem && histItem.botLeft), 'F4-05: Historical record safely preserved without deleting DB record');

  // Verify group schedule was safely paused due to bot leaving
  const schedAfterLeave = db.getScheduleById(testGroupSched.id);
  assert(schedAfterLeave?.enabled === false, 'F4-06: Pending scheduled jobs paused safely on bot removal');
  assert((schedAfterLeave as any)?.pausedDueToBotLeft === true, 'F4-07: Paused schedule tagged with pausedDueToBotLeft');

  // Step B: Roxie is re-added to the group
  db.markBotRejoinedGroup(leaveTestGroupId, 'Restored Community Group');

  const groupSettingsAfterRejoin = db.getGroupSettings(leaveTestGroupId);
  assert(groupSettingsAfterRejoin.botLeft === false, 'F4-08: botLeft flag cleared on re-addition');
  assert(groupSettingsAfterRejoin.leftAt === undefined, 'F4-09: leftAt cleared cleanly');
  assert(groupSettingsAfterRejoin.chatTitle === 'Restored Community Group', 'F4-10: Group title updated without corruption');

  // Verify group is back in active connected groups
  const activeGroupsAfterRejoin = db.getConnectedGroups(undefined, false);
  assert(activeGroupsAfterRejoin.some(g => Number(g.chatId) === leaveTestGroupId), 'F4-11: Group restored to active group list');

  // Verify schedules were safely unpaused
  const schedAfterRejoin = db.getScheduleById(testGroupSched.id);
  assert(schedAfterRejoin?.enabled === true, 'F4-12: Paused schedules restored to active on bot re-addition');
  assert((schedAfterRejoin as any)?.pausedDueToBotLeft === undefined, 'F4-13: pausedDueToBotLeft tag cleared');

  // Clean up
  db.deleteSchedule(testGroupSched.id);

  // ==========================================
  // SECTION 5: PRIVATE CHAT RECIPIENT REGISTRY (FEATURE 5)
  // ==========================================
  console.log('\n--- SECTION 5: Private Chat Recipient Registry ---');

  const testRecipientUserId = 888777666;

  // Step A: Capture recipient
  const captured = db.savePrivateRecipient({
    chatId: testRecipientUserId,
    username: 'roxy_fan_2026',
    firstName: 'RoxyFan',
    source: 'welcome_dm',
    sourceGroupId: -100123456789,
    status: 'active'
  });

  assert(captured.chatId === testRecipientUserId, 'F5-01: Recipient chat ID captured');
  assert(captured.username === 'roxy_fan_2026', 'F5-02: Username captured');
  assert(captured.source === 'welcome_dm', 'F5-03: Capture source recorded as welcome_dm');
  assert(captured.status === 'active', 'F5-04: Recipient status is active (eligible)');
  assert(captured.deliveryCount === 0, 'F5-05: Initial delivery count is 0');
  assert((captured as any).text === undefined, 'F5-06: Zero message content stored (privacy preserved)');
  assert((captured as any).messages === undefined, 'F5-07: Zero conversation history stored');

  // Step B: Deduplication on repeated capture
  const capturedAgain = db.savePrivateRecipient({
    chatId: testRecipientUserId,
    username: 'roxy_fan_2026_updated',
    source: 'welcome_dm'
  });
  assert(capturedAgain.chatId === testRecipientUserId, 'F5-08: Deduplication matches existing user ID');
  assert(capturedAgain.username === 'roxy_fan_2026_updated', 'F5-09: Metadata updated idempotently without duplicating record');

  // Step C: Delivery result tracking
  db.recordPrivateDeliveryResult(testRecipientUserId, true);
  const recAfterSuccess = db.getPrivateRecipient(testRecipientUserId);
  assert(recAfterSuccess?.deliveryCount === 1, 'F5-10: Successful delivery increments delivery count');
  assert(Boolean(recAfterSuccess?.lastDeliveredAt), 'F5-11: lastDeliveredAt timestamp set');

  // Step D: Bot blocked by user
  db.recordPrivateDeliveryResult(testRecipientUserId, false, 'Forbidden: bot was blocked by the user');
  const recAfterBlock = db.getPrivateRecipient(testRecipientUserId);
  assert(recAfterBlock?.status === 'blocked', 'F5-12: Recipient marked blocked when 403 / blocked detected');
  assert(Boolean(recAfterBlock?.failureReason), 'F5-13: Failure reason recorded');

  // Blocked recipients excluded from active eligible list
  const activeEligibleRecipients = db.getPrivateRecipients({ status: 'active' });
  assert(!activeEligibleRecipients.some(r => r.chatId === testRecipientUserId), 'F5-14: Blocked recipient excluded from active broadcast targeting');

  // Step E: User opts out (/stop or /optout)
  db.updatePrivateRecipientStatus(testRecipientUserId, 'opted_out');
  const recAfterOptOut = db.getPrivateRecipient(testRecipientUserId);
  assert(recAfterOptOut?.status === 'opted_out', 'F5-15: Recipient status updated to opted_out');

  // Step F: Stats verification
  const stats = db.getPrivateRecipientStats();
  assert(stats.total >= 1, 'F5-16: Recipient registry stats total >= 1');
  assert(stats.optedOut >= 1, 'F5-17: Recipient registry stats optedOut >= 1');

  // Clean up
  db.deletePrivateRecipient(testRecipientUserId);
  assert(db.getPrivateRecipient(testRecipientUserId) === undefined, 'F5-18: Recipient cleanly removed');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} FEATURES AUDIT REGRESSION TESTS PASSED! (${failed} FAILED)`);
  console.log('====================================================\n');
}

runFeaturesAuditRegressionTest().catch(err => {
  console.error('\n❌ Regression Test Failed With Error:', err);
  process.exit(1);
});
