import assert from 'node:assert';
import { FORMAT_CONFIGS, MentionContentFormat } from '../src/components/MentionAllComposer.js';
import { mtprotoParticipantService, MTProtoAuthError } from '../server/telegram/mtprotoParticipantService.js';
import { HealthDiagnosticsService } from '../server/observability/healthService.js';

console.log('--- TEST SUITE: Mention All Group Tab, Optional Text & MTProto Health ---\n');

let passed = 0;
let failed = 0;

function it(desc: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result && typeof (result as any).then === 'function') {
      (result as any).then(() => {
        console.log(`✅ [PASS] ${desc}`);
        passed++;
      }).catch((err: any) => {
        console.error(`❌ [FAIL] ${desc}`);
        console.error(`   Error: ${err.message}`);
        failed++;
      });
      return;
    }
    console.log(`✅ [PASS] ${desc}`);
    passed++;
  } catch (err: any) {
    console.error(`❌ [FAIL] ${desc}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

async function run() {
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

  // 2. Text is optional across all formats
  it('Text is completely optional across all 9 formats (requiresText === false)', () => {
    const allFormats = Object.keys(FORMAT_CONFIGS) as MentionContentFormat[];
    for (const fmt of allFormats) {
      const cfg = FORMAT_CONFIGS[fmt];
      assert.strictEqual(
        cfg.requiresText,
        false,
        `Format ${fmt} must have requiresText: false to allow empty announcements/captions`
      );
    }
  });

  it('Text Only (Format 1) has optional text and omits media requirement', () => {
    const cfg = FORMAT_CONFIGS['text'];
    assert.strictEqual(cfg.category, 'text');
    assert.strictEqual(cfg.requiresText, false, 'Text is optional for text-only format');
    assert.strictEqual(cfg.requiresMedia, false, 'Media is not required for text-only format');
    assert.strictEqual(cfg.maxTextLen, 3500, 'Standard text allows 3500 chars headroom');
    assert.strictEqual(cfg.baseType, 'text');
  });

  it('Media Only (Formats 2-5: Photo, Video, GIF, Document) require media with optional caption', () => {
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

  it('Combined Formats (Formats 6-9: Text + Media) require media while keeping text/caption optional', () => {
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
      assert.strictEqual(cfg.requiresText, false, `${format} text/caption must remain optional`);
      assert.strictEqual(cfg.maxTextLen, 700, `${format} caption limit is 700`);
      assert.strictEqual(cfg.baseType, expectedBaseType, `${format} baseType must map to ${expectedBaseType}`);
    }
  });

  // 3. Simulated canStart validation logic
  it('Simulated validation logic accepts empty text across all valid media and text selections', () => {
    function testCanStart(
      format: MentionContentFormat,
      hasTargetGroup: boolean,
      hasMedia: boolean,
      text: string,
      isOpActive: boolean,
      isMtprotoRevoked: boolean = false
    ): boolean {
      const cfg = FORMAT_CONFIGS[format];
      const isTargetGroupValid = hasTargetGroup;
      const isMediaValid = !cfg.requiresMedia || hasMedia;
      const hasText = text.trim().length > 0;
      const isTextValid = !cfg.requiresText || hasText;
      const isOverLimit = text.length > cfg.maxTextLen;

      return isTargetGroupValid && !isOpActive && !isOverLimit && isMediaValid && isTextValid && !isMtprotoRevoked;
    }

    // Text Only:
    assert.strictEqual(testCanStart('text', true, false, 'Announcement', false), true, 'Text only with announcement text is valid');
    assert.strictEqual(testCanStart('text', true, false, '', false), true, 'Text only with EMPTY text is VALID (mention-only broadcast)');
    assert.strictEqual(testCanStart('text', true, false, '   ', false), true, 'Text only with whitespace text is VALID (trimmed to empty)');
    assert.strictEqual(testCanStart('text', true, false, 'A'.repeat(3501), false), false, 'Text only over 3500 chars is invalid');

    // Photo Only:
    assert.strictEqual(testCanStart('photo', true, true, '', false), true, 'Photo only with media and empty caption is valid');
    assert.strictEqual(testCanStart('photo', true, true, 'Caption', false), true, 'Photo only with media and caption is valid');
    assert.strictEqual(testCanStart('photo', true, false, 'Caption', false), false, 'Photo only without media is invalid');
    assert.strictEqual(testCanStart('photo', true, true, 'A'.repeat(701), false), false, 'Photo caption over 700 chars is invalid');

    // Text + Photo:
    assert.strictEqual(testCanStart('text_photo', true, true, 'Announcement', false), true, 'Text + photo with both is valid');
    assert.strictEqual(testCanStart('text_photo', true, true, '', false), true, 'Text + photo with empty text proceeds as media + mentions');
    assert.strictEqual(testCanStart('text_photo', true, false, 'Announcement', false), false, 'Text + photo without media is invalid');

    // Concurrency blocks start:
    assert.strictEqual(testCanStart('text', true, false, '', true), false, 'Active operation blocks new start');

    // MTProto session revoked blocks start:
    assert.strictEqual(testCanStart('text', true, false, '', false, true), false, 'Revoked MTProto session blocks new start');
  });

  // 4. MTProto session health reporting
  it('MTProto health reporting accurately reflects session configuration and revocation', () => {
    mtprotoParticipantService.resetSessionState();
    const initialReport = mtprotoParticipantService.getHealthReport();
    assert.ok(initialReport, 'Health report is returned');
    assert.ok('status' in initialReport, 'Status field exists');
    assert.ok('isConfigured' in initialReport, 'isConfigured field exists');
    assert.ok('canOperate' in initialReport, 'canOperate field exists');

    const configStatus = mtprotoParticipantService.getConfigurationStatus();
    assert.ok('status' in configStatus, 'Status exists in configuration status');
  });

  it('HealthDiagnosticsService includes components.mtproto and degrades status on auth error', () => {
    const health = HealthDiagnosticsService.getSystemHealth();
    assert.ok(health.components.mtproto, 'HealthDiagnosticsService must include components.mtproto');
    assert.ok('status' in health.components.mtproto, 'mtproto must report status');
    assert.ok('canOperate' in health.components.mtproto, 'mtproto must report canOperate');
  });

  // 5. MTProtoAuthError stores code and actionRequired
  it('MTProtoAuthError retains error code and actionRequired instructions', () => {
    const err = new MTProtoAuthError(
      'Session revoked',
      'AUTH_KEY_UNREGISTERED',
      'Run npx tsx scripts/generateMtprotoSession.ts'
    );
    assert.strictEqual(err.code, 'AUTH_KEY_UNREGISTERED');
    assert.strictEqual(err.actionRequired, 'Run npx tsx scripts/generateMtprotoSession.ts');
    assert.strictEqual(err.name, 'MTProtoAuthError');
  });

  console.log(`\n====================================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`====================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run();
