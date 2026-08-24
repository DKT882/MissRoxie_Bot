import fs from 'fs';
import path from 'path';
import { GroupSettings, WarningRecord, StickerFreeUser, ScheduledMessage, ModerationLog, CachedMember } from '../telegram/types.js';

interface DatabaseSchema {
  settings: Record<number, GroupSettings>;
  warnings: WarningRecord[];
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
        linksProtection: true,
        stickerProtection: true,
        warnLimit: 3,
        reportsEnabled: true,
        updatedAt: new Date().toISOString()
      };
      this.scheduleSave();
    } else if (chatTitle && this.data.settings[chatId].chatTitle !== chatTitle) {
      this.data.settings[chatId].chatTitle = chatTitle;
      this.scheduleSave();
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

  // --- Warnings System ---
  public addWarning(record: Omit<WarningRecord, 'id' | 'timestamp'>): { warning: WarningRecord; totalWarnings: number } {
    const newRecord: WarningRecord = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
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

  // --- Sticker Permissions (/free & /unfree) ---
  public isUserStickerFree(chatId: number, userId: number): boolean {
    return this.data.stickerFreeUsers.some((u) => u.chatId === chatId && u.userId === userId);
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

  public getStats() {
    const totalBans = this.data.logs.filter((l) => l.action === 'ban' || l.action === 'auto_ban').length;
    const totalKicks = this.data.logs.filter((l) => l.action === 'kick').length;
    const totalWarns = this.data.logs.filter((l) => l.action === 'warn').length;
    const totalDeletedLinks = this.data.logs.filter((l) => l.action === 'delete_link').length;
    const totalDeletedStickers = this.data.logs.filter((l) => l.action === 'delete_sticker').length;
    const totalReports = this.data.logs.filter((l) => l.action === 'report').length;
    const activeSchedules = this.data.schedules.length;
    const groupsCount = Object.keys(this.data.settings).length;

    return {
      totalBans,
      totalKicks,
      totalWarns,
      totalDeletedLinks,
      totalDeletedStickers,
      totalReports,
      activeSchedules,
      groupsCount
    };
  }
}

export const db = new StorageManager();
