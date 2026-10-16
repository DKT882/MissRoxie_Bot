process.env.NODE_ENV = 'test';
import { mentionAllService } from '../server/telegram/mentionAllService.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { mtprotoParticipantService } from '../server/telegram/mtprotoParticipantService.js';
import { mediaUploadStore } from '../server/telegram/mediaUploadStore.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING MENTION ALL DASHBOARD & TELEGRAM INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  const adminUserId = 888123;
  const regularUserId = 777456;

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentPhotos: Array<{ chatId: number; photo: any; options?: any }> = [];
  let sentVideos: Array<{ chatId: number; video: any; options?: any }> = [];
  let sentAnimations: Array<{ chatId: number; animation: any; options?: any }> = [];
  let sentDocuments: Array<{ chatId: number; document: any; options?: any }> = [];

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 999888, is_bot: true, username: 'MissRoxie_Bot', first_name: 'Miss Roxie' }
  });

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === adminUserId) {
      return {
        ok: true,
        result: {
          status: 'administrator',
          can_restrict_members: true,
          can_promote_members: true,
          can_delete_messages: true,
          user: { id: adminUserId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' }
        }
      };
    }
    return {
      ok: true,
      result: {
        status: 'member',
        user: { id: uId, is_bot: false, first_name: 'NormalUser', username: 'normal_user' }
      }
    };
  };

  const defaultSendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return {
      ok: true,
      result: {
        message_id: 1000 + sentMessages.length,
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };
  (telegramApi as any).sendMessage = defaultSendMessage;

  (telegramApi as any).sendPhoto = async (chatId: number, photo: any, options?: any) => {
    sentPhotos.push({ chatId, photo, options });
    return {
      ok: true,
      result: {
        message_id: 2000 + sentPhotos.length,
        photo: [{ file_id: 'cached_photo_file_id_999' }],
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).sendVideo = async (chatId: number, video: any, options?: any) => {
    sentVideos.push({ chatId, video, options });
    return {
      ok: true,
      result: {
        message_id: 3000 + sentVideos.length,
        video: { file_id: 'cached_video_file_id_888' },
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).sendAnimation = async (chatId: number, animation: any, options?: any) => {
    sentAnimations.push({ chatId, animation, options });
    return {
      ok: true,
      result: {
        message_id: 4000 + sentAnimations.length,
        animation: { file_id: 'cached_anim_file_id_777' },
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).sendDocument = async (chatId: number, document: any, options?: any) => {
    sentDocuments.push({ chatId, document, options });
    return {
      ok: true,
      result: {
        message_id: 5000 + sentDocuments.length,
        document: { file_id: 'cached_doc_file_id_666' },
        chat: { id: chatId, type: 'supergroup' },
        date: Math.floor(Date.now() / 1000)
      }
    };
  };

  (telegramApi as any).deleteMessage = async () => ({ ok: true });

  // -------------------------------------------------------------
  // Test 1: Dashboard Mention All starts and completes across batches
  // -------------------------------------------------------------
  console.log('--- Test 1: Dashboard Mention All starts and completes ---');
  const chat1 = -100996088451;
  sentMessages = [];
  mentionAllService.allMessageIntervalMs = 0;

  for (let i = 1; i <= 25; i++) {
    db.cacheUser({ id: 11000 + i, first_name: `DUser${i}`, username: `d_user_${i}`, is_bot: false }, chat1);
  }

  const startRes1 = await mentionAllService.startOperation({
    chatId: chat1,
    chatTitle: 'Dashboard Group 1',
    actor: {
      actorUserId: 99901,
      actorUsername: 'operator_dan',
      actorDisplayName: 'Dan (Operator)'
    },
    source: 'dashboard',
    messageText: 'Special Community Announcement',
    media: { contentType: 'text' },
    awaitWorker: true
  });

  assert(startRes1.ok === true, 'Dashboard startOperation succeeded');
  assert(startRes1.status === 'running', 'Status was running');
  assert(sentMessages.length === 3, `Sent 3 batches for 25 members (10, 10, 5) - got ${sentMessages.length}`);
  assert(sentMessages[0].text.includes('Special Community Announcement'), 'Batch 1 text includes announcement message');
  assert(sentMessages[0].text.includes('tg://user?id=11001'), 'Batch 1 includes first user mention');
  assert(sentMessages[2].text.includes('tg://user?id=11025'), 'Batch 3 includes last user mention');

  const status1 = mentionAllService.getOperationStatus(chat1);
  assert(status1.active === false, 'Operation is no longer active after completion');
  assert(status1.lastOperation?.status === 'completed', 'Last operation status recorded as completed');
  assert(status1.lastOperation?.totalBatches === 3, 'Last operation totalBatches = 3');
  assert(status1.lastOperation?.sentBatches === 3, 'Last operation sentBatches = 3');

  // -------------------------------------------------------------
  // Test 2: Dashboard Mention All cancelled by Dashboard Stop
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Dashboard Mention All stopped via Dashboard Stop ---');
  const chat2 = -100996088452;
  sentMessages = [];
  mentionAllService.allMessageIntervalMs = 200; // Pacing delay so we can intercept

  for (let i = 1; i <= 30; i++) {
    db.cacheUser({ id: 12000 + i, first_name: `CancelUser${i}`, username: `cancel_user_${i}`, is_bot: false }, chat2);
  }

  const broadcastPromise2 = mentionAllService.startOperation({
    chatId: chat2,
    chatTitle: 'Dashboard Group 2',
    actor: { actorUserId: 99901, actorUsername: 'operator_dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Will be stopped from dashboard',
    media: { contentType: 'text' },
    awaitWorker: true
  });

  // Give worker 40ms to send batch 1 and enter pacing sleep
  await new Promise(r => setTimeout(r, 40));

  const stopRes2 = await mentionAllService.stopOperation(chat2, {
    userId: 99902,
    username: 'operator_sara',
    displayName: 'Sara (Supervisor)'
  });

  assert(stopRes2.ok === true, 'Dashboard stopOperation returned ok');
  assert(stopRes2.status === 'stopped', 'stopOperation status is stopped');
  assert(stopRes2.sentBatches === 1, `Stopped after batch 1 (got ${stopRes2.sentBatches})`);
  assert(stopRes2.totalBatches === 3, `Total batches was 3 (got ${stopRes2.totalBatches})`);

  await broadcastPromise2;

  assert(!mentionAllService.hasActiveOperation(chat2), 'Chat 2 lock is released after dashboard stop');
  const status2 = mentionAllService.getOperationStatus(chat2);
  assert(status2.lastOperation?.status === 'cancelled', 'Summary status recorded as cancelled');
  assert(status2.lastOperation?.cancelledBy?.displayName === 'Sara (Supervisor)', 'Summary records who cancelled the operation');

  // -------------------------------------------------------------
  // Test 3: Cross-cancellation — Telegram /all stopped by Dashboard Stop
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Telegram /all stopped by Dashboard Stop button ---');
  const chat3 = -100996088453;
  sentMessages = [];
  mentionAllService.allMessageIntervalMs = 200;

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 13000 + i, first_name: `CrossUser${i}`, username: `cross_user_${i}`, is_bot: false }, chat3);
  }

  // Admin launches via Telegram command
  const tgBroadcastPromise = CommandHandler.handleCommand({
    command: '/all',
    args: ['Telegram announcement to be stopped by dashboard'],
    chatId: chat3,
    chatTitle: 'Telegram Chat 3',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 301, date: Math.floor(Date.now() / 1000), chat: { id: chat3, type: 'supergroup' } }
  });

  // Wait 40ms for batch 1 to send and pacing delay
  await new Promise(r => setTimeout(r, 40));

  // Dashboard Stop button is pressed
  const dashStopRes = await mentionAllService.stopOperation(chat3, {
    userId: 99903,
    username: 'dashboard_mod',
    displayName: 'Dashboard Moderator'
  });

  assert(dashStopRes.ok === true, 'Dashboard stop intercepted Telegram /all');
  assert(dashStopRes.sentBatches === 1, 'Only batch 1 was sent before dashboard stop');

  await tgBroadcastPromise;

  assert(!mentionAllService.hasActiveOperation(chat3), 'Operation lock cleared after cross-cancellation');
  assert(!mtprotoParticipantService.isChatLocked(chat3), 'MTProto lock cleared after cross-cancellation');

  // -------------------------------------------------------------
  // Test 4: Cross-cancellation — Dashboard Mention All stopped by Telegram /stopall
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Dashboard Mention All stopped by Telegram /stopall ---');
  const chat4 = -100996088454;
  sentMessages = [];
  mentionAllService.allMessageIntervalMs = 200;

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 14000 + i, first_name: `StopAllUser${i}`, username: `stopall_user_${i}`, is_bot: false }, chat4);
  }

  // Started from dashboard
  const dashStartPromise = mentionAllService.startOperation({
    chatId: chat4,
    chatTitle: 'Chat 4',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Dashboard broadcast to be stopped via /stopall',
    media: { contentType: 'text' },
    awaitWorker: true
  });

  // Wait 40ms
  await new Promise(r => setTimeout(r, 40));

  // Admin types /stopall in Telegram
  await CommandHandler.handleCommand({
    command: '/stopall',
    args: [],
    chatId: chat4,
    chatTitle: 'Chat 4',
    isAnonymousAdmin: false,
    adminDisplayName: 'AdminUser',
    sender: { id: adminUserId, first_name: 'AdminUser', is_bot: false },
    message: { message_id: 401, date: Math.floor(Date.now() / 1000), chat: { id: chat4, type: 'supergroup' } }
  });

  await dashStartPromise;

  const stopConfirmMsg = sentMessages.find(m => m.text.includes('Broadcast Stopped'));
  assert(Boolean(stopConfirmMsg), 'Telegram received /stopall confirmation');
  assert(stopConfirmMsg?.text.includes('Sent <b>1</b> of <b>2</b> batch(es)'), 'Confirmation reports exact batch counts');
  assert(!mentionAllService.hasActiveOperation(chat4), 'Lock cleared after /stopall');

  // -------------------------------------------------------------
  // Test 5: Concurrency Lock — Reject duplicate start for same group
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Concurrency protection rejects duplicate start for same group ---');
  const chat5 = -100997174181;
  sentMessages = [];
  mentionAllService.allMessageIntervalMs = 200;

  for (let i = 1; i <= 15; i++) {
    db.cacheUser({ id: 15000 + i, first_name: `LockUser${i}`, username: `lock_user_${i}`, is_bot: false }, chat5);
  }

  const p1 = mentionAllService.startOperation({
    chatId: chat5,
    chatTitle: 'Chat 5',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Broadcast 1',
    media: { contentType: 'text' },
    awaitWorker: true
  });

  await new Promise(r => setTimeout(r, 30));

  // Second start for same group must be rejected immediately
  const p2 = await mentionAllService.startOperation({
    chatId: chat5,
    chatTitle: 'Chat 5',
    actor: { actorUserId: 99902, actorUsername: 'sara', actorDisplayName: 'Sara' },
    source: 'dashboard',
    messageText: 'Broadcast 2 conflict',
    media: { contentType: 'text' },
    awaitWorker: true
  });

  assert(p2.ok === false, 'Second broadcast was rejected');
  assert(p2.status === 'already_running', 'Status is already_running');

  // Clean up p1
  await mentionAllService.stopOperation(chat5, { displayName: 'Admin' });
  await p1;

  // -------------------------------------------------------------
  // Test 6: Media support — Photo Announcement across batches with Telegram file_id reuse
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Media support — Photo announcement caches file_id across batches ---');
  const chat6 = -100997174182;
  sentPhotos = [];
  mentionAllService.allMessageIntervalMs = 0;

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 16000 + i, first_name: `PhotoUser${i}`, username: `photo_user_${i}`, is_bot: false }, chat6);
  }

  // Store a mock uploaded media buffer in mediaUploadStore
  const uploadItem = mediaUploadStore.storeMedia(
    Buffer.from('fake_image_bytes_here'),
    'announcement.png',
    'image/png'
  );

  await mentionAllService.startOperation({
    chatId: chat6,
    chatTitle: 'Photo Chat 6',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Big Summer Sale Announcement!',
    media: {
      contentType: 'photo',
      mediaUploadId: uploadItem.id
    },
    awaitWorker: true
  });

  assert(sentPhotos.length === 2, `Sent 2 photo batches (got ${sentPhotos.length})`);
  // Batch 1 sent the buffer/upload
  assert(typeof sentPhotos[0].photo === 'object' && sentPhotos[0].photo.filename === 'announcement.png', 'Batch 1 used original uploaded buffer');
  // Batch 2 reused the Telegram file_id returned by batch 1 ('cached_photo_file_id_999')
  assert(sentPhotos[1].photo === 'cached_photo_file_id_999', `Batch 2 reused Telegram file_id without re-uploading (got: ${sentPhotos[1].photo})`);
  assert(sentPhotos[0].options?.caption.includes('Big Summer Sale Announcement!'), 'Batch 1 caption contains announcement');
  assert(sentPhotos[1].options?.caption.includes('Big Summer Sale Announcement!'), 'Batch 2 caption contains announcement and mentions');

  // -------------------------------------------------------------
  // Test 7: Media support — Video, Animation, and Document
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Media support — Video, Animation, and Document ---');
  const chat7 = -100997174183;
  sentVideos = [];
  sentAnimations = [];
  sentDocuments = [];

  for (let i = 1; i <= 10; i++) {
    db.cacheUser({ id: 17000 + i, first_name: `MediaUser${i}`, username: `media_user_${i}`, is_bot: false }, chat7);
  }

  // Video
  await mentionAllService.startOperation({
    chatId: chat7,
    chatTitle: 'Chat 7',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Check our new video release',
    media: { contentType: 'video', mediaFileId: 'initial_video_file_id_123' },
    awaitWorker: true
  });
  assert(sentVideos.length >= 1, `Video announcement sent via sendVideo (got ${sentVideos.length})`);
  assert(sentVideos[0].options?.caption.includes('Check our new video release'), 'Video caption formatted properly');

  // Animation / GIF
  await mentionAllService.startOperation({
    chatId: chat7,
    chatTitle: 'Chat 7',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Celebration GIF',
    media: { contentType: 'animation', mediaFileId: 'initial_anim_file_id_456' },
    awaitWorker: true
  });
  assert(sentAnimations.length >= 1, `Animation announcement sent via sendAnimation (got ${sentAnimations.length})`);
  assert(sentAnimations[0].options?.caption.includes('Celebration GIF'), 'Animation caption formatted properly');

  // Document
  await mentionAllService.startOperation({
    chatId: chat7,
    chatTitle: 'Chat 7',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Read the official guidelines PDF',
    media: { contentType: 'document', mediaFileId: 'guidelines_doc_789' },
    awaitWorker: true
  });
  assert(sentDocuments.length >= 1, `Document announcement sent via sendDocument (got ${sentDocuments.length})`);
  assert(sentDocuments[0].options?.caption.includes('Read the official guidelines PDF'), 'Document caption formatted properly');

  // -------------------------------------------------------------
  // Test 8: Active Operations registry and list endpoint
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Active Operations listing across groups ---');
  const chat8A = -100997174184;
  const chat8B = -100997174185;
  mentionAllService.allMessageIntervalMs = 500;

  for (let i = 1; i <= 20; i++) {
    db.cacheUser({ id: 18000 + i, first_name: `U8A${i}`, username: `u8a_${i}`, is_bot: false }, chat8A);
    db.cacheUser({ id: 19000 + i, first_name: `U8B${i}`, username: `u8b_${i}`, is_bot: false }, chat8B);
  }

  const p8A = mentionAllService.startOperation({
    chatId: chat8A,
    chatTitle: 'Chat 8A',
    actor: { actorUserId: 99901, actorUsername: 'dan', actorDisplayName: 'Dan' },
    source: 'dashboard',
    messageText: 'Parallel 8A',
    media: { contentType: 'text' },
    awaitWorker: false
  });

  const p8B = mentionAllService.startOperation({
    chatId: chat8B,
    chatTitle: 'Chat 8B',
    actor: { actorUserId: 99902, actorUsername: 'sara', actorDisplayName: 'Sara' },
    source: 'command',
    messageText: 'Parallel 8B',
    media: { contentType: 'text' },
    awaitWorker: false
  });

  await new Promise(r => setTimeout(r, 40));

  const activeList = mentionAllService.getActiveOperationsList();
  assert(activeList.length === 2, `getActiveOperationsList returns both active groups (got ${activeList.length})`);
  assert(activeList.some(op => op.chatId === chat8A && op.source === 'dashboard'), 'Chat 8A listed with source: dashboard');
  assert(activeList.some(op => op.chatId === chat8B && op.source === 'command'), 'Chat 8B listed with source: command');

  // Clean up
  await mentionAllService.stopOperation(chat8A, { displayName: 'Admin' });
  await mentionAllService.stopOperation(chat8B, { displayName: 'Admin' });
  await Promise.all([p8A, p8B]);

  assert(mentionAllService.getActiveOperationsList().length === 0, 'Active operations list is empty after stops');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
