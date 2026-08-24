import { telegramApi } from './api.js';
import { TelegramMiddleware, CommandContext } from './middleware.js';
import { db } from '../db/storage.js';
import { ModerationService } from './moderation.js';
import { messageScheduler } from './scheduler.js';
import { mapTelegramError } from './errorMapper.js';

export class CommandHandler {
  private static sayCooldowns: Map<number, number> = new Map();

  public static async handleCommand(ctx: CommandContext): Promise<boolean> {
    const cmd = ctx.command.toLowerCase().split('@')[0]; // strip bot username if present, e.g. /ban@MissRoxie_Bot

    switch (cmd) {
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
      case '/stickers':
        await this.handleStickersSetting(ctx);
        return true;
      case '/free':
        await this.handleFreeSticker(ctx);
        return true;
      case '/unfree':
        await this.handleUnfreeSticker(ctx);
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
  // 9. STICKER PROTECTION SETTING
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
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Sticker Protection is now ON.</b>\nNormal members cannot send stickers unless whitelisted with <code>/free</code>.');
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
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Sticker Protection is now OFF.</b>\nAll members may send stickers.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Sticker Protection Status:</b> ${currentSettings.stickerProtection ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/stickers on</code> or <code>/stickers off</code>`
      );
    }
  }

  // ==========================================
  // 10. /FREE & /UNFREE STICKER SYSTEM
  // ==========================================
  private static async handleFreeSticker(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      const err = target.type === 'none' ? target.error : '⚠️ Cannot grant sticker exemptions to channels or anonymous admins.';
      await telegramApi.sendMessage(ctx.chatId, err || '⚠️ Please reply to a member or specify @username to allow stickers.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    db.grantStickerPermission(ctx.chatId, target.userId, actor.actorUserId, target.user?.username);
    const targetTag = target.user?.username ? `@${target.user.username}` : (target.user?.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'free',
      action: 'free_sticker',
      result: 'success',
      reason: 'Admin sticker exemption'
    });

    await telegramApi.sendMessage(ctx.chatId, `✅ <b>${targetTag} can now send stickers.</b>`, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  private static async handleUnfreeSticker(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const target = await TelegramMiddleware.resolveTargetUser(ctx);

    if (target.type !== 'user') {
      const err = target.type === 'none' ? target.error : '⚠️ Cannot revoke sticker exemptions for channels or anonymous admins.';
      await telegramApi.sendMessage(ctx.chatId, err || '⚠️ Please reply to a member or specify @username to revoke sticker access.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const removed = db.revokeStickerPermission(ctx.chatId, target.userId);
    const targetTag = target.user?.username ? `@${target.user.username}` : (target.user?.first_name || `User ${target.userId}`);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'unfree',
      action: 'unfree_sticker',
      result: 'success',
      reason: 'Admin revoked sticker exemption'
    });

    if (removed) {
      await telegramApi.sendMessage(ctx.chatId, `🔒 <b>Sticker exemption removed for ${targetTag}.</b>`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ <b>${targetTag}</b> was not on the sticker exempt list.`, {
        reply_to_message_id: ctx.message.message_id
      });
    }
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
        `• Sticker Protection: <b>${settings.stickerProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Warn Limit: <b>${settings.warnLimit} warns = Ban</b>\n` +
        `• Active Schedules: <b>${schedules}</b>\n`;
    }

    await telegramApi.sendMessage(ctx.chatId, text);
  }

  private static async handleHelp(ctx: CommandContext) {
    let helpText =
      `🛡️ <b>Telegram Moderation & Admin Commands:</b>\n\n` +
      `<b>👑 Member Management (Admins):</b>\n` +
      `• <code>/promote @user</code> - Promote a member to administrator\n` +
      `• <code>/demote @user</code> - Revoke admin rights\n` +
      `• <code>/kick @user</code> - Remove member from group\n` +
      `• <code>/ban @user [reason]</code> - Ban member from group\n` +
      `• <code>/unban @user</code> - Unban user\n\n` +
      `<b>⚠️ Warning System:</b>\n` +
      `• <code>/warn @user [reason]</code> - Issue warning\n` +
      `• <code>/warnings [@user]</code> - View active warnings\n` +
      `• <code>/resetwarns @user</code> - Clear warnings\n` +
      `• <code>/setwarnlimit &lt;number&gt;</code> - Set threshold for auto-ban (default: 3)\n\n` +
      `<b>🛡️ Roles & Permissions:</b>\n` +
      `• <code>/setmod @user</code> - Assign custom bot moderator role\n` +
      `• <code>/delmod @user</code> - Remove custom bot moderator role\n` +
      `• <code>/free @user</code> - Grant sticker exemption\n` +
      `• <code>/unfree @user</code> - Revoke sticker exemption\n\n` +
      `<b>⚙️ Filter Settings:</b>\n` +
      `• <code>/links on|off</code> - Toggle URL/link filter\n` +
      `• <code>/stickers on|off</code> - Toggle sticker filter\n\n` +
      `<b>📢 Automation & Communication:</b>\n` +
      `• <code>/say &lt;message&gt;</code> - Broadcast message as bot\n` +
      `• <code>/schedule &lt;30m|2h|1d&gt; &lt;msg&gt;</code> - Schedule recurring message\n` +
      `• <code>/listSchedules</code> - View active schedules\n` +
      `• <code>/deleteSchedule &lt;id&gt;</code> - Delete a schedule\n` +
      `• <code>/live</code> - Live video/audio chat info\n\n` +
      `<b>🚨 Member Tools:</b>\n` +
      `• <code>/report [reason]</code> (reply to message) - Report to admins\n` +
      `• <code>/status</code> - View group & bot configuration\n` +
      `• <code>/ping</code> - Check responsiveness`;

    await telegramApi.sendMessage(ctx.chatId, helpText);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
