import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db/storage.js';
import { TelegramMiddleware } from '../telegram/middleware.js';
import { telegramApi } from '../telegram/api.js';

export type MiniAppFeature =
  | 'overview'
  | 'welcome_goodbye'
  | 'rich_post'
  | 'mention_all'
  | 'general'
  | 'moderation'
  | 'content_protection'
  | 'ai_conversation'
  | 'lust_mode'
  | 'stickers'
  | 'auto_engine'
  | 'slowmode'
  | 'abuse_words'
  | 'members'
  | 'moderators'
  | 'permissions'
  | 'commands'
  | 'schedules'
  | 'activity'
  | 'backup'
  | 'messages'
  | 'danger_zone';

export type MiniAppRole = 'GROUP_OWNER' | 'EXCEPTION_ADMIN' | 'GROUP_ADMIN' | 'UNAUTHORIZED';

/**
 * Authoritative Mini App Centralized Permission Matrix
 *
 * Rules:
 * 1. Group Owner:
 *    Allowed: overview, welcome_goodbye, rich_post, mention_all, general, moderation,
 *             content_protection, ai_conversation, lust_mode, stickers, auto_engine,
 *             slowmode, abuse_words, members, moderators, permissions, commands,
 *             schedules, activity, backup
 *    Denied:  messages, danger_zone
 *
 * 2. Regular Group Admin:
 *    Allowed ONLY:
 *             mention_all, general, moderation, content_protection, lust_mode,
 *             stickers, auto_engine, moderators, commands, rich_post
 *    Denied:  ALL other features!
 *
 * 3. Exception Admin:
 *    Same permissions as Group Owner, EXCEPT:
 *    Denied:  messages, danger_zone
 *
 * 4. Messages and Danger Zone:
 *    Permanently denied to ALL roles in Mini App.
 */
export const MINI_APP_PERMISSIONS: Record<MiniAppRole, Record<MiniAppFeature, boolean>> = {
  GROUP_OWNER: {
    overview: true,
    welcome_goodbye: true,
    rich_post: true,
    mention_all: true,
    general: true,
    moderation: true,
    content_protection: true,
    ai_conversation: true,
    lust_mode: true,
    stickers: true,
    auto_engine: true,
    slowmode: true,
    abuse_words: true,
    members: true,
    moderators: true,
    permissions: true,
    commands: true,
    schedules: true,
    activity: true,
    backup: true,
    messages: false,
    danger_zone: false
  },
  EXCEPTION_ADMIN: {
    overview: true,
    welcome_goodbye: true,
    rich_post: true,
    mention_all: true,
    general: true,
    moderation: true,
    content_protection: true,
    ai_conversation: true,
    lust_mode: true,
    stickers: true,
    auto_engine: true,
    slowmode: true,
    abuse_words: true,
    members: true,
    moderators: true,
    permissions: true,
    commands: true,
    schedules: true,
    activity: true,
    backup: true,
    messages: false,
    danger_zone: false
  },
  GROUP_ADMIN: {
    overview: false,
    welcome_goodbye: false,
    rich_post: true,
    mention_all: true,
    general: true,
    moderation: true,
    content_protection: true,
    ai_conversation: false,
    lust_mode: true,
    stickers: true,
    auto_engine: true,
    slowmode: false,
    abuse_words: false,
    members: false,
    moderators: true,
    permissions: false,
    commands: true,
    schedules: false,
    activity: false,
    backup: false,
    messages: false,
    danger_zone: false
  },
  UNAUTHORIZED: {
    overview: false,
    welcome_goodbye: false,
    rich_post: false,
    mention_all: false,
    general: false,
    moderation: false,
    content_protection: false,
    ai_conversation: false,
    lust_mode: false,
    stickers: false,
    auto_engine: false,
    slowmode: false,
    abuse_words: false,
    members: false,
    moderators: false,
    permissions: false,
    commands: false,
    schedules: false,
    activity: false,
    backup: false,
    messages: false,
    danger_zone: false
  }
};

export function isFeatureAllowedForRole(role: MiniAppRole, feature: MiniAppFeature): boolean {
  if (feature === 'messages' || feature === 'danger_zone') return false;
  return Boolean(MINI_APP_PERMISSIONS[role]?.[feature]);
}

export function getAllowedFeaturesForRole(role: MiniAppRole): MiniAppFeature[] {
  const perms = MINI_APP_PERMISSIONS[role];
  if (!perms) return [];
  return (Object.keys(perms) as MiniAppFeature[]).filter(f => perms[f]);
}

export interface TelegramValidatedUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  user?: TelegramValidatedUser;
  authDate?: number;
  startParam?: string;
  chatInstance?: string;
  error?: string;
}

