import { TelegramClient, Api, utils } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CachedMember, TelegramMessageEntity } from './types.js';
import { logDebug } from '../observability/logger.js';
import { telegramApi } from './api.js';

export type ParticipantFetchStatus = 'FULL_FETCH' | 'PARTIAL_FETCH' | 'FETCH_FAILED';
export type MtprotoAuthMode = 'USER' | 'BOT' | 'NONE';
export type MtprotoSessionStatus =
  | 'HEALTHY'
  | 'AUTH_KEY_UNREGISTERED'
  | 'AUTH_REVOKED'
  | 'AUTH_FAILED'
  | 'NOT_CONFIGURED'
  | 'CONNECTING'
  | 'DISCONNECTED';

export interface MtprotoHealthReport {
  isConfigured: boolean;
  mode: MtprotoAuthMode;
  status: MtprotoSessionStatus;
  isConnected: boolean;
  canOperate: boolean;
  error?: string;
  errorCode?: string;
  actionRequired?: string;
  userSessionWarning?: string;
  userSessionStatus?: string;
  authenticatedUser?: {
    id: string;
    username?: string;
    firstName?: string;
    isBot: boolean;
  };
  lastCheckedAt: number;
}

export interface ParticipantFetchResult {
  status: ParticipantFetchStatus;
  authMode: MtprotoAuthMode;
  telegramTotal: number;
  fetchedCount: number;
  uniqueCount: number;
  excludedCount: number;
  eligibleCount: number;
  members: CachedMember[];
  error?: string;
  errorCode?: string;
  isComplete: boolean;
  diagnosticMessage?: string;
}

export class MTProtoNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED';
  constructor(message: string = 'MTProto client is not configured on this server (missing TELEGRAM_API_ID, TELEGRAM_API_HASH, and either TELEGRAM_MT_PROTO_SESSION or TELEGRAM_BOT_TOKEN).') {
    super(message);
    this.name = 'MTProtoNotConfiguredError';
  }
}

export class MTProtoAuthError extends Error {
  public readonly code: string;
  public readonly actionRequired?: string;

  constructor(
    message: string = 'MTProto authentication failed.',
    code: string = 'AUTH_FAILED',
    actionRequired?: string
  ) {
    super(message);
    this.name = 'MTProtoAuthError';
    this.code = code;
    this.actionRequired = actionRequired;
  }
}

export class MTProtoGroupResolutionError extends Error {
  public readonly code = 'GROUP_RESOLUTION_FAILED';
  constructor(message: string = 'Could not resolve target group on MTProto.') {
    super(message);
    this.name = 'MTProtoGroupResolutionError';
  }
}

export class MTProtoPermissionError extends Error {
  public readonly code = 'CHAT_ADMIN_REQUIRED';
  constructor(message: string = '❌ Roxie needs administrator access in this supergroup to enumerate its members.') {
    super(message);
    this.name = 'MTProtoPermissionError';
  }
}

export class MTProtoFloodWaitError extends Error {
  public readonly code = 'FLOOD_WAIT';
  public readonly seconds: number;
  constructor(seconds: number) {
    super(`Telegram MTProto flood wait required: ${seconds} seconds.`);
    this.name = 'MTProtoFloodWaitError';
    this.seconds = seconds;
  }
}

export class MTProtoIncompleteFetchError extends Error {
  public readonly code = 'INCOMPLETE_FETCH';
  public readonly reported: number;
  public readonly fetched: number;
  constructor(reported: number, fetched: number) {
    super(`Incomplete participant fetch: Telegram reported ${reported} members but only ${fetched} were retrieved.`);
    this.name = 'MTProtoIncompleteFetchError';
    this.reported = reported;
    this.fetched = fetched;
  }
}

export class MTProtoUnsupportedChatError extends Error {
  public readonly code = 'UNSUPPORTED_CHAT_TYPE';
  constructor(message: string = 'Unsupported chat type for participant enumeration.') {
    super(message);
    this.name = 'MTProtoUnsupportedChatError';
  }
}

export class MtprotoParticipantService {
  private static instance: MtprotoParticipantService | null = null;
  private client: TelegramClient | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private currentMode: MtprotoAuthMode = 'NONE';
  private connectPromise: Promise<TelegramClient> | null = null;
  private lastCheckedAt: number = 0;
  private authenticatedUser: {
    id: string;
    username?: string;
    firstName?: string;
    isBot: boolean;
  } | null = null;
  private lastFatalAuthError: {
    fingerprint: string;
    code: string;
    message: string;
    actionRequired: string;
    timestamp: number;
  } | null = null;
  private lastFatalUserAuthError: {
    fingerprint: string;
    code: string;
    message: string;
    actionRequired: string;
    timestamp: number;
  } | null = null;
  private lastFatalBotAuthError: {
    fingerprint: string;
    code: string;
    message: string;
    actionRequired: string;
    timestamp: number;
  } | null = null;

  // Active chat fetch locks to prevent concurrent /all operations for the same group
  private static activeChatLocks: Set<number> = new Set();

  public static getInstance(): MtprotoParticipantService {
    if (!MtprotoParticipantService.instance) {
      MtprotoParticipantService.instance = new MtprotoParticipantService();
    }
    return MtprotoParticipantService.instance;
  }

  /**
   * Generates a non-sensitive fingerprint of the active credentials without exposing or logging secrets.
   */
  private getSessionFingerprint(mode?: MtprotoAuthMode): string {
    const targetMode = mode || this.getAuthMode();
    const sessionStr = (
      targetMode === 'USER'
        ? (process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION || '')
        : (process.env.TELEGRAM_BOT_TOKEN || '')
    ).trim();
    if (!sessionStr) return 'none';
    let hash = 0;
    for (let i = 0; i < sessionStr.length; i++) {
      hash = ((hash << 5) - hash + sessionStr.charCodeAt(i)) | 0;
    }
    return `${targetMode}_len_${sessionStr.length}_h_${Math.abs(hash)}`;
  }

  public isUserSessionFatallyRevoked(): boolean {
    const userFingerprint = this.getSessionFingerprint('USER');
    if (this.lastFatalUserAuthError && this.lastFatalUserAuthError.fingerprint === userFingerprint) {
      return true;
    }
    if (this.lastFatalAuthError && this.lastFatalAuthError.fingerprint === userFingerprint) {
      return true;
    }
    return false;
  }

  public isBotAuthFatallyFailed(): boolean {
    const botFingerprint = this.getSessionFingerprint('BOT');
    if (this.lastFatalBotAuthError && this.lastFatalBotAuthError.fingerprint === botFingerprint) {
      return true;
    }
    if (this.lastFatalAuthError && this.lastFatalAuthError.fingerprint === botFingerprint) {
      return true;
    }
    return false;
  }

