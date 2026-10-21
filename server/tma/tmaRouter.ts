import { Router, Response } from 'express';
import { db } from '../db/storage.js';
import { telegramApi } from '../telegram/api.js';
import { TelegramMiddleware } from '../telegram/middleware.js';
import { mentionAllService } from '../telegram/mentionAllService.js';
import { PostSender, sanitizeInlineButtons, validateMediaReference } from '../telegram/postSender.js';
import { messageScheduler, generateScheduleExportCode } from '../telegram/scheduler.js';
import { COMMAND_CATALOG } from '../telegram/commandCatalog.js';
import { PostPayload, PostContentType, SavedPost } from '../telegram/types.js';
import { parseScheduleTime } from '../telegram/postBuilder.js';
import {
  requireTmaAuth,
  validateTelegramInitData,
  resolveGroupRole,
  createTmaSessionToken,
  getAllowedFeaturesForRole,
  AuthenticatedTmaRequest
} from './tmaAuth.js';

export const tmaRouter = Router();

// ==========================================
// 1. TMA Authentication & Group Validation
// ==========================================

/**
 * Validates Telegram Mini App launch context and target group.
 * Server validates initData HMAC signature, resolves user's authoritative role for chatId,
 * and issues a group-scoped, cryptographically signed TMA session token.
 */