/**
 * Validates Telegram Mini App initData query string server-side.
 * Uses official HMAC-SHA256 procedure:
 * secret_key = HMAC_SHA256("WebAppData", bot_token)
 * data_check_string = sorted key=value pairs joined with \n (excluding hash)
 * hash = HMAC_SHA256(secret_key, data_check_string).hex
 */
export function validateTelegramInitData(
  initDataRaw: string,
  customBotToken?: string,
  maxAgeSeconds: number = 86400
): ValidationResult {
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { valid: false, error: 'Empty or missing initData' };
  }

  // Allow synthetic test execution token in test mode
  if ((process.env.NODE_ENV === 'test' || process.env.ROXIE_TEST_MODE === 'true') && initDataRaw.startsWith('test_tma_token:')) {
    try {
      const parts = initDataRaw.split(':');
      const userId = Number(parts[1]) || 12345;
      const username = parts[2] || 'test_user';
      return {
        valid: true,
        user: { id: userId, username, first_name: 'Test' },
        authDate: Math.floor(Date.now() / 1000)
      };
    } catch {
      return { valid: false, error: 'Invalid test token format' };
    }
  }

  const token = customBotToken || process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { valid: false, error: 'TELEGRAM_BOT_TOKEN is not configured on the server' };
  }

  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'Missing hash parameter in initData' };
    }

    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, error: 'Missing auth_date in initData' };
    }

    const authDate = parseInt(authDateStr, 10);
    if (isNaN(authDate)) {
      return { valid: false, error: 'Invalid auth_date format' };
    }

    const now = Math.floor(Date.now() / 1000);
    // Disallow timestamps older than maxAgeSeconds or more than 60s in the future (clock drift)
    if (now - authDate > maxAgeSeconds || authDate > now + 60) {
      return { valid: false, error: 'Expired or invalid auth_date in initData' };
    }

    // Build data_check_string (all parameters except 'hash', sorted alphabetically)
    const pairs: string[] = [];
    params.forEach((value, key) => {
      if (key !== 'hash') {
        pairs.push(`${key}=${value}`);
      }
    });
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    // Calculate secret key: HMAC-SHA256("WebAppData", botToken)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();

    // Calculate signature: HMAC-SHA256(secretKey, dataCheckString)
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    // Constant-time comparison
    if (calculatedHash.length !== hash.length) {
      return { valid: false, error: 'Signature length mismatch' };
    }
    const isValid = crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'));
    if (!isValid) {
      return { valid: false, error: 'Invalid HMAC signature in initData' };
    }

    const userRaw = params.get('user');
    let user: TelegramValidatedUser | undefined;
    if (userRaw) {
      user = JSON.parse(userRaw);
    }

    if (!user || !user.id || typeof user.id !== 'number') {
      return { valid: false, error: 'Missing or invalid user object in initData' };
    }

    return {
      valid: true,
      user,
      authDate,
      startParam: params.get('start_param') || undefined,
      chatInstance: params.get('chat_instance') || undefined
    };
  } catch (err: any) {
    return { valid: false, error: `Validation exception: ${err?.message || err}` };
  }
}

/**
 * Resolves the secret used for signing and verifying Telegram Mini App session tokens.
 *
 * Production requirements:
 * - Must be explicitly configured via DASHBOARD_SESSION_SECRET.
 * - Minimum 16 characters for cryptographic strength.
 * - Never falls back to hardcoded strings or bot tokens in production.
 * - Fails closed if missing or invalid.
 *
 * Non-production (test/development):
 * - Uses DASHBOARD_SESSION_SECRET if available.
 * - Falls back to safe test/dev secret only when strictly outside of production.
 */
export function getTmaSecret(): string {
  const isProduction = process.env.NODE_ENV === 'production';
  const secret = process.env.DASHBOARD_SESSION_SECRET?.trim();

  if (isProduction) {
    if (!secret || secret.length < 16) {
      throw new Error('TMA session signing secret is not properly configured. Set DASHBOARD_SESSION_SECRET in environment.');
    }
    return secret;
  }

  // Non-production environments
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'test' || process.env.ROXIE_TEST_MODE === 'true') {
    return 'roxie-tma-test-session-secret';
  }

  // Local development fallback
  return 'roxie-tma-dev-session-secret';
}

export interface TmaSessionPayload {
  userId: number;
  username?: string;
  firstName?: string;
  chatId: number;
  role: MiniAppRole;
  issuedAt: number;
  expiresAt: number;
}

