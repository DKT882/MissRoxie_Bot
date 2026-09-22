import { TelegramClient, Api, utils } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { CachedMember, TelegramMessageEntity } from './types.js';
import { logDebug } from '../observability/logger.js';

export type ParticipantFetchStatus = 'FULL_FETCH' | 'PARTIAL_FETCH' | 'FETCH_FAILED';

export interface ParticipantFetchResult {
  status: ParticipantFetchStatus;
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
  constructor(message: string = 'MTProto client is not configured on this server.') {
    super(message);
    this.name = 'MTProtoNotConfiguredError';
  }
}

export class MTProtoAuthError extends Error {
  public readonly code = 'AUTH_FAILED';
  constructor(message: string = 'MTProto authentication failed.') {
    super(message);
    this.name = 'MTProtoAuthError';
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
  constructor(message: string = 'Telegram did not allow Roxie to retrieve the complete member list for this group.') {
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
  private connectPromise: Promise<TelegramClient> | null = null;

  // Active chat fetch locks to prevent concurrent /all operations for the same group
  private static activeChatLocks: Set<number> = new Set();

  public static getInstance(): MtprotoParticipantService {
    if (!MtprotoParticipantService.instance) {
      MtprotoParticipantService.instance = new MtprotoParticipantService();
    }
    return MtprotoParticipantService.instance;
  }

  public isConfigured(): boolean {
    const apiId = process.env.TELEGRAM_API_ID?.trim();
    const apiHash = process.env.TELEGRAM_API_HASH?.trim();
    const session = process.env.TELEGRAM_MT_PROTO_SESSION?.trim();
    return Boolean(apiId && apiHash && session && !isNaN(Number(apiId)));
  }

  public getConfigurationStatus(): {
    isConfigured: boolean;
    hasApiId: boolean;
    hasApiHash: boolean;
    hasSession: boolean;
    isConnected: boolean;
  } {
    const apiId = process.env.TELEGRAM_API_ID?.trim();
    const apiHash = process.env.TELEGRAM_API_HASH?.trim();
    const session = process.env.TELEGRAM_MT_PROTO_SESSION?.trim();

    return {
      isConfigured: this.isConfigured(),
      hasApiId: Boolean(apiId && !isNaN(Number(apiId))),
      hasApiHash: Boolean(apiHash && apiHash.length > 0),
      hasSession: Boolean(session && session.length > 0),
      isConnected: this.isConnected
    };
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

  public async getClient(): Promise<TelegramClient> {
    if (this.client && this.isConnected) {
      return this.client;
    }

    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = (async () => {
      if (!this.isConfigured()) {
        throw new MTProtoNotConfiguredError(
          'MTProto credentials (TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_MT_PROTO_SESSION) are not configured.'
        );
      }

      const apiId = parseInt(process.env.TELEGRAM_API_ID!.trim(), 10);
      const apiHash = process.env.TELEGRAM_API_HASH!.trim();
      const sessionString = process.env.TELEGRAM_MT_PROTO_SESSION!.trim();

      const stringSession = new StringSession(sessionString);
      const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 3,
        autoReconnect: true,
        useWSS: false,
        timeout: 25000
      });

      console.log('[MTProto] Connecting client...');
      try {
        await client.connect();
        const me = await client.getMe();
        if (!me) {
          throw new MTProtoAuthError('Telegram client connected but could not retrieve authenticated account.');
        }
        this.client = client;
        this.isConnected = true;
        console.log('[MTProto] Client authenticated successfully.');
        return client;
      } catch (err: any) {
        this.isConnected = false;
        this.client = null;
        if (err.message && (err.message.includes('AUTH_KEY') || err.message.includes('SESSION_REVOKED') || err.message.includes('401'))) {
          throw new MTProtoAuthError(`MTProto session invalid or revoked: ${err.message}`);
        }
        throw err;
      } finally {
        this.connectPromise = null;
      }
    })();

    return this.connectPromise;
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
   * Properly resolves Telegram supergroups (-100...) using the authenticated MTProto session
   * and retrieves the real MTProto access hash without ever treating the channel ID as a PeerUser.
   */
  public async resolvePeerEntity(client: TelegramClient, chatId: number | string): Promise<Api.InputChannel> {
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

    const channelIdStr = rawIdStr.substring(4);
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

    // 2. Try direct resolution via client.getInputEntity using marked ID
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
      }
    }

    // 3. If direct resolution fails or is not in cache, refresh dialogs from MTProto session
    if (!resolvedInputChannel) {
      try {
        const dialogs = await client.getDialogs({ limit: 100 });
        for (const dialog of dialogs) {
          const dialogIdStr = dialog.id ? String(dialog.id) : '';
          const entityIdStr = dialog.entity && 'id' in dialog.entity ? String(dialog.entity.id) : '';

          if (
            dialogIdStr === rawIdStr ||
            entityIdStr === channelIdStr ||
            dialogIdStr === `-${channelIdStr}`
          ) {
            if (dialog.entity instanceof Api.Channel || dialog.isChannel) {
              resolvedInputChannel = this.toInputChannel(dialog.inputEntity || dialog.entity);
              if (resolvedInputChannel) {
                break;
              }
            } else if (dialog.isGroup && !(dialog.entity instanceof Api.Channel)) {
              throw new MTProtoUnsupportedChatError(
                `Chat ${rawIdStr} is a basic group chat, not a supergroup.`
              );
            }
          }
        }
      } catch (dialogErr: any) {
        if (dialogErr instanceof MTProtoUnsupportedChatError) {
          throw dialogErr;
        }
        logDebug({
          event: 'MTPROTO_DIALOGS_REFRESH_FAILED',
          chatId: rawIdStr,
          error: dialogErr.message
        });
      }
    }

    // 4. Retry cache lookup after dialogs refresh if not already resolved
    if (!resolvedInputChannel) {
      try {
        if (client._entityCache) {
          const cached = client._entityCache.get(rawIdStr);
          resolvedInputChannel = this.toInputChannel(cached);
        }
      } catch {
        // Cache miss
      }
    }

    // 5. Retry getInputEntity with marked ID after dialogs refresh
    if (!resolvedInputChannel) {
      try {
        const retryEntity = await client.getInputEntity(rawIdStr);
        resolvedInputChannel = this.toInputChannel(retryEntity);
      } catch {
        // Still unresolved
      }
    }

    // 6. Verify channel entity resolution succeeded and account has access
    if (!resolvedInputChannel) {
      throw new MTProtoGroupResolutionError(
        `Failed to resolve Telegram chat ${rawIdStr} on MTProto: MTProto account cannot access this Telegram group.`
      );
    }

    console.log('[MTProto] resolved entity type=Channel');
    console.log('[MTProto] channel entity resolved successfully');

    return resolvedInputChannel;
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

    if (!this.isConfigured()) {
      return {
        status: 'FETCH_FAILED',
        telegramTotal: 0,
        fetchedCount: 0,
        uniqueCount: 0,
        excludedCount: 0,
        eligibleCount: 0,
        members: [],
        errorCode: 'NOT_CONFIGURED',
        error: 'MTProto is not configured (missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_MT_PROTO_SESSION).',
        isComplete: false,
        diagnosticMessage: 'MTProto credentials not configured on the server.'
      };
    }

    let client: TelegramClient;
    try {
      client = await this.getClient();
    } catch (err: any) {
      return {
        status: 'FETCH_FAILED',
        telegramTotal: 0,
        fetchedCount: 0,
        uniqueCount: 0,
        excludedCount: 0,
        eligibleCount: 0,
        members: [],
        errorCode: err.code || 'AUTH_FAILED',
        error: err.message || 'Failed to authenticate MTProto client.',
        isComplete: false,
        diagnosticMessage: `MTProto authentication failure: ${err.message}`
      };
    }

    let inputPeer: Api.InputChannel;
    try {
      inputPeer = await this.resolvePeerEntity(client, chatId);
    } catch (err: any) {
      return {
        status: 'FETCH_FAILED',
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

    console.log(`[ALL] starting full Telegram member fetch chatId=${chatId}`);
    console.log('[MTProto] fetching participants...');

    const userMap = new Map<number, Api.User>();
    let totalReported = 0;
    let totalFetchedRecords = 0;
    const pageSize = 200; // Telegram maximum limit per request
    let offset = 0;
    let hasMore = true;
    let prevUserCount = 0;
    let loopIterations = 0;
    const maxIterations = 500; // Safety guard for 100,000+ members

    try {
      while (hasMore && loopIterations < maxIterations) {
        loopIterations++;

        let res: any;
        try {
          res = await client.invoke(
            new Api.channels.GetParticipants({
              channel: inputPeer,
              filter: new Api.ChannelParticipantsRecent(),
              offset,
              limit: pageSize,
              hash: BigInt(0) as any
            })
          );
        } catch (apiErr: any) {
          const errMsg = apiErr.message || '';
          if (errMsg.includes('CHAT_ADMIN_REQUIRED')) {
            return {
              status: 'FETCH_FAILED',
              telegramTotal: totalReported,
              fetchedCount: totalFetchedRecords,
              uniqueCount: userMap.size,
              excludedCount: 0,
              eligibleCount: 0,
              members: [],
              errorCode: 'CHAT_ADMIN_REQUIRED',
              error: 'Telegram did not allow Roxie to retrieve the complete member list for this group.',
              isComplete: false,
              diagnosticMessage: 'Telegram CHAT_ADMIN_REQUIRED: Admin privileges required to view participant list.'
            };
          }

          if (errMsg.includes('FLOOD_WAIT_') || apiErr.seconds) {
            const waitSec = apiErr.seconds || parseInt(errMsg.replace(/\D/g, ''), 10) || 30;
            console.warn(`[MTProto] flood wait: ${waitSec}s`);
            return {
              status: 'FETCH_FAILED',
              telegramTotal: totalReported,
              fetchedCount: totalFetchedRecords,
              uniqueCount: userMap.size,
              excludedCount: 0,
              eligibleCount: 0,
              members: [],
              errorCode: 'FLOOD_WAIT',
              error: `Telegram rate limit: Flood wait of ${waitSec} seconds required.`,
              isComplete: false,
              diagnosticMessage: `Flood wait required: ${waitSec}s`
            };
          }

          if (
            errMsg.includes('CHANNEL_PRIVATE') ||
            errMsg.includes('CHAT_NOT_MODIFIED') ||
            errMsg.includes('USER_NOT_PARTICIPANT') ||
            errMsg.includes('CHANNEL_INVALID')
          ) {
            return {
              status: 'FETCH_FAILED',
              telegramTotal: totalReported,
              fetchedCount: totalFetchedRecords,
              uniqueCount: userMap.size,
              excludedCount: 0,
              eligibleCount: 0,
              members: [],
              errorCode: 'ACCESS_DENIED',
              error: 'MTProto account cannot access this Telegram group.',
              isComplete: false,
              diagnosticMessage: `Access error: ${errMsg}`
            };
          }

          throw apiErr;
        }

        if (res instanceof Api.channels.ChannelParticipants) {
          totalReported = res.count || totalReported;
          const users = res.users || [];
          const participants = res.participants || [];

          totalFetchedRecords += participants.length || users.length;

          console.log(
            `[MTProto] page=${loopIterations} fetched=${users.length} total=${totalReported}`
          );

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
            userMap.size === prevUserCount
          ) {
            hasMore = false;
            break;
          }

          prevUserCount = userMap.size;
        } else if (res instanceof Api.channels.ChannelParticipantsNotModified) {
          hasMore = false;
          break;
        } else {
          // Other responses or basic group structures
          hasMore = false;
          break;
        }
      }
    } catch (fetchErr: any) {
      return {
        status: 'FETCH_FAILED',
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

      const rawUsername = (u.username || '').trim().replace(/^@/, '');
      const lowerUsername = rawUsername.toLowerCase();
      const firstName = (u.firstName || '').trim();
      const lastName = (u.lastName || '').trim();

      // 3. Exclude bots (via flag or username heuristic)
      if (u.bot || lowerUsername.endsWith('bot') || lowerUsername.includes('bot')) {
        excludedCount++;
        continue;
      }

      // 4. Exclude deleted accounts
      if (
        u.deleted ||
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
      // If Telegram reported 500+ members but we only retrieved 20 or less due to visibility restrictions
      if (uniqueCount < totalReported && totalReported > 50 && uniqueCount <= 20) {
        status = 'PARTIAL_FETCH';
        isComplete = false;
        diagnosticMessage = `Telegram did not allow Roxie to retrieve the complete member list for this group (Retrieved ${uniqueCount} of ${totalReported} reported members).`;
      } else if (uniqueCount < totalReported && uniqueCount < Math.floor(totalReported * 0.5)) {
        status = 'PARTIAL_FETCH';
        isComplete = false;
        diagnosticMessage = `Telegram visibility restrictions resulted in partial enumeration (${uniqueCount}/${totalReported} available).`;
      }
    }

    return {
      status,
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
      if (i === 0 && cleanCustom) {
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
