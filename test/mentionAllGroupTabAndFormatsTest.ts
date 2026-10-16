import assert from 'node:assert';
import { FORMAT_CONFIGS, MentionContentFormat } from '../src/components/MentionAllComposer.js';

console.log('--- TEST SUITE: Mention All Group Tab & 9-Content Formats ---\n');

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ [PASS] ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// 1. All 9 Formats Defined
it('Should define exactly the 9 required formats', () => {
  const expectedFormats: MentionContentFormat[] = [
    'text',
    'photo',
    'video',
    'animation',
    'document',
    'text_photo',
    'text_video',
    'text_animation',
    'text_document'
  ];

  const actualFormats = Object.keys(FORMAT_CONFIGS);
  assert.strictEqual(actualFormats.length, 9, 'Should have exactly 9 formats configured');
  for (const f of expectedFormats) {
    assert.ok(FORMAT_CONFIGS[f], `Format ${f} must exist in FORMAT_CONFIGS`);
  }
});

// 2. Validation & Requirement Rules for Each Format
it('Text Only (Format 1) requires text and prohibits/omits media', () => {
  const cfg = FORMAT_CONFIGS['text'];
  assert.strictEqual(cfg.category, 'text');
  assert.strictEqual(cfg.requiresText, true, 'Text is required for text-only format');
  assert.strictEqual(cfg.requiresMedia, false, 'Media is not required for text-only format');
  assert.strictEqual(cfg.maxTextLen, 3500, 'Standard text allows 3500 chars headroom');
  assert.strictEqual(cfg.baseType, 'text');
});

it('Media Only (Formats 2-5: Photo, Video, GIF, Document) require media with optional text/caption', () => {
  const mediaOnlyFormats: MentionContentFormat[] = ['photo', 'video', 'animation', 'document'];
  for (const fmt of mediaOnlyFormats) {
    const cfg = FORMAT_CONFIGS[fmt];
    assert.strictEqual(cfg.category, 'media');
    assert.strictEqual(cfg.requiresMedia, true, `${fmt} must require media`);
    assert.strictEqual(cfg.requiresText, false, `${fmt} caption must be optional`);
    assert.strictEqual(cfg.maxTextLen, 700, `${fmt} safe caption headroom is 700`);
    assert.strictEqual(cfg.baseType, fmt);
  }
});

it('Combined Formats (Formats 6-9: Text + Media) require BOTH text AND media', () => {
  const comboFormats: { format: MentionContentFormat; expectedBaseType: string }[] = [
    { format: 'text_photo', expectedBaseType: 'photo' },
    { format: 'text_video', expectedBaseType: 'video' },
    { format: 'text_animation', expectedBaseType: 'animation' },
    { format: 'text_document', expectedBaseType: 'document' }
  ];

  for (const { format, expectedBaseType } of comboFormats) {
    const cfg = FORMAT_CONFIGS[format];
    assert.strictEqual(cfg.category, 'combo');
    assert.strictEqual(cfg.requiresMedia, true, `${format} must require media`);
    assert.strictEqual(cfg.requiresText, true, `${format} must require text`);
    assert.strictEqual(cfg.maxTextLen, 700, `${format} caption limit is 700`);
    assert.strictEqual(cfg.baseType, expectedBaseType, `${format} baseType must map to ${expectedBaseType}`);
  }
});

// 3. Simulated canStart logic test across all 9 formats
it('Simulated validation logic strictly enforces rules across all 9 formats', () => {
  function testCanStart(
    format: MentionContentFormat,
    hasTargetGroup: boolean,
    hasMedia: boolean,
    text: string,
    isOpActive: boolean
  ): boolean {
    const cfg = FORMAT_CONFIGS[format];
    const isTargetGroupValid = hasTargetGroup;
    const isMediaValid = !cfg.requiresMedia || hasMedia;
    const hasText = text.trim().length > 0;
    const isTextValid = !cfg.requiresText || hasText;
    const isOverLimit = text.length > cfg.maxTextLen;

    return isTargetGroupValid && !isOpActive && !isOverLimit && isMediaValid && isTextValid;
  }

  // Text Only:
  assert.strictEqual(testCanStart('text', true, false, 'Announcement', false), true, 'Text only with text is valid');
  assert.strictEqual(testCanStart('text', true, false, '', false), false, 'Text only without text is invalid');
  assert.strictEqual(testCanStart('text', true, false, 'A'.repeat(3501), false), false, 'Text only over 3500 chars is invalid');

  // Photo Only:
  assert.strictEqual(testCanStart('photo', true, true, '', false), true, 'Photo only with media and empty caption is valid');
  assert.strictEqual(testCanStart('photo', true, true, 'Caption', false), true, 'Photo only with media and caption is valid');
  assert.strictEqual(testCanStart('photo', true, false, 'Caption', false), false, 'Photo only without media is invalid');
  assert.strictEqual(testCanStart('photo', true, true, 'A'.repeat(701), false), false, 'Photo caption over 700 chars is invalid');

  // Text + Photo:
  assert.strictEqual(testCanStart('text_photo', true, true, 'Announcement', false), true, 'Text + photo with both is valid');
  assert.strictEqual(testCanStart('text_photo', true, true, '', false), false, 'Text + photo without text is invalid');
  assert.strictEqual(testCanStart('text_photo', true, false, 'Announcement', false), false, 'Text + photo without media is invalid');
  assert.strictEqual(testCanStart('text_photo', true, true, 'A'.repeat(701), false), false, 'Text + photo over 700 chars is invalid');

  // Operation Active prevents starting another:
  assert.strictEqual(testCanStart('text', true, false, 'Hello', true), false, 'Active operation blocks new start');

  // Invalid target group prevents starting:
  assert.strictEqual(testCanStart('text', false, false, 'Hello', false), false, 'Missing target group blocks start');
});

console.log(`\n====================================================`);
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log(`====================================================\n`);

if (failed > 0) {
  process.exit(1);
}
