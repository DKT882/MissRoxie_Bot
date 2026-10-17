import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import './server/observability/logger.js';
import { telegramBot } from './server/telegram.js';
import { db } from './server/db/storage.js';
import { COMMAND_CATALOG } from './server/telegram/commandCatalog.js';
import { enterpriseRouter } from './server/api/enterpriseRouter.js';
import { phase8Router } from './server/api/phase8Router.js';
import { tmaRouter } from './server/tma/tmaRouter.js';
import { DisasterRecoveryService } from './server/system/disasterRecovery.js';
import { HealthDiagnosticsService } from './server/observability/healthService.js';
import { telegramApi } from './server/telegram/api.js';
import { authManager } from './server/auth/authManager.js';
import { runDummyDataCleanup } from './server/operations/cleanupDummyData.js';
import { mongoManager } from './server/db/mongodb.js';
import { MongoStorageService } from './server/db/mongoStorage.js';
import { PostSender, sanitizeInlineButtons, validateMediaReference } from './server/telegram/postSender.js';
import { PostPayload, PostContentType, ScheduledPostButton, WelcomeDmConfig, TelegramUser, RichMessageConfig, MessageMode, GroupSettings, WelcomeDmTriggerMode } from './server/telegram/types.js';
import { mediaUploadStore } from './server/telegram/mediaUploadStore.js';
import { ModerationService } from './server/telegram/moderation.js';
import { messageScheduler, normalizeTriggerKeyword } from './server/telegram/scheduler.js';
import { mentionAllService } from './server/telegram/mentionAllService.js';
import { mtprotoParticipantService } from './server/telegram/mtprotoParticipantService.js';

dotenv.config();

const inFlightLeaveOperations = new Set<number>();

// Exported workflow for Leaving Groups with authoritative verification & stale handling
export async function executeLeaveGroupWorkflow(
  chatId: number,
  confirmation: string
): Promise<{ status: number; body: { success?: boolean; message?: string; error?: string; code?: string; isStale?: boolean; botLeft?: boolean } }> {
  if (confirmation !== 'LEAVE') {
    return {
      status: 400,
      body: { error: 'Explicit confirmation "LEAVE" required to leave group.', code: 'CONFIRMATION_REQUIRED' }
    };
  }

  if (inFlightLeaveOperations.has(chatId)) {
    return {
      status: 409,
      body: { error: 'A leave operation is already in progress for this group.', code: 'OPERATION_IN_PROGRESS' }
    };
  }

  inFlightLeaveOperations.add(chatId);
  try {
    const settings = db.getGroupSettings(chatId);

  // 1. Check if group was already recorded as left locally
  if (settings.botLeft) {
    return {
      status: 400,
      body: {
        error: 'Roxie has already left this group. Local state already marks this group as "Bot Left".',
        code: 'ALREADY_LEFT',
        botLeft: true
      }
    };
  }

  // 2. Authoritative verification: First verify the chat exists on Telegram via getChat
  let chatRes: any;
  try {
    chatRes = await telegramApi.getChat(chatId);
  } catch (err: any) {
    return {
      status: 502,
      body: {
        error: `Telegram API network failure while checking chat: ${err.message}`,
        code: 'TELEGRAM_NETWORK_ERROR'
      }
    };
  }

  if (!chatRes.ok) {
    const desc = (chatRes.description || '').toLowerCase();
    // Stale, deleted, migrated, or unresolvable chat ID
    if (
      desc.includes('chat not found') ||
      desc.includes('chat was deleted') ||
      desc.includes('group chat was migrated') ||
      chatRes.error_code === 400
    ) {
      // Synchronize local storage: mark as Unavailable / Stale
      db.markGroupUnavailable(chatId, chatRes.description || 'Chat not found on Telegram');

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'leave_group',
        action: 'leave_group',
        result: 'failure',
        details: `Cannot leave group ${chatId}: Telegram returned "${chatRes.description}". Group marked as Unavailable / Stale.`
      });

      return {
        status: 404,
        body: {
          error: `Cannot leave: This group is unavailable or no longer exists on Telegram (${chatRes.description || 'chat not found'}). The group has been marked as Unavailable / Stale.`,
          code: 'CHAT_NOT_FOUND',
          isStale: true
        }
      };
    }

    // Other Telegram API error (e.g. 500, rate limit, etc.)
    return {
      status: 502,
      body: {
        error: `Telegram API error while verifying chat: ${chatRes.description || 'Unknown Telegram error'}`,
        code: 'TELEGRAM_API_ERROR'
      }
    };
  }

  // 3. Authoritative membership verification: Get bot identity and verify current membership
  let meRes: any;
  try {
    meRes = await telegramApi.getMe();
  } catch (err: any) {
    return {
      status: 502,
      body: {
        error: `Telegram API network failure while verifying bot identity: ${err.message}`,
        code: 'TELEGRAM_NETWORK_ERROR'
      }
    };
  }

  if (!meRes.ok || !meRes.result?.id) {
    return {
      status: 502,
      body: {
        error: `Telegram API error: Unable to verify bot identity (${meRes.description || 'getMe failed'})`,
        code: 'BOT_IDENTITY_ERROR'
      }
    };
  }

  const botId = meRes.result.id;

  // Query Telegram getChatMember
  let memberRes: any;
  try {
    memberRes = await telegramApi.getChatMember(chatId, botId);
  } catch (err: any) {
    return {
      status: 502,
      body: {
        error: `Telegram API network failure while checking bot membership: ${err.message}`,
        code: 'TELEGRAM_NETWORK_ERROR'
      }
    };
  }

  // Handle case where getChatMember indicates bot is already not in the chat
  if (!memberRes.ok) {
    const memDesc = (memberRes.description || '').toLowerCase();
    if (
      memDesc.includes('not a member') ||
      memDesc.includes('user not found') ||
      memDesc.includes('kicked') ||
      memberRes.error_code === 400 ||
      memberRes.error_code === 403
    ) {
      // Authoritative verification confirms Roxie is already no longer present!
      db.markBotLeftGroup(chatId);

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'leave_group',
        action: 'leave_group',
        result: 'success',
        details: `Authoritative check confirmed Roxie is already not a member in ${chatId} (${memberRes.description}). Synchronized local state to Left.`
      });

      return {
        status: 400,
        body: {
          error: `Roxie is no longer a member of this group on Telegram (${memberRes.description || 'bot is not a member'}). Local group state has been synchronized to "Bot Left".`,
          code: 'ALREADY_NOT_MEMBER',
          botLeft: true
        }
      };
    }

    return {
      status: 502,
      body: {
        error: `Telegram API error verifying bot membership: ${memberRes.description || 'getChatMember failed'}`,
        code: 'MEMBERSHIP_CHECK_FAILED'
      }
    };
  }

  const memberStatus = memberRes.result?.status;
  if (memberStatus === 'left' || memberStatus === 'kicked') {
    // Authoritative verification confirms Roxie has already left or was kicked!
    db.markBotLeftGroup(chatId);

    db.logAction({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toISOString(),
      chatId,
      groupId: chatId,
      actorRole: 'DASHBOARD_ADMIN',
      adminUsername: 'dashboard_admin',
      command: 'leave_group',
      action: 'leave_group',
      result: 'success',
      details: `Authoritative check confirmed Roxie membership status is "${memberStatus}" in ${chatId}. Synchronized local state to Left.`
    });

    return {
      status: 400,
      body: {
        error: `Roxie has already left or was removed from this group on Telegram (status: "${memberStatus}"). Local group state has been synchronized to "Bot Left".`,
        code: 'ALREADY_NOT_MEMBER',
        botLeft: true
      }
    };
  }

  // 4. Roxie is confirmed to be an active member! Now execute leaveChat
  let leaveRes: any;
  try {
    leaveRes = await telegramApi.leaveChat(chatId);
  } catch (err: any) {
    return {
      status: 502,
      body: {
        error: `Telegram API network failure while attempting leaveChat: ${err.message}`,
        code: 'TELEGRAM_NETWORK_ERROR'
      }
    };
  }

  if (!leaveRes.ok) {
    const leaveDesc = (leaveRes.description || '').toLowerCase();
    if (leaveDesc.includes('not a member') || leaveDesc.includes('kicked')) {
      db.markBotLeftGroup(chatId);
      return {
        status: 400,
        body: {
          error: `Telegram confirmed Roxie is no longer in this chat (${leaveRes.description}). Local state synchronized to "Bot Left".`,
          code: 'ALREADY_NOT_MEMBER',
          botLeft: true
        }
      };
    }

    return {
      status: 502,
      body: {
        error: `Telegram API rejected leave request: ${leaveRes.description || 'leaveChat returned failure'}`,
        code: 'LEAVE_FAILED'
      }
    };
  }

  // 5. Telegram confirmed the bot has left!
  db.markBotLeftGroup(chatId);

  db.logAction({
    id: Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
    chatId,
    groupId: chatId,
    actorRole: 'DASHBOARD_ADMIN',
    adminUsername: 'dashboard_admin',
    command: 'leave_group',
    action: 'leave_group',
    result: 'success',
    details: `Roxie successfully verified and left group ${chatId} via Telegram leaveChat`
  });

    return {
      status: 200,
      body: {
        success: true,
        message: 'Roxie has successfully verified and left the group on Telegram.'
      }
    };
  } finally {
    inFlightLeaveOperations.delete(chatId);
  }
}

// Authoritative Operator Session Verification Helper
export function verifyOperatorAuth(req: any, requiredRole: 'VIEWER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN' = 'MODERATOR'): {
  authorized: boolean;
  status: number;
  error?: string;
  session?: any;
  operatorUsername: string;
} {
  // 1. Check HTTP-only Cookie 'roxie_session'
  let sessionId: string | undefined;
  if (req.headers?.cookie) {
    const cookies = authManager.parseCookies(req.headers.cookie);
    if (cookies['roxie_session']) {
      sessionId = cookies['roxie_session'];
    }
  }

  // 2. Check x-session-id Header
  if (!sessionId && req.headers?.['x-session-id']) {
    sessionId = req.headers['x-session-id'] as string;
  }

  // 3. Check Authorization Bearer Header
  const authHeader = req.headers?.authorization;
  if (!sessionId && authHeader && authHeader.startsWith('Bearer ')) {
    sessionId = authHeader.substring(7).trim();
  }

  // 4. Check body / query fallback
  if (!sessionId && req.body?.sessionId) {
    sessionId = req.body.sessionId;
  }
  if (!sessionId && req.query?.sessionId) {
    sessionId = req.query.sessionId as string;
  }

  if (sessionId) {
    const session = authManager.getSession(sessionId);
    if (!session) {
      return { authorized: false, status: 401, error: 'Unauthorized: Invalid or expired operator session.', operatorUsername: 'unknown' };
    }
    const roleHierarchy = { 'VIEWER': 1, 'MODERATOR': 2, 'ADMIN': 3, 'SUPER_ADMIN': 4 };
    const userRoleVal = roleHierarchy[session.role as keyof typeof roleHierarchy] || 0;
    const reqRoleVal = roleHierarchy[requiredRole];
    if (userRoleVal < reqRoleVal) {
      return { authorized: false, status: 403, error: `Forbidden: Requires ${requiredRole} role or higher.`, operatorUsername: session.username };
    }
    return { authorized: true, status: 200, session, operatorUsername: session.username };
  }

  // Allow automated test execution in test environments
  if (process.env.NODE_ENV === 'test' || process.env.ROXIE_TEST_MODE === 'true') {
    return {
      authorized: true,
      status: 200,
      session: { username: 'dashboard_admin', role: 'SUPER_ADMIN' },
      operatorUsername: 'dashboard_admin'
    };
  }

  return {
    authorized: false,
    status: 401,
    error: 'Unauthorized: Operator session required.',
    operatorUsername: 'unknown'
  };
}

const recentClientRequestIds = new Map<string, { status: number; body: any }>();

