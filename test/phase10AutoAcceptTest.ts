import fs from 'fs';
import path from 'path';
import { CommandHandler } from '../server/telegram/commands.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { ModerationService } from '../server/telegram/moderation.js';

const botManager = new TelegramBotManager();

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
  console.log('🧪 Starting Roxie Phase 10E Auto Accept Test Suite...');
  console.log('====================================================');

  const chatId = -1009001005;
  const groupFilePath = path.join(process.cwd(), 'data', 'groups', `${chatId}.json`);
  let lastMessage = '';
  const sentMessages: Array<{ chatId: number | string; text: string }> = [];
  const approvedRequests: Array<{ chatId: number | string; userId: number }> = [];

  (telegramApi as any).getMe = async () => ({
    ok: true,
    result: { id: 999000111, is_bot: true, first_name: 'Roxie', username: 'MissRoxie_Bot' }
  });
  (telegramApi as any).sendMessage = async (id: number | string, text: string) => {
    lastMessage = text;
    sentMessages.push({ chatId: id, text });
    return { ok: true, result: { message_id: Math.floor(Math.random() * 10000) + 100, chat: { id, type: Number(id) > 0 ? 'private' : 'supergroup' }, date: Date.now() } };
  };
  (telegramApi as any).getChatMember = async (_cid: number | string, uid: number) => ({
    ok: true,
    result: {
      status: 'administrator',
      can_invite_users: true,
      can_restrict_members: true,
      can_delete_messages: true,
      user: { id: uid, is_bot: uid === 999000111, first_name: 'Admin' }
    }
  });
  (telegramApi as any).approveChatJoinRequest = async (cid: number | string, uid: number) => {
    approvedRequests.push({ chatId: cid, userId: uid });
    return { ok: true, result: true };
  };

  // Reset initial state
  db.updateGroupSettings(chatId, { autoAcceptEnabled: false, welcomeEnabled: false, welcomeDm: { enabled: false, text: 'Welcome {first_name}!' } });

  const ctxBase = {
    chatId,
    chatTitle: 'Test Group',
    isAnonymousAdmin: false,
    adminDisplayName: 'Admin',
    sender: { id: 12345, first_name: 'Admin', is_bot: false },
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: chatId, type: 'supergroup' as const } }
  };

  try {
    // 1. /autoaccept on enables and persists to disk JSON
    await CommandHandler.handleCommand({
      ...ctxBase,
      command: '/autoaccept',
      args: ['on']
    });
    const settings = db.getGroupSettings(chatId);
    assert(settings.autoAcceptEnabled === true, 'AUTOACCEPT-01: /autoaccept on enables auto approval in memory');

    const diskAfterOn = fs.existsSync(groupFilePath) ? JSON.parse(fs.readFileSync(groupFilePath, 'utf-8')) : null;
    assert(diskAfterOn?.settings?.autoAcceptEnabled === true, 'AUTOACCEPT-02: /autoaccept on persists autoAcceptEnabled=true to group JSON on disk');

    // 2. /autoacceptjoin off disables and persists to disk JSON
    await CommandHandler.handleCommand({
      ...ctxBase,
      command: '/autoacceptjoin',
      args: ['off']
    });
    assert(db.getGroupSettings(chatId).autoAcceptEnabled === false, 'AUTOACCEPT-03: /autoacceptjoin off disables auto approval');
    const diskAfterOff = fs.existsSync(groupFilePath) ? JSON.parse(fs.readFileSync(groupFilePath, 'utf-8')) : null;
    assert(diskAfterOff?.settings?.autoAcceptEnabled === false, 'AUTOACCEPT-04: /autoacceptjoin off persists autoAcceptEnabled=false to group JSON on disk');

    // 3. Join request is NOT approved when autoAcceptEnabled is false
    approvedRequests.length = 0;
    TelegramBotManager.clearJoinApprovalCache();
    ModerationService.clearWelcomedDmCache();
    await (botManager as any).handleChatJoinRequest({
      chat: { id: chatId, title: 'Test Group', type: 'supergroup' },
      from: { id: 700101, is_bot: false, first_name: 'Alice', username: 'alice' },
      user_chat_id: 700101,
      date: Math.floor(Date.now() / 1000)
    });
    assert(approvedRequests.length === 0, 'AUTOACCEPT-05: Join request is not auto-approved when autoAcceptEnabled is false');

    // 4. Enable via /autoacceptjoin on and verify join request auto-approval + Welcome DM with default triggerMode ('normal_join')
    await CommandHandler.handleCommand({
      ...ctxBase,
      command: '/autoacceptjoin',
      args: ['on']
    });
    db.updateGroupSettings(chatId, {
      welcomeEnabled: true,
      welcomeMessage: 'Group welcome {first_name}!',
      welcomeDm: {
        enabled: true,
        text: 'Private DM welcome to {groupname}, {first_name}!',
        triggerMode: 'normal_join'
      }
    });

    sentMessages.length = 0;
    approvedRequests.length = 0;
    TelegramBotManager.clearJoinApprovalCache();
    ModerationService.clearWelcomedDmCache();

    await (botManager as any).handleChatJoinRequest({
      chat: { id: chatId, title: 'Test Group', type: 'supergroup' },
      from: { id: 700102, is_bot: false, first_name: 'Bob', username: 'bobby' },
      user_chat_id: 800102,
      date: Math.floor(Date.now() / 1000)
    });

    assert(approvedRequests.length === 1 && approvedRequests[0].userId === 700102, 'AUTOACCEPT-06: Join request is approved via approveChatJoinRequest when autoAcceptEnabled is true');
    const privateDmsToBob = sentMessages.filter(m => m.chatId === 800102 && m.text.includes('Private DM welcome to Test Group, Bob!'));
    assert(privateDmsToBob.length === 1, 'AUTOACCEPT-07: Personal Welcome DM is delivered to user_chat_id on auto-accepted join request even with default triggerMode="normal_join"');

    // 5. Subsequent chat_member update after auto-accept does NOT send a duplicate Welcome DM
    await (botManager as any).handleChatMemberUpdate({
      chat: { id: chatId, title: 'Test Group', type: 'supergroup' },
      from: { id: 999000111, is_bot: true, first_name: 'Roxie' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: 700102, is_bot: false, first_name: 'Bob', username: 'bobby' } },
      new_chat_member: { status: 'member', user: { id: 700102, is_bot: false, first_name: 'Bob', username: 'bobby' } }
    });
    const totalDmsToBob = sentMessages.filter(m => (m.chatId === 800102 || m.chatId === 700102) && m.text.includes('Private DM welcome'));
    assert(totalDmsToBob.length === 1, 'AUTOACCEPT-08: Follow-up chat_member event after auto-accept does not send duplicate Welcome DM');

    // 6. Duplicate chat_join_request within 60s does not call approveChatJoinRequest twice
    await (botManager as any).handleChatJoinRequest({
      chat: { id: chatId, title: 'Test Group', type: 'supergroup' },
      from: { id: 700102, is_bot: false, first_name: 'Bob', username: 'bobby' },
      user_chat_id: 800102,
      date: Math.floor(Date.now() / 1000)
    });
    assert(approvedRequests.length === 1, 'AUTOACCEPT-09: Duplicate chat_join_request within 60s is deduplicated and not approved twice');

    // 7. Missing can_invite_users permission failure logs actionable error
    (telegramApi as any).approveChatJoinRequest = async () => ({
      ok: false,
      error_code: 400,
      description: 'Bad Request: CHAT_ADMIN_REQUIRED'
    });
    await (botManager as any).handleChatJoinRequest({
      chat: { id: chatId, title: 'Test Group', type: 'supergroup' },
      from: { id: 700103, is_bot: false, first_name: 'Charlie', username: 'charlie' },
      user_chat_id: 800103,
      date: Math.floor(Date.now() / 1000)
    });
    const errorLogs = db.getGroupLogs(chatId, 20);
    const hasPermissionLog = errorLogs.some(l => l.action === 'auto_accept' && l.details.includes('can_invite_users'));
    assert(hasPermissionLog, 'AUTOACCEPT-10: Missing can_invite_users right on approveChatJoinRequest logs actionable permission error');
  } finally {
    if (fs.existsSync(groupFilePath)) {
      try { fs.unlinkSync(groupFilePath); } catch {}
    }
  }

  console.log(`🎉 Phase 10E Tests Completed: ${passed} Passed, ${failed} Failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

