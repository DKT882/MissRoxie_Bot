import { telegramApi } from './api.js';
import { TelegramMessage, TelegramChatMember, TelegramUser, RoleLevel, ModerationLog } from './types.js';
import { db } from '../db/storage.js';
import { mapTelegramError } from './errorMapper.js';

export enum RoleRank {
  OWNER = 100,
  ADMIN = 80,
  MODERATOR = 50,
  MEMBER = 10,
  BOT = 0
}

export interface CommandContext {
  message: TelegramMessage;
  chatId: number;
  chatTitle: string;
  sender: TelegramUser;
  isAnonymousAdmin: boolean;
  authorSignature?: string;
  adminDisplayName: string;
  args: string[];
  command: string;
  rawArgs?: string;
  actor?: ActorResolution;
  auth?: AdminAuthResult;
}

export type ResolvedTarget =
  | { type: 'user'; userId: number; user: TelegramUser; source: 'reply' | 'numeric_id' | 'username' }
  | { type: 'sender_chat'; id: number; source: 'reply' }
  | { type: 'none'; error: string; source: 'none' };

export interface AdminAuthResult {
  allowed: boolean;
  reason?: string;
  actor?: ActorResolution;
}

export interface ActorResolution {
  actorUserId: number;
  actorUsername?: string;
  actorDisplayName: string;
  actorRole: RoleLevel;
  actorRank: RoleRank;
  isAnonymousAdmin: boolean;
  actorStatus?: string;
  canPromoteMembers?: boolean;
  canRestrictMembers?: boolean;
  canDeleteMessages?: boolean;
  actorMember?: TelegramChatMember | null;
  customRole?: string;
}

export interface TargetResolution {
  targetUserId: number;
  targetUser?: TelegramUser;
  targetUsername?: string;
  targetRole: RoleLevel;
  targetRank: RoleRank;
  targetStatus: string;
  targetMember: TelegramChatMember | null;
  customRole: string;
  source: 'reply' | 'numeric_id' | 'username';
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
  actor?: ActorResolution;
  target?: TargetResolution;
}

export class TelegramMiddleware {
  public static isGroup(message: TelegramMessage): boolean {
    const type = message.chat?.type;
    return type === 'group' || type === 'supergroup';
  }

