import crypto from 'crypto';
import express from 'express';
import {
  validateTelegramInitData,
  createTmaSessionToken,
  verifyTmaSessionToken,
  getTmaSecret,
  resolveGroupRole,
  isFeatureAllowedForRole,
  getAllowedFeaturesForRole,
  MINI_APP_PERMISSIONS,
  MiniAppFeature,
  MiniAppRole
} from '../server/tma/tmaAuth.js';
import { tmaRouter } from '../server/tma/tmaRouter.js';
import { db } from '../server/db/storage.js';
import { telegramApi } from '../server/telegram/api.js';
import { authManager } from '../server/auth/authManager.js';
import { verifyOperatorAuth } from '../server.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
    throw new Error(`Test failed: ${testName}`);
  }
}

// Helper to construct real signed Telegram initData query strings
function generateTelegramInitData(user: any, botToken: string, customAuthDate?: number, omitHash: boolean = false): string {
  const authDate = customAuthDate !== undefined ? customAuthDate : Math.floor(Date.now() / 1000);
  const userJson = JSON.stringify(user);

  const params: Record<string, string> = {
    auth_date: String(authDate),
    query_id: 'AAHdF6IQAAAAAN0XohD9pLp4',
    user: userJson
  };

  const pairs: string[] = [];
  for (const key of Object.keys(params).sort()) {
    pairs.push(`${key}=${params[key]}`);
  }
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const searchParams = new URLSearchParams();
  searchParams.set('query_id', params.query_id);
  searchParams.set('user', userJson);
  searchParams.set('auth_date', String(authDate));
  if (!omitHash) {
    searchParams.set('hash', hash);
  }

  return searchParams.toString();
}