export function createTmaSessionToken(
  user: TelegramValidatedUser,
  chatId: number,
  role: MiniAppRole,
  ttlSeconds: number = 86400
): string {
  const secret = getTmaSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload: TmaSessionPayload = {
    userId: user.id,
    username: user.username,
    firstName: user.first_name,
    chatId,
    role,
    issuedAt: now,
    expiresAt: now + ttlSeconds
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');
  return `${payloadB64}.${signature}`;
}

export function verifyTmaSessionToken(token: string): { valid: boolean; payload?: TmaSessionPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Missing session token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, error: 'Malformed session token' };
  }

  let secret: string;
  try {
    secret = getTmaSecret();
  } catch (err: any) {
    return { valid: false, error: err.message || 'Session secret configuration error' };
  }

  const [payloadB64, signature] = parts;
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('hex');

  if (signature.length !== expectedSig.length) {
    return { valid: false, error: 'Invalid token signature length' };
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'))) {
    return { valid: false, error: 'Invalid token signature' };
  }

  try {
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload: TmaSessionPayload = JSON.parse(payloadJson);
    const now = Math.floor(Date.now() / 1000);

    if (payload.expiresAt && now > payload.expiresAt) {
      return { valid: false, error: 'Session token has expired' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: 'Failed to parse session token payload' };
  }
}

/**
 * Authoritative Server-Side Group Role Resolver
 *
 * Verifies caller's current status in the target Telegram group:
 * - Checks Telegram group administrators via TelegramMiddleware
 * - Reuses db.getCustomRole(chatId, userId) for authoritative custom role assignment
 * - Identifies EXCEPTION_ADMIN via authoritative db.getCustomRole(chatId, userId) === 'EXCEPTION_ADMIN' (custom titles NEVER grant exception admin)
 * - Identifies GROUP_OWNER via status === 'creator'
 * - Identifies GROUP_ADMIN via status === 'administrator'
 * - Rejects any user who is not an owner/admin/exception admin as UNAUTHORIZED
 */
export async function resolveGroupRole(chatId: number, userId: number): Promise<{
  role: MiniAppRole;
  isOwner: boolean;
  isExceptionAdmin: boolean;
  isAdmin: boolean;
  member: any | null;
  customRole: string;
  chatTitle?: string;
}> {
  if (typeof chatId !== 'number' || isNaN(chatId) || chatId >= 0 || !userId || userId === 0) {
    return {
      role: 'UNAUTHORIZED',
      isOwner: false,
      isExceptionAdmin: false,
      isAdmin: false,
      member: null,
      customRole: 'NONE'
    };
  }

  // 1. Check custom bot role from authoritative storage
  const customRole = db.getCustomRole(chatId, userId);

  // 2. Query Telegram administrators for the chat
  let admins: any[] = [];
  try {
    admins = await TelegramMiddleware.getChatAdministrators(chatId);
  } catch {
    admins = [];
  }

  let adminMember = admins.find(a => a.user?.id === userId);

  // 3. Fallback to direct member lookup if not in cached admin list
  let targetMember: any = adminMember;
  if (!targetMember) {
    try {
      const single = await TelegramMiddleware.getTargetMember(chatId, userId);
      if (single) {
        targetMember = single;
        if (single.status === 'creator' || single.status === 'administrator') {
          adminMember = single;
        }
      }
    } catch {
      // Fallback
    }
  }

  // If user has been kicked/banned or left the chat, reject as UNAUTHORIZED immediately
  if (targetMember && (targetMember.status === 'kicked' || targetMember.status === 'left')) {
    return {
      role: 'UNAUTHORIZED',
      isOwner: false,
      isExceptionAdmin: false,
      isAdmin: false,
      member: targetMember,
      customRole
    };
  }

  // 4. Role Evaluation
  if (adminMember) {
    if (adminMember.status === 'creator') {
      return {
        role: 'GROUP_OWNER',
        isOwner: true,
        isExceptionAdmin: false,
        isAdmin: true,
        member: adminMember,
        customRole
      };
    }

    // Telegram custom title must NEVER independently grant exception-admin privileges.
    // Exception-admin status is strictly and solely determined by authoritative storage.
    const isException = customRole === 'EXCEPTION_ADMIN';

    if (isException) {
      return {
        role: 'EXCEPTION_ADMIN',
        isOwner: false,
        isExceptionAdmin: true,
        isAdmin: true,
        member: adminMember,
        customRole: 'EXCEPTION_ADMIN'
      };
    }

    if (adminMember.status === 'administrator') {
      return {
        role: 'GROUP_ADMIN',
        isOwner: false,
        isExceptionAdmin: false,
        isAdmin: true,
        member: adminMember,
        customRole
      };
    }
  }

  // 5. If user has EXCEPTION_ADMIN custom role recorded in DB even if not in administrator list (e.g. delegated member)
  if (customRole === 'EXCEPTION_ADMIN') {
    return {
      role: 'EXCEPTION_ADMIN',
      isOwner: false,
      isExceptionAdmin: true,
      isAdmin: true,
      member: targetMember || null,
      customRole: 'EXCEPTION_ADMIN'
    };
  }

  return {
    role: 'UNAUTHORIZED',
    isOwner: false,
    isExceptionAdmin: false,
    isAdmin: false,
    member: null,
    customRole
  };
}

