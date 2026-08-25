import fs from 'fs';
import path from 'path';
import { GroupSettings, WarningRecord, StickerFreeUser, ScheduledMessage, ModerationLog, CachedMember, TrackedChatMessage, TempActionRecord } from '../telegram/types.js';

interface DatabaseSchema {
  settings: Record<number, GroupSettings>;
  warnings: WarningRecord[];
  tempActions: TempActionRecord[];
  stickerFreeUsers: StickerFreeUser[];
  schedules: ScheduledMessage[];
  logs: ModerationLog[];
  knownUsers: Record<string, CachedMember>; // username (lowercase) -> CachedMember
  knownUsersById: Record<number, CachedMember>; // userId -> CachedMember
  groupMembers: Record<string, CachedMember>; // `${chatId}_${userId}` -> CachedMember
  customRoles: Record<string, 'MODERATOR' | 'NONE'>; // `${chatId}_${userId}` -> Custom bot role
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'bot_storage.json');

class StorageManager {
  private data: DatabaseSchema = {
    settings: {},
    warnings: [],
    tempActions: [],
    stickerFreeUsers: [],
    schedules: [],
    logs: [],
    knownUsers: {},
    knownUsersById: {},
    groupMembers: {},
    customRoles: {}
  };
  private isLoaded: boolean = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        if (raw) {
          const parsed = JSON.parse(raw);
          this.data = {
            settings: parsed.settings || {},
            warnings: parsed.warnings || [],
            tempActions: parsed.tempActions || [],
            stickerFreeUsers: parsed.stickerFreeUsers || [],
            schedules: parsed.schedules || [],
            logs: parsed.logs || [],
            knownUsers: parsed.knownUsers || {},
            knownUsersById: parsed.knownUsersById || {},
            groupMembers: parsed.groupMembers || {},
            customRoles: parsed.customRoles || {}
          };
        }
      }
    } catch (err) {
      console.error('Failed to initialize local bot storage:', err);
    }
    this.isLoaded = true;
  }

  private scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persist();
    }, 300);
  }

  private persist() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error persisting database:', err);
    }
  }

  // --- User Caching (for resolving @username to userId and vice-versa) ---
  public cacheUser(
    user: { id: number; username?: string; first_name?: string; last_name?: string },
    groupId?: number
  ): CachedMember | null {
    if (!user || !user.id || user.id === 1087968824 || user.id === 0) return null;

    const now = new Date().toISOString();
    const customRole = groupId ? this.getCustomRole(groupId, user.id) : undefined;

    const cached: CachedMember = {
      userId: user.id,
      username: user.username,
      firstName: user.first_name || '',
      lastName: user.last_name || undefined,
      groupId: groupId || undefined,
      lastSeen: now,
      customRole: customRole !== 'NONE' ? customRole : undefined
    };

    if (!this.data.knownUsersById) {
      this.data.knownUsersById = {};
    }
    if (!this.data.knownUsers) {
      this.data.knownUsers = {};
    }
    if (!this.data.groupMembers) {
      this.data.groupMembers = {};
    }

    // Update by ID
    this.data.knownUsersById[user.id] = {
      ...this.data.knownUsersById[user.id],
      ...cached
    };

    // If username changed, update or clean old entry
    if (user.username) {
      const uname = user.username.toLowerCase().replace(/^@/, '');
      
      // Clean up previous holder of this username in global knownUsers & groupMembers
      for (const [idStr, u] of Object.entries(this.data.knownUsersById)) {
        if (u.userId !== user.id && u.username && u.username.toLowerCase() === uname) {
          delete u.username;
        }
      }
      if (groupId) {
        for (const [key, m] of Object.entries(this.data.groupMembers)) {
          if (key.startsWith(`${groupId}_`) && m.userId !== user.id && m.username && m.username.toLowerCase() === uname) {
            delete m.username;
          }
        }
      }

      this.data.knownUsers[uname] = cached;
    }

    // Update group-specific member entry
    if (groupId) {
      const groupKey = `${groupId}_${user.id}`;
      this.data.groupMembers[groupKey] = cached;
    }

    this.scheduleSave();
    return cached;
  }

  // Alias for backward compatibility
  public registerUser(
    user: { id: number; username?: string; first_name?: string; last_name?: string },
    groupId?: number
  ) {
    return this.cacheUser(user, groupId);
  }

  public findUserByUsername(username: string, groupId?: number): CachedMember | null {
    if (!username) return null;
    const uname = username.toLowerCase().replace(/^@/, '').trim();

    // 1. Check if user is in group index, prioritizing most recent lastSeen
    if (groupId && this.data.groupMembers) {
      const candidates: CachedMember[] = [];
      for (const [key, member] of Object.entries(this.data.groupMembers)) {
        if (key.startsWith(`${groupId}_`) && member.username && member.username.toLowerCase() === uname) {
          candidates.push(member);
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        return candidates[0];
      }
    }

    // 2. Check global knownUsers by username
    if (this.data.knownUsers && this.data.knownUsers[uname]) {
      return this.data.knownUsers[uname];
    }

    // 3. Search in knownUsersById, prioritizing most recent lastSeen
    if (this.data.knownUsersById) {
      const candidates: CachedMember[] = [];
      for (const u of Object.values(this.data.knownUsersById)) {
        if (u.username && u.username.toLowerCase() === uname) {
          candidates.push(u);
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        return candidates[0];
      }
    }

    return null;
  }

  public findUserById(userId: number, groupId?: number): CachedMember | null {
    if (!userId || userId === 0) return null;

    if (groupId && this.data.groupMembers) {
      const key = `${groupId}_${userId}`;
      if (this.data.groupMembers[key]) {
        return this.data.groupMembers[key];
      }
    }

    if (this.data.knownUsersById && this.data.knownUsersById[userId]) {
      return this.data.knownUsersById[userId];
    }

    if (this.data.knownUsers) {
      for (const u of Object.values(this.data.knownUsers)) {
        if (u.userId === userId) {
          return u;
        }
      }
    }

    return null;
  }

  // --- Custom Roles & Tags (Mod-1, etc.) ---
  public setCustomRole(chatId: number, userId: number, role: 'MODERATOR' | 'NONE') {
    if (!this.data.customRoles) {
      this.data.customRoles = {};
    }
    const key = `${chatId}_${userId}`;
    if (role === 'NONE') {
      delete this.data.customRoles[key];
    } else {
      this.data.customRoles[key] = role;
    }
    this.scheduleSave();
  }

  public getCustomRole(chatId: number, userId: number): 'MODERATOR' | 'NONE' {
    if (!this.data.customRoles) return 'NONE';
    return this.data.customRoles[`${chatId}_${userId}`] || 'NONE';
  }

  // --- Group Settings ---
  public getGroupSettings(chatId: number, chatTitle?: string): GroupSettings {
    if (!this.data.settings[chatId]) {
      this.data.settings[chatId] = {
        chatId,
        chatTitle: chatTitle || undefined,
        warnLimit: 3,
        warnAction: 'ban',
        floodEnabled: false,
        floodCount: 8,
        floodWindow: 5,
        floodAction: 'mute',
        linksProtection: true,
        linksWhitelist: [],
        mediaProtection: true,
        stickerProtection: true,
        gifsProtection: false,
        videosProtection: false,
        photosProtection: false,
        voiceProtection: false,
        audioProtection: false,
        locks: {},
        filters: {},
        welcomeEnabled: false,
        welcomeMessage: 'Welcome {user} to {chat}!',
        goodbyeEnabled: false,
        goodbyeMessage: 'Goodbye {user}!',
        slowModeSeconds: 0,
        reportsEnabled: true,
        updatedAt: new Date().toISOString()
      };
      this.scheduleSave();
    } else {
      const s = this.data.settings[chatId];
      let needsSave = false;
      // Ensure all phase 2 fields are populated if loaded from older format
      if (s.warnAction === undefined) { s.warnAction = 'ban'; needsSave = true; }
      if (s.floodEnabled === undefined) { s.floodEnabled = false; needsSave = true; }
      if (s.floodCount === undefined) { s.floodCount = 8; needsSave = true; }
      if (s.floodWindow === undefined) { s.floodWindow = 5; needsSave = true; }
      if (s.floodAction === undefined) { s.floodAction = 'mute'; needsSave = true; }
      if (!Array.isArray(s.linksWhitelist)) { s.linksWhitelist = []; needsSave = true; }
      if (s.gifsProtection === undefined) { s.gifsProtection = false; needsSave = true; }
      if (s.videosProtection === undefined) { s.videosProtection = false; needsSave = true; }
      if (s.photosProtection === undefined) { s.photosProtection = false; needsSave = true; }
      if (s.voiceProtection === undefined) { s.voiceProtection = false; needsSave = true; }
      if (s.audioProtection === undefined) { s.audioProtection = false; needsSave = true; }
      if (!s.locks || typeof s.locks !== 'object') { s.locks = {}; needsSave = true; }
      if (!s.filters || typeof s.filters !== 'object') { s.filters = {}; needsSave = true; }
      if (s.welcomeEnabled === undefined) { s.welcomeEnabled = false; needsSave = true; }
      if (!s.welcomeMessage) { s.welcomeMessage = 'Welcome {user} to {chat}!'; needsSave = true; }
      if (s.goodbyeEnabled === undefined) { s.goodbyeEnabled = false; needsSave = true; }
      if (!s.goodbyeMessage) { s.goodbyeMessage = 'Goodbye {user}!'; needsSave = true; }
      if (s.slowModeSeconds === undefined) { s.slowModeSeconds = 0; needsSave = true; }

      if (chatTitle && s.chatTitle !== chatTitle) {
        s.chatTitle = chatTitle;
        needsSave = true;
      }
      if (needsSave) {
        this.scheduleSave();
      }
    }
    return this.data.settings[chatId];
  }

  public updateGroupSettings(chatId: number, updates: Partial<GroupSettings>): GroupSettings {
    const current = this.getGroupSettings(chatId);
    const updated = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.data.settings[chatId] = updated;
    this.scheduleSave();
    return updated;
  }

  // --- Links Whitelist ---
  public addLinkWhitelist(chatId: number, domain: string): string[] {
    const s = this.getGroupSettings(chatId);
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim();
    if (!cleanDomain) return s.linksWhitelist;

    if (!s.linksWhitelist.includes(cleanDomain)) {
      s.linksWhitelist.push(cleanDomain);
      this.updateGroupSettings(chatId, { linksWhitelist: s.linksWhitelist });
    }
    return s.linksWhitelist;
  }

  public removeLinkWhitelist(chatId: number, domain: string): boolean {
    const s = this.getGroupSettings(chatId);
    const cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, '').trim();
    const initialLen = s.linksWhitelist.length;
    s.linksWhitelist = s.linksWhitelist.filter((d) => d !== cleanDomain);
    if (s.linksWhitelist.length !== initialLen) {
      this.updateGroupSettings(chatId, { linksWhitelist: s.linksWhitelist });
      return true;
    }
    return false;
  }

  public getLinkWhitelist(chatId: number): string[] {
    return this.getGroupSettings(chatId).linksWhitelist || [];
  }

  // --- Locks Management ---
  public setLock(chatId: number, lockType: string, locked: boolean): Record<string, boolean> {
    const s = this.getGroupSettings(chatId);
    const locks = { ...s.locks, [lockType.toLowerCase()]: locked };
    this.updateGroupSettings(chatId, { locks });
    return locks;
  }

  public getLocks(chatId: number): Record<string, boolean> {
    return this.getGroupSettings(chatId).locks || {};
  }

  public isLocked(chatId: number, lockType: string): boolean {
    const locks = this.getLocks(chatId);
    return Boolean(locks[lockType.toLowerCase()]);
  }

  // --- Custom Text Filters ---
  public setFilter(chatId: number, keyword: string, replyText: string = ''): Record<string, string> {
    const s = this.getGroupSettings(chatId);
    const key = keyword.toLowerCase().trim();
    const filters = { ...s.filters, [key]: replyText };
    this.updateGroupSettings(chatId, { filters });
    return filters;
  }

  public removeFilter(chatId: number, keyword: string): boolean {
    const s = this.getGroupSettings(chatId);
    const key = keyword.toLowerCase().trim();
    if (s.filters && s.filters[key] !== undefined) {
      const filters = { ...s.filters };
      delete filters[key];
      this.updateGroupSettings(chatId, { filters });
      return true;
    }
    return false;
  }

  public getFilters(chatId: number): Record<string, string> {
    return this.getGroupSettings(chatId).filters || {};
  }

  // --- Warnings System ---
  public addWarning(record: Omit<WarningRecord, 'id' | 'timestamp' | 'count'>): { warning: WarningRecord; totalWarnings: number } {
    const existing = this.getUserWarnings(record.chatId, record.userId);
    const count = existing.length + 1;

    const newRecord: WarningRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      count,
      ...record
    };
    this.data.warnings.push(newRecord);
    this.scheduleSave();

    const totalWarnings = this.getUserWarnings(record.chatId, record.userId).length;
    return { warning: newRecord, totalWarnings };
  }

  public getUserWarnings(chatId: number, userId: number): WarningRecord[] {
    return this.data.warnings.filter((w) => w.chatId === chatId && w.userId === userId);
  }

  public resetUserWarnings(chatId: number, userId: number): number {
    const initialCount = this.data.warnings.length;
    this.data.warnings = this.data.warnings.filter((w) => !(w.chatId === chatId && w.userId === userId));
    const removed = initialCount - this.data.warnings.length;
    this.scheduleSave();
    return removed;
  }

  // --- Temporary Moderation Actions (tmute & tban) ---
  public addTempAction(record: Omit<TempActionRecord, 'id' | 'createdAt'>): TempActionRecord {
    // Remove any existing pending temp action for this same user/chat/action
    this.removeTempAction(record.chatId, record.userId, record.action);

    const newRecord: TempActionRecord = {
      id: Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      ...record
    };

    if (!this.data.tempActions) {
      this.data.tempActions = [];
    }

    this.data.tempActions.push(newRecord);
    this.scheduleSave();
    return newRecord;
  }

  public removeTempAction(chatId: number, userId: number, action?: 'tmute' | 'tban'): boolean {
    if (!this.data.tempActions) return false;
    const initialCount = this.data.tempActions.length;
    this.data.tempActions = this.data.tempActions.filter(
      (a) => !(a.chatId === chatId && a.userId === userId && (!action || a.action === action))
    );
    const removed = initialCount > this.data.tempActions.length;
    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  public getActiveTempActions(chatId?: number): TempActionRecord[] {
    if (!this.data.tempActions) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    return this.data.tempActions.filter(
      (a) => (!chatId || a.chatId === chatId) && a.expiresAt > nowSec
    );
  }

  public getExpiredTempActions(): TempActionRecord[] {
    if (!this.data.tempActions) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    return this.data.tempActions.filter((a) => a.expiresAt <= nowSec);
  }

  public getTempAction(chatId: number, userId: number, action?: 'tmute' | 'tban'): TempActionRecord | undefined {
    if (!this.data.tempActions) return undefined;
    return this.data.tempActions.find(
      (a) => a.chatId === chatId && a.userId === userId && (!action || a.action === action)
    );
  }

  // --- Media & Sticker Permissions (/free & /unfree) ---
  public isUserStickerFree(chatId: number, userId: number): boolean {
    return this.data.stickerFreeUsers.some((u) => u.chatId === chatId && u.userId === userId);
  }

  public isUserMediaFree(chatId: number, userId: number): boolean {
    return this.isUserStickerFree(chatId, userId);
  }

  public grantStickerPermission(chatId: number, userId: number, grantedBy: number, username?: string): void {
    if (!this.isUserStickerFree(chatId, userId)) {
      this.data.stickerFreeUsers.push({
        chatId,
        userId,
        username,
        grantedBy,
        grantedAt: new Date().toISOString()
      });
      this.scheduleSave();
    }
  }

  public grantMediaPermission(chatId: number, userId: number, grantedBy: number, username?: string): void {
    this.grantStickerPermission(chatId, userId, grantedBy, username);
  }

  public revokeStickerPermission(chatId: number, userId: number): boolean {
    const initialCount = this.data.stickerFreeUsers.length;
    this.data.stickerFreeUsers = this.data.stickerFreeUsers.filter(
      (u) => !(u.chatId === chatId && u.userId === userId)
    );
    const removed = initialCount > this.data.stickerFreeUsers.length;
    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  public revokeMediaPermission(chatId: number, userId: number): boolean {
    return this.revokeStickerPermission(chatId, userId);
  }

  public getFreedUsers(chatId: number): StickerFreeUser[] {
    return this.data.stickerFreeUsers.filter((u) => u.chatId === chatId);
  }

  // --- Scheduled Messages ---
  public getAllSchedules(): ScheduledMessage[] {
    return [...this.data.schedules];
  }

  public getGroupSchedules(chatId: number): ScheduledMessage[] {
    return this.data.schedules.filter((s) => s.chatId === chatId);
  }

  public addSchedule(schedule: Omit<ScheduledMessage, 'id' | 'createdAt' | 'runsCount'>): ScheduledMessage {
    const newSchedule: ScheduledMessage = {
      id: Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
      runsCount: 0,
      ...schedule
    };
    this.data.schedules.push(newSchedule);
    this.scheduleSave();
    return newSchedule;
  }

  public deleteSchedule(chatId: number, scheduleId: string): boolean {
    const initial = this.data.schedules.length;
    this.data.schedules = this.data.schedules.filter(
      (s) => !(s.chatId === chatId && s.id.toUpperCase() === scheduleId.toUpperCase())
    );
    const changed = initial > this.data.schedules.length;
    if (changed) {
      this.scheduleSave();
    }
    return changed;
  }

  public updateScheduleNextRun(id: string, nextRun: string): void {
    const s = this.data.schedules.find((x) => x.id === id);
    if (s) {
      s.nextRun = nextRun;
      s.runsCount = (s.runsCount || 0) + 1;
      this.scheduleSave();
    }
  }

  // --- Moderation Logs ---
  public addLog(log: Omit<ModerationLog, 'id' | 'timestamp'>): ModerationLog {
    const entry: ModerationLog = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...log
    };
    this.data.logs.push(entry);
    // Keep max 200 logs
    if (this.data.logs.length > 200) {
      this.data.logs.shift();
    }
    this.scheduleSave();
    return entry;
  }

  public getRecentLogs(limit: number = 30): ModerationLog[] {
    return this.data.logs.slice(-limit);
  }

  public getGroupLogs(chatId: number, limit: number = 20): ModerationLog[] {
    return this.data.logs
      .filter((l) => l.chatId === chatId)
      .slice(-limit)
      .reverse(); // Most recent first
  }

  // --- Chat Message Tracking for /clear ---
  private trackedMessages: Record<number, TrackedChatMessage[]> = {};

  public trackMessage(chatId: number, messageId: number, date: number, userId?: number): void {
    if (!chatId || !messageId) return;
    if (!this.trackedMessages[chatId]) {
      this.trackedMessages[chatId] = [];
    }

    const list = this.trackedMessages[chatId];
    // Check if already tracked
    if (list.some((m) => m.messageId === messageId)) return;

    list.push({
      messageId,
      chatId,
      date: date || Math.floor(Date.now() / 1000),
      userId
    });

    // Prune messages older than 48 hours (Telegram deletion limit) and cap at 1000 messages
    const cutoff48h = Math.floor(Date.now() / 1000) - 48 * 3600;
    this.trackedMessages[chatId] = list
      .filter((m) => m.date >= cutoff48h)
      .slice(-1000);
  }

  public untrackMessages(chatId: number, messageIds: number[]): void {
    if (!this.trackedMessages[chatId] || !messageIds || messageIds.length === 0) return;
    const idSet = new Set(messageIds);
    this.trackedMessages[chatId] = this.trackedMessages[chatId].filter((m) => !idSet.has(m.messageId));
  }

  public getTrackedMessages(chatId: number): TrackedChatMessage[] {
    return this.trackedMessages[chatId] || [];
  }

  public getMessagesByDuration(chatId: number, durationSeconds: number, upToMessageId?: number): number[] {
    const list = this.trackedMessages[chatId] || [];
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff = nowSec - durationSeconds;

    const matchedIds: number[] = [];
    for (const m of list) {
      if (m.date >= cutoff && (!upToMessageId || m.messageId <= upToMessageId)) {
        matchedIds.push(m.messageId);
      }
    }

    // Always include upToMessageId if provided
    if (upToMessageId && !matchedIds.includes(upToMessageId)) {
      matchedIds.push(upToMessageId);
    }

    return Array.from(new Set(matchedIds)).sort((a, b) => a - b);
  }

  public getMessagesByCount(chatId: number, count: number, upToMessageId?: number): number[] {
    const list = (this.trackedMessages[chatId] || [])
      .filter((m) => !upToMessageId || m.messageId <= upToMessageId);

    const idsFromBuffer = list.slice(-count).map((m) => m.messageId);
    const result = new Set<number>(idsFromBuffer);

    // If upToMessageId is present and buffer has fewer than count, scan sequential previous IDs
    if (upToMessageId) {
      result.add(upToMessageId);
      let currentId = upToMessageId - 1;
      while (result.size < count && currentId > 0 && (upToMessageId - currentId) <= count) {
        result.add(currentId);
        currentId--;
      }
    }

    return Array.from(result).sort((a, b) => a - b);
  }

  public getMessagesInRange(chatId: number, fromMessageId: number, toMessageId: number): number[] {
    const minId = Math.min(fromMessageId, toMessageId);
    const maxId = Math.max(fromMessageId, toMessageId);

    const result: number[] = [];
    for (let id = minId; id <= maxId; id++) {
      result.push(id);
    }
    return result;
  }

  public getMessagesByUser(chatId: number, userId: number, upToMessageId?: number, maxCount: number = 100): number[] {
    const list = this.trackedMessages[chatId] || [];
    const matchedIds = list
      .filter((m) => m.userId === userId && (!upToMessageId || m.messageId <= upToMessageId))
      .map((m) => m.messageId);

    return matchedIds.slice(-maxCount).sort((a, b) => a - b);
  }

  public getAllTrackedMessagesToClear(chatId: number, upToMessageId?: number, maxCount: number = 100): number[] {
    const list = this.trackedMessages[chatId] || [];
    const ids = list
      .filter((m) => !upToMessageId || m.messageId <= upToMessageId)
      .map((m) => m.messageId);

    const result = new Set<number>(ids.slice(-maxCount));

    if (upToMessageId) {
      result.add(upToMessageId);
      // If buffer is relatively empty, generate sequential IDs back up to maxCount
      if (result.size < maxCount) {
        let curr = upToMessageId - 1;
        const targetSize = Math.min(maxCount, 50);
        while (result.size < targetSize && curr > 0 && (upToMessageId - curr) <= targetSize) {
          result.add(curr);
          curr--;
        }
      }
    }

    return Array.from(result).sort((a, b) => a - b);
  }

  public getStats() {
    const totalBans = this.data.logs.filter((l) => l.action === 'ban' || l.action === 'auto_ban').length;
    const totalKicks = this.data.logs.filter((l) => l.action === 'kick').length;
    const totalWarns = this.data.logs.filter((l) => l.action === 'warn').length;
    const totalDeletedLinks = this.data.logs.filter((l) => l.action === 'delete_link').length;
    const totalDeletedStickers = this.data.logs.filter((l) => l.action === 'delete_sticker').length;
    const totalDeletedImages = this.data.logs.filter((l) => l.action === 'delete_image' || l.action === 'delete_media').length;
    const totalReports = this.data.logs.filter((l) => l.action === 'report').length;
    const activeSchedules = this.data.schedules.length;
    const groupsCount = Object.keys(this.data.settings).length;

    return {
      totalBans,
      totalKicks,
      totalWarns,
      totalDeletedLinks,
      totalDeletedStickers,
      totalDeletedImages,
      totalReports,
      activeSchedules,
      groupsCount
    };
  }
}

export const db = new StorageManager();