tmaRouter.post('/auth/validate', async (req, res) => {
  try {
    const { initData, chatId: rawChatId } = req.body;
    const chatId = Number(rawChatId);

    if (!initData || typeof initData !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Missing Telegram initData string',
        code: 'MISSING_INIT_DATA'
      });
    }

    if (!chatId || isNaN(chatId) || chatId >= 0) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid or missing target group chatId. Must be a negative group ID.',
        code: 'INVALID_GROUP_ID'
      });
    }

    // 1. Verify Telegram HMAC signature
    const validation = validateTelegramInitData(initData);
    if (!validation.valid || !validation.user) {
      return res.status(401).json({
        ok: false,
        error: `Telegram initData validation failed: ${validation.error || 'Invalid signature'}`,
        code: 'INVALID_INIT_DATA'
      });
    }

    const user = validation.user;

    // 2. Resolve Role for this specific group on the server
    const roleResolution = await resolveGroupRole(chatId, user.id);
    if (roleResolution.role === 'UNAUTHORIZED') {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden: You are not an administrator or owner of this group.',
        code: 'NOT_GROUP_ADMIN',
        role: 'UNAUTHORIZED'
      });
    }

    // 3. Fetch Group Info
    let chatTitle = 'Telegram Group';
    try {
      const chatRes = await telegramApi.getChat(chatId);
      if (chatRes && chatRes.ok && chatRes.result?.title) {
        chatTitle = chatRes.result.title;
      } else {
        const stored = db.getGroupSettingsIfExists(chatId);
        if (stored?.chatTitle) chatTitle = stored.chatTitle;
      }
    } catch {
      const stored = db.getGroupSettingsIfExists(chatId);
      if (stored?.chatTitle) chatTitle = stored.chatTitle;
    }

    // 4. Generate signed TMA session token
    const token = createTmaSessionToken(user, chatId, roleResolution.role);
    const allowedFeatures = getAllowedFeaturesForRole(roleResolution.role);

    res.json({
      ok: true,
      token,
      user,
      chatId,
      chatTitle,
      role: roleResolution.role,
      isOwner: roleResolution.isOwner,
      isExceptionAdmin: roleResolution.isExceptionAdmin,
      isAdmin: roleResolution.isAdmin,
      allowedFeatures
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 2. Hard Rejections for Forbidden Features
// ==========================================

// Messages and Danger Zone are permanently blocked for ALL Mini App roles
const rejectForbiddenMiniAppFeature = (featureName: string) => (req: any, res: Response) => {
  return res.status(403).json({
    ok: false,
    error: `Forbidden: '${featureName}' is strictly disabled in Telegram Mini App.`,
    code: 'FORBIDDEN_MINIAPP_ENDPOINT'
  });
};

tmaRouter.all('/groups/:chatId/messages*', rejectForbiddenMiniAppFeature('messages'));
tmaRouter.all('/groups/:chatId/danger-zone*', rejectForbiddenMiniAppFeature('danger_zone'));
tmaRouter.all('/groups/:chatId/reset', rejectForbiddenMiniAppFeature('danger_zone'));
tmaRouter.all('/groups/:chatId/leave', rejectForbiddenMiniAppFeature('danger_zone'));
tmaRouter.all('/groups/:chatId/clear-memory', rejectForbiddenMiniAppFeature('danger_zone'));

// ==========================================
// 3. Group Overview (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/overview', requireTmaAuth('overview'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);

    // Get live Telegram info
    let memberCount = 0;
    let chatTitle = settings.chatTitle || `Group ${Math.abs(chatId)}`;
    try {
      const countRes = await telegramApi.getChatMemberCount(chatId);
      if (countRes && countRes.ok && typeof countRes.result === 'number') {
        memberCount = countRes.result;
      }
      const cRes = await telegramApi.getChat(chatId);
      if (cRes && cRes.ok && cRes.result?.title) {
        chatTitle = cRes.result.title;
      }
    } catch {
      // Safe fallback
    }

    const overview = {
      chatId,
      chatTitle,
      memberCount,
      role: req.tmaRole,
      settings: {
        warnLimit: settings.warnLimit,
        warnAction: settings.warnAction,
        floodEnabled: settings.floodEnabled,
        raidEnabled: settings.raidEnabled,
        captchaEnabled: settings.captchaEnabled,
        linksProtection: settings.linksProtection,
        mediaProtection: settings.mediaProtection,
        chatbotEnabled: settings.chatbotEnabled,
        lustMode: settings.lustMode,
        autoEngineMode: settings.autoEngine?.mode || 'off',
        slowModeSeconds: settings.slowModeSeconds || 0,
        abuseWordsCount: (settings.abuseWords || []).length
      }
    };

    res.json({ ok: true, overview });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 4. Group Settings (General, Moderation, Content, AI, Auto Engine)
// ==========================================

tmaRouter.get('/groups/:chatId/settings', requireTmaAuth('general'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    const autoRespElig = db.checkAutoResponseEligibility(chatId);
    const autoStkElig = db.checkAutoStickerEligibility(chatId);
    res.json({
      ...settings,
      autoEngineMessageNextSeconds: autoRespElig.remainingSeconds || 0,
      autoEngineStickerNextSeconds: autoStkElig.remainingSeconds || 0,
      autoResponseNextAvailableSeconds: autoRespElig.remainingSeconds || 0,
      autoStickerNextAvailableSeconds: autoStkElig.remainingSeconds || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/settings', requireTmaAuth('general'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const role = req.tmaRole!;
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'Invalid settings payload' });
    }

    // Role-specific field filtering: Regular group admins cannot update fields outside their allowed features
    if (role === 'GROUP_ADMIN') {
      const allowedAdminKeys = new Set([
        // general & moderation
        'warnLimit', 'warnAction', 'warnExpireSeconds', 'floodEnabled', 'floodCount', 'floodWindow', 'floodAction',
        'raidEnabled', 'raidLimit', 'raidWindow', 'raidAction', 'raidDuration',
        'captchaEnabled', 'captchaMode', 'captchaTimeout', 'captchaAction',
        'automodEnabled', 'securityEnabled', 'reportsEnabled', 'stopAbusiveEnabled',
        // content protection
        'linksProtection', 'linksWhitelist', 'mediaProtection', 'stickerProtection', 'gifsProtection',
        'videosProtection', 'photosProtection', 'voiceProtection', 'audioProtection', 'locks',
        'fileProtection', 'imageProtection', 'gifProtection',
        'stopSpamEnabled', 'stopPromotionEnabled', 'promotionalSpamProtection',
        // lust mode
        'lustMode', 'lustLevel',
        // auto engine
        'autoEngine', 'autoResponse', 'autoSticker', 'stickerPacks'
      ]);

      const unauthorizedKeys = Object.keys(updates).filter(k => !allowedAdminKeys.has(k));
      if (unauthorizedKeys.length > 0) {
        return res.status(403).json({
          ok: false,
          code: 'OWNER_ONLY_SETTING',
          error: `Setting(s) [${unauthorizedKeys.join(', ')}] require Owner or Exception Admin privileges.`
        });
      }
    }

    const updated = db.updateGroupSettings(chatId, updates);
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4B. Moderation Warnings (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/warnings', requireTmaAuth('moderation'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const warnings = (db as any).data?.warnings?.filter((w: any) => w.groupId === chatId || w.chatId === chatId) || [];
    res.json({ ok: true, warnings });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/warnings/:userId', requireTmaAuth('moderation'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);
    const removed = db.resetUserWarnings(chatId, targetUserId);
    res.json({ ok: true, removed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. Welcome & Goodbye (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/welcome-goodbye', requireTmaAuth('welcome_goodbye'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    const groupWelcome = settings.groupWelcome || {
      enabled: Boolean(settings.welcomeEnabled),
      mode: 'simple',
      contentType: 'text',
      text: settings.welcomeMessage || '👋 Welcome {user} to {groupname}!'
    };
    const groupGoodbye = settings.groupGoodbye || {
      enabled: Boolean(settings.goodbyeEnabled),
      mode: 'simple',
      contentType: 'text',
      text: settings.goodbyeMessage || '👋 Goodbye {user}!'
    };
    const welcomeDm = settings.welcomeDm || {
      enabled: false,
      mode: 'simple',
      contentType: 'text',
      text: 'You joined {groupname} 🎉'
    };

    res.json({
      ok: true,
      chatId,
      settings,
      groupWelcome,
      groupGoodbye,
      welcomeDm,
      autoDeleteJoinLeave: settings.autoDeleteJoinLeave || false
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/welcome-goodbye', requireTmaAuth('welcome_goodbye'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { groupWelcome, groupGoodbye, welcomeDm, autoDeleteJoinLeave } = req.body;
    const updates: any = {};
    if (groupWelcome !== undefined) {
      updates.groupWelcome = groupWelcome;
      if (groupWelcome.enabled !== undefined) updates.welcomeEnabled = Boolean(groupWelcome.enabled);
      if (groupWelcome.text !== undefined) updates.welcomeMessage = groupWelcome.text;
    }
    if (groupGoodbye !== undefined) {
      updates.groupGoodbye = groupGoodbye;
      if (groupGoodbye.enabled !== undefined) updates.goodbyeEnabled = Boolean(groupGoodbye.enabled);
      if (groupGoodbye.text !== undefined) updates.goodbyeMessage = groupGoodbye.text;
    }
    if (welcomeDm !== undefined) updates.welcomeDm = welcomeDm;
    if (autoDeleteJoinLeave !== undefined) updates.autoDeleteJoinLeave = Boolean(autoDeleteJoinLeave);

    const updated = db.updateGroupSettings(chatId, updates);
    res.json({
      ok: true,
      settings: updated,
      groupWelcome: updated.groupWelcome,
      groupGoodbye: updated.groupGoodbye,
      welcomeDm: updated.welcomeDm,
      autoDeleteJoinLeave: updated.autoDeleteJoinLeave
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/welcome-goodbye/test', requireTmaAuth('welcome_goodbye'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    const chatTitle = settings.chatTitle || `Group ${chatId}`;
    const target = (req.body?.target || 'welcomeDm') as 'groupWelcome' | 'groupGoodbye' | 'welcomeDm';
    const targetUserId = req.body?.targetUserId ? Number(req.body.targetUserId) : undefined;

    let configToTest: any;
    if (target === 'groupWelcome') {
      configToTest = req.body.config || settings.groupWelcome || {
        enabled: true,
        mode: 'simple',
        contentType: 'text',
        text: '👋 Welcome {user} to {groupname}!'
      };
    } else if (target === 'groupGoodbye') {
      configToTest = req.body.config || settings.groupGoodbye || {
        enabled: true,
        mode: 'simple',
        contentType: 'text',
        text: '👋 Goodbye {user}!'
      };
    } else {
      configToTest = req.body.config || settings.welcomeDm || {
        enabled: true,
        mode: 'simple',
        contentType: 'text',
        text: 'You joined {groupname} 🎉'
      };
    }

    const testText = (configToTest.text || '')
      .replace(/{user}/g, '@Tester')
      .replace(/{groupname}/g, chatTitle)
      .replace(/{chat}/g, chatTitle);

    const destChatId = target === 'welcomeDm' ? (targetUserId || req.tmaUser!.id) : chatId;
    const postPayload: PostPayload = {
      contentType: configToTest.contentType || 'text',
      text: testText || 'Test greeting',
      mediaFileId: configToTest.mediaFileId,
      buttons: sanitizeInlineButtons(configToTest.buttons),
      pinAfterSend: false,
      protectContent: false
    };

    const sendRes = await PostSender.send(destChatId, postPayload);
    res.json({ ok: sendRes.ok, result: sendRes });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/welcome-dm', requireTmaAuth('welcome_goodbye'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    res.json({
      welcomeDm: settings.welcomeDm || null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/welcome-dm', requireTmaAuth('welcome_goodbye'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { welcomeDm } = req.body;
    const updated = db.updateGroupSettings(chatId, { welcomeDm });
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. Rich Post (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.post('/groups/:chatId/rich-post/send', requireTmaAuth('rich_post'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { post, pinMessage } = req.body;

    if (!post) {
      return res.status(400).json({ success: false, error: 'Post payload is required' });
    }

    const contentType: PostContentType = post.contentType || 'text';
    const text = typeof post.text === 'string' ? post.text.trim() : '';

    let normalizedMediaId: string | undefined = undefined;
    if (post.mediaFileId) {
      const mediaCheck = validateMediaReference(post.mediaFileId);
      if (mediaCheck.valid) {
        normalizedMediaId = mediaCheck.normalized;
      }
    }

    const postPayload: PostPayload = {
      contentType,
      text: text || undefined,
      mediaFileId: normalizedMediaId,
      buttons: sanitizeInlineButtons(post.buttons),
      pinAfterSend: Boolean(pinMessage || post.pinAfterSend),
      protectContent: Boolean(post.protectContent)
    };

    const sendResult = await PostSender.send(chatId, postPayload);
    res.json({ success: sendResult.ok, result: sendResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. Mention All (@all) (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.post('/groups/:chatId/mention-all/start', requireTmaAuth('mention_all'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { reason } = req.body;

    const actor = {
      actorUserId: req.tmaUser!.id,
      actorUsername: req.tmaUser!.username,
      actorDisplayName: req.tmaUser!.first_name || 'Admin'
    };

    const startRes = await mentionAllService.startOperation({
      chatId,
      chatTitle: `Group ${chatId}`,
      actor,
      source: 'dashboard',
      messageText: reason || 'Broadcast via Roxie Mini App',
      awaitWorker: process.env.NODE_ENV === 'test'
    });

    res.json(startRes);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/mention-all/stop', requireTmaAuth('mention_all'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const actor = {
      userId: req.tmaUser!.id,
      username: req.tmaUser!.username,
      displayName: req.tmaUser!.first_name || 'Admin'
    };
    const result = await mentionAllService.stopOperation(chatId, actor);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/mention-all/status', requireTmaAuth('mention_all'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const status = mentionAllService.getOperationStatus(chatId);
    res.json({ ok: true, status });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==========================================
// 8. Lust Mode & Personality (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/lust/settings', requireTmaAuth('lust_mode'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    res.json({
      lustMode: settings.lustMode || false,
      lustLevel: settings.lustLevel ?? 1
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/lust/settings', requireTmaAuth('lust_mode'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { lustMode, lustLevel } = req.body;
    const updates: any = {};
    if (lustMode !== undefined) updates.lustMode = Boolean(lustMode);
    if (lustLevel !== undefined) updates.lustLevel = Math.max(0, Math.min(4, Number(lustLevel)));

    const updated = db.updateGroupSettings(chatId, updates);
    res.json({ ok: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/lust/users', requireTmaAuth('lust_mode'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const users = db.getGroupUserLustLevels(chatId);
    res.json({ ok: true, users: users || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/lust/reset-group', requireTmaAuth('lust_mode'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    db.resetGroupLustState(chatId);
    res.json({ ok: true, message: 'Group lust memory reset successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/lust/reset-users', requireTmaAuth('lust_mode'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    db.resetLustLevel(chatId);
    res.json({ ok: true, message: 'All user lust levels reset in group' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. Stickers (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/stickers', requireTmaAuth('stickers'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const settings = db.getGroupSettings(chatId);
    const summary = db.getGroupPacksSummary(chatId);
    const lib = db.getMediaLibrary(chatId);
    const packs = db.getGroupStickerPacks(chatId);
    res.json({
      ok: true,
      chatId,
      summary,
      packs: packs || [],
      stickerPacks: settings.stickerPacks || {},
      autoSticker: settings.autoSticker || {},
      customStickers: lib.stickers || {},
      lustStickers: lib.lustStickers || {}
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.patch('/groups/:chatId/stickers/packs/:packName', requireTmaAuth('stickers'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const packName = req.params.packName.trim();
    const enabled = req.body.enabled !== false;
    const updated = db.updateGroupStickerPack(chatId, packName, { enabled });
    if (!updated) {
      return res.status(404).json({ error: `Sticker pack "${packName}" not found in group configuration` });
    }
    res.json({ ok: true, pack: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/stickers/packs', requireTmaAuth('stickers'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const rawInput = (req.body.packNameOrUrl || req.body.packName || req.body.name || '').trim();
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

    let title = cleanPackName;
    let stickers: any[] = [];

    try {
      const setRes = await telegramApi.getStickerSet(cleanPackName);
      if (setRes && setRes.ok && setRes.result) {
        const tgSet = setRes.result;
        title = tgSet.title || tgSet.name || cleanPackName;
        stickers = (tgSet.stickers || []).map((s: any) => ({
          fileId: s.file_id,
          emoji: s.emoji || '✨'
        }));
        const now = new Date().toISOString();
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
      }
    } catch {
      // Safe fallback
    }

    const settings = db.getGroupSettings(chatId);
    const packs = { ...(settings.stickerPacks || {}) };
    packs[cleanPackName] = {
      name: cleanPackName,
      title: req.body.config?.title || title,
      enabled: req.body.config?.enabled !== undefined ? Boolean(req.body.config.enabled) : true,
      stickers: req.body.config?.stickers || stickers
    };

    db.updateGroupSettings(chatId, { stickerPacks: packs });
    res.json({ ok: true, pack: packs[cleanPackName] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/stickers/packs/:packName', requireTmaAuth('stickers'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const packName = req.params.packName;
    const settings = db.getGroupSettings(chatId);
    const packs = { ...(settings.stickerPacks || {}) };

    if (!packs[packName]) {
      return res.status(404).json({ error: 'Sticker pack not found' });
    }

    delete packs[packName];
    db.updateGroupSettings(chatId, { stickerPacks: packs });
    res.json({ ok: true, message: `Sticker pack ${packName} removed` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. Slowmode (Owner & Exception Admin)
// ==========================================

tmaRouter.put('/groups/:chatId/slowmode', requireTmaAuth('slowmode'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const seconds = Number(req.body.seconds);

    if (isNaN(seconds) || seconds < 0) {
      return res.status(400).json({ error: 'Invalid slowmode seconds' });
    }

    const tgRes = await telegramApi.setChatSlowModeDelay(chatId, seconds);
    if (!tgRes.ok) {
      return res.status(400).json({ ok: false, error: tgRes.description || 'Telegram API rejected slowmode' });
    }

    db.updateGroupSettings(chatId, { slowModeSeconds: seconds });
    res.json({ ok: true, slowModeSeconds: seconds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. Abuse Words (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/abuse-words', requireTmaAuth('abuse_words'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const words = db.getAbuseWords(chatId);
    res.json({ ok: true, words });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/abuse-words', requireTmaAuth('abuse_words'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { word } = req.body;
    if (!word || typeof word !== 'string' || !word.trim()) {
      return res.status(400).json({ error: 'Word string is required' });
    }

    const words = db.addAbuseWord(chatId, word.trim());
    res.json({ ok: true, words });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/abuse-words/:word', requireTmaAuth('abuse_words'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const word = decodeURIComponent(req.params.word);
    const words = db.removeAbuseWord(chatId, word);
    res.json({ ok: true, words });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/abuse-words', requireTmaAuth('abuse_words'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    db.clearAbuseWords(chatId);
    res.json({ ok: true, words: [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 12. Members (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/members', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    let list = db.getGroupMembers(chatId);

    // If local member list is empty, query Telegram chat administrators to populate list
    if (!list || list.length === 0) {
      try {
        const admins = await TelegramMiddleware.getChatAdministrators(chatId);
        if (admins && admins.length > 0) {
          list = admins.map(adm => ({
            userId: adm.user?.id || 0,
            username: adm.user?.username,
            firstName: adm.user?.first_name,
            lastName: adm.user?.last_name,
            role: adm.status === 'creator' ? 'creator' : 'administrator',
            lastActive: new Date().toISOString()
          }));
        }
      } catch {
        // Fallback
      }
    }

    res.json({ ok: true, members: list || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/members/:userId/ban', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);

    const tgRes = await telegramApi.banChatMember(chatId, targetUserId);
    res.json({ ok: tgRes.ok, result: tgRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/members/:userId/unban', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);

    const tgRes = await telegramApi.unbanChatMember(chatId, targetUserId);
    res.json({ ok: tgRes.ok, result: tgRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/members/:userId/restrict', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);
    const { permissions } = req.body;

    const tgRes = await telegramApi.restrictChatMember(chatId, targetUserId, permissions || {
      can_send_messages: false
    });
    res.json({ ok: tgRes.ok, result: tgRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/members/:userId/promote', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    // Only Group Owner and Exception Admin can promote
    if (req.tmaRole !== 'GROUP_OWNER' && req.tmaRole !== 'EXCEPTION_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only group owners and exception admins can promote members.' });
    }

    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);
    const permissions = req.body.permissions || {
      can_delete_messages: true,
      can_invite_users: true,
      can_restrict_members: true,
      can_pin_messages: true
    };

    const tgRes = await telegramApi.promoteChatMember(chatId, targetUserId, permissions);
    res.json({ ok: tgRes.ok, result: tgRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/members/:userId/demote', requireTmaAuth('members'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    if (req.tmaRole !== 'GROUP_OWNER' && req.tmaRole !== 'EXCEPTION_ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Only group owners and exception admins can demote members.' });
    }

    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);

    const tgRes = await telegramApi.promoteChatMember(chatId, targetUserId, {
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
    res.json({ ok: tgRes.ok, result: tgRes });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 13. Moderators (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/moderators', requireTmaAuth('moderators'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const admins = await TelegramMiddleware.getChatAdministrators(chatId);

    const formatted = admins.map(adm => {
      const customRole = db.getCustomRole(chatId, adm.user?.id || 0);
      let roleLabel = '🛡️ Administrator';
      if (adm.status === 'creator') roleLabel = '👑 Owner';
      else if (customRole === 'EXCEPTION_ADMIN') {
        roleLabel = '⚡ Exception Admin';
      } else if (customRole === 'MODERATOR') {
        roleLabel = '🔧 Moderator';
      }

      return {
        userId: adm.user?.id,
        user: adm.user,
        username: adm.user?.username,
        name: [adm.user?.first_name, adm.user?.last_name].filter(Boolean).join(' ') || `User ${adm.user?.id}`,
        status: adm.status,
        role: roleLabel,
        customTitle: adm.custom_title,
        customRole,
        permissions: {
          can_delete_messages: adm.can_delete_messages || false,
          can_restrict_members: adm.can_restrict_members || false,
          can_promote_members: adm.can_promote_members || false,
          can_pin_messages: adm.can_pin_messages || false
        }
      };
    });

    res.json({ ok: true, administrators: formatted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Assign custom role (MODERATOR, EXCEPTION_ADMIN, or NONE).
 * Regular group admin CANNOT change roles.
 * Only GROUP_OWNER can assign EXCEPTION_ADMIN.
 */
tmaRouter.post('/groups/:chatId/moderators/:userId/role', requireTmaAuth('moderators'), (req: AuthenticatedTmaRequest, res) => {
  try {
    // Only Owner and Exception Admin can assign roles; Regular Group Admin CANNOT
    if (req.tmaRole !== 'GROUP_OWNER' && req.tmaRole !== 'EXCEPTION_ADMIN') {
      return res.status(403).json({
        error: 'Forbidden: Regular group admins cannot assign custom roles or modify moderator assignments.',
        code: 'FORBIDDEN_ROLE_MODIFICATION'
      });
    }

    const chatId = req.tmaChatId!;
    const targetUserId = Number(req.params.userId);
    const { role } = req.body;

    if (!['MODERATOR', 'EXCEPTION_ADMIN', 'NONE'].includes(role)) {
      return res.status(400).json({ error: "Invalid role. Must be 'MODERATOR', 'EXCEPTION_ADMIN', or 'NONE'." });
    }

    // Only GROUP_OWNER can grant EXCEPTION_ADMIN
    if (role === 'EXCEPTION_ADMIN' && req.tmaRole !== 'GROUP_OWNER') {
      return res.status(403).json({
        error: 'Forbidden: Only the group owner can grant Exception Admin status.',
        code: 'OWNER_ONLY_ACTION'
      });
    }

    // Self-modification prevention: No user can modify their own role
    if (targetUserId === req.tmaUser!.id) {
      return res.status(403).json({
        error: 'Forbidden: You cannot modify your own administrative role.',
        code: 'SELF_MODIFICATION_FORBIDDEN'
      });
    }

    db.setCustomRole(chatId, targetUserId, role);
    res.json({ ok: true, userId: targetUserId, role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 14. Telegram Permissions Matrix (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/permissions', requireTmaAuth('permissions'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
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

tmaRouter.patch('/groups/:chatId/permissions', requireTmaAuth('permissions'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { permissions } = req.body;

    const tgRes = await telegramApi.setChatPermissions(chatId, permissions || {});
    if (!tgRes.ok) {
      return res.status(400).json({ ok: false, error: tgRes.description || 'Telegram rejected permissions update' });
    }

    res.json({ ok: true, result: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 15. Commands Catalog (Owner, Admin, Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/commands', requireTmaAuth('commands'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const categories: Record<string, any[]> = {};
    for (const cmd of COMMAND_CATALOG) {
      if (!categories[cmd.category]) {
        categories[cmd.category] = [];
      }
      categories[cmd.category].push({
        command: cmd.command,
        description: cmd.description,
        syntax: cmd.syntax,
        example: cmd.example,
        permission: cmd.permission
      });
    }
    res.json({ ok: true, total: COMMAND_CATALOG.length, categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 16. Schedules & Rules (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/schedules', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const groupSchedules = db.getGroupSchedules(chatId);
    const settings = db.getGroupSettings(chatId);
    res.json({ ok: true, schedules: groupSchedules, rules: settings.rules || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/schedules', requireTmaAuth('schedules'), async (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { name, message, scheduleType, intervalStr, nextRunDate, nextRunTime, timezone, contentType, mediaFileId } = req.body;

    if (!name || !message) {
      return res.status(400).json({ error: 'Name and message are required' });
    }

    const newSchedule = db.addSchedule({
      chatId,
      name,
      message,
      scheduleType: scheduleType || 'daily',
      intervalFormatted: intervalStr,
      nextRun: `${nextRunDate || new Date().toISOString().split('T')[0]}T${nextRunTime || '12:00'}:00.000Z`,
      timezone: timezone || 'UTC',
      contentType: contentType || 'text',
      mediaFileId,
      enabled: true
    });

    res.json({ ok: true, schedule: newSchedule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/schedules/:id/toggle', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const id = req.params.id;
    const schedule = db.getScheduleById(id);

    if (!schedule || schedule.chatId !== chatId) {
      return res.status(404).json({ error: 'Schedule not found in this group' });
    }

    const updated = db.toggleSchedule(id, req.body.enabled);
    res.json({ ok: true, schedule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/schedules/:id', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const id = req.params.id;
    const existing = db.getScheduleById(id);
    if (!existing || Number(existing.chatId) !== Number(chatId)) {
      return res.status(404).json({ error: 'Schedule not found for this group' });
    }

    const { name, message, scheduleType, intervalStr, nextRunDate, nextRunTime, timezone, contentType, mediaFileId, pinAfterSend, replyToLatest } = req.body;
    let nextRun: string | undefined = undefined;
    let intervalMs: number | undefined = undefined;
    let intervalFormatted: string | undefined = undefined;

    if (intervalStr && (scheduleType === 'interval' || !scheduleType)) {
      const parsed = parseScheduleTime(intervalStr);
      if (!('error' in parsed)) {
        nextRun = parsed.nextRunIso;
        intervalMs = parsed.intervalMs;
        intervalFormatted = parsed.intervalFormatted || intervalStr;
      } else {
        const altParsed = messageScheduler.parseInterval(intervalStr);
        if (altParsed) {
          intervalMs = altParsed.ms;
          intervalFormatted = altParsed.formatted;
          nextRun = new Date(Date.now() + altParsed.ms).toISOString();
        } else if (
          (intervalStr === existing.intervalFormatted || intervalStr === (existing as any).intervalStr || intervalStr === 'Custom') &&
          existing.intervalMs
        ) {
          intervalMs = existing.intervalMs;
          intervalFormatted = existing.intervalFormatted;
        } else {
          return res.status(400).json({
            error: 'Invalid schedule interval format. Try format like: 30m, 2h, 4 hours, or 1d.'
          });
        }
      }
    } else if (nextRunDate && nextRunTime) {
      const parsedDate = new Date(`${nextRunDate}T${nextRunTime}:00.000Z`);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ error: 'Invalid schedule date or time format.' });
      }
      nextRun = parsedDate.toISOString();
    }

    const updated = db.updateSchedule(id, {
      name: name !== undefined ? name : existing.name,
      message: message !== undefined ? message : existing.message,
      scheduleType: scheduleType || existing.scheduleType,
      ...(nextRun ? { nextRun } : {}),
      ...(intervalMs ? { intervalMs } : {}),
      ...(intervalFormatted ? { intervalFormatted } : {}),
      ...(contentType ? { contentType } : {}),
      ...(mediaFileId !== undefined ? { mediaFileId } : {}),
      ...(pinAfterSend !== undefined ? { pinAfterSend: Boolean(pinAfterSend) } : {}),
      ...(replyToLatest !== undefined ? { replyToLatest: Boolean(replyToLatest) } : {})
    });

    res.json({ ok: true, schedule: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/schedules/:id', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const id = req.params.id;
    const schedule = db.getScheduleById(id);

    if (!schedule || schedule.chatId !== chatId) {
      return res.status(404).json({ error: 'Schedule not found in this group' });
    }

    const success = db.deleteSchedule(id);
    res.json({ ok: success });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/schedules/:id/code', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const id = req.params.id;
    const schedule = db.getScheduleById(id);

    if (!schedule || Number(schedule.chatId) !== Number(chatId)) {
      return res.status(404).json({ error: 'Schedule not found for this group' });
    }

    const exportData = generateScheduleExportCode(schedule);
    res.json({ ok: true, schedule, ...exportData });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/rules', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { rules } = req.body;
    const updated = db.updateGroupSettings(chatId, { rules: String(rules || '') });
    res.json({ ok: true, rules: updated.rules });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/automations', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const automations = db.getAutomations(chatId);
    res.json({ ok: true, automations: automations || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/automations', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { trigger, action, parameters, enabled } = req.body;
    if (!trigger || !action) {
      return res.status(400).json({ error: 'Trigger and action are required.' });
    }
    const newAuto = {
      id: Math.random().toString(36).substring(2, 8).toUpperCase(),
      trigger,
      action,
      parameters: parameters || '',
      enabled: enabled !== false,
      createdBy: req.tmaUser!.id,
      createdAt: new Date().toISOString()
    };
    db.addAutomation(chatId, newAuto);
    res.json({ ok: true, automation: newAuto });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.put('/groups/:chatId/automations/:id', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const autoId = req.params.id;
    const { trigger, action, parameters, enabled } = req.body;

    const existingAutomations = db.getAutomations(chatId);
    const existing = existingAutomations.find((a: any) => a.id === autoId);
    if (!existing) {
      return res.status(404).json({ error: 'Automation rule not found in this group' });
    }

    const updated = db.updateAutomation(chatId, autoId, {
      ...(trigger !== undefined ? { trigger } : {}),
      ...(action !== undefined ? { action } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {})
    });

    res.json({ ok: true, automation: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.delete('/groups/:chatId/automations/:id', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const autoId = req.params.id;
    const deleted = db.deleteAutomation(chatId, autoId);
    res.json({ ok: Boolean(deleted) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/automations/:id/toggle', requireTmaAuth('schedules'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const autoId = req.params.id;
    const toggled = db.toggleAutomation(chatId, autoId, req.body.enabled);
    res.json({ ok: Boolean(toggled) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 17. Activity (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/activity', requireTmaAuth('activity'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const logs = db.getAuditLogs({ chatId, limit: 100 });
    res.json({ ok: true, logs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 18. Backup & Restore (Owner & Exception Admin)
// ==========================================

tmaRouter.get('/groups/:chatId/backup/export-json', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const backup = db.exportGroupFullBackup(chatId);
    const filename = `roxie_group_${Math.abs(chatId)}_backup_${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.json(backup);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/backup/export-csv', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const csv = db.exportGroupCSV(chatId);
    const filename = `roxie_group_${Math.abs(chatId)}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/backup/preview', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const { config } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration payload' });
    }
    res.json({
      ok: true,
      valid: true,
      version: config.version || 'unknown',
      sourceChatId: config.chatId,
      hasSettings: Boolean(config.settings),
      hasFilters: Boolean(config.filters),
      hasNotes: Boolean(config.notes)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/backup/import', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { config, selectedSections, overrideChatId } = req.body;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Invalid configuration payload' });
    }

    const result = db.importGroupFullBackup(
      chatId,
      config,
      selectedSections,
      Boolean(overrideChatId),
      req.tmaUser!.username || `User ${req.tmaUser!.id}`
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.get('/groups/:chatId/backup/history', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const history = db.listGroupSafetyBackups(chatId);
    res.json({ ok: true, history });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

tmaRouter.post('/groups/:chatId/backup/restore-history', requireTmaAuth('backup'), (req: AuthenticatedTmaRequest, res) => {
  try {
    const chatId = req.tmaChatId!;
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string') {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const success = db.restoreGroupSafetyBackup(chatId, filename, req.tmaUser!.username || `User ${req.tmaUser!.id}`);
    if (!success) {
      return res.status(400).json({ ok: false, error: 'Failed to restore safety snapshot file' });
    }

    res.json({ ok: true, message: `Successfully restored safety backup ${filename}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
