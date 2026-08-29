import fs from 'fs';
import path from 'path';
import { GroupSettings, WarningRecord, StickerFreeUser, ContentType, ContentPermissionRecord, ScheduledMessage, ModerationLog, CachedMember, TrackedChatMessage, TempActionRecord, NoteRecord, ApprovedUserRecord, CaptchaSession } from '../telegram/types.js';

interface RaidStateRecord {
  recentJoins: number[];
  isRaidModeActive: boolean;
  raidActiveUntil: number;
}

export interface StickerMetaRecord {
  packName?: string;
  packTitle?: string;
  fileId: string;
  emoji?: string;
  mood: string;
  addedBy?: number;
  addedAt: string;
}

export interface MediaLibraryRecord {
  stickers: Record<string, string[]>;
  animations: Record<string, string[]>;
  stickerMetadata?: Record<string, StickerMetaRecord>;
}

export interface UserMemoryRecord {
  chatId: number | string;
  userId: number;
  facts: string[];
  lastUpdated: number;
}

export function isSensitiveData(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  const sensitiveKeywords = [
    'password', 'passwd', 'pwd', 'api_key', 'apikey', 'secret', 'token', 'bearer',
    'credit card', 'debit card', 'cvv', 'bank account', 'ifsc', 'pin', 'ssn',
    'aadhar', 'pan card', 'passport', 'sk-', 'ghp_', 'otp'
  ];
  if (sensitiveKeywords.some(kw => lower.includes(kw))) return true;
  if (/sk-[a-zA-Z0-9]{20,}/i.test(text) || /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/.test(text)) return true;
  return false;
}

interface DatabaseSchema {
  settings: Record<number, GroupSettings>;
  warnings: WarningRecord[];
  tempActions: TempActionRecord[];
  stickerFreeUsers: StickerFreeUser[];
  contentPermissions: Record<string, ContentPermissionRecord>;
  notes: Record<string, NoteRecord>; // `${chatId}_${notename}` -> NoteRecord
  approvedUsers: Record<string, ApprovedUserRecord>; // `${chatId}_${userId}` -> ApprovedUserRecord
  captchaSessions: CaptchaSession[];
  schedules: ScheduledMessage[];
  logs: ModerationLog[];
  knownUsers: Record<string, CachedMember>; // username (lowercase) -> CachedMember
  knownUsersById: Record<number, CachedMember>; // userId -> CachedMember
  groupMembers: Record<string, CachedMember>; // `${chatId}_${userId}` -> CachedMember
  customRoles: Record<string, 'MODERATOR' | 'NONE'>; // `${chatId}_${userId}` -> Custom bot role
  mediaLibrary?: MediaLibraryRecord;
  userMemories?: Record<string, UserMemoryRecord>; // `${chatId}_${userId}` -> UserMemoryRecord
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'bot_storage.json');

