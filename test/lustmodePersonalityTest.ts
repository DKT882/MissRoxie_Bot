import { ChatbotService } from '../server/telegram/chatbot.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { TelegramMessage } from '../server/telegram/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runLustmodePersonalityTestSuite() {
  console.log('====================================================');
  console.log('🧪 Starting Roxie /lustmode Personality 18-Point Test Suite');
  console.log('====================================================\n');

  const chatId = -100555666777;
  const userId = 888999;
  const botUser = { id: 123456789, is_bot: true, first_name: 'MissRoxie', username: 'MissRoxie_Bot' };

  // Setup environment & mocks
  process.env.OPENROUTER_API_KEY = 'test_key_lustmode';
  process.env.OPENROUTER_MODEL = 'test/model';

  let capturedRequestBody: any = null;
  let simulatedAiResponseText = 'Haan, bilkul sahi baat hai!';

  const originalFetch = global.fetch;
  global.fetch = (async (url: string, init?: any) => {
    if (init && init.body) {
      try {
        capturedRequestBody = JSON.parse(init.body);
      } catch (e) {}
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: simulatedAiResponseText
            }
          }
        ]
      })
    } as any;
  }) as any;

  (telegramApi as any).sendChatAction = async () => ({ ok: true });
  (telegramApi as any).sendMessage = async () => ({ ok: true, result: { message_id: 999 } });

  const makeMsg = (text: string, msgId = 100): TelegramMessage => ({
    message_id: msgId,
    date: Math.floor(Date.now() / 1000),
    chat: { id: chatId, type: 'supergroup', title: 'Test Group' },
    from: { id: userId, is_bot: false, first_name: 'TestUser', username: 'testuser' },
    text
  });

  // ----------------------------------------------------
  // TEST 1: /lustmode ON changes personality
  // ----------------------------------------------------
  console.log('--- TEST 1: /lustmode ON changes personality ---');
  ChatbotService.reset();
  db.updateGroupSettings(chatId, { lustMode: true });

  simulatedAiResponseText = 'Aww, itna notice karte ho mujhe? 👀';
  capturedRequestBody = null;

  const decisionLustOn = await ChatbotService.generateResponseDecision('req_1', makeMsg('Roxie you are cute', 101), botUser);
  assert(decisionLustOn !== null, 'TEST 1.1: Decision returned with lustmode ON');
  assert(decisionLustOn?.personality === 'LustMode-Couple', 'TEST 1.2: Personality label reflects LustMode-Couple');

  const systemPromptLustOn = capturedRequestBody?.messages?.find((m: any) => m.role === 'system')?.content || '';
  assert(systemPromptLustOn.includes('LUSTMODE / COUPLE PERSONALITY MODIFIER ACTIVE'), 'TEST 1.3: System prompt includes LUSTMODE active modifier');
  assert(systemPromptLustOn.includes('flirty adult couple vibe'), 'TEST 1.4: System prompt specifies flirty adult couple vibe');

  // ----------------------------------------------------
  // TEST 2: /lustmode OFF restores normal personality
  // ----------------------------------------------------
  console.log('\n--- TEST 2: /lustmode OFF restores normal personality ---');
  ChatbotService.reset();
  db.updateGroupSettings(chatId, { lustMode: false });

  simulatedAiResponseText = 'Shukriya, main ek conversational observer hoon.';
  capturedRequestBody = null;

  const decisionLustOff = await ChatbotService.generateResponseDecision('req_2', makeMsg('Roxie you are cute', 102), botUser);
  assert(decisionLustOff !== null, 'TEST 2.1: Decision returned with lustmode OFF');
  assert(decisionLustOff?.personality === 'Psychologist-style', 'TEST 2.2: Personality label restored to Psychologist-style');

  const systemPromptLustOff = capturedRequestBody?.messages?.find((m: any) => m.role === 'system')?.content || '';
  assert(!systemPromptLustOff.includes('LUSTMODE / COUPLE PERSONALITY MODIFIER ACTIVE'), 'TEST 2.3: System prompt does NOT include LUSTMODE modifier when OFF');

  // Re-enable lustMode for subsequent tests
  db.updateGroupSettings(chatId, { lustMode: true });

  // ----------------------------------------------------
  // TEST 3: "bhai" is not spontaneously used
  // ----------------------------------------------------
  console.log('\n--- TEST 3: "bhai" is not spontaneously used ---');
  const sanitizedBhai1 = ChatbotService.sanitizeLustModeText('Haan bhai, Node.js basically JavaScript server runtime hai.', 'what is node.js');
  assert(!/\bbhai\b/i.test(sanitizedBhai1), 'TEST 3.1: "bhai" stripped when not in user text');
  assert(sanitizedBhai1.includes('Node.js basically JavaScript server runtime hai.'), 'TEST 3.2: Content preserved when "bhai" removed');

  const sanitizedBhai2 = ChatbotService.sanitizeLustModeText('Bhai kisko bol rahe ho? 😂', 'kya hal hai bhai');
  assert(/\bbhai\b/i.test(sanitizedBhai2), 'TEST 3.3: "bhai" preserved when user explicitly used it in context');

  // ----------------------------------------------------
  // TEST 4: "bro" is not spontaneously used
  // ----------------------------------------------------
  console.log('\n--- TEST 4: "bro" is not spontaneously used ---');
  const sanitizedBro1 = ChatbotService.sanitizeLustModeText('Arre bro, suno na ek baat.', 'tell me something');
  assert(!/\bbro\b/i.test(sanitizedBro1), 'TEST 4.1: "bro" stripped when not in user text');

  const sanitizedOtherForbidden = ChatbotService.sanitizeLustModeText('Haan dost, suniye bhaiya, theek hai dude, yes sir.', 'hello');
  assert(!/\b(dost|bhaiya|dude|sir)\b/i.test(sanitizedOtherForbidden), 'TEST 4.2: Other forbidden terms (dost, bhaiya, dude, sir) stripped');

  // ----------------------------------------------------
  // TEST 5: Affectionate vocabulary works naturally
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Affectionate vocabulary works naturally ---');
  const affectionateText = 'Hmm... aaj bade sweet ban rahe ho, jaan.';
  const sanitizedAffectionate = ChatbotService.sanitizeLustModeText(affectionateText, 'hey cutie');
  assert(sanitizedAffectionate.includes('jaan'), 'TEST 5.1: Natural affectionate term "jaan" is preserved');
  assert(systemPromptLustOn.includes('"baby"'), 'TEST 5.2: System prompt permits natural affectionate terms');
  assert(systemPromptLustOn.includes('"sweetheart"'), 'TEST 5.3: System prompt permits "sweetheart" and other couple terms');

  // ----------------------------------------------------
  // TEST 6: Pet names are not repeated every response
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Pet names are not repeated every response ---');
  assert(systemPromptLustOn.includes('DO NOT use an affectionate nickname in every single message'), 'TEST 6.1: System prompt forbids using nicknames on every response');
  assert(systemPromptLustOn.includes('AVOID REPETITIVE PATTERNS'), 'TEST 6.2: System prompt explicitly warns against repetitive clichés like "baby 😏" or "jaan 😏"');

  // ----------------------------------------------------
  // TEST 7: Neutral questions remain on-topic
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Neutral questions remain on-topic ---');
  assert(systemPromptLustOn.includes('Neutral / Technical Questions'), 'TEST 7.1: System prompt has explicit section for neutral/technical questions');
  assert(systemPromptLustOn.includes('ALWAYS answer the question accurately, directly, and on-topic!'), 'TEST 7.2: Strict instruction to answer technical questions accurately');
  assert(systemPromptLustOn.includes('Node.js basically JavaScript ko server-side run karne deta hai, baby'), 'TEST 7.3: Provides Node.js on-topic example');

  // ----------------------------------------------------
  // TEST 8: Angry mood works
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Angry mood works ---');
  const angryMood = ChatbotService.inferMood('mujhe gussa aa raha hai 😡');
  assert(angryMood === 'angry', 'TEST 8.1: "mujhe gussa aa raha hai 😡" infers "angry" mood');
  assert(systemPromptLustOn.includes('Angry / Upset ("mujhe gussa aa raha hai"): Caring, calm, reassuring; never mock them or force shallow romance.'), 'TEST 8.2: Lustmode instructs calm/caring response without forced flirting for angry mood');

  // ----------------------------------------------------
  // TEST 9: Sad / caring mood works
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Sad / caring mood works ---');
  const sadMood = ChatbotService.inferMood('mera mood kharab hai');
  assert(sadMood === 'sad/comforting', 'TEST 9.1: "mera mood kharab hai" infers "sad/comforting" mood');
  assert(systemPromptLustOn.includes('Sad / Distressed / Vulnerable ("mera mood kharab hai"): Caring, gentle, emotionally supportive and affectionate'), 'TEST 9.2: Lustmode instructs caring, supportive warmth when user is sad');

  // ----------------------------------------------------
  // TEST 10: Happy mood works
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Happy mood works ---');
  const happyMood1 = ChatbotService.inferMood('aaj bahut khush hoon');
  assert(happyMood1 === 'happy', 'TEST 10.1: "aaj bahut khush hoon" infers "happy" mood');
  const happyMood2 = ChatbotService.inferMood('so happy today! great day');
  assert(happyMood2 === 'happy', 'TEST 10.2: "so happy today!" infers "happy" mood');
  assert(systemPromptLustOn.includes('Happy / Celebratory ("aaj bahut khush hoon"): Joyful, upbeat, playful affection.'), 'TEST 10.3: Lustmode instructions handle happy mood with joyful affection');

  // ----------------------------------------------------
  // TEST 11: Romantic mood works
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Romantic mood works ---');
  const romanticMood1 = ChatbotService.inferMood('miss you');
  assert(romanticMood1 === 'romantic', 'TEST 11.1: "miss you" infers "romantic" mood');
  const romanticMood2 = ChatbotService.inferMood('i love you meri jaan ❤️');
  assert(romanticMood2 === 'romantic', 'TEST 11.2: "i love you meri jaan ❤️" infers "romantic" mood');
  assert(systemPromptLustOn.includes('Romantic / Closeness ("miss you", "love you"): Warm, heartfelt, sweet, genuinely affectionate'), 'TEST 11.3: Lustmode instructions guide romantic responses gracefully');

  // ----------------------------------------------------
  // TEST 12: Teasing mood works
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Teasing mood works ---');
  const teasingMood = ChatbotService.inferMood('tum pagal ho 😂');
  assert(teasingMood === 'teasing', 'TEST 12.1: "tum pagal ho 😂" infers "teasing" mood');
  assert(systemPromptLustOn.includes('Playful / Banter / Teasing ("tum pagal ho 😂"): Tease back playfully and cheekily.'), 'TEST 12.2: Lustmode instructions handle teasing banter playfully');

  // ----------------------------------------------------
  // TEST 13: Conversation context persists
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Conversation context persists ---');
  ChatbotService.reset();
  const conv = ChatbotService.getOrCreateConversation(chatId, userId);
  conv.messages.push({ role: 'user', content: 'Mera favourite dessert cheesecake hai', timestamp: Date.now() });
  conv.messages.push({ role: 'assistant', content: 'Oh really? Blueberry ya New York style?', timestamp: Date.now() });

  capturedRequestBody = null;
  simulatedAiResponseText = 'New York cheesecake toh best hota hai!';
  await ChatbotService.generateResponseDecision('req_13', makeMsg('Roxie New York style wala', 103), botUser);

  const sentTranscript = capturedRequestBody?.messages?.find((m: any) => m.role === 'user')?.content || '';
  assert(sentTranscript.includes('Mera favourite dessert cheesecake hai'), 'TEST 13.1: Transcript contains earlier context message');
  assert(sentTranscript.includes('Blueberry ya New York style?'), 'TEST 13.2: Transcript contains assistant context reply');
  assert(sentTranscript.includes('New York style wala'), 'TEST 13.3: Latest user message is prominently included');

  // ----------------------------------------------------
  // TEST 14: User memory remains available
  // ----------------------------------------------------
  console.log('\n--- TEST 14: User memory remains available ---');
  db.addUserMemoryFact(chatId, userId, 'Prefers coffee without sugar');
  capturedRequestBody = null;
  simulatedAiResponseText = 'Tumhari coffee bina sugar ke yaad hai mujhe 😉';
  await ChatbotService.generateResponseDecision('req_14', makeMsg('Roxie coffee peete hain', 104), botUser);

  const sysWithMem = capturedRequestBody?.messages?.find((m: any) => m.role === 'system')?.content || '';
  assert(sysWithMem.includes('Prefers coffee without sugar'), 'TEST 14.1: Stored user memory fact is present in system prompt during lustmode');

  // ----------------------------------------------------
  // TEST 15: No random topic jumping
  // ----------------------------------------------------
  console.log('\n--- TEST 15: No random topic jumping ---');
  assert(systemPromptLustOn.includes('NO TOPIC JUMPING (STRICT)'), 'TEST 15.1: System prompt has strict NO TOPIC JUMPING section');
  assert(systemPromptLustOn.includes('The latest user message ALWAYS has absolute priority'), 'TEST 15.2: Mandates latest user message priority');
  assert(systemPromptLustOn.includes('NEVER generate an unrelated romantic or flirty sentence merely because lustmode is enabled'), 'TEST 15.3: Explicitly forbids inventing unrelated romantic topics');

  // ----------------------------------------------------
  // TEST 16: No explicit sexual content generation
  // ----------------------------------------------------
  console.log('\n--- TEST 16: No explicit sexual content generation ---');
  assert(systemPromptLustOn.includes('ADULT CONTENT & BOUNDARY (STRICT)'), 'TEST 16.1: System prompt enforces adult content boundary');
  assert(systemPromptLustOn.includes('STRICTLY FORBIDDEN: Do NOT generate explicit sexual descriptions, graphic sexual anatomy, pornographic acts, or explicit sexual roleplay.'), 'TEST 16.2: Explicit sexual descriptions and roleplay strictly forbidden');

  const sanitizedExplicit = ChatbotService.sanitizeLustModeText('Here is something explicit: penis and vagina should be masked.', 'tell me');
  assert(!sanitizedExplicit.includes('penis'), 'TEST 16.3: Graphic sexual terms sanitized by post-processor');
  assert(!sanitizedExplicit.includes('vagina'), 'TEST 16.4: Graphic sexual terms replaced with ***');

  // ----------------------------------------------------
  // TEST 17: Command messages never enter chatbot processing
  // ----------------------------------------------------
  console.log('\n--- TEST 17: Command messages never enter chatbot processing ---');
  const commandMsg1: Partial<TelegramMessage> = {
    message_id: 105,
    chat: { id: chatId, type: 'supergroup' },
    from: { id: userId, is_bot: false, first_name: 'TestUser' },
    text: '/lustmode on'
  };
  const commandHandled = await ChatbotService.handleMessage(commandMsg1 as TelegramMessage, botUser);
  assert(commandHandled === false, 'TEST 17.1: /lustmode command message returns false from ChatbotService (never processed by AI)');

  const helpCommandMsg: Partial<TelegramMessage> = {
    message_id: 106,
    chat: { id: chatId, type: 'supergroup' },
    from: { id: userId, is_bot: false, first_name: 'TestUser' },
    text: '/help'
  };
  const helpHandled = await ChatbotService.handleMessage(helpCommandMsg as TelegramMessage, botUser);
  assert(helpHandled === false, 'TEST 17.2: /help command message rejected by ChatbotService');

  // ----------------------------------------------------
  // TEST 18: Duplicate-response protection remains intact
  // ----------------------------------------------------
  console.log('\n--- TEST 18: Duplicate-response protection remains intact ---');
  const normalChatMsg: Partial<TelegramMessage> = {
    message_id: 107,
    chat: { id: chatId, type: 'supergroup' },
    from: { id: userId, is_bot: false, first_name: 'TestUser' },
    text: 'Roxie, tell me a quick joke'
  };

  const firstDispatch = await ChatbotService.handleMessage(normalChatMsg as TelegramMessage, botUser);
  assert(firstDispatch === true, 'TEST 18.1: First dispatch of message_id 107 succeeded');

  const duplicateDispatch = await ChatbotService.handleMessage(normalChatMsg as TelegramMessage, botUser);
  assert(duplicateDispatch === false, 'TEST 18.2: Duplicate message_id 107 blocked by atomic deduplication gate');

  // Restore fetch
  global.fetch = originalFetch;

  console.log('\n====================================================');
  console.log(`🎉 ALL 18 /LUSTMODE TESTS PASSED SUCCESSFULLY! (${passed} checks passed, ${failed} failed)`);
  console.log('====================================================\n');
  process.exit(0);
}

runLustmodePersonalityTestSuite().catch(err => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});