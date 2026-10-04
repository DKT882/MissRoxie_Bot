process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender, validateMediaReference, sanitizeInlineButtons, isValidHttpUrl } from '../server/telegram/postSender.js';
import { ScheduledMessage, PostPayload } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runDashboardRichPostComposerTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING DASHBOARD RICH POST COMPOSER TEST SUITE (PHASE 4)');
  console.log('================================================================\n');

  const testChatId = -100555666777;
  const testChatTitle = 'Test Rich Post Group';

  // Ensure test group exists in DB
  db.getGroupSettings(testChatId, testChatTitle);
  db.updateGroupSettings(testChatId, {
    botLeft: false,
    unavailable: false,
    chatTitle: testChatTitle
  });

  // Track Telegram API calls
  const apiCalls: Array<{ method: string; args: any }> = [];
  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origSendPhoto = telegramApi.sendPhoto.bind(telegramApi);
  const origSendVideo = telegramApi.sendVideo.bind(telegramApi);
  const origSendDocument = telegramApi.sendDocument.bind(telegramApi);
  const origSendAnimation = telegramApi.sendAnimation.bind(telegramApi);
  const origPinChatMessage = telegramApi.pinChatMessage.bind(telegramApi);
  const origGetMe = telegramApi.getMe.bind(telegramApi);
  const origGetChatMember = telegramApi.getChatMember.bind(telegramApi);

  let nextMessageId = 70001;

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 999888, is_bot: true, username: 'RoxieBot', first_name: 'Roxie' }
  });

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => ({
    ok: true,
    result: {
      status: 'administrator',
      can_pin_messages: true,
      user: { id: uId, is_bot: true, first_name: 'Roxie' }
    }
  });

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    apiCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    apiCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: string, options?: any) => {
    apiCalls.push({ method: 'sendVideo', args: { chatId, video, options } });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: string, options?: any) => {
    apiCalls.push({ method: 'sendDocument', args: { chatId, document, options } });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: string, options?: any) => {
    apiCalls.push({ method: 'sendAnimation', args: { chatId, animation, options } });
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).pinChatMessage = async (chatId: number | string, messageId: number, options?: any) => {
    apiCalls.push({ method: 'pinChatMessage', args: { chatId, messageId, options } });
    return { ok: true, result: true };
  };

  // Helper function to simulate POST /api/dashboard/posts/send
  async function simulateDashboardSend(req: {
    headers?: Record<string, string>;
    body: {
      chatId: number | string;
      payload: any;
    };
  }) {
    const { chatId, payload } = req.body;
    const numChatId = Number(chatId);
    if (!numChatId || isNaN(numChatId)) {
      return { status: 400, body: { error: 'Valid target chatId is required.' } };
    }

    if (numChatId === -100111222333 || String(chatId).includes('100111222333')) {
      return { status: 400, body: { error: 'Target chatId is a blocked legacy test destination.' } };
    }

    const isGroupConnected = db.getConnectedGroups().some(g => g.chatId === numChatId || Number(g.chatId) === numChatId);
    if (!isGroupConnected) {
      return { status: 404, body: { error: 'Target group not found in database.' } };
    }
    const groupSettings = db.getGroupSettings(numChatId);

    if (!payload || typeof payload !== 'object') {
      return { status: 400, body: { error: 'Post payload is required.' } };
    }

    const contentType = payload.contentType || 'text';
    const validTypes = ['text', 'photo', 'video', 'animation', 'document'];
    if (!validTypes.includes(contentType)) {
      return { status: 400, body: { error: `Unsupported content type: ${contentType}` } };
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const maxTextLen = contentType === 'text' ? 4096 : 1024;
    if (text.length > maxTextLen) {
      return { status: 400, body: { error: `Text/caption exceeds maximum length (${text.length}/${maxTextLen} characters).` } };
    }

    if (contentType === 'text' && !text) {
      return { status: 400, body: { error: 'Message text cannot be empty for text posts.' } };
    }

    let normalizedMediaId: string | undefined = undefined;
    if (contentType !== 'text') {
      const mediaCheck = validateMediaReference(payload.mediaFileId);
      if (!mediaCheck.valid) {
        return { status: 400, body: { error: mediaCheck.error || `Invalid media reference for ${contentType} posts.` } };
      }
      normalizedMediaId = mediaCheck.normalized;
    }

    const sanitizedButtons = sanitizeInlineButtons(payload.buttons);

    const postPayload: PostPayload = {
      contentType,
      text: text || undefined,
      mediaFileId: normalizedMediaId,
      buttons: sanitizedButtons,
      pinAfterSend: Boolean(payload.pinAfterSend),
      replyToLatest: Boolean(payload.replyToLatest),
      replyToMessageId: payload.replyToMessageId ? Number(payload.replyToMessageId) : undefined,
      protectContent: Boolean(payload.protectContent)
    };

    const sendResult = await PostSender.send(numChatId, postPayload);

    if (sendResult.ok) {
      db.addLog({
        chatId: numChatId,
        chatTitle: groupSettings.chatTitle || `Chat ${numChatId}`,
        adminUsername: 'dashboard_admin',
        action: 'broadcast',
        details: `Sent rich ${contentType.toUpperCase()} post via Dashboard Composer (Telegram msg #${sendResult.messageId || 'unknown'})`
      });
      return { status: 200, body: { success: true, result: sendResult } };
    } else {
      return { status: 502, body: { success: false, error: sendResult.error, result: sendResult } };
    }
  }

  // Helper function to simulate POST /api/dashboard/posts/schedule
  async function simulateDashboardSchedule(req: {
    headers?: Record<string, string>;
    body: {
      chatId: number | string;
      payload: any;
      nextRun: string;
      timezone?: string;
      name?: string;
    };
  }) {
    const { chatId, payload, nextRun, timezone, name } = req.body;
    const numChatId = Number(chatId);
    if (!numChatId || isNaN(numChatId)) {
      return { status: 400, body: { error: 'Valid target chatId is required.' } };
    }

    if (numChatId === -100111222333 || String(chatId).includes('100111222333')) {
      return { status: 400, body: { error: 'Target chatId is a blocked legacy test destination.' } };
    }

    const groupSettings = db.getGroupSettings(numChatId);
    if (!groupSettings) {
      return { status: 404, body: { error: 'Target group not found in database.' } };
    }

    if (!payload || typeof payload !== 'object') {
      return { status: 400, body: { error: 'Post payload is required.' } };
    }

    const contentType = payload.contentType || 'text';
    const validTypes = ['text', 'photo', 'video', 'animation', 'document'];
    if (!validTypes.includes(contentType)) {
      return { status: 400, body: { error: `Unsupported content type: ${contentType}` } };
    }

    const text = typeof payload.text === 'string' ? payload.text.trim() : '';
    const maxTextLen = contentType === 'text' ? 4096 : 1024;
    if (text.length > maxTextLen) {
      return { status: 400, body: { error: `Text/caption exceeds maximum length (${text.length}/${maxTextLen} characters).` } };
    }

    if (contentType === 'text' && !text) {
      return { status: 400, body: { error: 'Message text cannot be empty for text posts.' } };
    }

    let scheduledMediaId: string | undefined = undefined;
    if (contentType !== 'text') {
      const isLocalUpload = Boolean(
        payload.mediaUploadId ||
        (payload.mediaFileId && (
          payload.mediaFileId.startsWith('upl_') ||
          payload.mediaFileId.startsWith('upload:') ||
          payload.mediaFileId.startsWith('blob:') ||
          payload.mediaFileId.startsWith('data:') ||
          payload.mediaFileId.startsWith('local_preview_')
        ))
      );

      if (isLocalUpload) {
        return {
          status: 400,
          body: {
            error: 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.'
          }
        };
      }

      const mediaCheck = validateMediaReference(payload.mediaFileId);
      if (!mediaCheck.valid) {
        return { status: 400, body: { error: mediaCheck.error || `Invalid media reference for ${contentType} posts.` } };
      }
      scheduledMediaId = mediaCheck.normalized;
    }

    if (!nextRun || isNaN(new Date(nextRun).getTime())) {
      return { status: 400, body: { error: 'Valid nextRun ISO date/time string is required.' } };
    }

    const targetNextRunTime = new Date(nextRun).getTime();
    if (targetNextRunTime <= Date.now()) {
      return { status: 400, body: { error: 'Scheduled execution time must be in the future.' } };
    }

    const sanitizedButtons = sanitizeInlineButtons(payload.buttons);

    const scheduleRecord = db.addSchedule({
      chatId: numChatId,
      chatTitle: groupSettings.chatTitle || `Chat ${numChatId}`,
      name: name || (text.slice(0, 30) || `Rich ${contentType.toUpperCase()} Schedule`),
      message: text || `[${contentType.toUpperCase()}]`,
      messageText: text,
      scheduleType: 'one_time',
      nextRun: new Date(nextRun).toISOString(),
      timezone: timezone || 'UTC',
      contentType,
      mediaFileId: scheduledMediaId,
      replyToMessageId: payload.replyToMessageId ? Number(payload.replyToMessageId) : undefined,
      replyToLatest: Boolean(payload.replyToLatest),
      autoDeletePrevious: Boolean(payload.autoDeletePrevious),
      pinAfterSend: Boolean(payload.pinAfterSend),
      inlineKeyboard: sanitizedButtons,
      enabled: true,
      adminUsername: 'dashboard_admin',
      lastStatus: 'pending'
    });

    db.addLog({
      chatId: numChatId,
      chatTitle: groupSettings.chatTitle || `Chat ${numChatId}`,
      adminUsername: 'dashboard_admin',
      action: 'schedule_created',
      details: `Scheduled rich ${contentType.toUpperCase()} post [${scheduleRecord.id}] via Dashboard Composer for ${scheduleRecord.nextRun}`
    });

    return { status: 200, body: { success: true, schedule: scheduleRecord } };
  }

  // --- Test 1: Send Now - Plain Text Post ---
  apiCalls.length = 0;
  const res1 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'text',
        text: 'Hello from Dashboard Composer!'
      }
    }
  });
  assert(res1.status === 200 && res1.body.success === true, '1. Send Now creates valid text post successfully');
  assert(apiCalls.length === 1 && apiCalls[0].method === 'sendMessage', '1b. Dispatched through TelegramApi.sendMessage');
  assert(apiCalls[0].args.text === 'Hello from Dashboard Composer!', '1c. Message text matches payload');

  // --- Test 2: Send Now - Photo Post with 2D Buttons Grid ---
  apiCalls.length = 0;
  const res2 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'photo',
        mediaFileId: 'photo_file_id_999888',
        text: 'Check out our new products!',
        buttons: [
          [
            { text: 'Shop Now', url: 'https://shop.example.com' },
            { text: 'Catalog', url: 'https://catalog.example.com' }
          ],
          [
            { text: 'Support', url: 'https://help.example.com' }
          ]
        ]
      }
    }
  });
  assert(res2.status === 200 && res2.body.success === true, '2. Send Now photo post with 2D button grid succeeds');
  assert(apiCalls.length === 1 && apiCalls[0].method === 'sendPhoto', '2b. Dispatched through TelegramApi.sendPhoto');
  assert(apiCalls[0].args.photo === 'photo_file_id_999888', '2c. Photo file_id preserved');
  assert(apiCalls[0].args.options.caption === 'Check out our new products!', '2d. Caption preserved');
  assert(apiCalls[0].args.options.reply_markup.inline_keyboard.length === 2, '2e. Two button rows preserved');
  assert(apiCalls[0].args.options.reply_markup.inline_keyboard[0].length === 2, '2f. Row 1 has 2 buttons');
  assert(apiCalls[0].args.options.reply_markup.inline_keyboard[1].length === 1, '2g. Row 2 has 1 button');

  // --- Test 3: Send Now - Video Post with Pinning ---
  apiCalls.length = 0;
  const res3 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'video',
        mediaFileId: 'video_file_id_12345',
        text: 'Watch our webinar',
        pinAfterSend: true
      }
    }
  });
  assert(res3.status === 200 && res3.body.success === true, '3. Send Now video post with pinAfterSend succeeds');
  assert(apiCalls.length === 2, '3b. Made 2 Telegram calls (sendVideo + pinChatMessage)');
  assert(apiCalls[0].method === 'sendVideo' && apiCalls[1].method === 'pinChatMessage', '3c. Sent video then pinned message');
  assert(apiCalls[1].args.messageId === res3.body.result.messageId, '3d. Pinned exact sent message ID');

  // --- Test 4: Send Now - Animation/GIF Post ---
  apiCalls.length = 0;
  const res4 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'animation',
        mediaFileId: 'gif_file_id_555',
        text: 'Happy Friday!'
      }
    }
  });
  assert(res4.status === 200 && res4.body.success === true, '4. Send Now animation/GIF succeeds');
  assert(apiCalls.length === 1 && apiCalls[0].method === 'sendAnimation', '4b. Dispatched through sendAnimation');

  // --- Test 5: Send Now - Document Post ---
  apiCalls.length = 0;
  const res5 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'document',
        mediaFileId: 'doc_file_id_777',
        text: 'Monthly financial report'
      }
    }
  });
  assert(res5.status === 200 && res5.body.success === true, '5. Send Now document succeeds');
  assert(apiCalls.length === 1 && apiCalls[0].method === 'sendDocument', '5b. Dispatched through sendDocument');

  // --- Test 6: Button URL Security Sanitization ---
  apiCalls.length = 0;
  const res6 = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'text',
        text: 'Security check post',
        buttons: [
          [
            { text: 'Evil JS', url: 'javascript:alert(1)' },
            { text: 'Evil Data', url: 'data:text/html,<script>' },
            { text: 'Valid Link', url: 'https://safe.example.com' }
          ]
        ]
      }
    }
  });
  assert(res6.status === 200, '6. Button sanitization executes safely');
  const sanitizedRow = apiCalls[0].args.options.reply_markup.inline_keyboard[0];
  assert(sanitizedRow.length === 1, '6b. Stripped unsafe URLs and kept only valid HTTPS button');
  assert(sanitizedRow[0].text === 'Valid Link', '6c. Kept valid button text');

  // --- Test 7: Validation Failures (Empty Text, Missing Media, Oversized Content) ---
  const res7a = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: { contentType: 'text', text: '' }
    }
  });
  assert(res7a.status === 400 && res7a.body.error.includes('empty'), '7a. Rejects empty text for text post');

  const res7b = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: { contentType: 'photo', text: 'caption' } // missing mediaFileId
    }
  });
  assert(res7b.status === 400 && res7b.body.error.includes('Media reference'), '7b. Rejects photo post missing mediaFileId');

  const res7c = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: { contentType: 'photo', mediaFileId: 'pic123', text: 'a'.repeat(1050) } // >1024
    }
  });
  assert(res7c.status === 400 && res7c.body.error.includes('exceeds maximum length'), '7c. Rejects caption exceeding 1024 characters');

  // --- Test 8: Blocked Legacy Chat ID Rejection ---
  const res8 = await simulateDashboardSend({
    body: {
      chatId: -100111222333,
      payload: { contentType: 'text', text: 'test' }
    }
  });
  assert(res8.status === 400 && res8.body.error.includes('blocked legacy test destination'), '8. Blocks legacy test chat ID');

  // --- Test 9: Non-existent Target Chat ---
  const res9 = await simulateDashboardSend({
    body: {
      chatId: -999999999999,
      payload: { contentType: 'text', text: 'test' }
    }
  });
  assert(res9.status === 404 && res9.body.error.includes('not found'), '9. Rejects non-existent chat ID');

  // --- Test 10: Schedule Rich Post - Valid One-Time Future Schedule ---
  const futureIso = new Date(Date.now() + 3600000).toISOString(); // +1 hour
  const res10 = await simulateDashboardSchedule({
    body: {
      chatId: testChatId,
      nextRun: futureIso,
      payload: {
        contentType: 'photo',
        mediaFileId: 'scheduled_photo_999',
        text: 'Scheduled promo banner',
        buttons: [
          [
            { text: 'Claim Discount', url: 'https://promo.example.com' }
          ]
        ],
        pinAfterSend: true,
        replyToLatest: true
      }
    }
  });
  assert(res10.status === 200 && res10.body.success === true, '10. Creates scheduled rich post record in database');
  const createdSchedule = res10.body.schedule as ScheduledMessage;
  assert(createdSchedule.contentType === 'photo', '10b. Preserved contentType');
  assert(createdSchedule.mediaFileId === 'scheduled_photo_999', '10c. Preserved mediaFileId');
  assert(createdSchedule.messageText === 'Scheduled promo banner', '10d. Preserved caption');
  assert(createdSchedule.nextRun === futureIso, '10e. Preserved exact nextRun ISO timestamp');
  assert(createdSchedule.pinAfterSend === true, '10f. Preserved pinAfterSend flag');
  assert(createdSchedule.replyToLatest === true, '10g. Preserved replyToLatest flag');
  assert(createdSchedule.inlineKeyboard && createdSchedule.inlineKeyboard[0][0].text === 'Claim Discount', '10h. Preserved inline buttons');

  // --- Test 11: Schedule Validation Failures ---
  const pastIso = new Date(Date.now() - 60000).toISOString(); // -1 minute
  const res11a = await simulateDashboardSchedule({
    body: {
      chatId: testChatId,
      nextRun: pastIso,
      payload: { contentType: 'text', text: 'past message' }
    }
  });
  assert(res11a.status === 400 && res11a.body.error.includes('future'), '11a. Rejects schedule time in the past');

  const res11b = await simulateDashboardSchedule({
    body: {
      chatId: testChatId,
      nextRun: 'invalid-date-string',
      payload: { contentType: 'text', text: 'invalid date' }
    }
  });
  assert(res11b.status === 400 && res11b.body.error.includes('Valid nextRun'), '11b. Rejects invalid date format');

  // --- Test 12: Scheduled Rich Post Delivery Execution via MessageScheduler & PostSender ---
  apiCalls.length = 0;
  // Adapt created schedule to PostPayload and execute through PostSender
  const payloadFromSchedule = PostSender.scheduleToPayload(createdSchedule);
  const execResult = await PostSender.send(createdSchedule.chatId, payloadFromSchedule);
  assert(execResult.ok === true, '12. Scheduled message payload executes cleanly through PostSender');
  assert(apiCalls.length === 2, '12b. Dispatched sendPhoto and pinChatMessage');
  assert(apiCalls[0].method === 'sendPhoto' && apiCalls[0].args.photo === 'scheduled_photo_999', '12c. Used scheduled photo');
  assert(apiCalls[0].args.options.caption === 'Scheduled promo banner', '12d. Used scheduled caption');
  assert(apiCalls[0].args.options.reply_markup.inline_keyboard[0][0].url.startsWith('https://promo.example.com'), '12e. Attached scheduled button');

  // --- Test 13: Clean up test schedule ---
  db.deleteSchedule(testChatId, createdSchedule.id);
  assert(db.getScheduleById(createdSchedule.id) === undefined, '13. Test schedule cleaned up from storage');

  // --- Test 14: Rejection of Local Preview / Blob / Data URL Media References (BUG FIX VERIFICATION) ---
  console.log('\n--- Test 14: Rejection of Local Browser File / Blob / Data URLs ---');
  const res14a = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'photo',
        mediaFileId: 'local_preview_my_image.png',
        text: 'Photo with local preview name'
      }
    }
  });
  assert(res14a.status === 400 && res14a.body.error.includes('Local browser files'), '14a. Rejects local_preview_ filename with helpful 400 error');

  const res14b = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'video',
        mediaFileId: 'blob:http://localhost:3000/1234-5678',
        text: 'Video with blob URL'
      }
    }
  });
  assert(res14b.status === 400 && res14b.body.error.includes('Local browser files'), '14b. Rejects blob: URL with 400 error');

  const res14c = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'animation',
        mediaFileId: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        text: 'GIF with data URL'
      }
    }
  });
  assert(res14c.status === 400 && res14c.body.error.includes('Local browser files'), '14c. Rejects data: URL with 400 error');

  const res14d = await simulateDashboardSchedule({
    body: {
      chatId: testChatId,
      nextRun: futureIso,
      payload: {
        contentType: 'photo',
        mediaFileId: 'local_preview_photo.jpg',
        text: 'Scheduled local preview'
      }
    }
  });
  assert(res14d.status === 400 && res14d.body.error.includes('Local media cannot be scheduled'), '14d. Scheduler rejects local_preview_ filename with hosting notice');

  const res14e = await simulateDashboardSchedule({
    body: {
      chatId: testChatId,
      nextRun: futureIso,
      payload: {
        contentType: 'photo',
        mediaUploadId: 'upl_12345678_abcdef',
        text: 'Scheduled local upload'
      }
    }
  });
  assert(res14e.status === 400 && res14e.body.error === 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.', '14e. Scheduler rejects uploaded media with exact hosting message');

  // --- Test 15: Acceptance of Valid Public HTTPS URLs and Telegram File IDs ---
  console.log('\n--- Test 15: Acceptance and Normalization of Valid Public Media URLs and File IDs ---');
  apiCalls.length = 0;
  const res15a = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'photo',
        mediaFileId: 'https://images.unsplash.com/photo-1546527868-ccb7ee7dfa6a?auto=format',
        text: 'Valid public URL photo'
      }
    }
  });
  assert(res15a.status === 200 && res15a.body.success === true, '15a. Accepts valid public HTTPS photo URL');
  assert(apiCalls[0].method === 'sendPhoto' && apiCalls[0].args.photo.startsWith('https://images.unsplash.com/'), '15b. TelegramApi received normalized HTTPS URL');

  const res15c = await simulateDashboardSend({
    body: {
      chatId: testChatId,
      payload: {
        contentType: 'video',
        mediaFileId: 'BAACAgIAAxkBAAI9...',
        text: 'Valid telegram file_id video'
      }
    }
  });
  assert(res15c.status === 200 && res15c.body.success === true, '15c. Accepts valid Telegram file_id');

  // --- Test 16: Button URL Validation & Sanitization ---
  console.log('\n--- Test 16: Button URL Sanitization ---');
  const validCheck1 = isValidHttpUrl('https://example.com/path');
  assert(validCheck1 === true, '16a. isValidHttpUrl accepts valid HTTPS URL');
  const invalidCheck1 = isValidHttpUrl('http://localhost:3000');
  assert(invalidCheck1 === false, '16b. isValidHttpUrl rejects localhost');
  const invalidCheck2 = isValidHttpUrl('https://test');
  assert(invalidCheck2 === false, '16c. isValidHttpUrl rejects single-word hostname without TLD');
  const invalidCheck3 = isValidHttpUrl('javascript:alert(1)');
  assert(invalidCheck3 === false, '16d. isValidHttpUrl rejects javascript: pseudo-protocol');

  // Restore API methods
  (telegramApi as any).sendMessage = origSendMessage;
  (telegramApi as any).sendPhoto = origSendPhoto;
  (telegramApi as any).sendVideo = origSendVideo;
  (telegramApi as any).sendDocument = origSendDocument;
  (telegramApi as any).sendAnimation = origSendAnimation;
  (telegramApi as any).pinChatMessage = origPinChatMessage;
  (telegramApi as any).getMe = origGetMe;
  (telegramApi as any).getChatMember = origGetChatMember;

  console.log('\n================================================================');
  console.log(`🎉 DASHBOARD RICH POST COMPOSER SUITE: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDashboardRichPostComposerTestSuite().catch((err) => {
  console.error('Fatal error in dashboardRichPostComposerTestSuite:', err);
  process.exit(1);
});
