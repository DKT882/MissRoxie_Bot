import { telegramApi } from './api.js';
import { TelegramMiddleware, CommandContext, RoleRank } from './middleware.js';
import { db } from '../db/storage.js';
import { ModerationService, parseDuration } from './moderation.js';
import { messageScheduler } from './scheduler.js';
import { mapTelegramError } from './errorMapper.js';
import { TelegramCallbackQuery, InlineKeyboardMarkup, AdminPermissions, TelegramChatMember, BotCommand } from './types.js';
import {
  COMMAND_CATALOG,
  getCatalogItem,
  getCatalogByCategory,
  getCommandsForTelegramScope,
  CommandCatalogItem,
  CommandCategory
} from './commandCatalog.js';
import { ChatbotService, ROXIE_SUPPORTED_MOODS } from './chatbot.js';

export const ADMIN_COMMANDS: BotCommand[] = getCommandsForTelegramScope('all_chat_administrators');

export async function registerBotCommands(): Promise<{
  adminCommandsSet: boolean;
  defaultCommandsCleared: boolean;
  errors?: string[];
}> {
  const errors: string[] = [];

  const adminCommands = getCommandsForTelegramScope('all_chat_administrators');
  const groupCommands = getCommandsForTelegramScope('all_group_chats');
  const privateCommands = getCommandsForTelegramScope('all_private_chats');
  const defaultCommands = getCommandsForTelegramScope('default');

  // Clear any stale chat-specific, chat_administrator-specific, or language-specific command overrides for protected production groups
  const protectedGroups = [-1003901820979, -1004356470022, -1004331070653, -1004494262619];
  for (const gid of protectedGroups) {
    await telegramApi.deleteMyCommands({ type: 'chat_administrators', chat_id: gid }).catch(() => {});
    await telegramApi.deleteMyCommands({ type: 'chat', chat_id: gid }).catch(() => {});
    await telegramApi.deleteMyCommands({ type: 'chat_administrators', chat_id: gid }, 'en').catch(() => {});
    await telegramApi.deleteMyCommands({ type: 'chat', chat_id: gid }, 'en').catch(() => {});
  }
  await telegramApi.deleteMyCommands({ type: 'all_chat_administrators' }, 'en').catch(() => {});
  await telegramApi.deleteMyCommands({ type: 'all_group_chats' }, 'en').catch(() => {});

  // 1. Register all commands for administrators scope (capped at 100 for Telegram API limit)
  const adminRes = await telegramApi.setMyCommands(adminCommands, {
    type: 'all_chat_administrators'
  });
  if (adminRes.ok) {
    console.log(JSON.stringify({ event: 'COMMAND_REGISTRATION_SUCCESS', scope: 'all_chat_administrators', count: adminCommands.length, commands: adminCommands.map(c => c.command) }));
  } else {
    console.error(JSON.stringify({ event: 'COMMAND_REGISTRATION_FAILED', scope: 'all_chat_administrators', error_code: adminRes.error_code, description: adminRes.description }));
    errors.push(`Failed to set admin commands: ${adminRes.description}`);
  }

  // 2. Register public group commands for group chats scope
  const groupRes = await telegramApi.setMyCommands(groupCommands, {
    type: 'all_group_chats'
  });
  if (groupRes.ok) {
    console.log(JSON.stringify({ event: 'COMMAND_REGISTRATION_SUCCESS', scope: 'all_group_chats', count: groupCommands.length, commands: groupCommands.map(c => c.command) }));
  } else {
    console.error(JSON.stringify({ event: 'COMMAND_REGISTRATION_FAILED', scope: 'all_group_chats', error_code: groupRes.error_code, description: groupRes.description }));
    errors.push(`Failed to set group commands: ${groupRes.description}`);
  }

  // 3. Register private chat commands for private chats scope
  const privateRes = await telegramApi.setMyCommands(privateCommands, {
    type: 'all_private_chats'
  });
  if (privateRes.ok) {
    console.log(JSON.stringify({ event: 'COMMAND_REGISTRATION_SUCCESS', scope: 'all_private_chats', count: privateCommands.length, commands: privateCommands.map(c => c.command) }));
  } else {
    console.error(JSON.stringify({ event: 'COMMAND_REGISTRATION_FAILED', scope: 'all_private_chats', error_code: privateRes.error_code, description: privateRes.description }));
    errors.push(`Failed to set private commands: ${privateRes.description}`);
  }

  // 4. Register public commands for default scope
  const defaultRes = await telegramApi.setMyCommands(defaultCommands, {
    type: 'default'
  });
  if (defaultRes.ok) {
    console.log(JSON.stringify({ event: 'COMMAND_REGISTRATION_SUCCESS', scope: 'default', count: defaultCommands.length, commands: defaultCommands.map(c => c.command) }));
  } else {
    console.error(JSON.stringify({ event: 'COMMAND_REGISTRATION_FAILED', scope: 'default', error_code: defaultRes.error_code, description: defaultRes.description }));
    errors.push(`Failed to set default commands: ${defaultRes.description}`);
  }

  return {
    adminCommandsSet: adminRes.ok && groupRes.ok && privateRes.ok,
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

  private static catalogMap = new Map<string, CommandCatalogItem>(
    COMMAND_CATALOG.flatMap(item => {
      const entries: Array<[string, CommandCatalogItem]> = [[item.command.toLowerCase(), item]];
      if (item.aliases) {
        for (const a of item.aliases) {
          entries.push([a.toLowerCase(), item]);
        }
      }
      return entries;
    })
  );

  public static readonly PUBLIC_GROUP_COMMANDS = new Set<string>([
    '/help', '/start', '/ping', '/live', '/report', '/getnote', '/notes', '/rules', '/mymemory', '/forgetme', '/settings'
  ]);

  public static readonly ADMIN_ONLY_COMMANDS = new Set<string>([
    '/clear', '/del', '/delete', '/purge',
    '/kick', '/ban', '/unban', '/mute', '/unmute',
    '/tmute', '/tban', '/dban', '/dmute', '/dkick', '/sban', '/smute', '/skick',
    '/promote', '/demote', '/permissions', '/permission',
    '/warn', '/warnings', '/resetwarns', '/setwarnlimit',
    '/setmod', '/delmod',
    '/links', '/link', '/media', '/images', '/image', '/photos', '/photo', '/stickers', '/sticker', '/gifs', '/gif', '/videos', '/video', '/voice', '/audio',
    '/lock', '/unlock', '/locks', '/locklist',
    '/linkallow', '/linkwhitelist', '/allowlink', '/linkunallow', '/linkdisallow', '/removelink', '/linkallowlist', '/linkslist',
    '/flood', '/setflood', '/antiflood',
    '/filter', '/unfilter', '/stop', '/filters', '/filterlist',
    '/welcome', '/setwelcome', '/goodbye', '/setgoodbye', '/autodeljoin',
    '/pin', '/unpin', '/unpinall',
    '/slowmode', '/slow',
    '/adminlog', '/modlog', '/logs',
    '/free', '/unfree', '/freelist', '/freed',
    '/stopspam', '/stopabusive', '/addabuse', '/removeabuse', '/listabuse', '/clearabuse', '/stoppromotion', '/file',
    '/automod', '/warnsettings', '/security', '/captcha', '/antiraid', '/joinmode', '/autoaccept', '/automation', '/setrules', '/clearrules', '/chatbot',
    '/protection', '/roxie', '/roxiemode', '/roxiereaction', '/reaction',
    '/lust', '/lustmod', '/lustmode',
    '/clearmemory',
    '/say', '/announce', '/schedule', '/listschedules', '/deleteschedule',
    '/exportconfig', '/importconfig', '/status',
    '/addstickerpack', '/addbulkstickers', '/addbulksticker', '/addsticker', '/addgif', '/liststickers', '/listgifs', '/removesticker', '/removegif', '/clearstickers', '/cleargifs',
    '/teststicker', '/stickerpackremove', '/removestickerpack', '/delstickerpack'
  ]);

  public static readonly SENSITIVE_COMMANDS = new Set<string>([
    '/say', '/announce', '/all',
    '/schedule', '/listschedules', '/deleteschedule',
    '/welcome', '/setwelcome', '/goodbye', '/setgoodbye', '/autodeljoin',
    '/ban', '/unban', '/kick', '/mute', '/unmute',
    '/tmute', '/tban', '/dban', '/dmute', '/dkick',
    '/sban', '/smute', '/skick',
    '/warn', '/warnings', '/resetwarns', '/setwarnlimit',
    '/promote', '/demote', '/permissions', '/permission',
    '/setmod', '/delmod',
    '/security', '/antiraid', '/captcha', '/autoaccept', '/chatbot',
    '/protection', '/roxie', '/roxiemode', '/roxiereaction', '/reaction',
    '/lust', '/lustmod', '/lustmode',
    '/clearmemory',
    '/automation', '/settings', '/setrules', '/clearrules',
    '/flood', '/setflood', '/antiflood',
    '/filter', '/unfilter', '/stop', '/filters', '/filterlist',
    '/del', '/delete', '/clear', '/purge',
    '/links', '/link', '/media', '/images', '/image', '/photos', '/photo',
    '/stickers', '/sticker', '/gifs', '/gif', '/videos', '/video', '/voice', '/audio',
    '/lock', '/unlock', '/locks', '/locklist',
    '/linkallow', '/linkwhitelist', '/allowlink', '/linkunallow', '/linkdisallow',
    '/removelink', '/linkallowlist', '/linkslist',
    '/pin', '/unpin', '/unpinall',
    '/slowmode', '/slow',
    '/adminlog', '/modlog', '/logs',
    '/free', '/unfree', '/freelist', '/freed',
    '/stopspam', '/stopabusive', '/addabuse', '/removeabuse',
    '/listabuse', '/clearabuse', '/stoppromotion', '/file',
    '/note', '/delnote',
    '/exportconfig', '/importconfig',
    '/addstickerpack', '/addbulkstickers', '/addbulksticker', '/addsticker', '/addgif', '/liststickers', '/listgifs', '/removesticker', '/removegif', '/clearstickers', '/cleargifs',
    '/teststicker', '/stickerpackremove', '/removestickerpack', '/delstickerpack'
  ]);

  public static async handleCommand(ctx: CommandContext): Promise<boolean> {
    const rawCmd = ctx.command;
    const cmd = rawCmd.toLowerCase().split('@')[0]; // strip bot username if present, e.g. /ban@MissRoxie_Bot
    console.log(`[COMMAND] received command=${rawCmd} chatId=${ctx.chatId} userId=${ctx.sender?.id}`);
    console.log(`[COMMAND] parsed name=${cmd.replace(/^\//, '')} args=${JSON.stringify(ctx.args || [])}`);

    const catalogItem = CommandHandler.catalogMap.get(cmd);
    const isPublic = CommandHandler.PUBLIC_GROUP_COMMANDS.has(cmd) || (catalogItem?.permission === 'Everyone');
    const isAdminOnly = CommandHandler.ADMIN_ONLY_COMMANDS.has(cmd) || (catalogItem && catalogItem.permission !== 'Everyone');
    const isSensitive = CommandHandler.SENSITIVE_COMMANDS.has(cmd) || (catalogItem?.modifiesState === true);
    const isRegistered = isPublic || isAdminOnly || isSensitive || Boolean(catalogItem);

    if (!isRegistered) {
      console.log(`[COMMAND] registry lookup command=${cmd.replace(/^\//, '')} result=NOT_FOUND`);
      return false;
    }
    console.log(`[COMMAND] registry lookup command=${cmd.replace(/^\//, '')} result=FOUND`);

    if (isAdminOnly) {
      // Centrally enforce admin-only requirement on ALL Roxie admin and moderation commands
      const auth = await TelegramMiddleware.requireAdmin(ctx);
      if (!auth.allowed) {
        console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=DENIED`);
        return true; // Command was handled (denial notice dispatched)
      }
      console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=ALLOWED`);
    } else if (isPublic) {
      const allowedInPrivate = catalogItem?.scopes?.includes('private') || ['/help', '/start', '/ping', '/live', '/settings', '/mymemory', '/forgetme'].includes(cmd);
      if (!allowedInPrivate && !(await TelegramMiddleware.requireGroup(ctx))) {
        console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=DENIED_NOT_GROUP`);
        return true;
      }
      console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=ALLOWED`);
    } else if (isSensitive) {
      if (!(await TelegramMiddleware.requireGroup(ctx))) {
        console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=DENIED_NOT_GROUP`);
        return true;
      }
      console.log(`[COMMAND] authorization command=${cmd.replace(/^\//, '')} result=ALLOWED`);
    }

    console.log(`[COMMAND] handler command=${cmd.replace(/^\//, '')} invoked`);

    if (TelegramMiddleware.isGroup(ctx.message) && CommandHandler.SENSITIVE_COMMANDS.has(cmd)) {
      const delay = cmd === '/say' ? 1000 : 4500;
      setTimeout(() => {
        telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id).catch(() => {});
      }, delay);
    }

    switch (cmd) {
      case '/del':
      case '/delete':
        await this.handleDel(ctx);
        return true;
      case '/clear':
      case '/purge':
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
      case '/mute':
        await this.handleMute(ctx);
        return true;
      case '/unmute':
        await this.handleUnmute(ctx);
        return true;
      case '/tmute':
        await this.handleTMute(ctx);
        return true;
      case '/tban':
        await this.handleTBan(ctx);
        return true;
      case '/dban':
        await this.handleDBan(ctx);
        return true;
      case '/dmute':
        await this.handleDMute(ctx);
        return true;
      case '/dkick':
        await this.handleDKick(ctx);
        return true;
      case '/sban':
        await this.handleSBan(ctx);
        return true;
      case '/smute':
        await this.handleSMute(ctx);
        return true;
      case '/skick':
        await this.handleSKick(ctx);
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
      case '/linkallow':
      case '/linkwhitelist':
      case '/allowlink':
        await this.handleLinkAllow(ctx);
        return true;
      case '/linkunallow':
      case '/linkdisallow':
      case '/removelink':
        await this.handleLinkUnallow(ctx);
        return true;
      case '/linkallowlist':
      case '/linkslist':
        await this.handleLinkAllowList(ctx);
        return true;
      case '/images':
      case '/image':
        await this.handleImageSetting(ctx);
        return true;
      case '/photos':
      case '/photo':
        await this.handlePhotosSetting(ctx);
        return true;
      case '/link':
        await this.handleLinkSetting(ctx);
        return true;
      case '/gif':
      case '/gifs':
        await this.handleGifSetting(ctx);
        return true;
      case '/file':
        await this.handleFileSetting(ctx);
        return true;
      case '/addstickerpack':
        await this.handleAddStickerPack(ctx);
        return true;
      case '/addbulkstickers':
      case '/addbulksticker':
        await this.handleAddBulkSticker(ctx);
        return true;
      case '/addsticker':
        await this.handleAddSticker(ctx);
        return true;
      case '/addgif':
        await this.handleAddGif(ctx);
        return true;
      case '/liststickers':
      case '/listgifs':
        await this.handleListStickers(ctx);
        return true;
      case '/removesticker':
      case '/removegif':
        await this.handleRemoveSticker(ctx);
        return true;
      case '/stickerpackremove':
      case '/removestickerpack':
      case '/delstickerpack':
        await this.handleStickerPackRemove(ctx);
        return true;
      case '/clearstickers':
      case '/cleargifs':
        await this.handleClearStickers(ctx);
        return true;
      case '/stopspam':
        await this.handleStopSpam(ctx);
        return true;
      case '/stopabusive':
        await this.handleStopAbusive(ctx);
        return true;
      case '/addabuse':
        await this.handleAddAbusive(ctx);
        return true;
      case '/removeabuse':
        await this.handleRemoveAbusive(ctx);
        return true;
      case '/listabuse':
        await this.handleListAbusive(ctx);
        return true;
      case '/clearabuse':
        await this.handleClearAbusive(ctx);
        return true;
      case '/stoppromotion':
        await this.handleStopPromotion(ctx);
        return true;
      case '/stickers':
      case '/sticker':
        await this.handleStickersSetting(ctx);
        return true;
      case '/videos':
      case '/video':
        await this.handleVideosSetting(ctx);
        return true;
      case '/voice':
        await this.handleVoiceSetting(ctx);
        return true;
      case '/audio':
        await this.handleAudioSetting(ctx);
        return true;
      case '/lock':
        await this.handleLock(ctx);
        return true;
      case '/unlock':
        await this.handleUnlock(ctx);
        return true;
      case '/locks':
      case '/locklist':
        await this.handleLocks(ctx);
        return true;
      case '/flood':
      case '/setflood':
      case '/antiflood':
        await this.handleFloodSetting(ctx);
        return true;
      case '/filter':
        await this.handleFilterCommand(ctx);
        return true;
      case '/unfilter':
      case '/stop':
        await this.handleUnfilterCommand(ctx);
        return true;
      case '/filters':
      case '/filterlist':
        await this.handleFiltersList(ctx);
        return true;
      case '/welcome':
        await this.handleWelcomeSetting(ctx);
        return true;
      case '/setwelcome':
        await this.handleSetWelcome(ctx);
        return true;
      case '/goodbye':
        await this.handleGoodbyeSetting(ctx);
        return true;
      case '/setgoodbye':
        await this.handleSetGoodbye(ctx);
        return true;
      case '/autodeljoin':
        await this.handleAutoDeleteJoinLeaveSetting(ctx);
        return true;
      case '/pin':
        await this.handlePin(ctx);
        return true;
      case '/unpin':
        await this.handleUnpin(ctx);
        return true;
      case '/unpinall':
        await this.handleUnpinAll(ctx);
        return true;
      case '/slowmode':
      case '/slow':
        await this.handleSlowMode(ctx);
        return true;
      case '/adminlog':
      case '/modlog':
      case '/logs':
        await this.handleAdminLog(ctx);
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
      case '/all':
        await this.handleAll(ctx);
        return true;
      case '/announce':
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
      case '/report':
        await this.handleReport(ctx);
        return true;
      case '/note':
        await this.handleNote(ctx);
        return true;
      case '/getnote':
        await this.handleGetNote(ctx);
        return true;
      case '/notes':
        await this.handleNotesList(ctx);
        return true;
      case '/delnote':
        await this.handleDelNote(ctx);
        return true;
      case '/exportconfig':
        await this.handleExportConfig(ctx);
        return true;
      case '/importconfig':
        await this.handleImportConfig(ctx);
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
      case '/settings':
        await this.handleSettings(ctx);
        return true;
      case '/help':
        await this.handleHelp(ctx);
        return true;
      case '/automod':
        await this.handleAutoMod(ctx);
        return true;
      case '/media':
        await this.handleMediaCommand(ctx);
        return true;
      case '/warnsettings':
        await this.handleWarnSettings(ctx);
        return true;
      case '/security':
        await this.handleSecurity(ctx);
        return true;
      case '/captcha':
        await this.handleCaptchaSetting(ctx);
        return true;
      case '/antiraid':
        await this.handleAntiRaidSetting(ctx);
        return true;
      case '/clearmemory':
        await this.handleClearMemory(ctx);
        return true;
      case '/mymemory':
        await this.handleMyMemory(ctx);
        return true;
      case '/forgetme':
        await this.handleForgetMe(ctx);
        return true;
      case '/chatbot':
        await this.handleChatbot(ctx);
        return true;
      case '/protection':
        await this.handleProtection(ctx);
        return true;
      case '/roxie':
        await this.handleRoxie(ctx);
        return true;
      case '/roxiemode':
        await this.handleRoxieMode(ctx);
        return true;
      case '/joinmode':
        await this.handleJoinMode(ctx);
        return true;
      case '/autoaccept':
        await this.handleAutoAccept(ctx);
        return true;
      case '/automation':
        await this.handleAutomation(ctx);
        return true;
      case '/setrules':
      case '/clearrules':
      case '/rules':
        await this.handleRules(ctx);
        return true;
      case '/teststicker':
        await this.handleTestSticker(ctx);
        return true;
      case '/roxiereaction':
      case '/reaction':
        await this.handleRoxieReaction(ctx);
        return true;
      case '/lust':
      case '/lustmod':
      case '/lustmode':
        await this.handleLustMode(ctx);
        return true;
      default:
        return false;
    }
  }

  /**
   * Retrieves the uncorrupted message body from a command context, preserving
   * all original line breaks, paragraph breaks, indentation, emojis, punctuation, and URLs.
   * If skipArgCount > 0, skips the first `skipArgCount` whitespace-delimited tokens
   * (e.g. interval like '10m' or note name like 'rules') and returns the exact remainder.
   */
  public static getCommandText(ctx: CommandContext, skipArgCount: number = 0): string {
    // 1. Determine raw text source
    let source = ctx.rawArgs;
    if (source === undefined || source === null) {
      const fullText = ctx.message?.text || ctx.message?.caption || '';
      const cmdMatch = fullText.match(/^([\/!][^\s]+)([\s\S]*)$/);
      if (cmdMatch) {
        source = cmdMatch[2].replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
      } else {
        source = ctx.args.slice(skipArgCount).join(' ');
        return source.trim();
      }
    }

    if (skipArgCount === 0) {
      return source.trimEnd();
    }

    // Skip the requested number of whitespace-delimited tokens from source
    let remainder = source.trimStart();
    for (let i = 0; i < skipArgCount; i++) {
      const tokenMatch = remainder.match(/^[^\s]+([\s\S]*)$/);
      if (!tokenMatch) {
        return '';
      }
      remainder = tokenMatch[1].replace(/^[ \t]*\r?\n/, '').replace(/^[ \t]+/, '');
    }

    return remainder.trimEnd();
  }

  // ==========================================
  // PHASE 10 HANDLERS
  // ==========================================
  private static async handleAutoMod(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.automodEnabled = true;
      settings.stopSpamEnabled = true;
      settings.stopAbusiveEnabled = true;
      settings.stopPromotionEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'automod',
        action: 'automod_toggle',
        result: 'success',
        reason: 'Auto Moderation enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Smart Auto Moderation</b> has been enabled (Spam, Abusive, & Promotion protection active).');
    } else if (action === 'off') {
      settings.automodEnabled = false;
      settings.stopSpamEnabled = false;
      settings.stopAbusiveEnabled = false;
      settings.stopPromotionEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'automod',
        action: 'automod_toggle',
        result: 'success',
        reason: 'Auto Moderation disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Smart Auto Moderation</b> has been disabled.');
    } else {
      const status = settings.automodEnabled ? '🟢 Enabled' : '🔴 Disabled';
      await telegramApi.sendMessage(ctx.chatId, `🛡️ <b>Auto Moderation Status</b>\nStatus: ${status}\n- Spam Protection: ${settings.stopSpamEnabled ? 'ON' : 'OFF'}\n- Abusive Protection: ${settings.stopAbusiveEnabled ? 'ON' : 'OFF'}\n- Promotion Protection: ${settings.stopPromotionEnabled ? 'ON' : 'OFF'}`);
    }
  }

  private static async handleMediaCommand(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    if (action === 'status') {
      await telegramApi.sendMessage(ctx.chatId, `🖼️ <b>Media Protection Status</b>\n- GIF: ${settings.gifsProtection ? 'ON' : 'OFF'}\n- Link: ${settings.linkProtection ? 'ON' : 'OFF'}\n- Image: ${settings.imageProtection ? 'ON' : 'OFF'}\n- File: ${settings.fileProtection ? 'ON' : 'OFF'}\n- Video: ${settings.videosProtection ? 'ON' : 'OFF'}\n- Voice: ${settings.voiceProtection ? 'ON' : 'OFF'}\n- Sticker: ${settings.stickerProtection ? 'ON' : 'OFF'}\n- Media Action: ${settings.mediaAction || 'delete'}`);
    } else {
      await telegramApi.sendMessage(ctx.chatId, 'Usage: /media status or use /gif on/off, /link on/off, /image on/off, /file on/off, /video on/off, /voice on/off, /sticker on/off.');
    }
  }

  private static async handleWarnSettings(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const sub = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    if (sub === 'action') {
      const act = ctx.args[1] as any;
      if (['warn_only', 'mute', 'ban', 'kick'].includes(act)) {
        settings.warnAction = act;
        db.scheduleSave();
        await telegramApi.sendMessage(ctx.chatId, `⚠️ Warning threshold action updated to: <b>${act}</b>`);
      } else {
        await telegramApi.sendMessage(ctx.chatId, 'Usage: /warnsettings action <warn_only|mute|ban|kick>');
      }
    } else {
      await telegramApi.sendMessage(ctx.chatId, `⚠️ <b>Warning Settings</b>\n- Limit: ${settings.warnLimit}\n- Default Action: ${settings.warnAction}\n- Expire Time: ${settings.warnExpireSeconds}s`);
    }
  }

  private static async handleSecurity(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.securityEnabled = true;
      settings.captchaEnabled = true;
      settings.raidEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'security',
        action: 'security_toggle',
        result: 'success',
        reason: 'Security center enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔒 <b>Security Center</b> enabled (CAPTCHA & Anti-Raid active).');
    } else if (action === 'off') {
      settings.securityEnabled = false;
      settings.captchaEnabled = false;
      settings.raidEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'security',
        action: 'security_toggle',
        result: 'success',
        reason: 'Security center disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔒 <b>Security Center</b> disabled.');
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🔒 <b>Security Center Status</b>\n- Security: ${settings.securityEnabled ? 'ON' : 'OFF'}\n- CAPTCHA: ${settings.captchaEnabled ? 'ON' : 'OFF'}\n- Anti-Raid: ${settings.raidEnabled ? 'ON' : 'OFF'}\n- Join Mode: ${settings.joinmode || 'normal'}`);
    }
  }

  private static async handleCaptchaSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.captchaEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'captcha',
        action: 'captcha_toggle',
        result: 'success',
        reason: 'Captcha enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>CAPTCHA Verification</b> enabled.');
    } else if (action === 'off') {
      settings.captchaEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'captcha',
        action: 'captcha_toggle',
        result: 'success',
        reason: 'Captcha disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>CAPTCHA Verification</b> disabled.');
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🤖 <b>CAPTCHA Status</b>: ${settings.captchaEnabled ? 'ON' : 'OFF'}`);
    }
  }

  private static async handleAntiRaidSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.raidEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'antiraid',
        action: 'antiraid_toggle',
        result: 'success',
        reason: 'Anti-raid enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Anti-Raid Protection</b> enabled.');
    } else if (action === 'off') {
      settings.raidEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'antiraid',
        action: 'antiraid_toggle',
        result: 'success',
        reason: 'Anti-raid disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Anti-Raid Protection</b> disabled.');
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🛡️ <b>Anti-Raid Status</b>: ${settings.raidEnabled ? 'ON' : 'OFF'}`);
    }
  }

  private static async handleChatbot(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.chatbotEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'chatbot',
        action: 'setting_change',
        result: 'success',
        reason: 'Roxie AI chatbot enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>Roxie AI Chatbot</b> is now ENABLED in this group.');
    } else if (action === 'off') {
      settings.chatbotEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'chatbot',
        action: 'setting_change',
        result: 'success',
        reason: 'Roxie AI chatbot disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>Roxie AI Chatbot</b> is now DISABLED in this group.');
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🤖 <b>Roxie AI Chatbot Status</b>: ${settings.chatbotEnabled ? 'ON' : 'OFF'}\nUse <code>/chatbot on</code> or <code>/chatbot off</code> to toggle.`);
    }
  }

  private static async handleProtection(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || 'status').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    if (action === 'on') {
      settings.protectionEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'protection',
        action: 'setting_change',
        result: 'success',
        reason: 'Smart user protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Smart User Protection</b> is now <b>ENABLED</b>.');
    } else if (action === 'off') {
      settings.protectionEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'protection',
        action: 'setting_change',
        result: 'success',
        reason: 'Smart user protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Smart User Protection</b> is now <b>DISABLED</b>.');
    } else {
      const isEnabled = settings.protectionEnabled !== false;
      await telegramApi.sendMessage(
        ctx.chatId,
        `🛡️ <b>Smart User Protection Status</b>\n\n` +
        `• Status: <b>${isEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
        `• Flood Threshold: <b>${settings.protectionFloodCount || 5}</b> msgs in <b>${settings.protectionFloodWindow || 5}s</b>\n` +
        `• Duplicate Limit: <b>${settings.protectionDuplicateLimit || 3}</b> identical msgs\n` +
        `• Link Burst Limit: <b>${settings.protectionLinkBurstLimit || 3}</b> links in 15s\n\n` +
        `Use <code>/protection on</code>, <code>/protection off</code>, or <code>/protection status</code>.`
      );
    }
  }

  private static async handleRoxie(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || 'status').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    if (action === 'on') {
      settings.chatbotEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxie',
        action: 'setting_change',
        result: 'success',
        reason: 'Roxie AI chatbot enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>Roxie AI Chatbot</b> is now ENABLED in this group.');
    } else if (action === 'off') {
      settings.chatbotEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxie',
        action: 'setting_change',
        result: 'success',
        reason: 'Roxie AI chatbot disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🤖 <b>Roxie AI Chatbot</b> is now DISABLED in this group.');
    } else {
      const statusText = settings.chatbotEnabled ? '🟢 ENABLED' : '🔴 DISABLED';
      const modeText = settings.chatbotMode || 'auto';
      const mediaLib = db.getMediaLibrary();
      const stickerCount = Object.values(mediaLib.stickers || {}).reduce((acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0);
      const animCount = Object.values(mediaLib.animations || {}).reduce((acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0);

      await telegramApi.sendMessage(
        ctx.chatId,
        `🤖 <b>Roxie AI Control Center Status & Diagnostics</b>\n\n` +
        `• <b>Chatbot Status</b>: ${statusText}\n` +
        `• <b>Behavior Mode</b>: <code>${modeText}</code>\n` +
        `• <b>Loaded Stickers</b>: ${stickerCount} file(s)\n` +
        `• <b>Loaded GIFs</b>: ${animCount} file(s)\n\n` +
        `<i>Use <code>/roxie on</code>, <code>/roxie off</code>, or <code>/roxiemode &lt;normal|friendly|auto&gt;</code> to manage.</i>`
      );
    }
  }

  private static async handleRoxieMode(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const rawArg = (ctx.args[0] || '').toLowerCase().trim();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    const validModesMap: Record<string, string> = {
      auto: 'auto',
      normal: 'normal',
      friendly: 'friendly',
      cute: 'cute',
      playful: 'playful',
      teasing: 'teasing',
      roasting: 'roasting',
      roast: 'roasting',
      sarcastic: 'sarcastic',
      caring: 'caring',
      loving: 'loving',
      romantic: 'romantic',
      flirty: 'flirty',
      flirt: 'flirty',
      seductive: 'seductive',
      angry: 'angry',
      joyful: 'joyful',
      happy: 'happy',
      excited: 'excited',
      fearful: 'fearful',
      peaceful: 'peaceful',
      calm: 'calm',
      gloomy: 'gloomy',
      sad: 'sad',
      comforting: 'comforting',
      'sad/comforting': 'sad/comforting',
      anxious: 'anxious',
      apathetic: 'apathetic',
      moody: 'moody',
      grumpy: 'grumpy',
      serious: 'serious',
      curious: 'curious',
      confused: 'confused',
      surprised: 'surprised',
      embarrassed: 'embarrassed',
      jealous: 'jealous',
      protective: 'protective',
      motivational: 'motivational',
      sympathetic: 'sympathetic'
    };

    if (rawArg && validModesMap[rawArg]) {
      const targetMode = validModesMap[rawArg];
      settings.chatbotMode = targetMode;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxiemode',
        action: 'setting_change',
        result: 'success',
        reason: `Roxie AI mode set to ${targetMode}`
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `🤖 <b>Roxie AI Mode</b> successfully updated to: <code>${targetMode}</code>.`
      );
    } else {
      const currentMode = settings.chatbotMode || 'auto';
      const mediaLib = db.getMediaLibrary();
      const stickerCount = Object.values(mediaLib.stickers || {}).reduce((acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0);
      const animCount = Object.values(mediaLib.animations || {}).reduce((acc: number, list: any) => acc + (Array.isArray(list) ? list.length : 0), 0);

      await telegramApi.sendMessage(
        ctx.chatId,
        `🤖 <b>Roxie AI Behavior & Mood Control</b>\n\n` +
        `• <b>Current Active Mode</b>: <code>${currentMode}</code>\n` +
        `• <b>Loaded Stickers</b>: ${stickerCount} registered\n` +
        `• <b>Loaded GIFs</b>: ${animCount} registered\n\n` +
        `<b>Available Modes:</b>\n` +
        `• <code>/roxiemode auto</code> (Default: dynamic tone detection)\n` +
        `• <code>/roxiemode normal</code> (Chill & observant)\n` +
        `• <code>/roxiemode friendly</code> (Warm & conversational)\n` +
        `• <code>/roxiemode playful</code> (Witty & energetic)\n` +
        `• <code>/roxiemode teasing</code> (Playful roasting & banter)\n` +
        `• <code>/roxiemode sarcastic</code> (Dry wit & irony)\n` +
        `• <code>/roxiemode serious</code> (Focused & direct)\n` +
        `• <code>/roxiemode cute</code> (Charming & sweet)\n` +
        `• <code>/roxiemode romantic</code> (Heartfelt warmth)\n` +
        `• <code>/roxiemode flirty</code> (Playful flirtation)\n` +
        `• <code>/roxiemode status</code> (Show status & diagnostics)\n\n` +
        `<i>Note: Flirting is never the default personality.</i>`
      );
    }
  }

  private static async handleClearMemory(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    ChatbotService.clearConversation(ctx.chatId);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'clearmemory',
      action: 'setting_change',
      result: 'success',
      reason: 'Cleared chatbot conversation memory'
    });
    await telegramApi.sendMessage(
      ctx.chatId,
      `🧠 <b>Roxie's conversation memory has been cleared for this chat.</b>\n<i>Fresh slate for new conversations!</i>`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleMyMemory(ctx: CommandContext) {
    const userId = ctx.sender?.id || 0;
    if (!userId) {
      await telegramApi.sendMessage(ctx.chatId, '❌ Could not resolve your user ID.');
      return;
    }
    const memories = db.getUserMemory(ctx.chatId, userId);
    if (memories.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🧠 <b>Your Stored Memory:</b>\n\n<i>No memory facts stored for you in this chat yet. Roxie learns about you as you chat naturally!</i>`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }
    const list = memories.map((m, idx) => `${idx + 1}. ${escapeHtml(m)}`).join('\n');
    await telegramApi.sendMessage(
      ctx.chatId,
      `🧠 <b>Your Stored Memory (${memories.length}/8 facts):</b>\n\n${list}\n\n<i>Use /forgetme to clear your memory facts.</i>`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleForgetMe(ctx: CommandContext) {
    const userId = ctx.sender?.id || 0;
    if (!userId) {
      await telegramApi.sendMessage(ctx.chatId, '❌ Could not resolve your user ID.');
      return;
    }
    const cleared = db.clearUserMemory(ctx.chatId, userId);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'forgetme',
      action: 'setting_change',
      result: 'success',
      reason: 'User cleared their personal memory'
    });
    await telegramApi.sendMessage(
      ctx.chatId,
      cleared 
        ? `🗑️ <b>Your stored memory has been completely forgotten for this chat.</b>\n<i>Starting with a clean slate!</i>`
        : `ℹ️ No stored memory found for you in this chat.`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  private static async handleJoinMode(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const mode = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (['normal', 'captcha', 'strict'].includes(mode)) {
      settings.joinmode = mode as any;
      if (mode === 'normal') {
        settings.captchaEnabled = false;
        settings.raidEnabled = false;
      } else if (mode === 'captcha') {
        settings.captchaEnabled = true;
        settings.raidEnabled = false;
      } else if (mode === 'strict') {
        settings.captchaEnabled = true;
        settings.raidEnabled = true;
      }
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'joinmode',
        action: 'joinmode_change',
        result: 'success',
        reason: `Joinmode set to ${mode}`
      });
      await telegramApi.sendMessage(ctx.chatId, `🚪 <b>Join Mode</b> set to: <b>${mode}</b>`);
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🚪 <b>Current Join Mode</b>: ${settings.joinmode || 'normal'}\nUsage: /joinmode <normal|captcha|strict>`);
    }
  }

  private static async handleAutoAccept(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const action = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (action === 'on') {
      settings.autoAcceptEnabled = true;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'autoaccept',
        action: 'auto_accept',
        result: 'success',
        reason: 'Auto accept enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '✅ <b>Auto Accept Join Requests</b> enabled.');
    } else if (action === 'off') {
      settings.autoAcceptEnabled = false;
      db.scheduleSave();
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'autoaccept',
        action: 'auto_accept',
        result: 'success',
        reason: 'Auto accept disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '❌ <b>Auto Accept Join Requests</b> disabled.');
    } else {
      await telegramApi.sendMessage(ctx.chatId, `✅ <b>Auto Accept Status</b>: ${settings.autoAcceptEnabled ? 'ON' : 'OFF'}`);
    }
  }

  private static async handleAutomation(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const sub = (ctx.args[0] || '').toLowerCase();
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (sub === 'add') {
      const trigger = ctx.args[1];
      const action = ctx.args[2];
      if (!trigger || !action) {
        await telegramApi.sendMessage(ctx.chatId, 'Usage: /automation add <trigger> <action> (e.g. /automation add spam delete)');
        return;
      }
      const auto = {
        id: Math.random().toString(36).substring(2, 9),
        trigger,
        action,
        parameters: ctx.args.slice(3).join(' '),
        enabled: true,
        createdBy: ctx.sender?.id || 0,
        createdAt: new Date().toISOString()
      };
      db.addAutomation(ctx.chatId, auto);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'automation',
        action: 'automation_add',
        result: 'success',
        reason: `Added automation rule ${auto.id}`
      });
      await telegramApi.sendMessage(ctx.chatId, `⚙️ Automation rule added successfully (ID: <code>${auto.id}</code>).`);
    } else if (sub === 'remove') {
      const id = ctx.args[1];
      if (!id) {
        await telegramApi.sendMessage(ctx.chatId, 'Usage: /automation remove <id>');
        return;
      }
      const removed = db.removeAutomation(ctx.chatId, id);
      if (removed) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor,
          command: 'automation',
          action: 'automation_remove',
          result: 'success',
          reason: `Removed automation rule ${id}`
        });
      }
      await telegramApi.sendMessage(ctx.chatId, removed ? `🗑️ Automation rule ${id} removed.` : `❌ Rule ${id} not found.`);
    } else {
      const autos = db.getAutomations(ctx.chatId);
      if (autos.length === 0) {
        await telegramApi.sendMessage(ctx.chatId, '⚙️ No active automation rules configured.');
      } else {
        const text = autos.map((a: any) => `• <b>ID:</b> ${a.id} | <b>Trigger:</b> ${a.trigger} | <b>Action:</b> ${a.action} | <b>Status:</b> ${a.enabled ? 'Enabled' : 'Disabled'}`).join('\n');
        await telegramApi.sendMessage(ctx.chatId, `⚙️ <b>Automation Rules (${autos.length}):</b>\n\n${text}`);
      }
    }
  }

  private static async handleRules(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (ctx.command.toLowerCase().includes('setrules')) {
      if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
      const text = CommandHandler.getCommandText(ctx, 0);
      if (!text) {
        await telegramApi.sendMessage(ctx.chatId, 'Usage: /setrules <rules text>');
        return;
      }
      db.setRules(ctx.chatId, text);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'setrules',
        action: 'rules_update',
        result: 'success',
        reason: 'Updated rules'
      });
      await telegramApi.sendMessage(ctx.chatId, '📜 Group rules have been updated successfully.');
    } else if (ctx.command.toLowerCase().includes('clearrules')) {
      if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
      db.clearRules(ctx.chatId);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'clearrules',
        action: 'rules_update',
        result: 'success',
        reason: 'Cleared rules'
      });
      await telegramApi.sendMessage(ctx.chatId, '📜 Group rules have been cleared.');
    } else {
      const rules = db.getRules(ctx.chatId);
      const chatTitle = ctx.chatTitle || 'this group';
      const mention = ctx.sender ? `<a href="tg://user?id=${ctx.sender.id}">${escapeHtml(ctx.sender.first_name)}</a>` : 'User';
      const formatted = rules
        .replace(/\{chat_title\}/g, escapeHtml(chatTitle))
        .replace(/\{mention\}/g, mention);

      if (!rules) {
        await telegramApi.sendMessage(ctx.chatId, '📜 No rules set for this group yet. Use /setrules to configure them.');
      } else {
        await telegramApi.sendMessage(ctx.chatId, `📜 <b>Group Rules for ${escapeHtml(chatTitle)}:</b>\n\n${formatted}`);
      }
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

    const isTargetInArgs = target.source === 'numeric_id' || target.source === 'username';
    const timeArg = isTargetInArgs ? ctx.args[1] : ctx.args[0];
    const duration = timeArg ? parseDuration(timeArg) : null;

    let untilDateSec: number | undefined = undefined;
    let reasonArgs: string[];
    if (duration) {
      untilDateSec = Math.floor(Date.now() / 1000) + duration.seconds;
      reasonArgs = isTargetInArgs ? ctx.args.slice(2) : ctx.args.slice(1);
    } else {
      reasonArgs = isTargetInArgs ? ctx.args.slice(1) : ctx.args;
    }
    const reason = reasonArgs.join(' ') || (duration ? 'Temporary ban' : 'Admin ban');
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await ModerationService.executeBan(ctx.chatId, target.targetUserId, untilDateSec);

    if (res.ok) {
      if (untilDateSec) {
        db.addTempAction({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          userId: target.targetUserId,
          username: target.targetUsername,
          action: 'tban',
          durationSeconds: duration!.seconds,
          durationFormatted: duration!.formatted,
          expiresAt: untilDateSec,
          reason,
          adminId: actor.actorUserId,
          adminUsername: actor.actorUsername
        });
      }

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
        `🔨 <b>${targetTag} has been banned${duration ? ` for ${duration.formatted}` : ''}.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`,
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
  // 3a. MUTE COMMAND (/mute)
  // ==========================================
  private static async handleMute(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'mute');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'mute',
          action: 'mute',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot mute this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const isTargetInArgs = target.source === 'numeric_id' || target.source === 'username';
    const timeArg = isTargetInArgs ? ctx.args[1] : ctx.args[0];
    const duration = timeArg ? parseDuration(timeArg) : null;

    let untilDateSec: number | undefined = undefined;
    let reasonArgs: string[];
    if (duration) {
      untilDateSec = Math.floor(Date.now() / 1000) + duration.seconds;
      reasonArgs = isTargetInArgs ? ctx.args.slice(2) : ctx.args.slice(1);
    } else {
      reasonArgs = isTargetInArgs ? ctx.args.slice(1) : ctx.args;
    }
    const reason = reasonArgs.join(' ') || (duration ? 'Temporary mute' : 'Admin mute');
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await ModerationService.executeMute(ctx.chatId, target.targetUserId, untilDateSec);

    if (res.ok) {
      if (untilDateSec) {
        db.addTempAction({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          userId: target.targetUserId,
          username: target.targetUsername,
          action: 'tmute',
          durationSeconds: duration!.seconds,
          durationFormatted: duration!.formatted,
          expiresAt: untilDateSec,
          reason,
          adminId: actor.actorUserId,
          adminUsername: actor.actorUsername
        });
      }

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'mute',
        action: 'mute',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔇 <b>${targetTag} has been muted${duration ? ` for ${duration.formatted}` : ''}.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('mute', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'mute',
        action: 'mute',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 3b. UNMUTE COMMAND (/unmute)
  // ==========================================
  private static async handleUnmute(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'unmute');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'unmute',
          action: 'unmute',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot unmute this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);
    const res = await ModerationService.executeUnmute(ctx.chatId, target.targetUserId);

    if (res.ok) {
      db.removeTempAction(ctx.chatId, target.targetUserId, 'tmute');

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'unmute',
        action: 'unmute',
        result: 'success'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔊 <b>${targetTag} has been unmuted.</b>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('unmute', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'unmute',
        action: 'unmute',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 3c. TEMPORARY MUTE COMMAND (/tmute)
  // ==========================================
  private static async handleTMute(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'tmute');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'tmute',
          action: 'tmute',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot tmute this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const isTargetInArgs = target.source === 'numeric_id' || target.source === 'username';
    const timeArg = isTargetInArgs ? ctx.args[1] : ctx.args[0];
    const duration = timeArg ? parseDuration(timeArg) : null;

    if (!duration) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Invalid or missing duration.</b>\n\n` +
        `<b>Usage:</b>\n` +
        `• <i>(Reply)</i> <code>/tmute &lt;time&gt; [reason]</code>\n` +
        `• <code>/tmute &lt;@user|id&gt; &lt;time&gt; [reason]</code>\n\n` +
        `<b>Examples:</b> <code>/tmute 30m</code>, <code>/tmute 2h spamming</code>, <code>/tmute 1d</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const reasonArgs = isTargetInArgs ? ctx.args.slice(2) : ctx.args.slice(1);
    const reason = reasonArgs.join(' ') || 'Temporary mute';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const untilDateSec = Math.floor(Date.now() / 1000) + duration.seconds;
    const res = await ModerationService.executeMute(ctx.chatId, target.targetUserId, untilDateSec);

    if (res.ok) {
      db.addTempAction({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        userId: target.targetUserId,
        username: target.targetUsername,
        action: 'tmute',
        durationSeconds: duration.seconds,
        durationFormatted: duration.formatted,
        expiresAt: untilDateSec,
        reason,
        adminId: actor.actorUserId,
        adminUsername: actor.actorUsername
      });

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'tmute',
        action: 'tmute',
        result: 'success',
        reason,
        details: `Muted for ${duration.formatted}`
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔇 <b>${targetTag} has been muted for ${duration.formatted}.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('tmute', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'tmute',
        action: 'tmute',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 3d. TEMPORARY BAN COMMAND (/tban)
  // ==========================================
  private static async handleTBan(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'tban');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'tban',
          action: 'tban',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot tban this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const isTargetInArgs = target.source === 'numeric_id' || target.source === 'username';
    const timeArg = isTargetInArgs ? ctx.args[1] : ctx.args[0];
    const duration = timeArg ? parseDuration(timeArg) : null;

    if (!duration) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Invalid or missing duration.</b>\n\n` +
        `<b>Usage:</b>\n` +
        `• <i>(Reply)</i> <code>/tban &lt;time&gt; [reason]</code>\n` +
        `• <code>/tban &lt;@user|id&gt; &lt;time&gt; [reason]</code>\n\n` +
        `<b>Examples:</b> <code>/tban 1d</code>, <code>/tban 7d rule violation</code>, <code>/tban 2h</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const reasonArgs = isTargetInArgs ? ctx.args.slice(2) : ctx.args.slice(1);
    const reason = reasonArgs.join(' ') || 'Temporary ban';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const untilDateSec = Math.floor(Date.now() / 1000) + duration.seconds;
    const res = await ModerationService.executeBan(ctx.chatId, target.targetUserId, untilDateSec);

    if (res.ok) {
      db.addTempAction({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        userId: target.targetUserId,
        username: target.targetUsername,
        action: 'tban',
        durationSeconds: duration.seconds,
        durationFormatted: duration.formatted,
        expiresAt: untilDateSec,
        reason,
        adminId: actor.actorUserId,
        adminUsername: actor.actorUsername
      });

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'tban',
        action: 'tban',
        result: 'success',
        reason,
        details: `Banned for ${duration.formatted}`
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔨 <b>${targetTag} has been banned for ${duration.formatted}.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      const friendlyError = mapTelegramError('tban', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'tban',
        action: 'tban',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  // ==========================================
  // 3e. DELETE & BAN COMMAND (/dban)
  // ==========================================
  private static async handleDBan(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'dban');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'dban',
          action: 'dban',
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

    // Delete replied message and command message if possible
    const replyMsgId = ctx.message.reply_to_message?.message_id;
    if (replyMsgId) {
      await Promise.allSettled([
        telegramApi.deleteMessage(ctx.chatId, replyMsgId),
        telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id)
      ]);
      db.untrackMessages(ctx.chatId, [replyMsgId, ctx.message.message_id]);
    }

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Admin dban';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await ModerationService.executeBan(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dban',
        action: 'dban',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔨 <b>${targetTag} has been banned and their message was deleted.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`
      );
    } else {
      const friendlyError = mapTelegramError('dban', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dban',
        action: 'dban',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError);
    }
  }

  // ==========================================
  // 3f. DELETE & MUTE COMMAND (/dmute)
  // ==========================================
  private static async handleDMute(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'dmute');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'dmute',
          action: 'dmute',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot mute this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    const replyMsgId = ctx.message.reply_to_message?.message_id;
    if (replyMsgId) {
      await Promise.allSettled([
        telegramApi.deleteMessage(ctx.chatId, replyMsgId),
        telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id)
      ]);
      db.untrackMessages(ctx.chatId, [replyMsgId, ctx.message.message_id]);
    }

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Admin dmute';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await ModerationService.executeMute(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dmute',
        action: 'dmute',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `🔇 <b>${targetTag} has been muted and their message was deleted.</b>${reason ? `\nReason: <i>${escapeHtml(reason)}</i>` : ''}`
      );
    } else {
      const friendlyError = mapTelegramError('dmute', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dmute',
        action: 'dmute',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError);
    }
  }

  // ==========================================
  // 3g. DELETE & KICK COMMAND (/dkick)
  // ==========================================
  private static async handleDKick(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'dkick');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'dkick',
          action: 'dkick',
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

    const replyMsgId = ctx.message.reply_to_message?.message_id;
    if (replyMsgId) {
      await Promise.allSettled([
        telegramApi.deleteMessage(ctx.chatId, replyMsgId),
        telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id)
      ]);
      db.untrackMessages(ctx.chatId, [replyMsgId, ctx.message.message_id]);
    }

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Admin dkick';
    const targetTag = target.targetUsername ? `@${target.targetUsername}` : (target.targetUser?.first_name || `User ${target.targetUserId}`);

    const res = await ModerationService.executeKick(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dkick',
        action: 'dkick',
        result: 'success',
        reason
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `👢 <b>${targetTag} was removed from the group and their message was deleted.</b>`
      );
    } else {
      const friendlyError = mapTelegramError('dkick', res.description, res.error_code);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'dkick',
        action: 'dkick',
        result: 'error',
        telegramError: res.description
      });

      await telegramApi.sendMessage(ctx.chatId, friendlyError);
    }
  }

  // ==========================================
  // 3h. SILENT BAN COMMAND (/sban)
  // ==========================================
  private static async handleSBan(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'sban');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'sban',
          action: 'sban',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot sban this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    // Delete command message and replied message (silent)
    const replyMsgId = ctx.message.reply_to_message?.message_id;
    const toDelete = [ctx.message.message_id];
    if (replyMsgId) toDelete.push(replyMsgId);

    await Promise.allSettled(toDelete.map((id) => telegramApi.deleteMessage(ctx.chatId, id)));
    db.untrackMessages(ctx.chatId, toDelete);

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Silent ban';
    const res = await ModerationService.executeBan(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'sban',
        action: 'sban',
        result: 'success',
        reason,
        details: 'Silent ban executed (messages deleted, no public notice)'
      });
    } else {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'sban',
        action: 'sban',
        result: 'error',
        telegramError: res.description
      });
    }
  }

  // ==========================================
  // 3i. SILENT MUTE COMMAND (/smute)
  // ==========================================
  private static async handleSMute(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'smute');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'smute',
          action: 'smute',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot smute this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    // Delete command message and replied message (silent)
    const replyMsgId = ctx.message.reply_to_message?.message_id;
    const toDelete = [ctx.message.message_id];
    if (replyMsgId) toDelete.push(replyMsgId);

    await Promise.allSettled(toDelete.map((id) => telegramApi.deleteMessage(ctx.chatId, id)));
    db.untrackMessages(ctx.chatId, toDelete);

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Silent mute';
    const res = await ModerationService.executeMute(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'smute',
        action: 'smute',
        result: 'success',
        reason,
        details: 'Silent mute executed (messages deleted, no public notice)'
      });
    } else {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'smute',
        action: 'smute',
        result: 'error',
        telegramError: res.description
      });
    }
  }

  // ==========================================
  // 3j. SILENT KICK COMMAND (/skick)
  // ==========================================
  private static async handleSKick(ctx: CommandContext) {
    const validation = await TelegramMiddleware.validateModerationAction(ctx, 'skick');

    if (!validation.allowed) {
      if (validation.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: validation.actor,
          target: validation.target,
          command: 'skick',
          action: 'skick',
          result: 'denied',
          reason: validation.reason
        });
      }
      await telegramApi.sendMessage(ctx.chatId, validation.reason || '⚠️ Cannot skick this user.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const { actor, target } = validation;
    if (!actor || !target) return;

    // Delete command message and replied message (silent)
    const replyMsgId = ctx.message.reply_to_message?.message_id;
    const toDelete = [ctx.message.message_id];
    if (replyMsgId) toDelete.push(replyMsgId);

    await Promise.allSettled(toDelete.map((id) => telegramApi.deleteMessage(ctx.chatId, id)));
    db.untrackMessages(ctx.chatId, toDelete);

    const reason = ctx.args.slice(target.source === 'numeric_id' || target.source === 'username' ? 1 : 0).join(' ') || 'Silent kick';
    const res = await ModerationService.executeKick(ctx.chatId, target.targetUserId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'skick',
        action: 'skick',
        result: 'success',
        reason,
        details: 'Silent kick executed (messages deleted, no public notice)'
      });
    } else {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        target,
        command: 'skick',
        action: 'skick',
        result: 'error',
        telegramError: res.description
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

    const isOwner = botMember?.status === 'creator';
    const canDelete = isOwner || Boolean(botMember?.can_delete_messages);
    const canRestrict = isOwner || Boolean(botMember?.can_restrict_members);
    const canInvite = isOwner || Boolean(botMember?.can_invite_users);
    const canPin = isOwner || Boolean(botMember?.can_pin_messages);
    const canManageVideoChats = isOwner || Boolean(botMember?.can_manage_video_chats);
    const canManageTopics = isOwner || Boolean(botMember?.can_manage_topics);

    let res = await telegramApi.promoteChatMember(ctx.chatId, target.targetUserId, {
      is_anonymous: false,
      can_manage_chat: false,
      can_post_messages: false,
      can_edit_messages: false,
      can_delete_messages: canDelete,
      can_manage_video_chats: canManageVideoChats,
      can_restrict_members: canRestrict,
      can_promote_members: false,
      can_change_info: false,
      can_invite_users: canInvite,
      can_pin_messages: canPin,
      can_manage_topics: canManageTopics,
      can_post_stories: false,
      can_edit_stories: false,
      can_delete_stories: false
    });

    // If initial promote failed, retry with core essential permissions
    if (!res.ok) {
      const fallbackRes = await telegramApi.promoteChatMember(ctx.chatId, target.targetUserId, {
        can_delete_messages: canDelete,
        can_restrict_members: canRestrict,
        can_invite_users: canInvite
      });
      if (fallbackRes.ok) {
        res = fallbackRes;
      }
    }

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
    if (!query.data) {
      return false;
    }

    if (query.data.startsWith('abuse:clear:')) {
      await telegramApi.answerCallbackQuery(query.id);
      const parts = query.data.split(':');
      if (parts.length < 4) return true;
      const subAction = parts[2];
      const chatId = Number(parts[3]);

      if (query.message && query.message.chat.id !== chatId) {
        await telegramApi.answerCallbackQuery(query.id, { text: '❌ Invalid chat.', show_alert: true });
        return true;
      }

      const actorMember = await TelegramMiddleware.getTargetMember(chatId, query.from.id);
      const isOwner = actorMember?.status === 'creator';
      const isAdmin = actorMember?.status === 'administrator';
      if (!isOwner && !isAdmin) {
        await telegramApi.answerCallbackQuery(query.id, { text: '❌ Admins only.', show_alert: true });
        return true;
      }

      if (subAction === 'confirm') {
        db.clearCustomAbusiveWords(chatId);
        await telegramApi.editMessageText(chatId, query.message!.message_id, '✅ <b>All custom abusive words have been cleared.</b>', {});
      } else {
        await telegramApi.editMessageText(chatId, query.message!.message_id, '❌ Clear action cancelled.', {});
      }
      return true;
    }

    if (!query.data.startsWith('p:')) {
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
      await ModerationService.executeWarningThresholdAction(ctx.chatId, userObj, ctx.chatTitle, reason);
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
  // 7. CUSTOM WARNING THRESHOLD & ACTION
  // ==========================================
  private static async handleSetWarnLimit(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Warning Threshold Settings:</b>\n` +
        `• Threshold Limit: <b>${current.warnLimit}</b> warnings\n` +
        `• Threshold Action: <b>${(current.warnAction || 'ban').toUpperCase()}</b>\n\n` +
        `Usage: <code>/setwarnlimit &lt;limit&gt; [ban|mute|kick|warn_only]</code>\n` +
        `Example: <code>/setwarnlimit 3 mute</code>`
      );
      return;
    }

    const limit = parseInt(ctx.args[0], 10);
    if (isNaN(limit) || limit < 1 || limit > 20) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Please provide a valid limit between 1 and 20.');
      return;
    }

    const validActions = ['ban', 'mute', 'kick', 'warn_only'];
    const actionArg = (ctx.args[1] || '').toLowerCase();
    const action = validActions.includes(actionArg) ? (actionArg as 'ban' | 'mute' | 'kick' | 'warn_only') : (current.warnAction || 'ban');

    db.updateGroupSettings(ctx.chatId, { warnLimit: limit, warnAction: action });
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'setwarnlimit',
      action: 'setting_change',
      result: 'success',
      details: `Changed warn limit to ${limit} (Action: ${action})`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `⚙️ <b>Warning threshold updated:</b> <b>${limit}</b> warnings will trigger <b>${action.toUpperCase()}</b>.`
    );
  }

  // ==========================================
  // 8. LINK PROTECTION & WHITELIST SETTINGS
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
        `ℹ️ <b>Link Protection Status:</b> ${currentSettings.linksProtection ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `• Toggle: <code>/links on</code> or <code>/links off</code>\n` +
        `• Whitelist domain: <code>/linkallow &lt;domain&gt;</code>\n` +
        `• View whitelist: <code>/linkallowlist</code>`
      );
    }
  }

  private static async handleLinkAllow(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/linkallow &lt;domain.com&gt;</code>');
      return;
    }

    const domain = ctx.args[0].trim();
    const actor = await TelegramMiddleware.resolveActor(ctx);
    db.addLinkWhitelist(ctx.chatId, domain);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'linkallow',
      action: 'setting_change',
      result: 'success',
      details: `Added ${domain} to allowed link domains`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `✅ <b>Domain Whitelisted:</b> <code>${escapeHtml(domain)}</code> is now permitted in this group.`
    );
  }

  private static async handleLinkUnallow(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/linkunallow &lt;domain.com&gt;</code>');
      return;
    }

    const domain = ctx.args[0].trim();
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const removed = db.removeLinkWhitelist(ctx.chatId, domain);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'linkunallow',
      action: 'setting_change',
      result: 'success',
      details: `Removed ${domain} from allowed link domains`
    });

    if (removed) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🗑️ <b>Domain Removed:</b> <code>${escapeHtml(domain)}</code> was removed from the whitelist.`
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <code>${escapeHtml(domain)}</code> was not in the whitelist.`
      );
    }
  }

  private static async handleLinkAllowList(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const domains = db.getLinkWhitelist(ctx.chatId);
    if (domains.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        'ℹ️ <b>Allowed Link Domains:</b> None configured.\nAdd domains with <code>/linkallow &lt;domain&gt;</code>.'
      );
      return;
    }

    const list = domains.map((d, i) => `${i + 1}. <code>${escapeHtml(d)}</code>`).join('\n');
    await telegramApi.sendMessage(
      ctx.chatId,
      `🔗 <b>Whitelisted Link Domains (${domains.length}):</b>\n\n${list}\n\n` +
      `<i>Remove with <code>/linkunallow &lt;domain&gt;</code></i>`
    );
  }

  // ==========================================
  // 9. MEDIA & CONTENT FILTER SETTINGS
  // ==========================================
  private static async handlePhotosSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const currentSettings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { mediaProtection: true });
      db.setLock(ctx.chatId, 'photos', true);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'photos',
        action: 'setting_change',
        result: 'success',
        details: 'Photo protection enabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🛡️ <b>Photo & Image Protection is now ON.</b>\nPhotos from normal members will be automatically deleted unless freed with <code>/free</code>.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { mediaProtection: false });
      db.setLock(ctx.chatId, 'photos', false);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'photos',
        action: 'setting_change',
        result: 'success',
        details: 'Photo protection disabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        '🔓 <b>Photo & Image Protection is now OFF.</b>\nAll group members may send photos freely.',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Photo & Image Protection:</b> ${currentSettings.mediaProtection ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/photos on</code> or <code>/photos off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleGifsSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle).locks?.gifs || false;

    if (arg === 'on' || arg === 'lock') {
      db.setLock(ctx.chatId, 'gifs', true);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'gifs',
        action: 'setting_change',
        result: 'success',
        details: 'GIF protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>GIF Protection is now ON.</b>\nGIFs from regular members will be deleted.');
    } else if (arg === 'off' || arg === 'unlock') {
      db.setLock(ctx.chatId, 'gifs', false);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'gifs',
        action: 'setting_change',
        result: 'success',
        details: 'GIF protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>GIF Protection is now OFF.</b>\nMembers may send GIFs.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>GIF Protection:</b> ${current ? '🟢 ON (Locked)' : '🔴 OFF (Unlocked)'}\n\nUsage: <code>/gifs on</code> or <code>/gifs off</code>`
      );
    }
  }

  private static async handleVideosSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle).locks?.videos || false;

    if (arg === 'on' || arg === 'lock') {
      db.setLock(ctx.chatId, 'videos', true);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'videos',
        action: 'setting_change',
        result: 'success',
        details: 'Video protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Video Protection is now ON.</b>\nVideos and video notes from regular members will be deleted.');
    } else if (arg === 'off' || arg === 'unlock') {
      db.setLock(ctx.chatId, 'videos', false);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'videos',
        action: 'setting_change',
        result: 'success',
        details: 'Video protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Video Protection is now OFF.</b>\nMembers may send videos.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Video Protection:</b> ${current ? '🟢 ON (Locked)' : '🔴 OFF (Unlocked)'}\n\nUsage: <code>/videos on</code> or <code>/videos off</code>`
      );
    }
  }

  private static async handleVoiceSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle).locks?.voice || false;

    if (arg === 'on' || arg === 'lock') {
      db.setLock(ctx.chatId, 'voice', true);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'voice',
        action: 'setting_change',
        result: 'success',
        details: 'Voice note protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Voice Message Protection is now ON.</b>\nVoice messages from regular members will be deleted.');
    } else if (arg === 'off' || arg === 'unlock') {
      db.setLock(ctx.chatId, 'voice', false);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'voice',
        action: 'setting_change',
        result: 'success',
        details: 'Voice note protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Voice Message Protection is now OFF.</b>\nMembers may send voice messages.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Voice Protection:</b> ${current ? '🟢 ON (Locked)' : '🔴 OFF (Unlocked)'}\n\nUsage: <code>/voice on</code> or <code>/voice off</code>`
      );
    }
  }

  private static async handleAudioSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle).locks?.audio || false;

    if (arg === 'on' || arg === 'lock') {
      db.setLock(ctx.chatId, 'audio', true);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'audio',
        action: 'setting_change',
        result: 'success',
        details: 'Audio protection enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Audio File Protection is now ON.</b>\nAudio files from regular members will be deleted.');
    } else if (arg === 'off' || arg === 'unlock') {
      db.setLock(ctx.chatId, 'audio', false);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'audio',
        action: 'setting_change',
        result: 'success',
        details: 'Audio protection disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Audio File Protection is now OFF.</b>\nMembers may send audio files.');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Audio Protection:</b> ${current ? '🟢 ON (Locked)' : '🔴 OFF (Unlocked)'}\n\nUsage: <code>/audio on</code> or <code>/audio off</code>`
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
    } else if (arg === 'status') {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Sticker Protection Status:</b> ${currentSettings.stickerProtection ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/stickers on</code> or <code>/stickers off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      // If called as /stickers or /stickers [page], show group sticker pack summary
      await this.handleListStickers(ctx);
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

    if (ctx.args.length < 1) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Usage:</b>\n<code>/schedule &lt;time&gt; [message]</code> (or reply to a message/media to schedule it)\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/schedule 30m Check out our promo! https://example.com</code>\n` +
        `• <code>/schedule 2h</code> (replying to photo/video/sticker/media/text)\n` +
        `• <code>/schedule 1d Daily announcements...</code>`
      );
      return;
    }

    const intervalStr = ctx.args[0];
    let messageText = CommandHandler.getCommandText(ctx, 1);
    let contentType: 'text' | 'photo' | 'video' | 'document' | 'sticker' | 'animation' = 'text';
    let mediaFileId: string | undefined;

    const reply = ctx.message.reply_to_message;
    if (reply) {
      if (reply.photo && reply.photo.length > 0) {
        contentType = 'photo';
        const largest = reply.photo[reply.photo.length - 1];
        mediaFileId = largest.file_id;
        if (!messageText && reply.caption) {
          messageText = reply.caption;
        }
      } else if (reply.video) {
        contentType = 'video';
        mediaFileId = reply.video.file_id;
        if (!messageText && reply.caption) {
          messageText = reply.caption;
        }
      } else if (reply.document) {
        contentType = 'document';
        mediaFileId = reply.document.file_id;
        if (!messageText && reply.caption) {
          messageText = reply.caption;
        }
      } else if (reply.animation) {
        contentType = 'animation';
        mediaFileId = reply.animation.file_id;
        if (!messageText && reply.caption) {
          messageText = reply.caption;
        }
      } else if (reply.sticker) {
        contentType = 'sticker';
        mediaFileId = reply.sticker.file_id;
      } else if (reply.text) {
        if (!messageText) {
          messageText = reply.text;
        }
      }
    }

    const res = messageScheduler.createSchedule(
      ctx.chatId,
      ctx.chatTitle,
      ctx.sender.id,
      ctx.adminDisplayName,
      intervalStr,
      messageText,
      contentType,
      mediaFileId
    );

    if (res.success && res.schedule) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `📅 <b>Message Scheduled Successfully!</b>\n\n` +
        `<b>Schedule ID:</b> <code>${res.schedule.id}</code>\n` +
        `<b>Type:</b> ${res.schedule.contentType || 'text'}\n` +
        `<b>Frequency:</b> Every ${res.schedule.intervalFormatted}\n` +
        `<b>Next Run:</b> ${new Date(res.schedule.nextRun).toLocaleTimeString()}\n\n` +
        `<i>Use <code>/listschedules</code> to view all or <code>/deleteschedule ${res.schedule.id}</code> to remove.</i>`
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
  // 13. BOT SEND MESSAGE (/say, /all) & PHASE 9A CONTENT CONTROLS
  // ==========================================
  private static async handleAll(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '❌ You don\'t have permission to use /all.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    if (ctx.args[0]?.toLowerCase() === 'status') {
      const members = db.getGroupMembersList(ctx.chatId);
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>/all Command Status</b>\n\n` +
        `Cached Members: ${members.length}\n` +
        `Usage: <code>/all [custom message text]</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const customText = CommandHandler.getCommandText(ctx, 0);
    const defaultMsg = customText || 'Hiee';
    const members = db.getGroupMembersList(ctx.chatId);

    const validMembers = members.filter(m => {
      const uname = (m.username || '').toLowerCase();
      if (uname.includes('bot') || uname.endsWith('bot') || (m as any).is_bot) return false;
      return true;
    });

    if (validMembers.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '⚠️ I don\'t have enough cached group members to mention everyone yet.',
        { reply_to_message_id: ctx.message.message_id }
      );

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'all',
        action: 'warn',
        result: 'success',
        details: 'Tried /all but no cached members available'
      });
      return;
    }

    const header = `${defaultMsg}\n\n`;
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = header.length;

    for (const m of validMembers) {
      const displayName = m.firstName || m.username || `User ${m.userId}`;
      const mention = `<a href="tg://user?id=${m.userId}">${escapeHtml(displayName)}</a>`;
      if (currentLength + mention.length + 2 > 3800) {
        chunks.push(header + currentChunk.join(' '));
        currentChunk = [mention];
        currentLength = header.length + mention.length;
      } else {
        currentChunk.push(mention);
        currentLength += mention.length + 1;
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(header + currentChunk.join(' '));
    }

    for (let i = 0; i < chunks.length; i++) {
      await telegramApi.sendMessage(ctx.chatId, chunks[i], {
        reply_to_message_id: i === 0 && ctx.message.reply_to_message?.message_id ? ctx.message.reply_to_message.message_id : undefined,
        parse_mode: 'HTML'
      });
    }

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'all',
      action: 'warn',
      result: 'success',
      details: `Mentioned ${validMembers.length} members across ${chunks.length} message(s)`
    });
  }

  private static async handleSay(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '❌ This command is available only to moderators and administrators.',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const messageText = CommandHandler.getCommandText(ctx, 0);
    if (!messageText) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/say &lt;message text&gt;</code>', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const targetMessageId = ctx.message.reply_to_message?.message_id;

    const sendOptions: any = {};
    if (targetMessageId) {
      sendOptions.reply_to_message_id = targetMessageId;
    }

    const res = await telegramApi.sendMessage(ctx.chatId, messageText, sendOptions);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'say',
      action: 'say',
      result: res.ok ? 'success' : 'error',
      details: targetMessageId 
        ? `Broadcast message: "${messageText.slice(0, 40)}..." responding to msg #${targetMessageId}`
        : `Broadcast message: "${messageText.slice(0, 40)}..." (normal mode)`
    });
  }

  private static async handleStopSpam(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { stopSpamEnabled: true });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stopspam', action: 'setting_change', result: 'success', details: 'Smart spam protection enabled' });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Smart Spam Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { stopSpamEnabled: false });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stopspam', action: 'setting_change', result: 'success', details: 'Smart spam protection disabled' });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Smart Spam Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Smart Spam Protection:</b> ${settings.stopSpamEnabled ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/stopspam on</code> or <code>/stopspam off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleStopAbusive(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { stopAbusiveEnabled: true });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stopabusive', action: 'setting_change', result: 'success', details: 'Abusive language protection enabled' });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Abusive Language Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { stopAbusiveEnabled: false });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stopabusive', action: 'setting_change', result: 'success', details: 'Abusive language protection disabled' });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Abusive Language Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      const customCount = db.getCustomAbusiveWords(ctx.chatId).length;
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Abusive Language Protection:</b> ${settings.stopAbusiveEnabled ? '🟢 ON' : '🔴 OFF'}\nCustom Words: ${customCount}\n\nUsage: <code>/stopabusive on</code> or <code>/stopabusive off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleAddAbusive(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const word = ctx.args.join(' ').trim();
    if (!word) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/addabuse &lt;word/phrase&gt;</code>', { reply_to_message_id: ctx.message.message_id });
      return;
    }
    db.addCustomAbusiveWord(ctx.chatId, word);
    await telegramApi.sendMessage(ctx.chatId, `✅ Added <b>"${word}"</b> to this group's abusive-word list.`, { reply_to_message_id: ctx.message.message_id });
  }

  private static async handleRemoveAbusive(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const word = ctx.args.join(' ').trim();
    if (!word) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/removeabuse &lt;word/phrase&gt;</code>', { reply_to_message_id: ctx.message.message_id });
      return;
    }
    const removed = db.removeCustomAbusiveWord(ctx.chatId, word);
    if (removed) {
      await telegramApi.sendMessage(ctx.chatId, `✅ Removed <b>"${word}"</b> from abusive-word list.`, { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `❌ Word <b>"${word}"</b> not found in custom abusive list.`, { reply_to_message_id: ctx.message.message_id });
    }
  }

  private static async handleListAbusive(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    const words = db.getCustomAbusiveWords(ctx.chatId);
    if (words.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, 'ℹ️ No custom abusive words configured for this group.', { reply_to_message_id: ctx.message.message_id });
      return;
    }
    const list = words.map((w, idx) => `${idx + 1}. <code>${w}</code>`).join('\n');
    await telegramApi.sendMessage(ctx.chatId, `🛡️ <b>Custom Abusive Words (${words.length}):</b>\n\n${list}`, { reply_to_message_id: ctx.message.message_id });
  }

  private static async handleClearAbusive(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const words = db.getCustomAbusiveWords(ctx.chatId);
    if (words.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, 'ℹ️ Custom abusive word list is already empty.', { reply_to_message_id: ctx.message.message_id });
      return;
    }

    await telegramApi.sendMessage(ctx.chatId, `⚠️ <b>This will remove all ${words.length} custom abusive words.</b> Are you sure?`, {
      reply_to_message_id: ctx.message.message_id,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Confirm Clear', callback_data: `abuse:clear:confirm:${ctx.chatId}` },
            { text: '❌ Cancel', callback_data: `abuse:clear:cancel:${ctx.chatId}` }
          ]
        ]
      }
    });
  }

  private static async handleStopPromotion(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { stopPromotionEnabled: true });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stoppromotion', action: 'setting_change', result: 'success', details: 'Promotion protection enabled' });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Promotion & Ad Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { stopPromotionEnabled: false });
      TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'stoppromotion', action: 'setting_change', result: 'success', details: 'Promotion protection disabled' });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Promotion & Ad Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ <b>Promotion Protection:</b> ${settings.stopPromotionEnabled ? '🟢 ON' : '🔴 OFF'}\n\nUsage: <code>/stoppromotion on</code> or <code>/stoppromotion off</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleGifSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { gifProtection: true });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>GIF Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { gifProtection: false });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>GIF Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ <b>GIF Protection:</b> ${settings.gifProtection ? '🟢 ON' : '🔴 OFF'}\nUsage: <code>/gif on</code> or <code>/gif off</code>`, { reply_to_message_id: ctx.message.message_id });
    }
  }

  private static async handleLinkSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { linkProtection: true });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Link Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { linkProtection: false });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Link Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ <b>Link Protection:</b> ${settings.linkProtection !== false ? '🟢 ON' : '🔴 OFF'}\nUsage: <code>/link on</code> or <code>/link off</code>`, { reply_to_message_id: ctx.message.message_id });
    }
  }

  private static async handleImageSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { imageProtection: true });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Image Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { imageProtection: false });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Image Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ <b>Image Protection:</b> ${settings.imageProtection ? '🟢 ON' : '🔴 OFF'}\nUsage: <code>/image on</code> or <code>/image off</code>`, { reply_to_message_id: ctx.message.message_id });
    }
  }

  private static async handleFileSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { fileProtection: true });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>File Protection is now ON.</b>', { reply_to_message_id: ctx.message.message_id });
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { fileProtection: false });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>File Protection is now OFF.</b>', { reply_to_message_id: ctx.message.message_id });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ <b>File Protection:</b> ${settings.fileProtection ? '🟢 ON' : '🔴 OFF'}\nUsage: <code>/file on</code> or <code>/file off</code>`, { reply_to_message_id: ctx.message.message_id });
    }
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

  // ==========================================
  // 11. CONTENT LOCKS & GRANULAR PERMISSIONS
  // ==========================================
  private static async handleLock(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const lockType = (ctx.args[0] || '').toLowerCase();
    const validTypes = ['links', 'stickers', 'gifs', 'videos', 'photos', 'audio', 'voice', 'documents', 'polls', 'forwards', 'contacts', 'locations'];

    if (!lockType || !validTypes.includes(lockType)) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Invalid lock type.</b>\n\n` +
        `<b>Available lock types:</b>\n<code>${validTypes.join(', ')}</code>\n\n` +
        `Usage: <code>/lock &lt;type&gt;</code> (e.g. <code>/lock stickers</code>)`
      );
      return;
    }

    const actor = await TelegramMiddleware.resolveActor(ctx);
    db.setLock(ctx.chatId, lockType, true);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'lock',
      action: 'setting_change',
      result: 'success',
      details: `Locked ${lockType}`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `🔒 <b>Locked:</b> <code>${lockType}</code> is now restricted for regular members.`
    );
  }

  private static async handleUnlock(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const lockType = (ctx.args[0] || '').toLowerCase();
    const validTypes = ['links', 'stickers', 'gifs', 'videos', 'photos', 'audio', 'voice', 'documents', 'polls', 'forwards', 'contacts', 'locations'];

    if (!lockType || !validTypes.includes(lockType)) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Invalid lock type.</b>\n\n` +
        `<b>Available lock types:</b>\n<code>${validTypes.join(', ')}</code>\n\n` +
        `Usage: <code>/unlock &lt;type&gt;</code>`
      );
      return;
    }

    const actor = await TelegramMiddleware.resolveActor(ctx);
    db.setLock(ctx.chatId, lockType, false);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'unlock',
      action: 'setting_change',
      result: 'success',
      details: `Unlocked ${lockType}`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `🔓 <b>Unlocked:</b> <code>${lockType}</code> is now permitted for all members.`
    );
  }

  private static async handleLocks(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const locks = db.getLocks(ctx.chatId);
    const validTypes = ['links', 'stickers', 'gifs', 'videos', 'photos', 'audio', 'voice', 'documents', 'polls', 'forwards', 'contacts', 'locations'];

    const items = validTypes.map((type) => {
      const isLocked = Boolean(locks[type]);
      return `• <code>${type}</code>: ${isLocked ? '🔒 Locked' : '🔓 Unlocked'}`;
    }).join('\n');

    await telegramApi.sendMessage(
      ctx.chatId,
      `🔐 <b>Group Content Locks:</b>\n\n${items}\n\n` +
      `<i>Lock with <code>/lock &lt;type&gt;</code>, unlock with <code>/unlock &lt;type&gt;</code></i>`
    );
  }

  // ==========================================
  // 12. ANTI-FLOOD SYSTEM
  // ==========================================
  private static async handleFloodSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const current = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🌊 <b>Anti-Flood Settings:</b>\n` +
        `• Status: <b>${current.floodEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
        `• Threshold: <b>${current.floodCount || 8}</b> messages in <b>${current.floodWindow || 5}s</b>\n` +
        `• Action: <b>${(current.floodAction || 'mute').toUpperCase()}</b>\n\n` +
        `Usage:\n` +
        `• <code>/flood on</code> / <code>/flood off</code>\n` +
        `• <code>/flood &lt;messages&gt; [mute|ban|kick]</code> (e.g. <code>/flood 5 mute</code>)`
      );
      return;
    }

    const arg0 = ctx.args[0].toLowerCase();
    if (arg0 === 'on') {
      db.updateGroupSettings(ctx.chatId, { floodEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'flood',
        action: 'setting_change',
        result: 'success',
        details: 'Flood control enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🛡️ <b>Anti-Flood Protection is now ON.</b>');
      return;
    }

    if (arg0 === 'off') {
      db.updateGroupSettings(ctx.chatId, { floodEnabled: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'flood',
        action: 'setting_change',
        result: 'success',
        details: 'Flood control disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🔓 <b>Anti-Flood Protection is now OFF.</b>');
      return;
    }

    const count = parseInt(arg0, 10);
    if (!isNaN(count) && count >= 2 && count <= 30) {
      const validActions = ['mute', 'ban', 'kick'];
      const actionArg = (ctx.args[1] || '').toLowerCase();
      const action = validActions.includes(actionArg) ? (actionArg as 'mute' | 'ban' | 'kick') : (current.floodAction || 'mute');

      db.updateGroupSettings(ctx.chatId, {
        floodEnabled: true,
        floodCount: count,
        floodAction: action
      });

      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'flood',
        action: 'setting_change',
        result: 'success',
        details: `Flood set to ${count} msgs (Action: ${action})`
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `⚙️ <b>Anti-Flood Updated:</b> Trigger threshold set to <b>${count}</b> messages in 5s (Action: <b>${action.toUpperCase()}</b>).`
      );
      return;
    }

    await telegramApi.sendMessage(ctx.chatId, '⚠️ Please provide a valid message count between 2 and 30.');
  }

  // ==========================================
  // 13. CUSTOM TEXT & MEDIA FILTERS
  // ==========================================
  private static async handleFilterCommand(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length < 2) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Usage:</b> <code>/filter &lt;keyword&gt; &lt;reply text&gt;</code>\n` +
        `Example: <code>/filter rules Read the pinned message for group rules!</code>`
      );
      return;
    }

    const keyword = ctx.args[0];
    const replyText = CommandHandler.getCommandText(ctx, 1);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    db.setFilter(ctx.chatId, keyword, replyText);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'filter',
      action: 'setting_change',
      result: 'success',
      details: `Added filter for "${keyword}"`
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `✅ <b>Filter Saved:</b> Whenever someone mentions <code>${escapeHtml(keyword)}</code>, I will respond with your reply message.`
    );
  }

  private static async handleUnfilterCommand(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: <code>/unfilter &lt;keyword&gt;</code>');
      return;
    }

    const keyword = ctx.args[0];
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const removed = db.removeFilter(ctx.chatId, keyword);

    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'unfilter',
      action: 'setting_change',
      result: 'success',
      details: `Removed filter for "${keyword}"`
    });

    if (removed) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🗑️ <b>Filter Removed:</b> <code>${escapeHtml(keyword)}</code> has been deleted.`
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `ℹ️ No filter found for <code>${escapeHtml(keyword)}</code>.`
      );
    }
  }

  private static async handleFiltersList(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const filters = db.getFilters(ctx.chatId);
    const entries = Object.entries(filters);
    if (entries.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        'ℹ️ <b>Active Filters:</b> None configured.\nAdd custom filters with <code>/filter &lt;keyword&gt; &lt;reply text&gt;</code>.'
      );
      return;
    }

    const list = entries.map(([kw], i) => `${i + 1}. <code>${escapeHtml(kw)}</code>`).join('\n');
    await telegramApi.sendMessage(
      ctx.chatId,
      `📋 <b>Active Filters (${entries.length}):</b>\n\n${list}\n\n` +
      `<i>Delete a filter with <code>/unfilter &lt;keyword&gt;</code></i>`
    );
  }

  // ==========================================
  // 14. WELCOME & GOODBYE GREETINGS
  // ==========================================
  private static async handleWelcomeSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { welcomeEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'welcome',
        action: 'setting_change',
        result: 'success',
        details: 'Welcome messages enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '👋 <b>Welcome messages are now ON.</b>');
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { welcomeEnabled: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'welcome',
        action: 'setting_change',
        result: 'success',
        details: 'Welcome messages disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '👋 <b>Welcome messages are now OFF.</b>');
    } else if (ctx.args.length > 0 && arg !== 'status') {
      // Direct welcome template configuration via /welcome <message text>
      const text = CommandHandler.getCommandText(ctx, 0);
      db.updateGroupSettings(ctx.chatId, { welcomeMessage: text, welcomeEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'welcome',
        action: 'setting_change',
        result: 'success',
        details: 'Updated welcome template via /welcome'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `✅ <b>Welcome Message Updated & Activated:</b>\n\n${escapeHtml(text)}`
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `👋 <b>Welcome Message Status:</b> ${settings.welcomeEnabled ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `<b>Current Template:</b>\n<i>${escapeHtml(settings.welcomeMessage || 'Default greeting')}</i>\n\n` +
        `Usage:\n` +
        `• <code>/welcome on</code> / <code>/welcome off</code>\n` +
        `• <code>/welcome &lt;text&gt;</code> or <code>/setwelcome &lt;text&gt;</code>\n` +
        `<i>Tags: {name}, {first_name}, {username}, {chat_title}, {mention}, {id}</i>`
      );
    }
  }

  private static async handleSetWelcome(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Usage:</b> <code>/setwelcome &lt;welcome message&gt;</code>\n\n` +
        `<b>Available Tags:</b>\n` +
        `• <code>{first_name}</code> — User's first name\n` +
        `• <code>{username}</code> — User's @username\n` +
        `• <code>{mention}</code> — Clickable user mention\n` +
        `• <code>{chat_title}</code> — Group name\n` +
        `• <code>{id}</code> — User ID`
      );
      return;
    }

    const text = CommandHandler.getCommandText(ctx, 0);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    db.updateGroupSettings(ctx.chatId, { welcomeMessage: text, welcomeEnabled: true });
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'setwelcome',
      action: 'setting_change',
      result: 'success',
      details: 'Updated welcome template'
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `✅ <b>Welcome Message Updated & Activated:</b>\n\n${escapeHtml(text)}`
    );
  }

  private static async handleGoodbyeSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { goodbyeEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'goodbye',
        action: 'setting_change',
        result: 'success',
        details: 'Goodbye messages enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '👋 <b>Goodbye messages are now ON.</b>');
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { goodbyeEnabled: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'goodbye',
        action: 'setting_change',
        result: 'success',
        details: 'Goodbye messages disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '👋 <b>Goodbye messages are now OFF.</b>');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `👋 <b>Goodbye Message Status:</b> ${settings.goodbyeEnabled ? '🟢 ON' : '🔴 OFF'}\n\n` +
        `<b>Current Template:</b>\n<i>${escapeHtml(settings.goodbyeMessage || 'Default goodbye')}</i>\n\n` +
        `Usage:\n` +
        `• <code>/goodbye on</code> / <code>/goodbye off</code>\n` +
        `• <code>/setgoodbye &lt;text&gt;</code>`
      );
    }
  }

  private static async handleSetGoodbye(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Usage:</b> <code>/setgoodbye &lt;goodbye message&gt;</code>\n\n` +
        `<b>Available Tags:</b>\n` +
        `• <code>{first_name}</code> — User's first name\n` +
        `• <code>{username}</code> — User's @username\n` +
        `• <code>{chat_title}</code> — Group name`
      );
      return;
    }

    const text = CommandHandler.getCommandText(ctx, 0);
    const actor = await TelegramMiddleware.resolveActor(ctx);

    db.updateGroupSettings(ctx.chatId, { goodbyeMessage: text, goodbyeEnabled: true });
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'setgoodbye',
      action: 'setting_change',
      result: 'success',
      details: 'Updated goodbye template'
    });

    await telegramApi.sendMessage(
      ctx.chatId,
      `✅ <b>Goodbye Message Updated & Activated:</b>\n\n${escapeHtml(text)}`
    );
  }

  private static async handleAutoDeleteJoinLeaveSetting(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const arg = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (arg === 'on') {
      db.updateGroupSettings(ctx.chatId, { autoDeleteJoinLeave: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'autodeljoin',
        action: 'setting_change',
        result: 'success',
        details: 'Auto-delete join/leave messages enabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🗑️ <b>Auto-delete join/leave messages is now ON.</b> (Messages deleted after 3-4 seconds)');
    } else if (arg === 'off') {
      db.updateGroupSettings(ctx.chatId, { autoDeleteJoinLeave: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'autodeljoin',
        action: 'setting_change',
        result: 'success',
        details: 'Auto-delete join/leave messages disabled'
      });
      await telegramApi.sendMessage(ctx.chatId, '🗑️ <b>Auto-delete join/leave messages is now OFF.</b>');
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🗑️ <b>Auto-Delete Join/Leave Status:</b> ${settings.autoDeleteJoinLeave ? '🟢 ON (3-4s)' : '🔴 OFF'}\n\n` +
        `Usage:\n` +
        `• <code>/autodeljoin on</code> / <code>/autodeljoin off</code>`
      );
    }
  }

  // ==========================================
  // 15. PIN & UNPIN MANAGEMENT
  // ==========================================
  private static async handlePin(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const replyMsg = ctx.message.reply_to_message;
    if (!replyMsg) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '⚠️ Please reply to the message you want to pin with <code>/pin</code> (or <code>/pin loud</code>).',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const isLoud = ctx.args.includes('loud') || ctx.args.includes('notify');
    const disableNotification = !isLoud;
    const actor = await TelegramMiddleware.resolveActor(ctx);

    const res = await telegramApi.pinChatMessage(ctx.chatId, replyMsg.message_id, disableNotification);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'pin',
        action: 'pin',
        result: 'success',
        details: `Pinned message #${replyMsg.message_id} (${disableNotification ? 'silent' : 'loud'})`
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        `📌 <b>Message pinned successfully.</b>${disableNotification ? ' <i>(Silent)</i>' : ''}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ Failed to pin message: ${res.description || 'Permission denied'}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleUnpin(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const replyMsg = ctx.message.reply_to_message;
    const messageId = replyMsg ? replyMsg.message_id : undefined;
    const actor = await TelegramMiddleware.resolveActor(ctx);

    const res = await telegramApi.unpinChatMessage(ctx.chatId, messageId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'unpin',
        action: 'unpin',
        result: 'success',
        details: messageId ? `Unpinned message #${messageId}` : 'Unpinned latest pinned message'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        '📌 <b>Message unpinned.</b>',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ Failed to unpin message: ${res.description || 'Permission denied'}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  private static async handleUnpinAll(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);
    const res = await telegramApi.unpinAllChatMessages(ctx.chatId);

    if (res.ok) {
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'unpinall',
        action: 'unpin',
        result: 'success',
        details: 'Unpinned all chat messages'
      });

      await telegramApi.sendMessage(
        ctx.chatId,
        '📌 <b>All pinned messages have been unpinned.</b>',
        { reply_to_message_id: ctx.message.message_id }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ Failed to unpin all messages: ${res.description || 'Permission denied'}`,
        { reply_to_message_id: ctx.message.message_id }
      );
    }
  }

  // ==========================================
  // 16. SLOW MODE
  // ==========================================
  private static async handleSlowMode(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const actor = await TelegramMiddleware.resolveActor(ctx);

    if (ctx.args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `🐢 <b>Slow Mode Usage:</b>\n` +
        `• <code>/slowmode 10s</code> — 10 seconds delay\n` +
        `• <code>/slowmode 30s</code> — 30 seconds delay\n` +
        `• <code>/slowmode 1m</code> — 1 minute delay\n` +
        `• <code>/slowmode 5m</code> — 5 minutes delay\n` +
        `• <code>/slowmode 15m</code> — 15 minutes delay\n` +
        `• <code>/slowmode 1h</code> — 1 hour delay\n` +
        `• <code>/slowmode off</code> / <code>0</code> — Disable slow mode\n\n` +
        `<i>Allowed Telegram values: 0, 10s, 30s, 1m, 5m, 15m, 1h.</i>`
      );
      return;
    }

    const arg = ctx.args[0].toLowerCase();
    let seconds = 0;

    if (arg === 'off' || arg === '0' || arg === '0s') {
      seconds = 0;
    } else if (arg === '10s' || arg === '10') {
      seconds = 10;
    } else if (arg === '30s' || arg === '30') {
      seconds = 30;
    } else if (arg === '1m' || arg === '60' || arg === '60s') {
      seconds = 60;
    } else if (arg === '5m' || arg === '300' || arg === '300s') {
      seconds = 300;
    } else if (arg === '15m' || arg === '900' || arg === '900s') {
      seconds = 900;
    } else if (arg === '1h' || arg === '3600' || arg === '3600s') {
      seconds = 3600;
    } else {
      const parsedNum = parseInt(arg, 10);
      const validDelays = [0, 10, 30, 60, 300, 900, 3600];
      if (validDelays.includes(parsedNum)) {
        seconds = parsedNum;
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          '⚠️ Invalid slow mode interval. Supported values: <code>0 (off), 10s, 30s, 1m, 5m, 15m, 1h</code>.'
        );
        return;
      }
    }

    const res = await telegramApi.setChatSlowModeDelay(ctx.chatId, seconds);

    if (res.ok) {
      db.updateGroupSettings(ctx.chatId, { slowModeSeconds: seconds });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'slowmode',
        action: 'setting_change',
        result: 'success',
        details: seconds === 0 ? 'Slow mode disabled' : `Slow mode set to ${seconds}s`
      });

      if (seconds === 0) {
        await telegramApi.sendMessage(ctx.chatId, '⚡ <b>Slow Mode disabled.</b> Members can send messages without delay.');
      } else {
        await telegramApi.sendMessage(ctx.chatId, `🐢 <b>Slow Mode activated:</b> Members must wait <b>${seconds}s</b> between messages.`);
      }
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ Failed to set slow mode: ${res.description || 'Permission denied'}`
      );
    }
  }

  // ==========================================
  // 17. AUDIT LOGS & SETTINGS DASHBOARD
  // ==========================================
  private static async handleAdminLog(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;
    if (!(await TelegramMiddleware.requireAdmin(ctx))) return;

    const count = parseInt(ctx.args[0] || '8', 10);
    const limit = Math.min(Math.max(count, 1), 25);
    const logs = db.getGroupLogs(ctx.chatId, limit);

    if (logs.length === 0) {
      await telegramApi.sendMessage(ctx.chatId, 'ℹ️ No moderation audit logs recorded for this group yet.');
      return;
    }

    const logText = logs
      .map((l, i) => {
        const time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const targetStr = l.targetUsername ? ` ➔ @${l.targetUsername}` : (l.targetUserId ? ` ➔ User ${l.targetUserId}` : '');
        const actorStr = l.adminUsername || l.actorUsername || (l.actorId ? `User ${l.actorId}` : 'Admin');
        const statusIcon = l.result === 'success' ? '✅' : '❌';
        return `${i + 1}. [${time}] ${statusIcon} <b>/${l.command || l.action}</b> by <i>${escapeHtml(actorStr)}</i>${targetStr}\n    ${escapeHtml(l.details || l.reason || '')}`;
      })
      .join('\n\n');

    await telegramApi.sendMessage(
      ctx.chatId,
      `📜 <b>Recent Moderation Audit Trail (${logs.length}):</b>\n\n${logText}`
    );
  }

  private static async handleSettings(ctx: CommandContext) {
    if (!(await TelegramMiddleware.requireGroup(ctx))) return;

    const sub = (ctx.args[0] || '').toLowerCase();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const isAdmin = actor.actorRank >= RoleRank.ADMIN;

    const isConfigChange = ctx.args.length > (sub ? 1 : 0);
    if (isConfigChange && !isAdmin) {
      await telegramApi.sendMessage(ctx.chatId, '❌ Command requires administrator privileges.');
      return;
    }

    if (sub === 'security') {
      const action = (ctx.args[1] || '').toLowerCase();
      if (action) {
        if (action === 'on' || action === 'off') {
          const val = action === 'on';
          settings.securityEnabled = val;
          settings.captchaEnabled = val;
          settings.raidEnabled = val;
          db.scheduleSave();
          TelegramMiddleware.logAudit({
            chatId: ctx.chatId,
            chatTitle: ctx.chatTitle,
            actor,
            command: 'settings',
            action: 'setting_change',
            result: 'success',
            reason: `Security center toggled ${action}`
          });
          await telegramApi.sendMessage(ctx.chatId, `🔒 <b>Security Center</b> is now <b>${val ? '🟢 ON' : '🔴 OFF'}</b>.`);
        } else {
          await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings security <on|off>');
        }
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `🔒 <b>Security Configuration</b>\n\n` +
          `• Security Center: <b>${settings.securityEnabled !== false ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• CAPTCHA Verification: <b>${settings.captchaEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• Anti-Raid Protection: <b>${settings.raidEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• Join Mode: <b>${settings.joinmode || 'normal'}</b>\n\n` +
          `<i>Usage: /settings security <on|off></i>`
        );
      }
      return;
    }

    if (sub === 'moderation') {
      const subOpt = (ctx.args[1] || '').toLowerCase();
      if (subOpt) {
        if (subOpt === 'warn_limit') {
          const limit = parseInt(ctx.args[2], 10);
          if (!isNaN(limit) && limit >= 1 && limit <= 10) {
            settings.warnLimit = limit;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Warn limit set to ${limit}` });
            await telegramApi.sendMessage(ctx.chatId, `⚠️ Warning limit updated to <b>${limit}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings moderation warn_limit <1-10>');
          }
        } else if (subOpt === 'warn_action') {
          const act = ctx.args[2]?.toLowerCase() as any;
          if (['ban', 'mute', 'kick', 'warn_only'].includes(act)) {
            settings.warnAction = act;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Warn action set to ${act}` });
            await telegramApi.sendMessage(ctx.chatId, `⚠️ Warning threshold default action updated to <b>${act.toUpperCase()}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings moderation warn_action <ban|mute|kick|warn_only>');
          }
        } else if (subOpt === 'mute_duration') {
          const secs = parseInt(ctx.args[2], 10);
          if (!isNaN(secs) && secs >= 10) {
            settings.warnExpireSeconds = secs;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Mute duration set to ${secs}s` });
            await telegramApi.sendMessage(ctx.chatId, `⏱️ Default mute / warning expire duration updated to <b>${secs}s</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings moderation mute_duration <seconds >= 10>');
          }
        } else {
          await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings moderation <warn_limit <num> | warn_action <ban|mute|kick|warn_only> | mute_duration <secs>>');
        }
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `⚠️ <b>Moderation Configuration</b>\n\n` +
          `• Warn Limit: <b>${settings.warnLimit || 3}</b> warnings ➔ <b>${(settings.warnAction || 'ban').toUpperCase()}</b>\n` +
          `• Mute / Expire Duration: <b>${settings.warnExpireSeconds || 300}s</b>\n` +
          `• Slow Mode: <b>${settings.slowModeSeconds ? settings.slowModeSeconds + 's' : 'OFF'}</b>\n\n` +
          `<i>Usage: /settings moderation warn_limit <num> | warn_action <ban|mute|kick|warn_only> | mute_duration <secs></i>`
        );
      }
      return;
    }

    if (sub === 'chatbot') {
      const action = (ctx.args[1] || '').toLowerCase();
      if (action) {
        if (action === 'on' || action === 'off') {
          const val = action === 'on';
          settings.chatbotEnabled = val;
          db.scheduleSave();
          TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Chatbot toggled ${action}` });
          await telegramApi.sendMessage(ctx.chatId, `🤖 <b>Roxie AI Chatbot</b> is now <b>${val ? '🟢 ON' : '🔴 OFF'}</b>.`);
        } else if (action === 'mode') {
          const modeArg = (ctx.args[2] || '').toLowerCase() as any;
          if (['normal', 'friendly', 'auto'].includes(modeArg)) {
            settings.chatbotMode = modeArg;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Chatbot mode set to ${modeArg}` });
            await telegramApi.sendMessage(ctx.chatId, `🤖 Chatbot mode updated to <b>${modeArg}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings chatbot mode <normal|friendly|auto>');
          }
        } else {
          await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings chatbot <on|off|mode <normal|friendly|auto>>');
        }
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `🤖 <b>AI Chatbot Configuration</b>\n\n` +
          `• Status: <b>${settings.chatbotEnabled !== false ? '🟢 ENABLED' : '🔴 DISABLED'}</b>\n` +
          `• Behavior Mode: <b>${settings.chatbotMode || 'auto'}</b>\n\n` +
          `<i>Usage: /settings chatbot on | off | mode <normal|friendly|auto></i>`
        );
      }
      return;
    }

    if (sub === 'welcome') {
      const action = (ctx.args[1] || '').toLowerCase();
      if (action) {
        if (action === 'on' || action === 'off') {
          const val = action === 'on';
          settings.welcomeEnabled = val;
          settings.goodbyeEnabled = val;
          db.scheduleSave();
          TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Welcome/Goodbye toggled ${action}` });
          await telegramApi.sendMessage(ctx.chatId, `👋 <b>Welcome & Goodbye Messages</b> are now <b>${val ? '🟢 ON' : '🔴 OFF'}</b>.`);
        } else if (action === 'autodelete' || action === 'auto-delete') {
          const delAct = (ctx.args[2] || '').toLowerCase();
          if (delAct === 'on' || delAct === 'off') {
            const val = delAct === 'on';
            settings.autoDeleteJoinLeave = val;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Auto-delete join/leave toggled ${delAct}` });
            await telegramApi.sendMessage(ctx.chatId, `🗑️ <b>Auto-Delete Join/Leave System Messages</b> is now <b>${val ? '🟢 ON' : '🔴 OFF'}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings welcome autodelete <on|off>');
          }
        } else {
          await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings welcome <on|off|autodelete <on|off>>');
        }
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `👋 <b>Welcome & Automation Configuration</b>\n\n` +
          `• Welcome Message: <b>${settings.welcomeEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• Goodbye Message: <b>${settings.goodbyeEnabled ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• Auto-Delete Join/Leave: <b>${settings.autoDeleteJoinLeave ? '🟢 ON' : '🔴 OFF'}</b>\n\n` +
          `<i>Usage: /settings welcome on | off | autodelete <on|off></i>`
        );
      }
      return;
    }

    if (sub === 'protection') {
      const action = (ctx.args[1] || '').toLowerCase();
      if (action) {
        if (action === 'on' || action === 'off') {
          const val = action === 'on';
          settings.protectionEnabled = val;
          db.scheduleSave();
          TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Smart protection toggled ${action}` });
          await telegramApi.sendMessage(ctx.chatId, `🛡️ <b>Smart User Protection</b> is now <b>${val ? '🟢 ON' : '🔴 OFF'}</b>.`);
        } else if (action === 'flood') {
          const count = parseInt(ctx.args[2], 10);
          const windowSec = parseInt(ctx.args[3], 10);
          if (!isNaN(count) && count >= 1 && !isNaN(windowSec) && windowSec >= 1) {
            settings.protectionFloodCount = count;
            settings.protectionFloodWindow = windowSec;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Flood threshold set to ${count} msgs in ${windowSec}s` });
            await telegramApi.sendMessage(ctx.chatId, `🛡️ Flood threshold updated: <b>${count}</b> messages in <b>${windowSec}s</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings protection flood <count> <window_seconds>');
          }
        } else if (action === 'duplicate' || action === 'dup') {
          const limit = parseInt(ctx.args[2], 10);
          if (!isNaN(limit) && limit >= 2) {
            settings.protectionDuplicateLimit = limit;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Duplicate message limit set to ${limit}` });
            await telegramApi.sendMessage(ctx.chatId, `🛡️ Duplicate message limit updated to <b>${limit}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings protection duplicate <limit >= 2>');
          }
        } else if (action === 'link' || action === 'spam') {
          const limit = parseInt(ctx.args[2], 10);
          if (!isNaN(limit) && limit >= 1) {
            settings.protectionLinkBurstLimit = limit;
            db.scheduleSave();
            TelegramMiddleware.logAudit({ chatId: ctx.chatId, chatTitle: ctx.chatTitle, actor, command: 'settings', action: 'setting_change', result: 'success', reason: `Link burst limit set to ${limit}` });
            await telegramApi.sendMessage(ctx.chatId, `🛡️ Link burst limit updated to <b>${limit}</b>.`);
          } else {
            await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings protection link <limit >= 1>');
          }
        } else {
          await telegramApi.sendMessage(ctx.chatId, 'Usage: /settings protection <on|off|flood <count> <window>|duplicate <limit>|link <limit>>');
        }
      } else {
        await telegramApi.sendMessage(
          ctx.chatId,
          `🛡️ <b>Smart User Protection Configuration</b>\n\n` +
          `• Status: <b>${settings.protectionEnabled !== false ? '🟢 ON' : '🔴 OFF'}</b>\n` +
          `• Flood Threshold: <b>${settings.protectionFloodCount || 5}</b> msgs in <b>${settings.protectionFloodWindow || 5}s</b>\n` +
          `• Duplicate Limit: <b>${settings.protectionDuplicateLimit || 3}</b> identical msgs\n` +
          `• Link Burst Limit: <b>${settings.protectionLinkBurstLimit || 3}</b> links in 15s\n\n` +
          `<i>Usage: /settings protection on | off | flood <count> <window> | duplicate <limit> | link <limit></i>`
        );
      }
      return;
    }

    const filters = Object.keys(db.getFilters(ctx.chatId)).length;
    const allowedDomains = db.getLinkWhitelist(ctx.chatId).length;
    const freedUsers = db.getFreedUsers(ctx.chatId).length;
    const activeLocks = Object.entries(settings.locks || {}).filter(([_, v]) => v).map(([k]) => k);

    const text =
      `⚙️ <b>Centralized Group Configuration: ${escapeHtml(ctx.chatTitle || 'Group')}</b>\n\n` +
      `🔒 <b>Security:</b> <b>${settings.securityEnabled !== false ? 'ON' : 'OFF'}</b> (<code>/settings security</code>)\n` +
      `🛡️ <b>Protection:</b> <b>${settings.protectionEnabled !== false ? 'ON' : 'OFF'}</b> (<code>/settings protection</code>)\n` +
      `🤖 <b>AI Chatbot:</b> <b>${settings.chatbotEnabled !== false ? 'ON' : 'OFF'}</b> (<code>/settings chatbot</code>)\n` +
      `👋 <b>Welcome & Automation:</b> <b>${settings.welcomeEnabled ? 'ON' : 'OFF'}</b> (<code>/settings welcome</code>)\n` +
      `⚠️ <b>Moderation:</b> <b>${settings.warnLimit} warns = ${(settings.warnAction || 'ban').toUpperCase()}</b> (<code>/settings moderation</code>)\n\n` +
      `• Links Whitelist: ${allowedDomains} domains\n` +
      `• Media Exemptions: ${freedUsers} users\n` +
      `• Active Locks: ${activeLocks.length > 0 ? activeLocks.join(', ') : 'None'}\n\n` +
      `<i>Tip: Use subcommands to view or modify settings:</i>\n` +
      `• <code>/settings security [on|off]</code>\n` +
      `• <code>/settings moderation [warn_limit|warn_action|mute_duration]</code>\n` +
      `• <code>/settings chatbot [on|off|mode]</code>\n` +
      `• <code>/settings welcome [on|off|autodelete]</code>\n` +
      `• <code>/settings protection [on|off|flood|duplicate|link]</code>`;

    await telegramApi.sendMessage(ctx.chatId, text);
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
        `• Photo Protection: <b>${settings.mediaProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Sticker Protection: <b>${settings.stickerProtection ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Anti-Flood: <b>${settings.floodEnabled ? 'ON 🛡️' : 'OFF 🔓'}</b>\n` +
        `• Warn Limit: <b>${settings.warnLimit} warns = ${(settings.warnAction || 'ban').toUpperCase()}</b>\n` +
        `• Active Schedules: <b>${schedules}</b>\n`;
    }

    await telegramApi.sendMessage(ctx.chatId, text);
  }

  private static async handleHelp(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    const isAdmin = actor.actorRank >= RoleRank.ADMIN;

    const query = ctx.args[0]?.toLowerCase()?.trim()?.replace(/^\//, '');

    if (query) {
      const foundCmd = getCatalogItem(query);
      if (foundCmd) {
        if (foundCmd.permission !== 'Everyone' && !isAdmin) {
          await telegramApi.sendMessage(ctx.chatId, `❌ Command <code>${escapeHtml(foundCmd.command)}</code> requires administrator privileges.`);
          return;
        }
        let text = `📖 <b>Command Help: ${escapeHtml(foundCmd.command)}</b>\n\n` +
          `• <b>Category:</b> ${escapeHtml(foundCmd.category)}\n` +
          `• <b>Description:</b> ${escapeHtml(foundCmd.description)}\n` +
          `• <b>Syntax:</b> <code>${escapeHtml(foundCmd.syntax)}</code>\n` +
          `• <b>Example:</b> <code>${escapeHtml(foundCmd.example)}</code>\n` +
          `• <b>Permission:</b> ${escapeHtml(foundCmd.permission)}`;

        if (foundCmd.aliases && foundCmd.aliases.length > 0) {
          text += `\n• <b>Aliases:</b> <code>${foundCmd.aliases.map(a => escapeHtml(a)).join(', ')}</code>`;
        }
        if (foundCmd.scopes && foundCmd.scopes.length > 0) {
          text += `\n• <b>Available In:</b> ${foundCmd.scopes.map(s => s === 'group' ? 'Groups' : s === 'private' ? 'Direct Messages' : 'Admin Only').join(', ')}`;
        }

        if (foundCmd.command === '/schedule') {
          text += `\n\n📅 <b>SCHEDULE</b>\n\n` +
            `<b>Schedule text:</b>\n` +
            `<code>/schedule 10m Your reminder</code>\n\n` +
            `<b>Schedule multiline text:</b>\n` +
            `<code>/schedule 1h\nLine 1\nLine 2\nLine 3</code>\n\n` +
            `<b>Schedule media:</b>\n` +
            `Reply to a supported photo/video/sticker/file/GIF and use the schedule command:\n` +
            `<code>/schedule &lt;interval&gt; [caption]</code>\n\n` +
            `<b>Supported scheduled content:</b>\n` +
            `• Text\n` +
            `• Multiline text\n` +
            `• Links\n` +
            `• Photos\n` +
            `• Stickers\n` +
            `• Videos\n` +
            `• Files/Documents\n` +
            `• Animations/GIFs`;
        }
        await telegramApi.sendMessage(ctx.chatId, text);
        return;
      }

      const matchingCatItems = COMMAND_CATALOG.filter(c => 
        c.category.toLowerCase().replace(/\s+/g, '') === query.replace(/\s+/g, '') ||
        c.category.toLowerCase().includes(query)
      );
      if (matchingCatItems.length > 0) {
        const allowedItems = matchingCatItems.filter(item => isAdmin || item.permission === 'Everyone');
        if (allowedItems.length === 0) {
          await telegramApi.sendMessage(ctx.chatId, `❌ No accessible commands found in category matching "<b>${escapeHtml(query)}</b>".`);
          return;
        }
        const catName = allowedItems[0].category;
        let text = `📌 <b>Category: ${escapeHtml(catName)}</b>\n\n`;
        for (const item of allowedItems) {
          const aliasStr = item.aliases && item.aliases.length > 0 ? ` (alias: <code>${item.aliases.join(', ')}</code>)` : '';
          text += `• <code>${escapeHtml(item.command)}</code>${aliasStr} — ${escapeHtml(item.description)}\n  <i>Syntax:</i> <code>${escapeHtml(item.syntax)}</code>\n\n`;
        }
        await telegramApi.sendMessage(ctx.chatId, text);
        return;
      }

      await telegramApi.sendMessage(ctx.chatId, `❌ Command or category "<b>${escapeHtml(query)}</b>" not found. Use <code>/help</code> to view all commands.`);
      return;
    }

    const filteredCatalog = COMMAND_CATALOG.filter(item => {
      if (isAdmin) return true;
      return item.permission === 'Everyone';
    });

    const categoryOrder: CommandCategory[] = [
      'General',
      'Moderation',
      'Warnings',
      'Message Cleaning',
      'Media & Stickers',
      'Locks & Whitelist',
      'Smart Protection',
      'Custom Abuse',
      'Flood Control',
      'Filters',
      'Reports',
      'Welcome & Rules',
      'Pin Management',
      'Slow Mode',
      'Admin & Permissions',
      'Audit & Logs',
      'Announcements',
      'Scheduler',
      'Notes',
      'Configuration'
    ];

    const categories: Record<string, typeof COMMAND_CATALOG> = {};
    for (const item of filteredCatalog) {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
    }

    const messages: string[] = [];
    let currentMsg = isAdmin
      ? `🛡️ <b>Roxie Admin Command Center & Toolkit</b>\n<i>🔒 Showing all available administrator & member commands.</i>\n`
      : `🛡️ <b>Roxie Command Center</b>\n<i>📖 Showing available member commands.</i>\n`;

    for (const cat of categoryOrder) {
      const items = categories[cat];
      if (!items || items.length === 0) continue;

      let section = `\n📌 <b>${cat.toUpperCase()}</b>\n`;
      for (const item of items) {
        const permBadge = item.permission === 'Owner' ? '👑 Owner' : item.permission === 'Admin' ? '🛡️ Admin' : '👥 Everyone';
        const aliasStr = item.aliases && item.aliases.length > 0 ? ` (alias: <code>${item.aliases.join(', ')}</code>)` : '';
        section += `• <code>${escapeHtml(item.command)}</code>${aliasStr} [${permBadge}] — ${escapeHtml(item.description)}\n  <i>Syntax:</i> <code>${escapeHtml(item.syntax)}</code>\n`;
      }
      if (currentMsg.length + section.length > 3900) {
        messages.push(currentMsg);
        currentMsg = `🛡️ <b>Roxie Command Toolkit (cont.)</b>\n` + section;
      } else {
        currentMsg += section;
      }
    }
    if (currentMsg) {
      messages.push(currentMsg);
    }

    for (const msg of messages) {
      await telegramApi.sendMessage(ctx.chatId, msg);
    }
  }

  private static async handleNote(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '❌ You don\'t have permission to use this command.', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] authorization command=note result=DENIED`);
      return;
    }

    const name = ctx.args[0]?.toLowerCase()?.trim()?.replace(/^#/, '');
    const content = CommandHandler.getCommandText(ctx, 1);

    if (!name || !content) {
      await telegramApi.sendMessage(ctx.chatId, 'Usage:\n/note <name> <content>', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=usage_error`);
      return;
    }

    console.log(`[NOTE] saveNote chatId=${ctx.chatId} key=${name}`);
    db.saveNote(ctx.chatId, name, content, ctx.sender.id, ctx.adminDisplayName);
    console.log(`[NOTE] saveNote result=success`);

    db.addLog({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      targetUserId: ctx.sender.id,
      targetUsername: ctx.sender.username,
      action: 'warn',
      reason: `Saved note #${name}`
    });

    await telegramApi.sendMessage(ctx.chatId, `✅ Note saved: ${name}`, {
      reply_to_message_id: ctx.message.message_id
    });
    console.log(`[COMMAND] reply result=success`);
  }

  private static async handleGetNote(ctx: CommandContext) {
    const name = ctx.args[0]?.toLowerCase()?.trim()?.replace(/^#/, '');
    if (!name) {
      await telegramApi.sendMessage(ctx.chatId, 'Usage:\n/getnote <name>', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=usage_error`);
      return;
    }

    console.log(`[NOTE] getNote chatId=${ctx.chatId} key=${name}`);
    const note = db.getNote(ctx.chatId, name);
    if (!note) {
      console.log(`[NOTE] getNote result=not_found`);
      await telegramApi.sendMessage(ctx.chatId, `❌ Note not found: ${name}`, {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=success`);
      return;
    }
    console.log(`[NOTE] getNote result=success`);

    const formattedContent = note.content
      .replace(/{user}/gi, ctx.sender.first_name || 'User')
      .replace(/{chat}/gi, ctx.chatTitle || 'Chat');

    const responseText = `📝 <b>${name}</b>\n\n${formattedContent}`;
    await telegramApi.sendMessage(ctx.chatId, responseText, {
      reply_to_message_id: ctx.message.message_id
    });
    console.log(`[COMMAND] reply result=success`);
  }

  private static async handleNotesList(ctx: CommandContext) {
    console.log(`[NOTE] list chatId=${ctx.chatId}`);
    const notes = db.getAllNotes(ctx.chatId);
    if (!notes || notes.length === 0) {
      console.log(`[NOTE] list result=empty`);
      await telegramApi.sendMessage(ctx.chatId, '📝 No notes saved for this group.', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=success`);
      return;
    }
    console.log(`[NOTE] list result=success count=${notes.length}`);

    const noteLines = notes
      .map((n) => `• ${n.name}`)
      .join('\n');

    const responseText = `📝 <b>Group Notes</b>\n\n${noteLines}`;
    await telegramApi.sendMessage(ctx.chatId, responseText, {
      reply_to_message_id: ctx.message.message_id
    });
    console.log(`[COMMAND] reply result=success`);
  }

  private static async handleDelNote(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '❌ You don\'t have permission to use this command.', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] authorization command=delnote result=DENIED`);
      return;
    }

    const name = ctx.args[0]?.toLowerCase()?.trim()?.replace(/^#/, '');
    if (!name) {
      await telegramApi.sendMessage(ctx.chatId, 'Usage:\n/delnote <name>', {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=usage_error`);
      return;
    }

    console.log(`[NOTE] deleteNote chatId=${ctx.chatId} key=${name}`);
    const note = db.getNote(ctx.chatId, name);
    if (!note) {
      console.log(`[NOTE] deleteNote result=not_found`);
      await telegramApi.sendMessage(ctx.chatId, `❌ Note not found: ${name}`, {
        reply_to_message_id: ctx.message.message_id
      });
      console.log(`[COMMAND] reply result=success`);
      return;
    }

    db.deleteNote(ctx.chatId, name);
    console.log(`[NOTE] deleteNote result=success`);

    db.addLog({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      targetUserId: ctx.sender.id,
      targetUsername: ctx.sender.username,
      action: 'warn',
      reason: `Deleted note #${name}`
    });

    await telegramApi.sendMessage(ctx.chatId, `✅ Note deleted: ${name}`, {
      reply_to_message_id: ctx.message.message_id
    });
    console.log(`[COMMAND] reply result=success`);
  }

  private static async handleExportConfig(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ <b>Administrator permission required to export configuration.</b>', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const config = db.exportGroupConfig(ctx.chatId);
    const jsonStr = JSON.stringify(config, null, 2);

    db.addLog({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      targetUserId: ctx.sender.id,
      targetUsername: ctx.sender.username,
      action: 'warn',
      reason: 'Exported group configuration'
    });

    const chunkLimit = 3500;
    if (jsonStr.length <= chunkLimit) {
      await telegramApi.sendMessage(ctx.chatId, `📦 <b>Group Configuration Backup</b>\n<pre>${escapeHtml(jsonStr)}</pre>`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `📦 <b>Group Configuration Backup</b>\nConfig exported successfully (${jsonStr.length} bytes).`, {
        reply_to_message_id: ctx.message.message_id
      });
      await telegramApi.sendMessage(ctx.chatId, `<pre>${escapeHtml(jsonStr.slice(0, chunkLimit))}</pre>`);
    }
  }

  private static async handleImportConfig(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ <b>Administrator permission required to import configuration.</b>', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    let jsonText = ctx.args.join(' ').trim();
    if (!jsonText && ctx.message.reply_to_message) {
      jsonText = (ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '').trim();
    }

    if (!jsonText) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ <b>Usage:</b> Reply to a JSON configuration message with <code>/importconfig</code> or provide JSON data.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    let parsedConfig: any;
    try {
      parsedConfig = JSON.parse(jsonText);
    } catch (err: any) {
      await telegramApi.sendMessage(ctx.chatId, `❌ <b>Invalid JSON format:</b> ${escapeHtml(err.message)}`, {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const res = db.importGroupConfig(ctx.chatId, parsedConfig, ctx.sender.id);
    if (!res.ok) {
      await telegramApi.sendMessage(ctx.chatId, `❌ <b>Configuration Import Rejected:</b> ${escapeHtml(res.message)}`, {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    db.addLog({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      targetUserId: ctx.sender.id,
      targetUsername: ctx.sender.username,
      action: 'warn',
      reason: `Imported group configuration (${res.appliedCount} items applied)`
    });

    await telegramApi.sendMessage(ctx.chatId, `✅ <b>Configuration Imported Successfully!</b>\nApplied ${res.appliedCount} settings, filters, and notes to this chat.`, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  public static async importStickerPack(
    setName: string,
    moodInput: string | undefined,
    actorId: number,
    chatId: number,
    replyToMessageId?: number,
    silent: boolean = false
  ): Promise<{
    success: boolean;
    packName: string;
    packTitle: string;
    totalCount: number;
    addedCount: number;
    existedCount: number;
    mood: string;
    error?: string;
  }> {
    const rawMood = (moodInput || 'normal').toLowerCase().trim();
    if (!ROXIE_SUPPORTED_MOODS.includes(rawMood as any)) {
      const moodList = ROXIE_SUPPORTED_MOODS.map(m => `<code>${m}</code>`).join(', ');
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `⚠️ <b>Invalid mood category:</b> <code>${escapeHtml(rawMood)}</code>\n\n<b>Valid moods:</b>\n${moodList}`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName: setName,
        packTitle: setName,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood: rawMood,
        error: `Invalid mood category: ${rawMood}`
      };
    }
    const mood = rawMood;

    const cleanPackName = setName.replace(/^https:\/\/t\.me\/addstickers\//i, '').replace(/[<>]/g, '').trim();
    if (!cleanPackName) {
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `❌ Couldn't detect the sticker pack.`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName: setName,
        packTitle: setName,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood,
        error: "Couldn't detect the sticker pack."
      };
    }

    let res;
    try {
      res = await telegramApi.getStickerSet(cleanPackName);
    } catch (err: any) {
      const errMessage = err?.message || 'Network error';
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `❌ Telegram API error while fetching sticker pack: ${escapeHtml(errMessage)}`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName: cleanPackName,
        packTitle: cleanPackName,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood,
        error: errMessage
      };
    }

    if (!res || !res.ok || !res.result) {
      const errMsg = res?.description || 'Sticker pack not found';
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `❌ Couldn't detect or load sticker pack <b>${escapeHtml(cleanPackName)}</b>: ${escapeHtml(errMsg)}`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName: cleanPackName,
        packTitle: cleanPackName,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood,
        error: errMsg
      };
    }

    const pack = res.result;
    const packTitle = pack.title || pack.name || cleanPackName;
    const packName = pack.name || cleanPackName;
    const rawStickers = Array.isArray(pack.stickers) ? pack.stickers : [];

    if (rawStickers.length === 0) {
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `❌ Sticker pack <b>${escapeHtml(packTitle)}</b> contains no stickers.`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName,
        packTitle,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood,
        error: 'Sticker pack contains no stickers'
      };
    }

    let addedCount = 0;
    let existedCount = 0;
    const nowIso = new Date().toISOString();

    for (const s of rawStickers) {
      const fileId = s.file_id;
      if (!ChatbotService.isValidFileId(fileId)) {
        continue;
      }
      const added = db.addStickerToLibrary(mood, fileId, {
        packName,
        packTitle,
        fileId,
        emoji: s.emoji,
        mood,
        addedBy: actorId,
        addedAt: nowIso
      }, chatId);
      if (added) {
        addedCount++;
      } else {
        existedCount++;
      }
    }

    const totalValid = addedCount + existedCount;

    if (totalValid === 0) {
      if (!silent) {
        await telegramApi.sendMessage(
          chatId,
          `❌ No valid sticker file IDs found in pack <b>${escapeHtml(packTitle)}</b>.`,
          { reply_to_message_id: replyToMessageId }
        );
      }
      return {
        success: false,
        packName,
        packTitle,
        totalCount: 0,
        addedCount: 0,
        existedCount: 0,
        mood,
        error: 'No valid sticker file IDs found in pack'
      };
    }

    if (!silent) {
      const header = addedCount > 0
        ? `✅ <b>Sticker pack imported</b>`
        : `ℹ️ <b>Sticker pack already imported</b>`;
      const messageText = `${header}\n\n` +
        `📦 <b>Pack:</b> ${escapeHtml(packTitle)}\n` +
        `🎭 <b>Mood:</b> <code>${escapeHtml(mood)}</code>\n` +
        `🆕 <b>Added:</b> ${addedCount}\n` +
        `♻️ <b>Already saved:</b> ${existedCount}\n` +
        `📊 <b>Total in pack:</b> ${totalValid}\n\n` +
        `<i>Imported ${addedCount} stickers from "${escapeHtml(packTitle)}" (${totalValid} total in pack). Already existed: ${existedCount}.</i>`;

      await telegramApi.sendMessage(chatId, messageText, {
        reply_to_message_id: replyToMessageId
      });
    }

    return {
      success: true,
      packName,
      packTitle,
      totalCount: totalValid,
      addedCount,
      existedCount,
      mood
    };
  }

  private static async handleAddBulkSticker(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to manage bot stickers.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const fullText = (ctx.args.join(' ') || (ctx.message.reply_to_message?.text || '')).trim();
    if (!fullText) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Usage:</b> <code>/addbulksticker &lt;pack_link1&gt; &lt;pack_link2&gt; ... [mood]</code>\n\n` +
        `Paste multiple Telegram sticker pack URLs or names (space or line separated).\n` +
        `<i>Example:</i> <code>/addbulksticker https://t.me/addstickers/Animals https://t.me/addstickers/Anime cute</code>`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Check if the last token is a valid mood category
    const tokens = fullText.split(/\s+/).filter(Boolean);
    let targetMood = 'normal';
    const lastToken = tokens[tokens.length - 1]?.toLowerCase();
    if (lastToken && ROXIE_SUPPORTED_MOODS.includes(lastToken as any) && tokens.length > 1) {
      targetMood = lastToken;
      tokens.pop();
    }

    // Extract pack names (handling URLs and raw names)
    const packNames: string[] = [];
    for (const token of tokens) {
      const clean = token.replace(/^https:\/\/t\.me\/addstickers\//i, '').replace(/[<>]/g, '').trim();
      if (clean && !packNames.includes(clean)) {
        packNames.push(clean);
      }
    }

    if (packNames.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `❌ No valid sticker pack names or URLs found in your input.`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    await telegramApi.sendMessage(
      ctx.chatId,
      `⏳ <b>Processing Bulk Sticker Import...</b>\n` +
      `• Total packs detected: <b>${packNames.length}</b>\n` +
      `• Target mood category: <code>${targetMood}</code>\n` +
      `<i>Fetching sticker metadata from Telegram API...</i>`,
      { reply_to_message_id: ctx.message.message_id }
    );

    const results: Array<{ pack: string; title: string; added: number; existed: number; error?: string }> = [];
    let totalAdded = 0;
    let totalExisted = 0;

    for (const packName of packNames) {
      const res = await this.importStickerPack(packName, targetMood, actor.actorUserId, ctx.chatId, undefined, true);
      if (res.success) {
        totalAdded += res.addedCount;
        totalExisted += res.existedCount;
        results.push({ pack: res.packName, title: res.packTitle, added: res.addedCount, existed: res.existedCount });
      } else {
        results.push({ pack: packName, title: packName, added: 0, existed: 0, error: res.error || 'Failed to import' });
      }
    }

    // Build summary response
    let summaryText = `📦 <b>Bulk Sticker Import Summary</b>\n\n`;
    summaryText += `• <b>Mood Category:</b> <code>${escapeHtml(targetMood)}</code>\n`;
    summaryText += `• <b>Packs Processed:</b> ${results.length}\n`;
    summaryText += `• <b>Total New Stickers Added:</b> <b>${totalAdded}</b>\n`;
    summaryText += `• <b>Total Already Existed:</b> ${totalExisted}\n\n`;
    summaryText += `<b>Breakdown:</b>\n`;

    for (const r of results) {
      if (r.error) {
        summaryText += `❌ <b>${escapeHtml(r.title)}</b> — <i>${escapeHtml(r.error)}</i>\n`;
      } else {
        summaryText += `✅ <b>${escapeHtml(r.title)}</b> — +${r.added} added (${r.existed} existing)\n`;
      }
    }

    const groupSummary = db.getGroupPacksSummary(ctx.chatId, 1, 10);
    summaryText += `\n📊 <b>Group Sticker Status:</b> ${groupSummary.totalPacks} packs (${groupSummary.totalStickers} stickers total)\n`;
    summaryText += `<i>Use <code>/stickers</code> to view the complete group media library.</i>`;

    await telegramApi.sendMessage(ctx.chatId, summaryText, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  private static async handleAddStickerPack(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to manage bot stickers.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const reply = ctx.message.reply_to_message;
    const args = ctx.args || [];

    // Case 1: Replying to a message
    if (reply) {
      if (reply.sticker) {
        const sticker = reply.sticker;
        const fileId = sticker.file_id;
        if (!fileId || typeof fileId !== 'string' || !fileId.trim()) {
          await telegramApi.sendMessage(ctx.chatId, '❌ Invalid sticker file ID in replied message.', {
            reply_to_message_id: ctx.message.message_id
          });
          return;
        }

        const setName = sticker.set_name;
        if (!setName || !setName.trim()) {
          await telegramApi.sendMessage(ctx.chatId, '❌ This sticker does not belong to a Telegram sticker pack.', {
            reply_to_message_id: ctx.message.message_id
          });
          return;
        }

        const mood = (args[0] || 'normal').toLowerCase().trim();
        if (!ROXIE_SUPPORTED_MOODS.includes(mood as any)) {
          const moodList = ROXIE_SUPPORTED_MOODS.map(m => `<code>${m}</code>`).join(', ');
          await telegramApi.sendMessage(
            ctx.chatId,
            `⚠️ <b>Invalid mood category:</b> <code>${escapeHtml(mood)}</code>\n\n<b>Valid moods:</b>\n${moodList}`,
            { reply_to_message_id: ctx.message.message_id }
          );
          return;
        }

        await this.importStickerPack(setName, mood, actor.actorUserId, ctx.chatId, ctx.message.message_id);
        return;
      } else {
        // Replied to a non-sticker message (e.g., text, photo, animation)
        // If user didn't explicitly pass a pack name, return helpful error
        const isExplicitPack = args.length >= 2 || (args.length === 1 && !ROXIE_SUPPORTED_MOODS.includes(args[0].toLowerCase() as any));
        if (!isExplicitPack) {
          await telegramApi.sendMessage(
            ctx.chatId,
            '⚠️ The replied message is not a Telegram sticker. Please reply to a sticker with <code>/addstickerpack [mood]</code> or provide a sticker pack name.',
            { reply_to_message_id: ctx.message.message_id }
          );
          return;
        }
      }
    }

    // Case 2: Without replying to a sticker (or with explicit pack name)
    if (args.length === 0) {
      await telegramApi.sendMessage(
        ctx.chatId,
        '⚠️ <b>Usage:</b>\n• Reply to any sticker: <code>/addstickerpack [mood]</code>\n• Direct: <code>/addstickerpack &lt;pack_name&gt; [mood]</code>\n<i>Example:</i> <code>/addstickerpack Animals cute</code>',
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const packName = args[0].replace(/^https:\/\/t\.me\/addstickers\//i, '').trim();
    const mood = (args[1] || 'normal').toLowerCase().trim();

    await this.importStickerPack(packName, mood, actor.actorUserId, ctx.chatId, ctx.message.message_id);
  }

  private static async handleAddSticker(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to manage bot stickers.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.sticker) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Please reply to a sticker message with <code>/addsticker [mood]</code>.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const moodArg = ctx.args?.[0];
    const mood = (moodArg || 'normal').toLowerCase().trim();
    if (!ROXIE_SUPPORTED_MOODS.includes(mood as any)) {
      const moodList = ROXIE_SUPPORTED_MOODS.map(m => `<code>${m}</code>`).join(', ');
      await telegramApi.sendMessage(
        ctx.chatId,
        `⚠️ <b>Invalid mood category:</b> <code>${escapeHtml(mood)}</code>\n\n<b>Valid moods:</b>\n${moodList}`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    const sticker = reply.sticker;
    const fileId = sticker.file_id;
    if (!ChatbotService.isValidFileId(fileId)) {
      await telegramApi.sendMessage(ctx.chatId, "❌ Couldn't extract a valid sticker file ID.", {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const added = db.addStickerToLibrary(mood, fileId, {
      packName: sticker.set_name,
      fileId,
      emoji: sticker.emoji,
      mood,
      addedBy: actor.actorUserId,
      addedAt: new Date().toISOString()
    }, ctx.chatId);

    if (added) {
      await telegramApi.sendMessage(ctx.chatId, `✅ Sticker added successfully to mood category <code>${escapeHtml(mood)}</code>!\nID: <code>${fileId}</code>`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `ℹ️ This sticker already exists in mood category <code>${escapeHtml(mood)}</code>.`, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  private static async handleAddGif(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to manage bot GIFs.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || (!reply.animation && !reply.document)) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Please reply to an animation/GIF message with <code>/addgif [mood]</code>.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }
    const fileId = reply.animation?.file_id || reply.document?.file_id;
    if (!fileId) {
      await telegramApi.sendMessage(ctx.chatId, '❌ Could not extract animation file ID from replied message.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }
    const mood = (ctx.args?.[0] || 'normal').toLowerCase();
    db.addAnimationToLibrary(mood, fileId, ctx.chatId);
    await telegramApi.sendMessage(ctx.chatId, `✅ GIF/animation added successfully to mood category <code>${escapeHtml(mood)}</code>!\nID: <code>${fileId}</code>`, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  private static async handleListStickers(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to view the media library.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const rawPage = ctx.args?.[0];
    const pageNum = rawPage && /^\d+$/.test(rawPage) ? parseInt(rawPage, 10) : 1;
    const summary = db.getGroupPacksSummary(ctx.chatId, pageNum, 6);
    const lib = db.getMediaLibrary(ctx.chatId);

    let text = `🎭 <b>Roxie Sticker Library</b>\n\n`;
    text += `<b>Default:</b> ${summary.defaultStickersCount}\n`;
    text += `<b>Custom:</b> ${summary.customStickersCount}\n`;
    text += `<b>Total:</b> ${summary.totalStickers}\n`;
    text += `<b>Total Packs:</b> ${summary.totalPacks} (${summary.totalDefaultPacks} default + ${summary.totalCustomPacks} custom)\n\n`;

    text += `<b>Mood:</b>\n`;
    const moodEntries = Object.entries(summary.moodCounts);
    for (const [m, count] of moodEntries) {
      const capMood = m.charAt(0).toUpperCase() + m.slice(1);
      const customCount = summary.customMoodCounts[m] || 0;
      if (customCount > 0) {
        text += `${capMood}: ${count} (${customCount} custom)\n`;
      } else {
        text += `${capMood}: ${count}\n`;
      }
    }

    const animMoods = Object.keys(lib.animations || {});
    if (animMoods.length > 0) {
      text += `\n<b>GIFs/Animations:</b>\n`;
      for (const m of animMoods) {
        const count = lib.animations[m]?.length || 0;
        text += `• <b>${escapeHtml(m)}</b>: ${count} animation(s)\n`;
      }
    }

    if (summary.packs.length > 0) {
      text += `\n<b>Custom Sticker Packs (Page ${summary.page}/${summary.totalPages}):</b>\n`;
      for (const p of summary.packs) {
        text += `• <b>${escapeHtml(p.title)}</b> (<code>${escapeHtml(p.name)}</code>) — ${p.count} sticker(s) [${p.moods.join(', ')}]\n`;
      }
      if (summary.totalPages > 1) {
        text += `\n<i>Page ${summary.page} of ${summary.totalPages}. View next page with <code>/stickers ${summary.page < summary.totalPages ? summary.page + 1 : 1}</code></i>\n`;
      }
    }

    text += `\n<b>Media Management Commands:</b>\n`;
    text += `• <code>/addstickerpack &lt;link_or_name&gt; [mood]</code>\n`;
    text += `• <code>/addbulksticker &lt;link1&gt; &lt;link2&gt; ... [mood]</code>\n`;
    text += `• <code>/addsticker [mood]</code> (reply to sticker)\n`;
    text += `• <code>/removesticker [file_id]</code>\n`;
    text += `• <code>/clearstickers [mood]</code>\n`;
    text += `• <code>/stickers on|off</code> (toggle protection)`;

    await telegramApi.sendMessage(ctx.chatId, text, {
      reply_to_message_id: ctx.message.message_id
    });
  }

  private static async handleRemoveSticker(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to remove bot media.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const reply = ctx.message.reply_to_message;
    let fileId = reply?.sticker?.file_id || reply?.animation?.file_id || reply?.document?.file_id;
    if (!fileId && ctx.args && ctx.args.length > 0) {
      fileId = ctx.args.join(' ').trim();
    }

    if (!fileId) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ Usage: Reply to a sticker/GIF with <code>/removesticker</code> or pass <code>/removesticker <file_id></code>', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const removed = db.removeMediaFromLibrary(fileId, ctx.chatId);
    if (removed) {
      await telegramApi.sendMessage(ctx.chatId, `✅ Media item successfully removed from library.`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `❌ Media item with specified ID not found in library.`, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  private static async handleClearStickers(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to clear the media library.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const mood = ctx.args?.[0]?.toLowerCase();
    db.clearMediaLibrary(mood, ctx.chatId);
    if (mood) {
      await telegramApi.sendMessage(ctx.chatId, `🗑️ Cleared all media items for mood category <code>${escapeHtml(mood)}</code>.`, {
        reply_to_message_id: ctx.message.message_id
      });
    } else {
      await telegramApi.sendMessage(ctx.chatId, `🗑️ Cleared group media library.`, {
        reply_to_message_id: ctx.message.message_id
      });
    }
  }

  private static cachedBotUsername: string | null = null;

  private static async handleStickerPackRemove(ctx: CommandContext) {
    // 1. Verify that the command is being used inside a group
    if (!ctx.chatId || ctx.chatId > 0) {
      await telegramApi.sendMessage(ctx.chatId, '❌ This command can only be used in groups.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // 2. Verify that the actor has permission to manage sticker packs
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator or moderator to manage sticker packs.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // 3. Verify that the command is a reply
    const reply = ctx.message.reply_to_message;
    if (!reply) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ <b>Usage:</b> Reply to a sticker with <code>/stickerpackremove</code> to delete its entire sticker pack.', {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // 4. Verify that the replied-to message contains a sticker
    const sticker = reply.sticker;
    if (!sticker) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ The replied message is not a sticker. Please reply to a Telegram sticker.', {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // 5. Read the sticker's set_name / sticker-set information
    const setName = sticker.set_name;
    if (!setName || !setName.trim()) {
      await telegramApi.sendMessage(ctx.chatId, '⚠️ This sticker is a standalone sticker and does not belong to a Telegram sticker pack.', {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // 6. Resolve the complete sticker set
    let setRes;
    try {
      setRes = await telegramApi.getStickerSet(setName);
    } catch (err: any) {
      await telegramApi.sendMessage(ctx.chatId, `❌ Failed to fetch sticker pack details from Telegram: ${escapeHtml(err?.message || 'Unknown error')}`, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    if (!setRes || !setRes.ok || !setRes.result) {
      await telegramApi.sendMessage(ctx.chatId, `❌ Could not find sticker pack <b>${escapeHtml(setName)}</b>: ${escapeHtml(setRes?.description || 'Pack not found')}`, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const stickerSet = setRes.result;
    const packTitle = stickerSet.title || setName;

    // 7. Determine whether Roxie owns/created that sticker set
    if (!this.cachedBotUsername) {
      try {
        const meRes = await telegramApi.getMe();
        if (meRes && meRes.ok && meRes.result?.username) {
          this.cachedBotUsername = meRes.result.username;
        }
      } catch {}
    }
    const botUsername = this.cachedBotUsername;

    const isOwnedByBot = Boolean(
      botUsername &&
      setName.toLowerCase().endsWith(`_by_${botUsername.toLowerCase()}`)
    );

    // 8. If Roxie owns the set:
    // Delete the entire sticker set using Telegram's supported sticker-set deletion capability.
    if (isOwnedByBot) {
      let deleteRes;
      try {
        deleteRes = await telegramApi.deleteStickerSet(setName);
      } catch (err: any) {
        await telegramApi.sendMessage(ctx.chatId, `❌ Telegram API error while deleting sticker pack: ${escapeHtml(err?.message || 'Unknown error')}`, {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
        return;
      }

      if (!deleteRes || !deleteRes.ok) {
        await telegramApi.sendMessage(ctx.chatId, `❌ Telegram refused to delete sticker pack <b>${escapeHtml(packTitle)}</b>: ${escapeHtml(deleteRes?.description || 'Permission denied')}`, {
          parse_mode: 'HTML',
          reply_to_message_id: ctx.message.message_id
        });
        return;
      }

      // Purge pack from group media library if it was stored
      db.removeStickerPackFromLibrary(setName, ctx.chatId);

      // Log the audit action
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'stickerpackremove',
        action: 'delete_sticker_pack',
        result: 'success',
        details: `Deleted bot-owned sticker set: ${setName} (${packTitle})`
      });

      // 10. Delete moderator's command message when possible so the group remains clean
      try {
        await telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id);
      } catch {}

      await telegramApi.sendMessage(ctx.chatId, `🗑️ Sticker pack <b>${escapeHtml(packTitle)}</b> (<code>${escapeHtml(setName)}</code>) owned by Roxie has been permanently deleted from Telegram.`, {
        parse_mode: 'HTML'
      });
      return;
    }

    // 9. If Roxie does NOT own the set:
    // Do NOT falsely claim that Roxie deleted the entire pack.
    // Telegram does not allow a bot to delete arbitrary sticker sets owned by someone else.
    // Instead, clearly report that the pack cannot be globally deleted by Roxie and offer
    // the supported fallback of deleting the replied sticker message from the current group.
    let messageDeleted = false;
    try {
      const delRes = await telegramApi.deleteMessage(ctx.chatId, reply.message_id);
      if (delRes && delRes.ok) {
        messageDeleted = true;
      }
    } catch {}

    // Also remove from the group's local media library if it was imported
    db.removeStickerPackFromLibrary(setName, ctx.chatId);

    // 11. Log the action
    TelegramMiddleware.logAudit({
      chatId: ctx.chatId,
      chatTitle: ctx.chatTitle,
      actor,
      command: 'stickerpackremove',
      action: 'delete_sticker_pack',
      result: 'denied',
      reason: 'Sticker set not owned by bot',
      details: `Pack ${setName} not created by bot; message fallback deleted=${messageDeleted}`
    });

    // 10. Delete moderator's command message when possible so the group remains clean
    try {
      await telegramApi.deleteMessage(ctx.chatId, ctx.message.message_id);
    } catch {}

    const ownerMsg =
      `⚠️ <b>Cannot Delete Third-Party Pack:</b> Sticker pack <b>${escapeHtml(packTitle)}</b> (<code>${escapeHtml(setName)}</code>) was not created by @${botUsername || 'Roxie'}. Telegram only permits a bot to delete sticker sets it created.\n\n` +
      (messageDeleted
        ? `✅ Removed the replied sticker message from this group as a local fallback.`
        : `💡 <i>Tip:</i> To moderate stickers in this group, enable <code>/stickers on</code>.`);

    await telegramApi.sendMessage(ctx.chatId, ownerMsg, {
      parse_mode: 'HTML'
    });
  }

  private static async handleLustMode(ctx: CommandContext) {
    const auth = await TelegramMiddleware.requireLustmodeAdmin(ctx);
    if (!auth.allowed) {
      if (auth.actor) {
        TelegramMiddleware.logAudit({
          chatId: ctx.chatId,
          chatTitle: ctx.chatTitle,
          actor: auth.actor,
          command: ctx.command || 'lustmode',
          action: 'setting_change',
          result: 'denied',
          reason: auth.reason || 'Unauthorized access to /lustmode'
        });
      }
      return;
    }

    const actor = auth.actor || (await TelegramMiddleware.resolveActor(ctx));
    const sub = (ctx.args[0] || '').toLowerCase().trim();
    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);

    if (sub === 'on' || sub === 'enable' || sub === 'true') {
      db.updateGroupSettings(ctx.chatId, { lustMode: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'lustmod',
        action: 'setting_change',
        result: 'success',
        details: 'Lust mode enabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `🔥 <b>Roxie Lust Mode:</b> 🟢 <b>ON</b>\n\n` +
        `Roxie will adopt a more flirtatious, teasing, and playful tone in this group while strictly maintaining safe, non-explicit interactions.`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    if (sub === 'off' || sub === 'disable' || sub === 'false') {
      db.updateGroupSettings(ctx.chatId, { lustMode: false });
      db.resetLustLevel(ctx.chatId);
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'lustmod',
        action: 'setting_change',
        result: 'success',
        details: 'Lust mode disabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `✨ <b>Roxie Lust Mode:</b> 🔴 <b>OFF</b>\n\n` +
        `Roxie has returned to standard personality mode.`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Default status view
    const isLustOn = Boolean(settings.lustMode);
    await telegramApi.sendMessage(
      ctx.chatId,
      `🔥 <b>Roxie Lust Mode Settings</b>\n\n` +
      `• <b>Lust Mode:</b> ${isLustOn ? '🟢 <b>ON</b>' : '🔴 <b>OFF</b>'}\n` +
      `• <b>Media:</b> Custom stickers only\n` +
      `• <b>Response formats:</b>\n` +
      `  - Text + 1 custom sticker\n` +
      `  - 1 custom sticker\n` +
      `• <b>Safety Policy:</b> Always Safe & Non-Explicit (No NSFW/Graphic Content)\n\n` +
      `<b>Commands:</b>\n` +
      `• <code>/lustmode on</code> — Enable lust mode\n` +
      `• <code>/lustmode off</code> — Disable lust mode\n` +
      `• <code>/lustmode status</code> — View current status`,
      { reply_to_message_id: ctx.message.message_id }
    );
  }

  public static async handleTestSticker(ctx: CommandContext) {
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator to use /teststicker.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    // Verified real Telegram sticker file_id from official Telegram sticker set (Animals pack)
    const REAL_STICKER_FILE_ID = 'CAACAgIAAxUAAWqSpnq-jinkUWh846b3Djhd3CXdAALeAAP0exkAAb2F7273xc49PQQ';

    console.log(`[TESTSTICKER] Executing direct Telegram sticker dispatch for chatId=${ctx.chatId} stickerFileId=${REAL_STICKER_FILE_ID}`);

    const res = await telegramApi.sendSticker(ctx.chatId, REAL_STICKER_FILE_ID, {
      reply_to_message_id: ctx.message.message_id
    });

    console.log('[TESTSTICKER] Complete Telegram API result:', {
      ok: res.ok,
      error_code: res.error_code,
      description: res.description,
      returned_message_id: res.result?.message_id,
      returned_sticker_file_id: res.result?.sticker?.file_id
    });

    if (res.ok) {
      await telegramApi.sendMessage(
        ctx.chatId,
        `✅ <b>Direct /teststicker Execution Succeeded!</b>\n\n` +
        `• <b>ok:</b> <code>${res.ok}</code>\n` +
        `• <b>Returned Message ID:</b> <code>${res.result?.message_id}</code>\n` +
        `• <b>Returned Sticker File ID:</b> <code>${res.result?.sticker?.file_id}</code>\n` +
        `• <b>Emoji:</b> ${res.result?.sticker?.emoji || 'N/A'}\n\n` +
        `<i>Telegram API sendSticker is 100% operational with real file IDs.</i>`,
        {
          reply_to_message_id: res.result?.message_id || ctx.message.message_id
        }
      );
    } else {
      await telegramApi.sendMessage(
        ctx.chatId,
        `❌ <b>Direct /teststicker Execution Failed!</b>\n\n` +
        `• <b>ok:</b> <code>${res.ok}</code>\n` +
        `• <b>error_code:</b> <code>${res.error_code}</code>\n` +
        `• <b>description:</b> <code>${escapeHtml(res.description || 'Unknown error')}</code>`,
        {
          reply_to_message_id: ctx.message.message_id
        }
      );
    }
  }

  public static async handleRoxieReaction(ctx: CommandContext) {
    const isGroup = TelegramMiddleware.isGroup(ctx.message);
    const actor = await TelegramMiddleware.resolveActor(ctx);
    if (isGroup && actor.actorRank < RoleRank.MODERATOR) {
      await telegramApi.sendMessage(ctx.chatId, '⛔ You must be an administrator to configure reactions.', {
        reply_to_message_id: ctx.message.message_id
      });
      return;
    }

    const settings = db.getGroupSettings(ctx.chatId, ctx.chatTitle);
    const sub = (ctx.args[0] || '').toLowerCase();

    if (sub === 'on') {
      db.updateGroupSettings(ctx.chatId, { reactionEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxiereaction',
        action: 'setting_change',
        result: 'success',
        details: 'Smart reactions enabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `✨ <b>Smart Telegram Reactions:</b> 🟢 <b>ON</b>\n` +
        `Roxie will occasionally react to messages based on context and mood (Probability: <b>${Math.round((settings.reactionProbability ?? 0.15) * 100)}%</b>).`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    if (sub === 'off') {
      db.updateGroupSettings(ctx.chatId, { reactionEnabled: false });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxiereaction',
        action: 'setting_change',
        result: 'success',
        details: 'Smart reactions disabled'
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `✨ <b>Smart Telegram Reactions:</b> 🔴 <b>OFF</b>\n` +
        `Roxie will not send reactions in this chat.`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    if (sub === 'rate' || sub === 'prob' || sub === 'probability') {
      const rawVal = ctx.args[1] || '';
      const num = parseInt(rawVal.replace('%', ''), 10);
      if (isNaN(num) || num < 1 || num > 100) {
        await telegramApi.sendMessage(
          ctx.chatId,
          `⚠️ <b>Usage:</b> <code>/roxiereaction rate &lt;1-100&gt;</code>\nExample: <code>/roxiereaction rate 20</code> (sets 20% reaction rate)`,
          { reply_to_message_id: ctx.message.message_id }
        );
        return;
      }

      const prob = Math.min(Math.max(num / 100, 0.01), 1.0);
      db.updateGroupSettings(ctx.chatId, { reactionProbability: prob, reactionEnabled: true });
      TelegramMiddleware.logAudit({
        chatId: ctx.chatId,
        chatTitle: ctx.chatTitle,
        actor,
        command: 'roxiereaction',
        action: 'setting_change',
        result: 'success',
        details: `Reaction rate updated to ${num}%`
      });
      await telegramApi.sendMessage(
        ctx.chatId,
        `✨ <b>Smart Reaction Rate Updated:</b> <b>${num}%</b>\n` +
        `Reactions are active with ~${num} reactions per 100 messages.`,
        { reply_to_message_id: ctx.message.message_id }
      );
      return;
    }

    // Default: status view
    const isEnabled = settings.reactionEnabled !== false;
    const currentRate = Math.round((settings.reactionProbability ?? 0.15) * 100);
    await telegramApi.sendMessage(
      ctx.chatId,
      `✨ <b>Roxie Smart Reaction System</b>\n\n` +
      `• <b>Status:</b> ${isEnabled ? '🟢 ACTIVE' : '🔴 DISABLED'}\n` +
      `• <b>Reaction Rate:</b> <b>${currentRate}%</b>\n` +
      `• <b>Categorization:</b> Content & Mood-Aware (Funny, Love, Sad, Surprise, Approval, etc.)\n` +
      `• <b>Deduplication:</b> Enabled (1 reaction per message)\n` +
      `• <b>Command Immunity:</b> Active (commands never receive reactions)\n\n` +
      `<b>Admin Commands:</b>\n` +
      `• <code>/roxiereaction on</code> — Turn reactions on\n` +
      `• <code>/roxiereaction off</code> — Turn reactions off\n` +
      `• <code>/roxiereaction rate &lt;1-100&gt;</code> — Set reaction probability\n` +
      `• <code>/roxiereaction status</code> — View current settings`,
      { reply_to_message_id: ctx.message.message_id }
    );
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

export class CommandHandlerMediaExt {
  // Placeholder or extension methods for CommandHandler
}

// Add static media methods to CommandHandler class via extension or inside CommandHandler
// We can add them as static methods directly inside CommandHandler in commands.ts. Let's append helper handlers or add them to CommandHandler class.

