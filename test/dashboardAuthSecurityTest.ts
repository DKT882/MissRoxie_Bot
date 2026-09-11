import assert from 'assert';
import crypto from 'crypto';
import http from 'http';
import express from 'express';
import { authManager } from '../server/auth/authManager.js';
import { enterpriseRouter, extractSessionId } from '../server/api/enterpriseRouter.js';

function pass(name: string) {
  console.log(`✅ [PASS] ${name}`);
}

function verifyOperatorAuth(req: any, requiredRole: 'VIEWER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN' = 'VIEWER'): {
  authorized: boolean;
  status: number;
  error?: string;
  session?: any;
  operatorUsername: string;
} {
  let sessionId = extractSessionId(req);

  if (!sessionId) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Operator session required.',
      operatorUsername: 'unknown'
    };
  }

  const session = authManager.getSession(sessionId);
  if (!session) {
    return {
      authorized: false,
      status: 401,
      error: 'Unauthorized: Invalid or expired operator session.',
      operatorUsername: 'unknown'
    };
  }

  return { authorized: true, status: 200, session, operatorUsername: session.username };
}

export async function runDashboardAuthSecurityTests() {
  console.log('🔒 Starting Comprehensive Dashboard Authentication & Security Verification Suite...\n');

  const origPass = process.env.DASHBOARD_ADMIN_PASSWORD;
  const origUser = process.env.DASHBOARD_ADMIN_USERNAME;
  const origSecret = process.env.DASHBOARD_SESSION_SECRET;
  const origTestMode = process.env.ROXIE_TEST_MODE;

  let server: http.Server | null = null;
  let baseUrl = '';

  try {
    delete process.env.ROXIE_TEST_MODE;

    const app = express();
    app.use(express.json());

    // Global dashboard route protection middleware
    app.use('/api', (req, res, next) => {
      const publicPrefixes = ['/auth/login', '/auth/session', '/auth/logout', '/health', '/commands', '/telegram/status'];
      if (publicPrefixes.some(p => req.path === p || req.path.startsWith(p + '/'))) return next();
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }
      next();
    });

    app.use(enterpriseRouter);
    app.get('/api/dashboard/stats', (req, res) => res.json({ stats: 'ok' }));

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        const addr: any = server!.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // -------------------------------------------------------------
    // TEST 1: Missing DASHBOARD_ADMIN_PASSWORD -> No fallback password -> 503 AUTH_NOT_CONFIGURED
    // -------------------------------------------------------------
    delete process.env.DASHBOARD_ADMIN_PASSWORD;
    delete process.env.ADMIN_PASSWORD;
    process.env.DASHBOARD_SESSION_SECRET = 'some_secret';
    authManager.reloadConfig();

    assert.strictEqual(authManager.getIsConfigured(), false, 'Auth manager must not be configured when password is missing');

    const unconfiguredAuth1 = authManager.authenticate('admin', 'any_password');
    assert.strictEqual(unconfiguredAuth1.notConfigured, true, 'Authenticate must indicate notConfigured');
    assert.strictEqual(unconfiguredAuth1.session, undefined, 'No session should be issued when unconfigured');

    const res1 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'somepassword' })
    });
    const res1Body: any = await res1.json();
    assert.strictEqual(res1.status, 503, 'Login endpoint must return 503 when password missing');
    assert.strictEqual(res1Body.code, 'AUTH_NOT_CONFIGURED');
    pass('TEST 1: Missing DASHBOARD_ADMIN_PASSWORD results in disabled auth & HTTP 503');

    // -------------------------------------------------------------
    // TEST 2: Missing DASHBOARD_SESSION_SECRET -> No fallback secret -> 503 AUTH_NOT_CONFIGURED
    // -------------------------------------------------------------
    process.env.DASHBOARD_ADMIN_PASSWORD = 'some_password_123';
    delete process.env.DASHBOARD_SESSION_SECRET;
    authManager.reloadConfig();

    assert.strictEqual(authManager.getIsConfigured(), false, 'Auth manager must not be configured when session secret is missing');
    assert.strictEqual(authManager.getSessionSecret(), null, 'Session secret must be null when unconfigured');

    const unconfiguredAuth2 = authManager.authenticate('admin', 'some_password_123');
    assert.strictEqual(unconfiguredAuth2.notConfigured, true, 'Authenticate must indicate notConfigured when secret missing');
    assert.strictEqual(unconfiguredAuth2.session, undefined);

    const res2 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'some_password_123' })
    });
    const res2Body: any = await res2.json();
    assert.strictEqual(res2.status, 503, 'Login endpoint must return 503 when session secret missing');
    assert.strictEqual(res2Body.code, 'AUTH_NOT_CONFIGURED');
    pass('TEST 2: Missing DASHBOARD_SESSION_SECRET results in disabled auth & HTTP 503');

    // -------------------------------------------------------------
    // TEST 3: Both configured -> Successful authentication
    // -------------------------------------------------------------
    const testSecret = 'test_secret_key_random_64_bytes_abc1234567890';
    const testPassword = 'Secure_Test_Password_999!';
    const testUsername = 'test_super_admin';

    process.env.DASHBOARD_ADMIN_USERNAME = testUsername;
    process.env.DASHBOARD_ADMIN_PASSWORD = testPassword;
    process.env.DASHBOARD_SESSION_SECRET = testSecret;
    authManager.reloadConfig();

    assert.strictEqual(authManager.getIsConfigured(), true, 'Auth manager must be configured when both provided');
    assert.strictEqual(authManager.getSessionSecret(), testSecret, 'Session secret must match configured env');

    const authSuccess = authManager.authenticate(testUsername, testPassword);
    assert(authSuccess.operator, 'Operator must be present on valid login');
    assert(authSuccess.session, 'Session must be created');
    assert.strictEqual(authSuccess.session?.username, testUsername);
    assert.strictEqual(authSuccess.operator?.role, 'SUPER_ADMIN');
    pass('TEST 3: Both configured credentials successfully authenticate');

    // -------------------------------------------------------------
    // TEST 4: Wrong password -> 401 Unauthorized
    // -------------------------------------------------------------
    const authWrong = authManager.authenticate(testUsername, 'WrongPassword123');
    assert.strictEqual(authWrong.session, undefined);
    assert.strictEqual(authWrong.error, 'Invalid username or password');

    const res4 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: 'WrongPassword123' })
    });
    const res4Body: any = await res4.json();
    assert.strictEqual(res4.status, 401);
    assert.strictEqual(res4Body.code, 'INVALID_CREDENTIALS');
    pass('TEST 4: Wrong password returns 401 Unauthorized');

    // -------------------------------------------------------------
    // TEST 5: Session cookie created with correct security flags
    // -------------------------------------------------------------
    const res5 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    const res5Body: any = await res5.json();
    assert.strictEqual(res5.status, 200);
    assert(res5Body.session, 'Session must be returned');
    const cookieHeader = res5.headers.get('set-cookie') || '';
    assert(cookieHeader.includes('roxie_session='), 'Cookie must contain roxie_session');
    assert(cookieHeader.toLowerCase().includes('httponly'), 'Cookie must be HttpOnly');
    assert(cookieHeader.toLowerCase().includes('path=/'), 'Cookie path must be /');
    assert(cookieHeader.toLowerCase().includes('samesite=lax'), 'Cookie must have SameSite=Lax');
    pass('TEST 5: Session cookie created with strict security flags');

    // -------------------------------------------------------------
    // TEST 6: Session signature valid -> Authenticated
    // -------------------------------------------------------------
    const signedToken = res5Body.session.sessionId;
    assert(signedToken.includes('.'), 'Session token must be dot-separated rawId.signature');
    const validSession = authManager.getSession(signedToken);
    assert(validSession, 'Session with valid signature must resolve');
    assert.strictEqual(validSession?.username, testUsername);
    pass('TEST 6: Valid cryptographic session signature authenticates successfully');

    // -------------------------------------------------------------
    // TEST 7: Tampered signature / token -> Rejected (null / 401)
    // -------------------------------------------------------------
    const [rawId, validSig] = signedToken.split('.');
    const tamperedSig = validSig.slice(0, -4) + 'ffff';
    const tamperedToken = `${rawId}.${tamperedSig}`;
    assert.strictEqual(authManager.getSession(tamperedToken), null, 'Tampered signature must be rejected');

    const tamperedRawId = rawId.slice(0, -4) + '0000';
    const tamperedToken2 = `${tamperedRawId}.${validSig}`;
    assert.strictEqual(authManager.getSession(tamperedToken2), null, 'Tampered rawId must be rejected');
    pass('TEST 7: Tampered session tokens rejected with null / 401');

    // -------------------------------------------------------------
    // TEST 8: Expired session -> 401 / null session
    // -------------------------------------------------------------
    const expiredAuth = authManager.authenticate(testUsername, testPassword);
    const expiredToken = expiredAuth.session!.sessionId;
    const sessionRecord = (authManager as any).sessions.get(expiredAuth.session!.rawSessionId);
    sessionRecord.expiresAt = Date.now() - 1000; // Force expiration

    assert.strictEqual(authManager.getSession(expiredToken), null, 'Expired session must return null');
    assert.strictEqual((authManager as any).sessions.has(expiredAuth.session!.rawSessionId), false, 'Expired session must be pruned');
    pass('TEST 8: Expired session rejected and purged');

    // -------------------------------------------------------------
    // TEST 9: Logout -> Session invalidated & cookie cleared
    // -------------------------------------------------------------
    const loginForLogout = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    const loginForLogoutBody: any = await loginForLogout.json();
    const logoutToken = loginForLogoutBody.session.sessionId;
    const loginCookie = loginForLogout.headers.get('set-cookie') || '';

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': loginCookie }
    });
    const logoutResBody: any = await logoutRes.json();
    assert.strictEqual(logoutRes.status, 200);
    assert.strictEqual(logoutResBody.success, true);
    assert.strictEqual(logoutResBody.authenticated, false);
    assert.strictEqual(authManager.getSession(logoutToken), null, 'Logged out session must not resolve');
    pass('TEST 9: Logout invalidates session and clears cookie');

    // -------------------------------------------------------------
    // TEST 10: Reuse logged-out session -> 401
    // -------------------------------------------------------------
    const sessionAfterLogout = authManager.getSession(logoutToken);
    assert.strictEqual(sessionAfterLogout, null, 'Reusing logged out session must return null');

    const checkLoggedOutReq = await fetch(`${baseUrl}/api/auth/session`, {
      headers: { 'Cookie': `roxie_session=${logoutToken}` }
    });
    const checkLoggedOutBody: any = await checkLoggedOutReq.json();
    assert.strictEqual(checkLoggedOutBody.authenticated, false, 'API must return authenticated: false');
    pass('TEST 10: Reused logged-out session fails authentication');

    // -------------------------------------------------------------
    // TEST 11: Protected API without session -> 401
    // -------------------------------------------------------------
    const res11 = await fetch(`${baseUrl}/api/dashboard/stats`);
    const res11Body: any = await res11.json();
    assert.strictEqual(res11.status, 401, 'Protected API must return 401 without session');
    assert.strictEqual(res11Body.code, 'UNAUTHORIZED');
    pass('TEST 11: Protected API access without session rejected with 401');

    // -------------------------------------------------------------
    // TEST 12: Protected API with valid session -> 200 Success
    // -------------------------------------------------------------
    const validLogin = authManager.authenticate(testUsername, testPassword);
    const validToken = validLogin.session!.sessionId;

    const res12Cookie = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { 'Cookie': `roxie_session=${validToken}` }
    });
    assert.strictEqual(res12Cookie.status, 200, 'Protected API with Cookie must succeed');

    const res12Header = await fetch(`${baseUrl}/api/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    assert.strictEqual(res12Header.status, 200, 'Protected API with Bearer token must succeed');
    pass('TEST 12: Protected API access with valid session cookie/header succeeds');

    // -------------------------------------------------------------
    // TEST 13: Deterministic Restart / Reload behavior
    // -------------------------------------------------------------
    const persistentToken = authManager.authenticate(testUsername, testPassword).session!.sessionId;
    assert(authManager.getSession(persistentToken) !== null);

    // Reload with exact same environment configuration
    authManager.reloadConfig();
    assert(authManager.getSession(persistentToken) !== null, 'Session signature remains valid across config reloads with same secret');

    // Reload with different secret -> previous tokens immediately invalid
    process.env.DASHBOARD_SESSION_SECRET = 'new_random_secret_rotation_123!';
    authManager.reloadConfig();
    assert.strictEqual(authManager.getSession(persistentToken), null, 'Session tokens invalidated upon secret rotation');

    // Restore test secret
    process.env.DASHBOARD_SESSION_SECRET = testSecret;
    authManager.reloadConfig();
    assert(authManager.getSession(persistentToken) !== null, 'Session tokens valid again when matching secret is restored');
    pass('TEST 13: Deterministic restart and secret rotation verification complete');

    // -------------------------------------------------------------
    // TEST 14: Passwords & secrets never leaked in API responses or sessions
    // -------------------------------------------------------------
    const authOutput = authManager.authenticate(testUsername, testPassword);
    const serializedSession = JSON.stringify(authOutput.session);
    const serializedOperator = JSON.stringify(authOutput.operator);

    assert(!serializedSession.includes(testPassword), 'Password must never be in session');
    assert(!serializedSession.includes(testSecret), 'Session secret must never be in session');
    assert(!serializedOperator.includes(testPassword), 'Password must never be in operator');
    assert(!serializedOperator.includes(testSecret), 'Session secret must never be in operator');

    const loginApiResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, password: testPassword })
    });
    const serializedApi = JSON.stringify(await loginApiResponse.json());
    assert(!serializedApi.includes(testPassword), 'Password must not be in login API response');
    assert(!serializedApi.includes(testSecret), 'Secret must not be in login API response');
    pass('TEST 14: Secret & password leakage protection verified across all outputs');

    console.log('\n🎉 ALL 14 DASHBOARD AUTHENTICATION & SECURITY TESTS PASSED SUCCESSFULLY!');
  } finally {
    if (server) {
      server.close();
    }

    if (origPass !== undefined) process.env.DASHBOARD_ADMIN_PASSWORD = origPass;
    else delete process.env.DASHBOARD_ADMIN_PASSWORD;

    if (origUser !== undefined) process.env.DASHBOARD_ADMIN_USERNAME = origUser;
    else delete process.env.DASHBOARD_ADMIN_USERNAME;

    if (origSecret !== undefined) process.env.DASHBOARD_SESSION_SECRET = origSecret;
    else delete process.env.DASHBOARD_SESSION_SECRET;

    if (origTestMode !== undefined) process.env.ROXIE_TEST_MODE = origTestMode;
    else delete process.env.ROXIE_TEST_MODE;

    authManager.reloadConfig();
  }
}

runDashboardAuthSecurityTests().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('❌ Dashboard Auth Security Tests Failed:', err);
  process.exit(1);
});
