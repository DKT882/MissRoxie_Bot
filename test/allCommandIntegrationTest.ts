process.env.NODE_ENV = 'test';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';

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
  console.log('STARTING /ALL COMMAND INTEGRATION TEST SUITE');
  console.log('====================================================');

  const chatId = -100999888778;

  // Cache test members
  db.cacheUser({ id: 111, first_name: 'Alice', username: 'alice' }, chatId);
  db.cacheUser({ id: 222, first_name: 'Bob', username: 'bob' }, chatId);
  db.cacheUser({ id: 333, first_name: 'Bot', username: 'testbot' }, chatId); // Bot should be excluded by username filter

  let sentMessages: { text: string; options: any }[] = [];
  const originalSendMessage = telegramApi.sendMessage;
  const originalGetMe = telegramApi.getMe;
  const originalGetChatMember = telegramApi.getChatMember;
  const originalDeleteMessage = telegramApi.deleteMessage;

  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    sentMessages.push({ text, options });
    return { message_id: 100, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  (telegramApi as any).getMe = async () => {
    return { ok: true, result: { id: 999, is_bot: true, username: 'RoxieBot', first_name: 'Roxie' } };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === 12345) {
      return { ok: true, result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } } };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'User' } } };
  };

  let deletedMessageIds: number[] = [];
  (telegramApi as any).deleteMessage = async (cId: number, mId: number) => {
    deletedMessageIds.push(mId);
    return { ok: true };
  };

  let sentPhotos: { chatId: number; photo: string; options: any }[] = [];
  let sentVideos: { chatId: number; video: string; options: any }[] = [];
  let sentAnimations: { chatId: number; animation: string; options: any }[] = [];
  let sentDocuments: { chatId: number; document: string; options: any }[] = [];

  const originalSendPhoto = telegramApi.sendPhoto;
  const originalSendVideo = telegramApi.sendVideo;
  const originalSendAnimation = telegramApi.sendAnimation;
  const originalSendDocument = telegramApi.sendDocument;

  (telegramApi as any).sendPhoto = async (cId: number, photo: string, options?: any) => {
    sentPhotos.push({ chatId: cId, photo, options });
    return { ok: true, result: { message_id: 200 + sentPhotos.length, chat: { id: cId, type: 'supergroup' } } };
  };

  (telegramApi as any).sendVideo = async (cId: number, video: string, options?: any) => {
    sentVideos.push({ chatId: cId, video, options });
    return { ok: true, result: { message_id: 300 + sentVideos.length, chat: { id: cId, type: 'supergroup' } } };
  };

  (telegramApi as any).sendAnimation = async (cId: number, animation: string, options?: any) => {
    sentAnimations.push({ chatId: cId, animation, options });
    return { ok: true, result: { message_id: 400 + sentAnimations.length, chat: { id: cId, type: 'supergroup' } } };
  };

  (telegramApi as any).sendDocument = async (cId: number, document: string, options?: any) => {
    sentDocuments.push({ chatId: cId, document, options });
    return { ok: true, result: { message_id: 500 + sentDocuments.length, chat: { id: cId, type: 'supergroup' } } };
  };

  try {
    // Test 1: ALL-07: Unauthorized member receives permission error
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Regular',
      sender: { id: 777, first_name: 'Regular', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(sentMessages.some(m => m.text.includes('permission') || m.text.includes('administrator')), 'ALL-07: Unauthorized user receives permission error');

    // Test 2: ALL-01 & ALL-03 & ALL-06: Authorized admin sends /all, generates clickable emoji mentions, excludes bot
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    const combinedText = sentMessages.map(m => m.text).join(' ');
    assert(combinedText.includes('tg://user?id=111'), 'ALL-03: Includes clickable emoji tg://user mention for Alice (id: 111)');
    assert(combinedText.includes('tg://user?id=222'), 'ALL-03: Includes clickable emoji tg://user mention for Bob (id: 222)');
    assert(!combinedText.includes('tg://user?id=333'), 'ALL-06: Excludes bot user (id: 333) from mentions');

    // Test 3: ALL-02: Custom message support (/all hello everyone)
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['hello', 'everyone'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    const customCombined = sentMessages.map(m => m.text).join(' ');
    assert(customCombined.includes('hello everyone'), 'ALL-02: /all with custom message includes custom text');
    assert(customCombined.includes('tg://user?id=111') && customCombined.includes('tg://user?id=222'), 'ALL-02: /all custom message includes member mentions');

    // Test 4: ALL-05: Empty member handling when no members found
    const emptyChatId = -888999;
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: [],
      chatId: emptyChatId,
      chatTitle: 'Empty Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: emptyChatId, type: 'supergroup' } }
    });
    assert(sentMessages.some(m => m.text.includes('No eligible group members') || m.text.includes('cached group members')), 'ALL-05: Empty member handling returns informative warning');

    // Seed 25 members for multi-batch testing (25 members -> 3 batches of 10, 10, 5)
    const multiBatchChatId = -1004494262619;
    for (let i = 1; i <= 25; i++) {
      db.cacheUser({ id: 5000 + i, first_name: `Member${i}`, username: `member_${i}` }, multiBatchChatId);
    }

    // Test 5: ALL-08: Replied photo with 25 members sends 3 sendPhoto messages, all with photo file_id & custom caption
    sentPhotos = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['ajao', 'sab'],
      chatId: multiBatchChatId,
      chatTitle: 'Multi Batch Supergroup',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 50,
        date: Math.floor(Date.now() / 1000),
        chat: { id: multiBatchChatId, type: 'supergroup' },
        reply_to_message: {
          message_id: 40,
          date: Math.floor(Date.now() / 1000),
          chat: { id: multiBatchChatId, type: 'supergroup' },
          photo: [
            { file_id: 'thumb_photo_id', file_unique_id: 'u1', width: 100, height: 100 },
            { file_id: 'best_photo_id_999', file_unique_id: 'u2', width: 800, height: 800 }
          ]
        }
      }
    });

    assert(sentPhotos.length === 3, `ALL-08: 25 members produced exactly 3 sendPhoto calls (got ${sentPhotos.length})`);
    assert(sentPhotos.every(p => p.photo === 'best_photo_id_999'), 'ALL-08: All 3 batches reuse original photo file_id');
    assert(sentPhotos.every(p => p.options.caption.startsWith('ajao sab\n\n')), 'ALL-08: All 3 batches contain custom text "ajao sab"');
    assert(sentPhotos[0].options.reply_to_message_id === 40, 'ALL-08: Batch 1 links reply to original message');
    assert(sentPhotos[1].options.reply_to_message_id === undefined, 'ALL-08: Batch 2 does not repeat reply header');
    assert(sentPhotos[2].options.reply_to_message_id === undefined, 'ALL-08: Batch 3 does not repeat reply header');
    assert(sentPhotos.every(p => p.options.parse_mode === 'HTML'), 'ALL-08: All 3 batches use HTML parse_mode');

    // Test 6: ALL-09: Replied video with 25 members sends 3 sendVideo messages, all with video file_id & custom caption
    sentVideos = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['video', 'alert'],
      chatId: multiBatchChatId,
      chatTitle: 'Multi Batch Supergroup',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 51,
        date: Math.floor(Date.now() / 1000),
        chat: { id: multiBatchChatId, type: 'supergroup' },
        reply_to_message: {
          message_id: 41,
          date: Math.floor(Date.now() / 1000),
          chat: { id: multiBatchChatId, type: 'supergroup' },
          video: { file_id: 'video_file_id_888', file_unique_id: 'v1', width: 1280, height: 720, duration: 15 }
        }
      }
    });

    assert(sentVideos.length === 3, `ALL-09: 25 members produced exactly 3 sendVideo calls (got ${sentVideos.length})`);
    assert(sentVideos.every(v => v.video === 'video_file_id_888'), 'ALL-09: All 3 batches reuse original video file_id');
    assert(sentVideos.every(v => v.options.caption.startsWith('video alert\n\n')), 'ALL-09: All 3 batches contain custom caption');

    // Test 7: ALL-10: Replied animation with 25 members sends 3 sendAnimation messages
    sentAnimations = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['gif', 'time'],
      chatId: multiBatchChatId,
      chatTitle: 'Multi Batch Supergroup',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 52,
        date: Math.floor(Date.now() / 1000),
        chat: { id: multiBatchChatId, type: 'supergroup' },
        reply_to_message: {
          message_id: 42,
          date: Math.floor(Date.now() / 1000),
          chat: { id: multiBatchChatId, type: 'supergroup' },
          animation: { file_id: 'anim_file_id_777', file_unique_id: 'a1', width: 400, height: 400, duration: 4 }
        }
      }
    });

    assert(sentAnimations.length === 3, `ALL-10: 25 members produced exactly 3 sendAnimation calls (got ${sentAnimations.length})`);
    assert(sentAnimations.every(a => a.animation === 'anim_file_id_777'), 'ALL-10: All 3 batches reuse original animation file_id');
    assert(sentAnimations.every(a => a.options.caption.startsWith('gif time\n\n')), 'ALL-10: All 3 batches contain custom caption');

    // Test 8: ALL-11: Replied document with 25 members sends 3 sendDocument messages
    sentDocuments = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['read', 'this', 'doc'],
      chatId: multiBatchChatId,
      chatTitle: 'Multi Batch Supergroup',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 53,
        date: Math.floor(Date.now() / 1000),
        chat: { id: multiBatchChatId, type: 'supergroup' },
        reply_to_message: {
          message_id: 43,
          date: Math.floor(Date.now() / 1000),
          chat: { id: multiBatchChatId, type: 'supergroup' },
          document: { file_id: 'doc_file_id_666', file_unique_id: 'd1', file_name: 'notes.pdf' }
        }
      }
    });

    assert(sentDocuments.length === 3, `ALL-11: 25 members produced exactly 3 sendDocument calls (got ${sentDocuments.length})`);
    assert(sentDocuments.every(d => d.document === 'doc_file_id_666'), 'ALL-11: All 3 batches reuse original document file_id');
    assert(sentDocuments.every(d => d.options.caption.startsWith('read this doc\n\n')), 'ALL-11: All 3 batches contain custom caption');

    // Test 9: ALL-12: Multi-batch plain text /all sends 3 sendMessage messages, all with custom text prefix
    sentMessages = [];
    await CommandHandler.handleCommand({
      command: '/all',
      args: ['announcement', 'everyone'],
      chatId: multiBatchChatId,
      chatTitle: 'Multi Batch Supergroup',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', is_bot: false },
      message: {
        message_id: 54,
        date: Math.floor(Date.now() / 1000),
        chat: { id: multiBatchChatId, type: 'supergroup' }
      }
    });

    assert(sentMessages.length === 3, `ALL-12: 25 members produced exactly 3 sendMessage calls (got ${sentMessages.length})`);
    assert(sentMessages.every(m => m.text.startsWith('announcement everyone\n\n')), 'ALL-12: All 3 plain text messages contain custom text prefix');

    console.log(`\n🎉 /all Integration Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getMe = originalGetMe;
    telegramApi.getChatMember = originalGetChatMember;
    telegramApi.deleteMessage = originalDeleteMessage;
    telegramApi.sendPhoto = originalSendPhoto;
    telegramApi.sendVideo = originalSendVideo;
    telegramApi.sendAnimation = originalSendAnimation;
    telegramApi.sendDocument = originalSendDocument;
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
