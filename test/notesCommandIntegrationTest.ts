import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { ModerationService } from '../server/telegram/moderation.js';

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
  console.log('STARTING NOTES COMMAND INTEGRATION TEST SUITE');
  console.log('====================================================');

  const chatId = -100555666777;
  db.clearAllNotes(chatId);

  let lastSentMessage = '';
  const originalSendMessage = telegramApi.sendMessage;
  const originalGetChatMember = telegramApi.getChatMember;

  (telegramApi as any).sendMessage = async (id: number, text: string, options?: any) => {
    lastSentMessage = text;
    return { message_id: 999, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  (telegramApi as any).getChatMember = async (cId: number, uId: number) => {
    if (uId === 12345) {
      return { ok: true, result: { status: 'administrator', user: { id: 12345, is_bot: false, first_name: 'Admin' } } };
    }
    return { ok: true, result: { status: 'member', user: { id: uId, is_bot: false, first_name: 'User' } } };
  };

  try {
    // 1. NOTE-CMD-01 to 04: /note command
    await CommandHandler.handleCommand({
      command: '/note',
      args: ['faq', 'This', 'is', 'the', 'FAQ'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', username: 'adminuser', is_bot: false },
      message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('Note saved'), 'NOTE-CMD-01 to 04: /note saves note and replies successfully');

    // Verify stored note
    const note = db.getNote(chatId, 'faq');
    assert(note !== null && note.content === 'This is the FAQ', 'Storage verified: note saved correctly');

    // 2. NOTE-CMD-05 to 07: /getnote command
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/getnote',
      args: ['faq'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'User',
      sender: { id: 67890, first_name: 'User', username: 'normaluser', is_bot: false },
      message: { message_id: 2, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('This is the FAQ'), 'NOTE-CMD-05 to 07: /getnote returns saved note content');

    // Missing note
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/getnote',
      args: ['unknown'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'User',
      sender: { id: 67890, first_name: 'User', username: 'normaluser', is_bot: false },
      message: { message_id: 3, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('Note not found'), 'NOTE-CMD-07: /getnote missing note returns visible error');

    // 3. NOTE-CMD-08 to 10: /notes command
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/notes',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'User',
      sender: { id: 67890, first_name: 'User', username: 'normaluser', is_bot: false },
      message: { message_id: 4, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('Group Notes') && lastSentMessage.includes('faq'), 'NOTE-CMD-08 to 10: /notes lists saved notes');

    // 4. NOTE-CMD-11 to 13: /delnote command
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/delnote',
      args: ['faq'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', username: 'adminuser', is_bot: false },
      message: { message_id: 5, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('Note deleted'), 'NOTE-CMD-11 to 13: /delnote deletes note and replies');
    assert(db.getNote(chatId, 'faq') === null, 'Storage verified: note removed');

    // 5. NOTE-CMD-14 & 15: Hashtag shortcut & stripping #
    db.saveNote(chatId, 'rules', 'Group rules content', 12345, 'Admin');
    const shortcutHandled = await ModerationService.handleNotesShortcut({
      message_id: 10,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup', title: 'Test' },
      from: { id: 99, first_name: 'Member', is_bot: false },
      text: '#rules'
    });
    assert(shortcutHandled && lastSentMessage.includes('Group rules content'), 'NOTE-CMD-14 & 15: #rules shortcut triggers note retrieval');

    // Save with # in command name: /note #faq2 content
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/note',
      args: ['#faq2', 'FAQ 2 content'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', username: 'adminuser', is_bot: false },
      message: { message_id: 6, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(db.getNote(chatId, 'faq2') !== null, 'NOTE-CMD-15: Leading # in note name is stripped when saving');

    // 6. NOTE-CMD-18: Unauthorized user receives visible response for /delnote
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/delnote',
      args: ['faq2'],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Regular',
      sender: { id: 99999, first_name: 'Regular', username: 'regularuser', is_bot: false },
      message: { message_id: 7, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('permission'), 'NOTE-CMD-18: Unauthorized user receives visible permission error');

    // 7. NOTE-CMD-19: Missing arguments return usage
    lastSentMessage = '';
    await CommandHandler.handleCommand({
      command: '/getnote',
      args: [],
      chatId,
      chatTitle: 'Test Group',
      isAnonymousAdmin: false,
      adminDisplayName: 'Admin',
      sender: { id: 12345, first_name: 'Admin', username: 'adminuser', is_bot: false },
      message: { message_id: 8, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' } }
    });
    assert(lastSentMessage.includes('Usage:'), 'NOTE-CMD-19: Missing arguments returns usage instruction');

    console.log(`\n🎉 Notes Integration Tests Completed: ${passed} Passed, ${failed} Failed`);
    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    telegramApi.sendMessage = originalSendMessage;
    telegramApi.getChatMember = originalGetChatMember;
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