  public getAuthMode(): MtprotoAuthMode {
    const apiId = process.env.TELEGRAM_API_ID?.trim();
    const apiHash = process.env.TELEGRAM_API_HASH?.trim();
    if (!apiId || !apiHash || isNaN(Number(apiId))) {
      return 'NONE';
    }

    const userSession = (process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION)?.trim();
    if (userSession && userSession.length > 0) {
      return 'USER';
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (botToken && botToken.length > 0) {
      return 'BOT';
    }

    return 'NONE';
  }

  public isConfigured(): boolean {
    return this.getAuthMode() !== 'NONE';
  }

  public canOperate(): boolean {
    return this.getHealthReport().canOperate;
  }

  public getHealthReport(): MtprotoHealthReport {
    const mode = this.getAuthMode();
    const isConfigured = mode !== 'NONE';
    const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
    const hasUserSession = Boolean((process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION)?.trim());
    const isUserRevoked = this.isUserSessionFatallyRevoked();
    const isBotRevoked = this.isBotAuthFatallyFailed();

    if (!isConfigured) {
      return {
        isConfigured: false,
        mode: 'NONE',
        status: 'NOT_CONFIGURED',
        isConnected: false,
        canOperate: false,
        error: 'MTProto credentials are not configured.',
        errorCode: 'NOT_CONFIGURED',
        actionRequired: 'Set TELEGRAM_API_ID, TELEGRAM_API_HASH, and either TELEGRAM_MT_PROTO_SESSION or TELEGRAM_BOT_TOKEN.',
        lastCheckedAt: this.lastCheckedAt || Date.now()
      };
    }

    // Both modes fatally failed
    if (isBotRevoked && (isUserRevoked || !hasUserSession)) {
      const err = this.lastFatalBotAuthError || this.lastFatalAuthError!;
      return {
        isConfigured: true,
        mode: 'BOT',
        status: 'AUTH_FAILED',
        isConnected: false,
        canOperate: false,
        error: err.message,
        errorCode: err.code,
        actionRequired: err.actionRequired,
        lastCheckedAt: this.lastCheckedAt || err.timestamp
      };
    }

    // User mode fatally revoked and NO bot token available to fall back to
    if (isUserRevoked && !hasBotToken) {
      const err = this.lastFatalUserAuthError || this.lastFatalAuthError!;
      const code = err.code;
      const status: MtprotoSessionStatus =
        code === 'AUTH_KEY_UNREGISTERED'
          ? 'AUTH_KEY_UNREGISTERED'
          : code === 'AUTH_REVOKED'
          ? 'AUTH_REVOKED'
          : 'AUTH_FAILED';

      return {
        isConfigured: true,
        mode: 'USER',
        status,
        isConnected: false,
        canOperate: false,
        error: err.message,
        errorCode: err.code,
        actionRequired: err.actionRequired,
        lastCheckedAt: this.lastCheckedAt || err.timestamp
      };
    }

    // Currently connected in either mode
    if (this.isConnected && this.client) {
      const effectiveMode = this.currentMode !== 'NONE' ? this.currentMode : (isUserRevoked && hasBotToken ? 'BOT' : mode);
      return {
        isConfigured: true,
        mode: effectiveMode,
        status: 'HEALTHY',
        isConnected: true,
        canOperate: true,
        authenticatedUser: this.authenticatedUser || undefined,
        userSessionWarning: isUserRevoked
          ? `The optional Telegram user session is revoked (${this.lastFatalUserAuthError?.code || 'AUTH_KEY_UNREGISTERED'}). Mention All is fully operational using @MissRoxie_Bot's native MTProto bot authorization.`
          : undefined,
        userSessionStatus: isUserRevoked ? (this.lastFatalUserAuthError?.code || 'AUTH_KEY_UNREGISTERED') : undefined,
        lastCheckedAt: this.lastCheckedAt || Date.now()
      };
    }

    // Unconnected / standby state
    const effectiveMode = isUserRevoked && hasBotToken ? 'BOT' : mode;
    return {
      isConfigured: true,
      mode: effectiveMode,
      status: this.isConnecting ? 'CONNECTING' : 'DISCONNECTED',
      isConnected: false,
      canOperate: hasBotToken || !isUserRevoked,
      userSessionWarning: isUserRevoked && hasBotToken
        ? `The optional Telegram user session is revoked (${this.lastFatalUserAuthError?.code || 'AUTH_KEY_UNREGISTERED'}). Ready to operate via native Bot MTProto authorization.`
        : undefined,
      userSessionStatus: isUserRevoked ? (this.lastFatalUserAuthError?.code || 'AUTH_KEY_UNREGISTERED') : undefined,
      lastCheckedAt: this.lastCheckedAt || Date.now()
    };
  }

  public getConfigurationStatus(): {
    isConfigured: boolean;
    mode: MtprotoAuthMode;
    hasApiId: boolean;
    hasApiHash: boolean;
    hasUserSession: boolean;
    hasBotToken: boolean;
    isConnected: boolean;
    status: MtprotoSessionStatus;
    canOperate: boolean;
    errorCode?: string;
  } {
    const apiId = process.env.TELEGRAM_API_ID?.trim();
    const apiHash = process.env.TELEGRAM_API_HASH?.trim();
    const userSession = (process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION)?.trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const mode = this.getAuthMode();
    const health = this.getHealthReport();

    return {
      isConfigured: mode !== 'NONE',
      mode,
      hasApiId: Boolean(apiId && !isNaN(Number(apiId))),
      hasApiHash: Boolean(apiHash && apiHash.length > 0),
      hasUserSession: Boolean(userSession && userSession.length > 0),
      hasBotToken: Boolean(botToken && botToken.length > 0),
      isConnected: this.isConnected,
      status: health.status,
      canOperate: health.canOperate,
      errorCode: health.errorCode
    };
  }

  public resetSessionState(): void {
    this.lastFatalAuthError = null;
    this.lastFatalUserAuthError = null;
    this.lastFatalBotAuthError = null;
    this.authenticatedUser = null;
    this.currentMode = 'NONE';
    this.disconnect().catch(() => {});
  }

  public getAuthenticatedUser(): {
    id: string;
    username?: string;
    firstName?: string;
    isBot: boolean;
  } | null {
    return this.authenticatedUser;
  }

  public setAuthenticatedUserForTesting(user: {
    id: string;
    username?: string;
    firstName?: string;
    isBot: boolean;
  } | null): void {
    this.authenticatedUser = user;
  }

  public acquireChatLock(chatId: number): boolean {
    if (MtprotoParticipantService.activeChatLocks.has(chatId)) {
      return false;
    }
    MtprotoParticipantService.activeChatLocks.add(chatId);
    return true;
  }

  public releaseChatLock(chatId: number): void {
    MtprotoParticipantService.activeChatLocks.delete(chatId);
  }

  public isChatLocked(chatId: number): boolean {
    return MtprotoParticipantService.activeChatLocks.has(chatId);
  }

  public async getClient(forceMode?: MtprotoAuthMode): Promise<TelegramClient> {
    // If already connected in requested mode (or any mode if not forced), reuse existing client
    if (this.client && this.isConnected) {
      if (!forceMode || this.currentMode === forceMode) {
        return this.client;
      }
      try {
        await this.client.disconnect();
      } catch {}
      this.client = null;
      this.isConnected = false;
      this.currentMode = 'NONE';
    }

    const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
    const hasUserSession = Boolean((process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION)?.trim());
    const apiIdStr = process.env.TELEGRAM_API_ID?.trim();
    const apiHash = process.env.TELEGRAM_API_HASH?.trim();

    if (!apiIdStr || !apiHash || isNaN(Number(apiIdStr)) || (!hasBotToken && !hasUserSession)) {
      throw new MTProtoNotConfiguredError(
        'MTProto credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, and either TELEGRAM_MT_PROTO_SESSION or TELEGRAM_BOT_TOKEN) are not configured.'
      );
    }

    // Determine target mode:
    // If not explicitly forced and user session is fatally revoked, automatically choose BOT mode!
    let targetMode: MtprotoAuthMode;
    if (forceMode) {
      targetMode = forceMode;
    } else if (hasUserSession && !this.isUserSessionFatallyRevoked()) {
      targetMode = 'USER';
    } else if (hasBotToken) {
      targetMode = 'BOT';
    } else {
      targetMode = 'USER';
    }

    // Fast-fail if target mode has a cached fatal auth error
    if (targetMode === 'USER' && this.isUserSessionFatallyRevoked()) {
      if (!forceMode && hasBotToken) {
        console.log(`[MTProto] USER session is fatally revoked (${this.lastFatalUserAuthError?.code || 'AUTH_KEY_UNREGISTERED'}). Connecting directly via BOT mode...`);
        return this.getClient('BOT');
      }
      const err = this.lastFatalUserAuthError || this.lastFatalAuthError!;
      throw new MTProtoAuthError(err.message, err.code, err.actionRequired);
    }

    if (targetMode === 'BOT' && this.isBotAuthFatallyFailed()) {
      const err = this.lastFatalBotAuthError || this.lastFatalAuthError!;
      throw new MTProtoAuthError(err.message, err.code, err.actionRequired);
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.isConnecting = true;
    this.connectPromise = (async () => {
      try {
        if (targetMode === 'USER') {
          try {
            return await this.connectUserClient();
          } catch (userErr: any) {
            // If caller did not force USER mode and bot token is available, automatically fall back to BOT!
            if (!forceMode && hasBotToken) {
              console.warn(
                `[MTProto] USER session connection failed (${userErr.code || userErr.message}). ` +
                `Automatically falling back to native BOT token authorization...`
              );
              return await this.connectBotClient();
            }
            throw userErr;
          }
        } else {
          return await this.connectBotClient();
        }
      } finally {
        this.isConnecting = false;
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
  }

  private async connectUserClient(): Promise<TelegramClient> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID!.trim(), 10);
    const apiHash = process.env.TELEGRAM_API_HASH!.trim();
    const sessionString = (process.env.TELEGRAM_MT_PROTO_SESSION || process.env.TELEGRAM_STRING_SESSION)!.trim();
    const currentFingerprint = this.getSessionFingerprint('USER');

    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 1,
      autoReconnect: false,
      useWSS: false,
      timeout: 15000
    });

    console.log('[MTProto] Connecting client with USER session...');
    try {
      await client.connect();
      const me = await client.getMe();
      if (!me) {
        throw new MTProtoAuthError('Telegram client connected but could not retrieve authenticated user account.', 'AUTH_FAILED');
      }
      this.client = client;
      this.isConnected = true;
      this.currentMode = 'USER';
      this.lastFatalUserAuthError = null;
      this.lastFatalAuthError = null;
      this.lastCheckedAt = Date.now();
      const userId = (me as any).id?.toString() || 'unknown';
      const username = (me as any).username ? `@${(me as any).username}` : undefined;
      this.authenticatedUser = {
        id: userId,
        username: (me as any).username || undefined,
        firstName: (me as any).firstName || undefined,
        isBot: Boolean((me as any).bot)
      };
      console.log(`[MTProto] Authenticated in USER mode (userId=${userId}, username=${username || 'none'}, isBot=${this.authenticatedUser.isBot})`);
      return client;
    } catch (err: any) {
      this.isConnected = false;
      try {
        await client.disconnect();
      } catch {}
      this.client = null;
      this.currentMode = 'NONE';
      this.lastCheckedAt = Date.now();
      const errMsg = err?.message || String(err);

      if (errMsg.includes('AUTH_KEY_UNREGISTERED')) {
        const authErr = new MTProtoAuthError(
          `MTProto user session invalid or revoked: 401: AUTH_KEY_UNREGISTERED (caused by users.GetUsers)`,
          'AUTH_KEY_UNREGISTERED',
          'Generate a fresh session string by running "npx tsx scripts/generateMtprotoSession.ts" and update TELEGRAM_MT_PROTO_SESSION in your hosting environment variables.'
        );
        this.lastFatalUserAuthError = {
          fingerprint: currentFingerprint,
          code: authErr.code,
          message: authErr.message,
          actionRequired: authErr.actionRequired!,
          timestamp: Date.now()
        };
        this.lastFatalAuthError = this.lastFatalUserAuthError;
        console.error(`[MTProto] Fatal authentication failure: ${authErr.message}`);
        throw authErr;
      }

      if (errMsg.includes('SESSION_REVOKED') || errMsg.includes('AUTH_KEY_DUPLICATED')) {
        const authErr = new MTProtoAuthError(
          `MTProto user session revoked or superseded: ${errMsg}`,
          'AUTH_REVOKED',
          'Generate a fresh session string by running "npx tsx scripts/generateMtprotoSession.ts" and update TELEGRAM_MT_PROTO_SESSION in your hosting environment variables.'
        );
        this.lastFatalUserAuthError = {
          fingerprint: currentFingerprint,
          code: authErr.code,
          message: authErr.message,
          actionRequired: authErr.actionRequired!,
          timestamp: Date.now()
        };
        this.lastFatalAuthError = this.lastFatalUserAuthError;
        console.error(`[MTProto] Fatal authentication failure: ${authErr.message}`);
        throw authErr;
      }

      if (errMsg.includes('401') || errMsg.includes('SESSION_PASSWORD_NEEDED')) {
        const authErr = new MTProtoAuthError(
          `MTProto user session authentication rejected: ${errMsg}`,
          'AUTH_FAILED',
          'Check Telegram account credentials and 2FA status, then regenerate session using scripts/generateMtprotoSession.ts.'
        );
        this.lastFatalUserAuthError = {
          fingerprint: currentFingerprint,
          code: authErr.code,
          message: authErr.message,
          actionRequired: authErr.actionRequired!,
          timestamp: Date.now()
        };
        this.lastFatalAuthError = this.lastFatalUserAuthError;
        console.error(`[MTProto] Fatal authentication failure: ${authErr.message}`);
        throw authErr;
      }

      throw err;
    }
  }

  private async connectBotClient(): Promise<TelegramClient> {
    const apiId = parseInt(process.env.TELEGRAM_API_ID!.trim(), 10);
    const apiHash = process.env.TELEGRAM_API_HASH!.trim();
    const botToken = process.env.TELEGRAM_BOT_TOKEN!.trim();
    const currentFingerprint = this.getSessionFingerprint('BOT');

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 1,
      autoReconnect: false,
      useWSS: false,
      timeout: 15000
    });

