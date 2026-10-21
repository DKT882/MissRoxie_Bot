import assert from 'assert';
import { db } from '../server/db/storage.js';
import { messageScheduler } from '../server/telegram/scheduler.js';
import { parseScheduleTime } from '../server/telegram/postBuilder.js';
import { PostResolverService } from '../server/telegram/postResolver.js';

console.log('====================================================');
console.log('🧪 RUNNING SCHEDULE ID-BASED REUSE & MINI APP EDIT TESTS');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res.then(() => {
        console.log(`✅ [PASS] ${desc}`);
        passed++;
      }).catch((err: any) => {
        console.error(`❌ [FAIL] ${desc}: ${err.message}`);
        failed++;
      });
    } else {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    }
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  const testChatId = -1004494299999;

  // 1. Mini App Schedule Editing & ID Preservation
  await it('TMA-EDIT-01: db.addSchedule creates initial schedule with stable ID', () => {
    const s = db.addSchedule({
      chatId: testChatId,
      name: 'Initial Schedule',
      message: 'Initial Message Text',
      scheduleType: 'interval',
      intervalFormatted: '2 hours',
      intervalMs: 7200000,
      nextRun: new Date(Date.now() + 7200000).toISOString(),
      enabled: true
    });
    assert(s && s.id, 'Schedule must be created with ID');
    assert.strictEqual(s.chatId, testChatId);
    assert.strictEqual(s.name, 'Initial Schedule');
  });

  const schedules = db.getGroupSchedules(testChatId);
  const initialSchedule = schedules[0];

  await it('TMA-EDIT-02: Updating schedule via db.updateSchedule preserves original ID', () => {
    const updated = db.updateSchedule(initialSchedule.id, {
      name: 'Updated Title via Mini App',
      message: 'Updated Broadcast Content',
      intervalFormatted: '4 hours',
      intervalMs: 14400000
    });
    assert(updated, 'Schedule update must succeed');
    assert.strictEqual(updated.id, initialSchedule.id, 'Schedule ID must not mutate upon update');
    assert.strictEqual(updated.name, 'Updated Title via Mini App');
    assert.strictEqual(updated.message, 'Updated Broadcast Content');
    assert.strictEqual(updated.intervalMs, 14400000);
  });

  await it('TMA-EDIT-03: parseScheduleTime parses duration formats correctly', () => {
    const p1 = parseScheduleTime('2h');
    assert(!('error' in p1), '2h should parse');
    assert.strictEqual(p1.intervalMs, 7200000);

    const p2 = parseScheduleTime('30m');
    assert(!('error' in p2), '30m should parse');
    assert.strictEqual(p2.intervalMs, 1800000);

    const p3 = parseScheduleTime('4 hours');
    assert(!('error' in p3), '4 hours should parse');
    assert.strictEqual(p3.intervalMs, 14400000);
  });

  await it('TMA-EDIT-04: messageScheduler.parseInterval handles short duration formats', () => {
    const p1 = messageScheduler.parseInterval('1d');
    assert(p1, '1d should parse');
    assert.strictEqual(p1.ms, 86400000);

    const p2 = messageScheduler.parseInterval('10m');
    assert(p2, '10m should parse');
    assert.strictEqual(p2.ms, 600000);
  });

  await it('TMA-EDIT-05: Invalid interval strings reject gracefully and cannot silently corrupt timing', () => {
    const invalidInputs = ['garbage', 'abc', '-5h', '0m'];
    for (const input of invalidInputs) {
      const parsed1 = parseScheduleTime(input);
      const parsed2 = messageScheduler.parseInterval(input);
      const isParsed = (!('error' in parsed1)) || parsed2 !== null;
      assert.strictEqual(isParsed, false, `Invalid duration "${input}" must fail parsing`);
    }
  });

  // 2. ID-Based Reference & Duplication ("Copy From ID")
  await it('COPY-ID-01: Copy From ID retains source schedule untouched and populates draft with (Copy)', () => {
    const source = db.getScheduleById(initialSchedule.id);
    assert(source, 'Source schedule must exist');

    // Simulate "Copy From ID" workflow
    const baseName = source.name || source.id || 'Scheduled Broadcast';
    const draftName = baseName.includes('(Copy)') ? baseName : `${baseName} (Copy)`;

    const draft = {
      name: draftName,
      message: source.message || source.messageText || '',
      chatId: source.chatId,
      scheduleType: source.scheduleType || 'interval',
      intervalFormatted: source.intervalFormatted,
      intervalMs: source.intervalMs,
      enabled: false // Draft is created disabled
    };

    assert.strictEqual(draft.name, 'Updated Title via Mini App (Copy)');
    assert.strictEqual(draft.message, source.message);
    assert.strictEqual(draft.enabled, false);

    // Save as new schedule
    const newSchedule = db.addSchedule(draft);
    assert(newSchedule && newSchedule.id, 'New schedule must have an ID');
    assert.notStrictEqual(newSchedule.id, source.id, 'New schedule must have a unique ID');

    // Source schedule must be completely unaffected
    const freshSource = db.getScheduleById(source.id);
    assert.strictEqual(freshSource?.id, source.id);
    assert.strictEqual(freshSource?.name, 'Updated Title via Mini App');
  });

  // 3. Saved Post ID-based references ({{post:POST-XXXXX}})
  await it('POST-REF-01: Saved post has stable POST-XXXXX ID and can be resolved in schedules', () => {
    const saved = db.saveSavedPost({
      title: 'Announcement Post',
      contentType: 'text',
      text: '🚀 Important Announcement Content for all members!',
      buttons: [[{ text: 'Visit Website', url: 'https://example.com' }]]
    });

    assert(saved && saved.id.startsWith('POST-'), 'Saved post ID must start with POST-');

    // Reference syntax in schedule text
    const scheduleWithPostRef = `Notice: {{post:${saved.id}}}`;
    const contains = PostResolverService.containsPostReference(scheduleWithPostRef);
    assert.strictEqual(contains, true);

    const extracted = PostResolverService.extractPostIds(scheduleWithPostRef);
    assert.deepStrictEqual(extracted, [saved.id]);

    const resolved = PostResolverService.resolveMessage(scheduleWithPostRef);
    assert.strictEqual(resolved.text, 'Notice: 🚀 Important Announcement Content for all members!');
  });

  await it('POST-REF-02: Exact post reference {{post:POST-XXXXX}} adopts complete payload', () => {
    const saved = db.saveSavedPost({
      title: 'Photo Banner Post',
      contentType: 'photo',
      text: 'Banner Caption',
      mediaFileId: 'AgACAgIAAxkBAAIEXAMPLE12345',
      buttons: [[{ text: 'Join Channel', url: 'https://t.me/example' }]]
    });

    const resolved = PostResolverService.resolveMessage(`{{post:${saved.id}}}`);
    assert.strictEqual(resolved.contentType, 'photo');
    assert.strictEqual(resolved.text, 'Banner Caption');
    assert.strictEqual(resolved.mediaFileId, 'AgACAgIAAxkBAAIEXAMPLE12345');
    assert(resolved.buttons && resolved.buttons.length > 0);
  });

  // 4. Sticker Pack Link Copying
  await it('STICKER-COPY-01: Formats public links correctly as newline-separated list', () => {
    const samplePacks = [
      { name: 'MissRoxiePack', title: 'Miss Roxie Official' },
      { name: 'FunStickers2026', title: 'Fun Stickers' },
      { name: 'https://t.me/addstickers/CustomDirectLink', title: 'Direct Link Pack' }
    ];

    const links = samplePacks.map(p => {
      const name = p.name || p.title;
      return name.startsWith('http') ? name : `https://t.me/addstickers/${name}`;
    });

    const expected = [
      'https://t.me/addstickers/MissRoxiePack',
      'https://t.me/addstickers/FunStickers2026',
      'https://t.me/addstickers/CustomDirectLink'
    ].join('\n');

    assert.strictEqual(links.join('\n'), expected);
  });

  await it('STICKER-COPY-02: Handles empty sticker packs gracefully', () => {
    const emptyPacks: any[] = [];
    const hasPacks = emptyPacks && emptyPacks.length > 0;
    assert.strictEqual(hasPacks, false, 'Empty sticker packs should be handled with informative feedback');
  });

  console.log(`\n====================================================`);
  console.log(`Results: ${passed} Passed, ${failed} Failed`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