async function runTmaTestSuite() {
  console.log('====================================================');
  console.log('🛡️ RUNNING TELEGRAM MINI APP COMPREHENSIVE TEST SUITE');
  console.log('====================================================\n');

  const TEST_BOT_TOKEN = '1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789';
  process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
  process.env.DASHBOARD_SESSION_SECRET = 'test-dashboard-session-secret-for-roxie';
  process.env.DASHBOARD_ADMIN_PASSWORD = 'supersecretadminpass';

  // ----------------------------------------------------
  // SECTION 1: Telegram initData Cryptographic Validation
  // ----------------------------------------------------
  console.log('--- SECTION 1: Telegram initData Cryptographic Validation ---');

  const validUser = { id: 8881001, first_name: 'Alice', username: 'alice_admin' };
  const validInitData = generateTelegramInitData(validUser, TEST_BOT_TOKEN);

  const v1 = validateTelegramInitData(validInitData, TEST_BOT_TOKEN);
  assert(v1.valid && v1.user?.id === 8881001, 'TMA-01: Valid Telegram initData passes HMAC-SHA256 verification');

  // Tampered hash
  const tamperedHashInitData = validInitData.replace(/hash=[a-f0-9]{10}/, 'hash=deadbeef00');
  const v2 = validateTelegramInitData(tamperedHashInitData, TEST_BOT_TOKEN);
  assert(!v2.valid, 'TMA-02: Tampered hash signature is rejected');

  // Tampered payload (changing user ID without updating hash)
  const tamperedPayload = validInitData.replace('8881001', '9999999');
  const v3 = validateTelegramInitData(tamperedPayload, TEST_BOT_TOKEN);
  assert(!v3.valid, 'TMA-03: Forged / modified user payload is rejected');

  // Expired timestamp (> 24 hours ago)
  const expiredAuthDate = Math.floor(Date.now() / 1000) - 90000;
  const expiredInitData = generateTelegramInitData(validUser, TEST_BOT_TOKEN, expiredAuthDate);
  const v4 = validateTelegramInitData(expiredInitData, TEST_BOT_TOKEN);
  assert(!v4.valid && v4.error?.includes('Expired'), 'TMA-04: Expired launch data (>24h) is rejected');

  // Missing hash parameter
  const noHashInitData = generateTelegramInitData(validUser, TEST_BOT_TOKEN, undefined, true);
  const v5 = validateTelegramInitData(noHashInitData, TEST_BOT_TOKEN);
  assert(!v5.valid && v5.error?.includes('Missing hash'), 'TMA-05: Missing hash parameter is rejected');

  // Empty string / invalid input
  const v6 = validateTelegramInitData('', TEST_BOT_TOKEN);
  assert(!v6.valid, 'TMA-06: Empty initData string is rejected');

  // ----------------------------------------------------
  // SECTION 2: TMA Session Token Generation & Verification
  // ----------------------------------------------------
  console.log('\n--- SECTION 2: Signed TMA Session Token Lifecycle ---');

  const chatIdA = -100111222333;
  const sessionToken = createTmaSessionToken(validUser, chatIdA, 'GROUP_ADMIN');
  assert(typeof sessionToken === 'string' && sessionToken.includes('.'), 'TMA-07: Session token created with HMAC signature');

  const sVer = verifyTmaSessionToken(sessionToken);
  assert(sVer.valid && sVer.payload?.userId === 8881001 && sVer.payload?.chatId === chatIdA, 'TMA-08: Session token verifies successfully with correct claims');

  // Tampered session token
  const tamperedSession = sessionToken.replace(/^[A-Za-z0-9_-]+/, Buffer.from(JSON.stringify({ userId: 9999 })).toString('base64url'));
  const sTampered = verifyTmaSessionToken(tamperedSession);
  assert(!sTampered.valid, 'TMA-09: Tampered session token payload is rejected');

  // Hardened Production Secret Requirements
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.DASHBOARD_SESSION_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DASHBOARD_SESSION_SECRET;
    let thrown = false;
    let caughtMsg = '';
    try {
      getTmaSecret();
    } catch (e: any) {
      thrown = true;
      caughtMsg = e.message;
    }
    assert(thrown, 'TMA-09A: getTmaSecret throws in production when DASHBOARD_SESSION_SECRET is missing');
    assert(!caughtMsg.includes(TEST_BOT_TOKEN), 'TMA-09B: getTmaSecret error message does not leak secrets');

    process.env.DASHBOARD_SESSION_SECRET = 'short';
    let shortThrown = false;
    try {
      getTmaSecret();
    } catch {
      shortThrown = true;
    }
    assert(shortThrown, 'TMA-09C: getTmaSecret throws in production when secret is under 16 characters');

    process.env.DASHBOARD_SESSION_SECRET = 'valid-production-secret-with-sufficient-length';
    const prodSec = getTmaSecret();
    assert(prodSec === 'valid-production-secret-with-sufficient-length', 'TMA-09D: getTmaSecret successfully resolves valid production secret');
  } finally {
    process.env.NODE_ENV = prevEnv;
    process.env.DASHBOARD_SESSION_SECRET = prevSecret;
  }

  // ----------------------------------------------------
  // SECTION 3: Explicit Permission Matrix Verification
  // ----------------------------------------------------
  console.log('\n--- SECTION 3: Centralized Permission Matrix Verification ---');

  // 1. Group Owner
  const ownerFeatures = getAllowedFeaturesForRole('GROUP_OWNER');
  assert(ownerFeatures.length === 20, 'TMA-10: Group Owner has exactly 20 allowed features');
  assert(!isFeatureAllowedForRole('GROUP_OWNER', 'messages'), 'TMA-11: Group Owner is DENIED messages feature');
  assert(!isFeatureAllowedForRole('GROUP_OWNER', 'danger_zone'), 'TMA-12: Group Owner is DENIED danger_zone feature');
  assert(isFeatureAllowedForRole('GROUP_OWNER', 'overview'), 'TMA-13: Group Owner is ALLOWED overview');
  assert(isFeatureAllowedForRole('GROUP_OWNER', 'backup'), 'TMA-14: Group Owner is ALLOWED backup');
  assert(isFeatureAllowedForRole('GROUP_OWNER', 'slowmode'), 'TMA-15: Group Owner is ALLOWED slowmode');

  // 2. Regular Group Admin
  const adminFeatures = getAllowedFeaturesForRole('GROUP_ADMIN');
  const expectedAdminFeatures: MiniAppFeature[] = [
    'mention_all', 'general', 'moderation', 'content_protection',
    'lust_mode', 'stickers', 'auto_engine', 'moderators', 'commands', 'rich_post'
  ];
  assert(adminFeatures.length === 10, 'TMA-16: Regular Group Admin has EXACTLY 10 allowed features');
  for (const feat of expectedAdminFeatures) {
    assert(isFeatureAllowedForRole('GROUP_ADMIN', feat), `TMA-17: Regular Admin ALLOWED '${feat}'`);
  }

  // Verify regular admin is denied all other features
  const deniedToAdmin: MiniAppFeature[] = [
    'overview', 'welcome_goodbye', 'ai_conversation', 'slowmode',
    'abuse_words', 'members', 'permissions', 'schedules', 'activity',
    'backup', 'messages', 'danger_zone'
  ];
  for (const feat of deniedToAdmin) {
    assert(!isFeatureAllowedForRole('GROUP_ADMIN', feat), `TMA-18: Regular Admin strictly DENIED '${feat}'`);
  }

  // 3. Exception Admin
  const exceptionFeatures = getAllowedFeaturesForRole('EXCEPTION_ADMIN');
  assert(exceptionFeatures.length === 20, 'TMA-19: Exception Admin has identical permissions to Group Owner (20 features)');
  assert(!isFeatureAllowedForRole('EXCEPTION_ADMIN', 'messages'), 'TMA-20: Exception Admin is DENIED messages');
  assert(!isFeatureAllowedForRole('EXCEPTION_ADMIN', 'danger_zone'), 'TMA-21: Exception Admin is DENIED danger_zone');
  assert(isFeatureAllowedForRole('EXCEPTION_ADMIN', 'overview'), 'TMA-22: Exception Admin is ALLOWED overview');
  assert(isFeatureAllowedForRole('EXCEPTION_ADMIN', 'backup'), 'TMA-23: Exception Admin is ALLOWED backup');

  // 4. Unauthorized Role
  const unauthFeatures = getAllowedFeaturesForRole('UNAUTHORIZED');
  assert(unauthFeatures.length === 0, 'TMA-24: Unauthorized role has 0 allowed features');

  // ----------------------------------------------------
  // SECTION 4: Strict Group Isolation & IDOR Prevention
  // ----------------------------------------------------
  console.log('\n--- SECTION 4: Strict Group Isolation & Cross-Group Denial ---');

  const groupABC = -100111222333; // User is admin here
  const groupBCD = -100444555666; // User is NOT admin here (normal member)
  const testUserId = 7771234;

  // Mock Telegram API for group administrators
  const origGetChatAdministrators = telegramApi.getChatAdministrators;
  telegramApi.getChatAdministrators = async (cId: number) => {
    if (cId === groupABC) {
      return {
        ok: true,
        result: [
          { status: 'creator', user: { id: 9990001, is_bot: false, first_name: 'OwnerGuy' } } as any,
          { status: 'administrator', user: { id: testUserId, is_bot: false, first_name: 'AdminUser' } } as any,
          { status: 'administrator', user: { id: 4440001, is_bot: false, first_name: 'FakeExceptionUser' }, custom_title: 'Exception Admin' } as any
        ]
      };
    }
    if (cId === groupBCD) {
      return {
        ok: true,
        result: [
          { status: 'creator', user: { id: 5550001, is_bot: false, first_name: 'OtherOwner' } } as any,
          { status: 'administrator', user: { id: 6660001, is_bot: false, first_name: 'OtherAdmin' } } as any
        ]
      };
    }
    return { ok: true, result: [] };
  };

  const roleInABC = await resolveGroupRole(groupABC, testUserId);
  assert(roleInABC.role === 'GROUP_ADMIN', 'TMA-25: User correctly identified as GROUP_ADMIN in authorized group ABC');

  const roleInBCD = await resolveGroupRole(groupBCD, testUserId);
  assert(roleInBCD.role === 'UNAUTHORIZED', 'TMA-26: User is UNAUTHORIZED in group BCD (only a normal member)');

  // Exception Admin resolution test: authoritative db assignment
  db.setCustomRole(groupABC, 3330001, 'EXCEPTION_ADMIN');
  const roleException = await resolveGroupRole(groupABC, 3330001);
  assert(roleException.role === 'EXCEPTION_ADMIN', 'TMA-27: User with custom role EXCEPTION_ADMIN correctly recognized as EXCEPTION_ADMIN');
  assert(roleException.isExceptionAdmin === true, 'TMA-27A: isExceptionAdmin flag is true for authoritative EXCEPTION_ADMIN');

  // Telegram custom title containing "Exception" MUST NOT elevate to EXCEPTION_ADMIN
  const roleFakeException = await resolveGroupRole(groupABC, 4440001);
  assert(roleFakeException.role === 'GROUP_ADMIN', 'TMA-27B: Administrator with custom_title "Exception Admin" is NOT elevated to EXCEPTION_ADMIN');
  assert(roleFakeException.isExceptionAdmin === false, 'TMA-27C: isExceptionAdmin is strictly false for custom_title only');

  // Cross-group isolation for Exception Admin: assignment in ABC does NOT grant access in BCD
  const roleExceptionInBCD = await resolveGroupRole(groupBCD, 3330001);
  assert(roleExceptionInBCD.role === 'UNAUTHORIZED', 'TMA-27D: Exception Admin assignment in ABC does NOT grant access in BCD');

  // Group Owner resolution test
  const roleOwner = await resolveGroupRole(groupABC, 9990001);
  assert(roleOwner.role === 'GROUP_OWNER', 'TMA-28: Telegram creator correctly recognized as GROUP_OWNER');

  // ----------------------------------------------------
  // SECTION 5: End-to-End Express API Route Security Tests
  // ----------------------------------------------------
  console.log('\n--- SECTION 5: TMA Endpoints & Express Routing Tests ---');

  const app = express();
  app.use(express.json());
  app.use('/api/tma', tmaRouter);

  // Helper request function for simulated HTTP
  async function simulateRequest(method: string, path: string, headers: Record<string, string>, body?: any) {
    return new Promise<{ status: number; body: any }>((resolve) => {
      const server = app.listen(0, async () => {
        const port = (server.address() as any).port;
        try {
          const res = await fetch(`http://127.0.0.1:${port}${path}`, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body ? JSON.stringify(body) : undefined
          });
          const resBody = await res.json().catch(() => null);
          server.close(() => {
            resolve({ status: res.status, body: resBody });
          });
        } catch (e) {
          server.close(() => {
            resolve({ status: 500, body: { error: String(e) } });
          });
        }
      });
    });
  }

  // 1. Direct call with no credentials -> 401
  const reqNoAuth = await simulateRequest('GET', `/api/tma/groups/${groupABC}/settings`, {});
  assert(reqNoAuth.status === 401, 'TMA-29: Direct API call without credentials returns 401 Unauthorized');

  // 2. Validate endpoint with valid initData in group ABC -> 200 with token and role
  const adminInitData = generateTelegramInitData({ id: testUserId, username: 'admin_user' }, TEST_BOT_TOKEN);
  const authRes = await simulateRequest('POST', '/api/tma/auth/validate', {}, {
    initData: adminInitData,
    chatId: groupABC
  });
  assert(authRes.status === 200 && authRes.body?.ok && authRes.body?.role === 'GROUP_ADMIN', 'TMA-30: POST /auth/validate issues token with role GROUP_ADMIN for ABC');

  const adminToken = authRes.body.token;

  // 3. User attempts to use ABC token to access group BCD -> 403 Forbidden (Cross-Group Isolation)
  const crossGroupReq = await simulateRequest('GET', `/api/tma/groups/${groupBCD}/settings`, {
    'x-tma-session': adminToken
  });
  assert(crossGroupReq.status === 403, 'TMA-31: Cross-group access attempt (ABC token -> BCD endpoint) strictly rejected with 403 Forbidden');

  // 4. Regular Admin calls ALLOWED feature (general settings) in ABC -> 200 OK
  const allowedFeatReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/settings`, {
    'x-tma-session': adminToken
  });
  assert(allowedFeatReq.status === 200, 'TMA-32: Regular Admin access to allowed feature (settings) returns 200 OK');

  // 5. Regular Admin calls RESTRICTED feature (overview) in ABC -> 403 Forbidden
  const restrictedFeatReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/overview`, {
    'x-tma-session': adminToken
  });
  assert(restrictedFeatReq.status === 403 && restrictedFeatReq.body?.code === 'FORBIDDEN_FEATURE', 'TMA-33: Regular Admin access to restricted feature (overview) returns 403 FORBIDDEN_FEATURE');

  // 6. Regular Admin calls RESTRICTED feature (backup) in ABC -> 403 Forbidden
  const backupReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/backup/history`, {
    'x-tma-session': adminToken
  });
  assert(backupReq.status === 403 && backupReq.body?.code === 'FORBIDDEN_FEATURE', 'TMA-34: Regular Admin access to restricted feature (backup) returns 403 FORBIDDEN_FEATURE');

  // 7. Regular Admin calls RESTRICTED feature (slowmode) in ABC -> 403 Forbidden
  const slowmodeReq = await simulateRequest('PUT', `/api/tma/groups/${groupABC}/slowmode`, {
    'x-tma-session': adminToken
  }, { seconds: 30 });
  assert(slowmodeReq.status === 403 && slowmodeReq.body?.code === 'FORBIDDEN_FEATURE', 'TMA-35: Regular Admin access to restricted feature (slowmode) returns 403 FORBIDDEN_FEATURE');

  // 8. Regular Admin attempts to modify roles (grant themselves exception admin) -> 403 Forbidden
  const roleModReq = await simulateRequest('POST', `/api/tma/groups/${groupABC}/moderators/${testUserId}/role`, {
    'x-tma-session': adminToken
  }, { role: 'EXCEPTION_ADMIN' });
  assert(roleModReq.status === 403, 'TMA-36: Regular Admin cannot grant themselves or others Exception Admin status');

  // Self-modification prevention: Group Owner cannot modify their own role
  const ownerSelfMod = await simulateRequest('POST', `/api/tma/groups/${groupABC}/moderators/9990001/role`, {
    'x-tma-session': createTmaSessionToken({ id: 9990001, username: 'owner_user' }, groupABC, 'GROUP_OWNER')
  }, { role: 'MODERATOR' });
  assert(ownerSelfMod.status === 403 && ownerSelfMod.body?.code === 'SELF_MODIFICATION_FORBIDDEN', 'TMA-36A: Group Owner cannot modify their own administrative role');

  // Exception Admin cannot grant Exception Admin status to others
  const exceptionToken = createTmaSessionToken({ id: 3330001, username: 'exception_user' }, groupABC, 'EXCEPTION_ADMIN');
  const exceptionGrantAttempt = await simulateRequest('POST', `/api/tma/groups/${groupABC}/moderators/${testUserId}/role`, {
    'x-tma-session': exceptionToken
  }, { role: 'EXCEPTION_ADMIN' });
  assert(exceptionGrantAttempt.status === 403 && exceptionGrantAttempt.body?.code === 'OWNER_ONLY_ACTION', 'TMA-36B: Exception Admin cannot grant Exception Admin status to others');

  // 9. Group Owner accessing overview in ABC -> 200 OK
  const ownerToken = createTmaSessionToken({ id: 9990001, username: 'owner_user' }, groupABC, 'GROUP_OWNER');
  const ownerOverviewReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/overview`, {
    'x-tma-session': ownerToken
  });
  assert(ownerOverviewReq.status === 200 && ownerOverviewReq.body?.ok, 'TMA-37: Group Owner successfully accesses overview (200 OK)');

  // 10. Messages and Danger Zone permanently denied to ALL roles in TMA (including Owner and Exception Admin)
  const ownerMessagesReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/messages`, {
    'x-tma-session': ownerToken
  });
  assert(ownerMessagesReq.status === 403 && ownerMessagesReq.body?.code === 'FORBIDDEN_MINIAPP_ENDPOINT', 'TMA-38: /messages permanently denied to Group Owner in Mini App (403)');

  const excMessagesReq = await simulateRequest('GET', `/api/tma/groups/${groupABC}/messages`, {
    'x-tma-session': exceptionToken
  });
  assert(excMessagesReq.status === 403 && excMessagesReq.body?.code === 'FORBIDDEN_MINIAPP_ENDPOINT', 'TMA-38A: /messages permanently denied to Exception Admin in Mini App (403)');

  const ownerDangerReq = await simulateRequest('POST', `/api/tma/groups/${groupABC}/danger-zone/reset`, {
    'x-tma-session': ownerToken
  });
  assert(ownerDangerReq.status === 403 && ownerDangerReq.body?.code === 'FORBIDDEN_MINIAPP_ENDPOINT', 'TMA-39: /danger-zone permanently denied to Group Owner in Mini App (403)');

  const excDangerReq = await simulateRequest('POST', `/api/tma/groups/${groupABC}/danger-zone/reset`, {
    'x-tma-session': exceptionToken
  });
  assert(excDangerReq.status === 403 && excDangerReq.body?.code === 'FORBIDDEN_MINIAPP_ENDPOINT', 'TMA-39A: /danger-zone permanently denied to Exception Admin in Mini App (403)');

  const ownerResetReq = await simulateRequest('POST', `/api/tma/groups/${groupABC}/reset`, {
    'x-tma-session': ownerToken
  });
  assert(ownerResetReq.status === 403 && ownerResetReq.body?.code === 'FORBIDDEN_MINIAPP_ENDPOINT', 'TMA-40: /reset permanently denied to Group Owner in Mini App (403)');

  // ----------------------------------------------------
  // SECTION 6: Superadmin Web Dashboard Independence
  // ----------------------------------------------------
  console.log('\n--- SECTION 6: Superadmin Web Dashboard Independence ---');

  authManager.initDefaultOperator();
  const operatorAuth = authManager.authenticate('admin', 'supersecretadminpass');
  assert(Boolean(operatorAuth.session), 'TMA-41: Existing Superadmin operator authentication remains intact');

  const operatorSession = operatorAuth.session!;
  const superVerify = verifyOperatorAuth({
    headers: { 'x-session-id': operatorSession.sessionId }
  }, 'SUPER_ADMIN');
  assert(superVerify.authorized && superVerify.session.role === 'SUPER_ADMIN', 'TMA-42: Existing verifyOperatorAuth successfully verifies SUPER_ADMIN');

  // Verify group admin cannot access superadmin session
  const adminFakeVerify = verifyOperatorAuth({
    headers: { 'x-session-id': adminToken }
  }, 'SUPER_ADMIN');
  assert(!adminFakeVerify.authorized, 'TMA-43: Group Admin TMA token CANNOT be used to authenticate as superadmin operator');

  // Restore original telegramApi method
  telegramApi.getChatAdministrators = origGetChatAdministrators;

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} TELEGRAM MINI APP TESTS PASSED! (0 FAILED)`);
  console.log('====================================================\n');
}

runTmaTestSuite().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
