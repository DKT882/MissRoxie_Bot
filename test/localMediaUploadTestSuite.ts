process.env.NODE_ENV = 'test';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender, validateMediaReference, sanitizeInlineButtons, isValidHttpUrl } from '../server/telegram/postSender.js';
import { ScheduledMessage, PostPayload } from '../server/telegram/types.js';
import { mediaUploadStore, MediaUploadStore } from '../server/telegram/mediaUploadStore.js';
import path from 'path';
import fs from 'fs';

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

async function runLocalMediaUploadTestSuite() {
  console.log('================================================================');
  console.log('🧪 STARTING LOCAL MEDIA UPLOAD TEST SUITE');
  console.log('================================================================\n');

  const testChatId = -100666777888;
  const testChatTitle = 'Test Upload Delivery Group';

  // Ensure test group exists in DB
  db.getGroupSettings(testChatId, testChatTitle);
  db.updateGroupSettings(testChatId, {
    botLeft: false,
    unavailable: false,
    chatTitle: testChatTitle
  });

  // Track Telegram API calls
  const apiCalls: Array<{ method: string; args: any; isFormData?: boolean }> = [];
  const origSendPhoto = telegramApi.sendPhoto.bind(telegramApi);
  const origSendVideo = telegramApi.sendVideo.bind(telegramApi);
  const origSendDocument = telegramApi.sendDocument.bind(telegramApi);
  const origSendAnimation = telegramApi.sendAnimation.bind(telegramApi);
  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);

  let nextMessageId = 88001;

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: any, options?: any) => {
    const isBuffer = typeof photo === 'object' && photo && 'buffer' in photo;
    apiCalls.push({ method: 'sendPhoto', args: { chatId, photo, options }, isFormData: isBuffer });
    return {
      ok: true,
      result: {
        message_id: nextMessageId++,
        chat: { id: chatId },
        photo: [
          { file_id: 'thumb_file_123', width: 100, height: 100 },
          { file_id: 'AgACAgIAAxkBAAI_photo_highest_res_id', width: 800, height: 600 }
        ],
        caption: options?.caption
      }
    };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: any, options?: any) => {
    const isBuffer = typeof video === 'object' && video && 'buffer' in video;
    apiCalls.push({ method: 'sendVideo', args: { chatId, video, options }, isFormData: isBuffer });
    return {
      ok: true,
      result: {
        message_id: nextMessageId++,
        chat: { id: chatId },
        video: { file_id: 'BAACAgIAAxkBAAI_video_file_id', duration: 12 },
        caption: options?.caption
      }
    };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: any, options?: any) => {
    const isBuffer = typeof document === 'object' && document && 'buffer' in document;
    apiCalls.push({ method: 'sendDocument', args: { chatId, document, options }, isFormData: isBuffer });
    return {
      ok: true,
      result: {
        message_id: nextMessageId++,
        chat: { id: chatId },
        document: { file_id: 'BQACAgIAAxkBAAI_document_file_id', file_name: 'report.pdf' },
        caption: options?.caption
      }
    };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: any, options?: any) => {
    const isBuffer = typeof animation === 'object' && animation && 'buffer' in animation;
    apiCalls.push({ method: 'sendAnimation', args: { chatId, animation, options }, isFormData: isBuffer });
    return {
      ok: true,
      result: {
        message_id: nextMessageId++,
        chat: { id: chatId },
        animation: { file_id: 'CgACAgIAAxkBAAI_animation_file_id', duration: 3 },
        caption: options?.caption
      }
    };
  };

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    apiCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    return {
      ok: true,
      result: {
        message_id: nextMessageId++,
        chat: { id: chatId },
        text
      }
    };
  };

  try {
    // -------------------------------------------------------------
    // SECTION 1: MediaUploadStore Unit Tests & Safety Validation
    // -------------------------------------------------------------
    console.log('--- SECTION 1: MediaUploadStore Unit & Validation Tests ---');

    // 1.1 Store a sample photo buffer
    const samplePhotoBuffer = Buffer.from('fake_jpeg_binary_data_header_bytes_12345');
    const storedPhoto = mediaUploadStore.storeMedia(samplePhotoBuffer, 'test_image.jpg', 'image/jpeg');
    assert(Boolean(storedPhoto.id && storedPhoto.id.startsWith('upl_')), 'MediaUploadStore generates upl_ ID prefix');
    assert(storedPhoto.filename === 'test_image.jpg', 'MediaUploadStore records sanitized filename');
    assert(storedPhoto.size === samplePhotoBuffer.length, 'MediaUploadStore records exact byte size');

    // 1.2 Retrieve from in-memory cache
    const retrieved = mediaUploadStore.getMedia(storedPhoto.id);
    assert(Boolean(retrieved && retrieved.buffer.equals(samplePhotoBuffer)), 'MediaUploadStore retrieves buffer from memory cache');

    // 1.3 Retrieve with upload: prefix
    const retrievedWithPrefix = mediaUploadStore.getMedia(`upload:${storedPhoto.id}`);
    assert(Boolean(retrievedWithPrefix && retrievedWithPrefix.id === storedPhoto.id), 'MediaUploadStore resolves upload:<id> prefixed references');

    // 1.4 Restart persistence test: Clear memory cache and verify disk recovery
    mediaUploadStore.reset();
    const diskRecovered = mediaUploadStore.getMedia(storedPhoto.id);
    assert(Boolean(diskRecovered && diskRecovered.buffer.equals(samplePhotoBuffer)), 'MediaUploadStore recovers uploaded buffer from disk after memory reset');

    // 1.5 Validation: Size limit checks
    const smallPhotoValid = mediaUploadStore.validateFile({ buffer: Buffer.alloc(1024), filename: 'pic.jpg', mimeType: 'image/jpeg' }, 'photo');
    assert(smallPhotoValid.valid === true, '1 KB photo passes size validation');

    const oversizedPhoto = mediaUploadStore.validateFile({ buffer: Buffer.alloc(11 * 1024 * 1024), filename: 'huge.jpg', mimeType: 'image/jpeg' }, 'photo');
    assert(oversizedPhoto.valid === false && oversizedPhoto.error?.includes('exceeds the maximum allowed limit'), '11 MB photo rejected (max 10MB)');

    const validVideo = mediaUploadStore.validateFile({ buffer: Buffer.alloc(30 * 1024 * 1024), filename: 'clip.mp4', mimeType: 'video/mp4' }, 'video');
    assert(validVideo.valid === true, '30 MB video passes size validation (max 50MB)');

    const oversizedVideo = mediaUploadStore.validateFile({ buffer: Buffer.alloc(52 * 1024 * 1024), filename: 'huge.mp4', mimeType: 'video/mp4' }, 'video');
    assert(oversizedVideo.valid === false && oversizedVideo.error?.includes('exceeds the maximum allowed limit'), '52 MB video rejected (max 50MB)');

    const validGif = mediaUploadStore.validateFile({ buffer: Buffer.alloc(10 * 1024 * 1024), filename: 'funny.gif', mimeType: 'image/gif' }, 'animation');
    assert(validGif.valid === true, '10 MB GIF passes validation (max 15MB)');

    const oversizedGif = mediaUploadStore.validateFile({ buffer: Buffer.alloc(16 * 1024 * 1024), filename: 'large.gif', mimeType: 'image/gif' }, 'animation');
    assert(oversizedGif.valid === false && oversizedGif.error?.includes('exceeds the maximum allowed limit'), '16 MB GIF rejected (max 15MB)');

    // 1.6 Security validation: Rejection of dangerous executable files
    const exeBlocked = mediaUploadStore.validateFile({ buffer: Buffer.alloc(500), filename: 'malware.exe', mimeType: 'application/octet-stream' }, 'document');
    assert(exeBlocked.valid === false && exeBlocked.error?.includes('not permitted for security reasons'), '.exe files blocked unconditionally');

    const batBlocked = mediaUploadStore.validateFile({ buffer: Buffer.alloc(500), filename: 'script.bat', mimeType: 'text/plain' }, 'document');
    assert(batBlocked.valid === false && batBlocked.error?.includes('not permitted for security reasons'), '.bat files blocked unconditionally');

    const shBlocked = mediaUploadStore.validateFile({ buffer: Buffer.alloc(500), filename: 'deploy.sh', mimeType: 'application/x-sh' }, 'document');
    assert(shBlocked.valid === false && shBlocked.error?.includes('not permitted for security reasons'), '.sh files blocked unconditionally');

    const emptyBufferCheck = mediaUploadStore.validateFile({ buffer: Buffer.alloc(0), filename: 'empty.pdf', mimeType: 'application/pdf' }, 'document');
    assert(emptyBufferCheck.valid === false && emptyBufferCheck.error?.includes('empty'), 'Empty (0 byte) file rejected');

    console.log();

    // -------------------------------------------------------------
    // SECTION 2: Media Reference Validator Compatibility Tests
    // -------------------------------------------------------------
    console.log('--- SECTION 2: validateMediaReference with Uploads ---');

    // 2.1 Uploaded IDs are recognized as valid
    const uplCheck = validateMediaReference(storedPhoto.id);
    assert(uplCheck.valid === true && uplCheck.normalized === storedPhoto.id, 'validateMediaReference accepts direct upl_ ID');

    const uplPrefixedCheck = validateMediaReference(`upload:${storedPhoto.id}`);
    assert(uplPrefixedCheck.valid === true && uplPrefixedCheck.normalized === `upload:${storedPhoto.id}`, 'validateMediaReference accepts upload:upl_ prefixed ID');

    // 2.2 Telegram file_id and URLs still valid
    const tgFileIdCheck = validateMediaReference('AgACAgIAAxkBAAI_sample_photo_id_123');
    assert(tgFileIdCheck.valid === true, 'validateMediaReference accepts valid Telegram file_id');

    const httpsCheck = validateMediaReference('https://images.unsplash.com/photo-123456');
    assert(httpsCheck.valid === true, 'validateMediaReference accepts valid public https:// URL');

    // 2.3 Fake blob / local preview URLs properly rejected with clear guidance
    const blobCheck = validateMediaReference('blob:http://localhost:3000/a1b2c3d4');
    assert(blobCheck.valid === false && blobCheck.error?.includes('upload button'), 'validateMediaReference rejects raw blob: URLs with upload guidance');

    const localPreviewCheck = validateMediaReference('local_preview_sample_pic.jpg');
    assert(localPreviewCheck.valid === false && localPreviewCheck.error?.includes('upload button'), 'validateMediaReference rejects local_preview_* strings');

    console.log();

    // -------------------------------------------------------------
    // SECTION 3: PostSender Delivery with Local Uploaded Media
    // -------------------------------------------------------------
    console.log('--- SECTION 3: PostSender.send() with Uploaded Media ---');
    apiCalls.length = 0;

    // 3.1 Send Photo with mediaUploadId
    const photoPayload: PostPayload = {
      contentType: 'photo',
      text: '<b>Exclusive Photo Announcement</b>',
      mediaUploadId: storedPhoto.id,
      buttons: [[{ text: 'View Gallery', url: 'https://example.com/gallery' }]]
    };

    const photoRes = await PostSender.send(testChatId, photoPayload);
    assert(photoRes.ok === true, 'PostSender.send delivers uploaded photo successfully');
    assert(photoRes.messageId !== undefined && photoRes.messageId > 0, 'PostSender returns sent Telegram message_id');
    assert(photoRes.telegramFileId === 'AgACAgIAAxkBAAI_photo_highest_res_id', 'PostSender extracts reusable Telegram file_id from photo response');
    assert(apiCalls.some(c => c.method === 'sendPhoto' && c.isFormData === true), 'TelegramApi.sendPhoto received multipart FormData payload');

    // 3.2 Send Video with mediaUploadId
    const sampleVideoBuffer = Buffer.from('fake_mp4_video_bytes_00112233');
    const storedVideo = mediaUploadStore.storeMedia(sampleVideoBuffer, 'teaser.mp4', 'video/mp4');
    apiCalls.length = 0;

    const videoPayload: PostPayload = {
      contentType: 'video',
      text: 'Official Teaser Video',
      mediaUploadId: storedVideo.id
    };

    const videoRes = await PostSender.send(testChatId, videoPayload);
    assert(videoRes.ok === true, 'PostSender.send delivers uploaded video successfully');
    assert(videoRes.telegramFileId === 'BAACAgIAAxkBAAI_video_file_id', 'PostSender extracts video telegramFileId');
    assert(apiCalls.some(c => c.method === 'sendVideo' && c.isFormData === true), 'TelegramApi.sendVideo received multipart FormData payload');

    // 3.3 Send Document with mediaUploadId
    const sampleDocBuffer = Buffer.from('%PDF-1.4 sample pdf content bytes');
    const storedDoc = mediaUploadStore.storeMedia(sampleDocBuffer, 'whitepaper.pdf', 'application/pdf');
    apiCalls.length = 0;

    const docPayload: PostPayload = {
      contentType: 'document',
      text: 'Whitepaper Document',
      mediaUploadId: storedDoc.id
    };

    const docRes = await PostSender.send(testChatId, docPayload);
    assert(docRes.ok === true, 'PostSender.send delivers uploaded document successfully');
    assert(docRes.telegramFileId === 'BQACAgIAAxkBAAI_document_file_id', 'PostSender extracts document telegramFileId');
    assert(apiCalls.some(c => c.method === 'sendDocument' && c.isFormData === true), 'TelegramApi.sendDocument received multipart FormData payload');

    // 3.4 Send Animation (GIF) with mediaUploadId
    const sampleGifBuffer = Buffer.from('GIF89a sample gif content bytes');
    const storedGif = mediaUploadStore.storeMedia(sampleGifBuffer, 'celebrate.gif', 'image/gif');
    apiCalls.length = 0;

    const gifPayload: PostPayload = {
      contentType: 'animation',
      text: 'Celebration GIF!',
      mediaUploadId: storedGif.id
    };

    const gifRes = await PostSender.send(testChatId, gifPayload);
    assert(gifRes.ok === true, 'PostSender.send delivers uploaded animation/GIF successfully');
    assert(gifRes.telegramFileId === 'CgACAgIAAxkBAAI_animation_file_id', 'PostSender extracts animation telegramFileId');
    assert(apiCalls.some(c => c.method === 'sendAnimation' && c.isFormData === true), 'TelegramApi.sendAnimation received multipart FormData payload');

    // 3.4b Uploaded GIF with contentType='document' automatically detected as animation
    apiCalls.length = 0;
    const autoGifPayload: PostPayload = {
      contentType: 'document',
      text: 'Auto-detected GIF via upload',
      mediaUploadId: storedGif.id
    };
    const autoGifRes = await PostSender.send(testChatId, autoGifPayload);
    assert(autoGifRes.ok === true, 'Auto-detected GIF sends successfully');
    assert(apiCalls.some(c => c.method === 'sendAnimation' && c.isFormData === true), 'Auto-detected uploaded GIF routed to sendAnimation instead of sendDocument');

    // 3.4c Uploaded photo with styled inline buttons
    apiCalls.length = 0;
    const styledUploadPayload: PostPayload = {
      contentType: 'photo',
      text: 'Photo with styled buttons',
      mediaUploadId: storedPhoto.id,
      buttons: [
        [
          { text: 'Buy', url: 'https://example.com/buy', style: 'success' },
          { text: 'Info', url: 'https://example.com/info', style: 'primary' },
          { text: 'Report', url: 'https://example.com/report', style: 'danger' }
        ]
      ]
    };
    const styledUploadRes = await PostSender.send(testChatId, styledUploadPayload);
    assert(styledUploadRes.ok === true, 'Uploaded photo with styled buttons delivered successfully');
    const lastCall = apiCalls.find(c => c.method === 'sendPhoto');
    const replyMarkup = lastCall?.args?.options?.reply_markup;
    assert(Boolean(replyMarkup && replyMarkup.inline_keyboard), 'reply_markup present on uploaded media message');
    assert(replyMarkup.inline_keyboard[0][0].style === 'success', 'Uploaded media preserved button 0 success style');
    assert(replyMarkup.inline_keyboard[0][1].style === 'primary', 'Uploaded media preserved button 1 primary style');
    assert(replyMarkup.inline_keyboard[0][2].style === 'danger', 'Uploaded media preserved button 2 danger style');

    // 3.5 Error handling: Non-existent upload ID
    const invalidUploadRes = await PostSender.send(testChatId, {
      contentType: 'photo',
      text: 'Missing photo',
      mediaUploadId: 'upl_non_existent_id_99999'
    });
    assert(invalidUploadRes.ok === false && invalidUploadRes.error?.includes('expired or not found'), 'PostSender fails gracefully for missing/expired upload ID');

    console.log();

    // -------------------------------------------------------------
    // SECTION 4: Render Ephemeral Hosting - Schedule Restrictions & Allowances
    // -------------------------------------------------------------
    console.log('--- SECTION 4: Render Ephemeral Hosting - Schedule Restrictions & Allowances ---');

    async function simulateScheduleEndpoint(payload: any, nextRunIso: string) {
      const contentType = payload.contentType || 'text';
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
        return {
          status: 200,
          body: {
            success: true,
            schedule: db.addSchedule({
              chatId: testChatId,
              chatTitle: testChatTitle,
              name: 'Test Schedule',
              message: payload.text || `[${contentType.toUpperCase()}]`,
              messageText: payload.text,
              contentType,
              mediaFileId: mediaCheck.normalized,
              scheduleType: 'one_time',
              nextRun: nextRunIso,
              enabled: true,
              adminUsername: 'dashboard_admin'
            })
          }
        };
      }

      return {
        status: 200,
        body: {
          success: true,
          schedule: db.addSchedule({
            chatId: testChatId,
            chatTitle: testChatTitle,
            name: 'Test Text Schedule',
            message: payload.text,
            messageText: payload.text,
            contentType: 'text',
            scheduleType: 'one_time',
            nextRun: nextRunIso,
            enabled: true,
            adminUsername: 'dashboard_admin'
          })
        }
      };
    }

    const futureIsoTime = new Date(Date.now() + 3600000).toISOString();

    // 4.1 Local file + Send Now = ALLOWED
    const sendNowItem = mediaUploadStore.storeMedia(samplePhotoBuffer, 'send_now_photo.jpg', 'image/jpeg');
    const sendNowRes = await PostSender.send(testChatId, {
      contentType: 'photo',
      text: 'Send Now Local Photo',
      mediaUploadId: sendNowItem.id
    });
    assert(sendNowRes.ok === true, '4.1: Local file + Send Now is allowed and delivers immediately');

    // 4.2 Local file + Schedule (via mediaUploadId) = REJECTED with clear message
    const schedUploadIdRes = await simulateScheduleEndpoint({
      contentType: 'photo',
      text: 'Scheduled photo attempt',
      mediaUploadId: sendNowItem.id
    }, futureIsoTime);
    assert(schedUploadIdRes.status === 400, '4.2a: Local mediaUploadId + Schedule is rejected with status 400');
    assert(schedUploadIdRes.body.error === 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.', '4.2b: Local mediaUploadId + Schedule returns exact clear hosting message');

    // 4.3 Local file + Schedule (via upload: reference) = REJECTED with clear message
    const schedUploadRefRes = await simulateScheduleEndpoint({
      contentType: 'photo',
      text: 'Scheduled upload reference attempt',
      mediaFileId: `upload:${sendNowItem.id}`
    }, futureIsoTime);
    assert(schedUploadRefRes.status === 400, '4.3a: upload:upl_* reference + Schedule is rejected with status 400');
    assert(schedUploadRefRes.body.error === 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.', '4.3b: upload:upl_* reference returns exact clear hosting message');

    // 4.4 Local file + Schedule (via local_preview_ / blob:) = REJECTED with clear message
    const schedPreviewRes = await simulateScheduleEndpoint({
      contentType: 'video',
      text: 'Scheduled local preview',
      mediaFileId: 'local_preview_my_video.mp4'
    }, futureIsoTime);
    assert(schedPreviewRes.status === 400, '4.4a: local_preview_* + Schedule is rejected with status 400');
    assert(schedPreviewRes.body.error.includes('Local media cannot be scheduled'), '4.4b: local_preview_* returns hosting restriction error');

    // 4.5 Telegram file_id + Schedule = ALLOWED
    const schedTelegramFileIdRes = await simulateScheduleEndpoint({
      contentType: 'photo',
      text: 'Scheduled Telegram file_id post',
      mediaFileId: 'AgACAgIAAxkBAAI_valid_file_id_123'
    }, futureIsoTime);
    assert(schedTelegramFileIdRes.status === 200 && schedTelegramFileIdRes.body.success === true, '4.5a: Telegram file_id + Schedule is allowed');
    assert(schedTelegramFileIdRes.body.schedule?.mediaFileId === 'AgACAgIAAxkBAAI_valid_file_id_123', '4.5b: Telegram file_id is preserved in schedule');
    if (schedTelegramFileIdRes.body.schedule?.id) {
      db.deleteSchedule(testChatId, schedTelegramFileIdRes.body.schedule.id);
    }

    // 4.6 HTTPS media URL + Schedule = ALLOWED
    const schedHttpsUrlRes = await simulateScheduleEndpoint({
      contentType: 'photo',
      text: 'Scheduled HTTPS URL post',
      mediaFileId: 'https://images.example.com/promo-banner.jpg'
    }, futureIsoTime);
    assert(schedHttpsUrlRes.status === 200 && schedHttpsUrlRes.body.success === true, '4.6a: Public HTTPS URL + Schedule is allowed');
    assert(schedHttpsUrlRes.body.schedule?.mediaFileId === 'https://images.example.com/promo-banner.jpg', '4.6b: HTTPS URL is preserved in schedule');
    if (schedHttpsUrlRes.body.schedule?.id) {
      db.deleteSchedule(testChatId, schedHttpsUrlRes.body.schedule.id);
    }

    // 4.7 Text post + Schedule = ALLOWED
    const schedTextRes = await simulateScheduleEndpoint({
      contentType: 'text',
      text: 'Scheduled Text Announcement'
    }, futureIsoTime);
    assert(schedTextRes.status === 200 && schedTextRes.body.success === true, '4.7a: Text post + Schedule is allowed');
    assert(schedTextRes.body.schedule?.messageText === 'Scheduled Text Announcement', '4.7b: Text message is preserved in schedule');
    if (schedTextRes.body.schedule?.id) {
      db.deleteSchedule(testChatId, schedTextRes.body.schedule.id);
    }

    // Clean up temporary upload
    mediaUploadStore.deleteMedia(sendNowItem.id);

    console.log();

    // -------------------------------------------------------------
    // SECTION 5: Backward Compatibility & Regression Invariants
    // -------------------------------------------------------------
    console.log('--- SECTION 5: Backward Compatibility & Invariants ---');

    // 5.1 Manual Telegram file_id delivery
    apiCalls.length = 0;
    const manualFileIdRes = await PostSender.send(testChatId, {
      contentType: 'photo',
      text: 'Manual file_id post',
      mediaFileId: 'AgACAgIAAxkBAAI_existing_telegram_file_id'
    });
    assert(manualFileIdRes.ok === true, 'Manual Telegram file_id send succeeds');
    assert(apiCalls.some(c => c.method === 'sendPhoto' && c.isFormData === false), 'Manual file_id uses JSON delivery without FormData');

    // 5.2 Manual HTTPS URL delivery
    apiCalls.length = 0;
    const manualUrlRes = await PostSender.send(testChatId, {
      contentType: 'photo',
      text: 'Manual HTTPS URL post',
      mediaFileId: 'https://images.example.com/banner.jpg'
    });
    assert(manualUrlRes.ok === true, 'Manual public HTTPS URL send succeeds');
    assert(apiCalls.some(c => c.method === 'sendPhoto' && c.isFormData === false), 'Manual HTTPS URL uses JSON delivery without FormData');

    // 5.3 Text post delivery unchanged
    apiCalls.length = 0;
    const textRes = await PostSender.send(testChatId, {
      contentType: 'text',
      text: 'Simple text announcement'
    });
    assert(textRes.ok === true, 'Text post send succeeds');
    assert(apiCalls.some(c => c.method === 'sendMessage'), 'Text post uses sendMessage');

    // 5.4 Cleanup test files
    mediaUploadStore.deleteMedia(storedPhoto.id);
    mediaUploadStore.deleteMedia(storedVideo.id);
    mediaUploadStore.deleteMedia(storedDoc.id);
    mediaUploadStore.deleteMedia(storedGif.id);

  } finally {
    // Restore mocked methods
    (telegramApi as any).sendPhoto = origSendPhoto;
    (telegramApi as any).sendVideo = origSendVideo;
    (telegramApi as any).sendDocument = origSendDocument;
    (telegramApi as any).sendAnimation = origSendAnimation;
    (telegramApi as any).sendMessage = origSendMessage;
  }

  console.log('\n================================================================');
  console.log(`📊 LOCAL MEDIA UPLOAD TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLocalMediaUploadTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
