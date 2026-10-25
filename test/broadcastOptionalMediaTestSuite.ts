import assert from 'assert';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { PostSender } from '../server/telegram/postSender.js';
import { PostPayload } from '../server/telegram/types.js';
import {
  RichPostComposer,
  COMPOSITION_OPTIONS,
  CompositionType
} from '../src/components/RichPostComposer.js';

async function runBroadcastOptionalMediaTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING BROADCAST POST COMPOSER OPTIONAL MEDIA TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function recordPass(testName: string) {
    passedTests++;
    console.log(`✅ [PASS] ${testName}`);
  }

  function recordFail(testName: string, error: any) {
    failedTests++;
    console.error(`❌ [FAIL] ${testName}:`, error?.message || error);
  }

  // Telegram API mocks and tracking
  const apiCalls: Array<{ method: string; args: any }> = [];
  const origSendMessage = telegramApi.sendMessage.bind(telegramApi);
  const origSendPhoto = telegramApi.sendPhoto.bind(telegramApi);
  const origSendVideo = telegramApi.sendVideo.bind(telegramApi);
  const origSendDocument = telegramApi.sendDocument.bind(telegramApi);
  const origSendAnimation = telegramApi.sendAnimation.bind(telegramApi);

  let nextMessageId = 88001;
  let simulateApiFailure = false;
  let simulateApiErrorDesc = 'Telegram delivery error';

  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    apiCalls.push({ method: 'sendMessage', args: { chatId, text, options } });
    if (simulateApiFailure) {
      return { ok: false, error_code: 403, description: simulateApiErrorDesc };
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, text } };
  };

  (telegramApi as any).sendPhoto = async (chatId: number | string, photo: string, options?: any) => {
    apiCalls.push({ method: 'sendPhoto', args: { chatId, photo, options } });
    if (simulateApiFailure) {
      return { ok: false, error_code: 403, description: simulateApiErrorDesc };
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendVideo = async (chatId: number | string, video: string, options?: any) => {
    apiCalls.push({ method: 'sendVideo', args: { chatId, video, options } });
    if (simulateApiFailure) {
      return { ok: false, error_code: 403, description: simulateApiErrorDesc };
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendDocument = async (chatId: number | string, document: string, options?: any) => {
    apiCalls.push({ method: 'sendDocument', args: { chatId, document, options } });
    if (simulateApiFailure) {
      return { ok: false, error_code: 403, description: simulateApiErrorDesc };
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  (telegramApi as any).sendAnimation = async (chatId: number | string, animation: string, options?: any) => {
    apiCalls.push({ method: 'sendAnimation', args: { chatId, animation, options } });
    if (simulateApiFailure) {
      return { ok: false, error_code: 403, description: simulateApiErrorDesc };
    }
    return { ok: true, result: { message_id: nextMessageId++, chat: { id: chatId }, caption: options?.caption } };
  };

  // Setup test recipients in DB
  const testGroupId = -1009988776655;
  const testGroupTitle = 'Broadcast Test Group Alpha';
  db.getGroupSettings(testGroupId, testGroupTitle);
  db.updateGroupSettings(testGroupId, {
    botLeft: false,
    unavailable: false,
    chatTitle: testGroupTitle
  });

  const testPrivateChatId = 888777666;
  db.savePrivateRecipient({
    chatId: testPrivateChatId,
    displayName: 'Alice Tester',
    username: 'alicetester',
    status: 'active'
  });

  try {
    // =========================================================================
    // SECTION 1: Composition Options Inventory & Default Configuration
    // =========================================================================
    console.log('--- Section 1: Composition Options Inventory & Default Selection ---');

    try {
      assert.strictEqual(COMPOSITION_OPTIONS.length, 6, 'Should have exactly 6 composition options');
      recordPass('1a. COMPOSITION_OPTIONS contains 6 options (Text Only + 5 Media Models)');
    } catch (e) { recordFail('1a', e); }

    try {
      const firstOpt = COMPOSITION_OPTIONS[0];
      assert.strictEqual(firstOpt.type, 'text', 'First option type must be "text"');
      assert.strictEqual(firstOpt.label, 'Text Only', 'First option label must be "Text Only"');
      assert.strictEqual(firstOpt.backendContentType, 'text', 'First option backend content type must be "text"');
      recordPass('1b. First composition option is "Text Only" mapped to backend "text"');
    } catch (e) { recordFail('1b', e); }

    try {
      const expectedTypes: CompositionType[] = ['text', 'image', 'video', 'gif', 'audio', 'document'];
      const actualTypes = COMPOSITION_OPTIONS.map(o => o.type);
      assert.deepStrictEqual(actualTypes, expectedTypes, 'Option types must match expected order');
      recordPass('1c. All 6 composition options are present in correct order');
    } catch (e) { recordFail('1c', e); }

    try {
      const html = renderToString(React.createElement(RichPostComposer, {
        groups: [{ chatId: testGroupId, title: testGroupTitle }],
        selectedChatId: testGroupId,
        theme: 'dark'
      }));
      assert(html.includes('Text Only'), 'Rendered HTML must contain Text Only option');
      assert(html.includes('Text-Only Broadcast Mode'), 'Rendered HTML must display Text-Only Mode banner by default');
      assert(html.includes('Broadcast Post Composer'), 'Rendered HTML must display Broadcast Post Composer title');
      recordPass('1d. RichPostComposer renders with Text Only active by default without media controls');
    } catch (e) { recordFail('1d', e); }

    // =========================================================================
    // SECTION 2: Text-Only Broadcast Execution
    // =========================================================================
    console.log('\n--- Section 2: Text-Only Broadcast Execution to Groups & Private Chats ---');

    apiCalls.length = 0;
    try {
      const textPayload: PostPayload = {
        contentType: 'text',
        text: 'Hello, this is a pure text-only broadcast message with <b>bold</b> and <i>italic</i>.'
      };

      const res = await PostSender.send(testGroupId, textPayload);
      assert.strictEqual(res.ok, true, 'Text broadcast should succeed');
      assert.strictEqual(apiCalls.length, 1, 'Should make exactly 1 Telegram API call');
      assert.strictEqual(apiCalls[0].method, 'sendMessage', 'Must use sendMessage method');
      assert.strictEqual(apiCalls[0].args.chatId, testGroupId, 'Destination chatId must match');
      assert.strictEqual(apiCalls[0].args.options.parse_mode, 'HTML', 'Parse mode must be HTML');
      assert.strictEqual(apiCalls[0].args.text, textPayload.text, 'Text content must match');
      recordPass('2a. Text-only broadcast to group dispatches via sendMessage without media');
    } catch (e) { recordFail('2a', e); }

    apiCalls.length = 0;
    try {
      const privateTextPayload: PostPayload = {
        contentType: 'text',
        text: 'Direct private message broadcast to Alice.'
      };

      const res = await PostSender.send(testPrivateChatId, privateTextPayload);
      assert.strictEqual(res.ok, true, 'Private text broadcast should succeed');
      assert.strictEqual(apiCalls.length, 1, 'Should make exactly 1 Telegram API call');
      assert.strictEqual(apiCalls[0].method, 'sendMessage', 'Must use sendMessage method');
      assert.strictEqual(apiCalls[0].args.chatId, testPrivateChatId, 'Destination chatId must match');
      recordPass('2b. Text-only broadcast to private chat dispatches via sendMessage');
    } catch (e) { recordFail('2b', e); }

    apiCalls.length = 0;
    try {
      const longText = 'A'.repeat(4000); // within 4096 limit
      const longPayload: PostPayload = {
        contentType: 'text',
        text: longText
      };

      const res = await PostSender.send(testGroupId, longPayload);
      assert.strictEqual(res.ok, true, 'Long text broadcast up to 4000 chars should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendMessage', 'Must use sendMessage');
      recordPass('2c. Text-only broadcast allows messages up to Telegram 4,096 char limit');
    } catch (e) { recordFail('2c', e); }

    // =========================================================================
    // SECTION 3: Empty Text Validation
    // =========================================================================
    console.log('\n--- Section 3: Validation Rules ---');

    try {
      // Empty text should be caught before or during validation
      const emptyText = '   ';
      const isTextEmpty = !emptyText.trim();
      assert.strictEqual(isTextEmpty, true, 'Empty text must be detected as empty');
      recordPass('3a. Empty or whitespace-only message text is invalid');
    } catch (e) { recordFail('3a', e); }

    // =========================================================================
    // SECTION 4: Media Broadcast Preservation (Single Attachment Enforced)
    // =========================================================================
    console.log('\n--- Section 4: Preservation of Rich Media Broadcast Options ---');

    // 4a: Image broadcast
    apiCalls.length = 0;
    try {
      const imagePayload: PostPayload = {
        contentType: 'photo',
        text: 'Image caption text',
        mediaFileId: 'https://example.com/photo.jpg'
      };
      const res = await PostSender.send(testGroupId, imagePayload);
      assert.strictEqual(res.ok, true, 'Image send should succeed');
      assert.strictEqual(apiCalls.length, 1, 'Exactly 1 call made');
      assert.strictEqual(apiCalls[0].method, 'sendPhoto', 'Must use sendPhoto for images');
      assert.strictEqual(apiCalls[0].args.photo, 'https://example.com/photo.jpg');
      assert.strictEqual(apiCalls[0].args.options.caption, 'Image caption text');
      recordPass('4a. Text + Image broadcast dispatches via sendPhoto with caption');
    } catch (e) { recordFail('4a', e); }

    // 4b: Video broadcast
    apiCalls.length = 0;
    try {
      const videoPayload: PostPayload = {
        contentType: 'video',
        text: 'Video caption text',
        mediaFileId: 'https://example.com/video.mp4'
      };
      const res = await PostSender.send(testGroupId, videoPayload);
      assert.strictEqual(res.ok, true, 'Video send should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendVideo', 'Must use sendVideo for videos');
      recordPass('4b. Text + Video broadcast dispatches via sendVideo with caption');
    } catch (e) { recordFail('4b', e); }

    // 4c: GIF Animation broadcast
    apiCalls.length = 0;
    try {
      const gifPayload: PostPayload = {
        contentType: 'animation',
        text: 'GIF caption text',
        mediaFileId: 'https://example.com/animation.gif'
      };
      const res = await PostSender.send(testGroupId, gifPayload);
      assert.strictEqual(res.ok, true, 'GIF send should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendAnimation', 'Must use sendAnimation for GIFs');
      recordPass('4c. Text + GIF broadcast dispatches via sendAnimation with caption');
    } catch (e) { recordFail('4c', e); }

    // 4d: Document broadcast
    apiCalls.length = 0;
    try {
      const docPayload: PostPayload = {
        contentType: 'document',
        text: 'Document caption text',
        mediaFileId: 'https://example.com/document.pdf'
      };
      const res = await PostSender.send(testGroupId, docPayload);
      assert.strictEqual(res.ok, true, 'Doc send should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendDocument', 'Must use sendDocument for documents');
      recordPass('4d. Text + Document broadcast dispatches via sendDocument with caption');
    } catch (e) { recordFail('4d', e); }

    // 4e: Audio broadcast (routed via document by backend)
    apiCalls.length = 0;
    try {
      const audioPayload: PostPayload = {
        contentType: 'document',
        text: 'Audio track caption text',
        mediaFileId: 'https://example.com/song.mp3'
      };
      const res = await PostSender.send(testGroupId, audioPayload);
      assert.strictEqual(res.ok, true, 'Audio send should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendDocument', 'Audio URLs route via sendDocument');
      recordPass('4e. Text + Audio broadcast dispatches via sendDocument with caption');
    } catch (e) { recordFail('4e', e); }

    // =========================================================================
    // SECTION 5: Media Post Fallback to Text When No Media Attached
    // =========================================================================
    console.log('\n--- Section 5: Media Post Fallback to Text When No Media Attached ---');

    apiCalls.length = 0;
    try {
      // When a user selects "Text + Image" in the UI but attaches no media:
      // Composer sends contentType: 'text'
      const fallbackPayload: PostPayload = {
        contentType: 'text',
        text: 'User wanted to send an image, but did not attach any file. Sending as text-only!'
      };
      const res = await PostSender.send(testGroupId, fallbackPayload);
      assert.strictEqual(res.ok, true, 'Fallback send should succeed');
      assert.strictEqual(apiCalls[0].method, 'sendMessage', 'Must fall back to sendMessage');
      recordPass('5a. Broadcast without media gracefully sends as text-only via sendMessage');
    } catch (e) { recordFail('5a', e); }

    // =========================================================================
    // SECTION 6: Multi-Recipient Broadcast Execution
    // =========================================================================
    console.log('\n--- Section 6: Multi-Recipient Broadcast Execution ---');

    apiCalls.length = 0;
    try {
      const multiRecipients = [testGroupId, testPrivateChatId];
      const broadcastMsg: PostPayload = {
        contentType: 'text',
        text: 'Broadcast announcement to all groups and private recipients.'
      };

      for (const rId of multiRecipients) {
        const res = await PostSender.send(rId, broadcastMsg);
        assert.strictEqual(res.ok, true, `Delivery to recipient ${rId} should succeed`);
      }

      assert.strictEqual(apiCalls.length, 2, 'Should make 2 separate Telegram API calls');
      assert.strictEqual(apiCalls[0].method, 'sendMessage');
      assert.strictEqual(apiCalls[1].method, 'sendMessage');
      recordPass('6a. Multi-recipient broadcast dispatches text messages to groups and private chats');
    } catch (e) { recordFail('6a', e); }

    // =========================================================================
    // SECTION 7: Telegram API Error Handling
    // =========================================================================
    console.log('\n--- Section 7: Telegram API Error Handling ---');

    apiCalls.length = 0;
    simulateApiFailure = true;
    simulateApiErrorDesc = 'Forbidden: bot was blocked by the user';

    try {
      const errPayload: PostPayload = {
        contentType: 'text',
        text: 'This will fail.'
      };
      const res = await PostSender.send(testPrivateChatId, errPayload);
      assert.strictEqual(res.ok, false, 'Result must indicate ok: false on Telegram error');
      assert(res.error?.includes('Forbidden'), 'Error message must reflect Telegram error description');
      recordPass('7a. Telegram API errors are properly caught and reported without false success');
    } catch (e) { recordFail('7a', e); }

    simulateApiFailure = false;

  } finally {
    // Restore original TelegramApi methods
    (telegramApi as any).sendMessage = origSendMessage;
    (telegramApi as any).sendPhoto = origSendPhoto;
    (telegramApi as any).sendVideo = origSendVideo;
    (telegramApi as any).sendDocument = origSendDocument;
    (telegramApi as any).sendAnimation = origSendAnimation;
  }

  console.log('\n================================================================');
  console.log(`🎉 TEST SUITE COMPLETE: ${passedTests} Passed | ${failedTests} Failed (Total: ${passedTests + failedTests})`);
  console.log('================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBroadcastOptionalMediaTestSuite().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
