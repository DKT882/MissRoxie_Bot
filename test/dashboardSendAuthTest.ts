import assert from 'assert';
import http from 'http';
import express from 'express';
import { authManager } from '../server/auth/authManager.js';
import { verifyOperatorAuth, executeSendMessageWorkflow } from '../server.js';
import { db } from '../server/db/storage.js';

function pass(name: string) {
  console.log(`✅ [PASS] ${name}`);
}

export async function runDashboardSendAuthTests() {
  console.log('🔒 Starting Dashboard Send & Operator Authentication Regression Tests...\n');

  const origPass = process.env.DASHBOARD_ADMIN_PASSWORD;
  const origUser = process.env.DASHBOARD_ADMIN_USERNAME;
  const origSecret = process.env.DASHBOARD_SESSION_SECRET;
  const origTestMode = process.env.ROXIE_TEST_MODE;
  const origNodeEnv = process.env.NODE_ENV;

  let server: http.Server | null = null;
  let baseUrl = '';

  try {
    // Disable test bypass to ensure real auth checks run
    delete process.env.ROXIE_TEST_MODE;
    process.env.NODE_ENV = 'production';

    const testSecret = 'secret_key_for_dashboard_send_auth_regression_testing_12345';
    const testAdminPass = 'SuperSecurePass_Admin_123!';
    const testAdminUser = 'test_admin_operator';

    process.env.DASHBOARD_ADMIN_USERNAME = testAdminUser;
    process.env.DASHBOARD_ADMIN_PASSWORD = testAdminPass;
    process.env.DASHBOARD_SESSION_SECRET = testSecret;
    authManager.reloadConfig();

    // Create an express app that reproduces the exact routing and middleware from server.ts
    const app = express();
    app.use(express.json());

    // 1. Global /api middleware (server.ts lines 645-675)
    app.use('/api', (req, res, next) => {
      const publicPrefixes = [
        '/auth/login',
        '/auth/session',
        '/auth/logout',
        '/health',
        '/commands',
        '/telegram/status'
      ];
      if (publicPrefixes.some(p => req.path === p || req.path.startsWith(p + '/'))) {
        return next();
      }
      if (process.env.NODE_ENV === 'test' || process.env.ROXIE_TEST_MODE === 'true') {
        return next();
      }
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({
          error: auth.error || 'Unauthorized: Operator login required.',
          code: 'UNAUTHORIZED'
        });
      }
      (req as any).operator = auth.session;
      next();
    });

    // 2. /api/dashboard/send endpoint (server.ts lines 1974-1998)
    app.post('/api/dashboard/send', async (req, res) => {
      try {
        const auth = verifyOperatorAuth(req, 'MODERATOR');
        if (!auth.authorized) {
          return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
        }
        const targetId = req.body.targetId || req.body.chatId;
        const text = req.body.message || req.body.text;
        const replyToMessageId = req.body.replyToMessageId !== undefined && req.body.replyToMessageId !== null
          ? Number(req.body.replyToMessageId)
          : undefined;
        const operator = auth.operatorUsername || 'dashboard_admin';
        const sessionId = auth.session?.sessionId;
        const clientRequestId = req.body.clientRequestId || req.body.idempotencyKey;

        // Mock delivery for test purposes
        res.json({
          success: true,
          messageId: 999123,
          targetId,
          text,
          replyToMessageId: replyToMessageId || null,
          operator,
          sessionId
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    });

    // 3. /api/dashboard/broadcast endpoint (server.ts lines 2004-2065)
    app.post('/api/dashboard/broadcast', async (req, res) => {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }
      const { groupIds, message } = req.body;
      if (!Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ error: 'At least one group ID must be selected.' });
      }
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message content cannot be empty.' });
      }
      res.json({
        total: groupIds.length,
        sent: groupIds.length,
        failed: 0,
        successful: groupIds,
        errors: [],
        operatorRole: auth.session?.role,
        operatorUsername: auth.operatorUsername
      });
    });

    // 4. /api/dashboard/posts/send endpoint (server.ts lines 2210-2220)
    app.post('/api/dashboard/posts/send', async (req, res) => {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }
      res.json({
        success: true,
        result: { messageId: 888456 },
        operator: auth.operatorUsername
      });
    });

    // 5. /api/dashboard/posts/schedule endpoint (server.ts lines 2360-2370)
    app.post('/api/dashboard/posts/schedule', async (req, res) => {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }
      res.json({
        success: true,
        schedule: { id: 'sched_test_123' },
        operator: auth.operatorUsername
      });
    });

    // 6. /api/dashboard/posts/upload-media endpoint (server.ts lines 2176-2182)
    app.post('/api/dashboard/posts/upload-media', async (req, res) => {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }
      res.json({
        success: true,
        mediaUploadId: 'media_test_upload_id',
        operator: auth.operatorUsername
      });
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        const addr: any = server!.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Set up test operators
    // 1. Viewer operator
    const viewerOp = authManager.createOperator({
      username: 'op_viewer',
      name: 'Test Viewer',
      password: 'ViewerPassword123!',
      role: 'VIEWER'
    });
    const viewerAuth = authManager.authenticate('op_viewer', 'ViewerPassword123!');
    const viewerSessionId = viewerAuth.session!.sessionId;

    // 2. Moderator operator
    const modOp = authManager.createOperator({
      username: 'op_moderator',
      name: 'Test Moderator',
      password: 'ModeratorPassword123!',
      role: 'MODERATOR'
    });
    const modAuth = authManager.authenticate('op_moderator', 'ModeratorPassword123!');
    const modSessionId = modAuth.session!.sessionId;

    // 3. Super admin operator
    const superAdminAuth = authManager.authenticate(testAdminUser, testAdminPass);
    const superAdminSessionId = superAdminAuth.session!.sessionId;

    // =========================================================================
    // CATEGORY 1: Unauthenticated Requests Fail with 401
    // =========================================================================
    console.log('\n--- 1. Unauthenticated Request Rejection ---');

    // 1a. /api/dashboard/send without credentials
    const unauthSend = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId: -10012345, message: 'Unauthenticated message' })
    });
    const unauthSendBody: any = await unauthSend.json();
    assert.strictEqual(unauthSend.status, 401, 'Unauthenticated send must return 401');
    assert.strictEqual(unauthSendBody.error, 'Unauthorized: Operator session required.');
    pass('Unauthenticated POST /api/dashboard/send rejected with 401 and "Operator session required."');

    // 1b. /api/dashboard/broadcast without credentials
    const unauthBcast = await fetch(`${baseUrl}/api/dashboard/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: [-1001], message: 'Unauthenticated broadcast' })
    });
    const unauthBcastBody: any = await unauthBcast.json();
    assert.strictEqual(unauthBcast.status, 401, 'Unauthenticated broadcast must return 401');
    assert.strictEqual(unauthBcastBody.error, 'Unauthorized: Operator session required.');
    pass('Unauthenticated POST /api/dashboard/broadcast rejected with 401 and "Operator session required."');

    // 1c. /api/dashboard/posts/send without credentials
    const unauthPostSend = await fetch(`${baseUrl}/api/dashboard/posts/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Hi' } })
    });
    const unauthPostSendBody: any = await unauthPostSend.json();
    assert.strictEqual(unauthPostSend.status, 401, 'Unauthenticated rich post send must return 401');
    assert.strictEqual(unauthPostSendBody.error, 'Unauthorized: Operator session required.');
    pass('Unauthenticated POST /api/dashboard/posts/send rejected with 401 and "Operator session required."');

    // 1d. /api/dashboard/posts/schedule without credentials
    const unauthPostSched = await fetch(`${baseUrl}/api/dashboard/posts/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Hi' } })
    });
    const unauthPostSchedBody: any = await unauthPostSched.json();
    assert.strictEqual(unauthPostSched.status, 401, 'Unauthenticated rich post schedule must return 401');
    assert.strictEqual(unauthPostSchedBody.error, 'Unauthorized: Operator session required.');
    pass('Unauthenticated POST /api/dashboard/posts/schedule rejected with 401 and "Operator session required."');

    // 1e. /api/dashboard/posts/upload-media without credentials
    const unauthUpload = await fetch(`${baseUrl}/api/dashboard/posts/upload-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'photo' })
    });
    const unauthUploadBody: any = await unauthUpload.json();
    assert.strictEqual(unauthUpload.status, 401, 'Unauthenticated upload-media must return 401');
    assert.strictEqual(unauthUploadBody.error, 'Unauthorized: Operator session required.');
    pass('Unauthenticated POST /api/dashboard/posts/upload-media rejected with 401 and "Operator session required."');

    // =========================================================================
    // CATEGORY 2: Invalid & Expired Sessions Fail with 401
    // =========================================================================
    console.log('\n--- 2. Invalid & Expired Session Handling ---');

    // 2a. Random invalid token
    const invalidTokenRes = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': 'totally_invalid_session_id_token'
      },
      body: JSON.stringify({ targetId: -1001, message: 'Invalid token test' })
    });
    const invalidTokenBody: any = await invalidTokenRes.json();
    assert.strictEqual(invalidTokenRes.status, 401);
    assert.strictEqual(invalidTokenBody.error, 'Unauthorized: Invalid or expired operator session.');
    pass('Invalid session token rejected with 401 and "Invalid or expired operator session."');

    // 2b. Tampered session signature
    const [rawModId, modSig] = modSessionId.split('.');
    const tamperedSigToken = `${rawModId}.${modSig.slice(0, -4)}dead`;
    const tamperedRes = await fetch(`${baseUrl}/api/dashboard/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tamperedSigToken}`
      },
      body: JSON.stringify({ groupIds: [-1001], message: 'Tampered token broadcast' })
    });
    const tamperedBody: any = await tamperedRes.json();
    assert.strictEqual(tamperedRes.status, 401);
    assert.strictEqual(tamperedBody.error, 'Unauthorized: Invalid or expired operator session.');
    pass('Tampered signature token rejected with 401 on broadcast');

    // 2c. Expired session token
    const expAuth = authManager.authenticate(testAdminUser, testAdminPass);
    const expToken = expAuth.session!.sessionId;
    const expRecord = (authManager as any).sessions.get(expAuth.session!.rawSessionId);
    expRecord.expiresAt = Date.now() - 5000; // Artificially expire session

    const expiredRes = await fetch(`${baseUrl}/api/dashboard/posts/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `roxie_session=${expToken}`
      },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Expired test' } })
    });
    const expiredBody: any = await expiredRes.json();
    assert.strictEqual(expiredRes.status, 401);
    assert.strictEqual(expiredBody.error, 'Unauthorized: Invalid or expired operator session.');
    pass('Expired session token rejected with 401 on rich post send');

    // =========================================================================
    // CATEGORY 3: Role Hierarchy Enforcement (VIEWER rejected on write endpoints)
    // =========================================================================
    console.log('\n--- 3. Role Hierarchy & Permission Enforcement ---');

    // 3a. VIEWER calling /api/dashboard/send -> 403 Forbidden
    const viewerSendRes = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': viewerSessionId
      },
      body: JSON.stringify({ targetId: -1001, message: 'Viewer send attempt' })
    });
    const viewerSendBody: any = await viewerSendRes.json();
    assert.strictEqual(viewerSendRes.status, 403, 'VIEWER role must return 403 on send');
    assert.strictEqual(viewerSendBody.error, 'Forbidden: Requires MODERATOR role or higher.');
    pass('VIEWER role rejected on /api/dashboard/send with 403 "Requires MODERATOR role or higher."');

    // 3b. VIEWER calling /api/dashboard/broadcast -> 403 Forbidden
    const viewerBcastRes = await fetch(`${baseUrl}/api/dashboard/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${viewerSessionId}`
      },
      body: JSON.stringify({ groupIds: [-1001], message: 'Viewer broadcast attempt' })
    });
    const viewerBcastBody: any = await viewerBcastRes.json();
    assert.strictEqual(viewerBcastRes.status, 403, 'VIEWER role must return 403 on broadcast');
    assert.strictEqual(viewerBcastBody.error, 'Forbidden: Requires MODERATOR role or higher.');
    pass('VIEWER role rejected on /api/dashboard/broadcast with 403');

    // 3c. VIEWER calling /api/dashboard/posts/send -> 403 Forbidden
    const viewerPostRes = await fetch(`${baseUrl}/api/dashboard/posts/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `roxie_session=${viewerSessionId}`
      },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Viewer post attempt' } })
    });
    const viewerPostBody: any = await viewerPostRes.json();
    assert.strictEqual(viewerPostRes.status, 403, 'VIEWER role must return 403 on posts/send');
    assert.strictEqual(viewerPostBody.error, 'Forbidden: Requires MODERATOR role or higher.');
    pass('VIEWER role rejected on /api/dashboard/posts/send with 403');

    // =========================================================================
    // CATEGORY 4: Authenticated MODERATOR & ADMIN Operations Succeed
    // =========================================================================
    console.log('\n--- 4. Authorized Operator Send Success ---');

    // 4a. MODERATOR using x-session-id header
    const modSendRes = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': modSessionId
      },
      body: JSON.stringify({ targetId: -1001999, message: 'Hello from Moderator via x-session-id' })
    });
    const modSendBody: any = await modSendRes.json();
    assert.strictEqual(modSendRes.status, 200);
    assert.strictEqual(modSendBody.success, true);
    assert.strictEqual(modSendBody.operator, 'op_moderator');
    pass('MODERATOR sends message via x-session-id header successfully (200 OK)');

    // 4b. MODERATOR using Authorization: Bearer header
    const modSendBearer = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modSessionId}`
      },
      body: JSON.stringify({ targetId: -1001999, message: 'Hello from Moderator via Bearer' })
    });
    const modSendBearerBody: any = await modSendBearer.json();
    assert.strictEqual(modSendBearer.status, 200);
    assert.strictEqual(modSendBearerBody.success, true);
    assert.strictEqual(modSendBearerBody.operator, 'op_moderator');
    pass('MODERATOR sends message via Authorization: Bearer header successfully (200 OK)');

    // 4c. SUPER_ADMIN using roxie_session cookie
    const adminSendCookie = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `roxie_session=${superAdminSessionId}`
      },
      body: JSON.stringify({ targetId: -1001999, message: 'Hello from Admin via Cookie' })
    });
    const adminSendCookieBody: any = await adminSendCookie.json();
    assert.strictEqual(adminSendCookie.status, 200);
    assert.strictEqual(adminSendCookieBody.success, true);
    assert.strictEqual(adminSendCookieBody.operator, testAdminUser);
    pass('SUPER_ADMIN sends message via roxie_session cookie successfully (200 OK)');

    // 4d. MODERATOR broadcasting via x-session-id
    const modBcastRes = await fetch(`${baseUrl}/api/dashboard/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': modSessionId
      },
      body: JSON.stringify({ groupIds: [-1001, -1002], message: 'Authorized broadcast announcement' })
    });
    const modBcastBody: any = await modBcastRes.json();
    assert.strictEqual(modBcastRes.status, 200);
    assert.strictEqual(modBcastBody.sent, 2);
    assert.strictEqual(modBcastBody.operatorRole, 'MODERATOR');
    pass('MODERATOR broadcasts to groups successfully (200 OK)');

    // 4e. MODERATOR sending rich post via Authorization: Bearer
    const modPostSendRes = await fetch(`${baseUrl}/api/dashboard/posts/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modSessionId}`
      },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Authorized rich post' } })
    });
    const modPostSendBody: any = await modPostSendRes.json();
    assert.strictEqual(modPostSendRes.status, 200);
    assert.strictEqual(modPostSendBody.success, true);
    pass('MODERATOR sends rich post successfully (200 OK)');

    // 4f. MODERATOR scheduling rich post via x-session-id
    const modPostSchedRes = await fetch(`${baseUrl}/api/dashboard/posts/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': modSessionId
      },
      body: JSON.stringify({ chatId: -1001, payload: { contentType: 'text', text: 'Authorized sched post' } })
    });
    const modPostSchedBody: any = await modPostSchedRes.json();
    assert.strictEqual(modPostSchedRes.status, 200);
    assert.strictEqual(modPostSchedBody.success, true);
    pass('MODERATOR schedules rich post successfully (200 OK)');

    // 4g. MODERATOR uploading media via x-session-id
    const modUploadRes = await fetch(`${baseUrl}/api/dashboard/posts/upload-media`, {
      method: 'POST',
      headers: {
        'x-session-id': modSessionId
      }
    });
    const modUploadBody: any = await modUploadRes.json();
    assert.strictEqual(modUploadRes.status, 200);
    assert.strictEqual(modUploadBody.success, true);
    pass('MODERATOR uploads media successfully (200 OK)');

    // =========================================================================
    // CATEGORY 5: Client-side Header Generator Simulation
    // =========================================================================
    console.log('\n--- 5. Frontend Client Header Generation Simulation ---');

    // Simulate getAuthHeaders helper from RichPostComposer / RichMessageEditor
    function simulateGetAuthHeaders(token: string | null, extra: Record<string, string> = {}): Record<string, string> {
      const headers: Record<string, string> = { ...extra };
      if (token) {
        headers['x-session-id'] = token;
        headers['Authorization'] = `Bearer ${token}`;
      }
      return headers;
    }

    const generatedHeaders = simulateGetAuthHeaders(modSessionId, { 'Content-Type': 'application/json' });
    const simRes = await fetch(`${baseUrl}/api/dashboard/send`, {
      method: 'POST',
      headers: generatedHeaders,
      body: JSON.stringify({ targetId: -1001, message: 'Simulated client headers' })
    });
    const simBody: any = await simRes.json();
    assert.strictEqual(simRes.status, 200);
    assert.strictEqual(simBody.success, true);
    pass('Simulated frontend getAuthHeaders payload authenticated cleanly');

    console.log('\n=================================================================');
    console.log('🎉 ALL DASHBOARD SEND AUTHENTICATION TESTS PASSED SUCCESSFULLY!');
    console.log('=================================================================\n');
  } finally {
    if (server) {
      server.close();
    }
    // Restore environment
    if (origPass !== undefined) process.env.DASHBOARD_ADMIN_PASSWORD = origPass;
    else delete process.env.DASHBOARD_ADMIN_PASSWORD;

    if (origUser !== undefined) process.env.DASHBOARD_ADMIN_USERNAME = origUser;
    else delete process.env.DASHBOARD_ADMIN_USERNAME;

    if (origSecret !== undefined) process.env.DASHBOARD_SESSION_SECRET = origSecret;
    else delete process.env.DASHBOARD_SESSION_SECRET;

    if (origTestMode !== undefined) process.env.ROXIE_TEST_MODE = origTestMode;
    else delete process.env.ROXIE_TEST_MODE;

    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;

    authManager.reloadConfig();
  }
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('dashboardSendAuthTest.ts')) {
  runDashboardSendAuthTests().catch((err) => {
    console.error('❌ Test suite failed:', err);
    process.exit(1);
  });
}
