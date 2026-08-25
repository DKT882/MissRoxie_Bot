import { telegramApi } from './api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from './middleware.js';
import { db } from '../db/storage.js';
import { ModerationService } from './moderation.js';
import { messageScheduler } from './scheduler.js';
import { mapTelegramError } from './errorMapper.js';
import { TelegramCallbackQuery, InlineKeyboardMarkup, AdminPermissions, TelegramChatMember, BotCommand } from './types.js';

export const ADMIN_COMMANDS: BotCommand[] = [
  { command: 'help', description: 'Show all administrator & moderation commands' },
  { command: 'status', description: 'View bot status and group configuration' },
  { command: 'ping', description: 'Check bot responsiveness' },
  { command: 'del', description: 'Delete replied message for all group members' },
  { command: 'clear', description: 'Purge messages (e.g. /clear, /clear 5s, /clear 1m, /clear @user)' },
  { command: 'promote', description: 'Promote a member to administrator' },
  { command: 'demote', description: 'Demote an administrator to regular member' },
  { command: 'permissions', description: 'View and edit administrator permissions' },
  { command: 'kick', description: 'Remove a member from the group' },
  { command: 'ban', description: 'Ban a member from the group' },
  { command: 'unban', description: 'Unban a member from the group' },
  { command: 'warn', description: 'Issue a warning to a member' },
  { command: 'warnings', description: 'View warnings for a member' },
  { command: 'resetwarns', description: 'Clear warnings for a member' },
  { command: 'setwarnlimit', description: 'Set warning threshold before auto-ban' },
  { command: 'setmod', description: 'Assign bot moderator role' },
  { command: 'delmod', description: 'Remove bot moderator role' },
  { command: 'links', description: 'Toggle link protection filter' },
  { command: 'media', description: 'Toggle image & media protection filter' },
  { command: 'stickers', description: 'Toggle sticker protection filter' },
  { command: 'free', description: 'Allow member to send images & stickers' },
  { command: 'unfree', description: 'Revoke image & sticker permission from member' },
  { command: 'freelist', description: 'List all members exempted to send images & stickers' },
  { command: 'say', description: 'Broadcast announcement as the bot' },
  { command: 'schedule', description: 'Schedule a recurring message' },
  { command: 'listschedules', description: 'List all active scheduled messages' },
  { command: 'deleteschedule', description: 'Delete a scheduled message by ID' },
  { command: 'live', description: 'Group video and live stream info' },
  { command: 'report', description: 'Report a message to group administrators' }
];

export async function registerBotCommands(): Promise<{
  adminCommandsSet: boolean;
  defaultCommandsCleared: boolean;
  errors?: string[];
}> {
  const errors: string[] = [];

  // 1. Register admin commands for all_chat_administrators scope
  const adminRes = await telegramApi.setMyCommands(ADMIN_COMMANDS, {
    type: 'all_chat_administrators'
  });
  if (!adminRes.ok) {
    errors.push(`Failed to set admin commands: ${adminRes.description}`);
  }

  // 2. Clear default scope commands so normal members see NO auto-complete commands
  const defaultRes = await telegramApi.setMyCommands([], {
    type: 'default'
  });
  if (!defaultRes.ok) {
    errors.push(`Failed to clear default commands: ${defaultRes.description}`);
  }

  return {
    adminCommandsSet: adminRes.ok,
    defaultCommandsCleared: defaultRes.ok,
    errors: errors.length > 0 ? errors : undefined
  };
}

interface PermissionEditorSession {
  chatId: number;
  targetUserId: number;
  targetUsername?: string;
  targetFirstName?: string;
  actorUserId: number;
  initialPermissions: AdminPermissions;
  currentPermissions: AdminPermissions;
  confirmingPromote?: boolean;
  messageId?: number;
  createdAt: number;
}

export class CommandHandler {
  private static sayCooldowns: Map<number, number> = new Map();
  public static permissionSessions: Map<string, PermissionEditorSession> = new Map();

  public static async handleCommand(ctx: CommandContext): Promise<boolean> {
    const cmd = ctx.command.toLowerCase().split('@')[0]; // strip bot username if present, e.g. /ban@MissRoxie_Bot

    const handledCommands = new Set([
      '/clear', '/del', '/delete', '/kick', '/ban', '/unban', '/promote', '/demote', '/permissions',
      '/warn', '/warnings', '/resetwarns', '/setwarnlimit',
      '/setmod', '/delmod', '/links', '/media', '/images', '/stickers', '/free', '/unfree', '/freelist', '/freed',
      '/report', '/say', '/schedule', '/listschedules', '/deleteschedule',
      '/live', '/start', '/ping', '/status', '/help'
    ]);

    if (!handledCommands.has(cmd)) {
      return false;
    }

    // Centrally enforce admin-only requirement on ALL Roxie commands
    const auth = await TelegramMiddleware.requireAdmin(ctx);
    if (!auth.allowed) {
      return true; // Command was handled (denial notice dispatched)
    }

    switch (cmd) {
      case '/del':
      case '/delete':
        await this.handleDel(ctx);
        return true;
      case '/clear':
        await this.handleClear(ctx);
        return true;
      case '/kick':
        await this.handleKick(ctx);
        return true;
      case '/ban':
        await this.handleBan(ctx);
        return true;
      case '/unban':
        await this.handleUnban(ctx);
        return true;
      case '/promote':
        await this.handlePromote(ctx);
        return true;
      case '/demote':
        await this.handleDemote(ctx);
        return true;
      case '/permissions':
        await this.handlePermissions(ctx);
        return true;
      case '/warn':
        await this.handleWarn(ctx);
        return true;
      case '/warnings':
        await this.handleWarnings(ctx);
        return true;
      case '/resetwarns':
        await this.handleResetWarns(ctx);
        return true;
      case '/setwarnlimit':
        await this.handleSetWarnLimit(ctx);
        return true;
      case '/setmod':
        await this.handleSetMod(ctx);
        return true;
      case '/delmod':
        await this.handleDelMod(ctx);
        return true;
      case '/links':
        await this.handleLinksSetting(ctx);
        return true;
      case '/media':
      case '/images':
        await this.handleMediaSetting(ctx);
        return true;
      case '/stickers':
        await this.handleStickersSetting(ctx);
        return true;
      case '/free':
        await this.handleFree(ctx);
        return true;
      case '/unfree':
        await this.handleUnfree(ctx);
        return true;
      case '/freelist':
      case '/freed':
        await this.handleFreeList(ctx);
        return true;
      case '/report':
        await this.handleReport(ctx);
        return true;
      case '/say':
        await this.handleSay(ctx);
        return true;
      case '/schedule':
        await this.handleSchedule(ctx);
        return true;
      case '/listschedules':
        await this.handleListSchedules(ctx);
        return true;
      case '/deleteschedule':
        await this.handleDeleteSchedule(ctx);
        return true;
      case '/live':
        await this.handleLive(ctx);
        return true;
      case '/start':
        await this.handleStart(ctx);
        return true;
      case '/ping':
        await this.handlePing(ctx);
        return true;
      case '/status':
        await this.handleStatus(ctx);
        return true;
      case '/help':
        await this.handleHelp(ctx);
        return true;
      default:
        return false;
    }
  }