// Exported workflow for Direct Message / Reply-To-User with Authoritative Validation
export async function executeSendMessageWorkflow(
  targetId: number | string,
  message: string,
  replyToMessageId?: number,
  operatorUsername: string = 'dashboard_admin',
  sessionId?: string,
  clientRequestId?: string
): Promise<{
  status: number;
  body: {
    success?: boolean;
    messageId?: number;
    replyToMessageId?: number | null;
    error?: string;
    code?: string;
    message?: string;
    deduplicated?: boolean;
  };
}> {
  // 0. Idempotency Check
  if (clientRequestId && recentClientRequestIds.has(clientRequestId)) {
    const cached = recentClientRequestIds.get(clientRequestId)!;
    return {
      status: cached.status,
      body: { ...cached.body, deduplicated: true }
    };
  }

  // 1. Validate Operator Authorization
  if (sessionId) {
    const session = authManager.getSession(sessionId);
    if (!session) {
      return {
        status: 401,
        body: { error: 'Unauthorized: Invalid or expired operator session.', code: 'UNAUTHORIZED' }
      };
    }
    if (session.role === 'VIEWER') {
      return {
        status: 403,
        body: { error: 'Forbidden: Operator lacks permission to send messages (Requires MODERATOR or higher).', code: 'FORBIDDEN' }
      };
    }
    operatorUsername = session.username;
  }

  // 2. Validate Message Content
  if (!message || typeof message !== 'string' || !message.trim()) {
    return {
      status: 400,
      body: { error: 'Message text cannot be empty.', code: 'EMPTY_MESSAGE' }
    };
  }
  const trimmedText = message.trim();

  // 3. Validate Target Chat ID
  const numTargetId = Number(targetId);
  if (!targetId || isNaN(numTargetId) || numTargetId === 0) {
    return {
      status: 400,
      body: { error: 'Invalid target chat ID.', code: 'INVALID_CHAT_ID' }
    };
  }

  // 4. Validate Group Status (for group chats)
  if (numTargetId < 0) {
    const settings = db.getGroupSettings(numTargetId);
    if (settings.botLeft) {
      return {
        status: 400,
        body: {
          error: 'Cannot send message: Roxie has already left this group (Bot Left).',
          code: 'BOT_LEFT'
        }
      };
    }
    if (settings.unavailable) {
      return {
        status: 404,
        body: {
          error: 'Cannot send message: This group is unavailable or deleted on Telegram.',
          code: 'GROUP_UNAVAILABLE'
        }
      };
    }
  }

  // 5. Validate Reply Target (if replyToMessageId provided)
  if (replyToMessageId !== undefined && replyToMessageId !== null) {
    const numReplyId = Number(replyToMessageId);
    if (isNaN(numReplyId) || !Number.isInteger(numReplyId) || numReplyId <= 0) {
      return {
        status: 400,
        body: {
          error: 'Invalid reply message ID: Must be a positive integer.',
          code: 'INVALID_REPLY_ID'
        }
      };
    }

    // Strict Group Isolation Check:
    // Verify that the replyToMessageId does NOT belong to a different group!
    if (numTargetId < 0) {
      const otherGId = db.isMessageInOtherGroup(numReplyId, numTargetId);
      if (otherGId !== null) {
        return {
          status: 400,
          body: {
            error: `Cross-group reply injection rejected: Original message belongs to group ${otherGId}, not ${numTargetId}.`,
            code: 'CROSS_GROUP_REPLY_REJECTED'
          }
        };
      }
    }
  }

  // 6. Send via Telegram Bot API
  let tgRes: any;
  try {
    tgRes = await telegramApi.sendMessage(numTargetId, trimmedText, {
      reply_to_message_id: replyToMessageId,
      reply_parameters: replyToMessageId ? { message_id: replyToMessageId } : undefined,
      parse_mode: 'HTML'
    });
  } catch (err: any) {
    return {
      status: 502,
      body: {
        error: `Telegram API network failure: ${err.message}`,
        code: 'TELEGRAM_NETWORK_ERROR'
      }
    };
  }

  if (!tgRes.ok) {
    const desc = tgRes.description || '';
    const lower = desc.toLowerCase();
    if (lower.includes('message to be replied not found') || lower.includes('reply') || lower.includes('message not found')) {
      return {
        status: 400,
        body: {
          error: 'Telegram rejected the reply. The original message may no longer be available.',
          code: 'REPLY_TARGET_NOT_FOUND'
        }
      };
    }
    return {
      status: 502,
      body: {
        error: `Telegram failed to send message: ${desc || 'Unknown error'}`,
        code: 'TELEGRAM_SEND_FAILED'
      }
    };
  }

  const outgoingMsgId = tgRes.result?.message_id;

  // 7. Store the delivered message in conversation memory
  if (numTargetId < 0) {
    const orig = replyToMessageId
      ? db.getGroupMemory(numTargetId).find(m => m.messageId === replyToMessageId)
      : undefined;

    db.addGroupConversationEntry(numTargetId, {
      role: 'assistant',
      name: 'Roxie',
      displayName: 'Roxie',
      sender: 'Roxie',
      content: trimmedText,
      timestamp: Date.now(),
      messageId: outgoingMsgId,
      chatId: numTargetId,
      direction: 'outgoing',
      source: 'dashboard',
      replyToMessageId: replyToMessageId || undefined,
      replyTo: orig ? {
        messageId: orig.messageId || replyToMessageId!,
        name: orig.displayName || orig.name,
        text: orig.content
      } : (replyToMessageId ? { messageId: replyToMessageId } : undefined)
    });
  } else {
    db.addPrivateMessage(numTargetId, numTargetId, {
      role: 'assistant',
      content: trimmedText,
      timestamp: Date.now(),
      direction: 'out'
    });
  }

  // 8. Record Audit Log
  db.logAction({
    id: Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toISOString(),
    chatId: numTargetId,
    groupId: numTargetId,
    actorRole: 'DASHBOARD_ADMIN',
    adminUsername: operatorUsername,
    command: 'send_message',
    action: 'send_message',
    result: 'success',
    details: replyToMessageId
      ? `Sent reply as Roxie to message ${replyToMessageId} in group ${numTargetId}`
      : `Sent direct message as Roxie to ${numTargetId < 0 ? 'group' : 'chat'} ${numTargetId}`
  });

    const responsePayload = {
      status: 200,
      body: {
        success: true,
        messageId: outgoingMsgId,
        replyToMessageId: replyToMessageId || null,
        message: replyToMessageId ? 'Reply sent as Roxie' : 'Message sent as Roxie'
      }
    };

    if (clientRequestId) {
      recentClientRequestIds.set(clientRequestId, responsePayload);
      setTimeout(() => recentClientRequestIds.delete(clientRequestId), 10_000);
    }

    return responsePayload;
  }

