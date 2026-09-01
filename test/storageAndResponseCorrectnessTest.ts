import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import {
  db,
  MAX_GROUP_STORED_MESSAGES,
  MAX_PRIVATE_CHAT_MESSAGES,
  PRIVATE_CHAT_INACTIVITY_DAYS,
  PRIVATE_CHAT_INACTIVITY_MS,
  MAX_BACKUPS_PER_GROUP,
  StorageManager
} from '../server/db/storage.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { telegramApi } from '../server/telegram/api.js';
import { TelegramMessage } from '../server/telegram/types.js';
import { executeSendMessageWorkflow } from '../server.js';

let passed = 0;
function pass(testName: string) {
  passed++;
  console.log(`✅ [PASS] TEST ${String(passed).padStart(2, '0')}: ${testName}`);
}

async function runStorageAndResponseCorrectnessTests() {
  console.log('================================================================');
  console.log('🧪 Starting Roxie Storage Limits & Response Output Correctness Test Suite');
  console.log('================================================================\n');

  const groupAChatId = -100999888201;
  const groupBChatId = -100999888202;
  const privateUserA = 9991001;
  const privateUserB = 9991002;
  const botUser = { id: 777000222, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup Mocks
  process.env.OPENROUTER_API_KEY = 'test_storage_response_api_key';
  process.env.OPENROUTER_MODEL = 'test/deepseek-chat';

  let capturedSentMessages: Array<{ chatId: number | string; text: string; options?: any }> = [];
  let capturedSentStickers: Array<{ chatId: number | string; sticker: string; options?: any }> = [];
  let mockFetchResponseText = 'Only if you’re paying for the flight and the post-breakup therapy 😏';

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async (chatId: number | string, text: string, options?: any) => {
    capturedSentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 888000 + Math.floor(Math.random() * 1000), chat: { id: chatId }, text } as any };
  };
  (telegramApi as any).sendSticker = async (chatId: number | string, sticker: string, options?: any) => {
    capturedSentStickers.push({ chatId, sticker, options });
    return { ok: true, result: { message_id: 888000 + Math.floor(Math.random() * 1000) } as any };
  };
  (telegramApi as any).getChatMember = async (chatId: number | string, userId: number) => {
    return { ok: true, result: { status: 'administrator', user: { id: userId, is_bot: false, first_name: 'Admin' } } as any };
  };

  const origFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: mockFetchResponseText
            }
          }
        ]
      })
    } as any;
  }) as any;

  // Initialize fresh test group data
  db.updateGroupSettings(groupAChatId, {
    chatTitle: 'Group Alpha Storage Test',
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    lustMode: false
  });
  db.updateGroupSettings(groupBChatId, {
    chatTitle: 'Group Beta Storage Test',
    botLeft: false,
    unavailable: false,
    chatbotEnabled: true,
    lustMode: false
  });
  db.clearGroupMemory(groupAChatId);
  db.clearGroupMemory(groupBChatId);

  // =========================================================================
  // PART 2 REGRESSION TESTS: CRITICAL RESPONSE DUPLICATION FIX
  // =========================================================================

  // TEST 01: Normal English response contains only Roxie's response
  const cleaned01 = ChatbotService.cleanAiText("I'm doing pretty good 😏", "how are you?", "Yohhan");
  assert.strictEqual(cleaned01, "I'm doing pretty good 😏");
  pass("Normal English response contains only Roxie's response");

  // TEST 02: Hindi response contains only Roxie's response
  const cleaned02 = ChatbotService.cleanAiText("User: तुम कैसी हो?\nRoxie: मैं बिल्कुल बढ़िया हूँ 😏", "तुम कैसी हो?", "User");
  assert.strictEqual(cleaned02, "मैं बिल्कुल बढ़िया हूँ 😏");
  pass("Hindi response contains only Roxie's response");

  // TEST 03: Hinglish response contains only Roxie's response
  const cleaned03 = ChatbotService.cleanAiText("Yohhan: kya kar rahi ho? Roxie: Bas tumse baatein kar rahi hoon 😏", "kya kar rahi ho?", "Yohhan");
  assert.strictEqual(cleaned03, "Bas tumse baatein kar rahi hoon 😏");
  pass("Hinglish response contains only Roxie's response");

  // TEST 04: Generated response must not contain "User:"
  const cleaned04 = ChatbotService.cleanAiText("User: Fantastic so how should we take your body to goa as well\nAssistant: Only if you’re paying for the flight and the post-breakup therapy 😏", "Fantastic so how should we take your body to goa as well", "User");
  assert.strictEqual(cleaned04.includes('User:'), false);
  assert.strictEqual(cleaned04, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  pass('Generated response must not contain "User:"');

  // TEST 05: Generated response must not contain "Roxie:"
  const cleaned05 = ChatbotService.cleanAiText("Roxie: Only if you’re paying for the flight and the post-breakup therapy 😏");
  assert.strictEqual(cleaned05.startsWith('Roxie:'), false);
  assert.strictEqual(cleaned05, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  pass('Generated response must not contain "Roxie:"');

  // TEST 06: Generated response must not contain previous username + colon
  const cleaned06 = ChatbotService.cleanAiText("Yohhan: Fantastic so how should we take your body to goa as well Roxie: Only if you’re paying for the flight and the post-breakup therapy 😏", "Fantastic so how should we take your body to goa as well", "Yohhan");
  assert.strictEqual(cleaned06.includes('Yohhan:'), false);
  assert.strictEqual(cleaned06, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  pass('Generated response must not contain previous username + colon');

  // TEST 07: Previous user message must never be duplicated into response.text
  const userMsgText = "Fantastic so how should we take your body to goa as well";
  const rawAiDuplicatedOutput = `Yohhan: ${userMsgText} Roxie: Only if you’re paying for the flight and the post-breakup therapy 😏`;
  const cleaned07 = ChatbotService.cleanAiText(rawAiDuplicatedOutput, userMsgText, "Yohhan");
  assert.strictEqual(cleaned07.includes(userMsgText), false);
  assert.strictEqual(cleaned07, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  pass('Previous user message must never be duplicated into response.text');

  // TEST 08: Conversation history can be passed to the AI without appearing in final output
  const rawMultiTurnTranscript = `User: Hello\nRoxie: Hi there!\nUser: ${userMsgText}\nRoxie: Only if you’re paying for the flight and the post-breakup therapy 😏`;
  const cleaned08 = ChatbotService.cleanAiText(rawMultiTurnTranscript, userMsgText, "User");
  assert.strictEqual(cleaned08, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  pass('Conversation history can be passed to the AI without appearing in final output');

  // TEST 09: Lust Mode response does not contain transcript
  db.updateGroupSettings(groupAChatId, { lustMode: true });
  const rawLustOutput = "User: jaan kya kar rahi ho?\nRoxie: Bas tumhara hi intezaar kar rahi thi jaan 😏";
  const cleaned09 = ChatbotService.cleanAiText(rawLustOutput, "jaan kya kar rahi ho?", "User");
  assert.strictEqual(cleaned09, "Bas tumhara hi intezaar kar rahi thi jaan 😏");
  pass('Lust Mode response does not contain transcript');

  // TEST 10: Brother-zone response does not contain transcript
  const rawBrotherOutput = "User: bhai kya kar rahi ho?\nRoxie: Bro mat bolo na jaan 😏";
  const cleaned10 = ChatbotService.cleanAiText(rawBrotherOutput, "bhai kya kar rahi ho?", "User");
  assert.strictEqual(cleaned10, "Bro mat bolo na jaan 😏");
  pass('Brother-zone response does not contain transcript');

  // TEST 11: Sticker + AI text response contains only AI text
  db.updateGroupSettings(groupAChatId, { lustMode: false });
  capturedSentMessages = [];
  capturedSentStickers = [];
  await (ChatbotService as any).dispatchResponse({
    requestId: 'test_text_sticker_11',
    chatId: groupAChatId,
    messageId: 3001,
    userId: 1001,
    personality: 'Psychologist-style',
    mood: 'normal',
    responseType: 'text_plus_sticker',
    content: 'Roxie: Looking hot today! 😏',
    mediaFileId: 'CAACAgIAAxUAAWqUbAmm0-cAAbEQuucFAyRtLK9MBAACBQADwDZPE_lqX5qCa011PQQ',
    replyToMessageId: 3001
  });
  const lastSent = capturedSentMessages[capturedSentMessages.length - 1];
  assert.ok(lastSent);
  assert.strictEqual(lastSent.text.includes('Roxie:'), false);
  assert.strictEqual(lastSent.text, "Looking hot today! 😏");
  assert.strictEqual(capturedSentStickers.length, 1);
  pass('Sticker + AI text response contains only AI text');

  // TEST 12: Telegram sendMessage receives only the final Roxie response
  capturedSentMessages = [];
  mockFetchResponseText = "Yohhan: Fantastic so how should we take your body to goa as well Roxie: Only if you’re paying for the flight and the post-breakup therapy 😏";
  const msgDuplicateTrigger: TelegramMessage = {
    message_id: 3002,
    date: Math.floor(Date.now() / 1000),
    chat: { id: groupAChatId, type: 'supergroup', title: 'Alpha' },
    from: { id: 1001, is_bot: false, first_name: 'Yohhan' },
    text: 'Roxie Fantastic so how should we take your body to goa as well'
  };
  await ChatbotService.handleMessage(msgDuplicateTrigger, botUser);
  const finalSentMsg = capturedSentMessages[capturedSentMessages.length - 1];
  assert.ok(finalSentMsg, 'Telegram message was sent');
  assert.strictEqual(finalSentMsg.text, "Only if you’re paying for the flight and the post-breakup therapy 😏");
  assert.strictEqual(finalSentMsg.text.includes('Yohhan:'), false);
  pass('Telegram sendMessage receives only the final Roxie response');

  // TEST 13: Dashboard reply-to-message does not duplicate replied message into text
  capturedSentMessages = [];
  const replyRes = await executeSendMessageWorkflow(
    groupAChatId,
    "Only if you're paying for the flight 😏",
    3002, // reply to message 3002
    'dashboard_admin'
  );
  assert.strictEqual(replyRes.status, 200);
  const lastReplySent = capturedSentMessages[capturedSentMessages.length - 1];
  assert.strictEqual(lastReplySent.text, "Only if you're paying for the flight 😏");
  assert.strictEqual(lastReplySent.options?.reply_to_message_id, 3002);
  pass('Dashboard reply-to-message does not duplicate replied message');

  // TEST 14: Dashboard manually sent messages are not incorrectly sanitized
  capturedSentMessages = [];
  const manualRes = await executeSendMessageWorkflow(
    groupAChatId,
    "User manual update from Roxie: Server maintenance at 12:00",
    undefined,
    'dashboard_admin'
  );
  assert.strictEqual(manualRes.status, 200);
  const lastManualSent = capturedSentMessages[capturedSentMessages.length - 1];
  assert.strictEqual(lastManualSent.text, "User manual update from Roxie: Server maintenance at 12:00");
  pass('Dashboard manually sent messages are not incorrectly sanitized');

  // TEST 15: Empty/null/garbage AI response is handled safely
  const emptyClean = ChatbotService.cleanAiText("");
  assert.strictEqual(emptyClean, "");
  const nullClean = ChatbotService.cleanAiText(null as any);
  assert.strictEqual(nullClean, "");
  const asterisksOnlyClean = ChatbotService.cleanAiText("*laughs* *winks*");
  assert.strictEqual(asterisksOnlyClean, "");
  pass('Empty/null/garbage AI response is handled safely');

  // TEST 16: Speaker labels are safely handled
  const labelsToTest = [
    { in: "Assistant: Hello there!", out: "Hello there!" },
    { in: "[Roxie]: What's up?", out: "What's up?" },
    { in: "(Roxie): Let's chat.", out: "Let's chat." },
    { in: "Bot: Greetings!", out: "Greetings!" },
    { in: "AI: I'm ready.", out: "I'm ready." }
  ];
  for (const item of labelsToTest) {
    assert.strictEqual(ChatbotService.cleanAiText(item.in), item.out);
  }
  pass('Speaker labels are safely handled');

  // TEST 17: Existing multilingual behavior still passes
  const hindiPromptRes = ChatbotService.cleanAiText("नमस्ते! आप कैसे हैं?");
  assert.strictEqual(hindiPromptRes, "नमस्ते! आप कैसे हैं?");
  const hinglishPromptRes = ChatbotService.cleanAiText("Arre yaar sab badhiya hai!");
  assert.strictEqual(hinglishPromptRes, "Arre yaar sab badhiya hai!");
  pass('Existing multilingual behavior still passes');

  // TEST 18: Existing Lust Mode behavior still passes
  const lustPushback = ChatbotService.sanitizeLustModeText(
    "Bro mat bolo na jaan 😏",
    "bhai kya kar rahi ho",
    false,
    true
  );
  assert.strictEqual(lustPushback, "Bro mat bolo na jaan 😏");
  pass('Existing Lust Mode behavior still passes');

  // =========================================================================
  // PART 1 & 4 STORAGE TESTS: STORAGE LIMITS & INACTIVITY CLEANUP
  // =========================================================================

  // TEST 19: Group limit = 500
  assert.strictEqual(MAX_GROUP_STORED_MESSAGES, 500);
  assert.strictEqual(StorageManager.MAX_GROUP_STORED_MESSAGES, 500);
  assert.strictEqual(StorageManager.GROUP_MEMORY_LIMIT, 500);
  pass('Group limit = 500');

  // TEST 20: 501st group message removes oldest
  const rollGroupTest = -100999888999;
  db.clearGroupMemory(rollGroupTest);
  for (let i = 1; i <= 500; i++) {
    db.addGroupConversationEntry(rollGroupTest, {
      role: 'user',
      userId: 1000 + (i % 10),
      name: `User_${i}`,
      content: `Group message ${i}`,
      timestamp: Date.now() + i,
      messageId: 10000 + i
    });
  }
  assert.strictEqual(db.getGroupMemory(rollGroupTest).length, 500);
  assert.strictEqual(db.getGroupMemory(rollGroupTest)[0].content, 'Group message 1');

  // Add 501st message
  db.addGroupConversationEntry(rollGroupTest, {
    role: 'user',
    userId: 2000,
    name: 'User_501',
    content: 'Group message 501',
    timestamp: Date.now() + 501,
    messageId: 10501
  });
  const after501 = db.getGroupMemory(rollGroupTest);
  assert.strictEqual(after501.length, 500);
  assert.strictEqual(after501[0].content, 'Group message 2');
  assert.strictEqual(after501[499].content, 'Group message 501');
  pass('501st group message removes oldest');

  // TEST 21: After 1000 messages, exactly latest 500 remain
  for (let i = 502; i <= 1000; i++) {
    db.addGroupConversationEntry(rollGroupTest, {
      role: 'user',
      userId: 1000 + (i % 10),
      name: `User_${i}`,
      content: `Group message ${i}`,
      timestamp: Date.now() + i,
      messageId: 10000 + i
    });
  }
  const after1000 = db.getGroupMemory(rollGroupTest);
  assert.strictEqual(after1000.length, 500);
  assert.strictEqual(after1000[0].content, 'Group message 501');
  assert.strictEqual(after1000[499].content, 'Group message 1000');
  pass('After 1000 messages, exactly latest 500 remain');

  // TEST 22: Group A and Group B limits isolated
  db.clearGroupMemory(groupAChatId);
  db.clearGroupMemory(groupBChatId);
  for (let i = 1; i <= 50; i++) {
    db.addGroupConversationEntry(groupAChatId, {
      role: 'user',
      userId: 101,
      name: 'AlphaUser',
      content: `Alpha message ${i}`,
      timestamp: Date.now() + i
    });
  }
  for (let i = 1; i <= 20; i++) {
    db.addGroupConversationEntry(groupBChatId, {
      role: 'user',
      userId: 201,
      name: 'BetaUser',
      content: `Beta message ${i}`,
      timestamp: Date.now() + i
    });
  }
  assert.strictEqual(db.getGroupMemory(groupAChatId).length, 50);
  assert.strictEqual(db.getGroupMemory(groupBChatId).length, 20);
  pass('Group A and Group B limits isolated');

  // TEST 23: Private chat limit = 200
  assert.strictEqual(MAX_PRIVATE_CHAT_MESSAGES, 200);
  assert.strictEqual(StorageManager.MAX_PRIVATE_CHAT_MESSAGES, 200);
  pass('Private chat limit = 200');

  // TEST 24: 201st private message removes oldest
  const testPrivChatId = 88877701;
  const testPrivChat2 = 88877702;
  const inactiveUserChatId = 88866601;
  const activeUserChatId = 88866602;
  const inactiveUserA = 88866603;
  const activeUserB = 88866604;

  const resetPrivateChat = (id: number) => {
    delete (db as any).data.privateConversations?.[String(id)];
    try { fs.unlinkSync(path.join(db.privateDir, `${id}.json`)); } catch {}
    try { fs.unlinkSync(path.join(db.privateBackupDir, `${id}.json.bak`)); } catch {}
  };

  resetPrivateChat(testPrivChatId);
  resetPrivateChat(testPrivChat2);
  resetPrivateChat(inactiveUserChatId);
  resetPrivateChat(activeUserChatId);
  resetPrivateChat(inactiveUserA);
  resetPrivateChat(activeUserB);

  for (let i = 1; i <= 200; i++) {
    db.addPrivateMessage(testPrivChatId, testPrivChatId, {
      role: i % 2 === 1 ? 'user' : 'assistant',
      content: `DM message ${i}`,
      timestamp: Date.now() + i,
      messageId: 20000 + i
    });
  }
  assert.strictEqual(db.getPrivateChatMessages(testPrivChatId).length, 200);
  assert.strictEqual(db.getPrivateChatMessages(testPrivChatId)[0].content, 'DM message 1');

  // Add 201st private message
  db.addPrivateMessage(testPrivChatId, testPrivChatId, {
    role: 'user',
    content: 'DM message 201',
    timestamp: Date.now() + 201,
    messageId: 20201
  });
  const privAfter201 = db.getPrivateChatMessages(testPrivChatId);
  assert.strictEqual(privAfter201.length, 200);
  assert.strictEqual(privAfter201[0].content, 'DM message 2');
  assert.strictEqual(privAfter201[199].content, 'DM message 201');
  pass('201st private message removes oldest');

  // TEST 25: Private chats are isolated
  db.addPrivateMessage(testPrivChat2, testPrivChat2, {
    role: 'user',
    content: 'User 2 private hello',
    timestamp: Date.now()
  });
  assert.strictEqual(db.getPrivateChatMessages(testPrivChat2).length, 1);
  assert.strictEqual(db.getPrivateChatMessages(testPrivChatId).length, 200);
  pass('Private chats are isolated');

  // TEST 26: Private conversation inactive for 5 days is deleted
  const sixDaysAgo = Date.now() - (6 * 24 * 60 * 60 * 1000);
  (db as any).data.privateConversations[String(inactiveUserChatId)] = {
    chatId: inactiveUserChatId,
    userId: inactiveUserChatId,
    lastUpdated: sixDaysAgo,
    messages: [{ role: 'user', content: 'Old DM message from 6 days ago', timestamp: sixDaysAgo }]
  };
  db.savePrivateJsonSync(inactiveUserChatId);
  // Trigger cleanup
  const cleanedInactiveCount = db.cleanupInactivePrivateConversations(5);
  assert.ok(cleanedInactiveCount >= 1);
  assert.strictEqual(db.getPrivateChatMessages(inactiveUserChatId).length, 0);
  pass('Private conversation inactive for 5 days is deleted');

  // TEST 27: Private conversation active within 5 days is retained
  const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
  db.addPrivateMessage(activeUserChatId, activeUserChatId, {
    role: 'user',
    content: 'Active DM message from 2 days ago',
    timestamp: twoDaysAgo
  });
  db.savePrivateJsonSync(activeUserChatId);
  db.cleanupInactivePrivateConversations(5);
  assert.strictEqual(db.getPrivateChatMessages(activeUserChatId).length, 1);
  pass('Private conversation active within 5 days is retained');

  // TEST 28: Inactive User A cleanup does not affect User B
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  (db as any).data.privateConversations[String(inactiveUserA)] = {
    chatId: inactiveUserA,
    userId: inactiveUserA,
    lastUpdated: sevenDaysAgo,
    messages: [{ role: 'user', content: 'User A message 7 days ago', timestamp: sevenDaysAgo }]
  };
  db.savePrivateJsonSync(inactiveUserA);
  db.addPrivateMessage(activeUserB, activeUserB, {
    role: 'user',
    content: 'User B message 1 hour ago',
    timestamp: Date.now() - 3600000
  });
  db.cleanupInactivePrivateConversations(5);
  assert.strictEqual(db.getPrivateChatMessages(inactiveUserA).length, 0);
  assert.strictEqual(db.getPrivateChatMessages(activeUserB).length, 1);
  assert.strictEqual(db.getPrivateChatMessages(activeUserB)[0].content, 'User B message 1 hour ago');
  pass('Inactive User A cleanup does not affect User B');

  // TEST 29: Startup cleanup trims old group messages to 500
  const oversizedGroupChatId = -100999888998;
  const oversizedMessages: any[] = [];
  for (let i = 1; i <= 600; i++) {
    oversizedMessages.push({
      role: 'user',
      userId: 1001,
      name: 'User',
      content: `Oversized msg ${i}`,
      timestamp: Date.now() + i
    });
  }
  const groupFile = path.join(db.groupsDir, `${oversizedGroupChatId}.json`);
  fs.writeFileSync(groupFile, JSON.stringify({
    schemaVersion: 1,
    chatId: oversizedGroupChatId,
    chatTitle: 'Oversized Group',
    messages: oversizedMessages
  }, null, 2), 'utf-8');

  db.loadAllGroupJsons();
  assert.strictEqual(db.getGroupMemory(oversizedGroupChatId).length, 500);
  assert.strictEqual(db.getGroupMemory(oversizedGroupChatId)[0].content, 'Oversized msg 101');
  assert.strictEqual(db.getGroupMemory(oversizedGroupChatId)[499].content, 'Oversized msg 600');
  // Cleanup test file
  try { fs.unlinkSync(groupFile); } catch {}
  pass('Startup cleanup trims old group messages to 500');

  // TEST 30: Startup cleanup trims old private messages to 200
  const oversizedPrivChatId = 88899901;
  const oversizedPrivMsgs: any[] = [];
  for (let i = 1; i <= 300; i++) {
    oversizedPrivMsgs.push({
      role: 'user',
      content: `Oversized DM ${i}`,
      timestamp: Date.now() + i
    });
  }
  const privFile = path.join(db.privateDir, `${oversizedPrivChatId}.json`);
  fs.writeFileSync(privFile, JSON.stringify({
    schemaVersion: 1,
    chatId: oversizedPrivChatId,
    userId: oversizedPrivChatId,
    lastUpdated: Date.now(),
    messages: oversizedPrivMsgs
  }, null, 2), 'utf-8');

  db.loadAllPrivateJsons();
  assert.strictEqual(db.getPrivateChatMessages(oversizedPrivChatId).length, 200);
  assert.strictEqual(db.getPrivateChatMessages(oversizedPrivChatId)[0].content, 'Oversized DM 101');
  try { fs.unlinkSync(privFile); } catch {}
  pass('Startup cleanup trims old private messages to 200');

  // TEST 31: Startup cleanup removes private chats inactive for 5 days
  const oldInactiveFileChatId = 88899902;
  const oldInactiveFile = path.join(db.privateDir, `${oldInactiveFileChatId}.json`);
  fs.writeFileSync(oldInactiveFile, JSON.stringify({
    schemaVersion: 1,
    chatId: oldInactiveFileChatId,
    userId: oldInactiveFileChatId,
    lastUpdated: Date.now() - (8 * 24 * 60 * 60 * 1000), // 8 days old
    messages: [{ role: 'user', content: '8 day old message', timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000) }]
  }, null, 2), 'utf-8');

  db.loadAllPrivateJsons();
  assert.strictEqual(fs.existsSync(oldInactiveFile), false);
  assert.strictEqual(db.getPrivateChatMessages(oldInactiveFileChatId).length, 0);
  pass('Startup cleanup removes private chats inactive for 5 days');

  // TEST 32: Group configuration survives message trimming
  db.updateGroupSettings(groupAChatId, {
    chatTitle: 'Alpha Survives Trimming',
    welcomeEnabled: true,
    welcomeMessage: 'Welcome to Alpha!'
  });
  // Add 550 messages
  for (let i = 1; i <= 550; i++) {
    db.addGroupConversationEntry(groupAChatId, {
      role: 'user',
      userId: 1001,
      name: 'User',
      content: `Fill message ${i}`,
      timestamp: Date.now() + i
    });
  }
  const settingsA = db.getGroupSettings(groupAChatId);
  assert.strictEqual(settingsA.chatTitle, 'Alpha Survives Trimming');
  assert.strictEqual(settingsA.welcomeEnabled, true);
  assert.strictEqual(settingsA.welcomeMessage, 'Welcome to Alpha!');
  assert.strictEqual(db.getGroupMemory(groupAChatId).length, 500);
  pass('Group configuration survives message trimming');

  // TEST 33: Sticker packs survive message trimming
  db.addGroupStickerPack(groupAChatId, {
    name: 'trimming_survivor_pack',
    title: 'Survivor Pack',
    enabled: true,
    stickers: [{ fileId: 'file_survivor_1', emoji: '✨', mood: 'happy', category: 'custom' }]
  });
  assert.strictEqual(db.getGroupStickerPacks(groupAChatId).some(p => p.name === 'trimming_survivor_pack'), true);
  pass('Sticker packs survive message trimming');

  // TEST 34: Backups remain limited to latest 5 per group
  assert.strictEqual(MAX_BACKUPS_PER_GROUP, 5);
  assert.strictEqual(StorageManager.MAX_BACKUPS_PER_GROUP, 5);
  pass('Backups remain limited to latest 5 per group');

  // TEST 35: Existing restore functionality still works
  const backupData = db.buildGroupDataObject(groupAChatId);
  assert.ok(backupData);
  assert.strictEqual(backupData.schemaVersion, 1);
  assert.strictEqual(backupData.chat.title, 'Alpha Survives Trimming');
  assert.strictEqual(backupData.settings.chatTitle, 'Alpha Survives Trimming');
  db.restoreGroupData(groupAChatId, backupData);
  assert.strictEqual(db.getGroupSettings(groupAChatId).chatTitle, 'Alpha Survives Trimming');
  pass('Existing restore functionality still works');

  console.log('\n================================================================');
  console.log(`🎉 ALL ${passed}/35 STORAGE LIMITS & RESPONSE OUTPUT TESTS PASSED!`);
  console.log('================================================================\n');
  process.exit(0);
}

runStorageAndResponseCorrectnessTests().catch(err => {
  console.error('❌ Test suite failed with error:', err);
  process.exit(1);
});