  // ==========================================
  // 1. KICK COMMAND
  // ==========================================
  private static async handleKick(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'kick');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'kick',
          action: 'kick',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot kick this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Admin kick';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await telegramApi.kickChatMember(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'kick',
        action: 'kick',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(ctx.chatId, `👢 <b>${targetTag} was removed from the group.</b>`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      const friendlyError = mapTelegramError('kick', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'kick',
        action: 'kick',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 2. BAN COMMAND
  // ==========================================
  private static async handleBan(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'ban');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'ban',
          action: 'ban',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot ban this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Admin ban';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await telegramApi.banChatMember(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'ban',
        action: 'ban',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔨 <b>${targetTag} has been banned.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('ban', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'ban',
        action: 'ban',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 3. UNBAN COMMAND
  // ==========================================
  private static async handleUnban(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'unban');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'unban',
          action: 'unban',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot unban this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);
    const res = await telegramApi.unbanChatMember(ctx.chatId, target.targetUserId, true);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'unban',
        action: 'unban',
        result: 'success',
        reason: 'Admin unban'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔓 <b>${targetTag} has been unbanned.</b>\nThey can now re-join the group with an invite link.`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('unban', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'unban',
        action: 'unban',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 4. DEMOTE COMMAND
  // ==========================================
  private static async handleDemote(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'demote');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'demote',
          action: 'demote',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot demote this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id || 0;
    const botMember = await TelegramMiddleware.getTargetMember(ctx.chatId, botId);

    // Development & Runtime Debugging Output for Actor / Bot / Target permissions
    console.log('DEMOTE DEBUG:', {
      actor: {
        id: actor.actorUserId,
        status: actor.actorStatus,
        isAnonymous: actor.isAnonymousAdmin,
        canPromoteMembers: actor.canPromoteMembers
      },
      bot: {
        id: botId,
        status: botMember?.status,
        canPromoteMembers: botMember?.can_promote_members
      },
      target: {
        id: target.targetUserId,
        status: target.targetStatus,
        canBeEdited: target.targetMember?.can_be_edited,
        canPromoteMembers: target.targetMember?.can_promote_members
      }
    });

    const res = await telegramApi.promoteChatMember(ctx.chatId, target.targetUserId, {
      is_anonymous: false,
      can_manage_chat: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_delete_messages: false,
      can_manage_video_chats: false,
      can_restrict_members: false,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: false,
      can_pin_messages: false,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false,
      can_manage_topics: false
    });

    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    if (res.ok) {
      // Step 14: Verify result with getChatMember()
      const verifyRes = await telegramApi.getChatMember(ctx.chatId, target.targetUserId);
      if (verifyRes.ok && verifyRes.result && verifyRes.result.status === 'administrator') {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor,
          target,
          command: 'demote',
          action: 'demote',
          result: 'error',
          reason: 'Telegram still reports user as administrator after demotion API call'
        });

        await telegramApi.sendMessage(
          ctx.chatId,
          `⚠️ Could not demote ${targetTag}. Telegram still reports this user as an administrator. They may have been appointed directly by the group owner.`,
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'demote',
        action: 'demote',
        result: 'success',
        reason: 'Admin demoted to regular member'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔻 <b>${targetTag} has been demoted from administrator.</b>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('demote', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'demote',
        action: 'demote',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 4b. PROMOTE COMMAND
  // ==========================================
  private static async handlePromote(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'promote');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'promote',
          action: 'promote',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot promote this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id || 0;
    const botMember = await TelegramMiddleware.getTargetMember(ctx.chatId, botId);

    // Safe debug logging for [Promote]
    console.log('[Promote]', {
      actorId: actor.actorUserId,
      actorRole: actor.actorRole,
      actorStatus: actor.actorStatus,
      actorCanPromoteMembers: actor.canPromoteMembers,
      targetId: target.targetUserId,
      targetStatus: target.targetStatus,
      botStatus: botMember?.status,
      botCanPromoteMembers: botMember?.can_promote_members
    });

    const res = await telegramApi.promoteChatMember(ctx.chatId, target.targetUserId, {
      is_anonymous: false,
      can_manage_chat: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_delete_messages: true,
      can_manage_video_chats: true,
      can_restrict_members: true,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: true,
      can_pin_messages: true,
      can_manage_topics: true,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false
    });

    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    if (res.ok) {
      // Step 9: Post-promotion verification with getChatMember()
      const verifyRes = await telegramApi.getChatMember(ctx.chatId, target.targetUserId);
      if (!verifyRes.ok || !verifyRes.result || verifyRes.result.status !== 'administrator') {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor,
          target,
          command: 'promote',
          action: 'promote',
          result: 'error',
          reason: 'Telegram did not confirm administrator status after promoteChatMember'
        });

        await telegramApi.sendMessage(
          ctx.chatId,
          `⚠️ Promotion was attempted, but I could not verify that the user became an administrator.`,
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'promote',
        action: 'promote',
        result: 'success',
        reason: 'User promoted to standard administrator'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `✅ <b>${targetTag} has been promoted to administrator.</b>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('promote', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'promote',
        action: 'promote',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 4c. PERMISSION EDITOR COMMAND (/permissions)
  // ==========================================
  private static async handlePermissions(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'permissions');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'permissions',
          action: 'permissions',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot view or edit permissions for this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    // Fetch LIVE target ChatMemberAdministrator to inspect permissions
    const liveTarget = await TelegramMiddleware.getTargetMember(ctx.chatId, target.targetUserId);
    if (!liveTarget || liveTarget.status !== 'administrator') {
      await telegramApi.sendMessage(ctx.chatId, '❌ That user is not currently an administrator.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    if (liveTarget.can_be_edited === false) {
      await telegramApi.sendMessage(ctx.chatId, '❌ Telegram does not allow Roxie to modify this administrator.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const initialPermissions = extractAdminPermissions(liveTarget);
    const currentPermissions = { ...initialPermissions };

    const sessionKey = `${ctx.chatId}:${target.targetUserId}`;
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    this.permissionSessions.set(sessionKey, {
      chatId: ctx.chatId,
      targetUserId: target.targetUserId,
      targetUsername: target.targetUsername,
      targetFirstName: target.targetUser?.first_name,
      actorUserId: actor.actorUserId,
      initialPermissions,
      currentPermissions,
      confirmingPromote: false,
      createdAt: Date.now()
    });

    const { text, reply_markup } = renderPermissionEditorUI(
      targetTag,
      target.targetUserId,
      currentPermissions,
      false,
      ctx.chatId
    );

    const sent = await telegramApi.sendMessage(ctx.chatId, text, {
      reply_to_message_id: ctx.message.message_id,
      reply_markup
    });

    if (sent.ok && sent.result?.message_id) {
      const sess = this.permissionSessions.get(sessionKey);
      if (sess) {
        sess.messageId = sent.result.message_id;
      }
    }
  }

  // ==========================================
  // 4d. CALLBACK QUERY HANDLER (Interactive Permissions UI)
  // ==========================================
  public static async handleCallbackQuery(query: TelegramCallbackQuery): Promise<boolean> {
    if (!query.data || !query.data.startsWith('p:')) {
      return false;
    }

    // Acknowledge callback immediately to dismiss Telegram client spinner
    await telegramApi.answerCallbackQuery(query.id);

    const parts = query.data.split(':');
    if (parts.length < 4) return false;

    const chatId = Number(parts[1]);
    const targetUserId = Number(parts[2]);
    const action = parts[3];

    // 1. Validate chat ID against message
    if (query.message && query.message.chat.id !== chatId) {
      await telegramApi.answerCallbackQuery(query.id, {
        text: '❌ Callback is invalid for this chat.',
        show_alert: true
      });
      return true;
    }

    // 2. Verify actor authorization live from Telegram
    const actorMember = await TelegramMiddleware.getTargetMember(chatId, query.from.id);
    const isOwner = actorMember?.status === 'creator';
    const isAdmin = actorMember?.status === 'administrator';
    const canPromote = actorMember?.can_promote_members === true;

    if (!isOwner && !(isAdmin && canPromote)) {
      await telegramApi.answerCallbackQuery(query.id, {
        text: '❌ You need the "Add New Admins" administrator permission to edit administrator permissions.',
        show_alert: true
      });
      return true;
    }

    // 3. Verify Bot Capabilities live from Telegram
    const meRes = await telegramApi.getMe();
    const botId = meRes.result?.id || 0;
    const botMember = await TelegramMiddleware.getTargetMember(chatId, botId);
    if (botMember?.status !== 'administrator' || botMember?.can_promote_members !== true) {
      await telegramApi.answerCallbackQuery(query.id, {
        text: '❌ The bot needs the "Add New Admins" administrator permission to modify administrator rights.',
        show_alert: true
      });
      return true;
    }

    // 4. Verify Target live from Telegram
    const targetMember = await TelegramMiddleware.getTargetMember(chatId, targetUserId);
    if (!targetMember || targetMember.status !== 'administrator') {
      await telegramApi.answerCallbackQuery(query.id, {
        text: '❌ That user is no longer an administrator.',
        show_alert: true
      });
      return true;
    }

    if (targetMember.can_be_edited === false) {
      await telegramApi.answerCallbackQuery(query.id, {
        text: '❌ Telegram does not allow Roxie to modify this administrator.',
        show_alert: true
      });
      return true;
    }

    const sessionKey = `${chatId}:${targetUserId}`;
    let session = this.permissionSessions.get(sessionKey);
    const targetName = targetMember.user?.username
      ? `@${targetMember.user.username}`
      : (targetMember.user?.first_name || `User ${targetUserId}`);

    if (!session) {
      const livePerms = extractAdminPermissions(targetMember);
      session = {
        chatId,
        targetUserId,
        targetUsername: targetMember.user?.username,
        targetFirstName: targetMember.user?.first_name,
        actorUserId: query.from.id,
        initialPermissions: livePerms,
        currentPermissions: { ...livePerms },
        confirmingPromote: false,
        createdAt: Date.now()
      };
      this.permissionSessions.set(sessionKey, session);
    }

    // Handle Action
    if (action === 'close') {
      this.permissionSessions.delete(sessionKey);
      if (query.message?.message_id) {
        await telegramApi.deleteMessage(chatId, query.message.message_id);
      }
      return true;
    }

    if (action === 'del') {
      session.currentPermissions.can_delete_messages = !session.currentPermissions.can_delete_messages;
    } else if (action === 'rest') {
      session.currentPermissions.can_restrict_members = !session.currentPermissions.can_restrict_members;
    } else if (action === 'pin') {
      session.currentPermissions.can_pin_messages = !session.currentPermissions.can_pin_messages;
    } else if (action === 'info') {
      session.currentPermissions.can_change_info = !session.currentPermissions.can_change_info;
    } else if (action === 'vid') {
      session.currentPermissions.can_manage_video_chats = !session.currentPermissions.can_manage_video_chats;
    } else if (action === 'prom') {
      if (!session.currentPermissions.can_promote_members) {
        session.confirmingPromote = true;
      } else {
        session.currentPermissions.can_promote_members = false;
      }
    } else if (action === 'conf_prom') {
      session.currentPermissions.can_promote_members = true;
      session.confirmingPromote = false;
    } else if (action === 'canc_prom') {
      session.confirmingPromote = false;
    } else if (action === 'inv') {
      session.currentPermissions.can_invite_users = !session.currentPermissions.can_invite_users;
    } else if (action === 'top') {
      session.currentPermissions.can_manage_topics = !session.currentPermissions.can_manage_topics;
    } else if (action === 'post') {
      session.currentPermissions.can_post_messages = !session.currentPermissions.can_post_messages;
    } else if (action === 'edit') {
      session.currentPermissions.can_edit_messages = !session.currentPermissions.can_edit_messages;
    } else if (action === 'save') {
      // SAVE BEHAVIOR
      // 1. Stale state check: Compare initial snapshot against live target status on Telegram
      const livePermsNow = extractAdminPermissions(targetMember);
      if (!arePermissionsEqual(session.initialPermissions, livePermsNow)) {
        this.permissionSessions.delete(sessionKey);
        if (query.message?.message_id) {
          await telegramApi.editMessageText(
            chatId,
            query.message.message_id,
            `⚠️ <b>Administrator permissions changed while you were editing.</b>\nPlease reopen the permission editor using /permissions.`,
            { parse_mode: 'HTML' }
          );
        }
        return true;
      }

      // 2. Call promoteChatMember
      const promoteRes = await telegramApi.promoteChatMember(chatId, targetUserId, session.currentPermissions);

      if (!promoteRes.ok) {
        const friendlyError = mapTelegramError('permissions', promoteRes.description, promoteRes.error_code);

        // Refresh session with live state
        const refreshedMember = await TelegramMiddleware.getTargetMember(chatId, targetUserId);
        const refreshedPerms = extractAdminPermissions(refreshedMember);
        session.initialPermissions = refreshedPerms;
        session.currentPermissions = { ...refreshedPerms };
        session.confirmingPromote = false;

        TelegramMiddleware.logAudit({
          chatId,
          actor: {
            actorUserId: query.from.id,
            actorUsername: query.from.username,
            actorDisplayName: query.from.first_name,
            actorRole: isOwner ? 'OWNER' : 'ADMIN',
            actorRank: isOwner ? RoleRank.OWNER : RoleRank.ADMIN,
            isAnonymousAdmin: false,
            actorStatus: actorMember?.status || 'administrator',
            canPromoteMembers: canPromote,
            actorMember: actorMember || null,
            customRole: 'NONE'
          },
          command: 'permissions',
          action: 'permissions',
          result: 'error',
          telegramError: promoteRes.description,
          details: `Telegram API error: ${friendlyError}`
        });

        await telegramApi.answerCallbackQuery(query.id, {
          text: friendlyError,
          show_alert: true
        });

        const { text, reply_markup } = renderPermissionEditorUI(
          targetName,
          targetUserId,
          session.currentPermissions,
          false,
          chatId
        );
        if (query.message?.message_id) {
          await telegramApi.editMessageText(chatId, query.message.message_id, text, { reply_markup });
        }
        return true;
      }

      // 3. Re-fetch target using getChatMember() to verify
      const verifyRes = await telegramApi.getChatMember(chatId, targetUserId);
      if (verifyRes.ok && verifyRes.result) {
        const verifiedPerms = extractAdminPermissions(verifyRes.result);
        console.log('[AdminPermissions]', {
          chatId,
          actorId: query.from.id,
          targetId: targetUserId,
          permissionsChanged: session.currentPermissions,
          oldValue: session.initialPermissions,
          newValue: verifiedPerms,
          result: 'success'
        });
      }

      TelegramMiddleware.logAudit({
        chatId,
        actor: {
          actorUserId: query.from.id,
          actorUsername: query.from.username,
          actorDisplayName: query.from.first_name,
          actorRole: isOwner ? 'OWNER' : 'ADMIN',
          actorRank: isOwner ? RoleRank.OWNER : RoleRank.ADMIN,
          isAnonymousAdmin: false,
          actorStatus: actorMember?.status || 'administrator',
          canPromoteMembers: canPromote,
          actorMember: actorMember || null,
          customRole: 'NONE'
        },
        command: 'permissions',
        action: 'permissions',
        result: 'success',
        details: `Successfully updated administrator permissions for ${targetName}`
      });

      this.permissionSessions.delete(sessionKey);
      if (query.message?.message_id) {
        await telegramApi.editMessageText(
          chatId,
          query.message.message_id,
          `✅ <b>Administrator permissions updated for ${targetName}.</b>`,
          { parse_mode: 'HTML' }
        );
      }
      return true;
    }

    // Refresh UI for toggles
    const { text, reply_markup } = renderPermissionEditorUI(
      targetName,
      targetUserId,
      session.currentPermissions,
      session.confirmingPromote || false,
      chatId
    );

    if (query.message?.message_id) {
      await telegramApi.editMessageText(chatId, query.message.message_id, text, { reply_markup });
    }

    return true;
  }

  // ==========================================
  // 5. WARN SYSTEM
  // ==========================================
  private static async handleWarn(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'warn');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'warn',
          action: 'warn',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot warn this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Breaking group rules';
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const warnLimit = settings.warnLimit || 3;

    const { totalWarnings } = db.addWarning({
      chatId: ctx.chatId,
      userId: target.targetUserId,
      userUsername: target.targetUsername,
      userFirstName: target.targetUser?.first_name || `User ${target.targetUserId}`,
      adminId: actor.actorUserId,
      adminUsername: actor.actorDisplayName,
      reason
    });

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      target,
      command: 'warn',
      action: 'warn',
      result: 'success',
      reason,
      details: `Warning ${totalWarnings}/${warnLimit}`
    });

    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    if (totalWarnings >= warnLimit) {
      const userObj = target.targetUser || { id: target.targetUserId, is_bot: false, first_name: targetTag };
      await ModerationService.executeAutoBan(ctx.chatId, userObj, ctx.chatTitle, `Exceeded warning limit (${totalWarnings}/${warnLimit}): ${reason}`);
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Warning issued.</b>\n\n` +
        `<b>User:</b> ${targetTag}\n` +
        `<b>Reason:</b> ${escapeHtml(reason)}\n` +
        `<b>Warnings:</b> ${totalWarnings}/${warnLimit}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleWarnings(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;

    const target = await TelegramMiddleware.resolveTargetUser(ctx);
    const user = (target.type === 'user' ? target.user : null) || ctx.sender;
    const warnings = db.getUserWarnings(ctx.chatId, user.id);
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const targetTag = user.username ? `@${user.username}` : (user.first_name || `User ${user.id}`);

    if (warnings.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, `✅ <b>${targetTag}</b> has 0 active warnings (Limit: ${settings.warnLimit}).`, {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const warningList = warnings
      .map((w, idx) => `${idx + 1}. <i>${escapeHtml(w.reason)}</i> (${new Date(w.timestamp).toLocaleDateString()})`)
      .join('\n');

    await telegramApi.sendMessage(
      ctx.chatId,
      `⚠️ <b>Warnings for ${targetTag}:</b> (${warnings.length}/${settings.warnLimit})\n\n${warningList}`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleResetWarns(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);
    if (target.type !== 'user') {
      const err = target.type === 'none' ? target.error : '⚠️ Cannot reset warnings for channels or anonymous admins.';
      await telegramApi.sendMessage(ctx.chatId, err || '⚠️ Please specify @username or reply to reset warnings.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const removed = db.resetUserWarnings(ctx.chatId, target.userId);
    const targetTag = target.user.username ? `@${target.user.username}` : (target.user.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      target: {
        targetUserId: target.userId,
        targetUser: target.user,
        targetUsername: target.user.username,
        targetRole: 'MEMBER',
        targetRank: 10,
        targetStatus: 'member',
        targetMember: null,
        customRole: 'NONE',
        source: target.source
      },
      command: 'resetwarns',
      action: 'resetwarns',
      result: 'success',
      reason: `Cleared ${removed} warnings`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `✅ <b>Warnings reset for ${targetTag}.</b> (${removed} warning${removed === 1 ? '' : 's'} cleared)`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  // ==========================================
  // 6. CUSTOM BOT ROLES (/setmod & /delmod)
  // ==========================================
  private static async handleSetMod(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      await telegramApi.sendMessage(ctx.chatId, target.type === 'none' ? target.error : '⚠️ Cannot assign moderator role to channels.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    db.setCustomRole(ctx.chatId, target.userId, 'MODERATOR');
    const targetTag = target.user.username ? `@${target.user.username}` : (target.user.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'setmod',
      action: 'setting_change',
      result: 'success',
      details: `Promoted ${targetTag} to bot moderator`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `🛡️ <b>${targetTag} is now recognized as a bot Moderator in this group.</b>\nThey can issue warnings to group members.`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleDelMod(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      await telegramApi.sendMessage(ctx.chatId, target.type === 'none' ? target.error : '⚠️ Invalid target.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    db.setCustomRole(ctx.chatId, target.userId, 'NONE');
    const targetTag = target.user.username ? `@${target.user.username}` : (target.user.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'delmod',
      action: 'setting_change',
      result: 'success',
      details: `Revoked bot moderator role from ${targetTag}`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `🛡️ <b>Moderator privileges removed for ${targetTag}.</b>`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  // ==========================================
  // 7. CUSTOM WARNING THRESHOLD
  // ==========================================
  private static async handleSetWarnLimit(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);

    if (ctx.args.length === 0) {
      const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle).warnLimit;
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ Current warning limit is <b>${current}</b>. Usage: <code>/setwarnlimit &lt;number&gt;</code>`);
      return;
    }

    const limit = parseInt(ctx.args[0], 10);
    if (isNaN(limit) || limit < 1 || limit > 20) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Please provide a valid limit between 1 and 20.');
      return;
    }

    db.updateGroupSettings(ctx.chatId, { warnLimit: limit });
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'setwarnlimit',
      action: 'setting_change',
      result: 'success',
      details: `Changed warn limit to ${limit}`
    });

    await telegramApi.sendMessage(ctx.chatId, `⚙️ <b>Warning threshold updated:</b> <b>${limit}</b> warnings will trigger an automatic ban.`);
  }

  // ==========================================
  // 8. LINK PROTECTION SETTING
  // ==========================================
  private static async handleLinksSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const currentSettings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { linksProtection: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'links',
        action: 'setting_change',
        result: 'success',
        details: 'Link protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Link Protection is now ON.</b>\nUnauthorized links from normal members will be deleted and warned.');
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { linksProtection: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'links',
        action: 'setting_change',
        result: 'success',
        details: 'Link protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Link Protection is now OFF.</b>\nMembers are permitted to share links.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Link Protection Status:</b> ${currentSettings.linksProtection ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/links on</code> or <code>/links off</code>`
      );
    }
  }

  // ==========================================
  // 9. MEDIA & IMAGE PROTECTION SETTING
  // ==========================================
  private static async handleMediaSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const currentSettings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { mediaProtection: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'media',
        action: 'setting_change',
        result: 'success',
        details: 'Media & image protection enabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🛡️ <b>Image & Media Protection is now ON.</b>\n' +
        'Images, photos, GIFs, and videos from normal members will be automatically deleted until an admin frees them with <code>/free</code>.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { mediaProtection: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'media',
        action: 'setting_change',
        result: 'success',
        details: 'Media & image protection disabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🔓 <b>Image & Media Protection is now OFF.</b>\nAll group members may send photos and media freely.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Image & Media Protection Status:</b> ${currentSettings.mediaProtection ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `Usage:\n` +
        `• <code>/media on</code> — Enable auto-deletion of images/media from un-freed members\n` +
        `• <code>/media off</code> — Allow all members to send images/media`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  // ==========================================
  // 10. STICKER PROTECTION SETTING
  // ==========================================
  private static async handleStickersSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const currentSettings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { stickerProtection: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'stickers',
        action: 'setting_change',
        result: 'success',
        details: 'Sticker protection enabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🛡️ <b>Sticker Protection is now ON.</b>\nNormal members cannot send stickers unless whitelisted with <code>/free</code>.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { stickerProtection: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'stickers',
        action: 'setting_change',
        result: 'success',
        details: 'Sticker protection disabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🔓 <b>Sticker Protection is now OFF.</b>\nAll members may send stickers.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Sticker Protection Status:</b> ${currentSettings.stickerProtection ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/stickers on</code> or <code>/stickers off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  // ==========================================
  // 11. /FREE, /UNFREE & /FREELIST (IMAGES & STICKERS)
  // ==========================================
  private static async handleFree(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      const err = target.type === 'none' ? target.error : '⚠️ Cannot grant exemptions to channels or anonymous admins.';
      await telegramApi.sendMessage(
        ctx.chatId,
        err || '⚠️ <b>Usage:</b> Reply to a member or specify <code>/free @username</code> to allow them to send images & stickers.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    db.grantMediaPermission(ctx.chatId, target.userId, actor.actorUserId, target.user?.username);
    const targetTag = target.user?.username ? `@${target.user.username}` : (target.user?.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'free',
      action: 'free_sticker',
      result: 'success',
      reason: 'Admin media & sticker exemption granted'
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `🔓 <b>Member Freed!</b>\n\n` +
      `✅ <b>${targetTag}</b> is now free to send <b>images, photos, GIFs, and stickers</b> in this group.`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleUnfree(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      const err = target.type === 'none' ? target.error : '⚠️ Cannot revoke exemptions for channels or anonymous admins.';
      await telegramApi.sendMessage(
        ctx.chatId,
        err || '⚠️ <b>Usage:</b> Reply to a member or specify <code>/unfree @username</code> to revoke image & sticker permissions.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const removed = db.revokeMediaPermission(ctx.chatId, target.userId);
    const targetTag = target.user?.username ? `@${target.user.username}` : (target.user?.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'unfree',
      action: 'unfree_sticker',
      result: 'success',
      reason: 'Admin revoked media & sticker exemption'
    });

    if (removed) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🔒 <b>Exemption Revoked</b>\n\n` +
        `<b>${targetTag}</b> is no longer permitted to send images or stickers. Any photos, images, GIFs, or stickers sent by this member will be automatically removed.`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>${targetTag}</b> was not on the freed exemptions list.`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleFreeList(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const freedUsers = db.getFreedUsers(ctx.chatId);
    if (freedUsers.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        'ℹ️ <b>No members currently on the Freed list.</b>\n\n' +
        'All normal members have images and stickers restricted until an administrator frees them with <code>/free</code>.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const userLines = freedUsers
      .map((u, i) => `${i + 1}. <b>${u.username ? `@${u.username}` : `User ID <code>${u.userId}</code>`}</b> (Freed: ${new Date(u.grantedAt).toLocaleDateString()})`)
      .join('\n');

    await telegramApi.sendMessage(
      ctx.chatId,
      `🔓 <b>Freed Members (${freedUsers.length})</b>\n<i>Allowed to send images, photos, GIFs & stickers:</i>\n\n${userLines}\n\n` +
      `<i>Revoke with <code>/unfree @username</code></i>`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  // ==========================================
  // 11. REPORT SYSTEM
  // ==========================================
  private static async handleReport(ctx: CommandContext) {
    const reason = ctx.args.join(' ');
    const res = await ModerationService.handleReport(ctx.message, reason);
    if (!res.success) {
      await telegramApi.sendMessage(ctx.chatId, `⚠️ ${res.message}`, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 12. AUTOMATED MESSAGE SCHEDULER
  // ==========================================
  private static async handleSchedule(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length < 2) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Usage:</b>\n<code>/schedule &lt;time&gt; &lt;message&gt;</code>\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/schedule 30m Welcome to the community!</code>\n` +
        `• <code>/schedule 2h Remember to read group rules.</code>\n` +
        `• <code>/schedule 1d Daily announcements...</code>`
      );
      return;
    }

    const intervalStr = ctx.args[0];
    const messageText = ctx.args.slice(1).join(' ');

    const res = messageScheduler.createSchedule(
      ctx.chatId,
      ctx.chatTitle,
      ctx.sender.id,
      ctx.adminDisplayName,
      intervalStr,
      messageText
    );

    if (res.success && res.schedule) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `📅 <b>Message Scheduled Successfully!</b>\n\n` +
        `<b>Schedule ID:</b> <code>${res.schedule.id}</code>\n` +
        `<b>Frequency:</b> Every ${res.schedule.intervalFormatted}\n` +
        `<b>Next Run:</b> ${new Date(res.schedule.nextRun).toLocaleTimeString()}\n\n` +
        `<i>Use <code>/listSchedules</code> to view all or <code>/deleteSchedule ${res.schedule.id}</code> to remove.</i>`
      );
    } else {
      await telegramApi.sendMessage(ctx.chatId, `⚠️ <b>Scheduling error:</b> ${res.error}`);
    }
  }

  private static async handleListSchedules(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const schedules = db.getGroupSchedules(ctx.chatId);
    if (schedules.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '📅 <b>No scheduled messages found for this group.</b>\nCreate one with <code>/schedule 30m Message text</code>.');
      return;
    }

    const list = schedules
      .map((s, idx) => (
        `<b>${idx + 1}. [<code>${s.id}</code>] Every ${s.intervalFormatted}</b>\n` +
        `<i>"${escapeHtml(s.message.length > 50 ? s.message.slice(0, 47) + '...' : s.message)}"</i>\n` +
        `Next: ${new Date(s.nextRun).toLocaleTimeString()} (Runs: ${s.runsCount})\n`
      ))
      .join('\n');

    await telegramApi.sendMessage(
      ctx.chatId,
      `📅 <b>Active Scheduled Messages (${schedules.length}):</b>\n\n${list}\n<i>Delete with <code>/deleteSchedule &lt;id&gt;</code></i>`
    );
  }

  private static async handleDeleteSchedule(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Please provide the schedule ID: <code>/deleteSchedule &lt;id&gt;</code>');
      return;
    }

    const scheduleId = ctx.args[0].trim();
    const deleted = messageScheduler.deleteSchedule(ctx.chatId, scheduleId, ctx.sender.id, ctx.adminDisplayName);

    if (deleted) {
      await telegramApi.sendMessage(ctx.chatId, `🗑️ <b>Scheduled message <code>${scheduleId.toUpperCase()}</code> has been removed.</b>`);
    } else {
      await telegramApi.sendMessage(ctx.chatId, `⚠️ Schedule ID <code>${scheduleId}</code> not found in this group.`);
    }
  }

  // ==========================================
  // 13. BOT SEND MESSAGE (/say)
  // ==========================================
  private static async handleSay(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/say &lt;message text&gt;</code>');
      return;
    }

    const senderKey = ctx.isAnonymousAdmin ? ctx.chatId : ctx.sender.id;
    const lastSay = this.sayCooldowns.get(senderKey) || 0;
    if (Date.now() - lastSay < 5000) {
      await telegramApi.sendMessage(ctx.chatId, '⏳ Please wait a few seconds before using <code>/say</code> again.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }
    this.sayCooldowns.set(senderKey, Date.now());

    const messageText = ctx.args.join(' ');

    await telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id);
    await telegramApi.sendMessage(ctx.chatId, messageText);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor: await TelegramMiddleware.resolveActor(ctx),
      command: 'say',
      action: 'say',
      result: 'success',
      details: `Broadcast message: "${messageText.slice(0, 40)}..."`
    });
  }

  // ==========================================
  // 14. DELETE SINGLE REPLIED MESSAGE (/del, /delete)
  // ==========================================
  private static async handleDel(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    // Must be replying to a message
    if (!ctx.message.reply_to_message?.message_id) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '⚠️ <b>Reply Required</b>\n\nPlease reply to any message you want to delete for all group members with <code>/del</code>.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Check bot's delete permission
    const botCheck = await TelegramMiddleware.checkBotPermissions(ctx.chatId, 'can_delete_messages');
    if (!botCheck.allowed) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '❌ I need the <b>Delete Messages</b> administrator permission to remove messages.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const targetMsgId = ctx.message.reply_to_message.message_id;
    const cmdMsgId = ctx.message.message_id;

    // Delete target replied message and command message simultaneously
    await Promise.allSettled([
      telegramApi.deleteMessage(ctx.chatId, targetMsgId),
      telegramApi.deleteMessage(ctx.chatId, cmdMsgId)
    ]);

    db.untrackMessages(ctx.chatId, [targetMsgId, cmdMsgId]);

    const actor = await TelegramMiddleware.resolveActor(ctx);
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'del',
      action: 'clear',
      result: 'success',
      details: `Deleted replied message #${targetMsgId} and command #${cmdMsgId}`
    });
  }

  // ==========================================
  // 15. CLEAR MESSAGES (/clear)
  // ==========================================
  private static async handleClear(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    // Check bot's delete permission
    const botCheck = await TelegramMiddleware.checkBotPermissions(ctx.chatId, 'can_delete_messages');
    if (!botCheck.allowed) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '❌ I need the <b>Delete Messages</b> administrator permission to clear group messages.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    let messageIdsToDelete: number[] = [];
    let scopeDescription = 'all recent messages';

    const firstArg = ctx.args[0]?.trim().toLowerCase();
    const isReply = Boolean(ctx.message.reply_to_message?.message_id);
    const replyTargetUserId = ctx.message.reply_to_message?.from?.id;
    const replyTargetUsername = ctx.message.reply_to_message?.from?.username;

    // Mode 1: Reply to a user with /clear user or /clear all or /clear member
    if (isReply && replyTargetUserId && (firstArg === 'user' || firstArg === 'member' || firstArg === 'all')) {
      messageIdsToDelete = db.getMessagesByUser(ctx.chatId, replyTargetUserId, ctx.message.message_id, 100);
      const userLabel = replyTargetUsername ? `@${replyTargetUsername}` : (ctx.message.reply_to_message?.from?.first_name || `User ID ${replyTargetUserId}`);
      scopeDescription = `from member ${userLabel}`;
    }
    // Mode 2: Reply to a message with /clear this or /clear 1
    else if (isReply && (firstArg === 'this' || firstArg === '1')) {
      const targetId = ctx.message.reply_to_message!.message_id;
      messageIdsToDelete = [targetId, ctx.message.message_id];
      scopeDescription = `(replied message #${targetId})`;
    }
    // Mode 3: Target user by username: e.g. /clear @spammer
    else if (firstArg && firstArg.startsWith('@')) {
      const usernameClean = firstArg.replace(/^@/, '');
      const cached = db.findUserByUsername(usernameClean);
      if (cached) {
        messageIdsToDelete = db.getMessagesByUser(ctx.chatId, cached.userId, ctx.message.message_id, 100);
        scopeDescription = `from member @${usernameClean}`;
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `⚠️ Member <b>@${usernameClean}</b> has not been seen in this group yet.`,
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }
    }
    // Mode 4: Range purge from replied message to current message: /clear (when replying)
    else if (isReply && (!firstArg || firstArg === 'purge')) {
      const fromId = ctx.message.reply_to_message!.message_id;
      const toId = ctx.message.message_id;
      messageIdsToDelete = db.getMessagesInRange(ctx.chatId, fromId, toId);
      scopeDescription = `from message #${fromId} to #${toId}`;
    }
    // Mode 5: Duration / Count / Timing options (e.g. /clear 5s, /clear 1m, /clear 50)
    else if (ctx.args.length > 0) {
      const arg = ctx.args.join(' ').trim();
      const parsedDuration = parseClearDuration(arg);
      const parsedCount = parseClearCount(arg);

      if (parsedDuration) {
        messageIdsToDelete = db.getMessagesByDuration(ctx.chatId, parsedDuration.seconds, ctx.message.message_id);
        scopeDescription = `sent in the last ${parsedDuration.formatted}`;
      } else if (parsedCount !== null) {
        messageIdsToDelete = db.getMessagesByCount(ctx.chatId, parsedCount, ctx.message.message_id);
        scopeDescription = `(last ${parsedCount} messages)`;
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          '⚠️ <b>Invalid Clear Option</b>\n\n' +
          '<b>Supported Timing, Range & Member Formats:</b>\n' +
          '• <code>/clear</code> — Clear all recent messages\n' +
          '• <code>/del</code> <i>(in reply)</i> — Delete single replied message for all members\n' +
          '• <i>(Reply)</i> <code>/clear</code> — Purge all messages from replied message to now\n' +
          '• <i>(Reply)</i> <code>/clear user</code> — Purge all messages from this specific member\n' +
          '• <code>/clear @username</code> — Purge all messages from specified member\n' +
          '• <code>/clear 5s</code> / <code>30s</code> — Clear messages sent in last 5s / 30s\n' +
          '• <code>/clear 1m</code> / <code>5m</code> / <code>15m</code> — Clear messages from last 1m / 5m / 15m\n' +
          '• <code>/clear 1h</code> / <code>2h</code> / <code>1d</code> — Clear messages from last 1 hour / 2 hours / 1 day\n' +
          '• <code>/clear 20</code> / <code>50</code> — Clear specified count of messages',
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }
    } else {
      // Default: /clear with no arguments clears all tracked recent messages
      messageIdsToDelete = db.getAllTrackedMessagesToClear(ctx.chatId, ctx.message.message_id, 100);
      scopeDescription = 'all recent messages';
    }

    // Ensure the /clear command message itself is included
    if (!messageIdsToDelete.includes(ctx.message.message_id)) {
      messageIdsToDelete.push(ctx.message.message_id);
    }

    const uniqueIds = Array.from(new Set(messageIdsToDelete)).sort((a, b) => a - b);

    if (uniqueIds.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        'ℹ️ No messages found to clear for the specified timeframe or member.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    let deletedCount = 0;
    const successfullyDeletedIds: number[] = [];

    // Delete in batches of 100 via deleteMessages API (Telegram 7.0+)
    const batchSize = 100;
    for (let i = 0; i < uniqueIds.length; i += batchSize) {
      const batch = uniqueIds.slice(i, i + batchSize);
      const bulkRes = await telegramApi.deleteMessages(ctx.chatId, batch);

      if (bulkRes.ok) {
        deletedCount += batch.length;
        successfullyDeletedIds.push(...batch);
      } else {
        // Fallback to deleteMessage individually
        const results = await Promise.allSettled(
          batch.map((id) => telegramApi.deleteMessage(ctx.chatId, id))
        );
        for (let j = 0; j < results.length; j++) {
          const res = results[j];
          if (res.status === 'fulfilled' && res.value.ok) {
            deletedCount++;
            successfullyDeletedIds.push(batch[j]);
          }
        }
      }
    }

    // Untrack deleted messages from memory buffer
    db.untrackMessages(ctx.chatId, successfullyDeletedIds);

    const actor = await TelegramMiddleware.resolveActor(ctx);
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'clear',
      action: 'clear',
      result: 'success',
      details: `Purged ${deletedCount} messages (${scopeDescription})`
    });

    // Send confirmation and self-destruct after 4 seconds
    const confirmRes = await telegramApi.sendMessage(
      ctx.chatId,
      `🧹 <b>Cleared ${deletedCount} message${deletedCount === 1 ? '' : 's'}</b> ${scopeDescription}.\n<i>(This notification will self-destruct in 4s)</i>`
    );

    if (confirmRes.ok && confirmRes.result?.message_id) {
      const confirmId = confirmRes.result.message_id;
      setTimeout(() => {
        telegramApi.deleteMessage(ctx.chatId, confirmId).catch(() => {});
      }, 4000);
    }
  }

  // ==========================================
  // 14. GROUP LIVE / CALL INFO
  // ==========================================
  private static async handleLive(ctx: CommandContext) {
    await telegramApi.sendMessage(
      ctx.chatId,
      '🎥 <b>Group Live & Video Chats:</b>\n\n' +
      'Group live/voice chats must be started manually from Telegram by an administrator using the group title menu (⋮ > Start Video chat / Live stream).\n\n' +
      '<i>The official Telegram Bot API does not provide programmatic endpoints for spawning live voice streams.</i>'
    );
  }

  // ==========================================
  // BASIC BOT COMMANDS
  // ==========================================
  private static async handleStart(ctx: CommandContext) {
    const isGroup = TelegramMiddleware.isGroup(ctx.message);
    const greeting = isGroup
      ? `👋 <b>Hello ${ctx.chatTitle || 'group'}!</b>\n\n` +
        `I am <b>@${(await telegramApi.getMe()).result?.username || 'MissRoxie_Bot'}</b>, your group moderation and administration assistant.\n\n` +
        `Make sure I have Administrator privileges with <i>Delete Messages</i> and <i>Ban Users</i> permissions enabled.\n\n` +
        `Type <code>/help</code> for all moderation commands.`
      : `👋 <b>Hello, ${ctx.sender.first_name}!</b>\n\n` +
        `I am ready to moderate your Telegram groups.\n\n` +
        `1. Add me to your group.\n` +
        `2. Promote me to <b>Administrator</b> with full deletion and restrict permissions.\n` +
        `3. Use <code>/help</code> in your group to view the admin toolkit!`;

    await telegramApi.sendMessage(ctx.chatId, greeting);
  }

  private static async handlePing(ctx: CommandContext) {
    await telegramApi.sendMessage(ctx.chatId, '🏓 <b>Pong!</b> Administration engine active.');
  }

  private static async handleStatus(ctx: CommandContext) {
    const isGroup = TelegramMiddleware.isGroup(ctx.message);
    const me = (await telegramApi.getMe()).result;
    const settings = isGroup ? db.getGroupSettings(ctx.chatId, ctx.chatTitle) : null;
    const schedules = isGroup ? db.getGroupSchedules(ctx.chatId).length : 0;

    let text =
      `🤖 <b>Bot Status:</b>\n` +
      `• Name: <b>${me?.first_name || 'Roxie'}</b> (@${me?.username || 'MissRoxie_Bot'})\n` +
      `• Environment: <b>Active (Long Polling)</b>\n`;

    if (isGroup && settings) {
      text +=
        `\n👥 <b>Group Settings (${ctx.chatTitle}):</b>\n` +
        `• Link Protection: <b>${settings.linksProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Media/Image Protection: <b>${settings.mediaProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Sticker Protection: <b>${settings.stickerProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Warn Limit: <b>${settings.warnLimit} warns = Ban</b>\n` +
        `• Active Schedules: <b>${schedules}</b>\n`;
    }

    await telegramApi.sendMessage(ctx.chatId, text);
  }

  private static async handleHelp(ctx: CommandContext) {
    const helpText =
      `🛡️ <b>Roxie Administrator Command Toolkit</b>\n` +
      `<i>🔒 All commands are restricted to group administrators.</i>\n\n` +
      `🛡️ <b>ADMINISTRATION</b>\n` +
      `• <code>/promote @user</code> — Promote a member to administrator\n` +
      `• <code>/demote @user</code> — Revoke administrator privileges\n` +
      `• <code>/permissions @user</code> — View & edit administrator permissions\n` +
      `• <code>/setmod @user</code> — Assign bot moderator role\n` +
      `• <code>/delmod @user</code> — Remove bot moderator role\n\n` +
      `🔨 <b>MODERATION & PURGE</b>\n` +
      `• <code>/del</code> — (Reply) Delete replied message for all members\n` +
      `• <code>/clear [5s|1m|1h|num]</code> — Purge messages by timing, count, or all\n` +
      `• <code>/clear user</code> — (Reply) Purge all messages from replied member\n` +
      `• <code>/kick @user</code> — Remove member from group\n` +
      `• <code>/ban @user [reason]</code> — Ban member permanently\n` +
      `• <code>/unban @user</code> — Unban member\n` +
      `• <code>/warn @user [reason]</code> — Warn member (auto-ban on limit)\n` +
      `• <code>/warnings [@user]</code> — View active warnings\n` +
      `• <code>/resetwarns @user</code> — Clear all warnings for member\n\n` +
      `⚙️ <b>PROTECTION & PERMISSIONS</b>\n` +
      `• <code>/media on|off</code> — Toggle image/photo/media protection\n` +
      `• <code>/stickers on|off</code> — Toggle sticker filter\n` +
      `• <code>/free @user</code> — Allow member to send images & stickers\n` +
      `• <code>/unfree @user</code> — Revoke image & sticker permission\n` +
      `• <code>/freelist</code> — List all exempted/freed members\n` +
      `• <code>/links on|off</code> — Toggle automatic link filter\n` +
      `• <code>/setwarnlimit &lt;num&gt;</code> — Set threshold for auto-ban\n\n` +
      `📢 <b>COMMUNICATION</b>\n` +
      `• <code>/say &lt;message&gt;</code> — Broadcast message as bot\n` +
      `• <code>/schedule &lt;interval&gt; &lt;msg&gt;</code> — Schedule recurring broadcast\n` +
      `• <code>/listschedules</code> — List active scheduled messages\n` +
      `• <code>/deleteschedule &lt;id&gt;</code> — Remove scheduled broadcast\n` +
      `• <code>/live</code> — Live stream & voice chat info\n\n` +
      `🛠️ <b>TOOLS</b>\n` +
      `• <code>/report [reason]</code> — (Reply) Forward report to admins\n` +
      `• <code>/status</code> — View group & bot operational status\n` +
      `• <code>/ping</code> — Check bot responsiveness`;

    await telegramApi.sendMessage(ctx.chatId, helpText);
  }
}

export function parseClearDuration(input: string): { seconds: number; formatted: string } | null {
  if (!input) return null;
  const str = input.trim().toLowerCase();

  // Pattern: "5s", "5 sec", "5 secs", "5seconds", etc.
  const secMatch = str.match(/^(\d+)\s*(s|sec|secs|seconds?)$/i);
  if (secMatch) {
    const s = parseInt(secMatch[1], 10);
    if (s > 0) return { seconds: s, formatted: `${s}s` };
  }

  // Pattern: "5m", "5 min", "5 mins", "5minutes", etc.
  const minMatch = str.match(/^(\d+)\s*(m|min|mins|minutes?)$/i);
  if (minMatch) {
    const m = parseInt(minMatch[1], 10);
    if (m > 0) return { seconds: m * 60, formatted: `${m}m` };
  }

  // Pattern: "1h", "2 hr", "2 hrs", "2hours", etc.
  const hrMatch = str.match(/^(\d+)\s*(h|hr|hrs|hours?)$/i);
  if (hrMatch) {
    const h = parseInt(hrMatch[1], 10);
    if (h > 0) return { seconds: h * 3600, formatted: `${h}h` };
  }

  // Pattern: "1d", "2 day", "2 days", etc. (clamped to 48 hours maximum)
  const dayMatch = str.match(/^(\d+)\s*(d|day|days?)$/i);
  if (dayMatch) {
    const d = parseInt(dayMatch[1], 10);
    if (d > 0) {
      const clampedSec = Math.min(d * 86400, 48 * 3600);
      return { seconds: clampedSec, formatted: `${d}d` };
    }
  }

  return null;
}

export function parseClearCount(input: string): number | null {
  if (/^\d+$/.test(input.trim())) {
    const num = parseInt(input.trim(), 10);
    if (num > 0) {
      return Math.min(num, 100);
    }
  }
  return null;
}

function extractAdminPermissions(member: TelegramChatMember | undefined | null): AdminPermissions {
  return {
    is_anonymous: Boolean(member?.is_anonymous),
    can_manage_chat: Boolean(member?.can_manage_chat),
    can_delete_messages: Boolean(member?.can_delete_messages),
    can_manage_video_chats: Boolean(member?.can_manage_video_chats),
    can_restrict_members: Boolean(member?.can_restrict_members),
    can_promote_members: Boolean(member?.can_promote_members),
    can_change_info: Boolean(member?.can_change_info),
    can_invite_users: Boolean(member?.can_invite_users),
    can_pin_messages: Boolean(member?.can_pin_messages),
    can_manage_topics: Boolean(member?.can_manage_topics),
    can_post_messages: Boolean(member?.can_post_messages),
    can_edit_messages: Boolean(member?.can_edit_messages),
    can_post_stories: Boolean(member?.can_post_stories),
    can_edit_stories: Boolean(member?.can_edit_stories),
    can_delete_stories: Boolean(member?.can_delete_stories)
  };
}

function arePermissionsEqual(a: AdminPermissions, b: AdminPermissions): boolean {
  return (
    a.is_anonymous === b.is_anonymous &&
    a.can_manage_chat === b.can_manage_chat &&
    a.can_delete_messages === b.can_delete_messages &&
    a.can_manage_video_chats === b.can_manage_video_chats &&
    a.can_restrict_members === b.can_restrict_members &&
    a.can_promote_members === b.can_promote_members &&
    a.can_change_info === b.can_change_info &&
    a.can_invite_users === b.can_invite_users &&
    a.can_pin_messages === b.can_pin_messages &&
    a.can_manage_topics === b.can_manage_topics &&
    a.can_post_messages === b.can_post_messages &&
    a.can_edit_messages === b.can_edit_messages &&
    a.can_post_stories === b.can_post_stories &&
    a.can_edit_stories === b.can_edit_stories &&
    a.can_delete_stories === b.can_delete_stories
  );
}

function renderPermissionEditorUI(
  targetName: string,
  targetUserId: number,
  perms: AdminPermissions,
  confirmingPromote: boolean,
  chatId: number
): { text: string; reply_markup: InlineKeyboardMarkup } {
  if (confirmingPromote) {
    const text =
      `⚠️ <b>Add New Admins</b>\n\n` +
      `This allows this administrator to promote other administrators.\n\n` +
      `Are you sure you want to enable this permission?`;
    const reply_markup: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '❌ Cancel', callback_data: `p:${chatId}:${targetUserId}:canc_prom` },
          { text: '✅ Confirm', callback_data: `p:${chatId}:${targetUserId}:conf_prom` }
        ]
      ]
    };
    return { text, reply_markup };
  }

  const text =
    `⚙️ <b>ADMIN PERMISSIONS</b>\n\n` +
    `👤 <b>${targetName}</b> (ID: <code>${targetUserId}</code>)\n\n` +
    `🗑️ Delete Messages       ${perms.can_delete_messages ? '✅' : '❌'}\n` +
    `🚫 Ban / Restrict Users   ${perms.can_restrict_members ? '✅' : '❌'}\n` +
    `📌 Pin Messages           ${perms.can_pin_messages ? '✅' : '❌'}\n` +
    `✏️ Change Group Info      ${perms.can_change_info ? '✅' : '❌'}\n` +
    `📞 Manage Video Chats     ${perms.can_manage_video_chats ? '✅' : '❌'}\n` +
    `👥 Add New Admins         ${perms.can_promote_members ? '✅' : '❌'}\n` +
    `🔗 Invite Users           ${perms.can_invite_users ? '✅' : '❌'}\n` +
    `💬 Manage Topics          ${perms.can_manage_topics ? '✅' : '❌'}\n` +
    `📢 Post Messages          ${perms.can_post_messages ? '✅' : '❌'}\n` +
    `✍️ Edit Messages          ${perms.can_edit_messages ? '✅' : '❌'}\n\n` +
    `<i>Tap the buttons below to toggle permissions, then press <b>SAVE</b>. Telegram remains the final authority over administrator permissions.</i>`;

  const btn = (label: string, enabled: boolean, actionKey: string) => ({
    text: `${label} ${enabled ? '✅' : '❌'}`,
    callback_data: `p:${chatId}:${targetUserId}:${actionKey}`
  });

  const reply_markup: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        btn('🗑 Delete', perms.can_delete_messages, 'del'),
        btn('🚫 Restrict', perms.can_restrict_members, 'rest')
      ],
      [
        btn('📌 Pin', perms.can_pin_messages, 'pin'),
        btn('✏️ Info', perms.can_change_info, 'info')
      ],
      [
        btn('📞 Video', perms.can_manage_video_chats, 'vid'),
        btn('👥 Promote', perms.can_promote_members, 'prom')
      ],
      [
        btn('🔗 Invite', perms.can_invite_users, 'inv'),
        btn('💬 Topics', perms.can_manage_topics, 'top')
      ],
      [
        btn('📢 Post Msgs', perms.can_post_messages, 'post'),
        btn('✍️ Edit Msgs', perms.can_edit_messages, 'edit')
      ],
      [
        { text: '💾 SAVE PERMISSIONS', callback_data: `p:${chatId}:${targetUserId}:save` },
        { text: '❌ Close', callback_data: `p:${chatId}:${targetUserId}:close` }
      ]
    ]
  };

  return { text, reply_markup };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