export async function startServer() {
  console.log('[Roxie Startup] Initializing Express application...');
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  console.log(`[Roxie Startup] Target port resolved: ${PORT}`);

  try {
    const startupResult = DisasterRecoveryService.startupRecovery();
    console.log('[Roxie Startup] Storage & recovery check complete:', startupResult.status);
  } catch (recErr: any) {
    console.warn('[Roxie Startup] Recovery notice:', recErr.message);
  }

  app.use(express.json({ limit: '10mb' }));
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
      return res.status(413).json({
        ok: false,
        error: 'Backup file is too large. Maximum allowed size is 10 MB.',
        code: 'PAYLOAD_TOO_LARGE'
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid JSON payload received.',
        code: 'INVALID_JSON'
      });
    }
    next(err);
  });
  app.use(enterpriseRouter);
  app.use(phase8Router);
  app.use('/api/tma', tmaRouter);

  // Health check route as requested
  app.get('/health', (req, res) => {
    console.log('The server is running on this port');
    res.json({ status: 'healthy', port: PORT });
  });

  // Health check
  app.get('/api/health', (req, res) => {
    try {
      const health = HealthDiagnosticsService.getSystemHealth();
      res.json(health);
    } catch (err: any) {
      res.status(500).json({ status: 'ERROR', error: err.message });
    }
  });

  // Global Dashboard API Route Protection Middleware
  app.use('/api', (req, res, next) => {
    // Whitelist public endpoints
    const publicPrefixes = [
      '/auth/login',
      '/auth/session',
      '/auth/logout',
      '/health',
      '/commands',
      '/telegram/status',
      '/tma'
    ];

    if (publicPrefixes.some(p => req.path === p || req.path.startsWith(p + '/'))) {
      return next();
    }

    // Allow automated test executions in test environment
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

  // API Route: Check Telegram Bot status safely (never exposes token)
  app.get('/api/telegram/status', (req, res) => {
    try {
      const status = telegramBot.getStatus();
      res.json(status);
    } catch (err: any) {
      console.error('Error getting Telegram status:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Test Telegram Bot connection via getMe
  app.post('/api/telegram/test-connection', async (req, res) => {
    try {
      const result = await telegramBot.testConnection();
      if (result.success) {
        // If polling wasn't running, start it now
        telegramBot.startPolling().catch(() => {});
        return res.json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (err: any) {
      console.error('Error testing Telegram connection:', err);
      return res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Explicitly trigger / restart polling
  app.post('/api/telegram/polling/start', async (req, res) => {
    try {
      await telegramBot.startPolling();
      res.json(telegramBot.getStatus());
    } catch (err: any) {
      console.error('Error starting polling:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // API Route: Get moderation audit logs
  app.get('/api/telegram/logs', (req, res) => {
    try {
      const status = telegramBot.getStatus();
      res.json(status.recentLogs || []);
    } catch (err: any) {
      console.error('Error getting logs:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  });

  // === ROXIE CONTROL CENTER BACKEND APIS ===

  // 1. Get command catalog
  app.get('/api/commands', (req, res) => {
    try {
      res.json(COMMAND_CATALOG);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Operations: Safe Dummy Data Cleanup & Real Group Protection
  app.post('/api/dashboard/operations/cleanup-dummy-data', async (req, res) => {
    try {
      const dryRun = req.body?.dryRun !== false;
      const report = await runDummyDataCleanup({ dryRun });
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Overview metrics
  const handleOverview = (req: express.Request, res: express.Response) => {
    try {
      const stats = db.getStats();
      const recentLogs = db.getRecentLogs(50);
      const groupsCount = db.getConnectedGroupCount(db.getCurrentBotId() ?? undefined);
      const privateChats = db.getPrivateChatsList();
      const totalMessagesCount = db.getTotalStoredMessagesCount();
      const activeUsersCount = Object.keys((db as any).data?.knownUsersById || {}).length;
      const globalMedia = db.getMediaLibrary();
      const totalStickersCount = Object.values(globalMedia?.stickers || {}).reduce((acc, l) => acc + (l?.length || 0), 0);

      res.json({
        stats,
        groupsCount,
        privateChatsCount: privateChats.length,
        totalMessagesCount,
        activeUsersCount,
        totalStickersCount,
        recentLogs,
        botStatus: telegramBot.getStatus(),
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.get('/api/dashboard/overview', handleOverview);

  // 3. Get all connected groups
  const handleGetGroups = (req: express.Request, res: express.Response) => {
    try {
      const groups = db.getConnectedGroups(db.getCurrentBotId() ?? undefined);
      res.json(groups);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.get('/api/groups', handleGetGroups);
  app.get('/api/dashboard/groups', handleGetGroups);

  // 4. Get comprehensive details for a specific group
  const handleGetGroupDetail = async (req: express.Request, res: express.Response) => {
    try {
      const chatId = Number(req.params.chatId);
      const settings = db.getGroupSettings(chatId);
      const logs = db.getGroupLogs(chatId, 100);
      const schedules = db.getGroupSchedules(chatId);
      const notes = db.getAllNotes(chatId);
      const approvedUsers = db.getApprovedUsers(chatId);
      const freedUsers = db.getFreedUsers(chatId);
      const locks = db.getLocks(chatId);
      const filters = db.getFilters(chatId);
      const linksWhitelist = db.getLinkWhitelist(chatId);
      const storedMessages = db.getGroupMemory(chatId);

      const bans = logs.filter(l => l.action === 'ban' || l.action === 'auto_ban');
      const kicks = logs.filter(l => l.action === 'kick');
      const mutes = logs.filter(l => l.action === 'mute');
      const reports = logs.filter(l => l.action === 'report');

      const autoRespElig = db.checkAutoResponseEligibility(chatId);
      const autoStkElig = db.checkAutoStickerEligibility(chatId);

      const isLeft = Boolean(settings.botLeft);
      const isUnavailable = Boolean(settings.unavailable);
      let status = 'Active';
      let botRole = 'Administrator';

      if (isUnavailable) {
        status = 'Unavailable';
        botRole = 'Unavailable';
      } else if (isLeft) {
        status = 'Bot Left';
        botRole = 'Left';
      }

      res.json({
        chatId,
        chatTitle: settings.chatTitle || `Group ${chatId}`,
        settings,
        autoEngine: settings.autoEngine,
        autoEngineMessageNextSeconds: autoRespElig.remainingSeconds || 0,
        autoEngineStickerNextSeconds: autoStkElig.remainingSeconds || 0,
        autoResponseNextAvailableSeconds: autoRespElig.remainingSeconds || 0,
        autoStickerNextAvailableSeconds: autoStkElig.remainingSeconds || 0,
        locks,
        filters,
        linksWhitelist,
        bans,
        kicks,
        mutes,
        reports,
        schedules,
        notes,
        approvedUsers,
        freedUsers,
        storedMessages,
        logs,
        status,
        botRole,
        botLeft: isLeft,
        unavailable: isUnavailable,
        unavailableReason: settings.unavailableReason
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.get('/api/groups/:chatId', handleGetGroupDetail);
  app.get('/api/dashboard/groups/:chatId', handleGetGroupDetail);

  // 5. Stored group messages
  app.get('/api/dashboard/groups/:chatId/messages', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const search = (req.query.search as string || '').toLowerCase();
      let messages = db.getGroupMemory(chatId);
      if (search) {
        messages = messages.filter(m =>
          (m.content && m.content.toLowerCase().includes(search)) ||
          (m.name && m.name.toLowerCase().includes(search))
        );
      }
      res.json({ chatId, total: messages.length, messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5B. Telegram Media Proxy for Dashboard Previews (Server-Side Token Protected)
  app.get('/api/telegram/file/:fileId', async (req, res) => {
    try {
      const fileId = req.params.fileId;
      if (!fileId || typeof fileId !== 'string' || fileId.length < 5) {
        return res.status(400).json({ error: 'Invalid file_id' });
      }

      const fileRes = await telegramApi.getFile(fileId);
      if (!fileRes.ok || !fileRes.result?.file_path) {
        return res.status(fileRes.error_code || 404).json({
          error: fileRes.description || 'Telegram file not found'
        });
      }

      const filePath = fileRes.result.file_path;
      const downloadUrl = telegramApi.getFileDownloadUrl(filePath);
      if (!downloadUrl) {
        return res.status(500).json({ error: 'Telegram Bot Token not configured on server' });
      }

      const tgRes = await fetch(downloadUrl);
      if (!tgRes.ok) {
        return res.status(tgRes.status).json({ error: `Telegram CDN returned ${tgRes.statusText}` });
      }

      let contentType = 'application/octet-stream';
      const lower = filePath.toLowerCase();
      if (lower.endsWith('.webp')) {
        contentType = 'image/webp';
      } else if (lower.endsWith('.webm')) {
        contentType = 'video/webm';
      } else if (lower.endsWith('.tgs')) {
        contentType = 'application/gzip';
      } else if (lower.endsWith('.png')) {
        contentType = 'image/png';
      } else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
        contentType = 'image/jpeg';
      } else if (lower.endsWith('.mp4')) {
        contentType = 'video/mp4';
      } else {
        contentType = tgRes.headers.get('content-type') || 'application/octet-stream';
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

      const arrayBuffer = await tgRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Internal proxy error' });
    }
  });

  // 6. Real Telegram moderators for a group
  app.get('/api/dashboard/groups/:chatId/moderators', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      let admins: any[] = [];
      let source = 'telegram';

      try {
        const tgRes = await telegramApi.getChatAdministrators(chatId);
        if (tgRes.ok && Array.isArray(tgRes.result)) {
          admins = tgRes.result.map(adm => ({
            userId: adm.user.id,
            user: adm.user,
            username: adm.user.username,
            name: adm.user.first_name + (adm.user.last_name ? ` ${adm.user.last_name}` : ''),
            status: adm.status,
            role: adm.status === 'creator' ? '👑 Owner' : '🛡️ Administrator',
            customTitle: adm.custom_title,
            permissions: {
              can_delete_messages: adm.can_delete_messages || false,
              can_restrict_members: adm.can_restrict_members || false,
              can_promote_members: adm.can_promote_members || false,
              can_change_info: adm.can_change_info || false,
              can_invite_users: adm.can_invite_users || false,
              can_pin_messages: adm.can_pin_messages || false,
              can_manage_topics: adm.can_manage_topics || false
            }
          }));
        }
      } catch (tgErr) {
        // Fallback to cached
      }

      if (admins.length === 0) {
        source = 'cached';
        const members = (db as any).data?.groupMembers || {};
        const prefix = `${chatId}_`;
        for (const [key, m] of Object.entries(members)) {
          if (key.startsWith(prefix)) {
            const member = m as any;
            const customRole = db.getCustomRole(chatId, member.userId);
            if (customRole === 'MODERATOR' || member.customRole === 'MODERATOR') {
              admins.push({
                userId: member.userId,
                username: member.username,
                name: member.firstName + (member.lastName ? ` ${member.lastName}` : ''),
                status: 'administrator',
                role: '🔧 Moderator',
                permissions: {
                  can_delete_messages: true,
                  can_restrict_members: true,
                  can_promote_members: false,
                  can_change_info: false,
                  can_invite_users: true,
                  can_pin_messages: true,
                  can_manage_topics: true
                }
              });
            }
          }
        }
      }

      res.json({ chatId, source, administrators: admins, admins });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Group stickers & packs
  app.get('/api/dashboard/groups/:chatId/stickers', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const summary = db.getGroupPacksSummary(chatId);
      const lib = db.getMediaLibrary(chatId);
      const packs = db.getGroupStickerPacks(chatId);
      res.json({
        chatId,
        summary,
        packs,
        customStickers: lib.stickers || {},
        lustStickers: lib.lustStickers || {},
        metadata: lib.stickerMetadata || {}
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7b. Add Telegram Sticker Pack to Group
  app.post('/api/dashboard/groups/:chatId/stickers/packs', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const rawInput = (req.body.packNameOrUrl || req.body.name || '').trim();
      if (!rawInput) {
        return res.status(400).json({ error: 'Sticker pack name or URL is required' });
      }

      const cleanPackName = rawInput
        .replace(/^https?:\/\/t\.me\/addstickers\//i, '')
        .replace(/^t\.me\/addstickers\//i, '')
        .replace(/[<>]/g, '')
        .trim();

      if (!cleanPackName) {
        return res.status(400).json({ error: 'Invalid sticker pack identifier' });
      }

      // Check if pack already exists in group configuration
      const existingPacks = db.getGroupStickerPacks(chatId);
      const alreadyExisting = existingPacks.find(p => p.name.toLowerCase() === cleanPackName.toLowerCase());
      if (alreadyExisting) {
        return res.json({
          ok: true,
          pack: alreadyExisting,
          alreadyExisted: true,
          message: `Sticker pack "${cleanPackName}" is already registered in this group.`
        });
      }

      // Query Telegram getStickerSet API
      const setRes = await telegramApi.getStickerSet(cleanPackName);
      if (!setRes.ok || !setRes.result) {
        return res.status(400).json({
          error: setRes.description || `Sticker pack "${cleanPackName}" not found on Telegram`
        });
      }

      const tgSet = setRes.result;
      const title = tgSet.title || tgSet.name || cleanPackName;
      const now = new Date().toISOString();

      const stickers = (tgSet.stickers || []).map((s: any) => ({
        fileId: s.file_id,
        emoji: s.emoji || '✨'
      }));

      // Import each sticker into group media library
      for (const s of (tgSet.stickers || [])) {
        db.addStickerToLibrary('playful', s.file_id, {
          chatId,
          packName: cleanPackName,
          packTitle: title,
          fileId: s.file_id,
          emoji: s.emoji || '✨',
          mood: 'playful',
          source: 'custom',
          addedAt: now
        }, chatId);
      }

      // Register pack in group settings
      const packConfig = {
        name: cleanPackName,
        title,
        enabled: req.body.enabled !== false,
        stickerCount: stickers.length,
        stickers,
        addedBy: 'dashboard_admin',
        addedAt: now
      };
      const savedPack = db.addGroupStickerPack(chatId, packConfig);

      // Audit Log
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: now,
        chatId,
        chatTitle: db.getGroupSettings(chatId).chatTitle || `Group ${chatId}`,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'add_sticker_pack',
        action: 'sticker_pack_add',
        result: 'success',
        details: `Added sticker pack "${title}" (${cleanPackName}) with ${stickers.length} stickers to Group ${chatId}`
      });

      res.json({ success: true, pack: savedPack });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7c. Get single pack preview/details
  app.get('/api/dashboard/groups/:chatId/stickers/packs/:packName', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const packName = req.params.packName.toLowerCase().trim();
      const packs = db.getGroupStickerPacks(chatId);
      const pack = packs.find(p => p.name.toLowerCase() === packName);
      if (!pack) {
        return res.status(404).json({ error: `Sticker pack "${packName}" not configured for this group` });
      }
      res.json({ success: true, pack });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7d. Toggle Enable / Disable Sticker Pack
  app.patch('/api/dashboard/groups/:chatId/stickers/packs/:packName', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const packName = req.params.packName.trim();
      const enabled = req.body.enabled !== false;
      const updated = db.updateGroupStickerPack(chatId, packName, { enabled });
      if (!updated) {
        return res.status(404).json({ error: `Sticker pack "${packName}" not found in group configuration` });
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        chatTitle: db.getGroupSettings(chatId).chatTitle || `Group ${chatId}`,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: enabled ? 'enable_sticker_pack' : 'disable_sticker_pack',
        action: 'sticker_pack_toggle',
        result: 'success',
        details: `${enabled ? 'Enabled' : 'Disabled'} sticker pack "${packName}" in Group ${chatId}`
      });

      res.json({ success: true, pack: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7e. Remove Sticker Pack from Group Configuration
  app.delete('/api/dashboard/groups/:chatId/stickers/packs/:packName', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const packName = req.params.packName.trim();
      const removedCount = db.removeGroupStickerPack(chatId, packName);

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        chatTitle: db.getGroupSettings(chatId).chatTitle || `Group ${chatId}`,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'remove_sticker_pack',
        action: 'sticker_pack_remove',
        result: 'success',
        details: `Removed sticker pack "${packName}" (${removedCount} stickers purged) from Group ${chatId}`
      });

      res.json({ success: true, removedCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Group Settings: Get and Update
  app.get('/api/dashboard/groups/:chatId/settings', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const settings = db.getGroupSettings(chatId);
      const autoRespElig = db.checkAutoResponseEligibility(chatId);
      const autoStkElig = db.checkAutoStickerEligibility(chatId);

      res.json({
        ...settings,
        autoResponseNextAvailableSeconds: autoRespElig.remainingSeconds || 0,
        autoStickerNextAvailableSeconds: autoStkElig.remainingSeconds || 0
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const handleUpdateGroupSettings = (req: express.Request, res: express.Response) => {
    try {
      const chatId = Number(req.params.chatId);
      const updates = req.body;
      if (updates && typeof updates === 'object') {
        if (updates.autoAcceptJoin !== undefined && updates.autoAcceptEnabled === undefined) {
          updates.autoAcceptEnabled = updates.autoAcceptJoin;
        }
        delete updates.autoAcceptJoin;
        if (updates.autoAcceptEnabled !== undefined && typeof updates.autoAcceptEnabled !== 'boolean') {
          const strVal = String(updates.autoAcceptEnabled).trim().toLowerCase();
          updates.autoAcceptEnabled = ['true', 'on', '1', 'yes', 'enabled', 'enable'].includes(strVal);
        }
      }
      const prevSettings = db.getGroupSettings(chatId);

      // Validate autoResponse configuration if provided
      if (updates.autoResponse) {
        const ar = updates.autoResponse;
        if (ar.cooldownSeconds !== undefined) {
          const cd = Number(ar.cooldownSeconds);
          if (isNaN(cd) || !isFinite(cd) || cd < 10 || cd > 86400) {
            return res.status(400).json({
              error: 'Invalid cooldown: Cooldown must be a valid number between 10 seconds and 86400 seconds (24 hours).'
            });
          }
        }
        if (ar.minSeconds !== undefined || ar.maxSeconds !== undefined) {
          const min = ar.minSeconds !== undefined ? Number(ar.minSeconds) : (prevSettings.autoResponse?.minSeconds ?? 30);
          const max = ar.maxSeconds !== undefined ? Number(ar.maxSeconds) : (prevSettings.autoResponse?.maxSeconds ?? 120);
          if (isNaN(min) || !isFinite(min) || isNaN(max) || !isFinite(max) || min < 10 || max > 86400 || min > max) {
            return res.status(400).json({
              error: 'Invalid random interval: Minimum cooldown must be >= 10s, Maximum <= 86400s, and Minimum cannot exceed Maximum.'
            });
          }
        }
      }

      // Validate autoSticker configuration if provided
      if (updates.autoSticker) {
        const as = updates.autoSticker;
        if (as.cooldownSeconds !== undefined) {
          const cd = Number(as.cooldownSeconds);
          if (isNaN(cd) || !isFinite(cd) || cd < 10 || cd > 86400) {
            return res.status(400).json({
              error: 'Invalid cooldown: Cooldown must be a valid number between 10 seconds and 86400 seconds (24 hours).'
            });
          }
        }
        if (as.minSeconds !== undefined || as.maxSeconds !== undefined) {
          const min = as.minSeconds !== undefined ? Number(as.minSeconds) : (prevSettings.autoSticker?.minSeconds ?? 60);
          const max = as.maxSeconds !== undefined ? Number(as.maxSeconds) : (prevSettings.autoSticker?.maxSeconds ?? 300);
          if (isNaN(min) || !isFinite(min) || isNaN(max) || !isFinite(max) || min < 10 || max > 86400 || min > max) {
            return res.status(400).json({
              error: 'Invalid random interval: Minimum cooldown must be >= 10s, Maximum <= 86400s, and Minimum cannot exceed Maximum.'
            });
          }
        }
      }

      // Validate rich message configurations if provided in general settings update
      if (updates.groupWelcome !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(updates.groupWelcome, 'Welcome {user} to {chat}!', prevSettings.groupWelcome);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid groupWelcome configuration' });
        }
        updates.groupWelcome = check.config;
      }
      if (updates.groupGoodbye !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(updates.groupGoodbye, 'Goodbye {user}!', prevSettings.groupGoodbye);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid groupGoodbye configuration' });
        }
        updates.groupGoodbye = check.config;
      }
      if (updates.welcomeDm !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(updates.welcomeDm, 'You joined {groupname} 🎉', prevSettings.welcomeDm);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid welcomeDm configuration' });
        }
        updates.welcomeDm = check.config;
      }

      const clientTimestamp = updates._clientTimestamp ? Number(updates._clientTimestamp) : undefined;
      if (clientTimestamp && db.isStaleSettingsUpdate(chatId, clientTimestamp)) {
        return res.json({
          ...prevSettings,
          stale: true,
          message: 'Settings update ignored because a newer configuration was already applied.'
        });
      }

      if (clientTimestamp) {
        db.recordSettingsTimestamp(chatId, clientTimestamp);
      }

      const updated = db.updateGroupSettings(chatId, updates);

      // Check if updates produced no actual state changes (idempotent request)
      if (updated === prevSettings) {
        return res.json({ ...updated, unchanged: true });
      }

      // Detail specific frequency changes in audit log
      let changeSummary = Object.keys(updates).filter(k => !k.startsWith('_')).join(', ');
      if (updates.autoResponse) {
        changeSummary = `autoResponse (mode: ${updates.autoResponse.mode || prevSettings.autoResponse?.mode}, cd: ${updates.autoResponse.cooldownSeconds ?? prevSettings.autoResponse?.cooldownSeconds}s)`;
      } else if (updates.autoSticker) {
        changeSummary = `autoSticker (mode: ${updates.autoSticker.mode || prevSettings.autoSticker?.mode}, cd: ${updates.autoSticker.cooldownSeconds ?? prevSettings.autoSticker?.cooldownSeconds}s)`;
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        chatTitle: updated.chatTitle || `Group ${chatId}`,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'dashboard_settings',
        action: 'setting_change',
        result: 'success',
        details: `Updated settings: ${changeSummary}`
      });

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };
  app.patch('/api/dashboard/groups/:chatId/settings', handleUpdateGroupSettings);
  app.put('/api/groups/:chatId/settings', handleUpdateGroupSettings);

  interface RichMessageValidationResult {
    valid: boolean;
    config?: RichMessageConfig;
    error?: string;
    status?: number;
  }

  // Helper to validate and normalize rich message configurations with existing configuration preservation
  function validateAndNormalizeRichMessageConfig(
    body: any,
    defaultText: string,
    existingConfig?: RichMessageConfig
  ): RichMessageValidationResult {
    if (!body || typeof body !== 'object') {
      return {
        valid: true,
        config: existingConfig || { enabled: false, mode: 'simple', contentType: 'text', text: defaultText }
      };
    }

    const enabled = body.enabled !== undefined ? Boolean(body.enabled) : (existingConfig?.enabled ?? false);
    const mode: MessageMode = body.mode !== undefined
      ? (body.mode === 'rich' ? 'rich' : 'simple')
      : (existingConfig?.mode ?? (body.buttons && body.buttons.length > 0 ? 'rich' : 'simple'));

    const contentType: PostContentType = body.contentType || existingConfig?.contentType || 'text';
    const validTypes: PostContentType[] = ['text', 'photo', 'video', 'animation', 'document'];
    if (!validTypes.includes(contentType)) {
      return { valid: false, error: `Unsupported content type: ${contentType}`, status: 400 };
    }

    const rawText = typeof body.text === 'string'
      ? body.text.trim()
      : (body.text === undefined && existingConfig?.text !== undefined ? existingConfig.text : '');
    const maxTextLen = contentType === 'text' ? 4096 : 1024;
    if (rawText.length > maxTextLen) {
      return { valid: false, error: `Text/caption exceeds maximum length (${rawText.length}/${maxTextLen} characters).`, status: 400 };
    }

    const text = rawText || existingConfig?.text || defaultText;
    let normalizedMediaId: string | undefined = existingConfig?.mediaFileId;
    let mediaUploadId: string | undefined = existingConfig?.mediaUploadId;

    if (contentType !== 'text') {
      if (body.mediaFileId !== undefined || body.mediaUploadId !== undefined) {
        const uploadCandidate = body.mediaUploadId ||
          (body.mediaFileId?.startsWith('upl_') ? body.mediaFileId : (body.mediaFileId?.startsWith('upload:') ? body.mediaFileId.substring(7) : undefined));

        if (uploadCandidate) {
          const item = mediaUploadStore.getMedia(uploadCandidate);
          if (!item) {
            return { valid: false, error: `Uploaded media file (${uploadCandidate}) has expired or is invalid. Please re-upload the file.`, status: 400 };
          }
          mediaUploadId = item.id;
          normalizedMediaId = `upload:${item.id}`;
        } else if (body.mediaFileId) {
          const mediaCheck = validateMediaReference(body.mediaFileId);
          if (!mediaCheck.valid) {
            return { valid: false, error: mediaCheck.error || `Invalid media reference for ${contentType} message.`, status: 400 };
          }
          normalizedMediaId = mediaCheck.normalized;
          mediaUploadId = undefined;
        } else {
          return { valid: false, error: `Media reference is required for ${contentType} message.`, status: 400 };
        }
      } else if (!normalizedMediaId) {
        return { valid: false, error: `Media reference is required for ${contentType} message.`, status: 400 };
      }
    } else {
      if (body.contentType === 'text') {
        normalizedMediaId = undefined;
        mediaUploadId = undefined;
      }
    }

    const sanitizedButtons = body.buttons !== undefined
      ? sanitizeInlineButtons(body.buttons)
      : (existingConfig?.buttons ? sanitizeInlineButtons(existingConfig.buttons) : []);

    const fallbackEnabled = body.fallbackEnabled !== undefined
      ? Boolean(body.fallbackEnabled)
      : (existingConfig?.fallbackEnabled !== undefined ? Boolean(existingConfig.fallbackEnabled) : false);
    const fallbackText = typeof body.fallbackText === 'string'
      ? body.fallbackText.trim()
      : (body.fallbackText === undefined && existingConfig?.fallbackText !== undefined ? existingConfig.fallbackText : undefined);
    const fallbackButtonText = typeof body.fallbackButtonText === 'string'
      ? body.fallbackButtonText.trim()
      : (body.fallbackButtonText === undefined && existingConfig?.fallbackButtonText !== undefined ? existingConfig.fallbackButtonText : undefined);

    let triggerMode: WelcomeDmTriggerMode = 'normal_join';
    if (body.triggerMode === 'normal_join' || body.triggerMode === 'join_request' || body.triggerMode === 'both') {
      triggerMode = body.triggerMode;
    } else if (existingConfig?.triggerMode === 'normal_join' || existingConfig?.triggerMode === 'join_request' || existingConfig?.triggerMode === 'both') {
      triggerMode = existingConfig.triggerMode;
    } else {
      triggerMode = 'normal_join';
    }

    return {
      valid: true,
      config: {
        enabled,
        mode,
        contentType,
        text,
        mediaFileId: normalizedMediaId,
        mediaUploadId,
        buttons: sanitizedButtons,
        fallbackEnabled,
        fallbackText,
        fallbackButtonText,
        triggerMode
      }
    };
  }

  // 8b. Unified Group Welcome, Group Goodbye & Welcome Private DM APIs
  app.get('/api/dashboard/groups/:chatId/welcome-goodbye', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const chatId = Number(req.params.chatId);
      if (!chatId || isNaN(chatId)) {
        return res.status(400).json({ error: 'Valid target chatId is required.' });
      }

      const settings = db.getGroupSettings(chatId);
      const groupWelcome: RichMessageConfig = settings.groupWelcome || {
        enabled: Boolean(settings.welcomeEnabled),
        mode: 'simple',
        contentType: 'text',
        text: settings.welcomeMessage || 'Welcome {user} to {chat}!'
      };
      const groupGoodbye: RichMessageConfig = settings.groupGoodbye || {
        enabled: Boolean(settings.goodbyeEnabled),
        mode: 'simple',
        contentType: 'text',
        text: settings.goodbyeMessage || 'Goodbye {user}!'
      };
      const welcomeDm: RichMessageConfig = settings.welcomeDm || {
        enabled: false,
        mode: 'simple',
        contentType: 'text',
        text: 'You joined {groupname} 🎉'
      };

      res.json({
        chatId,
        chatTitle: settings.chatTitle || `Group ${chatId}`,
        settings,
        groupWelcome,
        groupGoodbye,
        welcomeDm
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const handleUpdateWelcomeGoodbye = async (req: express.Request, res: express.Response) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const chatId = Number(req.params.chatId);
      if (!chatId || isNaN(chatId)) {
        return res.status(400).json({ error: 'Valid target chatId is required.' });
      }

      const settings = db.getGroupSettings(chatId);
      const body = req.body || {};
      const updatesToApply: Partial<GroupSettings> = {};

      if (body.groupWelcome !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(body.groupWelcome, 'Welcome {user} to {chat}!', settings.groupWelcome);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid groupWelcome configuration' });
        }
        updatesToApply.groupWelcome = check.config;
      }

      if (body.groupGoodbye !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(body.groupGoodbye, 'Goodbye {user}!', settings.groupGoodbye);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid groupGoodbye configuration' });
        }
        updatesToApply.groupGoodbye = check.config;
      }

      if (body.welcomeDm !== undefined) {
        const check = validateAndNormalizeRichMessageConfig(body.welcomeDm, 'You joined {groupname} 🎉', settings.welcomeDm);
        if (!check.valid || !check.config) {
          return res.status(check.status || 400).json({ error: check.error || 'Invalid welcomeDm configuration' });
        }
        updatesToApply.welcomeDm = check.config;
      }

      // If updating only single root fields directly on body (e.g. legacy welcome-dm payload or direct partial update)
      if (body.groupWelcome === undefined && body.groupGoodbye === undefined && body.welcomeDm === undefined) {
        if (body.contentType !== undefined || body.text !== undefined || body.enabled !== undefined || body.buttons !== undefined || body.mode !== undefined || body.mediaFileId !== undefined) {
          const check = validateAndNormalizeRichMessageConfig(body, 'You joined {groupname} 🎉', settings.welcomeDm);
          if (!check.valid || !check.config) {
            return res.status(check.status || 400).json({ error: check.error || 'Invalid welcomeDm configuration' });
          }
          updatesToApply.welcomeDm = check.config;
        }
      }

      const updated = db.updateGroupSettings(chatId, updatesToApply);

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        chatTitle: updated.chatTitle || `Group ${chatId}`,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'welcome_goodbye_config',
        action: 'setting_change',
        result: 'success',
        details: `Updated Welcome & Goodbye settings for group ${chatId}`
      });

      res.json({
        success: true,
        chatId,
        settings: updated,
        groupWelcome: updated.groupWelcome,
        groupGoodbye: updated.groupGoodbye,
        welcomeDm: updated.welcomeDm
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.put('/api/dashboard/groups/:chatId/welcome-goodbye', handleUpdateWelcomeGoodbye);
  app.post('/api/dashboard/groups/:chatId/welcome-goodbye', handleUpdateWelcomeGoodbye);

  // Test endpoint for Welcome, Goodbye, or Welcome DM
  app.post('/api/dashboard/groups/:chatId/welcome-goodbye/test', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const chatId = Number(req.params.chatId);
      if (!chatId || isNaN(chatId)) {
        return res.status(400).json({ error: 'Valid target chatId is required.' });
      }

      const settings = db.getGroupSettings(chatId);
      const chatTitle = settings.chatTitle || `Group ${chatId}`;
      const target = (req.body?.target || 'welcomeDm') as 'groupWelcome' | 'groupGoodbye' | 'welcomeDm';

      let configToTest: RichMessageConfig;
      let defaultText = 'Welcome {user} to {chat}!';

      if (target === 'groupGoodbye') {
        defaultText = 'Goodbye {user}!';
        configToTest = req.body?.groupGoodbye || req.body?.config || settings.groupGoodbye || {
          enabled: true,
          mode: 'simple',
          contentType: 'text',
          text: defaultText
        };
      } else if (target === 'groupWelcome') {
        defaultText = 'Welcome {user} to {chat}!';
        configToTest = req.body?.groupWelcome || req.body?.config || settings.groupWelcome || {
          enabled: true,
          mode: 'simple',
          contentType: 'text',
          text: defaultText
        };
      } else {
        defaultText = 'You joined {groupname} 🎉';
        configToTest = req.body?.welcomeDm || req.body?.config || settings.welcomeDm || {
          enabled: true,
          mode: 'simple',
          contentType: 'text',
          text: defaultText
        };
      }

      const rawTargetUserId = req.body?.targetUserId || req.query?.targetUserId || process.env.ADMIN_USER_ID || process.env.TELEGRAM_ADMIN_ID;
      const numTargetUserId = Number(rawTargetUserId) || 123456789;

      if (target === 'welcomeDm') {
        if (!numTargetUserId || isNaN(numTargetUserId) || numTargetUserId <= 0) {
          return res.status(400).json({
            error: 'Cannot send test DM: A valid recipient Telegram User ID is required. Please enter your Telegram user ID or configure ADMIN_USER_ID.',
            code: 'USER_ID_REQUIRED'
          });
        }
      }

      const mockUser: TelegramUser = {
        id: numTargetUserId,
        is_bot: false,
        first_name: req.body?.firstName || 'Operator',
        last_name: req.body?.lastName || '',
        username: req.body?.username || auth.operatorUsername || 'admin'
      };

      const rawText = configToTest.text !== undefined ? configToTest.text : defaultText;
      const formattedText = ModerationService.formatRichMessageText(rawText, mockUser, chatTitle, chatId);
      const formattedButtons = configToTest.mode === 'rich' || (configToTest.buttons && configToTest.buttons.length > 0)
        ? ModerationService.formatRichMessageButtons(configToTest.buttons, mockUser, chatTitle, chatId)
        : undefined;

      let normalizedMediaId = configToTest.mediaFileId;
      let mediaUploadId = configToTest.mediaUploadId;

      if (configToTest.contentType && configToTest.contentType !== 'text') {
        const uploadCandidate = mediaUploadId ||
          (normalizedMediaId?.startsWith('upl_') ? normalizedMediaId : (normalizedMediaId?.startsWith('upload:') ? normalizedMediaId.substring(7) : undefined));

        if (uploadCandidate) {
          const item = mediaUploadStore.getMedia(uploadCandidate);
          if (!item) {
            return res.status(400).json({ error: `Uploaded media file (${uploadCandidate}) has expired or is invalid.` });
          }
          mediaUploadId = item.id;
          normalizedMediaId = `upload:${item.id}`;
        } else if (normalizedMediaId) {
          const mediaCheck = validateMediaReference(normalizedMediaId);
          if (!mediaCheck.valid) {
            return res.status(400).json({ error: mediaCheck.error || `Invalid media reference.` });
          }
          normalizedMediaId = mediaCheck.normalized;
        }
      }

      const payload: PostPayload = {
        contentType: configToTest.contentType || 'text',
        text: formattedText,
        mediaFileId: normalizedMediaId,
        mediaUploadId,
        buttons: formattedButtons
      };

      const destinationChatId = target === 'welcomeDm' ? numTargetUserId : chatId;
      const sendRes = await PostSender.send(destinationChatId, payload);

      if (!sendRes.ok) {
        return res.status(502).json({
          success: false,
          error: `Telegram delivery failed: ${sendRes.error || 'Delivery rejected by Telegram.'}`,
          details: sendRes.error
        });
      }

      db.addLog({
        chatId,
        chatTitle,
        targetUserId: target === 'welcomeDm' ? numTargetUserId : undefined,
        adminUsername: auth.operatorUsername,
        action: 'send_message',
        details: `Sent Test ${target} message to ${destinationChatId} for group ${chatTitle} (Telegram msg #${sendRes.messageId || 'unknown'})`
      });

      res.json({
        success: true,
        messageId: sendRes.messageId,
        chatId: destinationChatId,
        target,
        message: `Test ${target} successfully delivered to ${target === 'welcomeDm' ? `Telegram user ID ${numTargetUserId}` : `Group ${chatTitle}`}!`
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Backward compatibility alias endpoints for Welcome DM
  app.get('/api/dashboard/groups/:chatId/welcome-dm', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (!chatId || isNaN(chatId)) return res.status(400).json({ error: 'Valid target chatId is required.' });
      const settings = db.getGroupSettings(chatId);
      res.json({
        chatId,
        chatTitle: settings.chatTitle || `Group ${chatId}`,
        settings,
        welcomeDm: settings.welcomeDm || { enabled: false, mode: 'simple', contentType: 'text', text: 'You joined {groupname} 🎉' }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/dashboard/groups/:chatId/welcome-dm', handleUpdateWelcomeGoodbye);
  app.post('/api/dashboard/groups/:chatId/welcome-dm', handleUpdateWelcomeGoodbye);
  app.post('/api/dashboard/groups/:chatId/welcome-dm/test', async (req, res) => {
    (req.body as any).target = 'welcomeDm';
    return (app as any)._router.handle({ ...req, url: `/api/dashboard/groups/${req.params.chatId}/welcome-goodbye/test` }, res, () => {});
  });

  // 9. Inspect and modify Telegram permissions
  app.get('/api/dashboard/groups/:chatId/permissions', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const meRes = await telegramApi.getMe();
      const botId = meRes.ok && meRes.result ? meRes.result.id : 0;
      let botMember: any = null;

      const [memberRes, cRes] = await Promise.all([
        botId ? telegramApi.getChatMember(chatId, botId).catch(() => ({ ok: false })) : Promise.resolve({ ok: false }),
        telegramApi.getChat(chatId).catch(() => ({ ok: false }))
      ]);

      if (memberRes && (memberRes as any).ok) botMember = (memberRes as any).result;
      const chatInfo = cRes && (cRes as any).ok ? (cRes as any).result : null;

      res.json({
        chatId,
        botUser: meRes.result || null,
        roxieRole: botMember?.status === 'creator' ? '👑 Owner' : botMember?.status === 'administrator' ? '🛡️ Administrator' : '👤 Member',
        roxiePermissions: {
          can_delete_messages: botMember?.can_delete_messages ?? true,
          can_restrict_members: botMember?.can_restrict_members ?? true,
          can_promote_members: botMember?.can_promote_members ?? false,
          can_change_info: botMember?.can_change_info ?? true,
          can_invite_users: botMember?.can_invite_users ?? true,
          can_pin_messages: botMember?.can_pin_messages ?? true,
          can_manage_topics: botMember?.can_manage_topics ?? true
        },
        defaultMemberPermissions: chatInfo?.permissions || {
          can_send_messages: true,
          can_send_media_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/dashboard/groups/:chatId/permissions', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const { target, permissions, targetUserId } = req.body;

      if (target === 'default_members') {
        const tgRes = await telegramApi.setChatPermissions(chatId, permissions);
        if (!tgRes.ok) {
          return res.status(400).json({
            ok: false,
            error: tgRes.description || 'Telegram rejected default member permission update'
          });
        }
        db.logAction({
          id: Math.random().toString(36).slice(2, 9),
          timestamp: new Date().toISOString(),
          chatId,
          groupId: chatId,
          actorRole: 'DASHBOARD_ADMIN',
          adminUsername: 'dashboard_admin',
          command: 'setChatPermissions',
          action: 'permissions',
          result: 'success',
          details: `Updated default member permissions`
        });
        return res.json({ ok: true, result: true });
      }

      const meRes = await telegramApi.getMe();
      const botId = meRes.ok && meRes.result ? meRes.result.id : 0;
      const targetId = targetUserId || botId;

      const tgRes = await telegramApi.promoteChatMember(chatId, targetId, permissions);
      if (!tgRes.ok) {
        return res.status(400).json({
          ok: false,
          error: tgRes.description || 'Telegram rejected administrator permission update'
        });
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'promoteChatMember',
        action: 'permissions',
        result: 'success',
        details: `Updated admin permissions for ID ${targetId}`
      });

      res.json({ ok: true, result: true });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // 10. Leave Group Workflow with Authoritative Verification & Stale Chat Handling
  app.post('/api/dashboard/groups/:chatId/leave', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const { confirmation } = req.body;
      const result = await executeLeaveGroupWorkflow(chatId, confirmation);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10-remove. Remove Group from Dashboard Listing (Scoped to Current Bot)
  const handleDeleteGroupFromDashboard = async (req: express.Request, res: express.Response) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId) || chatId >= 0) {
        return res.status(400).json({ error: 'Invalid group chatId', code: 'INVALID_CHAT_ID' });
      }

      const currentBotId = db.getCurrentBotId();
      if (!currentBotId) {
        return res.status(503).json({ error: 'No active bot identity configured', code: 'NO_ACTIVE_BOT' });
      }

      const existingSettings = db.getGroupSettings(chatId);
      if (existingSettings && existingSettings.botId !== undefined && existingSettings.botId !== currentBotId) {
        return res.status(403).json({
          error: 'Cannot remove group: Group belongs to another bot instance',
          code: 'FORBIDDEN'
        });
      }

      const removed = db.removeGroupFromDashboard(chatId, currentBotId);

      if (mongoManager.getStatus().isConnected) {
        await MongoStorageService.deleteGroup(chatId, currentBotId);
      }

      if (!removed) {
        return res.status(404).json({
          error: 'Group not found for the active bot',
          code: 'NOT_FOUND'
        });
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: (req as any).operator?.username || 'dashboard_admin',
        command: 'remove_group_from_dashboard',
        action: 'remove_group_from_dashboard',
        result: 'success',
        details: `Removed group ${chatId} from dashboard listing for bot ${currentBotId}`
      });

      return res.json({
        success: true,
        message: 'Group successfully removed from dashboard',
        chatId
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
  };
  app.delete('/api/dashboard/groups/:chatId', handleDeleteGroupFromDashboard);

  // 10a. Group Data Export
  app.get('/api/dashboard/groups/:chatId/export', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) {
        return res.status(400).json({ error: 'Invalid group chatId' });
      }
      const data = db.getGroupExportData(chatId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="group_${chatId}.json"`);
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10b. Group Storage Status
  app.get('/api/dashboard/groups/:chatId/storage-status', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) {
        return res.status(400).json({ error: 'Invalid group chatId' });
      }
      const status = db.getGroupStorageStatus(chatId);
      return res.json(status);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10c. Central Persistence Health Check
  app.get('/api/dashboard/storage/health', (req, res) => {
    try {
      const health = db.getPersistenceHealth();
      return res.json(health);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 11. Private Chats (DMs)
  app.get('/api/dashboard/private-chats', (req, res) => {
    try {
      const chats = db.getPrivateChatsList();
      res.json(chats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/dashboard/private-chats/:chatId/messages', (req, res) => {
    try {
      const chatId = req.params.chatId;
      const messages = db.getPrivateChatMessages(chatId);
      res.json({ chatId, messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. Send Message to Group or Private Chat (with Reply-to-User support)
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
      const result = await executeSendMessageWorkflow(targetId, text, replyToMessageId, operator, sessionId, clientRequestId);
      res.status(result.status).json(result.body);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const activeBroadcastLocks = new Set<string>();
  const recentBroadcastResults = new Map<string, any>();

  // 13. Broadcast announcement to multiple groups
  app.post('/api/dashboard/broadcast', async (req, res) => {
    const auth = verifyOperatorAuth(req, 'MODERATOR');
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
    }

    const broadcastId = (req.body.broadcastId || req.body.operationId || '').trim();
    if (broadcastId) {
      if (activeBroadcastLocks.has(broadcastId)) {
        return res.status(409).json({ error: 'A broadcast with this operation ID is already in progress.', code: 'BROADCAST_IN_PROGRESS' });
      }
      if (recentBroadcastResults.has(broadcastId)) {
        return res.json({ ...recentBroadcastResults.get(broadcastId), deduplicated: true });
      }
      activeBroadcastLocks.add(broadcastId);
    }

    try {
      const { groupIds, message } = req.body;
      if (!Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ error: 'At least one group ID must be selected.' });
      }
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message content cannot be empty.' });
      }

      const successful: number[] = [];
      const failed: Array<{ groupId: number; error: string }> = [];

      for (const gId of groupIds) {
        try {
          const sendRes = await telegramApi.sendMessage(gId, message.trim(), { parse_mode: 'HTML' });
          if (sendRes.ok) {
            successful.push(gId);
            db.addGroupConversationEntry(gId, {
              role: 'assistant',
              name: 'Roxie',
              content: message.trim(),
              timestamp: Date.now()
            });
          } else {
            failed.push({ groupId: gId, error: sendRes.description || 'Unknown Telegram error' });
          }
        } catch (itemErr: any) {
          failed.push({ groupId: gId, error: itemErr.message || 'Failed' });
        }
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId: groupIds[0] || 0,
        groupId: groupIds[0] || 0,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername || 'dashboard_admin',
        command: 'broadcast',
        action: 'broadcast',
        result: failed.length === 0 ? 'success' : 'denied',
        details: `Broadcast: ${successful.length} sent, ${failed.length} failed`
      });

      const responsePayload = {
        total: groupIds.length,
        sent: successful.length,
        failed: failed.length,
        successful,
        errors: failed
      };

      if (broadcastId) {
        recentBroadcastResults.set(broadcastId, responsePayload);
        setTimeout(() => recentBroadcastResults.delete(broadcastId), 30_000);
      }

      res.json(responsePayload);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (broadcastId) {
        activeBroadcastLocks.delete(broadcastId);
      }
    }
  });

  // Helper function to parse incoming media files (supports JSON base64, multipart form-data, and raw streams)
  async function parseIncomingMediaFile(req: express.Request): Promise<{ buffer: Buffer; filename: string; mimeType: string } | { error: string; status: number }> {
    const contentTypeHeader = (req.headers['content-type'] || '').toLowerCase();

    // 1. JSON payload with base64 data
    if (req.body && typeof req.body === 'object' && (req.body.data || req.body.fileBase64 || req.body.base64 || req.body.file)) {
      const rawData = String(req.body.data || req.body.fileBase64 || req.body.base64 || req.body.file);
      const filename = req.body.filename || req.body.name || 'uploaded_media';
      let mimeType = req.body.mimeType || req.body.contentType || 'application/octet-stream';
      let base64Content = rawData;

      if (rawData.startsWith('data:')) {
        const commaIdx = rawData.indexOf(',');
        if (commaIdx !== -1) {
          const meta = rawData.substring(5, commaIdx);
          const matchMime = meta.match(/^([^;]+)/);
          if (matchMime) mimeType = matchMime[1];
          base64Content = rawData.substring(commaIdx + 1);
        }
      }

      try {
        const buffer = Buffer.from(base64Content, 'base64');
        return { buffer, filename, mimeType };
      } catch {
        return { error: 'Invalid base64 payload received', status: 400 };
      }
    }

    // 2. Stream / Buffer parsing from request body
    const chunks: Buffer[] = [];
    if (req.body && Buffer.isBuffer(req.body)) {
      chunks.push(req.body);
    } else if (typeof (req as any).on === 'function') {
      await new Promise<void>((resolve, reject) => {
        req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        req.on('end', () => resolve());
        req.on('error', err => reject(err));
      });
    }

    if (chunks.length === 0) {
      return { error: 'No media file data received in request', status: 400 };
    }

    const rawBuffer = Buffer.concat(chunks);

    // 2a. Multipart/form-data boundary parsing
    if (contentTypeHeader.includes('multipart/form-data')) {
      const boundaryMatch = req.headers['content-type']?.match(/boundary=([^;]+)/i);
      if (!boundaryMatch) {
        return { error: 'Malformed multipart form-data: missing boundary', status: 400 };
      }
      const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, '');
      const boundaryBuffer = Buffer.from(`--${boundary}`);

      let start = rawBuffer.indexOf(boundaryBuffer);
      while (start !== -1) {
        const nextBoundary = rawBuffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
        if (nextBoundary === -1) break;

        const partBuffer = rawBuffer.subarray(start + boundaryBuffer.length, nextBoundary);
        const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
        if (headerEnd !== -1) {
          const headerStr = partBuffer.subarray(0, headerEnd).toString('utf8');
          const fileContent = partBuffer.subarray(headerEnd + 4);
          // Trim trailing \r\n if present
          const cleanContent = fileContent.length >= 2 && fileContent[fileContent.length - 2] === 13 && fileContent[fileContent.length - 1] === 10
            ? fileContent.subarray(0, fileContent.length - 2)
            : fileContent;

          const dispositionMatch = headerStr.match(/Content-Disposition:\s*form-data;[^;\r\n]*;\s*filename="?([^"\r\n]+)"?/i);
          const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n;]+)/i);

          if (dispositionMatch) {
            const filename = dispositionMatch[1];
            const mimeType = mimeMatch ? mimeMatch[1].trim() : 'application/octet-stream';
            return { buffer: cleanContent, filename, mimeType };
          }
        }
        start = nextBoundary;
      }
      return { error: 'No file field found in multipart payload', status: 400 };
    }

    // 2b. Raw binary with custom headers
    const filename = (req.headers['x-filename'] as string) || (req.query.filename as string) || 'upload_file';
    const mimeType = contentTypeHeader.split(';')[0].trim() || 'application/octet-stream';
    return { buffer: rawBuffer, filename: decodeURIComponent(filename), mimeType };
  }

  // --- Dashboard Rich Post Composer APIs (Phase 4 & Local Media Upload) ---
  app.post('/api/dashboard/posts/upload-media', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const parseResult = await parseIncomingMediaFile(req);
      if ('error' in parseResult) {
        return res.status(parseResult.status).json({ error: parseResult.error });
      }

      const { buffer, filename, mimeType } = parseResult;
      const expectedType = (req.query.type as string) || (req.body?.type as string) || undefined;

      const validation = mediaUploadStore.validateFile({ buffer, filename, mimeType }, expectedType);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error || 'Invalid uploaded file' });
      }

      const storedItem = mediaUploadStore.storeMedia(buffer, filename, validation.normalizedMimeType || mimeType);

      return res.json({
        success: true,
        mediaUploadId: storedItem.id,
        filename: storedItem.filename,
        mimeType: storedItem.mimeType,
        size: storedItem.size
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Failed to process media upload' });
    }
  });

  const handleSendRichPost = async (req: express.Request, res: express.Response) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const rawChatId = req.params.chatId || req.params.userId || req.body.chatId;
      const numChatId = Number(rawChatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid target chatId or userId is required.' });
      }

      // Blocked dummy legacy destinations
      if (numChatId === -100111222333 || String(rawChatId).includes('100111222333')) {
        return res.status(400).json({ error: 'Target chatId is a blocked legacy test destination.' });
      }

      let chatTitle = `Chat ${numChatId}`;
      const isGroup = numChatId < 0;

      if (isGroup) {
        // Verify group existence in database
        const isGroupConnected = db.getConnectedGroups().some(g => g.chatId === numChatId || Number(g.chatId) === numChatId);
        if (!isGroupConnected) {
          return res.status(404).json({ error: 'Target group not found in database.' });
        }
        const groupSettings = db.getGroupSettings(numChatId);
        chatTitle = groupSettings.chatTitle || `Group ${numChatId}`;
      } else {
        const privChat = db.getPrivateChatsList().find(c => Number(c.chatId) === numChatId || Number(c.userId) === numChatId);
        chatTitle = privChat?.name || `Private User ${numChatId}`;
      }

      const payload = req.body?.payload || req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Post payload is required.' });
      }

      const contentType: PostContentType = payload.contentType || 'text';
      const validTypes: PostContentType[] = ['text', 'photo', 'video', 'animation', 'document'];
      if (!validTypes.includes(contentType)) {
        return res.status(400).json({ error: `Unsupported content type: ${contentType}` });
      }

      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      const maxTextLen = contentType === 'text' ? 4096 : 1024;
      if (text.length > maxTextLen) {
        return res.status(400).json({ error: `Text/caption exceeds maximum length (${text.length}/${maxTextLen} characters).` });
      }

      if (contentType === 'text' && !text) {
        return res.status(400).json({ error: 'Message text cannot be empty for text posts.' });
      }

      let normalizedMediaId: string | undefined = undefined;
      let mediaUploadId: string | undefined = undefined;

      if (contentType !== 'text') {
        const uploadCandidate = payload.mediaUploadId ||
          (payload.mediaFileId?.startsWith('upl_') ? payload.mediaFileId : (payload.mediaFileId?.startsWith('upload:') ? payload.mediaFileId.substring(7) : undefined));

        if (uploadCandidate) {
          const item = mediaUploadStore.getMedia(uploadCandidate);
          if (!item) {
            return res.status(400).json({ error: `Uploaded media file (${uploadCandidate}) has expired or is invalid. Please re-upload the file.` });
          }
          mediaUploadId = item.id;
          normalizedMediaId = `upload:${item.id}`;
        } else if (payload.mediaFileId) {
          const mediaCheck = validateMediaReference(payload.mediaFileId);
          if (!mediaCheck.valid) {
            return res.status(400).json({ error: mediaCheck.error || `Invalid media reference for ${contentType} posts.` });
          }
          normalizedMediaId = mediaCheck.normalized;
        } else {
          return res.status(400).json({ error: `Media reference is required for ${contentType} posts.` });
        }
      }

      const sanitizedButtons = sanitizeInlineButtons(payload.buttons);

      const postPayload: PostPayload = {
        contentType,
        text: text || undefined,
        mediaFileId: normalizedMediaId,
        mediaUploadId,
        buttons: sanitizedButtons,
        pinAfterSend: Boolean(payload.pinAfterSend),
        replyToLatest: Boolean(payload.replyToLatest),
        replyToMessageId: payload.replyToMessageId ? Number(payload.replyToMessageId) : undefined,
        protectContent: Boolean(payload.protectContent)
      };

      const sendResult = await PostSender.send(numChatId, postPayload);

      if (sendResult.ok) {
        db.addLog({
          chatId: numChatId,
          chatTitle,
          adminUsername: auth.operatorUsername,
          action: isGroup ? 'broadcast' : 'send_message',
          details: `Sent rich ${contentType.toUpperCase()} post to ${chatTitle} via Dashboard Composer (Telegram msg #${sendResult.messageId || 'unknown'})`
        });

        // Add to group or private conversation memory if messageId available
        if (sendResult.messageId) {
          if (isGroup) {
            db.addGroupConversationEntry(numChatId, {
              role: 'assistant',
              name: 'Roxie',
              displayName: 'Roxie (Dashboard Composer)',
              username: 'MissRoxie_Bot',
              content: text || `[${contentType.toUpperCase()}]`,
              timestamp: Date.now(),
              messageId: sendResult.messageId,
              chatId: numChatId,
              mediaType: contentType,
              mediaFileId: sendResult.telegramFileId || normalizedMediaId,
              direction: 'outgoing',
              source: 'dashboard',
              sender: 'Roxie'
            });
          } else {
            db.addPrivateMessage(numChatId, numChatId, {
              role: 'assistant',
              content: text || `[${contentType.toUpperCase()}]`,
              timestamp: Date.now(),
              messageId: sendResult.messageId,
              mediaType: contentType,
              mediaFileId: sendResult.telegramFileId || normalizedMediaId,
              direction: 'out'
            });
          }
        }

        return res.json({ success: true, result: sendResult });
      } else {
        return res.status(502).json({ success: false, error: sendResult.error || 'Telegram delivery failed', result: sendResult });
      }
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error in dashboard post composer' });
    }
  };

  const handleScheduleRichPost = async (req: express.Request, res: express.Response) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const rawChatId = req.params.chatId || req.params.userId || req.body.chatId;
      const numChatId = Number(rawChatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid target chatId or userId is required.' });
      }

      if (numChatId === -100111222333 || String(rawChatId).includes('100111222333')) {
        return res.status(400).json({ error: 'Target chatId is a blocked legacy test destination.' });
      }

      let chatTitle = `Chat ${numChatId}`;
      const isGroup = numChatId < 0;

      if (isGroup) {
        const isGroupConnected = db.getConnectedGroups().some(g => g.chatId === numChatId || Number(g.chatId) === numChatId);
        if (!isGroupConnected) {
          return res.status(404).json({ error: 'Target group not found in database.' });
        }
        const groupSettings = db.getGroupSettings(numChatId);
        chatTitle = groupSettings.chatTitle || `Group ${numChatId}`;
      } else {
        const privChat = db.getPrivateChatsList().find(c => Number(c.chatId) === numChatId || Number(c.userId) === numChatId);
        chatTitle = privChat?.name || `Private User ${numChatId}`;
      }

      const { payload, nextRun, timezone, name } = req.body;
      const postPayload = payload || req.body;
      if (!postPayload || typeof postPayload !== 'object') {
        return res.status(400).json({ error: 'Post payload is required.' });
      }

      const contentType: PostContentType = postPayload.contentType || 'text';
      const validTypes: PostContentType[] = ['text', 'photo', 'video', 'animation', 'document'];
      if (!validTypes.includes(contentType)) {
        return res.status(400).json({ error: `Unsupported content type: ${contentType}` });
      }

      const text = typeof postPayload.text === 'string' ? postPayload.text.trim() : '';
      const maxTextLen = contentType === 'text' ? 4096 : 1024;
      if (text.length > maxTextLen) {
        return res.status(400).json({ error: `Text/caption exceeds maximum length (${text.length}/${maxTextLen} characters).` });
      }

      if (contentType === 'text' && !text) {
        return res.status(400).json({ error: 'Message text cannot be empty for text posts.' });
      }

      let scheduledMediaId: string | undefined = undefined;
      if (contentType !== 'text') {
        const isLocalUpload = Boolean(
          postPayload.mediaUploadId ||
          (postPayload.mediaFileId && (
            postPayload.mediaFileId.startsWith('upl_') ||
            postPayload.mediaFileId.startsWith('upload:') ||
            postPayload.mediaFileId.startsWith('blob:') ||
            postPayload.mediaFileId.startsWith('data:') ||
            postPayload.mediaFileId.startsWith('local_preview_')
          ))
        );

        if (isLocalUpload) {
          return res.status(400).json({
            error: 'Local media cannot be scheduled on the current hosting setup. Use a Telegram file_id or public HTTPS media URL for scheduled posts.'
          });
        }

        const mediaCheck = validateMediaReference(postPayload.mediaFileId);
        if (!mediaCheck.valid) {
          return res.status(400).json({ error: mediaCheck.error || `Invalid media reference for ${contentType} posts.` });
        }
        scheduledMediaId = mediaCheck.normalized;
      }

      if (!nextRun || isNaN(new Date(nextRun).getTime())) {
        return res.status(400).json({ error: 'Valid nextRun ISO date/time string is required.' });
      }

      const targetNextRunTime = new Date(nextRun).getTime();
      if (targetNextRunTime <= Date.now()) {
        return res.status(400).json({ error: 'Scheduled execution time must be in the future.' });
      }

      const sanitizedButtons = sanitizeInlineButtons(postPayload.buttons);

      const rawTrigger = typeof req.body.triggerKeyword === 'string' ? req.body.triggerKeyword.trim() : undefined;
      if (rawTrigger && rawTrigger.length > 200) {
        return res.status(400).json({ error: 'Trigger keyword/phrase must not exceed 200 characters.' });
      }
      const triggerKeyword = rawTrigger && rawTrigger.length > 0 ? normalizeTriggerKeyword(rawTrigger) : undefined;

      const scheduleRecord = db.addSchedule({
        chatId: numChatId,
        chatTitle,
        name: name || (text.slice(0, 30) || `Rich ${contentType.toUpperCase()} Schedule`),
        message: text || `[${contentType.toUpperCase()}]`,
        messageText: text,
        scheduleType: 'one_time',
        nextRun: new Date(nextRun).toISOString(),
        timezone: timezone || 'UTC',
        contentType,
        mediaFileId: scheduledMediaId,
        replyToMessageId: postPayload.replyToMessageId ? Number(postPayload.replyToMessageId) : undefined,
        replyToLatest: Boolean(postPayload.replyToLatest),
        autoDeletePrevious: Boolean(postPayload.autoDeletePrevious),
        pinAfterSend: Boolean(postPayload.pinAfterSend),
        inlineKeyboard: sanitizedButtons,
        enabled: true,
        triggerKeyword,
        adminUsername: auth.operatorUsername,
        lastStatus: 'pending'
      });

      db.addLog({
        chatId: numChatId,
        chatTitle,
        adminUsername: auth.operatorUsername,
        action: 'schedule_created',
        details: `Scheduled rich ${contentType.toUpperCase()} post [${scheduleRecord.id}] to ${chatTitle} via Dashboard Composer for ${scheduleRecord.nextRun}`
      });

      return res.json({ success: true, schedule: scheduleRecord });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error in dashboard post scheduler' });
    }
  };

  // Mount Composer endpoints for standalone, group-locked, and private-locked views
  app.post('/api/dashboard/posts/send', handleSendRichPost);
  app.post('/api/dashboard/groups/:chatId/rich-post/send', handleSendRichPost);
  app.post('/api/dashboard/private/:userId/rich-post/send', handleSendRichPost);

  app.post('/api/dashboard/posts/schedule', handleScheduleRichPost);
  app.post('/api/dashboard/groups/:chatId/rich-post/schedule', handleScheduleRichPost);
  app.post('/api/dashboard/private/:userId/rich-post/schedule', handleScheduleRichPost);

  // --- Admin-Only Mention All (@all) Dashboard APIs ---
  const handleMentionAllStart = async (req: express.Request, res: express.Response) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const rawChatId = req.params.chatId || req.body?.chatId;
      const numChatId = Number(rawChatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid target group chatId is required.' });
      }

      if (numChatId >= 0) {
        return res.status(400).json({ error: 'Mention All can only be run in group chats (negative chatId).' });
      }

      const isGroupConnected = db.getConnectedGroups().some(g => g.chatId === numChatId || Number(g.chatId) === numChatId);
      if (!isGroupConnected) {
        return res.status(404).json({ error: 'Target group not found in database.' });
      }

      const groupSettings = db.getGroupSettings(numChatId);
      const chatTitle = groupSettings.chatTitle || `Group ${numChatId}`;

      type MentionContentType = 'text' | 'photo' | 'video' | 'animation' | 'document';
      const rawContentType = req.body?.contentType || 'text';
      const validTypes: MentionContentType[] = ['text', 'photo', 'video', 'animation', 'document'];
      if (!validTypes.includes(rawContentType as MentionContentType)) {
        return res.status(400).json({ error: `Unsupported content type: ${rawContentType}` });
      }
      const contentType = rawContentType as MentionContentType;

      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      const maxTextLen = contentType === 'text' ? 3500 : 700;
      if (text.length > maxTextLen) {
        return res.status(400).json({
          error: `Text/caption exceeds allowed limit for Mention All (${text.length}/${maxTextLen} characters to preserve room for Telegram mentions).`
        });
      }

      let normalizedMediaId: string | undefined = undefined;
      let mediaUploadId: string | undefined = undefined;

      if (contentType !== 'text') {
        const uploadCandidate = req.body?.mediaUploadId ||
          (req.body?.mediaFileId?.startsWith('upl_') ? req.body.mediaFileId : (req.body?.mediaFileId?.startsWith('upload:') ? req.body.mediaFileId.substring(7) : undefined));

        if (uploadCandidate) {
          const item = mediaUploadStore.getMedia(uploadCandidate);
          if (!item) {
            return res.status(400).json({ error: `Uploaded media file (${uploadCandidate}) has expired or is invalid. Please re-upload the file.` });
          }
          mediaUploadId = item.id;
          normalizedMediaId = `upload:${item.id}`;
        } else if (req.body?.mediaFileId) {
          const mediaCheck = validateMediaReference(req.body.mediaFileId);
          if (!mediaCheck.valid) {
            return res.status(400).json({ error: mediaCheck.error || `Invalid media reference for ${contentType} broadcast.` });
          }
          normalizedMediaId = mediaCheck.normalized;
        } else {
          return res.status(400).json({ error: `Media reference is required for ${contentType} broadcast.` });
        }
      }

      const actor = {
        actorUserId: auth.session?.userId,
        actorUsername: auth.session?.username || auth.operatorUsername,
        actorDisplayName: auth.session?.displayName || auth.session?.username || auth.operatorUsername || 'Dashboard Admin'
      };

      const startRes = await mentionAllService.startOperation({
        chatId: numChatId,
        chatTitle,
        actor,
        source: 'dashboard',
        messageText: text,
        media: {
          contentType,
          mediaUploadId,
          mediaFileId: normalizedMediaId
        },
        awaitWorker: process.env.NODE_ENV === 'test'
      });

      if (!startRes.ok) {
        if (startRes.status === 'already_running') {
          return res.status(409).json({
            ok: false,
            status: 'already_running',
            error: 'An /all broadcast is already in progress for this group. Please wait for it to complete.'
          });
        }
        if (startRes.status === 'no_members') {
          return res.status(400).json({
            ok: false,
            status: 'no_members',
            error: 'No eligible group members found to mention.'
          });
        }
        return res.status(400).json({
          ok: false,
          status: startRes.status,
          error: startRes.error || 'Failed to start Mention All operation.'
        });
      }

      return res.json({
        ok: true,
        status: 'running',
        operation: {
          operationId: startRes.operation?.operationId,
          chatId: startRes.operation?.chatId,
          source: startRes.operation?.source,
          contentType: startRes.operation?.contentType,
          totalBatches: startRes.operation?.totalBatches,
          mentionsCount: startRes.operation?.mentionsCount,
          startedAt: startRes.operation?.startedAt
        }
      });
    } catch (err: any) {
      console.error('[API] /api/dashboard/mention-all/start error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  const handleMentionAllStop = async (req: express.Request, res: express.Response) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const rawChatId = req.params.chatId || req.body?.chatId;
      const numChatId = Number(rawChatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid target group chatId is required.' });
      }

      const stopRes = await mentionAllService.stopOperation(numChatId, {
        userId: auth.session?.userId,
        username: auth.session?.username || auth.operatorUsername,
        displayName: auth.session?.displayName || auth.session?.username || auth.operatorUsername || 'Dashboard Admin'
      });

      if (!stopRes.ok) {
        if (stopRes.status === 'not_running') {
          return res.status(404).json({
            ok: false,
            status: 'not_running',
            message: stopRes.message
          });
        }
        if (stopRes.status === 'already_stopping') {
          return res.status(409).json({
            ok: false,
            status: 'already_stopping',
            message: stopRes.message,
            sentBatches: stopRes.sentBatches,
            totalBatches: stopRes.totalBatches
          });
        }
        return res.status(400).json({ ok: false, error: stopRes.message });
      }

      return res.json({
        ok: true,
        status: 'stopped',
        message: stopRes.message,
        sentBatches: stopRes.sentBatches,
        totalBatches: stopRes.totalBatches
      });
    } catch (err: any) {
      console.error('[API] /api/dashboard/mention-all/stop error:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  app.post('/api/dashboard/mention-all/start', handleMentionAllStart);
  app.post('/api/dashboard/groups/:chatId/mention-all/start', handleMentionAllStart);

  app.post('/api/dashboard/mention-all/stop', handleMentionAllStop);
  app.post('/api/dashboard/groups/:chatId/mention-all/stop', handleMentionAllStop);

  app.get('/api/dashboard/mention-all/status/:chatId', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const numChatId = Number(req.params.chatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid group chatId is required.' });
      }

      const status = mentionAllService.getOperationStatus(numChatId);
      const mtprotoHealth = mtprotoParticipantService.getHealthReport();
      return res.json({ ...status, mtprotoHealth });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.get('/api/dashboard/mtproto/status', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const health = mtprotoParticipantService.getHealthReport();
      return res.json({ ok: true, health });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  app.get('/api/dashboard/mention-all/active', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const activeList = mentionAllService.getActiveOperationsList();
      return res.json({ activeOperations: activeList });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // --- Scheduled Messages & Rules Dashboard APIs ---
  app.get('/api/dashboard/schedules', (req, res) => {
    try {
      const chatIdParam = req.query.chatId as string;
      if (chatIdParam) {
        const chatId = Number(chatIdParam);
        const schedules = db.getGroupSchedules(chatId);
        return res.json({ schedules });
      }
      const schedules = db.getAllSchedules();
      res.json({ schedules });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function sanitizeDashboardInlineKeyboard(rawKeyboard: any): ScheduledPostButton[][] | undefined {
    return sanitizeInlineButtons(rawKeyboard);
  }

  app.post('/api/dashboard/schedules', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const {
        chatId, message, messageText, name, scheduleType,
        intervalMs, intervalFormatted, nextRun, timezone,
        contentType, mediaFileId, replyToMessageId, enabled,
        autoDeletePrevious, pinAfterSend, inlineKeyboard, replyToLatest
      } = req.body;
      const numChatId = Number(chatId);
      if (!numChatId || isNaN(numChatId)) {
        return res.status(400).json({ error: 'Valid target chatId is required.' });
      }

      // Hard safety blocker for dummy test targets
      if (numChatId === -100111222333 || String(chatId).includes('100111222333')) {
        return res.status(400).json({ error: 'Target chatId is a blocked legacy test destination.' });
      }

      const text = (messageText || message || '').trim();
      if (!text && !mediaFileId) {
        return res.status(400).json({ error: 'Message text or media is required for schedule.' });
      }

      const rawTrigger = typeof req.body.triggerKeyword === 'string' ? req.body.triggerKeyword.trim() : undefined;
      if (rawTrigger && rawTrigger.length > 200) {
        return res.status(400).json({ error: 'Trigger keyword/phrase must not exceed 200 characters.' });
      }
      const triggerKeyword = rawTrigger && rawTrigger.length > 0 ? normalizeTriggerKeyword(rawTrigger) : undefined;

      const resolvedScheduleType = scheduleType || 'interval';
      let resolvedIntervalMs = intervalMs ? Number(intervalMs) : undefined;
      let resolvedIntervalFormatted = intervalFormatted || undefined;
      if (resolvedScheduleType === 'daily') {
        resolvedIntervalMs = resolvedIntervalMs || 86400000;
        resolvedIntervalFormatted = resolvedIntervalFormatted || '1 day';
      } else if (resolvedScheduleType === 'one_time') {
        resolvedIntervalMs = undefined;
        resolvedIntervalFormatted = undefined;
      }

      const newSchedule = db.addSchedule({
        chatId: numChatId,
        chatTitle: req.body.chatTitle || `Chat ${numChatId}`,
        name: name || (text.slice(0, 30) || 'Scheduled Message'),
        message: text,
        messageText: text,
        scheduleType: resolvedScheduleType,
        intervalMs: resolvedIntervalMs,
        intervalFormatted: resolvedIntervalFormatted,
        nextRun: nextRun || new Date(Date.now() + 60000).toISOString(),
        timezone: timezone || 'UTC',
        contentType: contentType || 'text',
        mediaFileId: mediaFileId || undefined,
        replyToMessageId: replyToMessageId ? Number(replyToMessageId) : undefined,
        replyToLatest: Boolean(replyToLatest),
        autoDeletePrevious: Boolean(autoDeletePrevious),
        pinAfterSend: Boolean(pinAfterSend),
        inlineKeyboard: sanitizeDashboardInlineKeyboard(inlineKeyboard),
        enabled: enabled !== false,
        triggerKeyword,
        adminUsername: auth.operatorUsername || 'dashboard_admin',
        lastStatus: 'pending'
      });

      res.json({ success: true, schedule: newSchedule });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/dashboard/schedules/:id', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const id = req.params.id;
      if (!id || id === 'undefined' || id === 'null') {
        return res.status(400).json({ error: 'Valid schedule ID is required.' });
      }

      const existing = db.getScheduleById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Schedule not found.' });
      }

      const updates = { ...req.body };
      if (updates.chatId && (Number(updates.chatId) === -100111222333 || String(updates.chatId).includes('100111222333'))) {
        return res.status(400).json({ error: 'Target chatId is a blocked legacy test destination.' });
      }

      if ('chatId' in updates) {
        const numChatId = Number(updates.chatId);
        if (!numChatId || isNaN(numChatId)) {
          return res.status(400).json({ error: 'Valid target chatId is required.' });
        }
        updates.chatId = numChatId;
      }

      if ('message' in updates || 'messageText' in updates || 'mediaFileId' in updates || 'contentType' in updates) {
        const text = (updates.messageText !== undefined ? updates.messageText : (updates.message !== undefined ? updates.message : existing.message || '')).trim();
        const media = updates.mediaFileId !== undefined
          ? (typeof updates.mediaFileId === 'string' && updates.mediaFileId.trim() ? updates.mediaFileId.trim() : undefined)
          : existing.mediaFileId;
        if (!text && !media) {
          return res.status(400).json({ error: 'Message text or media is required for schedule.' });
        }
        updates.message = text;
        updates.messageText = text;
        if (updates.mediaFileId !== undefined || updates.contentType === 'text') {
          updates.mediaFileId = updates.contentType === 'text' ? undefined : media;
        }
      }

      if ('replyToMessageId' in updates) {
        if (updates.replyToMessageId === null || updates.replyToMessageId === false || updates.replyToMessageId === '' || updates.replyToMessageId === 0) {
          updates.replyToMessageId = undefined;
        } else {
          const numReply = Number(updates.replyToMessageId);
          updates.replyToMessageId = (!isNaN(numReply) && numReply > 0) ? numReply : undefined;
        }
      }

      if ('inlineKeyboard' in updates) {
        if (updates.inlineKeyboard === null || updates.inlineKeyboard === false || (Array.isArray(updates.inlineKeyboard) && updates.inlineKeyboard.length === 0)) {
          updates.inlineKeyboard = undefined;
        } else {
          updates.inlineKeyboard = sanitizeDashboardInlineKeyboard(updates.inlineKeyboard);
        }
      }

      if ('scheduleType' in updates) {
        if (updates.scheduleType === 'daily') {
          updates.intervalMs = updates.intervalMs || 86400000;
          updates.intervalFormatted = updates.intervalFormatted || '1 day';
        } else if (updates.scheduleType === 'one_time') {
          updates.intervalMs = undefined;
          updates.intervalFormatted = undefined;
          delete updates.intervalStr;
        }
      }

      if ('nextRun' in updates) {
        if (updates.nextRun === '' || updates.nextRun === null || updates.nextRun === undefined) {
          updates.nextRun = '';
        } else {
          const parsedDate = new Date(updates.nextRun);
          if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ error: 'Invalid nextRun date format.' });
          }
          updates.nextRun = parsedDate.toISOString();
        }
      }

      if ('intervalStr' in updates || 'intervalFormatted' in updates || 'intervalMs' in updates) {
        let intervalMs = updates.intervalMs !== undefined ? Number(updates.intervalMs) : undefined;
        let intervalFormatted = updates.intervalFormatted || updates.intervalStr;

        if ((!intervalMs || isNaN(intervalMs) || intervalMs <= 0) && typeof intervalFormatted === 'string') {
          const parsed = messageScheduler.parseInterval(intervalFormatted);
          if (parsed) {
            intervalMs = parsed.ms;
            intervalFormatted = parsed.formatted;
          }
        }

        if (intervalMs && !isNaN(intervalMs) && intervalMs > 0) {
          updates.intervalMs = intervalMs;
          if (intervalFormatted) updates.intervalFormatted = String(intervalFormatted);

          if (!('nextRun' in updates) && existing.intervalMs !== intervalMs) {
            updates.nextRun = new Date(Date.now() + intervalMs).toISOString();
          }
        }
      }
      if (updates.pinAfterSend !== undefined) {
        updates.pinAfterSend = Boolean(updates.pinAfterSend);
      }
      if (updates.replyToLatest !== undefined) {
        updates.replyToLatest = Boolean(updates.replyToLatest);
      }
      if (updates.autoDeletePrevious !== undefined) {
        updates.autoDeletePrevious = Boolean(updates.autoDeletePrevious);
      }
      if (updates.enabled !== undefined) {
        updates.enabled = Boolean(updates.enabled);
      }
      if ('triggerKeyword' in updates) {
        if (typeof updates.triggerKeyword === 'string') {
          const trimmed = updates.triggerKeyword.trim();
          if (trimmed.length > 200) {
            return res.status(400).json({ error: 'Trigger keyword/phrase must not exceed 200 characters.' });
          }
          const normalized = normalizeTriggerKeyword(trimmed);
          updates.triggerKeyword = normalized && normalized.length > 0 ? normalized : undefined;
        } else if (updates.triggerKeyword === null || updates.triggerKeyword === false || updates.triggerKeyword === '') {
          updates.triggerKeyword = undefined;
        }
      }
      if ('pendingDeleteMessageIds' in updates) {
        if (Array.isArray(updates.pendingDeleteMessageIds)) {
          updates.pendingDeleteMessageIds = updates.pendingDeleteMessageIds.filter((mId: any) => typeof mId === 'number' && Number.isInteger(mId) && mId > 0);
        } else {
          delete updates.pendingDeleteMessageIds;
        }
      }
      const updated = db.updateSchedule(id, updates);
      if (!updated) {
        return res.status(404).json({ error: 'Schedule not found.' });
      }
      res.json({ success: true, schedule: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/schedules/:id/toggle', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const id = req.params.id;
      const updated = db.toggleSchedule(id, req.body.enabled);
      if (!updated) {
        return res.status(404).json({ error: 'Schedule not found.' });
      }
      res.json({ success: true, schedule: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/dashboard/schedules/:id', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, code: 'UNAUTHORIZED' });
      }

      const id = req.params.id;
      const s = db.getScheduleById(id);
      if (!s) {
        return res.status(404).json({ error: 'Schedule not found.' });
      }
      const deleted = db.deleteSchedule(s.chatId, id);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Group Automations / Rules Endpoints
  app.get('/api/dashboard/groups/:chatId/automations', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const automations = db.getAutomations(chatId);
      res.json({ automations });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/automations', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const { trigger, action, parameters, enabled } = req.body;
      if (!trigger || !action) {
        return res.status(400).json({ error: 'Trigger and action are required.' });
      }
      const newAuto = {
        id: Math.random().toString(36).substring(2, 8).toUpperCase(),
        trigger,
        action,
        parameters,
        enabled: enabled !== false,
        createdBy: 0,
        createdAt: new Date().toISOString()
      };
      db.addAutomation(chatId, newAuto);
      res.json({ success: true, automation: newAuto });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/dashboard/groups/:chatId/automations/:id', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const autoId = req.params.id;
      const deleted = db.deleteAutomation(chatId, autoId);
      res.json({ success: deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/automations/:id/toggle', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const autoId = req.params.id;
      const toggled = db.toggleAutomation(chatId, autoId, req.body.enabled);
      res.json({ success: toggled });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Control Center: Global Settings ---
  app.get('/api/dashboard/control-center/global', (req, res) => {
    try {
      const settings = db.getGlobalSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/dashboard/control-center/global', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error });
      }

      const updated = db.updateGlobalSettings(req.body);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId: 0,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'update_global_settings',
        action: 'setting_change',
        result: 'success',
        details: `Updated global settings: ${Object.keys(req.body).join(', ')}`
      });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Group Abuse Words Management ---
  app.get('/api/dashboard/groups/:chatId/abuse-words', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const words = db.getAbuseWords(chatId);
      res.json({ chatId, total: words.length, words });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/abuse-words', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const { word } = req.body;
      if (!word || typeof word !== 'string' || !word.trim()) {
        return res.status(400).json({ error: 'Abuse word cannot be empty' });
      }
      const updated = db.addAbuseWord(chatId, word.trim());
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'add_abuse_word',
        action: 'setting_change',
        result: 'success',
        details: `Added abuse word: "${word.trim()}"`
      });
      res.json({ ok: true, words: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/dashboard/groups/:chatId/abuse-words/:word', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const word = decodeURIComponent(req.params.word);
      const updated = db.removeAbuseWord(chatId, word);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'remove_abuse_word',
        action: 'setting_change',
        result: 'success',
        details: `Removed abuse word: "${word}"`
      });
      res.json({ ok: true, words: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/dashboard/groups/:chatId/abuse-words', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      db.clearAbuseWords(chatId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'clear_abuse_words',
        action: 'setting_change',
        result: 'success',
        details: `Cleared all abuse words for group ${chatId}`
      });
      res.json({ ok: true, words: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Slowmode Control ---
  app.patch('/api/dashboard/groups/:chatId/slowmode', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const seconds = Number(req.body.seconds ?? req.body.slowModeSeconds);
      if (isNaN(seconds) || seconds < 0 || seconds > 86400) {
        return res.status(400).json({ error: 'Invalid slowmode delay (must be 0 to 86400 seconds)' });
      }

      const updated = db.updateGroupSettings(chatId, { slowModeSeconds: seconds });

      let tgResult: any = null;
      try {
        tgResult = await telegramApi.setChatSlowModeDelay(chatId, seconds);
      } catch (tgErr: any) {
        tgResult = { ok: false, description: tgErr.message };
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'set_slowmode',
        action: 'setting_change',
        result: 'success',
        details: `Set slowmode delay to ${seconds}s (Telegram: ${tgResult?.ok ? 'OK' : tgResult?.description || 'Skipped'})`
      });

      res.json({ ok: true, slowModeSeconds: seconds, telegramResult: tgResult, settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Lust Mode Group Controls ---
  app.post('/api/dashboard/groups/:chatId/lust/reset-group', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      db.resetGroupLustState(chatId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'reset_group_lust',
        action: 'setting_change',
        result: 'success',
        details: `Reset group lust state and user lust levels for group ${chatId}`
      });
      res.json({ ok: true, message: 'Group lust state reset to level 0' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/lust/reset-users', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      db.resetLustLevel(chatId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'reset_users_lust',
        action: 'setting_change',
        result: 'success',
        details: `Reset all user lust levels in group ${chatId}`
      });
      res.json({ ok: true, message: 'All user lust levels reset in group' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/dashboard/groups/:chatId/lust/users', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const userLevels = db.getGroupUserLustLevels(chatId);
      res.json(userLevels);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Group Members & Moderation Actions ---
  app.get('/api/dashboard/groups/:chatId/members', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const members = db.getGroupMembers(chatId);
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/members/:userId/ban', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const userId = Number(req.params.userId);
      if (isNaN(chatId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid parameters' });
      const tgRes = await telegramApi.banChatMember(chatId, userId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        targetUserId: userId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'ban_member',
        action: 'ban',
        result: tgRes.ok ? 'success' : 'error',
        details: tgRes.ok ? `Banned user ${userId}` : `Failed to ban user ${userId}: ${tgRes.description}`
      });
      res.json(tgRes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/members/:userId/unban', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const userId = Number(req.params.userId);
      if (isNaN(chatId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid parameters' });
      const tgRes = await telegramApi.unbanChatMember(chatId, userId, true);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        targetUserId: userId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'unban_member',
        action: 'unban',
        result: tgRes.ok ? 'success' : 'error',
        details: tgRes.ok ? `Unbanned user ${userId}` : `Failed to unban user ${userId}: ${tgRes.description}`
      });
      res.json(tgRes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/members/:userId/restrict', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const userId = Number(req.params.userId);
      if (isNaN(chatId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid parameters' });
      const { permissions, untilDate } = req.body;
      const tgRes = await telegramApi.restrictChatMember(chatId, userId, permissions || {
        can_send_messages: false,
        can_send_media_messages: false,
        can_send_other_messages: false,
        can_add_web_page_previews: false
      }, { until_date: untilDate });
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        targetUserId: userId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'restrict_member',
        action: 'mute',
        result: tgRes.ok ? 'success' : 'error',
        details: tgRes.ok ? `Restricted member ${userId}` : `Failed to restrict member ${userId}: ${tgRes.description}`
      });
      res.json(tgRes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/members/:userId/promote', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'ADMIN');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const userId = Number(req.params.userId);
      if (isNaN(chatId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid parameters' });
      const permissions = req.body.permissions || {
        can_delete_messages: true,
        can_invite_users: true,
        can_restrict_members: true,
        can_pin_messages: true
      };
      const tgRes = await telegramApi.promoteChatMember(chatId, userId, permissions);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        targetUserId: userId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'promote_member',
        action: 'promote',
        result: tgRes.ok ? 'success' : 'error',
        details: tgRes.ok ? `Promoted user ${userId} to moderator` : `Telegram promote failed: ${tgRes.description}`
      });
      res.json(tgRes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/members/:userId/demote', async (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'ADMIN');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const userId = Number(req.params.userId);
      if (isNaN(chatId) || isNaN(userId)) return res.status(400).json({ error: 'Invalid parameters' });
      const tgRes = await telegramApi.promoteChatMember(chatId, userId, {
        can_change_info: false,
        can_post_messages: false,
        can_edit_messages: false,
        can_delete_messages: false,
        can_invite_users: false,
        can_restrict_members: false,
        can_pin_messages: false,
        can_promote_members: false,
        can_manage_video_chats: false,
        can_manage_chat: false,
        can_manage_topics: false
      });
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        targetUserId: userId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'demote_member',
        action: 'demote',
        result: tgRes.ok ? 'success' : 'error',
        details: tgRes.ok ? `Demoted user ${userId}` : `Telegram demote failed: ${tgRes.description}`
      });
      res.json(tgRes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Danger Zone Operations ---
  app.post('/api/dashboard/groups/:chatId/reset', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'ADMIN');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const freshSettings = db.resetGroupSettings(chatId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'reset_group_settings',
        action: 'setting_change',
        result: 'success',
        details: `Reset all settings to default for group ${chatId}`
      });
      res.json({ ok: true, settings: freshSettings });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/clear-memory', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      db.clearGroupMemory(chatId);
      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId,
        groupId: chatId,
        actorRole: auth.session?.role || 'DASHBOARD_ADMIN',
        adminUsername: auth.operatorUsername,
        command: 'clear_group_memory',
        action: 'clear',
        result: 'success',
        details: `Cleared conversation memory for group ${chatId}`
      });
      res.json({ ok: true, message: 'Group conversation memory cleared' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/clear-stickers', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const s = db.getGroupSettings(chatId);
      s.stickerPacks = {};
      db.updateGroupSettings(chatId, { stickerPacks: {} });
      res.json({ ok: true, message: 'Custom sticker packs cleared for group' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Individual Custom Sticker Control ---
  app.patch('/api/dashboard/groups/:chatId/stickers/:fileId', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const fileId = req.params.fileId;
      const success = db.updateCustomSticker(fileId, req.body, chatId);
      res.json({ ok: success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/dashboard/groups/:chatId/stickers/:fileId', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });
      const chatId = Number(req.params.chatId);
      const fileId = req.params.fileId;
      const removed = db.removeMediaFromLibrary(fileId, chatId);
      res.json({ ok: removed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Dedicated Auto-Response & Auto-Sticker update endpoints
  app.patch('/api/dashboard/groups/:chatId/auto-response', handleUpdateGroupSettings);
  app.patch('/api/dashboard/groups/:chatId/auto-sticker', handleUpdateGroupSettings);

  // 14. Sticker catalog
  app.get('/api/dashboard/stickers', (req, res) => {
    try {
      const globalLib = db.getMediaLibrary();
      const groupLibs = (db as any).data?.groupMediaLibraries || {};
      res.json({
        global: globalLib,
        groups: groupLibs
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Group Backup & Restore API Endpoints ---
  app.get('/api/dashboard/groups/:chatId/backup/export-json', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const backup = db.exportGroupFullBackup(chatId);
      const filename = `roxie_group_${Math.abs(chatId)}_backup_${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(backup);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/dashboard/groups/:chatId/backup/export-csv', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const csv = db.exportGroupCSV(chatId);
      const filename = `roxie_group_${Math.abs(chatId)}_report_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/backup/preview', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const { config, selectedSections } = req.body;
      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Invalid configuration payload' });
      }

      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength > 10 * 1024 * 1024) {
        return res.status(413).json({
          ok: false,
          error: 'Backup file is too large. Maximum allowed size is 10 MB.',
          code: 'PAYLOAD_TOO_LARGE'
        });
      }

      const diff = db.previewGroupImport(chatId, config, selectedSections);
      res.json(diff);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/backup/import', (req, res) => {
    try {
      const contentLength = Number(req.headers['content-length'] || 0);
      if (contentLength > 10 * 1024 * 1024) {
        return res.status(413).json({
          ok: false,
          error: 'Backup file is too large. Maximum allowed size is 10 MB.',
          code: 'PAYLOAD_TOO_LARGE'
        });
      }

      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const { config, selectedSections, overrideChatId } = req.body;
      if (!config || typeof config !== 'object') {
        return res.status(400).json({ error: 'Invalid configuration payload' });
      }

      const result = db.importGroupFullBackup(
        chatId,
        config,
        selectedSections,
        Boolean(overrideChatId),
        auth.operatorUsername
      );

      if (!result.ok) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/dashboard/groups/:chatId/backup/history', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'VIEWER');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const history = db.listGroupSafetyBackups(chatId);
      res.json(history);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/groups/:chatId/backup/restore-history', (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      if (isNaN(chatId)) return res.status(400).json({ error: 'Invalid group chatId' });
      const auth = verifyOperatorAuth(req, 'MODERATOR');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const { filename } = req.body;
      if (!filename || typeof filename !== 'string') {
        return res.status(400).json({ error: 'Filename is required' });
      }

      const success = db.restoreGroupSafetyBackup(chatId, filename, auth.operatorUsername);
      if (!success) {
        return res.status(400).json({ ok: false, error: 'Failed to restore safety snapshot file' });
      }

      res.json({ ok: true, message: `Successfully restored safety backup ${filename}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Bot-Wide Full Backup & Restore ---
  app.get('/api/dashboard/backup/export-all', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'ADMIN');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const backup = db.exportAllBotBackup();
      const filename = `roxie_full_bot_backup_${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(backup);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/dashboard/backup/restore-all', (req, res) => {
    try {
      const auth = verifyOperatorAuth(req, 'ADMIN');
      if (!auth.authorized) return res.status(auth.status).json({ error: auth.error });

      const { payload, selectedGroupIds } = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Invalid full bot backup payload' });
      }

      const result = db.restoreAllBotBackup(payload, selectedGroupIds, auth.operatorUsername);
      if (!result.ok) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. Activity / Audit Logs with filter
  app.get('/api/dashboard/activity', (req, res) => {
    try {
      const search = (req.query.search as string || '').toLowerCase();
      const action = req.query.action as string || 'ALL';
      const limit = Number(req.query.limit) || 100;
      let logs = db.getRecentLogs(limit);

      if (action && action !== 'ALL') {
        logs = logs.filter(l => l.action?.toLowerCase() === action.toLowerCase());
      }
      if (search) {
        logs = logs.filter(l =>
          (l.action && l.action.toLowerCase().includes(search)) ||
          (l.targetUsername && l.targetUsername.toLowerCase().includes(search)) ||
          (l.adminUsername && l.adminUsername.toLowerCase().includes(search)) ||
          (l.reason && l.reason.toLowerCase().includes(search)) ||
          (l.details && l.details.toLowerCase().includes(search)) ||
          (l.chatTitle && l.chatTitle.toLowerCase().includes(search))
        );
      }
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development vs static build in production
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));
  if (isProduction) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    try {
      const viteModule = await import('vite');
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (viteErr: any) {
      console.warn('[Roxie Server] Vite dev server failed to start, falling back to static files:', viteErr.message);
      const distPath = path.join(process.cwd(), 'dist');
      if (fs.existsSync(distPath)) {
        app.use(express.static(distPath, {
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
              res.setHeader('Pragma', 'no-cache');
              res.setHeader('Expires', '0');
            }
          }
        }));
        app.get('*', (req, res) => {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          res.sendFile(path.join(distPath, 'index.html'));
        });
      }
    }
  }

  // 1. Authenticate / Verify Telegram Bot Identity first if token is available
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    try {
      console.log('[Roxie Telegram] Verifying Telegram bot identity on startup...');
      const conn = await telegramBot.testConnection(3);
      if (conn.success && conn.bot) {
        db.setBotIdentity(conn.bot);
        console.log(`[Roxie Telegram] Bot authenticated: @${conn.bot.username || conn.bot.first_name} (ID: ${conn.bot.id})`);
      }
    } catch (botErr: any) {
      console.warn('[Roxie Telegram] Initial bot identity check notice:', botErr?.message);
    }
  }

  // 2. Connect to MongoDB Atlas if configured
  if (process.env.MONGODB_URI?.trim()) {
    try {
      console.log('[Roxie Database] Connecting to MongoDB Atlas...');
      const dbInstance = await mongoManager.connect();
      if (dbInstance) {
        await MongoStorageService.ensureIndexes();
      }
    } catch (mongoErr: any) {
      console.warn('[Roxie Database] MongoDB Atlas initial connection failed (continuing with local storage):', mongoErr?.message);
    }
  }

  // 3. Hydrate groups from MongoDB Atlas (authoritative persistent store - strictly read-only)
  if (mongoManager.getStatus().isConnected) {
    try {
      const currentBotId = db.getCurrentBotId() ?? undefined;
      console.log(`[Roxie Database] Hydrating group data from MongoDB Atlas (scoped to botId=${currentBotId ?? 'ALL'})...`);
      await db.hydrateGroupsFromMongo(currentBotId);
    } catch (hydrateErr: any) {
      console.error('[Roxie Database] MongoDB Atlas hydration failed:', hydrateErr?.message);
    }
  }

  // 4. Verify final group state established
  const finalGroups = db.getAllGroupSettings();
  const finalGroupCount = Object.keys(finalGroups).filter(k => Number(k) < 0).length;
  console.log(`[Roxie Startup] Final group state established: ${finalGroupCount} active group(s) in storage.`);

  // 5. Start HTTP server
  console.log(`[Roxie Server] Starting HTTP server on port ${PORT}...`);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Roxie Server] Listening on port ${PORT}`);
  });

  // 6. Automatically initiate bot polling and AutoEngine in background AFTER HTTP server is listening
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    console.log('[Roxie Telegram] Initializing Telegram bot subsystem...');
    telegramBot.startPolling().catch((err) => {
      console.error('[Roxie Telegram] Failed to start Telegram bot polling:', err.message);
    });
  }

  const handleShutdown = async (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown sequence...`);
    try {
      telegramBot.stopPolling();
    } catch {}
    try {
      await db.flushAll();
    } catch (err) {
      console.error('Error flushing pending storage writes:', err);
    }
    try {
      await mongoManager.close();
    } catch {}
    server.close(() => {
      console.log('HTTP server closed. Exiting cleanly.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('Force shutting down after timeout.');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

process.on('uncaughtException', (err) => {
  console.error('[Roxie Server] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Roxie Server] Unhandled Promise Rejection:', reason);
});

const isDirectExecution = Boolean(
  (typeof require !== 'undefined' && require.main === module) ||
  (process.argv[1] && (
    process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('server.js') ||
    process.argv[1].endsWith('server.cjs')
  ))
);

if (isDirectExecution && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('[Roxie Server] Fatal startup error:', err);
  });
}
