import { ContentProtectionService } from '../server/telegram/contentProtection.js';
import { db } from '../server/db/storage.js';
import { ContentPolicyEngine } from '../server/telegram/policyEngine.js';

export async function runPhase9ATests() {
  console.log('🧪 Starting Roxie Bot Phase 9A Smart Content Protection & Message Control Test Suite...');

  const chatId = -100999888777;
  const chatTitle = 'Phase 9A Test Group';
  const normalUserId = 99999; // Non-admin user so admin bypass doesn't trigger

  // 1. Test Custom Abusive Words Management
  db.clearCustomAbusiveWords(chatId);
  db.addCustomAbusiveWord(chatId, 'badword123');
  db.addCustomAbusiveWord(chatId, 'toxicphrase foo');

  const words = db.getCustomAbusiveWords(chatId);
  if (!words.includes('badword123') || !words.includes('toxicphrase foo')) {
    throw new Error('Phase 9A Test Failed: Custom abusive words persistence failed');
  }
  console.log('✅ [PASS] Phase 9A-01: Custom abusive words storage & retrieval');

  // 2. Test Abusive Detection
  const abusiveDetected = ContentProtectionService.isAbusive('this message contains badword123 inside', chatId);
  if (!abusiveDetected) {
    throw new Error('Phase 9A Test Failed: Abusive word detection failed');
  }
  console.log('✅ [PASS] Phase 9A-02: Abusive word detection');

  // 3. Test Remove Abusive Word
  db.removeCustomAbusiveWord(chatId, 'badword123');
  const wordsAfterRemove = db.getCustomAbusiveWords(chatId);
  if (wordsAfterRemove.includes('badword123')) {
    throw new Error('Phase 9A Test Failed: Removing custom abusive word failed');
  }
  console.log('✅ [PASS] Phase 9A-03: Custom abusive word removal');

  // 4. Test Promotion Detection
  const promoMessage = {
    message_id: 1,
    chat: { id: chatId, title: chatTitle, type: 'supergroup' as const },
    from: { id: normalUserId, is_bot: false, first_name: 'RegularUser' },
    date: Date.now() / 1000,
    text: 'Join my channel t.me/cryptosignalsvip for guaranteed 100x gains!'
  };

  db.updateGroupSettings(chatId, { stopPromotionEnabled: true });
  const isPromo = ContentProtectionService.isPromotion(promoMessage, chatId);
  if (!isPromo) {
    throw new Error('Phase 9A Test Failed: Promotion/ad detection failed');
  }
  console.log('✅ [PASS] Phase 9A-04: Promotion & ad detection');

  // 5. Test Policy Engine Integration
  const evaluation = await ContentPolicyEngine.evaluateMessage(promoMessage, chatId, normalUserId);
  if (evaluation.decision !== 'BLOCK' || evaluation.lockType !== 'promotion') {
    throw new Error(`Phase 9A Test Failed: Policy engine did not block promotion message (decision=${evaluation.decision}, lockType=${evaluation.lockType})`);
  }
  console.log('✅ [PASS] Phase 9A-05: Policy engine integration with Phase 9A rules');

  // Cleanup
  db.clearCustomAbusiveWords(chatId);
  console.log('🎉 All Phase 9A Smart Content Protection tests passed successfully!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase9ATests().catch(err => {
    console.error('❌ Phase 9A Test Suite Failed:', err);
    process.exit(1);
  });
}