export interface AuthenticatedTmaRequest extends Request {
  tmaUser?: TelegramValidatedUser;
  tmaChatId?: number;
  tmaRole?: MiniAppRole;
  tmaSession?: TmaSessionPayload;
}

/**
 * Express Middleware to Protect Telegram Mini App Endpoints
 *
 * Verifies:
 * 1. Valid Telegram initData OR valid signed TMA session token.
 * 2. Strict target chatId match (from req.params.chatId, req.body.chatId, or req.query.chatId).
 * 3. Fresh verification of user's role in the EXACT target group on the server.
 * 4. Checks requiredFeature against the permission matrix.
 * 5. Fails closed (401/403) on any violation or mismatch.
 */
export function requireTmaAuth(requiredFeature?: MiniAppFeature) {
  return async (req: AuthenticatedTmaRequest, res: Response, next: NextFunction) => {
    // Mini App rejects Messages and Danger Zone globally
    if (requiredFeature === 'messages' || requiredFeature === 'danger_zone') {
      return res.status(403).json({
        error: 'Forbidden: Messages and Danger Zone operations are permanently disabled in Telegram Mini App.',
        code: 'FORBIDDEN_MINIAPP_ENDPOINT'
      });
    }

    // 1. Resolve Target Group Chat ID
    let targetChatId: number | undefined;
    if (req.params.chatId) {
      targetChatId = Number(req.params.chatId);
    } else if (req.body?.chatId) {
      targetChatId = Number(req.body.chatId);
    } else if (req.query.chatId) {
      targetChatId = Number(req.query.chatId);
    } else if (req.headers['x-telegram-chat-id']) {
      targetChatId = Number(req.headers['x-telegram-chat-id']);
    }

    if (!targetChatId || isNaN(targetChatId) || targetChatId >= 0) {
      return res.status(400).json({
        error: 'Invalid or missing target group chatId. Must be a negative group/supergroup ID.',
        code: 'INVALID_GROUP_ID'
      });
    }

    // 2. Extract Auth Credentials (initData or Session Token)
    let validatedUser: TelegramValidatedUser | undefined;
    let verifiedSession: TmaSessionPayload | undefined;

    // Check Header 'x-telegram-init-data'
    const initDataHeader = (req.headers['x-telegram-init-data'] as string) || (req.headers['x-tg-init-data'] as string);
    // Check Authorization Bearer
    const authHeader = req.headers.authorization;
    const sessionTokenHeader = (req.headers['x-tma-session'] as string) || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined);

    if (initDataHeader) {
      const val = validateTelegramInitData(initDataHeader);
      if (!val.valid || !val.user) {
        return res.status(401).json({
          error: `Unauthorized: Telegram initData validation failed (${val.error || 'Invalid credentials'}).`,
          code: 'INVALID_INIT_DATA'
        });
      }
      validatedUser = val.user;
    } else if (sessionTokenHeader) {
      const ver = verifyTmaSessionToken(sessionTokenHeader);
      if (!ver.valid || !ver.payload) {
        return res.status(401).json({
          error: `Unauthorized: TMA session token invalid or expired (${ver.error || 'Invalid session'}).`,
          code: 'INVALID_SESSION_TOKEN'
        });
      }
      verifiedSession = ver.payload;
      validatedUser = {
        id: ver.payload.userId,
        username: ver.payload.username,
        first_name: ver.payload.firstName
      };

      // Ensure session token was issued for this exact chatId (group isolation)
      if (verifiedSession.chatId !== targetChatId) {
        return res.status(403).json({
          error: 'Forbidden: Session token group does not match requested target group.',
          code: 'CROSS_GROUP_ACCESS_DENIED'
        });
      }
    } else {
      return res.status(401).json({
        error: 'Unauthorized: Telegram launch data or TMA session token required.',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // 3. Server-Side Role Verification for THIS target chatId
    const roleResolution = await resolveGroupRole(targetChatId, validatedUser.id);
    if (roleResolution.role === 'UNAUTHORIZED') {
      return res.status(403).json({
        error: 'Forbidden: You are not an authorized administrator or owner of this group.',
        code: 'NOT_GROUP_ADMIN'
      });
    }

    // 4. Feature Permission Check
    if (requiredFeature && !isFeatureAllowedForRole(roleResolution.role, requiredFeature)) {
      return res.status(403).json({
        error: `Forbidden: Your role (${roleResolution.role}) does not have access to feature '${requiredFeature}'.`,
        code: 'FORBIDDEN_FEATURE',
        feature: requiredFeature,
        role: roleResolution.role
      });
    }

    // Attach to request
    req.tmaUser = validatedUser;
    req.tmaChatId = targetChatId;
    req.tmaRole = roleResolution.role;
    req.tmaSession = verifiedSession;

    next();
  };
}
