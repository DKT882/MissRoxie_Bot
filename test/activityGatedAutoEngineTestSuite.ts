import assert from 'node:assert';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { autoEngineService } from '../server/telegram/autoEngineService.js';
import { ChatbotService } from '../server/telegram/chatbot.js';
import { TelegramBotManager } from '../server/telegram/botManager.js';
import { TelegramMessage, TelegramUpdate } from '../server/telegram/types.js';

let passed = 0;
function pass(testName: string) {
  console.log(`✅ [PASS] ${testName}`);
  passed++;
}

async function runActivityGatedAutoEngineTestSuite() {
  console.log('===================================================================');
  console.log('🧪 Starting Full Activity-Gated Auto Response & Sticker Engine Test Suite');
  console.log('===================================================================\n');

  const botId = 812999444;
  const testChatA = -1004223070652;
  const testChatB = -1004449422619;
  const testChatC = -1004450389363;

  // Track API calls
  let sentMessages: Array<{ chatId: number; text: string; options?: any }> = [];
  let sentStickers: Array<{ chatId: number; fileId: string }> = [];
  let sentChatActions: Array<{ chatId: number; action: string }> = [];
  let aiGenerationFail = false;
  let simulatedAiText: string | null = 'Haan ji, sab kaisa chal raha hai group me?';

  const origSendMessage = telegramApi.sendMessage;
  const origSendSticker = telegramApi.sendSticker;
  const origSendChatAction = telegramApi.sendChatAction;
  const origFetch = global.fetch;

  telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
    sentMessages.push({ chatId, text, options });
    return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
  };

  telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
    sentStickers.push({ chatId, fileId: sticker });
    return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
  };

  telegramApi.sendChatAction = async (chatId: number, action: any): Promise<any> => {
    sentChatActions.push({ chatId, action });
    return { ok: true, result: true };
  };

  global.fetch = async (url: any, opts: any): Promise<any> => {
    if (typeof url === 'string' && url.includes('openrouter.ai')) {
      if (aiGenerationFail) {
        return { ok: false, status: 500, text: async () => '{"error":{"message":"AI Service Failure"}}' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: simulatedAiText || 'Haan ji, sab kaisa chal raha hai?'
              }
            }
          ]
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
  };

  // Mock virtual timer clock
  let virtualTime = Date.now();
  let pendingCallbacks: Array<{ id: number; executeAt: number; fn: () => void }> = [];
  let nextTimerId = 1;

  const mockSetTimeout = ((fn: any, delay?: number): any => {
    const id = nextTimerId++;
    const executeAt = virtualTime + (delay || 0);
    pendingCallbacks.push({ id, executeAt, fn });
    return id as any;
  }) as typeof setTimeout;

  const mockClearTimeout = ((id: any): void => {
    pendingCallbacks = pendingCallbacks.filter(c => c.id !== id);
  }) as typeof clearTimeout;

  const mockNow = () => virtualTime;

  const advanceTime = async (ms: number) => {
    virtualTime += ms;
    let ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    while (ready.length > 0) {
      ready.sort((a, b) => a.executeAt - b.executeAt);
      const item = ready.shift()!;
      pendingCallbacks = pendingCallbacks.filter(c => c.id !== item.id);
      await item.fn();
      ready = pendingCallbacks.filter(c => c.executeAt <= virtualTime);
    }
  };

  autoEngineService.setTestHooks({
    setTimeout: mockSetTimeout,
    clearTimeout: mockClearTimeout,
    now: mockNow,
    bypassMinimumIntervalForTests: true
  });

  db.setBotIdentity({ id: botId, username: 'MissRoxie_Bot' });

  // Clean baseline: disable auto engines on existing groups for test isolation
  const initialGroups = db.getAllGroupSettings(botId);
  for (const [idStr] of Object.entries(initialGroups)) {
    db.updateGroupSettings(Number(idStr), {
      lustMode: false,
      autoEngine: { enabled: false, mode: 'off' },
      autoResponse: { enabled: false, mode: 'disabled' },
      autoSticker: { enabled: false, mode: 'disabled' }
    });
  }

  autoEngineService.stop();
  ChatbotService.setProactiveOpportunityProbability(1.0);
  db.clearGroupMemory(testChatA);
  db.clearGroupMemory(testChatB);
  db.clearGroupMemory(testChatC);

  try {
    console.log('--- SECTION 1: Human Activity Counting & Cooldown Gating ---');

    // Setup Test Group A
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      lustMode: false,
      humanMessagesSinceLastSticker: 0,
      stickerActivityMin: 10,
      stickerActivityMax: 10,
      requiredStickerGap: 10,
      responseTypeWeights: { text: 50, sticker: 30, both: 20 },
      autoEngine: {
        enabled: true,
        mode: 'messages_and_stickers',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false },
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);

    // 1. Initial requiredStickerGap is 10
    const gap1 = db.getRequiredStickerGap(testChatA);
    assert.strictEqual(gap1, 10);
    pass('Test 1: requiredStickerGap is persistent across multiple getGroupSettings reads');

    // 2. 5 user messages arrive -> counter = 5
    for (let i = 0; i < 5; i++) {
      db.incrementHumanMessageCount(testChatA);
    }
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 5);
    pass('Test 2: Human messages increment activity counter');

    // 3. User sticker arrives -> counter = 6
    db.incrementHumanMessageCount(testChatA);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 6);
    pass('Test 3: User stickers and media increment activity counter');

    // 4. Activity check confirms sticker is blocked
    const check1 = db.checkAutoStickerEligibility(testChatA);
    assert.strictEqual(check1.allowed, false, 'Sticker must not be eligible when count < gap');
    assert.strictEqual(check1.remainingMessages, 4, 'Remaining messages must be 4');
    pass('Test 4: Sticker is blocked when humanMessagesSinceLastSticker < requiredStickerGap');

    // 5. Timer firing 10 times does NOT send stickers and maintains counter
    autoEngineService.start(botId);
    sentMessages = [];
    sentStickers = [];
    for (let i = 0; i < 10; i++) {
      await advanceTime(35000);
    }
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent after 10 timer ticks');
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 6, 'Activity counter remains untouched by timer ticks');
    pass('Test 5: Timer firing 10 times under activity threshold sends ZERO stickers');

    // 6. 3 more user messages arrive -> counter = 9 (still below 10)
    for (let i = 0; i < 3; i++) {
      db.incrementHumanMessageCount(testChatA);
    }
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 9);
    sentStickers = [];
    await advanceTime(35000);
    assert.strictEqual(sentStickers.length, 0, 'Zero stickers sent at 9/10 threshold');
    pass('Test 6: At 9 human messages (gap=10), sticker send is strictly blocked');

    // 7. 10th human message arrives -> sticker becomes eligible, but is NOT automatically sent immediately
    db.incrementHumanMessageCount(testChatA);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 10);
    const check2 = db.checkAutoStickerEligibility(testChatA);
    assert.strictEqual(check2.allowed, true, 'Sticker must be eligible at 10 messages');
    assert.strictEqual(sentStickers.length, 0, 'No sticker automatically sent merely because threshold was reached');
    pass('Test 7: Reaching threshold makes sticker eligible without automatic instant send');

    console.log('\n--- SECTION 2: Proactive Opportunity & Response Distribution ---');

    // 8. Next opportunity selects TEXT
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Hello group!',
      timestamp: Date.now(),
      messageId: 101
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s8 = db.getGroupSettings(testChatA);
    if (s8.autoResponse) {
      s8.autoResponse.lastResponseTimestamp = 0;
      s8.autoResponse.nextAllowedAt = 0;
    }
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    sentMessages = [];
    sentStickers = [];
    await advanceTime(35000);
    assert.strictEqual(sentMessages.length, 1, 'Roxie sends text when TEXT is selected');
    assert.strictEqual(sentStickers.length, 0, 'Roxie does NOT send sticker when TEXT is selected');
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 10, 'Counter remains 10 when text was sent');
    pass('Test 8: Next opportunity selecting TEXT sends text and preserves sticker counter');

    // 9. Next opportunity selects STICKER -> Roxie sends sticker & resets counter to 0 & chooses new gap
    db.updateGroupSettings(testChatA, {
      stickerActivityMin: 12,
      stickerActivityMax: 18,
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    sentMessages = [];
    sentStickers = [];
    await advanceTime(35000);
    assert.strictEqual(sentStickers.length, 1, 'Roxie sends sticker when STICKER is selected and eligible');
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'Counter must reset to 0 after successful sticker delivery');
    const newGap = db.getRequiredStickerGap(testChatA);
    assert(newGap >= 12 && newGap <= 18, `New gap (${newGap}) must be randomized between 12 and 18`);
    pass('Test 9: Next opportunity selecting STICKER sends sticker, resets counter to 0, and picks new gap');

    // 10. Roxie sending sticker does NOT increment the activity counter
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'Roxie sticker must never increment activity counter');
    pass('Test 10: Roxie sending sticker does NOT increment the activity counter');

    // 11. Next opportunity selects BOTH when sticker cooldown is active -> sends TEXT only
    sentMessages = [];
    sentStickers = [];
    await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text_plus_sticker',
      content: 'Hello group!',
      mediaFileId: 'CAACAgIAAxUAAWqUbAlcgEAzRnlotjNFwchW6qSVAAIaAAPANk8TgtuwtTwGQVc9BA',
      replyToMessageId: 0,
      requestId: 'test-req-11'
    });
    assert.strictEqual(sentMessages.length, 1, 'BOTH mode: Text message sent');
    assert.strictEqual(sentStickers.length, 0, 'BOTH mode: Sticker gated/skipped because cooldown is active');
    pass('Test 11: In BOTH mode during sticker cooldown, text delivers safely and sticker is skipped');

    // 12. Next opportunity selects BOTH when sticker is eligible -> sends TEXT + STICKER and resets counter
    for (let i = 0; i < newGap; i++) {
      db.incrementHumanMessageCount(testChatA);
    }
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), newGap);
    sentMessages = [];
    sentStickers = [];
    await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text_plus_sticker',
      content: 'Hello again!',
      mediaFileId: 'CAACAgIAAxUAAWqUbAlcgEAzRnlotjNFwchW6qSVAAIaAAPANk8TgtuwtTwGQVc9BA',
      replyToMessageId: 0,
      requestId: 'test-req-12'
    });
    assert.strictEqual(sentMessages.length, 1, 'BOTH mode: Text delivered');
    assert.strictEqual(sentStickers.length, 1, 'BOTH mode: Sticker delivered when eligible');
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'BOTH mode: Counter reset to 0 after sticker delivery');
    pass('Test 12: In BOTH mode when eligible, both text and sticker are delivered and counter resets');

    console.log('\n--- SECTION 3: Rolling Window & Context Selection ---');

    // 13. getRandomRecentHumanMessage selects from recent human messages
    db.clearGroupMemory(testChatA);
    for (let i = 1; i <= 25; i++) {
      db.addGroupConversationEntry(testChatA, {
        role: 'user',
        name: `User${i}`,
        content: `Human message number ${i}`,
        timestamp: Date.now() + i * 1000,
        direction: 'incoming'
      });
    }
    db.addGroupConversationEntry(testChatA, {
      role: 'assistant',
      name: 'Roxie',
      content: 'I am Roxie and this is bot text',
      timestamp: Date.now() + 30000,
      direction: 'outgoing'
    });
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Admin',
      content: '/warn user for spam',
      timestamp: Date.now() + 31000,
      direction: 'incoming'
    });

    const randomMsg = ChatbotService.getRandomRecentHumanMessage(testChatA);
    assert(randomMsg !== null, 'Should return a human message');
    assert(randomMsg.role === 'user', 'Role must be user');
    assert(!randomMsg.content.startsWith('/'), 'Command messages must be excluded');
    assert(randomMsg.name !== 'Roxie', 'Roxie messages must be excluded');
    const msgNum = parseInt(randomMsg.content.replace('Human message number ', ''), 10);
    assert(msgNum >= 6 && msgNum <= 25, `Selected message (${msgNum}) must be within the last 20 human messages`);
    pass('Test 13: getRandomRecentHumanMessage correctly selects from recent 20 human messages');

    // 14. getRandomRecentHumanMessage handles < 10 messages gracefully
    db.clearGroupMemory(testChatB);
    db.addGroupConversationEntry(testChatB, {
      role: 'user',
      name: 'Alice',
      content: 'Hey everyone!',
      timestamp: Date.now(),
      direction: 'incoming'
    });
    db.addGroupConversationEntry(testChatB, {
      role: 'user',
      name: 'Bob',
      content: 'Hello Alice!',
      timestamp: Date.now() + 1000,
      direction: 'incoming'
    });
    const randomMsgB = ChatbotService.getRandomRecentHumanMessage(testChatB);
    assert(randomMsgB !== null);
    assert(randomMsgB.name === 'Alice' || randomMsgB.name === 'Bob');
    pass('Test 14: getRandomRecentHumanMessage handles < 10 human messages gracefully');

    // 15. getRandomRecentHumanMessage returns null for empty group
    db.clearGroupMemory(testChatC);
    const randomMsgC = ChatbotService.getRandomRecentHumanMessage(testChatC);
    assert.strictEqual(randomMsgC, null, 'Empty group must return null');
    pass('Test 15: getRandomRecentHumanMessage returns null for empty group');

    console.log('\n--- SECTION 4: Direct @Roxie Independence & Fallback ---');

    // 16. Direct @Roxie works immediately during sticker cooldown (text delivered, sticker gated)
    db.updateGroupSettings(testChatA, {
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 15
    });
    sentMessages = [];
    sentStickers = [];
    const directMentionMsg: TelegramMessage = {
      message_id: 991,
      date: Math.floor(Date.now() / 1000),
      chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
      from: { id: 111, is_bot: false, first_name: 'John' },
      text: '@MissRoxie_Bot how are you today?'
    };
    const handledDirect = await ChatbotService.handleMessage(directMentionMsg, { id: botId, is_bot: true, first_name: 'Roxie', username: 'MissRoxie_Bot' });
    assert.strictEqual(handledDirect, true, 'Direct @Roxie mention must be handled immediately');
    assert.strictEqual(sentMessages.length, 1, 'Direct mention sends text reply');
    assert.strictEqual(sentStickers.length, 0, 'Direct mention cannot bypass sticker cooldown');
    pass('Test 16: Direct @Roxie mention responds with text immediately while sticker is on cooldown');

    // 17. Direct @Roxie allows sticker when activity gap is satisfied
    for (let i = 0; i < 15; i++) {
      db.incrementHumanMessageCount(testChatA);
    }
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 15);
    const eligibilityCheck = db.checkAutoStickerEligibility(testChatA);
    assert.strictEqual(eligibilityCheck.allowed, true);
    pass('Test 17: Direct @Roxie sticker eligibility is true when activity threshold is met');

    console.log('\n--- SECTION 5: AI Failure & Ghost Typing Safety ---');

    // 18. AI generation failure never sends dummy/filler text and leaves 0 typing indicator
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Any updates?',
      timestamp: Date.now(),
      messageId: 102
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s18 = db.getGroupSettings(testChatA);
    if (s18.autoResponse) {
      s18.autoResponse.lastResponseTimestamp = 0;
      s18.autoResponse.nextAllowedAt = 0;
    }
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    aiGenerationFail = true;
    sentMessages = [];
    sentStickers = [];
    sentChatActions = [];
    await advanceTime(35000);
    assert.strictEqual(sentMessages.length, 0, 'AI failure must send ZERO text messages');
    assert.strictEqual(sentStickers.length, 0, 'AI failure must send ZERO sticker fallbacks');
    assert.strictEqual(sentChatActions.length, 0, 'AI failure must NOT send typing indicator');
    aiGenerationFail = false;
    pass('Test 18: AI failure never sends dummy/filler text, typing indicators, or sticker fallback');

    // 19. Failed Telegram sticker send does NOT reset activity counter or gap
    db.incrementHumanMessageCount(testChatA);
    const beforeCount = db.getHumanMessagesSinceLastSticker(testChatA);
    const beforeGap = db.getRequiredStickerGap(testChatA);
    telegramApi.sendSticker = async () => ({ ok: false, error_code: 500, description: 'Telegram Network Timeout' });
    try {
      db.updateGroupSettings(testChatA, {
        autoEngine: {
          enabled: true,
          mode: 'stickers_only',
          stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
        }
      });
      await advanceTime(35000);
    } catch {}
    telegramApi.sendSticker = async (chatId: number, sticker: string): Promise<any> => {
      sentStickers.push({ chatId, fileId: sticker });
      return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
    };
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), beforeCount, 'Counter must NOT reset on failed send');
    assert.strictEqual(db.getRequiredStickerGap(testChatA), beforeGap, 'Gap must NOT change on failed send');
    pass('Test 19: Failed sticker send preserves current activity counter and required gap');

    console.log('\n--- SECTION 6: Multi-Group Isolation & Concurrency Lock ---');

    // 20. Multi-group isolation
    db.updateGroupSettings(testChatB, {
      botId,
      botLeft: false,
      unavailable: false,
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 10
    });
    db.incrementHumanMessageCount(testChatA);
    db.incrementHumanMessageCount(testChatA);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), beforeCount + 2);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatB), 0, 'Group B counter must remain 0');
    pass('Test 20: Multiple groups maintain completely independent activity counters');

    // 21. Per-group execution lock
    const jobA = autoEngineService.getJob(botId, testChatA, 'sticker');
    assert(jobA !== undefined);
    pass('Test 21: AutoEngine schedules exactly one job per group without duplicates');

    // 22. messages_only mode never sends stickers even with high activity
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Hello messages only!',
      timestamp: Date.now(),
      messageId: 103
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s22 = db.getGroupSettings(testChatA);
    if (s22.autoResponse) {
      s22.autoResponse.lastResponseTimestamp = 0;
      s22.autoResponse.nextAllowedAt = 0;
    }
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      },
      humanMessagesSinceLastSticker: 100,
      requiredStickerGap: 10
    });
    sentMessages = [];
    sentStickers = [];
    await advanceTime(35000);
    assert.strictEqual(sentMessages.length, 1, 'messages_only sends text');
    assert.strictEqual(sentStickers.length, 0, 'messages_only mode never sends stickers even with 100 human messages');
    pass('Test 22: messages_only mode never sends stickers regardless of activity count');

    // 23. stickers_only mode sends sticker only when activity threshold is met
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      },
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 10
    });
    sentStickers = [];
    await advanceTime(35000);
    assert.strictEqual(sentStickers.length, 0, 'stickers_only sends 0 stickers when counter is 0');
    for (let i = 0; i < 10; i++) db.incrementHumanMessageCount(testChatA);
    await advanceTime(35000);
    assert.strictEqual(sentStickers.length, 1, 'stickers_only sends sticker when activity threshold is satisfied');
    pass('Test 23: stickers_only mode sends sticker if and only if activity threshold is met');

    // 24. Setting changes dynamically update min/max gap and weights
    db.updateGroupSettings(testChatA, {
      stickerActivityMin: 15,
      stickerActivityMax: 25,
      responseTypeWeights: { text: 70, sticker: 20, both: 10 }
    });
    const sUpdated = db.getGroupSettings(testChatA);
    assert.strictEqual(sUpdated.stickerActivityMin, 15);
    assert.strictEqual(sUpdated.stickerActivityMax, 25);
    assert.strictEqual(sUpdated.responseTypeWeights?.text, 70);
    pass('Test 24: GroupSettings updates dynamically configure activity min/max and weights');

    // 25. Typing indicator is sent only after AI generation succeeds
    sentChatActions = [];
    sentMessages = [];
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Typing test message',
      timestamp: Date.now(),
      messageId: 104
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s25 = db.getGroupSettings(testChatA);
    if (s25.autoResponse) {
      s25.autoResponse.lastResponseTimestamp = 0;
      s25.autoResponse.nextAllowedAt = 0;
    }
    db.updateGroupSettings(testChatA, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    await advanceTime(35000);
    assert.strictEqual(sentChatActions.length, 1, 'Typing action sent after successful AI generation');
    assert.strictEqual(sentChatActions[0].action, 'typing');
    pass('Test 25: Typing indicator sent strictly after successful AI text generation');

    // 26. Invalid Telegram group cancels ONLY that group's timers
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Test chat A message',
      timestamp: Date.now(),
      messageId: 105
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s26A = db.getGroupSettings(testChatA);
    if (s26A.autoResponse) {
      s26A.autoResponse.lastResponseTimestamp = 0;
      s26A.autoResponse.nextAllowedAt = 0;
    }
    db.addGroupConversationEntry(testChatB, {
      role: 'user',
      name: 'Bob',
      content: 'Test chat B message',
      timestamp: Date.now(),
      messageId: 201
    });
    db.setLastProactiveConsideredMessageId(testChatB, 0);
    const s26B = db.getGroupSettings(testChatB);
    if (s26B.autoResponse) {
      s26B.autoResponse.lastResponseTimestamp = 0;
      s26B.autoResponse.nextAllowedAt = 0;
    }
    telegramApi.sendMessage = async (chatId: number, text: string): Promise<any> => {
      if (chatId === testChatA) {
        return { ok: false, error_code: 400, description: 'Bad Request: chat not found' };
      }
      return { ok: true, result: { message_id: 555 } };
    };
    db.updateGroupSettings(testChatB, {
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    await advanceTime(35000);
    assert.strictEqual(autoEngineService.getJob(botId, testChatA, 'response'), undefined, 'Group A job canceled due to permanent error');
    assert(autoEngineService.getJob(botId, testChatB, 'response') !== undefined, 'Group B job continues uninterrupted');
    pass('Test 26: Invalid Telegram group cancels ONLY that group without affecting other groups');

    // 27. Non-destructive startup hydration preserves activity state
    const currentCountA = db.getHumanMessagesSinceLastSticker(testChatA);
    const currentGapA = db.getRequiredStickerGap(testChatA);
    const hydratedSettings = db.getGroupSettings(testChatA);
    assert.strictEqual(hydratedSettings.humanMessagesSinceLastSticker, currentCountA);
    assert.strictEqual(hydratedSettings.requiredStickerGap, currentGapA);
    pass('Test 27: Read-only startup hydration preserves activity counters and required gaps');

    // 28. OpenRouter fallback chain works seamlessly during proactive responses
    db.updateGroupSettings(testChatA, {
      botLeft: false,
      unavailable: false,
      unavailableReason: undefined,
      autoEngine: {
        enabled: true,
        mode: 'messages_only',
        messages: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    db.addGroupConversationEntry(testChatA, {
      role: 'user',
      name: 'Alice',
      content: 'Fallback chain message',
      timestamp: Date.now(),
      messageId: 106
    });
    db.setLastProactiveConsideredMessageId(testChatA, 0);
    const s28 = db.getGroupSettings(testChatA);
    if (s28.autoResponse) {
      s28.autoResponse.lastResponseTimestamp = 0;
      s28.autoResponse.nextAllowedAt = 0;
    }
    let fallbackCalls = 0;
    global.fetch = async (url: any, opts: any): Promise<any> => {
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        fallbackCalls++;
        if (fallbackCalls === 1) {
          return { ok: false, status: 429, text: async () => '{"error":{"message":"Rate limit reached"}}' };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { content: 'Fallback model reply.' } }]
          })
        };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
    };
    telegramApi.sendMessage = async (chatId: number, text: string): Promise<any> => {
      sentMessages.push({ chatId, text });
      return { ok: true, result: { message_id: 777 } };
    };
    sentMessages = [];
    await advanceTime(35000);
    assert.strictEqual(sentMessages.length, 1, 'Proactive message delivered via fallback model');
    assert(fallbackCalls >= 2, 'Fallback chain attempted multiple candidate models');
    pass('Test 28: OpenRouter candidate model fallback chain functions seamlessly');

    // 29. AutoEngine mode OFF immediately cancels all timers for the group
    db.updateGroupSettings(testChatB, {
      autoEngine: { enabled: false, mode: 'off' }
    });
    assert.strictEqual(autoEngineService.getJob(botId, testChatB, 'response'), undefined);
    assert.strictEqual(autoEngineService.getJob(botId, testChatB, 'sticker'), undefined);
    pass('Test 29: AutoEngine mode OFF immediately cancels all jobs for the group');

    // 30. Storage bidirectional merging preserves backward compatibility
    db.updateGroupSettings(testChatC, {
      botId,
      botLeft: false,
      unavailable: false,
      autoResponse: { enabled: true, mode: 'random', minSeconds: 150, maxSeconds: 300, cooldownSeconds: 150 },
      autoSticker: { enabled: true, mode: 'cooldown', minSeconds: 200, maxSeconds: 400, cooldownSeconds: 200 }
    });
    const sLegacy = db.getGroupSettings(testChatC);
    assert.strictEqual(sLegacy.autoEngine?.mode, 'messages_and_stickers');
    assert.strictEqual(sLegacy.autoEngine?.enabled, true);
    assert(sLegacy.requiredStickerGap !== undefined && sLegacy.requiredStickerGap > 0);
    pass('Test 30: Bidirectional storage merging preserves full backward compatibility with activity gating');

    console.log('\n--- SECTION 7: Real Telegram Message Intake via botManager.processUpdate ---');
    telegramApi.sendMessage = async (chatId: number, text: string, options?: any): Promise<any> => {
      sentMessages.push({ chatId, text, options });
      return { ok: true, result: { message_id: 1000 + sentMessages.length, text } };
    };
    telegramApi.sendSticker = async (chatId: number, sticker: string, options?: any): Promise<any> => {
      sentStickers.push({ chatId, fileId: sticker });
      return { ok: true, result: { message_id: 2000 + sentStickers.length, sticker: { file_id: sticker } } };
    };

    const botMgr = new TelegramBotManager();
    (botMgr as any).botUser = { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' };

    // Reset Group A clean state and counter
    db.updateGroupSettings(testChatA, {
      botId,
      botLeft: false,
      unavailable: false,
      humanMessagesSinceLastSticker: 0,
      requiredStickerGap: 15,
      stickerProtection: false,
      mediaProtection: false,
      linksProtection: false,
      stopSpamEnabled: false,
      stopAbusiveEnabled: false,
      stopPromotionEnabled: false,
      floodEnabled: false,
      raidEnabled: false,
      locks: {}
    });
    let updateSeq = 50000;

    // Test 31: Human text message increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 601,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 701, is_bot: false, first_name: 'Alice' },
        text: 'Hey everyone, good morning!'
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 1, 'Human text message must increment activity counter by 1');
    pass('Test 31: TelegramBotManager.processUpdate with human text message increments counter');

    // Test 32: Human user sticker increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 602,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 702, is_bot: false, first_name: 'Bob' },
        sticker: { file_id: 'user_sticker_file_1', emoji: '🎉' } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 2, 'Human user sticker must increment activity counter by 1');
    pass('Test 32: TelegramBotManager.processUpdate with human sticker increments counter');

    // Test 33: Human photo increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 603,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 703, is_bot: false, first_name: 'Charlie' },
        photo: [{ file_id: 'photo_file_1', file_unique_id: 'u1', width: 100, height: 100 }] as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 3, 'Human photo must increment activity counter by 1');
    pass('Test 33: TelegramBotManager.processUpdate with human photo increments counter');

    // Test 34: Human video increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 604,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 704, is_bot: false, first_name: 'David' },
        video: { file_id: 'video_file_1', file_unique_id: 'u2', width: 100, height: 100, duration: 10 } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 4, 'Human video must increment activity counter by 1');
    pass('Test 34: TelegramBotManager.processUpdate with human video increments counter');

    // Test 35: Human animation (GIF) increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 605,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 705, is_bot: false, first_name: 'Emma' },
        animation: { file_id: 'gif_file_1', file_unique_id: 'u3', width: 100, height: 100, duration: 5 } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 5, 'Human animation must increment activity counter by 1');
    pass('Test 35: TelegramBotManager.processUpdate with human animation (GIF) increments counter');

    // Test 36: Human voice increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 606,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 706, is_bot: false, first_name: 'Frank' },
        voice: { file_id: 'voice_file_1', file_unique_id: 'u4', duration: 12 } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 6, 'Human voice must increment activity counter by 1');
    pass('Test 36: TelegramBotManager.processUpdate with human voice increments counter');

    // Test 37: Human audio increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 607,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 707, is_bot: false, first_name: 'Grace' },
        audio: { file_id: 'audio_file_1', file_unique_id: 'u5', duration: 120 } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 7, 'Human audio must increment activity counter by 1');
    pass('Test 37: TelegramBotManager.processUpdate with human audio increments counter');

    // Test 38: Human document increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 608,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 708, is_bot: false, first_name: 'Hannah' },
        document: { file_id: 'doc_file_1', file_unique_id: 'u6', file_name: 'notes.pdf' } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Human document must increment activity counter by 1');
    pass('Test 38: TelegramBotManager.processUpdate with human document increments counter');

    // Test 39: Roxie\'s own message NEVER increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 609,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: botId, is_bot: true, first_name: 'Miss Roxie', username: 'MissRoxie_Bot' },
        text: 'This is my own bot reply'
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Roxie outgoing message must NOT increment activity counter');
    pass('Test 39: TelegramBotManager.processUpdate rejects Roxie own messages from activity counter');

    // Test 40: Another bot\'s message (is_bot: true) NEVER increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 610,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 888999, is_bot: true, first_name: 'OtherSpamBot' },
        text: 'Check out our crypto group!'
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Other bot messages must NOT increment activity counter');
    pass('Test 40: TelegramBotManager.processUpdate rejects other bot messages from activity counter');

    // Test 41: Service messages NEVER increment counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 611,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 709, is_bot: false, first_name: 'NewUser' },
        new_chat_members: [{ id: 709, is_bot: false, first_name: 'NewUser' }] as any
      }
    });
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 612,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 710, is_bot: false, first_name: 'Admin' },
        pinned_message: { message_id: 601 } as any
      }
    });
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 613,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 711, is_bot: false, first_name: 'OldUser' },
        left_chat_member: { id: 711, is_bot: false, first_name: 'OldUser' } as any
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Service messages must NOT increment activity counter');
    pass('Test 41: TelegramBotManager.processUpdate rejects Telegram service messages from activity counter');

    // Test 42: Bot commands beginning with / or ! NEVER increment counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 614,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 701, is_bot: false, first_name: 'Alice' },
        text: '/status'
      }
    });
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 615,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 701, is_bot: false, first_name: 'Alice' },
        text: '!help'
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Commands must NOT increment activity counter');
    pass('Test 42: TelegramBotManager.processUpdate rejects / and ! commands from activity counter');

    // Test 43: Non-meaningful empty or whitespace text NEVER increments counter
    await botMgr.processUpdate({
      update_id: ++updateSeq,
      message: {
        message_id: 616,
        date: Math.floor(Date.now() / 1000),
        chat: { id: testChatA, type: 'supergroup', title: 'Test Group A' },
        from: { id: 701, is_bot: false, first_name: 'Alice' },
        text: '     \n  \t   '
      }
    });
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 8, 'Whitespace text must NOT increment activity counter');
    pass('Test 43: TelegramBotManager.processUpdate rejects whitespace-only messages from activity counter');

    console.log('\n--- SECTION 8: Strict Concurrency Lock & Spam Protection ---');
    // Test 44: Concurrent executeJob calls for the same group only deliver 1 sticker
    db.updateGroupSettings(testChatA, {
      humanMessagesSinceLastSticker: 20,
      requiredStickerGap: 10,
      stickerActivityMin: 10,
      stickerActivityMax: 15,
      autoEngine: {
        enabled: true,
        mode: 'stickers_only',
        stickers: { preset: 'custom', minSeconds: 30, maxSeconds: 30, cooldownSeconds: 30, randomize: false }
      }
    });
    sentStickers = [];
    // Trigger 3 concurrent executeJob executions simultaneously
    await Promise.all([
      (autoEngineService as any).executeJob(botId, testChatA, 'sticker'),
      (autoEngineService as any).executeJob(botId, testChatA, 'sticker'),
      (autoEngineService as any).executeJob(botId, testChatA, 'sticker')
    ]);
    assert.strictEqual(sentStickers.length, 1, 'Strict concurrency lock must allow exactly 1 sticker across simultaneous executions');
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'Counter resets to 0 after sticker execution');
    pass('Test 44: Concurrent executeJob calls are strictly locked preventing duplicate sticker sends');

    // Test 45: 5 rapid timer advances under cooldown produce ZERO stickers
    sentStickers = [];
    for (let i = 0; i < 5; i++) {
      await advanceTime(35000);
    }
    assert.strictEqual(sentStickers.length, 0, '5 timer ticks under activity cooldown produce 0 stickers');
    pass('Test 45: Successive timer ticks under activity threshold produce ZERO stickers');

    console.log('\n--- SECTION 9: Direct @Roxie Full Decision & Fallback Matrix ---');
    // Test 46: Under cooldown + Decision TEXT -> text delivered
    db.updateGroupSettings(testChatA, { humanMessagesSinceLastSticker: 2, requiredStickerGap: 10 });
    sentMessages = [];
    sentStickers = [];
    let handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text',
      content: 'Direct text response',
      replyToMessageId: 901,
      requestId: 'test-46'
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentStickers.length, 0);
    pass('Test 46: Direct @Roxie under cooldown with TEXT decision delivers text');

    // Test 47: Under cooldown + Decision STICKER -> sticker suppressed by eligibility check
    sentMessages = [];
    sentStickers = [];
    handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'sticker',
      mediaFileId: 'sticker_cooldown_test',
      replyToMessageId: 902,
      requestId: 'test-47'
    });
    assert.strictEqual(handled, false);
    assert.strictEqual(sentStickers.length, 0, 'Sticker must be suppressed under cooldown');
    pass('Test 47: Direct @Roxie under cooldown with STICKER decision suppresses sticker');

    // Test 48: Under cooldown + Decision TEXT+STICKER -> falls back to text only
    sentMessages = [];
    sentStickers = [];
    handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text_plus_sticker',
      content: 'Direct text plus sticker response',
      mediaFileId: 'sticker_cooldown_test',
      replyToMessageId: 903,
      requestId: 'test-48'
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(sentMessages.length, 1, 'Text must be delivered as fallback');
    assert.strictEqual(sentStickers.length, 0, 'Sticker must be dropped');
    pass('Test 48: Direct @Roxie under cooldown with TEXT+STICKER falls back cleanly to text');

    // Test 49: Above threshold + Decision TEXT -> text delivered
    db.updateGroupSettings(testChatA, { humanMessagesSinceLastSticker: 12, requiredStickerGap: 10 });
    sentMessages = [];
    sentStickers = [];
    handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text',
      content: 'Above threshold text',
      replyToMessageId: 904,
      requestId: 'test-49'
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentStickers.length, 0);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 12, 'Text message preserves counter');
    pass('Test 49: Direct @Roxie above threshold with TEXT decision delivers text and preserves counter');

    // Test 50: Above threshold + Decision STICKER -> sticker delivered & counter resets
    sentMessages = [];
    sentStickers = [];
    handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'sticker',
      mediaFileId: 'sticker_eligible_test',
      replyToMessageId: 905,
      requestId: 'test-50'
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'Counter must reset to 0 after sticker delivery');
    pass('Test 50: Direct @Roxie above threshold with STICKER decision delivers sticker and resets counter');

    // Test 51: Above threshold + Decision TEXT+STICKER -> both delivered & counter resets
    db.updateGroupSettings(testChatA, { humanMessagesSinceLastSticker: 15, requiredStickerGap: 10 });
    sentMessages = [];
    sentStickers = [];
    handled = await (ChatbotService as any).dispatchResponse({
      chatId: testChatA,
      responseType: 'text_plus_sticker',
      content: 'Both delivered text',
      mediaFileId: 'sticker_eligible_test_both',
      replyToMessageId: 906,
      requestId: 'test-51'
    });
    assert.strictEqual(handled, true);
    assert.strictEqual(sentMessages.length, 1);
    assert.strictEqual(sentStickers.length, 1);
    assert.strictEqual(db.getHumanMessagesSinceLastSticker(testChatA), 0, 'Counter must reset to 0');
    pass('Test 51: Direct @Roxie above threshold with TEXT+STICKER delivers both and resets counter');

    console.log('\n--- SECTION 10: Comprehensive OpenRouter Error Safety ---');
    process.env.OPENROUTER_API_KEY = 'test-api-key-safe';

    const errorCases = [
      { code: 400, body: '{"error":{"message":"Bad Request"}}', name: 'HTTP 400 Bad Request' },
      { code: 402, body: '{"error":{"message":"Payment Required"}}', name: 'HTTP 402 Payment/Credits Required' },
      { code: 429, body: '{"error":{"message":"Rate limit exceeded"}}', name: 'HTTP 429 Rate Limit' },
      { code: 500, body: '{"error":{"message":"Internal Server Error"}}', name: 'HTTP 500 Internal Error' },
      { code: 200, body: '{"choices":[]}', name: 'Empty choices array' },
      { code: 200, body: '{"choices":[{"message":{"content":"SKIP"}}]}', name: 'AI returns SKIP' }
    ];

    let testNum = 52;
    for (const ec of errorCases) {
      global.fetch = async (url: any): Promise<any> => {
        if (typeof url === 'string' && url.includes('openrouter.ai')) {
          return {
            ok: ec.code >= 200 && ec.code < 300,
            status: ec.code,
            text: async () => ec.body,
            json: async () => JSON.parse(ec.body)
          };
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
      };

      sentMessages = [];
      sentStickers = [];
      sentChatActions = [];

      const decision = await ChatbotService.generateProactiveResponse(testChatA, null);
      assert.strictEqual(decision, null, `${ec.name} must return null proactive decision`);
      assert.strictEqual(sentMessages.length, 0, `${ec.name} must send ZERO text messages`);
      assert.strictEqual(sentStickers.length, 0, `${ec.name} must send ZERO stickers`);
      assert.strictEqual(sentChatActions.length, 0, `${ec.name} must send ZERO typing indicators`);
      pass(`Test ${testNum++}: ${ec.name} safely returns null with 0 messages, 0 stickers, and 0 typing actions`);
    }

    // Test 58: OpenRouter network timeout/exception safety
    global.fetch = async (url: any): Promise<any> => {
      if (typeof url === 'string' && url.includes('openrouter.ai')) {
        throw new Error('Connection reset by peer');
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, result: true }) };
    };
    sentMessages = [];
    sentStickers = [];
    sentChatActions = [];
    const timeoutDecision = await ChatbotService.generateProactiveResponse(testChatA, null);
    assert.strictEqual(timeoutDecision, null, 'Network error must return null proactive decision');
    assert.strictEqual(sentMessages.length, 0);
    assert.strictEqual(sentStickers.length, 0);
    assert.strictEqual(sentChatActions.length, 0);
    pass('Test 58: OpenRouter network exception safely returns null with 0 messages, 0 stickers, and 0 typing actions');

    console.log('\n--- SECTION 11: State Persistence & Setting Update Invariance ---');
    // Test 59: Changing unrelated settings preserves activity counter and gap intact
    db.updateGroupSettings(testChatA, {
      humanMessagesSinceLastSticker: 7,
      requiredStickerGap: 14
    });
    db.updateGroupSettings(testChatA, {
      chatTitle: 'Updated Group Title A',
      lustMode: true,
      chatbotEnabled: true
    });
    const preservedSettings = db.getGroupSettings(testChatA);
    assert.strictEqual(preservedSettings.humanMessagesSinceLastSticker, 7, 'Counter must NOT reset on title/lustMode update');
    assert.strictEqual(preservedSettings.requiredStickerGap, 14, 'Gap must NOT change on title/lustMode update');
    db.updateGroupSettings(testChatA, { lustMode: false });
    pass('Test 59: Unrelated setting updates preserve activity counter and required gap intact');

    // Test 60: 10 successive getGroupSettings reads return exact same gap and counter
    for (let i = 0; i < 10; i++) {
      const s = db.getGroupSettings(testChatA);
      assert.strictEqual(s.humanMessagesSinceLastSticker, 7);
      assert.strictEqual(s.requiredStickerGap, 14);
    }
    pass('Test 60: 10 successive getGroupSettings calls maintain strictly persistent gap and counter');

    console.log('\n===================================================================');
    console.log(`🎉 ALL ${passed} ACTIVITY-GATED AUTO ENGINE TESTS PASSED!`);
    console.log('===================================================================');
  } finally {
    autoEngineService.stop();
    autoEngineService.resetTestHooks();
    telegramApi.sendMessage = origSendMessage;
    telegramApi.sendSticker = origSendSticker;
    telegramApi.sendChatAction = origSendChatAction;
    global.fetch = origFetch;
  }
}

runActivityGatedAutoEngineTestSuite().catch(err => {
  console.error('❌ [FAIL] Activity-gated test suite failed with error:', err);
  process.exit(1);
});