    console.log('[MTProto] Connecting client with BOT token authorization...');
    try {
      await client.start({
        botAuthToken: botToken
      });
      const me = await client.getMe();
      if (!me) {
        throw new MTProtoAuthError('Telegram client connected but could not retrieve authenticated bot account.', 'BOT_NOT_FOUND');
      }
      this.client = client;
      this.isConnected = true;
      this.currentMode = 'BOT';
      this.lastFatalBotAuthError = null;
      this.lastFatalAuthError = null;
      this.lastCheckedAt = Date.now();
      const botUsername = (me as any).username || 'MissRoxie_Bot';
      this.authenticatedUser = {
        id: (me as any).id?.toString() || 'unknown',
        username: botUsername,
        firstName: (me as any).firstName || 'Bot',
        isBot: true
      };
      console.log(`[MTProto] Authenticated in BOT mode (username=${botUsername}, isBot=true)`);
      return client;
    } catch (err: any) {
      this.isConnected = false;
      try {
        await client.disconnect();
      } catch {}
      this.client = null;
      this.currentMode = 'NONE';
      this.lastCheckedAt = Date.now();
      const errMsg = err?.message || String(err);

      if (errMsg.includes('BOT_TOKEN_INVALID') || errMsg.includes('401') || errMsg.includes('AUTH_KEY')) {
        const authErr = new MTProtoAuthError(
          `MTProto bot authentication failed or token invalid: ${errMsg}`,
          'BOT_TOKEN_INVALID',
          'Verify that TELEGRAM_BOT_TOKEN is correct and matches your bot credentials from @BotFather.'
        );
        this.lastFatalBotAuthError = {
          fingerprint: currentFingerprint,
          code: authErr.code,
          message: authErr.message,
          actionRequired: authErr.actionRequired!,
          timestamp: Date.now()
        };
        this.lastFatalAuthError = this.lastFatalBotAuthError;
        console.error(`[MTProto] Fatal bot authentication failure: ${authErr.message}`);
        throw authErr;
      }

      throw err;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch {
        // Safe tear down
      }
      this.client = null;
      this.isConnected = false;
      this.currentMode = 'NONE';
    }
  }

  /**
   * Helper: Extracts or constructs a valid Api.InputChannel with accessHash from an MTProto entity.
   */
  private toInputChannel(entity: any): Api.InputChannel | null {
    if (!entity) return null;

    // 1. Direct Api.InputChannel
    if (entity instanceof Api.InputChannel) {
      if (entity.channelId && entity.accessHash != null) {
        return entity;
      }
      return null;
    }

    // 2. Api.InputPeerChannel -> convert to Api.InputChannel
    if (entity instanceof Api.InputPeerChannel) {
      if (entity.channelId && entity.accessHash != null) {
        return new Api.InputChannel({
          channelId: entity.channelId,
          accessHash: entity.accessHash
        });
      }
      return null;
    }

    // 3. Api.Channel -> construct Api.InputChannel from channel id & accessHash
    if (entity instanceof Api.Channel) {
      if (entity.id && entity.accessHash != null) {
        return new Api.InputChannel({
          channelId: entity.id,
          accessHash: entity.accessHash
        });
      }
      return null;
    }

    // 4. Try GramJS utils.getInputChannel
    try {
      const converted = utils.getInputChannel(entity);
      if (converted instanceof Api.InputChannel && converted.channelId && converted.accessHash != null) {
        return converted;
      }
    } catch {
      // Ignore conversion failure
    }

    return null;
  }

  /**
   * Resolves a Bot API chat ID to an MTProto channel entity / Api.InputChannel.
   * Handles:
   * 1. In-memory entity cache lookup.
   * 2. Direct resolution via client.getInputEntity.
   * 3. Fallback: Public supergroup username resolution via Bot API getChat.
   * 4. Fallback: In USER mode (user session), warms entity cache via GetDialogs.
   * 5. Retry entity cache lookup after fallbacks.
   * 6. Multi-identity diagnostic: distinguishes Bot API @MissRoxie_Bot admin rights from
   *    MTProto user session membership so operators receive exact actionable guidance.
   */
  public async resolvePeerEntity(
    client: TelegramClient,
    chatId: number | string,
    botId?: number
  ): Promise<Api.InputChannel> {
    const rawIdStr = String(chatId).trim();
    console.log(`[MTProto] resolving chat=${rawIdStr}`);

    if (!rawIdStr.startsWith('-100')) {
      if (rawIdStr.startsWith('-')) {
        throw new MTProtoUnsupportedChatError(
          `Basic group chat ${rawIdStr} is unsupported for MTProto participant enumeration. MissRoxie requires a Telegram supergroup.`
        );
      }
      throw new MTProtoUnsupportedChatError(
        `Chat ID ${rawIdStr} is not a valid Telegram supergroup/channel.`
      );
    }

    let resolvedInputChannel: Api.InputChannel | null = null;

    // 1. Check in-memory entity cache first
    try {
      if (client._entityCache) {
        const cached = client._entityCache.get(rawIdStr);
        resolvedInputChannel = this.toInputChannel(cached);
      }
    } catch {
      // Not in entity cache
    }

    // 2. Direct resolution via client.getInputEntity / channels.GetChannels using marked ID
    if (!resolvedInputChannel) {
      try {
        const entity = await client.getInputEntity(rawIdStr);
        resolvedInputChannel = this.toInputChannel(entity);
      } catch (directErr: any) {
        logDebug({
          event: 'MTPROTO_DIRECT_PEER_RESOLVE_FAILED',
          chatId: rawIdStr,
          error: directErr.message
        });

        const errMsg = directErr.message || '';
        if (errMsg.includes('CHAT_ADMIN_REQUIRED')) {
          throw new MTProtoPermissionError(
            '❌ Roxie needs administrator access in this supergroup to enumerate its members.'
          );
        }
        if (
          errMsg.includes('CHANNEL_INVALID') ||
          errMsg.includes('CHANNEL_PRIVATE') ||
          errMsg.includes('USER_NOT_PARTICIPANT')
        ) {
          throw new MTProtoGroupResolutionError(
            `Failed to resolve Telegram chat ${rawIdStr} on MTProto: Roxie bot is not a member or administrator of this supergroup.`
          );
        }
        if (errMsg.includes('BOT_METHOD_INVALID')) {
          throw new MTProtoGroupResolutionError(
            `MTProto bot method invalid for chat ${rawIdStr}: ${errMsg}`
          );
        }
      }
    }

    // 3. Fallback: If not resolved yet, check if supergroup has a public username via Bot API
    if (!resolvedInputChannel) {
      try {
        const chatInfo = await telegramApi.getChat(chatId).catch(() => null);
        if (chatInfo?.ok && chatInfo.result?.username) {
          console.log(`[MTProto] Supergroup ${rawIdStr} has public username @${chatInfo.result.username}. Resolving via username...`);
          const entity = await client.getInputEntity('@' + chatInfo.result.username);
          resolvedInputChannel = this.toInputChannel(entity);
        }
      } catch (err: any) {
        logDebug({
          event: 'MTPROTO_USERNAME_RESOLVE_FAILED',
          chatId: rawIdStr,
          error: err?.message
        });
      }
    }

    // 4. Fallback: In USER mode (non-bot user session), warm entity cache via GetDialogs
    const isBotClient = Boolean(this.authenticatedUser?.isBot || (client as any)._bot || this.currentMode === 'BOT');
    if (!resolvedInputChannel && !isBotClient) {
      try {
        console.log(`[MTProto] Dialog cache miss for ${rawIdStr} in USER mode. Fetching dialogs to warm entity cache...`);
        let dialogs: any = null;
        if (typeof (client as any).invoke === 'function') {
          dialogs = await client.invoke(
            new Api.messages.GetDialogs({
              offsetDate: 0,
              offsetId: 0,
              offsetPeer: new Api.InputPeerEmpty(),
              limit: 100,
              hash: BigInt(0) as any
            })
          );
        } else if (typeof (client as any).getDialogs === 'function') {
          dialogs = await (client as any).getDialogs({ limit: 100 });
        }

        if (dialogs && client._entityCache) {
          client._entityCache.add(dialogs);
          const cached = client._entityCache.get(rawIdStr);
          resolvedInputChannel = this.toInputChannel(cached);
        }
      } catch (dialogErr: any) {
        logDebug({
          event: 'MTPROTO_GET_DIALOGS_WARMUP_FAILED',
          chatId: rawIdStr,
          error: dialogErr?.message
        });
      }
    }

    // 5. Retry cache lookup after fallbacks
    if (!resolvedInputChannel && client._entityCache) {
      try {
        const cached = client._entityCache.get(rawIdStr);
        resolvedInputChannel = this.toInputChannel(cached);
      } catch {
        // Cache miss
      }
    }

    // 6. If still unresolved, run targeted multi-identity diagnosis to provide an accurate, actionable message
    if (!resolvedInputChannel) {
      const diagnosticError = await this.diagnoseResolutionFailure(chatId, rawIdStr, botId);
      throw new MTProtoGroupResolutionError(diagnosticError);
    }

    console.log('[MTProto] resolved entity type=Channel');
    console.log('[MTProto] channel entity resolved successfully');

    return resolvedInputChannel;
  }

  /**
   * Diagnostic helper: safely queries Bot API for @MissRoxie_Bot administrator status
   * and (in USER mode) the authenticated MTProto user account membership.
   * Produces an accurate, actionable diagnostic message without leaking sensitive credentials.
   */
  public async diagnoseResolutionFailure(
    chatId: number | string,
    rawIdStr: string,
    botId?: number
  ): Promise<string> {
    const mode = this.currentMode !== 'NONE' ? this.currentMode : this.getAuthMode();
    let botMe: any = null;
    let botChatMember: any = null;
    let botError: string | null = null;

    try {
      const meRes = await telegramApi.getMe();
      botMe = meRes?.ok ? meRes.result : null;
    } catch (e: any) {
      botError = e?.message;
    }

    const effectiveBotId = botId || botMe?.id;
    const botUsername = botMe?.username ? `@${botMe.username}` : '@MissRoxie_Bot';

    if (effectiveBotId) {
      try {
        const memberRes = await telegramApi.getChatMember(chatId, effectiveBotId, true);
        if (memberRes?.ok && memberRes.result) {
          botChatMember = memberRes.result;
        } else if (memberRes?.description) {
          botError = memberRes.description;
        }
      } catch (e: any) {
        botError = e?.message;
      }
    }

    const isBotAdmin = botChatMember?.status === 'administrator' || botChatMember?.status === 'creator';
    const isBotMember = isBotAdmin || botChatMember?.status === 'member' || botChatMember?.status === 'restricted';

    // In USER mode, participant enumeration is executed by the authenticated MTProto user account
    if (mode === 'USER') {
      const authUser = this.authenticatedUser;
      const userIdentifier = authUser?.username
        ? `@${authUser.username}`
        : (authUser?.id ? `account ID ${authUser.id}` : 'authenticated MTProto user account');
      let userChatMember: any = null;
      let userNotMember = false;

      if (authUser?.id) {
        const numUserId = Number(authUser.id);
        if (!isNaN(numUserId)) {
          try {
            const userRes = await telegramApi.getChatMember(chatId, numUserId, true);
            if (userRes?.ok && userRes.result) {
              userChatMember = userRes.result;
              if (userChatMember.status === 'left' || userChatMember.status === 'kicked') {
                userNotMember = true;
              }
            } else if (
              userRes?.description?.includes('USER_NOT_PARTICIPANT') ||
              userRes?.description?.includes('user not found') ||
              userRes?.description?.includes('not found') ||
              userRes?.error_code === 400
            ) {
              userNotMember = true;
            }
          } catch {
            // Safe fallback
          }
        }
      }

      if (userNotMember) {
        if (isBotAdmin) {
          return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: The authenticated MTProto session user (${userIdentifier}) is NOT a member of this supergroup. ${botUsername} is an administrator, but Telegram requires the MTProto user session account to also be a member of private supergroups to access them. Please add ${userIdentifier} to this supergroup.`;
        } else {
          return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: Neither ${botUsername} nor the MTProto session user (${userIdentifier}) have required access. Please ensure ${botUsername} is an administrator and add ${userIdentifier} to the supergroup.`;
        }
      }

      if (!isBotAdmin) {
        if (!isBotMember) {
          return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: ${botUsername} is not in this supergroup. Please add ${botUsername} and promote it to administrator.`;
        }
        return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: ${botUsername} is a member but not an administrator. Please ensure ${botUsername} is granted administrator privileges in the supergroup.`;
      }

      return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: MTProto user session (${userIdentifier}) cannot access this private supergroup. Please verify ${userIdentifier} is an active member or administrator in the supergroup.`;
    }

    // In BOT or NONE mode
    if (!isBotAdmin) {
      if (!isBotMember) {
        return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: ${botUsername} cannot access this chat (${botError || 'not a member'}). Please add ${botUsername} to the supergroup and grant administrator privileges.`;
      }
      return `Failed to resolve Telegram chat ${rawIdStr} on MTProto: ${botUsername} is not an administrator in this supergroup. Please promote ${botUsername} to administrator.`;
    }

    return `Failed to resolve Telegram chat ${rawIdStr} on MTProto in BOT mode: Telegram restricts bots from enumerating private channels via MTProto without a user session. Please configure TELEGRAM_MT_PROTO_SESSION for full member enumeration.`;
  }

  /**
   * Core MTProto participant enumeration for a Telegram group/supergroup.
   */
  public async fetchGroupParticipants(
    chatId: number,
    botId?: number
  ): Promise<ParticipantFetchResult> {
    const startedAt = Date.now();
    logDebug({ event: 'MTPROTO_FETCH_START', chatId, botId, timestamp: startedAt });

    const mode = this.getAuthMode();
    if (mode === 'NONE') {
      return {
        status: 'FETCH_FAILED',
        authMode: 'NONE',
        telegramTotal: 0,
        fetchedCount: 0,
        uniqueCount: 0,
        excludedCount: 0,
        eligibleCount: 0,
        members: [],
        errorCode: 'NOT_CONFIGURED',
        error: 'MTProto is not configured (missing TELEGRAM_API_ID, TELEGRAM_API_HASH, and either TELEGRAM_MT_PROTO_SESSION or TELEGRAM_BOT_TOKEN).',
        isComplete: false,
        diagnosticMessage: 'MTProto credentials not configured on the server.'
      };
    }

    let client: TelegramClient;
    try {
      client = await this.getClient();
    } catch (err: any) {
      const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
      if (hasBotToken && this.currentMode !== 'BOT') {
        try {
          console.warn(`[MTProto] Initial getClient failed (${err.message}). Attempting explicit fallback to BOT client...`);
          client = await this.getClient('BOT');
        } catch (botErr: any) {
          const isAuthKeyUnregistered = err.code === 'AUTH_KEY_UNREGISTERED' || (err.message && err.message.includes('AUTH_KEY_UNREGISTERED'));
          const errorCode = isAuthKeyUnregistered ? 'AUTH_KEY_UNREGISTERED' : (err.code || 'AUTH_FAILED');
          const actionNotice = err.actionRequired ? ` Action: ${err.actionRequired}` : '';

          return {
            status: 'FETCH_FAILED',
            authMode: mode,
            telegramTotal: 0,
            fetchedCount: 0,
            uniqueCount: 0,
            excludedCount: 0,
            eligibleCount: 0,
            members: [],
            errorCode,
            error: `Both USER and BOT MTProto authentication failed. User: ${err.message}. Bot: ${botErr.message}`,
            isComplete: false,
            diagnosticMessage: isAuthKeyUnregistered
              ? `MTProto session revoked (AUTH_KEY_UNREGISTERED) and Bot mode failed: ${botErr.message}.${actionNotice}`
              : `MTProto authentication failure: ${err.message}.${actionNotice}`
          };
        }
      } else {
        const isAuthKeyUnregistered = err.code === 'AUTH_KEY_UNREGISTERED' || (err.message && err.message.includes('AUTH_KEY_UNREGISTERED'));
        const errorCode = isAuthKeyUnregistered ? 'AUTH_KEY_UNREGISTERED' : (err.code || 'AUTH_FAILED');
        const actionNotice = err.actionRequired ? ` Action: ${err.actionRequired}` : '';

        return {
          status: 'FETCH_FAILED',
          authMode: mode,
          telegramTotal: 0,
          fetchedCount: 0,
          uniqueCount: 0,
          excludedCount: 0,
          eligibleCount: 0,
          members: [],
          errorCode,
          error: err.message || 'Failed to authenticate MTProto client.',
          isComplete: false,
          diagnosticMessage: isAuthKeyUnregistered
            ? `MTProto session revoked (AUTH_KEY_UNREGISTERED): The Telegram session was terminated or expired.${actionNotice}`
            : `MTProto authentication failure: ${err.message}${actionNotice}`
        };
      }
    }

    let inputPeer: Api.InputChannel;
    let effectiveClient = client;
    let effectiveMode = this.currentMode !== 'NONE' ? this.currentMode : mode;
    try {
      inputPeer = await this.resolvePeerEntity(effectiveClient, chatId, botId);
    } catch (err: any) {
      const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
      if (effectiveMode === 'USER' && hasBotToken) {
        console.log(`[MTProto] USER mode resolution failed for ${chatId}: ${err.message}. Attempting fallback to BOT mode...`);
        try {
          const botClient = await this.getClient('BOT');
          inputPeer = await this.resolvePeerEntity(botClient, chatId, botId);
          effectiveClient = botClient;
          effectiveMode = 'BOT';
          console.log(`[MTProto] Fallback to BOT mode succeeded for chat ${chatId}`);
        } catch (botErr: any) {
          return {
            status: 'FETCH_FAILED',
            authMode: effectiveMode,
            telegramTotal: 0,
            fetchedCount: 0,
            uniqueCount: 0,
            excludedCount: 0,
            eligibleCount: 0,
            members: [],
            errorCode: err.code || botErr.code || 'GROUP_RESOLUTION_FAILED',
            error: err.message || botErr.message || 'Could not resolve group peer on MTProto.',
            isComplete: false,
            diagnosticMessage: `Group resolution error: ${err.message}`
          };
        }
      } else {
        return {
          status: 'FETCH_FAILED',
          authMode: effectiveMode,
          telegramTotal: 0,
          fetchedCount: 0,
          uniqueCount: 0,
          excludedCount: 0,
          eligibleCount: 0,
          members: [],
          errorCode: err.code || 'GROUP_RESOLUTION_FAILED',
          error: err.message || 'Could not resolve group peer on MTProto.',
          isComplete: false,
          diagnosticMessage: `Group resolution error: ${err.message}`
        };
      }
    }

    console.log(`[ALL] starting full Telegram member fetch chatId=${chatId}`);
    console.log(`[MTProto] fetching participants with authMode=${effectiveMode}...`);

    const userMap = new Map<number, Api.User>();
    let totalReported = 0;
    let totalFetchedRecords = 0;
    const pageSize = 200; // Telegram maximum limit per request

    const fetchWithFilter = async (filter: any, maxPages: number = 500): Promise<void> => {
      let offset = 0;
      let hasMore = true;
      let prevCount = 0;
      let pages = 0;

      while (hasMore && pages < maxPages) {
        pages++;
        let res: any;
        try {
          res = await effectiveClient.invoke(
            new Api.channels.GetParticipants({
              channel: inputPeer,
              filter,
              offset,
              limit: pageSize,
              hash: BigInt(0) as any
            })
          );
        } catch (apiErr: any) {
          const errMsg = apiErr.message || '';
          if (errMsg.includes('CHAT_ADMIN_REQUIRED')) {
            throw new MTProtoPermissionError(
              '❌ Roxie needs administrator access in this supergroup to enumerate its members.'
            );
          }

          if (errMsg.includes('FLOOD_WAIT_') || apiErr.seconds) {
            const waitSec = apiErr.seconds || parseInt(errMsg.replace(/\D/g, ''), 10) || 30;
            throw new MTProtoFloodWaitError(waitSec);
          }

          if (
            errMsg.includes('CHANNEL_PRIVATE') ||
            errMsg.includes('CHAT_NOT_MODIFIED') ||
            errMsg.includes('USER_NOT_PARTICIPANT') ||
            errMsg.includes('CHANNEL_INVALID')
          ) {
            throw new MTProtoGroupResolutionError(
              'Roxie bot cannot access this Telegram group (ensure Roxie is added as an administrator).'
            );
          }

          // Non-fatal for sub-queries: break to allow other filters
          break;
        }

        if (res instanceof Api.channels.ChannelParticipants) {
          totalReported = Math.max(totalReported, res.count || 0);
          const users = res.users || [];
          const participants = res.participants || [];

          totalFetchedRecords += participants.length || users.length;

          for (const u of users) {
            if (u instanceof Api.User && u.id) {
              const uid = Number(u.id);
              if (!isNaN(uid) && uid > 0) {
                userMap.set(uid, u);
              }
            }
          }

          // If no participants or users returned, terminate pagination
          if (users.length === 0 || participants.length === 0) {
            hasMore = false;
            break;
          }

          offset += users.length;

          // Check for termination conditions
          if (
            (totalReported > 0 && offset >= totalReported) ||
            users.length < pageSize ||
            userMap.size === prevCount
          ) {
            hasMore = false;
            break;
          }

          prevCount = userMap.size;
        } else {
          hasMore = false;
          break;
        }
      }
    };

    try {
      // 1. Primary Full Supergroup Directory Search (q: '')
      await fetchWithFilter(new Api.ChannelParticipantsSearch({ q: '' }));

      // 2. Query Recent Active Participants
      await fetchWithFilter(new Api.ChannelParticipantsRecent(), 10);

      // 3. Query Administrators
      await fetchWithFilter(new Api.ChannelParticipantsAdmins(), 10);

      // 4. If supergroup reports more members than empty search returned, perform prefix sweep
      if (totalReported > userMap.size && totalReported > 20) {
        const prefixes = 'abcdefghijklmnopqrstuvwxyz0123456789_'.split('');
        for (const char of prefixes) {
          if (userMap.size >= totalReported) break;
          await fetchWithFilter(new Api.ChannelParticipantsSearch({ q: char }), 5);
        }
      }
    } catch (fetchErr: any) {
      if (fetchErr instanceof MTProtoPermissionError) {
        return {
          status: 'FETCH_FAILED',
          authMode: effectiveMode,
          telegramTotal: totalReported,
          fetchedCount: totalFetchedRecords,
          uniqueCount: userMap.size,
          excludedCount: 0,
          eligibleCount: 0,
          members: [],
          errorCode: 'CHAT_ADMIN_REQUIRED',
          error: fetchErr.message,
          isComplete: false,
          diagnosticMessage: 'Telegram CHAT_ADMIN_REQUIRED: Roxie must be an administrator in the supergroup to enumerate members.'
        };
      }

      if (fetchErr instanceof MTProtoFloodWaitError) {
        return {
          status: 'FETCH_FAILED',
          authMode: effectiveMode,
          telegramTotal: totalReported,
          fetchedCount: totalFetchedRecords,
          uniqueCount: userMap.size,
          excludedCount: 0,
          eligibleCount: 0,
          members: [],
          errorCode: 'FLOOD_WAIT',
          error: fetchErr.message,
          isComplete: false,
          diagnosticMessage: `Flood wait required: ${fetchErr.seconds}s`
        };
      }

      if (fetchErr instanceof MTProtoGroupResolutionError) {
        return {
          status: 'FETCH_FAILED',
          authMode: effectiveMode,
          telegramTotal: totalReported,
          fetchedCount: totalFetchedRecords,
          uniqueCount: userMap.size,
          excludedCount: 0,
          eligibleCount: 0,
          members: [],
          errorCode: 'ACCESS_DENIED',
          error: fetchErr.message,
          isComplete: false,
          diagnosticMessage: fetchErr.message
        };
      }

      return {
        status: 'FETCH_FAILED',
        authMode: effectiveMode,
        telegramTotal: totalReported,
        fetchedCount: totalFetchedRecords,
        uniqueCount: userMap.size,
        excludedCount: 0,
        eligibleCount: 0,
        members: [],
        errorCode: 'FETCH_ERROR',
        error: `MTProto participant fetch error: ${fetchErr.message}`,
        isComplete: false,
        diagnosticMessage: `Error during MTProto enumeration: ${fetchErr.message}`
      };
    }

    const uniqueCount = userMap.size;
    console.log(`[MTProto] total reported=${totalReported || uniqueCount}`);
    console.log(`[MTProto] fetched=${totalFetchedRecords}`);
    console.log(`[MTProto] unique=${uniqueCount}`);

    // Filter and normalize members
    const eligibleMembers: CachedMember[] = [];
    let excludedCount = 0;

    for (const [uid, u] of userMap.entries()) {
      // 1. Exclude service accounts
      if (uid === 1087968824 || uid === 777000) {
        excludedCount++;
        continue;
      }

      // 2. Exclude Roxie itself
      if (botId && uid === botId) {
        excludedCount++;
        continue;
      }

      // 3. Exclude bots using Telegram's actual u.bot flag ONLY (no username heuristics)
      if (u.bot === true) {
        excludedCount++;
        continue;
      }

      const rawUsername = (u.username || '').trim().replace(/^@/, '');
      const lowerUsername = rawUsername.toLowerCase();
      const firstName = (u.firstName || '').trim();
      const lastName = (u.lastName || '').trim();

      // 4. Exclude deleted accounts
      if (
        u.deleted === true ||
        firstName.toLowerCase() === 'deleted account' ||
        lowerUsername === 'deletedaccount'
      ) {
        excludedCount++;
        continue;
      }

      eligibleMembers.push({
        userId: uid,
        username: rawUsername || undefined,
        firstName: firstName || 'Member',
        lastName: lastName || undefined,
        lastSeen: new Date().toISOString()
      });
    }

    const eligibleCount = eligibleMembers.length;
    const batchCount = Math.ceil(eligibleCount / 10);
    console.log(`[ALL] excluded=${excludedCount}`);
    console.log(`[ALL] eligible=${eligibleCount}`);
    console.log(`[ALL] batches=${batchCount}`);

    // Determine completeness status
    let status: ParticipantFetchStatus = 'FULL_FETCH';
    let isComplete = true;
    let diagnosticMessage: string | undefined;

    if (totalReported > 0) {
      if (uniqueCount < totalReported && totalReported > 50 && uniqueCount <= 20) {
        status = 'PARTIAL_FETCH';
        isComplete = false;
        diagnosticMessage = effectiveMode === 'BOT'
          ? `Telegram bot-token MTProto limitation: retrieved ${uniqueCount} of ${totalReported} members (mostly administrators). Configure TELEGRAM_MT_PROTO_SESSION for full supergroup participant enumeration.`
          : `Telegram participant visibility or chat restrictions resulted in partial participant enumeration (${uniqueCount}/${totalReported} members available).`;
      } else if (uniqueCount < totalReported && uniqueCount < Math.floor(totalReported * 0.5)) {
        status = 'PARTIAL_FETCH';
        isComplete = false;
        diagnosticMessage = effectiveMode === 'BOT'
          ? `Telegram bot-token MTProto limitation: retrieved ${uniqueCount} of ${totalReported} members. Configure TELEGRAM_MT_PROTO_SESSION for full supergroup participant enumeration.`
          : `Telegram participant visibility or chat restrictions resulted in partial participant enumeration (${uniqueCount}/${totalReported} members available).`;
      }
    }

    return {
      status,
      authMode: effectiveMode,
      telegramTotal: totalReported || uniqueCount,
      fetchedCount: totalFetchedRecords,
      uniqueCount,
      excludedCount,
      eligibleCount,
      members: eligibleMembers,
      isComplete,
      diagnosticMessage
    };
  }

  /**
   * Helper: Builds 10-member clickable emoji mention batches.
   * Format: <a href="tg://user?id=123">😀</a>
   */
  public static buildEmojiMentionBatches(
    members: CachedMember[],
    customText: string = '',
    chunkSize: number = 10,
    emojisList: readonly string[] = [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
      '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚',
      '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩',
      '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖',
      '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
      '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔',
      '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦',
      '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴',
      '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿',
      '👹', '👺', '🤡', '💩', '👻', '💀', '☠️', '👽', '👾', '🤖',
      '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️',
      '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐',
      '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐',
      '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳',
      '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🐕', '🐩', '🦮', '🐕‍🦺',
      '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄', '🦓',
      '🦌', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽',
      '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏',
      '🦛', '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔',
      '🦇', '🐻', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡',
      '🐾', '🦃', '🐔', '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️',
      '🦅', '🦆', '🦢', '🦉', '🦤', '🪶', '🦩', '🦚', '🦜', '🐸',
      '🐊', '🐢', '🦎', '🐍', '🐲', '🐉', '🦕', '🦖', '🐳', '🐋',
      '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🪸', '🐌',
      '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳', '🕷️', '🕸️',
      '🦂', '🦟', '🪰', '🪱', '🦠', '💐', '🌸', '💮', '🪷', '🏵️',
      '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳',
      '🌴', '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🪹',
      '🪺', '🍄', '🌰', '🦀', '🦞', '🦐', '🦑', '🔥', '⭐', '🌟',
      '✨', '⚡', '💥', '💯', '💫', '🎈', '🎉', '🎊', '🎁', '🏆'
    ]
  ): { mentions: string[]; chunks: string[] } {
    const mentions: string[] = [];
    const seen = new Set<number>();

    for (const m of members) {
      if (!m || !m.userId) continue;
      const uid = Number(m.userId);
      if (isNaN(uid) || uid <= 0 || seen.has(uid)) continue;
      seen.add(uid);

      const emoji = emojisList[Math.floor(Math.random() * emojisList.length)];
      mentions.push(`<a href="tg://user?id=${uid}">${emoji}</a>`);
    }

    if (mentions.length === 0) {
      return { mentions: [], chunks: [] };
    }

    const chunks: string[] = [];
    const cleanCustom = (customText || '').trim();

    for (let i = 0; i < mentions.length; i += chunkSize) {
      const slice = mentions.slice(i, i + chunkSize);
      const row = slice.join('');
      if (cleanCustom) {
        chunks.push(`${cleanCustom}\n\n${row}`);
      } else {
        chunks.push(row);
      }
    }

    return { mentions, chunks };
  }

  /**
   * Helper: Builds explicit Telegram MessageEntity objects for plain text with exact UTF-16 code unit offsets.
   */
  public static buildTextMentionEntities(
    members: CachedMember[],
    emojis: string[]
  ): { text: string; entities: TelegramMessageEntity[] } {
    let text = '';
    const entities: TelegramMessageEntity[] = [];

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const emoji = emojis[i % emojis.length];
      const offset = text.length; // JS string length returns UTF-16 code units
      const length = emoji.length; // Length of emoji in UTF-16 code units

      text += emoji;
      entities.push({
        type: 'text_mention',
        offset,
        length,
        user: {
          id: m.userId,
          is_bot: false,
          first_name: m.firstName || 'Member'
        }
      });
    }

    return { text, entities };
  }
}

export const mtprotoParticipantService = MtprotoParticipantService.getInstance();
