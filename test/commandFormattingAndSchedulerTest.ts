import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { CommandHandler } from '../server/telegram/commands.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler } from '../server/telegram/scheduler.js';
import { COMMAND_CATALOG, getCatalogItem } from '../server/telegram/commandCatalog.js';
import { TelegramMessage, CommandContext, TelegramChatMember } from '../server/telegram/types.js';

async function runCommandFormattingSuite() {
  process.env.ENABLE_SCHEDULER = 'true';
  console.log('====================================================');
  console.log('🧪 Starting Command Formatting & Scheduled Media Test Suite');
  console.log('====================================================');

  const testChatId = -100777111222;
  const adminId = 999111;
  const botId = 123456789;

  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentPhotos: Array<{ chatId: number; photo: string; options?: any }> = [];
  let sentVideos: Array<{ chatId: number; video: string; options?: any }> = [];
  let sentDocuments: Array<{ chatId: number; document: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; sticker: string; options?: any }> = [];
  let sentAnimations: Array<{ chatId: number; animation: string; options?: any }> = [];

  (telegramApi as any).sendMessage = async (chatId: number, text: string, options?: any) => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 900000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendPhoto = async (chatId: number, photo: string, options?: any) => {
    sentPhotos.push({ chatId, photo, options });
    return { ok: true, result: { message_id: 910000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendVideo = async (chatId: number, video: string, options?: any) => {
    sentVideos.push({ chatId, video, options });
    return { ok: true, result: { message_id: 920000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendDocument = async (chatId: number, document: string, options?: any) => {
    sentDocuments.push({ chatId, document, options });
    return { ok: true, result: { message_id: 930000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendSticker = async (chatId: number, sticker: string, options?: any) => {
    sentStickers.push({ chatId, sticker, options });
    return { ok: true, result: { message_id: 940000 + Math.floor(Math.random() * 1000) } };
  };
  (telegramApi as any).sendAnimation = async (chatId: number, animation: string, options?: any) => {
    sentAnimations.push({ chatId, animation, options });
    return { ok: true, result: { message_id: 950000 + Math.floor(Math.random() * 1000) } };
  };

  const memberStatusMap: Record<number, TelegramChatMember> = {
    [adminId]: {
      status: 'administrator',
      user: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      can_restrict_members: true,
      can_delete_messages: true,
      can_pin_messages: true,
      can_promote_members: true
    } as any,
    [botId]: {
      status: 'administrator',
      user: { id: botId, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' },
      can_restrict_members: true,
      can_delete_messages: true,
      can_pin_messages: true
    } as any
  };

  (telegramApi as any).getChatMember = async (_chatId: number, userId: number) => {
    return {
      ok: true,
      result: memberStatusMap[userId] || {
        status: 'member',
        user: { id: userId, is_bot: false, first_name: `User_${userId}` }
      }
    };
  };

  db.getGroupSettings(testChatId, 'Formatting Test Group');
  db.cacheUser({ id: 555001, first_name: 'Alice', username: 'alice_user' }, testChatId);
  db.cacheUser({ id: 555002, first_name: 'Bob', username: 'bob_user' }, testChatId);

  function createContext(textOrCaption: string, replyTo?: TelegramMessage): CommandContext {
    const trimmed = textOrCaption.trim();
    const cmdMatch = textOrCaption.match(/^([\/!][^\s]+)([\s\S]*)$/);
    const rawCmd = cmdMatch ? cmdMatch[1] : trimmed.split(/\s+/)[0];
    const rawRemainder = cmdMatch ? cmdMatch[2] : '';
    const rawArgs = rawRemainder.replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
    const parts = trimmed.split(/\s+/);
    const command = rawCmd.startsWith('!') ? `/${rawCmd.slice(1)}` : rawCmd;
    const args = parts.slice(1);

    const message: TelegramMessage = {
      message_id: 1000 + Math.floor(Math.random() * 1000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
      from: { id: adminId, is_bot: false, first_name: 'AdminUser', username: 'admin_user' },
      text: textOrCaption,
      reply_to_message: replyTo
    };

    return {
      message,
      chatId: testChatId,
      chatTitle: 'Formatting Test Group',
      sender: message.from!,
      isAnonymousAdmin: false,
      adminDisplayName: 'AdminUser',
      args,
      command,
      rawArgs
    };
  }

  // ==========================================
  // TEST 1: /say Preserves Multiline Text & Newlines
  // ==========================================
  console.log('\n--- TEST 1: /say Multiline Preservation ---');
  sentMessages = [];
  const sayMultilineInput = `/say\nHello everyone\nHow are you?\nWelcome to the group!`;
  const ctx1 = createContext(sayMultilineInput);
  await CommandHandler.handleCommand(ctx1);

  assert.strictEqual(sentMessages.length, 1, 'Expected exactly 1 message sent by /say');
  const expectedSay1 = `Hello everyone\nHow are you?\nWelcome to the group!`;
  assert.strictEqual(sentMessages[0].text, expectedSay1, 'Message text must preserve original newlines');
  assert.ok(!sentMessages[0].text.includes('Hello everyone How are you?'), 'Newlines must NOT be collapsed into single spaces');
  console.log('✅ [PASS] TEST 1: /say preserves original multiline text with newlines');

  // ==========================================
  // TEST 2: /say with Emojis, Bullet Points, URLs, and Paragraph Breaks
  // ==========================================
  console.log('\n--- TEST 2: /say with Emojis, Bullets, URLs, and Paragraphs ---');
  sentMessages = [];
  const sayRichInput = `/say\n📢 Special Announcement! 🚀\n\nPlease check the following:\n• Item 1: https://example.com/item1\n• Item 2: Don't forget!\n\nThank you! 🙏`;
  const ctx2 = createContext(sayRichInput);
  await CommandHandler.handleCommand(ctx2);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 message from /say rich');
  const expectedSay2 = `📢 Special Announcement! 🚀\n\nPlease check the following:\n• Item 1: https://example.com/item1\n• Item 2: Don't forget!\n\nThank you! 🙏`;
  assert.strictEqual(sentMessages[0].text, expectedSay2, 'Emojis, bullets, URLs, and paragraph breaks must be preserved');
  console.log('✅ [PASS] TEST 2: /say preserves rich formatting, bullet points, URLs, and paragraph breaks');

  // ==========================================
  // TEST 3: /say Replying to Another Message
  // ==========================================
  console.log('\n--- TEST 3: /say Replying to Another Message ---');
  sentMessages = [];
  const repliedMessage: TelegramMessage = {
    message_id: 5050,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: 555001, is_bot: false, first_name: 'Alice' },
    text: 'Can someone help me?'
  };
  const ctx3 = createContext(`/say\nSure Alice!\nWe are here to help.`, repliedMessage);
  await CommandHandler.handleCommand(ctx3);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 reply message sent');
  assert.strictEqual(sentMessages[0].text, `Sure Alice!\nWe are here to help.`);
  assert.strictEqual(sentMessages[0].options?.reply_to_message_id, 5050, 'reply_to_message_id must be target message');
  console.log('✅ [PASS] TEST 3: /say correctly targets replied message while preserving newlines');

  // ==========================================
  // TEST 4: /announce Alias
  // ==========================================
  console.log('\n--- TEST 4: /announce Alias ---');
  sentMessages = [];
  const ctx4 = createContext(`/announce\nAttention all members:\nServer update in 5 minutes.`);
  await CommandHandler.handleCommand(ctx4);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 message sent via /announce');
  assert.strictEqual(sentMessages[0].text, `Attention all members:\nServer update in 5 minutes.`);
  console.log('✅ [PASS] TEST 4: /announce works as alias for /say with newline preservation');

  // ==========================================
  // TEST 5: /all Preserves Paragraph Breaks and Multiline Text
  // ==========================================
  console.log('\n--- TEST 5: /all Multiline Text & Paragraph Breaks ---');
  sentMessages = [];
  const allInput = `/all\n🔔 Important Announcement\n\nTomorrow:\n10 AM meeting\n12 PM submission`;
  const ctx5 = createContext(allInput);
  await CommandHandler.handleCommand(ctx5);

  assert.ok(sentMessages.length >= 1, 'Expected at least 1 /all broadcast message');
  const allMsgText = sentMessages[0].text;
  assert.ok(allMsgText.includes(`🔔 Important Announcement\n\nTomorrow:\n10 AM meeting\n12 PM submission`), 'Header must preserve paragraph break and newlines');
  assert.ok(!allMsgText.includes('10 AM meeting 12 PM submission'), 'Newlines must NOT be collapsed');
  console.log('✅ [PASS] TEST 5: /all preserves multiline announcement text and paragraph breaks');

  // ==========================================
  // TEST 6: /all status Command Still Functions
  // ==========================================
  console.log('\n--- TEST 6: /all status Command ---');
  sentMessages = [];
  const ctx6 = createContext(`/all status`);
  await CommandHandler.handleCommand(ctx6);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 message for /all status');
  assert.ok(sentMessages[0].text.includes('/all Command Status'), 'Output should contain status info');
  console.log('✅ [PASS] TEST 6: /all status functions properly');

  // ==========================================
  // TEST 7: /schedule Preserves Multiline Text in Stored Payload & Execution
  // ==========================================
  console.log('\n--- TEST 7: /schedule Multiline Preservation in Stored Payload & Dispatch ---');
  sentMessages = [];
  const scheduleMultilineInput = `/schedule 10m\nReminder:\n\nSubmit your assignment\nbefore 5 PM.\n\nThanks! 📝`;
  const ctx7 = createContext(scheduleMultilineInput);
  await CommandHandler.handleCommand(ctx7);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 confirmation message from /schedule');
  assert.ok(sentMessages[0].text.includes('Message Scheduled Successfully!'), 'Confirmation must be shown');

  const allSchedules = db.getAllSchedules();
  const createdSchedule = allSchedules.find(s => s.chatId === testChatId && (s.messageText || s.message || '').includes('Submit your assignment'));
  assert.ok(createdSchedule, 'Created schedule must exist in database');

  const expectedScheduledBody = `Reminder:\n\nSubmit your assignment\nbefore 5 PM.\n\nThanks! 📝`;
  assert.strictEqual(createdSchedule.messageText, expectedScheduledBody, 'Database must store multiline text with newlines');

  // Simulate scheduler execution
  sentMessages = [];
  createdSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();

  const matchingTextMsg = sentMessages.find(m => m.chatId === testChatId && m.text === expectedScheduledBody);
  assert.ok(matchingTextMsg, 'Delivered scheduled message must preserve exact newlines');
  console.log('✅ [PASS] TEST 7: /schedule preserves multiline text in storage and delivered message');

  // ==========================================
  // TEST 8: /schedule with URLs
  // ==========================================
  console.log('\n--- TEST 8: /schedule with URLs ---');
  sentMessages = [];
  const ctx8 = createContext(`/schedule 30m Check out our promo: https://example.com/sale?ref=roxie`);
  await CommandHandler.handleCommand(ctx8);

  assert.ok(sentMessages[0].text.includes('Message Scheduled Successfully!'));
  const urlSchedule = db.getAllSchedules().find(s => (s.messageText || '').includes('https://example.com/sale?ref=roxie'));
  assert.ok(urlSchedule, 'URL schedule should be stored');
  assert.strictEqual(urlSchedule.messageText, 'Check out our promo: https://example.com/sale?ref=roxie');
  console.log('✅ [PASS] TEST 8: /schedule preserves links and URL queries');

  // ==========================================
  // TEST 9: Scheduled Media — Photo
  // ==========================================
  console.log('\n--- TEST 9: Scheduled Media (Photo) ---');
  sentMessages = [];
  sentPhotos = [];
  const photoReply: TelegramMessage = {
    message_id: 6001,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: adminId, is_bot: false, first_name: 'AdminUser' },
    photo: [
      { file_id: 'photo_thumb_123', file_unique_id: 'u1', width: 100, height: 100 },
      { file_id: 'photo_highres_456', file_unique_id: 'u2', width: 800, height: 800 }
    ],
    caption: 'Original photo caption'
  };
  const ctx9 = createContext(`/schedule 1h Custom photo caption\nLine 2`, photoReply);
  await CommandHandler.handleCommand(ctx9);

  const photoSchedule = db.getAllSchedules().find(s => s.mediaFileId === 'photo_highres_456');
  assert.ok(photoSchedule, 'Photo schedule must be created');
  assert.strictEqual(photoSchedule.contentType, 'photo');
  assert.strictEqual(photoSchedule.mediaFileId, 'photo_highres_456');
  assert.strictEqual(photoSchedule.messageText, 'Custom photo caption\nLine 2');

  // Execute schedule
  photoSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();
  const matchingPhoto = sentPhotos.find(p => p.chatId === testChatId && p.photo === 'photo_highres_456');
  assert.ok(matchingPhoto, 'Expected sendPhoto called for scheduled photo');
  assert.strictEqual(matchingPhoto.options?.caption, 'Custom photo caption\nLine 2');
  console.log('✅ [PASS] TEST 9: Photo scheduling preserves largest file_id and multiline caption');

  // ==========================================
  // TEST 10: Scheduled Media — Video
  // ==========================================
  console.log('\n--- TEST 10: Scheduled Media (Video) ---');
  sentVideos = [];
  const videoReply: TelegramMessage = {
    message_id: 6002,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: adminId, is_bot: false, first_name: 'AdminUser' },
    video: { file_id: 'video_file_789', file_unique_id: 'v1', width: 640, height: 480, duration: 30 }
  };
  const ctx10 = createContext(`/schedule 2h Weekly Video Summary`, videoReply);
  await CommandHandler.handleCommand(ctx10);

  const videoSchedule = db.getAllSchedules().find(s => s.mediaFileId === 'video_file_789');
  assert.ok(videoSchedule, 'Video schedule must be created');
  assert.strictEqual(videoSchedule.contentType, 'video');

  videoSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();
  const matchingVideo = sentVideos.find(v => v.chatId === testChatId && v.video === 'video_file_789');
  assert.ok(matchingVideo, 'Expected sendVideo called for scheduled video');
  console.log('✅ [PASS] TEST 10: Video scheduling works seamlessly');

  // ==========================================
  // TEST 11: Scheduled Media — Document / File
  // ==========================================
  console.log('\n--- TEST 11: Scheduled Media (Document) ---');
  sentDocuments = [];
  const docReply: TelegramMessage = {
    message_id: 6003,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: adminId, is_bot: false, first_name: 'AdminUser' },
    document: { file_id: 'doc_file_321', file_unique_id: 'd1', file_name: 'rules.pdf' }
  };
  const ctx11 = createContext(`/schedule 1d Daily Report PDF`, docReply);
  await CommandHandler.handleCommand(ctx11);

  const docSchedule = db.getAllSchedules().find(s => s.mediaFileId === 'doc_file_321');
  assert.ok(docSchedule, 'Document schedule must be created');
  assert.strictEqual(docSchedule.contentType, 'document');

  docSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();
  const matchingDoc = sentDocuments.find(d => d.chatId === testChatId && d.document === 'doc_file_321');
  assert.ok(matchingDoc, 'Expected sendDocument called for scheduled document');
  console.log('✅ [PASS] TEST 11: Document scheduling works as expected');

  // ==========================================
  // TEST 12: Scheduled Media — Sticker
  // ==========================================
  console.log('\n--- TEST 12: Scheduled Media (Sticker) ---');
  sentStickers = [];
  const stickerReply: TelegramMessage = {
    message_id: 6004,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: adminId, is_bot: false, first_name: 'AdminUser' },
    sticker: { file_id: 'sticker_file_654', file_unique_id: 's1', width: 512, height: 512, is_animated: false, is_video: false }
  };
  const ctx12 = createContext(`/schedule 3h`, stickerReply);
  await CommandHandler.handleCommand(ctx12);

  const stickerSchedule = db.getAllSchedules().find(s => s.mediaFileId === 'sticker_file_654');
  assert.ok(stickerSchedule, 'Sticker schedule must be created');
  assert.strictEqual(stickerSchedule.contentType, 'sticker');

  stickerSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();
  const matchingSticker = sentStickers.find(s => s.chatId === testChatId && s.sticker === 'sticker_file_654');
  assert.ok(matchingSticker, 'Expected sendSticker called for scheduled sticker');
  console.log('✅ [PASS] TEST 12: Sticker scheduling works as expected');

  // ==========================================
  // TEST 13: Scheduled Media — Animation / GIF
  // ==========================================
  console.log('\n--- TEST 13: Scheduled Media (Animation/GIF) ---');
  sentAnimations = [];
  const animReply: TelegramMessage = {
    message_id: 6005,
    date: Math.floor(Date.now() / 1000),
    chat: { id: testChatId, type: 'supergroup', title: 'Formatting Test Group' },
    from: { id: adminId, is_bot: false, first_name: 'AdminUser' },
    animation: { file_id: 'anim_file_987', file_unique_id: 'a1', width: 320, height: 240, duration: 5 }
  };
  const ctx13 = createContext(`/schedule 4h Weekend Hype GIF!`, animReply);
  await CommandHandler.handleCommand(ctx13);

  const animSchedule = db.getAllSchedules().find(s => s.mediaFileId === 'anim_file_987');
  assert.ok(animSchedule, 'Animation schedule must be created');
  assert.strictEqual(animSchedule.contentType, 'animation');

  animSchedule.nextRun = new Date(Date.now() - 5000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();
  const matchingAnim = sentAnimations.find(a => a.chatId === testChatId && a.animation === 'anim_file_987');
  assert.ok(matchingAnim, 'Expected sendAnimation called for scheduled animation');
  console.log('✅ [PASS] TEST 13: Animation/GIF scheduling works as expected');

  // ==========================================
  // TEST 14: /setwelcome & /setrules Multiline Preservation
  // ==========================================
  console.log('\n--- TEST 14: /setwelcome & /setrules Multiline Preservation ---');
  sentMessages = [];
  const welcomeMultiline = `/setwelcome\nWelcome to {chat_title}, {mention}!\n\nRules:\n1. Be polite\n2. No spam`;
  const ctx14a = createContext(welcomeMultiline);
  await CommandHandler.handleCommand(ctx14a);

  const updatedSettings = db.getGroupSettings(testChatId);
  assert.strictEqual(updatedSettings.welcomeMessage, `Welcome to {chat_title}, {mention}!\n\nRules:\n1. Be polite\n2. No spam`);

  const rulesMultiline = `/setrules\nRule 1: Be respectful\nRule 2: English only\nRule 3: No promotional links`;
  const ctx14b = createContext(rulesMultiline);
  await CommandHandler.handleCommand(ctx14b);

  const updatedRules = db.getRules(testChatId);
  assert.strictEqual(updatedRules, `Rule 1: Be respectful\nRule 2: English only\nRule 3: No promotional links`);
  console.log('✅ [PASS] TEST 14: /setwelcome and /setrules preserve multiline content');

  // ==========================================
  // TEST 15: /help schedule & Catalog Documentation of Scheduled Media
  // ==========================================
  console.log('\n--- TEST 15: /help schedule & Command Catalog Documentation ---');
  sentMessages = [];
  const ctx15 = createContext(`/help schedule`);
  await CommandHandler.handleCommand(ctx15);

  assert.strictEqual(sentMessages.length, 1, 'Expected 1 message from /help schedule');
  const helpText = sentMessages[0].text;
  assert.ok(helpText.includes('SCHEDULE'), 'Help output must include SCHEDULE section');
  assert.ok(helpText.includes('/schedule 10m Your reminder'), 'Help output must show text schedule syntax');
  assert.ok(helpText.includes('/schedule 1h\nLine 1\nLine 2\nLine 3'), 'Help output must show multiline syntax');
  assert.ok(helpText.includes('Reply to a supported photo/video/sticker/file/GIF'), 'Help output must explain reply workflow');
  assert.ok(helpText.includes('Supported scheduled content:'), 'Help output must list supported media types');
  assert.ok(helpText.includes('Photos') && helpText.includes('Stickers') && helpText.includes('Videos') && helpText.includes('Files/Documents'), 'Help output must include Photos, Stickers, Videos, Files');

  // Verify commandCatalog item
  const scheduleCatalog = getCatalogItem('/schedule');
  assert.ok(scheduleCatalog, 'Catalog must contain /schedule');
  assert.ok(scheduleCatalog.syntax.includes('reply to media') || scheduleCatalog.description.includes('media'), 'Catalog description must document media support');
  assert.ok(scheduleCatalog.example.includes('Meeting') || scheduleCatalog.example.includes('Reminder'), 'Catalog example must include example');

  const announceCatalog = getCatalogItem('/announce');
  assert.ok(announceCatalog, 'Catalog must contain /announce alias');

  const lustmodeCatalog = getCatalogItem('/lustmode');
  assert.ok(lustmodeCatalog, 'Catalog must contain /lustmode');

  console.log('✅ [PASS] TEST 15: /help schedule and commandCatalog correctly document scheduled media and multiline syntax');

  delete process.env.ENABLE_SCHEDULER;
  console.log('\n====================================================');
  console.log('🎉 ALL COMMAND FORMATTING & SCHEDULED MEDIA TESTS PASSED!');
  console.log('====================================================');
}

runCommandFormattingSuite().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