class StorageManager {
  private data: DatabaseSchema = {
    settings: {},
    warnings: [],
    tempActions: [],
    stickerFreeUsers: [],
    contentPermissions: {},
    notes: {},
    approvedUsers: {},
    captchaSessions: [],
    schedules: [],
    logs: [],
    knownUsers: {},
    knownUsersById: {},
    groupMembers: {},
    customRoles: {},
    mediaLibrary: { stickers: {}, animations: {} }
  };
  private raidStates: Record<number, RaidStateRecord> = {};
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
            contentPermissions: parsed.contentPermissions || {},
            notes: parsed.notes || {},
            approvedUsers: parsed.approvedUsers || {},
            captchaSessions: parsed.captchaSessions || [],
            schedules: parsed.schedules || [],
            logs: parsed.logs || [],
            knownUsers: parsed.knownUsers || {},
            knownUsersById: parsed.knownUsersById || {},
            groupMembers: parsed.groupMembers || {},
            customRoles: parsed.customRoles || {},
            mediaLibrary: parsed.mediaLibrary || { stickers: {}, animations: {} },
            userMemories: parsed.userMemories || {}
          };
        }
      }
    } catch (err) {
      console.error('Failed to initialize local bot storage:', err);
    }
    this.cleanOldLogs();
    this.cleanExpiredMemories();
    this.isLoaded = true;
  }

  public scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persist();
    }, 300);
  }

  private persist() {
    this.cleanOldLogs();
    this.cleanExpiredMemories();
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
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
        warnExpireSeconds: 0,
        floodEnabled: false,
        floodCount: 8,
        floodWindow: 5,
        floodAction: 'mute',
        raidEnabled: false,
        raidLimit: 8,
        raidWindow: 30,
        raidAction: 'kick',
        raidDuration: 300,
        captchaEnabled: false,
        captchaMode: 'button',
        captchaTimeout: 120,
        captchaAction: 'kick',
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
        autoDeleteJoinLeave: false,
        slowModeSeconds: 0,
        reportsEnabled: true,
        chatbotEnabled: true,
        chatbotMode: 'auto',
        reactionEnabled: true,
        reactionProbability: 0.15,
        stopSpamEnabled: false,
        stopAbusiveEnabled: false,
        stopPromotionEnabled: false,
        gifProtection: false,
        linkProtection: true,
        imageProtection: false,
        fileProtection: false,
        customAbusiveWords: [],
        automodEnabled: false,
        mediaAction: 'delete',
        warnEscalation: [],
        securityEnabled: false,
        joinmode: 'normal',
        autoAcceptEnabled: false,
        automations: [],
        rules: '',
        lastAllTimestamp: 0,
        protectionEnabled: true,
        protectionFloodCount: 5,
        protectionFloodWindow: 5,
        protectionDuplicateLimit: 3,
        protectionLinkBurstLimit: 3,
        updatedAt: new Date().toISOString()
      };
      this.scheduleSave();
    } else {
      const s = this.data.settings[chatId];
      let needsSave = false;
      // Ensure all phase 2 & 3 fields are populated if loaded from older format
      if (s.warnAction === undefined) { s.warnAction = 'ban'; needsSave = true; }
      if (s.warnExpireSeconds === undefined) { s.warnExpireSeconds = 0; needsSave = true; }
      if (s.floodEnabled === undefined) { s.floodEnabled = false; needsSave = true; }
      if (s.floodCount === undefined) { s.floodCount = 8; needsSave = true; }
      if (s.floodWindow === undefined) { s.floodWindow = 5; needsSave = true; }
      if (s.floodAction === undefined) { s.floodAction = 'mute'; needsSave = true; }
      if (s.raidEnabled === undefined) { s.raidEnabled = false; needsSave = true; }
      if (s.raidLimit === undefined) { s.raidLimit = 8; needsSave = true; }
      if (s.raidWindow === undefined) { s.raidWindow = 30; needsSave = true; }
      if (s.raidAction === undefined) { s.raidAction = 'kick'; needsSave = true; }
      if (s.raidDuration === undefined) { s.raidDuration = 300; needsSave = true; }
      if (s.captchaEnabled === undefined) { s.captchaEnabled = false; needsSave = true; }
      if (s.captchaMode === undefined) { s.captchaMode = 'button'; needsSave = true; }
      if (s.captchaTimeout === undefined) { s.captchaTimeout = 120; needsSave = true; }
      if (s.captchaAction === undefined) { s.captchaAction = 'kick'; needsSave = true; }
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
      if (s.automodEnabled === undefined) { s.automodEnabled = false; needsSave = true; }
      if (s.mediaAction === undefined) { s.mediaAction = 'delete'; needsSave = true; }
      if (!Array.isArray(s.warnEscalation)) { s.warnEscalation = []; needsSave = true; }
      if (s.securityEnabled === undefined) { s.securityEnabled = false; needsSave = true; }
      if (s.joinmode === undefined) { s.joinmode = 'normal'; needsSave = true; }
      if (s.autoAcceptEnabled === undefined) { s.autoAcceptEnabled = false; needsSave = true; }
      if (!Array.isArray(s.automations)) { s.automations = []; needsSave = true; }
      if (s.rules === undefined) { s.rules = ''; needsSave = true; }
      if (s.lastAllTimestamp === undefined) { s.lastAllTimestamp = 0; needsSave = true; }
      if (s.chatbotEnabled === undefined) { s.chatbotEnabled = true; needsSave = true; }
      if (s.chatbotMode === undefined) { s.chatbotMode = 'auto'; needsSave = true; }
      if (s.protectionEnabled === undefined) { s.protectionEnabled = true; needsSave = true; }
      if (s.protectionFloodCount === undefined) { s.protectionFloodCount = 5; needsSave = true; }
      if (s.protectionFloodWindow === undefined) { s.protectionFloodWindow = 5; needsSave = true; }
      if (s.protectionDuplicateLimit === undefined) { s.protectionDuplicateLimit = 3; needsSave = true; }
      if (s.protectionLinkBurstLimit === undefined) { s.protectionLinkBurstLimit = 3; needsSave = true; }

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

  public clearAllFilters(chatId: number): number {
    const s = this.getGroupSettings(chatId);
    const count = Object.keys(s.filters || {}).length;
    this.updateGroupSettings(chatId, { filters: {} });
    return count;
  }

  // --- Custom Abusive Words ---
  public getCustomAbusiveWords(chatId: number): string[] {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.customAbusiveWords)) {
      s.customAbusiveWords = [];
    }
    return s.customAbusiveWords;
  }

  public addCustomAbusiveWord(chatId: number, word: string): void {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.customAbusiveWords)) s.customAbusiveWords = [];
    const trimmed = word.trim().toLowerCase();
    if (trimmed && !s.customAbusiveWords.includes(trimmed)) {
      s.customAbusiveWords.push(trimmed);
      this.scheduleSave();
    }
  }

  public removeCustomAbusiveWord(chatId: number, word: string): boolean {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.customAbusiveWords)) return false;
    const trimmed = word.trim().toLowerCase();
    const idx = s.customAbusiveWords.indexOf(trimmed);
    if (idx !== -1) {
      s.customAbusiveWords.splice(idx, 1);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public clearCustomAbusiveWords(chatId: number): void {
    const s = this.getGroupSettings(chatId);
    s.customAbusiveWords = [];
    this.scheduleSave();
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

  public removeLatestWarning(chatId: number, userId: number): { removed: boolean; remaining: number } {
    const userWarnings = this.data.warnings.filter((w) => w.chatId === chatId && w.userId === userId);
    if (userWarnings.length === 0) {
      return { removed: false, remaining: 0 };
    }

    // Sort by timestamp or index and remove latest
    const latest = userWarnings[userWarnings.length - 1];
    this.data.warnings = this.data.warnings.filter((w) => w.id !== latest.id);
    this.scheduleSave();

    const remaining = this.getUserWarnings(chatId, userId).length;
    return { removed: true, remaining };
  }

  public getUserWarnings(chatId: number, userId: number): WarningRecord[] {
    const s = this.getGroupSettings(chatId);
    let list = this.data.warnings.filter((w) => w.chatId === chatId && w.userId === userId);

    // If warning expiration is configured (> 0 seconds), filter out expired warnings
    if (s.warnExpireSeconds && s.warnExpireSeconds > 0) {
      const now = Date.now();
      const cutoff = now - (s.warnExpireSeconds * 1000);
      list = list.filter((w) => new Date(w.timestamp).getTime() >= cutoff);
    }

    return list;
  }

  public resetUserWarnings(chatId: number, userId: number): number {
    const initialCount = this.data.warnings.length;
    this.data.warnings = this.data.warnings.filter((w) => !(w.chatId === chatId && w.userId === userId));
    const removed = initialCount - this.data.warnings.length;
    this.scheduleSave();
    return removed;
  }

  // --- Saved Notes System ---
  public saveNote(
    chatId: number,
    name: string,
    content: string,
    savedBy: number,
    savedByUsername?: string,
    fileId?: string,
    fileType?: string
  ): NoteRecord {
    if (!this.data.notes) {
      this.data.notes = {};
    }
    const cleanName = name.toLowerCase().trim().replace(/^#/, '');
    const key = `${chatId}_${cleanName}`;
    const record: NoteRecord = {
      name: cleanName,
      chatId,
      content,
      savedBy,
      savedByUsername,
      savedAt: new Date().toISOString(),
      fileId,
      fileType
    };
    this.data.notes[key] = record;
    this.scheduleSave();
    return record;
  }

  public getNote(chatId: number, name: string): NoteRecord | null {
    if (!this.data.notes) return null;
    const cleanName = name.toLowerCase().trim().replace(/^#/, '');
    const key = `${chatId}_${cleanName}`;
    return this.data.notes[key] || null;
  }

  public getAllNotes(chatId: number): NoteRecord[] {
    if (!this.data.notes) return [];
    const prefix = `${chatId}_`;
    return Object.entries(this.data.notes)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public deleteNote(chatId: number, name: string): boolean {
    if (!this.data.notes) return false;
    const cleanName = name.toLowerCase().trim().replace(/^#/, '');
    const key = `${chatId}_${cleanName}`;
    if (this.data.notes[key]) {
      delete this.data.notes[key];
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public clearAllNotes(chatId: number): number {
    if (!this.data.notes) return 0;
    const prefix = `${chatId}_`;
    let count = 0;
    for (const k of Object.keys(this.data.notes)) {
      if (k.startsWith(prefix)) {
        delete this.data.notes[k];
        count++;
      }
    }
    if (count > 0) {
      this.scheduleSave();
    }
    return count;
  }

  // --- Approved / Trusted Users ---
  public approveUser(
    chatId: number,
    userId: number,
    approvedBy: number,
    username?: string,
    firstName?: string
  ): ApprovedUserRecord {
    if (!this.data.approvedUsers) {
      this.data.approvedUsers = {};
    }
    const key = `${chatId}_${userId}`;
    const record: ApprovedUserRecord = {
      chatId,
      userId,
      username,
      firstName,
      approvedBy,
      approvedAt: new Date().toISOString()
    };
    this.data.approvedUsers[key] = record;
    this.scheduleSave();
    return record;
  }

  public unapproveUser(chatId: number, userId: number): boolean {
    if (!this.data.approvedUsers) return false;
    const key = `${chatId}_${userId}`;
    if (this.data.approvedUsers[key]) {
      delete this.data.approvedUsers[key];
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public isUserApproved(chatId: number, userId: number): boolean {
    if (!this.data.approvedUsers) return false;
    const key = `${chatId}_${userId}`;
    return Boolean(this.data.approvedUsers[key]);
  }

  public getApprovedUsers(chatId: number): ApprovedUserRecord[] {
    if (!this.data.approvedUsers) return [];
    const prefix = `${chatId}_`;
    return Object.entries(this.data.approvedUsers)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, v]) => v);
  }

  // --- CAPTCHA Sessions ---
  public createCaptchaSession(
    chatId: number,
    userId: number,
    question: string,
    correctAnswer: string,
    timeoutSeconds: number = 120
  ): CaptchaSession {
    if (!this.data.captchaSessions) {
      this.data.captchaSessions = [];
    }
    // Remove existing session for this user in this chat
    this.removeCaptchaSession(chatId, userId);

    const nowSec = Math.floor(Date.now() / 1000);
    const token = Math.random().toString(36).substring(2, 12);
    const session: CaptchaSession = {
      id: Math.random().toString(36).substring(2, 9),
      chatId,
      userId,
      question,
      correctAnswer,
      token,
      createdAt: nowSec,
      expiresAt: nowSec + timeoutSeconds
    };
    this.data.captchaSessions.push(session);
    this.scheduleSave();
    return session;
  }

  public setCaptchaMessageId(sessionId: string, messageId: number): void {
    if (!this.data.captchaSessions) return;
    const s = this.data.captchaSessions.find((x) => x.id === sessionId);
    if (s) {
      s.messageId = messageId;
      this.scheduleSave();
    }
  }

  public getCaptchaSession(chatId: number, userId: number): CaptchaSession | undefined {
    if (!this.data.captchaSessions) return undefined;
    return this.data.captchaSessions.find((s) => s.chatId === chatId && s.userId === userId);
  }

  public getCaptchaSessionByToken(token: string): CaptchaSession | undefined {
    if (!this.data.captchaSessions) return undefined;
    return this.data.captchaSessions.find((s) => s.token === token);
  }

  public removeCaptchaSession(chatId: number, userId: number): boolean {
    if (!this.data.captchaSessions) return false;
    const initialLen = this.data.captchaSessions.length;
    this.data.captchaSessions = this.data.captchaSessions.filter(
      (s) => !(s.chatId === chatId && s.userId === userId)
    );
    const removed = initialLen > this.data.captchaSessions.length;
    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  public getExpiredCaptchaSessions(): CaptchaSession[] {
    if (!this.data.captchaSessions) return [];
    const nowSec = Math.floor(Date.now() / 1000);
    return this.data.captchaSessions.filter((s) => s.expiresAt <= nowSec);
  }

  // --- Anti-Raid System ---
  public trackJoinAndCheckRaid(chatId: number): { isRaid: boolean; joinCount: number } {
    const s = this.getGroupSettings(chatId);
    const now = Math.floor(Date.now() / 1000);

    if (!this.raidStates[chatId]) {
      this.raidStates[chatId] = {
        recentJoins: [],
        isRaidModeActive: false,
        raidActiveUntil: 0
      };
    }

    const state = this.raidStates[chatId];

    // Check if raid is already active and still in time
    if (state.isRaidModeActive && state.raidActiveUntil > now) {
      return { isRaid: true, joinCount: state.recentJoins.length };
    } else if (state.isRaidModeActive && state.raidActiveUntil <= now) {
      // Raid mode has expired
      state.isRaidModeActive = false;
      state.raidActiveUntil = 0;
    }

    if (!s.raidEnabled) {
      return { isRaid: false, joinCount: 0 };
    }

    // Prune joins older than raidWindow (seconds)
    const windowCutoff = now - (s.raidWindow || 30);
    state.recentJoins = state.recentJoins.filter((t) => t >= windowCutoff);
    state.recentJoins.push(now);

    const limit = s.raidLimit || 8;
    if (state.recentJoins.length >= limit) {
      state.isRaidModeActive = true;
      state.raidActiveUntil = now + (s.raidDuration || 300);
      return { isRaid: true, joinCount: state.recentJoins.length };
    }

    return { isRaid: false, joinCount: state.recentJoins.length };
  }

  public isRaidActive(chatId: number): boolean {
    const state = this.raidStates[chatId];
    if (!state) return false;
    const now = Math.floor(Date.now() / 1000);
    if (state.isRaidModeActive && state.raidActiveUntil > now) {
      return true;
    }
    if (state.isRaidModeActive && state.raidActiveUntil <= now) {
      state.isRaidModeActive = false;
      state.raidActiveUntil = 0;
    }
    return false;
  }

  public setRaidActive(chatId: number, active: boolean, durationSeconds?: number): void {
    const now = Math.floor(Date.now() / 1000);
    if (!this.raidStates[chatId]) {
      this.raidStates[chatId] = {
        recentJoins: [],
        isRaidModeActive: false,
        raidActiveUntil: 0
      };
    }
    const state = this.raidStates[chatId];
    state.isRaidModeActive = active;
    state.raidActiveUntil = active ? now + (durationSeconds || 300) : 0;
  }

  // --- Configuration Export & Import ---
  public exportGroupConfig(chatId: number): object {
    const s = this.getGroupSettings(chatId);
    const filters = this.getFilters(chatId);
    const notes = this.getAllNotes(chatId);
    const whitelist = this.getLinkWhitelist(chatId);
    const locks = this.getLocks(chatId);

    return {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      chatId,
      settings: {
        warnLimit: s.warnLimit,
        warnAction: s.warnAction,
        warnExpireSeconds: s.warnExpireSeconds,
        floodEnabled: s.floodEnabled,
        floodCount: s.floodCount,
        floodWindow: s.floodWindow,
        floodAction: s.floodAction,
        raidEnabled: s.raidEnabled,
        raidLimit: s.raidLimit,
        raidWindow: s.raidWindow,
        raidAction: s.raidAction,
        raidDuration: s.raidDuration,
        captchaEnabled: s.captchaEnabled,
        captchaMode: s.captchaMode,
        captchaTimeout: s.captchaTimeout,
        captchaAction: s.captchaAction,
        linksProtection: s.linksProtection,
        linksWhitelist: whitelist,
        mediaProtection: s.mediaProtection,
        stickerProtection: s.stickerProtection,
        gifsProtection: s.gifsProtection,
        videosProtection: s.videosProtection,
        photosProtection: s.photosProtection,
        voiceProtection: s.voiceProtection,
        audioProtection: s.audioProtection,
        locks,
        welcomeEnabled: s.welcomeEnabled,
        welcomeMessage: s.welcomeMessage,
        goodbyeEnabled: s.goodbyeEnabled,
        goodbyeMessage: s.goodbyeMessage,
        slowModeSeconds: s.slowModeSeconds,
        reportsEnabled: s.reportsEnabled
      },
      filters,
      notes: notes.map((n) => ({ name: n.name, content: n.content }))
    };
  }

  public importGroupConfig(
    chatId: number,
    config: any,
    importedBy: number
  ): { ok: boolean; message: string; appliedCount: number } {
    if (!config || typeof config !== 'object' || !config.settings) {
      return { ok: false, message: 'Invalid configuration format. Must contain "settings" object.', appliedCount: 0 };
    }

    const s = config.settings;
    const updates: Partial<GroupSettings> = {};
    let appliedCount = 0;

    if (typeof s.warnLimit === 'number' && s.warnLimit >= 1 && s.warnLimit <= 20) { updates.warnLimit = s.warnLimit; appliedCount++; }
    if (['ban', 'mute', 'kick', 'warn_only'].includes(s.warnAction)) { updates.warnAction = s.warnAction; appliedCount++; }
    if (typeof s.warnExpireSeconds === 'number') { updates.warnExpireSeconds = s.warnExpireSeconds; appliedCount++; }
    if (typeof s.floodEnabled === 'boolean') { updates.floodEnabled = s.floodEnabled; appliedCount++; }
    if (typeof s.floodCount === 'number') { updates.floodCount = s.floodCount; appliedCount++; }
    if (typeof s.floodWindow === 'number') { updates.floodWindow = s.floodWindow; appliedCount++; }
    if (['delete', 'mute', 'kick', 'ban'].includes(s.floodAction)) { updates.floodAction = s.floodAction; appliedCount++; }
    if (typeof s.raidEnabled === 'boolean') { updates.raidEnabled = s.raidEnabled; appliedCount++; }
    if (typeof s.raidLimit === 'number') { updates.raidLimit = s.raidLimit; appliedCount++; }
    if (typeof s.raidWindow === 'number') { updates.raidWindow = s.raidWindow; appliedCount++; }
    if (['kick', 'mute', 'ban', 'restrict'].includes(s.raidAction)) { updates.raidAction = s.raidAction; appliedCount++; }
    if (typeof s.raidDuration === 'number') { updates.raidDuration = s.raidDuration; appliedCount++; }
    if (typeof s.captchaEnabled === 'boolean') { updates.captchaEnabled = s.captchaEnabled; appliedCount++; }
    if (['button', 'math'].includes(s.captchaMode)) { updates.captchaMode = s.captchaMode; appliedCount++; }
    if (typeof s.captchaTimeout === 'number') { updates.captchaTimeout = s.captchaTimeout; appliedCount++; }
    if (['kick', 'mute', 'ban'].includes(s.captchaAction)) { updates.captchaAction = s.captchaAction; appliedCount++; }
    if (typeof s.linksProtection === 'boolean') { updates.linksProtection = s.linksProtection; appliedCount++; }
    if (Array.isArray(s.linksWhitelist)) { updates.linksWhitelist = s.linksWhitelist; appliedCount++; }
    if (typeof s.mediaProtection === 'boolean') { updates.mediaProtection = s.mediaProtection; appliedCount++; }
    if (typeof s.stickerProtection === 'boolean') { updates.stickerProtection = s.stickerProtection; appliedCount++; }
    if (typeof s.gifsProtection === 'boolean') { updates.gifsProtection = s.gifsProtection; appliedCount++; }
    if (typeof s.videosProtection === 'boolean') { updates.videosProtection = s.videosProtection; appliedCount++; }
    if (typeof s.photosProtection === 'boolean') { updates.photosProtection = s.photosProtection; appliedCount++; }
    if (typeof s.voiceProtection === 'boolean') { updates.voiceProtection = s.voiceProtection; appliedCount++; }
    if (typeof s.audioProtection === 'boolean') { updates.audioProtection = s.audioProtection; appliedCount++; }
    if (s.locks && typeof s.locks === 'object') { updates.locks = s.locks; appliedCount++; }
    if (typeof s.welcomeEnabled === 'boolean') { updates.welcomeEnabled = s.welcomeEnabled; appliedCount++; }
    if (typeof s.welcomeMessage === 'string') { updates.welcomeMessage = s.welcomeMessage; appliedCount++; }
    if (typeof s.goodbyeEnabled === 'boolean') { updates.goodbyeEnabled = s.goodbyeEnabled; appliedCount++; }
    if (typeof s.goodbyeMessage === 'string') { updates.goodbyeMessage = s.goodbyeMessage; appliedCount++; }
    if (typeof s.reportsEnabled === 'boolean') { updates.reportsEnabled = s.reportsEnabled; appliedCount++; }

    this.updateGroupSettings(chatId, updates);

    // Import filters
    if (config.filters && typeof config.filters === 'object') {
      for (const [k, v] of Object.entries(config.filters)) {
        if (typeof v === 'string') {
          this.setFilter(chatId, k, v);
          appliedCount++;
        }
      }
    }

    // Import notes
    if (Array.isArray(config.notes)) {
      for (const n of config.notes) {
        if (n && typeof n.name === 'string' && typeof n.content === 'string') {
          this.saveNote(chatId, n.name, n.content, importedBy);
          appliedCount++;
        }
      }
    }

    return { ok: true, message: `Successfully imported ${appliedCount} configuration items.`, appliedCount };
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

  // --- Media, Sticker & Content Permissions (/free & /unfree) ---
  public hasContentPermission(chatId: number, userId: number, contentType: ContentType): boolean {
    if (!this.data.contentPermissions) this.data.contentPermissions = {};
    
    // Check direct match or 'all'
    const directKey = `${chatId}_${userId}_${contentType.toLowerCase()}`;
    const allKey = `${chatId}_${userId}_all`;
    
    if (this.data.contentPermissions[directKey] || this.data.contentPermissions[allKey]) {
      return true;
    }

    // Media umbrella check
    if (['photos', 'videos', 'gifs', 'voice', 'audio'].includes(contentType.toLowerCase())) {
      const mediaKey = `${chatId}_${userId}_media`;
      if (this.data.contentPermissions[mediaKey]) return true;
    }

    // Backward-compatibility check with stickerFreeUsers
    if (['stickers', 'media', 'photos', 'videos', 'gifs', 'voice', 'audio'].includes(contentType.toLowerCase())) {
      if (this.data.stickerFreeUsers && this.data.stickerFreeUsers.some((u) => u.chatId === chatId && u.userId === userId)) {
        return true;
      }
    }

    return false;
  }

  public isUserStickerFree(chatId: number, userId: number): boolean {
    return this.hasContentPermission(chatId, userId, 'stickers');
  }

  public isUserMediaFree(chatId: number, userId: number): boolean {
    return this.hasContentPermission(chatId, userId, 'media');
  }

  public grantContentPermission(
    chatId: number,
    userId: number,
    contentType: ContentType,
    grantedBy: number,
    username?: string
  ): ContentPermissionRecord {
    if (!this.data.contentPermissions) this.data.contentPermissions = {};
    
    const normalizedType = contentType.toLowerCase() as ContentType;
    const key = `${chatId}_${userId}_${normalizedType}`;
    
    const record: ContentPermissionRecord = {
      chatId,
      userId,
      contentType: normalizedType,
      grantedBy,
      grantedAt: new Date().toISOString(),
      username
    };

    this.data.contentPermissions[key] = record;

    // Backward-compatibility sync with stickerFreeUsers
    if (['stickers', 'media', 'all'].includes(normalizedType)) {
      if (!this.data.stickerFreeUsers.some((u) => u.chatId === chatId && u.userId === userId)) {
        this.data.stickerFreeUsers.push({
          chatId,
          userId,
          username,
          grantedBy,
          grantedAt: record.grantedAt
        });
      }
    }

    this.scheduleSave();
    return record;
  }

  public grantStickerPermission(chatId: number, userId: number, grantedBy: number, username?: string): void {
    this.grantContentPermission(chatId, userId, 'stickers', grantedBy, username);
  }

  public grantMediaPermission(chatId: number, userId: number, grantedBy: number, username?: string): void {
    this.grantContentPermission(chatId, userId, 'media', grantedBy, username);
  }

  public revokeContentPermission(chatId: number, userId: number, contentType?: ContentType): boolean {
    if (!this.data.contentPermissions) return false;
    
    let removed = false;
    if (contentType) {
      const normalizedType = contentType.toLowerCase() as ContentType;
      const key = `${chatId}_${userId}_${normalizedType}`;
      if (this.data.contentPermissions[key]) {
        delete this.data.contentPermissions[key];
        removed = true;
      }
      // If revoking 'all', also remove any specific permissions for this user in this chat
      if (normalizedType === 'all') {
        for (const k of Object.keys(this.data.contentPermissions)) {
          if (k.startsWith(`${chatId}_${userId}_`)) {
            delete this.data.contentPermissions[k];
            removed = true;
          }
        }
      }
    } else {
      // Revoke all permissions for this user in this chat
      for (const k of Object.keys(this.data.contentPermissions)) {
        if (k.startsWith(`${chatId}_${userId}_`)) {
          delete this.data.contentPermissions[k];
          removed = true;
        }
      }
    }

    // Sync with legacy stickerFreeUsers
    if (!contentType || ['stickers', 'media', 'all'].includes(contentType.toLowerCase())) {
      const initialCount = this.data.stickerFreeUsers.length;
      this.data.stickerFreeUsers = this.data.stickerFreeUsers.filter(
        (u) => !(u.chatId === chatId && u.userId === userId)
      );
      if (initialCount > this.data.stickerFreeUsers.length) {
        removed = true;
      }
    }

    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  public revokeStickerPermission(chatId: number, userId: number): boolean {
    return this.revokeContentPermission(chatId, userId, 'stickers');
  }

  public revokeMediaPermission(chatId: number, userId: number): boolean {
    return this.revokeContentPermission(chatId, userId, 'media');
  }

  public getUserContentPermissions(chatId: number, userId: number): ContentType[] {
    if (!this.data.contentPermissions) return [];
    const types: Set<ContentType> = new Set();

    for (const [key, record] of Object.entries(this.data.contentPermissions)) {
      if (record.chatId === chatId && record.userId === userId) {
        types.add(record.contentType);
      }
    }

    // Check legacy stickerFreeUsers
    if (this.data.stickerFreeUsers && this.data.stickerFreeUsers.some((u) => u.chatId === chatId && u.userId === userId)) {
      types.add('stickers');
      types.add('media');
    }

    return Array.from(types);
  }

  public getFreedUsers(chatId: number): StickerFreeUser[] {
    const list: StickerFreeUser[] = [];
    const seen = new Set<number>();

    // From content permissions
    if (this.data.contentPermissions) {
      for (const record of Object.values(this.data.contentPermissions)) {
        if (record.chatId === chatId && !seen.has(record.userId)) {
          seen.add(record.userId);
          list.push({
            chatId: record.chatId,
            userId: record.userId,
            username: record.username,
            grantedBy: record.grantedBy,
            grantedAt: record.grantedAt
          });
        }
      }
    }

    // From legacy
    for (const u of this.data.stickerFreeUsers) {
      if (u.chatId === chatId && !seen.has(u.userId)) {
        seen.add(u.userId);
        list.push(u);
      }
    }

    return list;
  }

  public getGroupContentPermissions(chatId: number): Array<{ userId: number; username?: string; contentTypes: ContentType[]; grantedAt: string }> {
    const map = new Map<number, { userId: number; username?: string; contentTypes: Set<ContentType>; grantedAt: string }>();

    if (this.data.contentPermissions) {
      for (const record of Object.values(this.data.contentPermissions)) {
        if (record.chatId === chatId) {
          let entry = map.get(record.userId);
          if (!entry) {
            entry = {
              userId: record.userId,
              username: record.username,
              contentTypes: new Set(),
              grantedAt: record.grantedAt
            };
            map.set(record.userId, entry);
          }
          entry.contentTypes.add(record.contentType);
          if (record.username && !entry.username) entry.username = record.username;
        }
      }
    }

    // Also include legacy stickerFreeUsers
    for (const u of this.data.stickerFreeUsers) {
      if (u.chatId === chatId) {
        let entry = map.get(u.userId);
        if (!entry) {
          entry = {
            userId: u.userId,
            username: u.username,
            contentTypes: new Set(),
            grantedAt: u.grantedAt
          };
          map.set(u.userId, entry);
        }
        entry.contentTypes.add('stickers');
        entry.contentTypes.add('media');
        if (u.username && !entry.username) entry.username = u.username;
      }
    }

    return Array.from(map.values()).map((entry) => ({
      userId: entry.userId,
      username: entry.username,
      contentTypes: Array.from(entry.contentTypes),
      grantedAt: entry.grantedAt
    }));
  }

  public getGroupMembersList(chatId: number): CachedMember[] {
    if (!this.data.groupMembers) return [];
    const members: CachedMember[] = [];
    for (const [key, member] of Object.entries(this.data.groupMembers)) {
      if (key.startsWith(`${chatId}_`)) {
        members.push(member);
      }
    }
    return members;
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
  private cleanOldLogs() {
    if (!this.data.logs || !Array.isArray(this.data.logs)) {
      this.data.logs = [];
      return;
    }
    const oneHourAgo = Date.now() - 3600 * 1000;
    this.data.logs = this.data.logs.filter((log) => {
      if (!log.timestamp) return false;
      const t = new Date(log.timestamp).getTime();
      return !isNaN(t) && t >= oneHourAgo;
    });
  }

  public addLog(log: Omit<ModerationLog, 'id' | 'timestamp'>): ModerationLog {
    this.cleanOldLogs();
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
    this.cleanOldLogs();
    return this.data.logs.slice(-limit);
  }

  public getGroupLogs(chatId: number, limit: number = 20): ModerationLog[] {
    this.cleanOldLogs();
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

  // --- Phase 10 Rules & Automations ---
  public getRules(chatId: number): string {
    const s = this.getGroupSettings(chatId);
    return s.rules || '';
  }

  public setRules(chatId: number, rules: string) {
    const s = this.getGroupSettings(chatId);
    s.rules = rules;
    s.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  public clearRules(chatId: number) {
    const s = this.getGroupSettings(chatId);
    s.rules = '';
    s.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  public getAutomations(chatId: number): any[] {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.automations)) {
      s.automations = [];
    }
    return s.automations;
  }

  public addAutomation(chatId: number, automation: { id: string; trigger: string; action: string; parameters?: string; enabled: boolean; createdBy: number; createdAt: string }) {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.automations)) {
      s.automations = [];
    }
    s.automations.push(automation);
    s.updatedAt = new Date().toISOString();
    this.scheduleSave();
  }

  public removeAutomation(chatId: number, id: string): boolean {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.automations)) return false;
    const initialLen = s.automations.length;
    s.automations = s.automations.filter((a) => a.id !== id);
    if (s.automations.length < initialLen) {
      s.updatedAt = new Date().toISOString();
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public toggleAutomation(chatId: number, id: string, enabled: boolean): boolean {
    const s = this.getGroupSettings(chatId);
    if (!Array.isArray(s.automations)) return false;
    const auto = s.automations.find((a) => a.id === id);
    if (auto) {
      auto.enabled = enabled;
      s.updatedAt = new Date().toISOString();
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public getMediaLibrary(): MediaLibraryRecord {
    if (!this.data.mediaLibrary) {
      this.data.mediaLibrary = { stickers: {}, animations: {}, stickerMetadata: {} };
    }
    if (!this.data.mediaLibrary.stickerMetadata) {
      this.data.mediaLibrary.stickerMetadata = {};
    }
    return this.data.mediaLibrary;
  }

  public addStickerToLibrary(mood: string, fileId: string, meta?: StickerMetaRecord): boolean {
    const lib = this.getMediaLibrary();
    const normalizedMood = mood.toLowerCase().trim();
    if (!lib.stickers[normalizedMood]) {
      lib.stickers[normalizedMood] = [];
    }
    if (meta) {
      if (!lib.stickerMetadata) lib.stickerMetadata = {};
      lib.stickerMetadata[fileId] = meta;
    }
    if (!lib.stickers[normalizedMood].includes(fileId)) {
      lib.stickers[normalizedMood].push(fileId);
      this.scheduleSave();
      return true; // newly added
    }
    return false; // already existed
  }

  public addAnimationToLibrary(mood: string, fileId: string): boolean {
    const lib = this.getMediaLibrary();
    const normalizedMood = mood.toLowerCase().trim();
    if (!lib.animations[normalizedMood]) {
      lib.animations[normalizedMood] = [];
    }
    if (!lib.animations[normalizedMood].includes(fileId)) {
      lib.animations[normalizedMood].push(fileId);
      this.scheduleSave();
      return true;
    }
    return false;
  }

  public removeMediaFromLibrary(fileId: string): boolean {
    const lib = this.getMediaLibrary();
    let removed = false;
    for (const mood of Object.keys(lib.stickers)) {
      const idx = lib.stickers[mood].indexOf(fileId);
      if (idx !== -1) {
        lib.stickers[mood].splice(idx, 1);
        removed = true;
      }
    }
    for (const mood of Object.keys(lib.animations)) {
      const idx = lib.animations[mood].indexOf(fileId);
      if (idx !== -1) {
        lib.animations[mood].splice(idx, 1);
        removed = true;
      }
    }
    if (lib.stickerMetadata && lib.stickerMetadata[fileId]) {
      delete lib.stickerMetadata[fileId];
      removed = true;
    }
    if (removed) {
      this.scheduleSave();
    }
    return removed;
  }

  public clearMediaLibrary(mood?: string): void {
    const lib = this.getMediaLibrary();
    if (mood) {
      const normalizedMood = mood.toLowerCase().trim();
      if (lib.stickerMetadata && lib.stickers[normalizedMood]) {
        for (const fId of lib.stickers[normalizedMood]) {
          delete lib.stickerMetadata[fId];
        }
      }
      delete lib.stickers[normalizedMood];
      delete lib.animations[normalizedMood];
    } else {
      lib.stickers = {};
      lib.animations = {};
      lib.stickerMetadata = {};
    }
    this.scheduleSave();
  }

  // --- User Memory Management ---
  public getUserMemory(chatId: number | string, userId: number): string[] {
    if (!this.data.userMemories) this.data.userMemories = {};
    const key = `${chatId}_${userId}`;
    const record = this.data.userMemories[key];
    if (!record || !Array.isArray(record.facts)) return [];
    return record.facts;
  }

  public addUserMemoryFact(chatId: number | string, userId: number, fact: string): void {
    if (!this.data.userMemories) this.data.userMemories = {};
    const key = `${chatId}_${userId}`;
    let record = this.data.userMemories[key];
    const now = Date.now();
    if (!record) {
      record = { chatId, userId, facts: [], lastUpdated: now };
      this.data.userMemories[key] = record;
    }
    record.lastUpdated = now;
    const trimmed = fact.trim();
    if (!trimmed) return;
    if (isSensitiveData(trimmed)) return;
    if (!record.facts.includes(trimmed)) {
      record.facts.push(trimmed);
      if (record.facts.length > 8) {
        record.facts.shift();
      }
      this.scheduleSave();
    }
  }

  public clearUserMemory(chatId: number | string, userId: number): boolean {
    if (!this.data.userMemories) return false;
    const key = `${chatId}_${userId}`;
    const existed = !!this.data.userMemories[key];
    if (existed) {
      delete this.data.userMemories[key];
      this.scheduleSave();
    }
    return existed;
  }

  public cleanExpiredMemories(): void {
    if (!this.data.userMemories) return;
    const now = Date.now();
    const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days inactivity
    let cleaned = false;
    for (const [key, record] of Object.entries(this.data.userMemories)) {
      if (now - (record.lastUpdated || 0) > TTL_MS) {
        delete this.data.userMemories[key];
        cleaned = true;
      }
    }
    if (cleaned) {
      this.scheduleSave();
    }
  }
}

export const db = new StorageManager();