  public static async requireGroup(ctx: CommandContext): Promise<boolean> {
    if (!this.isGroup(ctx.message)) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '⚠️ <b>Group Command Only</b>\nThis command can only be used inside a Telegram group or supergroup.'
      );
      return false;
    }
    return true;
  }

  private static memberCache: Map<string, { member: TelegramChatMember; timestamp: number }> = new Map();
  private static adminListCache: Map<number, { admins: TelegramChatMember[]; map: Map<number, TelegramChatMember>; timestamp: number }> = new Map();

  public static clearMemberCache(chatId?: number, userId?: number): void {
    if (chatId !== undefined && userId !== undefined) {
      this.memberCache.delete(`${chatId}_${userId}`);
      this.adminListCache.delete(chatId);
      telegramApi.clearChatMemberCache(chatId, userId);
    } else if (chatId !== undefined) {
      const prefix = `${chatId}_`;
      for (const k of this.memberCache.keys()) {
        if (k.startsWith(prefix)) {
          this.memberCache.delete(k);
        }
      }
      this.adminListCache.delete(chatId);
      telegramApi.clearChatMemberCache(chatId);
    } else {
      this.memberCache.clear();
      this.adminListCache.clear();
      telegramApi.clearChatMemberCache();
    }
  }

  public static isOwner(member: TelegramChatMember | null | undefined): boolean {
    return member?.status === 'creator';
  }

  /**
   * Primary Telegram Group Administrator Fetcher.
   * Caches for 30 seconds to optimize bandwidth while guaranteeing freshness.
   * Safely handles network and API errors.
   */
  public static async getChatAdministrators(chatId: number, forceFresh: boolean = false): Promise<TelegramChatMember[]> {
    if (typeof chatId !== 'number' || isNaN(chatId) || chatId >= 0) {
      return [];
    }

    if (!forceFresh) {
      const cached = this.adminListCache.get(chatId);
      if (cached && (Date.now() - cached.timestamp < 30 * 1000)) {
        return cached.admins;
      }
    }

    try {
      const res = await telegramApi.getChatAdministrators(chatId, forceFresh);
      if (res.ok && Array.isArray(res.result)) {
        const adminMap = new Map<number, TelegramChatMember>();
        for (const admin of res.result) {
          if (admin.user?.id) {
            adminMap.set(admin.user.id, admin);
            this.memberCache.set(`${chatId}_${admin.user.id}`, { member: admin, timestamp: Date.now() });
          }
        }
        this.adminListCache.set(chatId, {
          admins: res.result,
          map: adminMap,
          timestamp: Date.now()
        });
        return res.result;
      }
    } catch {
      // Safe fallback on network/API failure
    }

    const staleCached = this.adminListCache.get(chatId);
    if (staleCached) {
      return staleCached.admins;
    }

    return [];
  }

  /**
   * Safe fetcher for a chat member (strictly numeric user ID, never bot/anonymous proxy).
   */
  public static async getTargetMember(chatId: number, targetUserId: number, forceFresh: boolean = false): Promise<TelegramChatMember | null> {
    if (!targetUserId || targetUserId === 0 || targetUserId === 1087968824) {
      return null;
    }
    const cacheKey = `${chatId}_${targetUserId}`;
    if (!forceFresh) {
      const cached = this.memberCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
        return cached.member;
      }
    }

    try {
      const res = await telegramApi.getChatMember(chatId, targetUserId, forceFresh);
      if (res.ok && res.result) {
        this.memberCache.set(cacheKey, { member: res.result, timestamp: Date.now() });
        return res.result;
      }
    } catch {
      // Fallback
    }
    return null;
  }

  public static async getMember(chatId: number, userId: number, forceFresh: boolean = false): Promise<TelegramChatMember | null> {
    return this.getTargetMember(chatId, userId, forceFresh);
  }

  /**
   * Checks if message was sent by an anonymous administrator on behalf of the group.
   */
  public static isAnonymousAdminMessage(message: TelegramMessage, chatId: number): boolean {
    if (message.sender_chat && message.sender_chat.id === chatId) {
      return true;
    }
    if (message.from?.id === 1087968824 && message.sender_chat && message.sender_chat.id === chatId) {
      return true;
    }
    return false;
  }

  /**
   * STEP 1 — CENTRALIZED ACTOR RESOLUTION
   * Evaluates ONLY the actor who executed the command.
   * Completely separated from target resolution.
   * Uses getChatAdministrators() as primary ground-truth admin source.
   */
  public static async resolveActor(ctx: CommandContext): Promise<ActorResolution> {
    if (ctx.actor) {
      return ctx.actor;
    }

    // 1. Anonymous Administrator - must strictly match current group chatId
    const senderChatMatches = ctx.message.sender_chat ? ctx.message.sender_chat.id === ctx.chatId : true;
    const isAnon = (ctx.isAnonymousAdmin && senderChatMatches) || this.isAnonymousAdminMessage(ctx.message, ctx.chatId);

    if (isAnon && senderChatMatches) {
      const resolved: ActorResolution = {
        actorUserId: 1087968824,
        actorUsername: undefined,
        actorDisplayName: ctx.authorSignature ? `${ctx.authorSignature} (Anonymous Admin)` : 'Anonymous Admin',
        actorRole: 'ADMIN',
        actorRank: RoleRank.ADMIN,
        isAnonymousAdmin: true,
        actorStatus: 'anonymous_admin',
        canPromoteMembers: true,
        canRestrictMembers: true,
        canDeleteMessages: true,
        actorMember: null,
        customRole: 'NONE'
      };
      ctx.actor = resolved;
      return resolved;
    }

    const actorUserId = ctx.sender?.id || ctx.message.from?.id || 0;
    const actorUsername = ctx.sender?.username || ctx.message.from?.username;
    const actorDisplayName = ctx.adminDisplayName || (actorUsername ? `@${actorUsername}` : (ctx.sender?.first_name || `User ${actorUserId}`));

    if (!actorUserId || actorUserId === 0) {
      const resolved: ActorResolution = {
        actorUserId: 0,
        actorDisplayName: 'Unknown User',
        actorRole: 'MEMBER',
        actorRank: RoleRank.MEMBER,
        isAnonymousAdmin: false,
        actorStatus: 'unknown',
        canPromoteMembers: false,
        canRestrictMembers: false,
        canDeleteMessages: false,
        actorMember: null,
        customRole: 'NONE'
      };
      ctx.actor = resolved;
      return resolved;
    }

    // 2. Primary Admin Check: getChatAdministrators()
    let member: TelegramChatMember | null | undefined = null;
    let fetchedAdmins = false;
    if (this.isGroup(ctx.message)) {
      await this.getChatAdministrators(ctx.chatId);
      const cachedAdmins = this.adminListCache.get(ctx.chatId);
      if (cachedAdmins) {
        fetchedAdmins = true;
        member = cachedAdmins.map.get(actorUserId);
      }
    }

    // 3. Fallback / Detailed Member Lookup ONLY if getChatAdministrators failed / was not available
    if (!member && !fetchedAdmins) {
      member = await this.getTargetMember(ctx.chatId, actorUserId);
    }

    const customRole = db.getCustomRole(ctx.chatId, actorUserId);

    let resolved: ActorResolution;
    if (member) {
      if (member.status === 'creator') {
        resolved = {
          actorUserId,
          actorUsername,
          actorDisplayName,
          actorRole: 'OWNER',
          actorRank: RoleRank.OWNER,
          isAnonymousAdmin: false,
          actorStatus: 'creator',
          canPromoteMembers: true,
          canRestrictMembers: true,
          canDeleteMessages: true,
          actorMember: member,
          customRole
        };
      } else if (member.status === 'administrator') {
        resolved = {
          actorUserId,
          actorUsername,
          actorDisplayName,
          actorRole: 'ADMIN',
          actorRank: RoleRank.ADMIN,
          isAnonymousAdmin: false,
          actorStatus: 'administrator',
          canPromoteMembers: !!member.can_promote_members,
          canRestrictMembers: member.can_restrict_members !== undefined ? !!member.can_restrict_members : true,
          canDeleteMessages: member.can_delete_messages !== undefined ? !!member.can_delete_messages : true,
          actorMember: member,
          customRole
        };
      } else {
        resolved = {
          actorUserId,
          actorUsername,
          actorDisplayName,
          actorRole: customRole === 'MODERATOR' ? 'MODERATOR' : 'MEMBER',
          actorRank: customRole === 'MODERATOR' ? RoleRank.MODERATOR : RoleRank.MEMBER,
          isAnonymousAdmin: false,
          actorStatus: member.status || 'member',
          canPromoteMembers: false,
          canRestrictMembers: false,
          canDeleteMessages: false,
          actorMember: member,
          customRole: customRole || 'NONE'
        };
      }
    } else if (customRole === 'MODERATOR') {
      resolved = {
        actorUserId,
        actorUsername,
        actorDisplayName,
        actorRole: 'MODERATOR',
        actorRank: RoleRank.MODERATOR,
        isAnonymousAdmin: false,
        actorStatus: 'member',
        canPromoteMembers: false,
        canRestrictMembers: false,
        canDeleteMessages: false,
        actorMember: null,
        customRole: 'MODERATOR'
      };
    } else {
      resolved = {
        actorUserId,
        actorUsername,
        actorDisplayName,
        actorRole: 'MEMBER',
        actorRank: RoleRank.MEMBER,
        isAnonymousAdmin: false,
        actorStatus: 'member',
        canPromoteMembers: false,
        canRestrictMembers: false,
        canDeleteMessages: false,
        actorMember: null,
        customRole: 'NONE'
      };
    }

    ctx.actor = resolved;
    return resolved;
  }

  /**
   * CENTRAL ADMIN AUTHORIZATION
   * Checks whether the actor is an OWNER, ADMINISTRATOR, or valid ANONYMOUS ADMIN in a group.
   */
  public static async requireAdmin(
    ctx: CommandContext,
    silent: boolean = false
  ): Promise<AdminAuthResult> {
    if (ctx.auth) {
      return ctx.auth;
    }

    // 1. Group Check
    if (!this.isGroup(ctx.message)) {
      const reason = '❌ Roxie moderation commands are available only inside groups.';
      if (!silent) {
        await telegramApi.sendMessage(ctx.chatId, reason, {
          reply_to_message_id: ctx.message?.message_id
        });
      }
      const res: AdminAuthResult = {
        allowed: false,
        reason
      };
      ctx.auth = res;
      return res;
    }

    // 2. Resolve Actor
    const actor = await this.resolveActor(ctx);

    // 3. Evaluate Authorization
    const isAuthorized =
      actor.isAnonymousAdmin ||
      actor.actorRole === 'OWNER' ||
      actor.actorStatus === 'creator' ||
      actor.actorRole === 'ADMIN' ||
      actor.actorStatus === 'administrator';

    console.log(`[AUTH] chatId=${ctx.chatId} userId=${actor.actorUserId} role=${actor.actorRole} status=${actor.actorStatus} result=${isAuthorized ? 'AUTHORIZED' : 'DENIED'}`);

    if (!isAuthorized) {
      const reason = '❌ This bot is available only to group administrators.';
      if (!silent) {
        await telegramApi.sendMessage(ctx.chatId, reason, {
          reply_to_message_id: ctx.message?.message_id
        });
      }
      const res: AdminAuthResult = {
        allowed: false,
        reason,
        actor
      };
      ctx.auth = res;
      return res;
    }

    const res: AdminAuthResult = {
      allowed: true,
      actor
    };
    ctx.auth = res;
    return res;
  }

  /**
   * STRICT LUSTMODE PERMISSION CHECK
   * Permitted:
   * 1. Group Owner (creator status in current group) -> ALLOWED
   * 2. Administrator directly promoted by the group owner (administrator status AND can_be_edited !== true) -> ALLOWED
   * 3. Anonymous Admin (acting on behalf of group) -> ALLOWED
   *
   * Denied:
   * - Private chats / DMs -> DENIED
   * - Other administrators (can_be_edited === true, e.g. promoted by bot/other admins) -> DENIED
   * - Moderators (custom role MODERATOR or non-owner promoted) -> DENIED
   * - Regular members -> DENIED
   */
  public static async requireLustmodeAdmin(
    ctx: CommandContext,
    silent: boolean = false
  ): Promise<AdminAuthResult> {
    // 1. Group Check
    if (!this.isGroup(ctx.message)) {
      const reason = '❌ /lustmode is available only inside groups.';
      if (!silent) {
        await telegramApi.sendMessage(ctx.chatId, reason, {
          reply_to_message_id: ctx.message?.message_id
        });
      }
      return {
        allowed: false,
        reason
      };
    }

    // 2. Resolve Actor with current Telegram group membership status
    const actor = await this.resolveActor(ctx);

    // Anonymous Admin matching current group
    if (actor.isAnonymousAdmin) {
      return {
        allowed: true,
        actor
      };
    }

    // Group Owner
    if (actor.actorRole === 'OWNER' || actor.actorStatus === 'creator') {
      return {
        allowed: true,
        actor
      };
    }

    // Fetch / inspect live Telegram ChatMember to ensure fresh membership verification
    const member = actor.actorMember || (actor.actorUserId ? await this.getTargetMember(ctx.chatId, actor.actorUserId) : null);
    if (member && member.status === 'creator') {
      return {
        allowed: true,
        actor
      };
    }

    // Directly promoted by owner check: In Telegram Bot API, owner-promoted admins have can_be_edited !== true (false/undefined).
    // Admins promoted by the bot or other sub-admins have can_be_edited === true.
    const isActualAdmin = (actor.actorRole === 'ADMIN' || actor.actorStatus === 'administrator' || member?.status === 'administrator') && member?.status === 'administrator';
    const isDirectlyPromotedByOwner = isActualAdmin && member?.can_be_edited !== true;

    if (isDirectlyPromotedByOwner) {
      return {
        allowed: true,
        actor
      };
    }

    // All others: Other admins (can_be_edited === true), moderators, regular members -> DENIED
    const reason = '❌ Only the group owner and administrators directly promoted by the owner can use /lustmode.';
    if (!silent) {
      await telegramApi.sendMessage(ctx.chatId, reason, {
        reply_to_message_id: ctx.message?.message_id
      });
    }

    return {
      allowed: false,
      reason,
      actor
    };
  }

  public static async requireModeratorOrAdmin(ctx: CommandContext, silent: boolean = false): Promise<boolean> {
    const actor = await this.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      if (!silent) {
        await telegramApi.sendMessage(
          ctx.chatId,
          '❌ This bot is available only to group administrators.',
          { reply_to_message_id: ctx.message.message_id }
        );
      }
      return false;
    }
    return true;
  }

  /**
   * ONE Central Authorization Helper for checking if a user ID is a group admin/owner.
   * Compares strictly by numeric Telegram user ID.
   * Uses getChatAdministrators() as primary source with getTargetMember fallback.
   */
  public static async isUserGroupAdmin(
    chatId: number,
    userId: number,
    forceFresh: boolean = false
  ): Promise<boolean> {
    // 1. Validate chat type (group/supergroup)
    if (typeof chatId !== 'number' || isNaN(chatId) || chatId >= 0) {
      return false;
    }

    // 2. Validate numeric Telegram user ID
    if (typeof userId !== 'number' || isNaN(userId) || userId <= 0 || userId === 1087968824) {
      return false;
    }

    // 3. Primary Source: Obtain current Telegram admin list via getChatAdministrators()
    const admins = await this.getChatAdministrators(chatId, forceFresh);
    if (admins && admins.length > 0) {
      const cachedEntry = this.adminListCache.get(chatId);
      const adminMember = cachedEntry?.map.get(userId);
      if (adminMember) {
        return adminMember.status === 'creator' || adminMember.status === 'administrator';
      }
    }

    // 4. Secondary Source / Fallback: getTargetMember
    const member = await this.getTargetMember(chatId, userId, forceFresh);
    if (member) {
      return member.status === 'creator' || member.status === 'administrator';
    }

    return false;
  }

  public static async isAdmin(chatId: number, userId?: number, message?: TelegramMessage): Promise<boolean> {
    if (message && this.isAnonymousAdminMessage(message, chatId)) {
      return true;
    }
    if (typeof userId === 'number' && userId > 0 && userId !== 1087968824) {
      return this.isUserGroupAdmin(chatId, userId);
    }
    return false;
  }

  /**
   * STEP 2 — CENTRALIZED TARGET RESOLUTION
   * Strict Priority:
   * 1. Explicit Numeric User ID or @username in arguments (highest specificity)
   * 2. Replied Message (if no explicit target argument given)
   * 3. Fallback to username string in arguments lookup in cache
   *
   * NEVER falls back to actor. NEVER guesses.
   */
  public static async resolveTargetUser(ctx: CommandContext, args?: string[]): Promise<ResolvedTarget> {
    const effectiveArgs = args || ctx.args;
    const cleanCmd = ctx.command.toLowerCase().split('@')[0];

    // 1. Check if first argument is an EXPLICIT target (@username or numeric user ID)
    if (effectiveArgs && effectiveArgs.length > 0) {
      const firstArg = effectiveArgs[0].trim();

      // Explicit numeric user ID
      if (/^\d{3,16}$/.test(firstArg)) {
        const userId = parseInt(firstArg, 10);
        const cached = db.findUserById(userId, ctx.chatId);
        return {
          type: 'user',
          userId,
          user: cached ? {
            id: cached.userId,
            is_bot: false,
            first_name: cached.firstName,
            last_name: cached.lastName,
            username: cached.username
          } : {
            id: userId,
            is_bot: false,
            first_name: `User ${userId}`
          },
          source: 'numeric_id'
        };
      }

      // Explicit @username
      if (firstArg.startsWith('@')) {
        const username = firstArg.replace(/^@/, '');
        const known = db.findUserByUsername(username, ctx.chatId);
        if (known) {
          return {
            type: 'user',
            userId: known.userId,
            user: {
              id: known.userId,
              is_bot: false,
              first_name: known.firstName,
              last_name: known.lastName,
              username: known.username
            },
            source: 'username'
          };
        }

        return {
          type: 'none',
          source: 'none',
          error: `⚠️ Could not find a member with username @${username} in local group memory.\nPlease reply to their message and use ${cleanCmd}`
        };
      }
    }

    // 2. PRIMARY (When no explicit @user/ID argument): Reply to a message
    if (ctx.message.reply_to_message) {
      const repliedMessage = ctx.message.reply_to_message;

      // Check if replied to anonymous admin or channel sender
      if (!repliedMessage.from && repliedMessage.sender_chat) {
        return {
          type: 'sender_chat',
          id: repliedMessage.sender_chat.id,
          source: 'reply'
        };
      }

      if (repliedMessage.from?.id === 1087968824 || (repliedMessage.sender_chat && repliedMessage.sender_chat.id === ctx.chatId)) {
        return {
          type: 'sender_chat',
          id: repliedMessage.sender_chat?.id || 1087968824,
          source: 'reply'
        };
      }

      if (repliedMessage.from) {
        db.cacheUser(repliedMessage.from, ctx.chatId);
        return {
          type: 'user',
          userId: repliedMessage.from.id,
          user: repliedMessage.from,
          source: 'reply'
        };
      }
    }

    // 3. Arguments without @ prefix (bare username matching cache)
    if (effectiveArgs && effectiveArgs.length > 0) {
      const firstArg = effectiveArgs[0].trim();
      if (/^[a-zA-Z0-9_]{4,32}$/.test(firstArg)) {
        const known = db.findUserByUsername(firstArg, ctx.chatId);
        if (known) {
          return {
            type: 'user',
            userId: known.userId,
            user: {
              id: known.userId,
              is_bot: false,
              first_name: known.firstName,
              last_name: known.lastName,
              username: known.username
            },
            source: 'username'
          };
        }
      }
    }

    // No target provided
    if (cleanCmd === '/demote' || cleanCmd.includes('demote')) {
      return {
        type: 'none',
        source: 'none',
        error: '⚠️ Reply to an administrator\'s message or provide their user ID/username.'
      };
    }

    return {
      type: 'none',
      source: 'none',
      error: `⚠️ Please reply to the user's message or specify @username / user ID with ${cleanCmd}`
    };
  }

  /**
   * STEP 3 — BOT TELEGRAM PERMISSION CHECK
   * Exclusively checks the BOT's OWN Telegram permissions via getChatMember(chatId, botId).
   * NEVER inspects actor or target permissions here.
   */
  public static async checkBotPermissions(
    chatId: number,
    permission:
      | 'can_restrict_members'
      | 'can_delete_messages'
      | 'can_promote_members'
      | 'can_manage_chat'
      | 'can_pin_messages'
      | 'promote_members'
      | 'restrict_members'
      | 'delete_messages'
      | 'pin_messages'
      | 'manage_chat' = 'can_restrict_members'
  ): Promise<{
    allowed: boolean;
    reason?: string;
    botMember?: TelegramChatMember;
  }> {
    const meRes = await telegramApi.getMe();
    if (!meRes.ok || !meRes.result) {
      return {
        allowed: false,
        reason: 'Bot could not verify its own identity with Telegram.'
      };
    }

    const botId = meRes.result.id;
    let botMember = await this.getTargetMember(chatId, botId);
    if (!botMember || (botMember.status !== 'administrator' && botMember.status !== 'creator')) {
      // Retry once with a guaranteed fresh fetch to eliminate stale cache false negatives
      botMember = await this.getTargetMember(chatId, botId, true);
      if (!botMember || (botMember.status !== 'administrator' && botMember.status !== 'creator')) {
        return {
          allowed: false,
          reason: '❌ The bot lacks administrator privileges in this group. Please promote the bot to Administrator.',
          botMember: botMember || undefined
        };
      }
    }

    if (botMember.status === 'creator') {
      return { allowed: true, botMember };
    }

    const normalizedPerm = permission.startsWith('can_') ? permission : `can_${permission}`;

    // If specific permission check fails on cached object, do a fresh fetch to be certain
    if (
      (normalizedPerm === 'can_restrict_members' && !botMember.can_restrict_members) ||
      (normalizedPerm === 'can_delete_messages' && !botMember.can_delete_messages) ||
      (normalizedPerm === 'can_promote_members' && !botMember.can_promote_members) ||
      (normalizedPerm === 'can_pin_messages' && !botMember.can_pin_messages)
    ) {
      const freshBot = await this.getTargetMember(chatId, botId, true);
      if (freshBot) botMember = freshBot;
    }

    if (normalizedPerm === 'can_restrict_members' && !botMember.can_restrict_members) {
      return {
        allowed: false,
        reason: '❌ I don\'t have permission to restrict members.',
        botMember
      };
    }

    if (normalizedPerm === 'can_delete_messages' && !botMember.can_delete_messages) {
      return {
        allowed: false,
        reason: '❌ The bot requires the "Delete Messages" permission to perform this action.',
        botMember
      };
    }

    if (normalizedPerm === 'can_promote_members' && !botMember.can_promote_members) {
      return {
        allowed: false,
        reason: '❌ The bot needs the "Add New Admins" administrator permission to modify administrator rights.',
        botMember
      };
    }

    if (normalizedPerm === 'can_pin_messages' && !botMember.can_pin_messages) {
      return {
        allowed: false,
        reason: '❌ The bot requires the "Pin Messages" administrator permission to pin messages.',
        botMember
      };
    }

    return { allowed: true, botMember };
  }

  public static async requireBotPermission(
    chatId: number,
    permission:
      | 'can_restrict_members'
      | 'can_delete_messages'
      | 'can_promote_members'
      | 'can_manage_chat'
      | 'can_pin_messages'
      | 'promote_members'
      | 'restrict_members'
      | 'delete_messages'
      | 'pin_messages'
      | 'manage_chat' = 'can_restrict_members'
  ) {
    return this.checkBotPermissions(chatId, permission);
  }

  /**
   * STEP 4 & 5 — COMPREHENSIVE MODERATION PIPELINE VALIDATOR
   * Strict Validation Order:
   * 1. Check Group Context
   * 2. Resolve Actor
   * 3. Validate Actor's Telegram Permission (MissRose model)
   * 4. Resolve Target User
   * 5. Target Identity, Bot Identity & Self-Targeting Guards
   * 6. Resolve Target Telegram Status & Custom Role
   * 7. Target Role & Owner Protection
   * 8. Target Administrator Status for Demotion / Promotion
   * 9. Non-Demote/Promote Hierarchy Comparison (Actor vs Target)
   * 10. Fetch Bot ChatMember & Verify Bot Telegram Capabilities
   * 11. Check Target Editability (can_be_edited) for Demotion
   */
  public static async validateModerationAction(
    ctx: CommandContext,
    action: 'kick' | 'ban' | 'unban' | 'mute' | 'unmute' | 'tmute' | 'tban' | 'dban' | 'dmute' | 'dkick' | 'sban' | 'smute' | 'skick' | 'demote' | 'promote' | 'permissions' | 'warn'
  ): Promise<ValidationResult> {
    // 1. Group Check
    if (!this.isGroup(ctx.message)) {
      return { allowed: false, reason: '❌ Roxie moderation commands are available only inside groups.' };
    }

    // 2. Resolve Actor
    const actor = await this.resolveActor(ctx);

    // 3. Validate Actor's Telegram Permissions
    if (action === 'demote' || action === 'promote' || action === 'permissions') {
      const canActorManageAdmins =
        actor.actorRole === 'OWNER' ||
        actor.isAnonymousAdmin ||
        (actor.actorRole === 'ADMIN' && actor.canPromoteMembers === true);

      if (!canActorManageAdmins) {
        return {
          allowed: false,
          reason: action === 'promote'
            ? '❌ You need the "Add New Admins" administrator permission to promote members.'
            : action === 'permissions'
            ? '❌ You need the "Add New Admins" administrator permission to edit administrator permissions.'
            : '❌ You need the "Add New Admins" administrator permission to demote administrators.',
          actor
        };
      }
    } else if (action === 'warn') {
      if (actor.actorRank < RoleRank.MODERATOR) {
        return {
          allowed: false,
          reason: '❌ This bot is available only to group administrators.',
          actor
        };
      }
    } else {
      // General moderation actions: kick, ban, unban, mute, unmute, tmute, tban, dban, dmute, dkick, sban, smute, skick
      if (actor.actorRank < RoleRank.ADMIN) {
        return {
          allowed: false,
          reason: '❌ This bot is available only to group administrators.',
          actor
        };
      }

      if (actor.actorRole === 'ADMIN' && !actor.isAnonymousAdmin && actor.canRestrictMembers === false) {
        return {
          allowed: false,
          reason: '❌ You need the "Ban Users" (Restrict Members) administrator permission to perform this action.',
          actor
        };
      }

      if ((action === 'dban' || action === 'dmute' || action === 'dkick' || action === 'sban' || action === 'smute' || action === 'skick') &&
          actor.actorRole === 'ADMIN' && !actor.isAnonymousAdmin && actor.canDeleteMessages === false) {
        return {
          allowed: false,
          reason: '❌ You need the "Delete Messages" administrator permission to perform this action.',
          actor
        };
      }
    }

    // 4. Resolve Target
    const resolvedTarget = await this.resolveTargetUser(ctx);
    if (resolvedTarget.type === 'sender_chat') {
      return {
        allowed: false,
        reason: action === 'promote'
          ? '❌ Anonymous administrators and channels cannot be used as promotion targets.'
          : action === 'permissions'
          ? '❌ Anonymous administrators and channels cannot have their permissions edited.'
          : '⚠️ Cannot perform moderation actions against anonymous administrators or channels.',
        actor
      };
    }

    if (resolvedTarget.type !== 'user') {
      return {
        allowed: false,
        reason: (action === 'promote' || action === 'permissions') && (!resolvedTarget.error || resolvedTarget.error.includes('reply'))
          ? '❌ I couldn\'t identify that user. Reply to their message or provide a valid Telegram ID.'
          : resolvedTarget.error,
        actor
      };
    }

    const targetUserId = resolvedTarget.userId;

    // 5. Target Identity, Bot Identity & Self-Targeting Guards
    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id;
    if (botId && targetUserId === botId) {
      return {
        allowed: false,
        reason: action === 'demote'
          ? '❌ Cannot demote the bot itself.'
          : action === 'promote'
          ? '❌ Cannot promote the bot itself.'
          : action === 'permissions'
          ? '❌ Roxie\'s permissions cannot be edited through this command.'
          : `⚠️ Cannot ${action} the bot itself.`,
        actor
      };
    }

    if (targetUserId === 1087968824 || targetUserId === ctx.chatId) {
      return {
        allowed: false,
        reason: action === 'promote'
          ? '❌ Anonymous administrators and channels cannot be used as promotion targets.'
          : action === 'permissions'
          ? '❌ Anonymous administrators and channels cannot have their permissions edited.'
          : `⚠️ Cannot ${action} anonymous administrators or the group itself.`,
        actor
      };
    }

    if (!actor.isAnonymousAdmin && actor.actorUserId === targetUserId) {
      return {
        allowed: false,
        reason: action === 'demote'
          ? '❌ You cannot demote yourself.'
          : action === 'promote'
          ? '❌ You cannot promote yourself.'
          : action === 'permissions'
          ? '❌ You cannot edit your own permissions.'
          : '⚠️ Safety check: actor and target are the same user. Please reply to the target user\'s message.',
        actor
      };
    }

    // 6. Resolve Target Telegram Status & Custom Role
    const targetMember = await this.getTargetMember(ctx.chatId, targetUserId);
    const targetCustomRole = db.getCustomRole(ctx.chatId, targetUserId);

    let targetRole: RoleLevel = 'MEMBER';
    let targetRank: RoleRank = RoleRank.MEMBER;
    const targetStatus = targetMember?.status || 'not_in_chat';

    if (targetMember) {
      if (targetMember.status === 'creator') {
        targetRole = 'OWNER';
        targetRank = RoleRank.OWNER;
      } else if (targetMember.status === 'administrator') {
        targetRole = 'ADMIN';
        targetRank = RoleRank.ADMIN;
      } else if (targetCustomRole === 'MODERATOR') {
        targetRole = 'MODERATOR';
        targetRank = RoleRank.MODERATOR;
      }
    } else if (targetCustomRole === 'MODERATOR') {
      targetRole = 'MODERATOR';
      targetRank = RoleRank.MODERATOR;
    }

    const target: TargetResolution = {
      targetUserId,
      targetUser: resolvedTarget.user,
      targetUsername: resolvedTarget.user.username,
      targetRole,
      targetRank,
      targetStatus,
      targetMember,
      customRole: targetCustomRole,
      source: resolvedTarget.source
    };

    // 7. Group Owner cannot be demoted or moderated or edited by anyone
    if (targetRole === 'OWNER' || targetStatus === 'creator') {
      return {
        allowed: false,
        reason: action === 'demote'
          ? '❌ The group owner cannot be demoted.'
          : action === 'promote'
          ? '❌ That user is already the group owner.'
          : action === 'permissions'
          ? '❌ The group owner cannot have their permissions edited.'
          : '⚠️ I can\'t remove or moderate the group owner.',
        actor,
        target
      };
    }

    // 8. Target Administrator Status for Demotion / Promotion / Permissions
    if (action === 'demote' || action === 'permissions') {
      if (targetStatus !== 'administrator') {
        return {
          allowed: false,
          reason: '❌ That user is not currently an administrator.',
          actor,
          target
        };
      }
    } else if (action === 'promote') {
      if (targetStatus === 'administrator') {
        return {
          allowed: false,
          reason: '❌ That user is already an administrator.',
          actor,
          target
        };
      }
      if (targetStatus === 'left' || targetStatus === 'kicked' || targetStatus === 'not_in_chat') {
        return {
          allowed: false,
          reason: '❌ That user is not currently a member of this group.',
          actor,
          target
        };
      }
    }

    // 9. Non-Demote/Promote/Permissions Hierarchy Comparison (Actor must strictly outrank Target for kick/ban/warn/mute)
    if (action !== 'demote' && action !== 'promote' && action !== 'permissions' && actor.actorRank <= targetRank) {
      if (targetRole === 'ADMIN') {
        return {
          allowed: false,
          reason: action === 'warn'
            ? '⚠️ I can\'t warn an administrator.'
            : (action === 'mute' || action === 'tmute' || action === 'dmute' || action === 'smute')
            ? '⚠️ I can\'t restrict another administrator.'
            : '⚠️ I can\'t remove another administrator.',
          actor,
          target
        };
      }
      if (targetRole === 'MODERATOR' && actor.actorRole === 'MODERATOR') {
        return {
          allowed: false,
          reason: '⚠️ Moderators cannot moderate other moderators.',
          actor,
          target
        };
      }
      return {
        allowed: false,
        reason: '⚠️ Hierarchy restriction: You cannot moderate a member with equal or higher authority.',
        actor,
        target
      };
    }

    // 10. Fetch Bot ChatMember & Verify Bot Telegram Capabilities
    if (action !== 'warn') {
      const requiredBotPerm = (action === 'demote' || action === 'promote' || action === 'permissions')
        ? 'can_promote_members'
        : 'can_restrict_members';

      const botCheck = await this.checkBotPermissions(ctx.chatId, requiredBotPerm);
      if (!botCheck.allowed) {
        return {
          allowed: false,
          reason: action === 'promote'
            ? '❌ The bot needs the "Add New Admins" administrator permission to promote members.'
            : action === 'permissions'
            ? '❌ The bot needs the "Add New Admins" administrator permission to modify administrator rights.'
            : botCheck.reason,
          actor,
          target
        };
      }

      // Check Delete Messages capability for delete/silent variants
      if (action === 'dban' || action === 'dmute' || action === 'dkick' || action === 'sban' || action === 'smute' || action === 'skick') {
        const deleteCheck = await this.checkBotPermissions(ctx.chatId, 'can_delete_messages');
        if (!deleteCheck.allowed) {
          return {
            allowed: false,
            reason: '❌ The bot requires the "Delete Messages" permission to perform this action.',
            actor,
            target
          };
        }
      }
    }

    // 11. Target Editability (can_be_edited) Check for Demotion & Permissions
    if ((action === 'demote' || action === 'permissions') && targetMember && targetMember.status === 'administrator') {
      if (targetMember.can_be_edited === false) {
        return {
          allowed: false,
          reason: action === 'permissions'
            ? '❌ Telegram does not allow Roxie to modify this administrator.'
            : '⚠️ I don\'t have permission to modify this administrator. They may have been promoted by a higher-level administrator or are outside my admin hierarchy.',
          actor,
          target
        };
      }
    }

    // 12. All Validations Passed
    return {
      allowed: true,
      actor,
      target
    };
  }

  /**
   * STEP 6 — AUDIT LOGGING HELPER
   */
  public static logAudit(params: {
    chatId: number;
    chatTitle?: string;
    actor: ActorResolution;
    target?: TargetResolution;
    command: string;
    action: ModerationLog['action'];
    result: 'success' | 'denied' | 'error';
    reason?: string;
    details?: string;
    telegramError?: string;
  }): ModerationLog {
    const entry = db.addLog({
      chatId: params.chatId,
      chatTitle: params.chatTitle,
      groupId: params.chatId,
      actorId: params.actor.actorUserId,
      actorUsername: params.actor.actorUsername,
      actorRole: params.actor.actorRole,
      adminUserId: params.actor.actorUserId,
      adminUsername: params.actor.actorDisplayName,
      targetId: params.target?.targetUserId,
      targetUserId: params.target?.targetUserId,
      targetUsername: params.target?.targetUsername,
      targetTelegramStatus: params.target?.targetStatus,
      targetCustomRole: params.target?.customRole,
      command: params.command,
      action: params.action,
      result: params.result,
      reason: params.reason,
      details: params.details,
      telegramError: params.telegramError
    });

    console.log('[MODERATION AUDIT]', {
      group_id: params.chatId,
      actor_id: params.actor.actorUserId,
      actor_username: params.actor.actorUsername,
      actor_role: params.actor.actorRole,
      target_id: params.target?.targetUserId,
      target_username: params.target?.targetUsername,
      target_telegram_status: params.target?.targetStatus,
      target_custom_role: params.target?.customRole,
      command: params.command,
      action: params.action,
      result: params.result,
      telegram_error: params.telegramError || null
    });

    return entry;
  }
}
