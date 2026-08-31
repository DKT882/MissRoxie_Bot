import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { telegramBot } from './server/telegram.js';
import { db } from './server/db/storage.js';
import { COMMAND_CATALOG } from './server/telegram/commandCatalog.js';
import { enterpriseRouter } from './server/api/enterpriseRouter.js';
import { phase8Router } from './server/api/phase8Router.js';
import { DisasterRecoveryService } from './server/system/disasterRecovery.js';
import { HealthDiagnosticsService } from './server/observability/healthService.js';
import { telegramApi } from './server/telegram/api.js';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Startup recovery
  const startupResult = DisasterRecoveryService.startupRecovery();
  console.log('ROXIE STARTUP DIAGNOSTICS:', startupResult);

  app.use(express.json());
  app.use(enterpriseRouter);
  app.use(phase8Router);

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

  // 2. Overview metrics
  const handleOverview = (req: express.Request, res: express.Response) => {
    try {
      const stats = db.getStats();
      const recentLogs = db.getRecentLogs(50);
      const settings = (db as any).data?.settings || {};
      const groupsCount = Object.keys(settings).length;
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
      const settings = (db as any).data?.settings || {};
      const groups = Object.entries(settings).map(([chatIdStr, s]: [string, any]) => {
        const chatId = Number(chatIdStr);
        const groupLogs = db.getGroupLogs(chatId, 100);
        const bans = groupLogs.filter(l => l.action === 'ban' || l.action === 'auto_ban').length;
        const kicks = groupLogs.filter(l => l.action === 'kick').length;
        const mutes = groupLogs.filter(l => l.action === 'mute').length;
        const reports = groupLogs.filter(l => l.action === 'report').length;
        const schedules = db.getGroupSchedules(chatId).length;

        const isLeft = Boolean(s.botLeft);
        const status = isLeft ? 'Bot Left' : (s.linksProtection && s.stickerProtection ? 'Active' : 'Limited Permissions');

        return {
          chatId,
          chatTitle: s.chatTitle || `Group ${chatId}`,
          chatType: chatId < 0 ? 'supergroup' : 'private',
          username: s.username || undefined,
          memberCount: s.memberCount || 1,
          status,
          botRole: isLeft ? 'Left' : 'Administrator',
          protectionStatus: Boolean(s.protectionEnabled || s.stickerProtection || s.linksProtection),
          lustMode: Boolean(s.lustMode),
          botLeft: isLeft,
          stats: {
            bans,
            kicks,
            mutes,
            reports,
            schedules
          },
          settings: s
        };
      });
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

      res.json({
        chatId,
        chatTitle: settings.chatTitle || `Group ${chatId}`,
        settings,
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
        status: settings.botLeft ? 'Bot Left' : 'Active',
        botRole: settings.botLeft ? 'Left' : 'Administrator'
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

      res.json({ chatId, source, administrators: admins });
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

      const updated = db.updateGroupSettings(chatId, updates);

      // Detail specific frequency changes in audit log
      let changeSummary = Object.keys(updates).join(', ');
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

  // 9. Inspect and modify Telegram permissions
  app.get('/api/dashboard/groups/:chatId/permissions', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const meRes = await telegramApi.getMe();
      const botId = meRes.ok && meRes.result ? meRes.result.id : 0;
      let botMember: any = null;

      if (botId) {
        try {
          const memberRes = await telegramApi.getChatMember(chatId, botId);
          if (memberRes.ok) botMember = memberRes.result;
        } catch {}
      }

      let chatInfo: any = null;
      try {
        const cRes = await telegramApi.getChat(chatId);
        if (cRes.ok) chatInfo = cRes.result;
      } catch {}

      res.json({
        chatId,
        botUser: meRes.result,
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

  // 10. Leave Group
  app.post('/api/dashboard/groups/:chatId/leave', async (req, res) => {
    try {
      const chatId = Number(req.params.chatId);
      const { confirmation } = req.body;

      if (confirmation !== 'LEAVE') {
        return res.status(400).json({ error: 'Explicit confirmation "LEAVE" required to leave group.' });
      }

      const tgRes = await telegramApi.leaveChat(chatId);
      if (!tgRes.ok) {
        return res.status(400).json({ error: tgRes.description || 'Telegram API rejected leave request' });
      }

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
        details: `Roxie voluntarily left group ${chatId}`
      });

      res.json({ success: true, message: 'Roxie has successfully left the group.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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

  // 12. Send Message to Group or Private Chat
  app.post('/api/dashboard/send', async (req, res) => {
    try {
      const { targetType, targetId, message } = req.body;
      if (!targetId || !message || !message.trim()) {
        return res.status(400).json({ error: 'Target ID and non-empty message are required.' });
      }

      const tgRes = await telegramApi.sendMessage(targetId, message.trim(), { parse_mode: 'HTML' });
      if (!tgRes.ok) {
        return res.status(400).json({ error: tgRes.description || 'Telegram failed to send message.' });
      }

      const numTargetId = Number(targetId);
      if (numTargetId > 0) {
        db.addPrivateMessage(numTargetId, numTargetId, {
          role: 'assistant',
          content: message.trim(),
          timestamp: Date.now(),
          direction: 'out'
        });
      } else {
        db.addGroupConversationEntry(numTargetId, {
          role: 'assistant',
          name: 'Roxie',
          content: message.trim(),
          timestamp: Date.now()
        });
      }

      db.logAction({
        id: Math.random().toString(36).slice(2, 9),
        timestamp: new Date().toISOString(),
        chatId: numTargetId,
        groupId: numTargetId,
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'send_message',
        action: 'send_message',
        result: 'success',
        details: `Sent direct message to ${targetType || 'target'} ${targetId}`
      });

      res.json({ success: true, messageId: tgRes.result?.message_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. Broadcast announcement to multiple groups
  app.post('/api/dashboard/broadcast', async (req, res) => {
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
        actorRole: 'DASHBOARD_ADMIN',
        adminUsername: 'dashboard_admin',
        command: 'broadcast',
        action: 'broadcast',
        result: failed.length === 0 ? 'success' : 'denied',
        details: `Broadcast: ${successful.length} sent, ${failed.length} failed`
      });

      res.json({
        total: groupIds.length,
        sent: successful.length,
        failed: failed.length,
        successful,
        errors: failed
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

  // Automatically initiate bot polling if TELEGRAM_BOT_TOKEN is present
  if (process.env.TELEGRAM_BOT_TOKEN?.trim()) {
    telegramBot.startPolling().catch((err) => {
      console.error('Failed to start Telegram bot polling:', err.message);
    });
  }

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Starting graceful shutdown sequence...`);
    try {
      telegramBot.stopPolling();
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

startServer();
