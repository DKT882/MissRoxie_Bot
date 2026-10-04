process.env.NODE_ENV = 'test';
import { PostSender, validateMediaReference, isValidHttpUrl } from '../server/telegram/postSender.js';
import { PostPayload, ScheduledMessage } from '../server/telegram/types.js';
import { telegramApi } from '../server/telegram/api.js';
import { db } from '../server/db/storage.js';

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

async function runTests() {
  console.log('====================================================');
  console.log('STARTING POST SENDER TEST SUITE (PHASE 1)');
  console.log('====================================================');

  const chatId = -100777888999;

  // Preserve originals
  const originalSendMessage = telegramApi.sendMessage;
  const originalSendPhoto = telegramApi.sendPhoto;
  const originalSendVideo = telegramApi.sendVideo;
  const originalSendAnimation = telegramApi.sendAnimation;
  const originalSendDocument = telegramApi.sendDocument;
  const originalSendSticker = telegramApi.sendSticker;
  const originalPinChatMessage = telegramApi.pinChatMessage;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalGetMe = telegramApi.getMe;

  let capturedCalls: Array<{ method: string; args: any[] }> = [];

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

  (telegramApi as any).sendMessage = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendMessage', args });
    return { ok: true, result: { message_id: 1001, chat: { id: args[0], type: 'supergroup' }, text: args[1] } };
  };

  (telegramApi as any).sendPhoto = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendPhoto', args });
    return { ok: true, result: { message_id: 1002, chat: { id: args[0], type: 'supergroup' }, photo: [{ file_id: args[1] }] } };
  };

  (telegramApi as any).sendVideo = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendVideo', args });
    return { ok: true, result: { message_id: 1003, chat: { id: args[0], type: 'supergroup' }, video: { file_id: args[1] } } };
  };

  (telegramApi as any).sendAnimation = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendAnimation', args });
    return { ok: true, result: { message_id: 1004, chat: { id: args[0], type: 'supergroup' }, animation: { file_id: args[1] } } };
  };

  (telegramApi as any).sendDocument = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendDocument', args });
    return { ok: true, result: { message_id: 1005, chat: { id: args[0], type: 'supergroup' }, document: { file_id: args[1] } } };
  };

  (telegramApi as any).sendSticker = async (...args: any[]) => {
    capturedCalls.push({ method: 'sendSticker', args });
    return { ok: true, result: { message_id: 1006, chat: { id: args[0], type: 'supergroup' }, sticker: { file_id: args[1] } } };
  };

  (telegramApi as any).pinChatMessage = async (...args: any[]) => {
    capturedCalls.push({ method: 'pinChatMessage', args });
    return { ok: true, result: true };
  };

  try {
    // ----------------------------------------------------------------
    // Test 1: Text post sends through sendMessage
    // ----------------------------------------------------------------
    console.log('\n--- Test 1: Plain Text Post ---');
    capturedCalls = [];
    const textPayload: PostPayload = {
      contentType: 'text',
      text: 'Hello World Post'
    };
    const res1 = await PostSender.send(chatId, textPayload);
    assert(res1.ok === true, 'Text post returns ok=true');
    assert(res1.messageId === 1001, 'Text post returns correct messageId');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendMessage', 'Dispatched through sendMessage');
    assert(capturedCalls[0].args[1] === 'Hello World Post', 'Text content matches');

    // ----------------------------------------------------------------
    // Test 2: Photo sends through sendPhoto
    // ----------------------------------------------------------------
    console.log('\n--- Test 2: Photo Post ---');
    capturedCalls = [];
    const photoPayload: PostPayload = {
      contentType: 'photo',
      mediaFileId: 'photo_file_123',
      text: 'Photo Caption'
    };
    const res2 = await PostSender.send(chatId, photoPayload);
    assert(res2.ok === true, 'Photo post returns ok=true');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendPhoto', 'Dispatched through sendPhoto');
    assert(capturedCalls[0].args[1] === 'photo_file_123', 'Photo file_id passed');
    assert(capturedCalls[0].args[2].caption === 'Photo Caption', 'Caption passed');

    // ----------------------------------------------------------------
    // Test 3: Video sends through sendVideo
    // ----------------------------------------------------------------
    console.log('\n--- Test 3: Video Post ---');
    capturedCalls = [];
    const videoPayload: PostPayload = {
      contentType: 'video',
      mediaFileId: 'video_file_456',
      text: 'Video Caption'
    };
    const res3 = await PostSender.send(chatId, videoPayload);
    assert(res3.ok === true, 'Video post returns ok=true');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendVideo', 'Dispatched through sendVideo');
    assert(capturedCalls[0].args[1] === 'video_file_456', 'Video file_id passed');
    assert(capturedCalls[0].args[2].caption === 'Video Caption', 'Video caption passed');

    // ----------------------------------------------------------------
    // Test 4: Animation/GIF sends through sendAnimation
    // ----------------------------------------------------------------
    console.log('\n--- Test 4: Animation/GIF Post ---');
    capturedCalls = [];
    const animPayload: PostPayload = {
      contentType: 'animation',
      mediaFileId: 'anim_file_789',
      text: 'GIF Caption'
    };
    const res4 = await PostSender.send(chatId, animPayload);
    assert(res4.ok === true, 'Animation post returns ok=true');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendAnimation', 'Dispatched through sendAnimation');
    assert(capturedCalls[0].args[1] === 'anim_file_789', 'Animation file_id passed');

    // ----------------------------------------------------------------
    // Test 5: Document sends through sendDocument
    // ----------------------------------------------------------------
    console.log('\n--- Test 5: Document Post ---');
    capturedCalls = [];
    const docPayload: PostPayload = {
      contentType: 'document',
      mediaFileId: 'doc_file_321',
      text: 'Document Caption'
    };
    const res5 = await PostSender.send(chatId, docPayload);
    assert(res5.ok === true, 'Document post returns ok=true');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendDocument', 'Dispatched through sendDocument');
    assert(capturedCalls[0].args[1] === 'doc_file_321', 'Document file_id passed');

    // ----------------------------------------------------------------
    // Test 6: Sticker sends through sendSticker
    // ----------------------------------------------------------------
    console.log('\n--- Test 6: Sticker Post ---');
    capturedCalls = [];
    const stickerPayload: PostPayload = {
      contentType: 'sticker',
      mediaFileId: 'sticker_file_654'
    };
    const res6 = await PostSender.send(chatId, stickerPayload);
    assert(res6.ok === true, 'Sticker post returns ok=true');
    assert(capturedCalls.length === 1 && capturedCalls[0].method === 'sendSticker', 'Dispatched through sendSticker');
    assert(capturedCalls[0].args[1] === 'sticker_file_654', 'Sticker file_id passed');

    // ----------------------------------------------------------------
    // Test 7: HTML Parse mode and caption preservation
    // ----------------------------------------------------------------
    console.log('\n--- Test 7: HTML Caption Preservation ---');
    capturedCalls = [];
    const htmlPayload: PostPayload = {
      contentType: 'photo',
      mediaFileId: 'photo_1',
      text: '<b>Bold</b> and <i>Italic</i>'
    };
    await PostSender.send(chatId, htmlPayload);
    assert(capturedCalls[0].args[2].parse_mode === 'HTML', 'Parse mode is HTML');
    assert(capturedCalls[0].args[2].caption === '<b>Bold</b> and <i>Italic</i>', 'HTML caption formatted properly');

    // ----------------------------------------------------------------
    // Test 8: Inline keyboard single row
    // ----------------------------------------------------------------
    console.log('\n--- Test 8: Single Row Inline Buttons ---');
    capturedCalls = [];
    const btnPayload1: PostPayload = {
      contentType: 'text',
      text: 'Check links',
      buttons: [[{ text: 'Google', url: 'https://google.com' }, { text: 'GitHub', url: 'https://github.com' }]]
    };
    await PostSender.send(chatId, btnPayload1);
    const markup1 = capturedCalls[0].args[2].reply_markup;
    assert(Boolean(markup1 && markup1.inline_keyboard), 'reply_markup attached');
    assert(markup1.inline_keyboard.length === 1, 'Exactly 1 button row');
    assert(markup1.inline_keyboard[0].length === 2, 'Row contains 2 buttons');

    // ----------------------------------------------------------------
    // Test 9: Multiple button rows
    // ----------------------------------------------------------------
    console.log('\n--- Test 9: Multiple Button Rows ---');
    capturedCalls = [];
    const btnPayload2: PostPayload = {
      contentType: 'text',
      text: 'Multi row links',
      buttons: [
        [{ text: 'Row 1 Col 1', url: 'https://row1.com' }],
        [{ text: 'Row 2 Col 1', url: 'https://row2a.com' }, { text: 'Row 2 Col 2', url: 'https://row2b.com' }]
      ]
    };
    await PostSender.send(chatId, btnPayload2);
    const markup2 = capturedCalls[0].args[2].reply_markup;
    assert(markup2.inline_keyboard.length === 2, '2 button rows present');
    assert(markup2.inline_keyboard[0].length === 1, 'First row has 1 button');
    assert(markup2.inline_keyboard[1].length === 2, 'Second row has 2 buttons');

    // ----------------------------------------------------------------
    // Test 10: Invalid URLs sanitized / rejected
    // ----------------------------------------------------------------
    console.log('\n--- Test 10: Invalid URL Filtering ---');
    capturedCalls = [];
    const invalidBtnPayload: PostPayload = {
      contentType: 'text',
      text: 'Links with invalid URLs',
      buttons: [
        [
          { text: 'Valid', url: 'https://valid.com' },
          { text: 'Invalid JS', url: 'javascript:alert(1)' },
          { text: 'No Protocol', url: 'example.com' }
        ]
      ]
    };
    await PostSender.send(chatId, invalidBtnPayload);
    const markup10 = capturedCalls[0].args[2].reply_markup;
    assert(markup10.inline_keyboard[0].length === 1, 'Only the valid HTTPS button is retained');
    assert(markup10.inline_keyboard[0][0].text === 'Valid', 'Valid button preserved');

    // ----------------------------------------------------------------
    // Test 11: replyToMessageId passed correctly
    // ----------------------------------------------------------------
    console.log('\n--- Test 11: Static replyToMessageId ---');
    capturedCalls = [];
    const replyPayload: PostPayload = {
      contentType: 'text',
      text: 'Reply to specific message',
      replyToMessageId: 54321
    };
    await PostSender.send(chatId, replyPayload);
    assert(capturedCalls[0].args[2].reply_to_message_id === 54321, 'reply_to_message_id is 54321');

    // ----------------------------------------------------------------
    // Test 12: replyToLatest dynamically resolves latest message
    // ----------------------------------------------------------------
    console.log('\n--- Test 12: Dynamic replyToLatest ---');
    capturedCalls = [];
    db.trackMessage(chatId, 888123, Math.floor(Date.now() / 1000), 12345);
    const replyLatestPayload: PostPayload = {
      contentType: 'text',
      text: 'Reply to newest message',
      replyToLatest: true
    };
    await PostSender.send(chatId, replyLatestPayload);
    assert(capturedCalls[0].args[2].reply_to_message_id === 888123, 'reply_to_message_id dynamically resolved to 888123');

    // ----------------------------------------------------------------
    // Test 13: replyToLatest takes precedence over replyToMessageId
    // ----------------------------------------------------------------
    console.log('\n--- Test 13: replyToLatest Precedence ---');
    capturedCalls = [];
    db.trackMessage(chatId, 999456, Math.floor(Date.now() / 1000), 12345);
    const precedencePayload: PostPayload = {
      contentType: 'text',
      text: 'Precedence test',
      replyToLatest: true,
      replyToMessageId: 111111 // Stale static ID
    };
    await PostSender.send(chatId, precedencePayload);
    assert(capturedCalls[0].args[2].reply_to_message_id === 999456, 'Dynamic replyToLatest (999456) took precedence over static (111111)');

    // ----------------------------------------------------------------
    // Test 14: No latest message -> sends normally without reply_to_message_id
    // ----------------------------------------------------------------
    console.log('\n--- Test 14: Empty Chat replyToLatest ---');
    capturedCalls = [];
    const emptyChatId = -1009999999999;
    const emptyChatPayload: PostPayload = {
      contentType: 'text',
      text: 'Empty chat message',
      replyToLatest: true
    };
    await PostSender.send(emptyChatId, emptyChatPayload);
    assert(capturedCalls[0].args[2].reply_to_message_id === undefined, 'No reply_to_message_id attached for empty chat');

    // ----------------------------------------------------------------
    // Test 15: pinAfterSend pins newly sent message
    // ----------------------------------------------------------------
    console.log('\n--- Test 15: pinAfterSend ---');
    capturedCalls = [];
    const pinPayload: PostPayload = {
      contentType: 'photo',
      mediaFileId: 'pin_photo_1',
      text: 'Pinned announcement',
      pinAfterSend: true
    };
    const res15 = await PostSender.send(chatId, pinPayload);
    assert(res15.ok === true, 'Post sent successfully');
    assert(res15.pinSuccess === true, 'pinSuccess is true');
    assert(capturedCalls.length === 2, 'Sent message then called pinChatMessage');
    assert(capturedCalls[1].method === 'pinChatMessage', 'Second call is pinChatMessage');
    assert(capturedCalls[1].args[0] === chatId, 'pinChatMessage chat ID matches');
    assert(capturedCalls[1].args[1] === 1002, 'pinChatMessage message ID matches newly sent photo ID');

    // ----------------------------------------------------------------
    // Test 16: Pin failure does not fail message delivery
    // ----------------------------------------------------------------
    console.log('\n--- Test 16: Non-fatal Pin Failure ---');
    capturedCalls = [];
    (telegramApi as any).pinChatMessage = async () => ({ ok: false, description: 'CHAT_ADMIN_REQUIRED' });
    const res16 = await PostSender.send(chatId, pinPayload);
    assert(res16.ok === true, 'Message remains delivered despite pin failure');
    assert(res16.pinSuccess === false, 'pinSuccess is false');
    assert(res16.messageId === 1002, 'Delivered message ID is returned');
    (telegramApi as any).pinChatMessage = async (...args: any[]) => {
      capturedCalls.push({ method: 'pinChatMessage', args });
      return { ok: true, result: true };
    };

    // ----------------------------------------------------------------
    // Test 17: Existing TelegramApi error handling
    // ----------------------------------------------------------------
    console.log('\n--- Test 17: TelegramApi Error Handling ---');
    (telegramApi as any).sendMessage = async () => ({ ok: false, description: 'Forbidden: bot was blocked by the user' });
    const res17 = await PostSender.send(chatId, textPayload);
    assert(res17.ok === false, 'Error response returns ok=false');
    assert(res17.error?.includes('Forbidden'), 'Error description propagated');
    (telegramApi as any).sendMessage = async (...args: any[]) => {
      capturedCalls.push({ method: 'sendMessage', args });
      return { ok: true, result: { message_id: 1001, chat: { id: args[0], type: 'supergroup' }, text: args[1] } };
    };

    // ----------------------------------------------------------------
    // Test 18: Protect content option
    // ----------------------------------------------------------------
    console.log('\n--- Test 18: Protect Content Option ---');
    capturedCalls = [];
    const protectPayload: PostPayload = {
      contentType: 'text',
      text: 'Protected content',
      protectContent: true
    };
    await PostSender.send(chatId, protectPayload);
    assert(capturedCalls[0].args[2].protect_content === true, 'protect_content passed to Telegram options');

    // ----------------------------------------------------------------
    // Test 19: scheduleToPayload adapter
    // ----------------------------------------------------------------
    console.log('\n--- Test 19: scheduleToPayload Adapter ---');
    const dummySchedule: ScheduledMessage = {
      id: 'SCHED1',
      chatId,
      message: 'Original body',
      messageText: 'Custom text',
      contentType: 'video',
      mediaFileId: 'vid_99',
      inlineKeyboard: [[{ text: 'Link', url: 'https://example.com' }]],
      pinAfterSend: true,
      replyToLatest: true,
      replyToMessageId: 777,
      autoDeletePrevious: true,
      createdAt: new Date().toISOString(),
      runsCount: 5
    };
    const adapted = PostSender.scheduleToPayload(dummySchedule, 'Resolved dynamic text');
    assert(adapted.contentType === 'video', 'Adapted contentType is video');
    assert(adapted.text === 'Resolved dynamic text', 'Adapted text uses resolved dynamic text');
    assert(adapted.mediaFileId === 'vid_99', 'Adapted mediaFileId matches');
    assert(adapted.pinAfterSend === true, 'Adapted pinAfterSend matches');
    assert(adapted.replyToLatest === true, 'Adapted replyToLatest matches');
    assert(adapted.buttons?.length === 1, 'Adapted buttons preserved');

    // ----------------------------------------------------------------
    // Test 20: Backward compatibility with plain legacy schedule
    // ----------------------------------------------------------------
    console.log('\n--- Test 20: Legacy Schedule Compatibility ---');
    const legacySchedule: ScheduledMessage = {
      id: 'SCHED_LEGACY',
      chatId,
      message: 'Old text only',
      createdAt: new Date().toISOString(),
      runsCount: 0
    };
    const legacyAdapted = PostSender.scheduleToPayload(legacySchedule);
    assert(legacyAdapted.contentType === 'text', 'Defaulted contentType to text');
    assert(legacyAdapted.text === 'Old text only', 'Extracted message as text');
    // ----------------------------------------------------------------
    // Test 21: validateMediaReference unit tests
    // ----------------------------------------------------------------
    console.log('\n--- Test 21: validateMediaReference Unit Tests ---');
    const v1 = validateMediaReference('local_preview_pic.png');
    assert(v1.valid === false && v1.error?.includes('Local browser files'), 'Rejects local_preview_ string');
    const v2 = validateMediaReference('blob:http://localhost:3000/123');
    assert(v2.valid === false && v2.error?.includes('Local browser files'), 'Rejects blob: URL');
    const v3 = validateMediaReference('data:image/png;base64,iVBORw0KGgo=');
    assert(v3.valid === false && v3.error?.includes('Local browser files'), 'Rejects data: URL');
    const v4 = validateMediaReference('http://localhost/image.png');
    assert(v4.valid === false && v4.error?.includes('Invalid media URL'), 'Rejects localhost media URL');
    const v5 = validateMediaReference('https://images.unsplash.com/photo-1234.jpg');
    assert(v5.valid === true && v5.normalized?.startsWith('https://images.unsplash.com/'), 'Accepts valid HTTPS image URL');
    const v6 = validateMediaReference('AgACAgIAAxkBAAI9XYZ');
    assert(v6.valid === true && v6.normalized === 'AgACAgIAAxkBAAI9XYZ', 'Accepts valid Telegram file_id');

    // ----------------------------------------------------------------
    // Test 22: PostSender.send rejects invalid media before calling Telegram
    // ----------------------------------------------------------------
    console.log('\n--- Test 22: PostSender.send Early Rejection of Invalid Media ---');
    capturedCalls = [];
    const invalidMediaPayload: PostPayload = {
      contentType: 'photo',
      mediaFileId: 'local_preview_test.jpg',
      text: 'Should fail early'
    };
    const invalidSendRes = await PostSender.send(chatId, invalidMediaPayload);
    assert(invalidSendRes.ok === false && invalidSendRes.error?.includes('Local browser files'), 'PostSender.send returns ok=false on local_preview_');
    assert(capturedCalls.length === 0, 'No Telegram API calls were dispatched for invalid media');

  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.sendPhoto = originalSendPhoto;
    telegramApi.sendVideo = originalSendVideo;
    telegramApi.sendAnimation = originalSendAnimation;
    telegramApi.sendDocument = originalSendDocument;
    telegramApi.sendSticker = originalSendSticker;
    telegramApi.pinChatMessage = originalPinChatMessage;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.getMe = originalGetMe;
  }

  console.log('====================================================');
  console.log(`POST SENDER TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in PostSender test suite:', err);
  process.exit(1);
});
