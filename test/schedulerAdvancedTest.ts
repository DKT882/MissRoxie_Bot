import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { messageScheduler } from '../server/telegram/scheduler.js';

export async function runSchedulerTests() {
  console.log('🧪 Starting Advanced Scheduler & Permissions Test Suite...');

  const chatId = -100888777;
  const chatTitle = 'Scheduler Test Supergroup';
  let lastMessage = '';
  let sentPhotos: any[] = [];

  (telegramApi as any).sendMessage = async (id: number, text: string) => {
    lastMessage = text;
    return { message_id: 201, chat: { id, type: 'supergroup' }, date: Date.now() };
  };
  (telegramApi as any).sendPhoto = async (id: number, photo: string, opts: any) => {
    sentPhotos.push({ photo, caption: opts?.caption });
    return { message_id: 202, chat: { id, type: 'supergroup' }, date: Date.now() };
  };

  // Mock Admin status
  (telegramApi as any).getChatMember = async (id: number, userId: number) => {
    if (userId === 999) {
      return { ok: true, result: { status: 'member', user: { id: 999, first_name: 'NormalMember', is_bot: false } } };
    }
    return { ok: true, result: { status: 'administrator', user: { id: userId, first_name: 'Admin', is_bot: false } } };
  };

  const adminCtxBase = {
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'SuperAdmin',
    sender: { id: 111, first_name: 'SuperAdmin', is_bot: false },
    message: { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' as const } }
  };

  const memberCtxBase = {
    chatId,
    chatTitle,
    isAnonymousAdmin: false,
    adminDisplayName: 'NormalMember',
    sender: { id: 999, first_name: 'NormalMember', is_bot: false },
    message: { message_id: 11, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' as const } }
  };

  // Test 1: Non-admin trying to schedule -> should be rejected by requireAdmin
  lastMessage = '';
  await CommandHandler.handleCommand({
    ...memberCtxBase,
    command: '/schedule',
    args: ['1h', 'Unauthorized schedule']
  });
  if (!lastMessage.includes('administrators') && !lastMessage.includes('Admin') && !lastMessage.includes('Restricted')) {
    throw new Error(`Test 1 Failed: Non-admin scheduling should be rejected (got: "${lastMessage}").`);
  }
  console.log('✅ [PASS] Test 1: Non-admin schedule attempt correctly rejected.');

  // Test 2: Admin scheduling text + links
  lastMessage = '';
  await CommandHandler.handleCommand({
    ...adminCtxBase,
    command: '/schedule',
    args: ['30m', 'Check out our new launch!', 'https://example.com/promo']
  });
  if (!lastMessage.includes('Scheduled Successfully')) {
    throw new Error(`Test 2 Failed: Admin text + link schedule failed (got: "${lastMessage}").`);
  }
  console.log('✅ [PASS] Test 2: Admin text + link schedule created successfully.');

  // Test 3: Admin scheduling via reply to photo with caption
  lastMessage = '';
  sentPhotos = [];
  const replyPhotoMsg = {
    ...adminCtxBase,
    command: '/schedule',
    args: ['2h'],
    message: {
      message_id: 15,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: 'supergroup' as const },
      reply_to_message: {
        message_id: 12,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: 'supergroup' as const },
        photo: [{ file_id: 'photo_file_id_123', file_unique_id: 'uq123', width: 800, height: 600 }],
        caption: 'Promo Photo Caption with link https://example.com'
      }
    }
  };

  await CommandHandler.handleCommand(replyPhotoMsg);
  if (!lastMessage.includes('Scheduled Successfully')) {
    throw new Error(`Test 3 Failed: Reply-based photo scheduling failed (got: "${lastMessage}").`);
  }
  console.log('✅ [PASS] Test 3: Reply-based photo scheduling created successfully.');

  // Test 4: Scheduler execution test
  const schedules = db.getGroupSchedules(chatId);
  const photoSchedule = schedules.find(s => s.contentType === 'photo');
  if (!photoSchedule) {
    throw new Error('Test 4 Failed: Photo schedule not found in database.');
  }

  // Force schedule nextRun to past so checkAndExecuteSchedules executes it
  photoSchedule.nextRun = new Date(Date.now() - 1000).toISOString();
  await messageScheduler.checkAndExecuteSchedules();

  if (sentPhotos.length === 0 || sentPhotos[0].photo !== 'photo_file_id_123') {
    throw new Error('Test 4 Failed: Scheduled photo was not sent correctly.');
  }
  console.log('✅ [PASS] Test 4: Scheduled promotional photo execution verified.');

  console.log('🎉 All Advanced Scheduler & Permissions tests passed successfully!');
}

runSchedulerTests().catch(err => {
  console.error('❌ Scheduler test suite failed:', err);
  process.exit(1);
});
