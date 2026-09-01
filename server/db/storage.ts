import fs from 'fs';
import path from 'path';
import { GroupSettings, WarningRecord, StickerFreeUser, ContentType, ContentPermissionRecord, ScheduledMessage, ModerationLog, CachedMember, TrackedChatMessage, TempActionRecord, NoteRecord, ApprovedUserRecord, CaptchaSession, AutoResponseConfig, AutoStickerConfig, GroupStickerPackConfig } from '../telegram/types.js';
import { getDefaultStickersStats } from '../telegram/defaultStickers.js';

interface RaidStateRecord {
  recentJoins: number[];
  isRaidModeActive: boolean;
  raidActiveUntil: number;
}

export interface StickerMetaRecord {
  chatId?: number | string;
  packName?: string;
  packTitle?: string;
  fileId: string;
  emoji?: string;
  mood: string;
  source?: 'custom' | 'default';
  addedBy?: number;
  addedAt: string;
  isLustMode?: boolean;
}

export interface MediaLibraryRecord {
  stickers: Record<string, string[]>;
  animations: Record<string, string[]>;
  stickerMetadata?: Record<string, StickerMetaRecord>;
  lustStickers?: Record<string, string[]>;
}

export const GROUP_MEMORY_LIMIT = 80;

export interface GroupConversationMessage {
  role: 'user' | 'assistant';
  userId?: number | string;
  name: string; // username or display name
  content: string;
  timestamp: number;
  messageId?: number;
  chatId?: number | string;
  username?: string;
  displayName?: string;
  mediaType?: string;
  direction?: 'incoming' | 'outgoing';
  source?: 'telegram' | 'dashboard' | 'bot';
  sender?: string;
  replyToMessageId?: number;
  replyTo?: {
    messageId: number;
    name?: string;
    text?: string;
  };
}

export type GroupConversationEntry = GroupConversationMessage;

export interface GroupConversationMemory {
  chatId: number | string;
  messages: GroupConversationMessage[];
  entries?: GroupConversationMessage[]; // backward-compatible alias
  lastUpdated: number;
}

export type GroupMemoryRecord = GroupConversationMemory;

export interface UserMemoryRecord {
  chatId: number | string;
  userId: number;
  facts: string[];
  lastUpdated: number;
}

export interface UserLustLevelRecord {
  groupId: number | string;
  userId: number;
  level: number; // 0 to 4
  lastUpdated: number;
}

export interface PrivateConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  messageId?: number;
  mediaType?: string;
  mediaFileId?: string;
  direction: 'in' | 'out';
  language?: string;
}

export interface PrivateConversationRecord {
  chatId: number | string;
  userId: number;
  username?: string;
  name?: string;
  language?: string;
  lastUpdated: number;
  messages: PrivateConversationMessage[];
}

export interface GlobalSettings {
  botEnabled: boolean;
  aiConversationEnabled: boolean;
  globalModerationEnabled: boolean;
  globalStickersEnabled: boolean;
  globalAutoResponseEnabled: boolean;
  globalAutoStickerEnabled: boolean;
  globalLustModeAvailable: boolean;
  globalLoggingEnabled: boolean;
  maintenanceMode: boolean;
}

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  botEnabled: true,
  aiConversationEnabled: true,
  globalModerationEnabled: true,
  globalStickersEnabled: true,
  globalAutoResponseEnabled: true,
  globalAutoStickerEnabled: true,
  globalLustModeAvailable: true,
  globalLoggingEnabled: true,
  maintenanceMode: false
};

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
  globalSettings?: GlobalSettings;
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
  groupMediaLibraries?: Record<string, MediaLibraryRecord>; // `${chatId}` -> MediaLibraryRecord
  userMemories?: Record<string, UserMemoryRecord>; // `${chatId}_${userId}` -> UserMemoryRecord (personal facts only)
  groupConversationMemories?: Record<string, GroupConversationMemory>; // `${chatId}` -> GroupConversationMemory (ONE shared group memory per chatId)
  groupMemories?: Record<string, any>; // legacy backward-compatible alias
  userLustLevels?: Record<string, UserLustLevelRecord>; // `${groupId}_${userId}` -> UserLustLevelRecord
  privateConversations?: Record<string, PrivateConversationRecord>; // `${chatId}` -> PrivateConversationRecord
}

const DATA_DIR = process.env.ROXIE_DATA_DIR || process.env.DATA_DIR || path.join(process.cwd(), 'data');
const GROUPS_DIR = path.join(DATA_DIR, 'groups');
const PRIVATE_DIR = path.join(DATA_DIR, 'private');
const BACKUP_DIR = path.join(DATA_DIR, 'backup');
const GROUPS_BACKUP_DIR = path.join(BACKUP_DIR, 'groups');
const PRIVATE_BACKUP_DIR = path.join(BACKUP_DIR, 'private');
const GLOBAL_DB_FILE = path.join(DATA_DIR, 'global.json');
const DB_FILE = path.join(DATA_DIR, 'bot_storage.json');

class StorageManager {
  public static readonly MAX_PACKS_PER_GROUP = 1000;
  public static readonly GROUP_MEMORY_LIMIT = GROUP_MEMORY_LIMIT;

  public get dataDir(): string {
    return process.env.ROXIE_DATA_DIR || process.env.DATA_DIR || path.join(process.cwd(), 'data');
  }

  public get groupsDir(): string {
    return path.join(this.dataDir, 'groups');
  }

  public get privateDir(): string {
    return path.join(this.dataDir, 'private');
  }

  public get backupDir(): string {
    return path.join(this.dataDir, 'backup');
  }

  public get groupsBackupDir(): string {
    return path.join(this.backupDir, 'groups');
  }

  public get privateBackupDir(): string {
    return path.join(this.backupDir, 'private');
  }

  public get globalFile(): string {
    return path.join(this.dataDir, 'global.json');
  }

  public get dbFile(): string {
    return path.join(this.dataDir, 'bot_storage.json');
  }

  public ensureDirectories(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.groupsDir)) {
      fs.mkdirSync(this.groupsDir, { recursive: true });
    }
    if (!fs.existsSync(this.privateDir)) {
      fs.mkdirSync(this.privateDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
    if (!fs.existsSync(this.groupsBackupDir)) {
      fs.mkdirSync(this.groupsBackupDir, { recursive: true });
    }
    if (!fs.existsSync(this.privateBackupDir)) {
      fs.mkdirSync(this.privateBackupDir, { recursive: true });
    }
  }

  private groupWriteQueues: Map<string, Promise<void>> = new Map();
  private lastSaveTimestamps: Map<string, string> = new Map();
  private corruptedRecoveries: Map<string, string> = new Map();
  public lastSaveSuccessful: boolean = true;
  public corruptedFilesCount: number = 0;

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
    mediaLibrary: { stickers: {}, animations: {}, stickerMetadata: {} },
    groupMediaLibraries: {},
    userMemories: {},
    groupConversationMemories: {},
    groupMemories: {},
    userLustLevels: {}
  };
  private raidStates: Record<number, RaidStateRecord> = {};
  private isLoaded: boolean = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.ensureDirectories();

      // Render Persistence Check
      const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
      const hasExplicitDataDir = Boolean(process.env.ROXIE_DATA_DIR);
      if (isRender && !hasExplicitDataDir) {
        console.warn('[Roxie Storage] WARNING: ROXIE_DATA_DIR is not configured. Runtime filesystem persistence may be lost on Render restart/redeploy. Mount a Persistent Disk (e.g. /var/data/roxie) and configure ROXIE_DATA_DIR=/var/data/roxie.');
      }

      if (fs.existsSync(this.dbFile)) {
        const raw = fs.readFileSync(this.dbFile, 'utf-8');
        if (raw) {
          const parsed = JSON.parse(raw);

          const groupConversationMemories: Record<string, GroupConversationMemory> = parsed.groupConversationMemories || {};
          // Safe migration from legacy groupMemories if present
          if (parsed.groupMemories && typeof parsed.groupMemories === 'object') {
            for (const [cId, rec] of Object.entries(parsed.groupMemories)) {
              if (!groupConversationMemories[cId]) {
                const msgs = Array.isArray((rec as any).messages)
                  ? (rec as any).messages
                  : (Array.isArray((rec as any).entries) ? (rec as any).entries : []);
                groupConversationMemories[cId] = {
                  chatId: (rec as any).chatId || cId,
                  messages: msgs.slice(-GROUP_MEMORY_LIMIT),
                  lastUpdated: (rec as any).lastUpdated || Date.now()
                };
              }
            }
          }

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
            mediaLibrary: parsed.mediaLibrary || { stickers: {}, animations: {}, stickerMetadata: {} },
            groupMediaLibraries: parsed.groupMediaLibraries || {},
            userMemories: parsed.userMemories || {},
            groupConversationMemories,
            groupMemories: groupConversationMemories,
            userLustLevels: parsed.userLustLevels || {},
            privateConversations: parsed.privateConversations || {}
          };
        }
      }

      // 2. Load global.json if present
      this.loadGlobalJson();

      // 3. Load authoritative per-group JSON files
      const groupLoadResult = this.loadAllGroupJsons();
      if (groupLoadResult.loadedCount > 0 || groupLoadResult.errorsCount > 0) {
        console.log(`[Storage] Restored ${groupLoadResult.loadedCount} per-group JSON files (${groupLoadResult.errorsCount} errors handled safely).`);
      }

      // 4. Load authoritative private chat JSON files
      const privateLoadResult = this.loadAllPrivateJsons();
      if (privateLoadResult.loadedCount > 0 || privateLoadResult.errorsCount > 0) {
        console.log(`[Storage] Restored ${privateLoadResult.loadedCount} private chat JSON files (${privateLoadResult.errorsCount} errors handled safely).`);
      }

      // 5. Print startup diagnostics (Section 18)
      console.log(`[Roxie Storage]`);
      console.log(`Data directory: ${this.dataDir}`);
      console.log(`Groups loaded: ${groupLoadResult.loadedCount}`);
      console.log(`Private chats loaded: ${privateLoadResult.loadedCount}`);
      console.log(`Storage mode: ${hasExplicitDataDir ? 'persistent-path' : 'local-fallback'}`);
      console.log(`Schema version: 1`);

      // 6. Safe Startup Migration: For any groups/private in memory without a file, generate one
      if (this.data.settings) {
        for (const idStr of Object.keys(this.data.settings)) {
          const numId = Number(idStr);
          if (!isNaN(numId) && numId < 0) {
            const groupFile = path.join(this.groupsDir, `${numId}.json`);
            if (!fs.existsSync(groupFile)) {
              this.saveGroupJsonSync(numId);
            }
          }
        }
      }
      if (this.data.privateConversations) {
        for (const idStr of Object.keys(this.data.privateConversations)) {
          const numId = Number(idStr);
          if (!isNaN(numId) && numId > 0) {
            const privateFile = path.join(this.privateDir, `${numId}.json`);
            if (!fs.existsSync(privateFile)) {
              this.savePrivateJsonSync(numId);
            }
          }
        }
      }
      this.saveGlobalJsonSync();
    } catch (err) {
      console.error('Failed to initialize local bot storage:', err);
    }
    this.cleanOldLogs();
    this.cleanExpiredMemories();
    this.isLoaded = true;
  }

  // --- Per-Group JSON Persistence & Safety ---
  public sanitizeGroupData(data: any): any {
    const jsonStr = JSON.stringify(data, (key, value) => {
      const lower = key.toLowerCase();
      if (
        lower.includes('token') ||
        lower.includes('secret') ||
        lower.includes('apikey') ||
        lower.includes('api_key') ||
        lower.includes('password') ||
        lower.includes('credential')
      ) {
        return undefined;
      }
      return value;
    });
    return JSON.parse(jsonStr);
  }

  public buildGroupDataObject(chatId: number): any {
    const settings = this.getGroupSettings(chatId);
    const key = String(chatId);

    const autoResp = settings.autoResponse || { mode: 'disabled' };
    const autoStk = settings.autoSticker || { mode: 'disabled' };

    const stickerPacksList = settings.stickerPacks
      ? Object.values(settings.stickerPacks)
      : [];

    const messages = (this.data.groupConversationMemories?.[key]?.messages || []).map((m: any) => ({
      role: m.role,
      name: m.name,
      displayName: m.displayName || m.name,
      username: m.username,
      content: m.content,
      timestamp: m.timestamp,
      messageId: m.messageId,
      chatId: m.chatId || chatId,
      mediaType: m.mediaType || 'text',
      direction: m.direction || (m.role === 'assistant' ? 'outgoing' : 'incoming'),
      source: m.source || (m.role === 'assistant' ? 'dashboard' : 'telegram'),
      sender: m.sender || (m.role === 'assistant' ? 'Roxie' : m.name),
      replyToMessageId: m.replyToMessageId,
      replyTo: m.replyTo
    }));

    const mediaLib = this.getMediaLibrary(chatId);
    const groupLogs = (this.data.logs || [])
      .filter((l: any) => l.groupId === chatId || l.chatId === chatId || l.targetChatId === chatId)
      .slice(-50);

    const abuseWordsList = settings.abuseWords || settings.customAbusiveWords || [];

    return {
      schemaVersion: 1,
      chat: {
        chatId: String(chatId),
        title: settings.chatTitle || `Group ${chatId}`,
        type: chatId < 0 ? 'supergroup' : 'group',
        username: (settings as any).username || null
      },
      status: {
        botLeft: Boolean(settings.botLeft),
        leftAt: settings.leftAt || null,
        unavailable: Boolean(settings.unavailable),
        unavailableAt: settings.unavailableAt || null,
        unavailableReason: settings.unavailableReason || null
      },
      settings,
      permissions: {
        contentPermissions: this.data.contentPermissions?.[key] || null,
        customRoles: this.data.customRoles?.[key] || {},
        stickerFreeUsers: (this.data.stickerFreeUsers || []).filter((u: any) => u.chatId === chatId)
      },
      moderation: {
        locks: this.getLocks(chatId),
        filters: this.getFilters(chatId),
        linksWhitelist: this.getLinkWhitelist(chatId),
        approvedUsers: this.getApprovedUsers(chatId),
        freedUsers: this.getFreedUsers(chatId),
        warnings: (this.data.warnings || []).filter((w: any) => w.groupId === chatId),
        tempActions: (this.data.tempActions || []).filter((t: any) => t.groupId === chatId),
        abuseWords: abuseWordsList
      },
      ai: {
        personality: (settings as any).personality || 'normal',
        language: (settings as any).language || 'hinglish',
        brotherZoneEnabled: (settings as any).brotherZoneEnabled ?? true,
        coupleFilter: (settings as any).coupleFilter ?? true,
        welcomeEnabled: (settings as any).welcomeEnabled ?? true
      },
      lustMode: {
        enabled: Boolean(settings.lustMode),
        level: (settings as any).lustLevel ?? 1,
        lustStickers: mediaLib?.lustStickers || {},
        userLustLevels: Object.entries(this.data.userLustLevels || {})
          .filter(([k]) => k.startsWith(`${chatId}_`))
          .map(([_, v]) => v)
      },
      autoResponse: {
        ...autoResp,
        nextAllowedAt: (autoResp as any).nextAllowedAt,
        lastResponseTimestamp: (autoResp as any).lastResponseTimestamp,
        nextIntervalSeconds: (autoResp as any).nextIntervalSeconds
      },
      autoSticker: {
        ...autoStk,
        nextAllowedAt: (autoStk as any).nextAllowedAt,
        lastStickerTimestamp: (autoStk as any).lastStickerTimestamp,
        nextIntervalSeconds: (autoStk as any).nextIntervalSeconds
      },
      stickers: {
        mediaLibrary: mediaLib,
        stickerProtection: Boolean(settings.stickerProtection)
      },
      stickerPacks: stickerPacksList,
      abuseWords: abuseWordsList,
      members: this.data.groupMembers?.[key] || [],
      moderators: (settings as any).admins || [],
      messages,
      statistics: {
        schedules: this.getGroupSchedules(chatId),
        notes: this.getAllNotes(chatId),
        userMemories: Object.entries(this.data.userMemories || {})
          .filter(([k]) => k.startsWith(`${chatId}_`))
          .map(([_, v]) => v)
      },
      activity: groupLogs,
      updatedAt: new Date().toISOString()
    };
  }

  public saveGroupJsonSync(chatId: number | string): void {
    const numChatId = Number(chatId);
    if (isNaN(numChatId) || numChatId >= 0) return; // Supergroups and groups have negative IDs

    try {
      this.ensureDirectories();
      const rawData = this.buildGroupDataObject(numChatId);
      const safeData = this.sanitizeGroupData(rawData);
      const targetFile = path.join(this.groupsDir, `${numChatId}.json`);
      const tmpFile = path.join(this.groupsDir, `${numChatId}.json.tmp`);

      // Safe backup of previous valid file before replacement
      if (fs.existsSync(targetFile)) {
        try {
          const bakFile = path.join(this.groupsBackupDir, `${numChatId}.json.bak`);
          fs.copyFileSync(targetFile, bakFile);
        } catch {}
      }

      // Safe atomic write (write to .tmp then rename)
      const jsonContent = JSON.stringify(safeData, null, 2);
      fs.writeFileSync(tmpFile, jsonContent, 'utf-8');
      fs.renameSync(tmpFile, targetFile);
      this.lastSaveSuccessful = true;
      this.lastSaveTimestamps.set(String(numChatId), new Date().toISOString());
    } catch (err: any) {
      this.lastSaveSuccessful = false;
      console.error(`[Storage] Failed to save group ${chatId} JSON:`, err.message);
    }
  }

  public async saveGroupJson(chatId: number | string): Promise<void> {
    const key = String(chatId);
    const prev = this.groupWriteQueues.get(key) || Promise.resolve();
    const next = prev
      .then(async () => {
        this.saveGroupJsonSync(chatId);
      })
      .catch((err) => {
        console.error(`[Storage] Error in write queue for group ${chatId}:`, err);
      });
    this.groupWriteQueues.set(key, next);
    return next;
  }

  public loadAllGroupJsons(): { loadedCount: number; errorsCount: number } {
    this.ensureDirectories();
    let loadedCount = 0;
    let errorsCount = 0;

    try {
      const files = fs.readdirSync(this.groupsDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;

        const filePath = path.join(this.groupsDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          if (!raw.trim()) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch (parseErr: any) {
            console.error(`[Storage] Failed to load group ${file}: JSON parse error:`, parseErr.message);
            // Attempt recovery from backup
            const chatIdStr = file.replace('.json', '');
            const bakFile = path.join(this.groupsBackupDir, `${chatIdStr}.json.bak`);
            if (fs.existsSync(bakFile)) {
              try {
                const bakRaw = fs.readFileSync(bakFile, 'utf-8');
                parsed = JSON.parse(bakRaw);
                console.log(`[Storage] Successfully recovered corrupted group ${file} from backup ${bakFile}`);
                this.corruptedRecoveries.set(chatIdStr, 'recovered_from_backup');
                fs.writeFileSync(filePath, bakRaw, 'utf-8');
              } catch (bakErr: any) {
                console.error(`[Storage] Backup recovery failed for group ${file}:`, bakErr.message);
                this.corruptedRecoveries.set(chatIdStr, 'backup_failed');
              }
            }
            if (!parsed) {
              errorsCount++;
              this.corruptedFilesCount++;
              const numId = Number(chatIdStr);
              if (!isNaN(numId)) {
                this.getGroupSettings(numId);
              }
              continue;
            }
          }

          if (parsed && (parsed.schemaVersion === 1 || parsed.chat?.chatId || parsed.settings)) {
            const chatId = Number(parsed.chat?.chatId || parsed.settings?.chatId || file.replace('.json', ''));
            if (!isNaN(chatId) && chatId < 0) {
              this.restoreGroupData(chatId, parsed);
              loadedCount++;
            }
          }
        } catch (readErr: any) {
          console.error(`[Storage] Failed to load group ${file}:`, readErr.message);
          errorsCount++;
        }
      }
    } catch (err: any) {
      console.error('[Storage] Error reading groups directory:', err);
    }

    return { loadedCount, errorsCount };
  }

  public restoreGroupData(chatId: number, data: any): void {
    const key = String(chatId);

    // 1. Settings restoration
    const incomingSettings = data.settings || {};
    const existingSettings = this.getGroupSettings(chatId);

    const mergedSettings: GroupSettings = {
      ...existingSettings,
      ...incomingSettings,
      chatTitle: data.chat?.title || incomingSettings.chatTitle || existingSettings.chatTitle || `Group ${chatId}`,
      botLeft: data.status?.botLeft !== undefined ? Boolean(data.status.botLeft) : incomingSettings.botLeft,
      leftAt: data.status?.leftAt || incomingSettings.leftAt,
      unavailable: data.status?.unavailable !== undefined ? Boolean(data.status.unavailable) : incomingSettings.unavailable,
      unavailableAt: data.status?.unavailableAt || incomingSettings.unavailableAt,
      unavailableReason: data.status?.unavailableReason || incomingSettings.unavailableReason,
      updatedAt: data.updatedAt || new Date().toISOString()
    };

    // Restore sticker packs
    if (Array.isArray(data.stickerPacks)) {
      if (!mergedSettings.stickerPacks) mergedSettings.stickerPacks = {};
      for (const pack of data.stickerPacks) {
        if (pack?.name) {
          mergedSettings.stickerPacks[pack.name.toLowerCase().trim()] = pack;
        }
      }
    }

    // Restore autoResponse & autoSticker (with runtime timestamps)
    if (data.autoResponse) {
      mergedSettings.autoResponse = {
        ...(mergedSettings.autoResponse || {}),
        ...data.autoResponse
      };
    }
    if (data.autoSticker) {
      mergedSettings.autoSticker = {
        ...(mergedSettings.autoSticker || {}),
        ...data.autoSticker
      };
    }

    // Restore abuse words
    if (Array.isArray(data.abuseWords)) {
      mergedSettings.abuseWords = data.abuseWords;
      mergedSettings.customAbusiveWords = data.abuseWords;
    }

    this.data.settings[chatId] = mergedSettings;

    // 2. Messages restoration
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      if (!this.data.groupConversationMemories) this.data.groupConversationMemories = {};
      this.data.groupConversationMemories[key] = {
        chatId,
        messages: data.messages.slice(-GROUP_MEMORY_LIMIT),
        lastUpdated: Date.now()
      };
      if (this.data.groupMemories) {
        this.data.groupMemories[key] = this.data.groupConversationMemories[key];
      }
    }

    // 3. Media library restoration
    if (data.stickers?.mediaLibrary) {
      if (!this.data.groupMediaLibraries) this.data.groupMediaLibraries = {};
      this.data.groupMediaLibraries[key] = data.stickers.mediaLibrary;
    }

    // 4. Permissions restoration
    if (data.permissions?.contentPermissions) {
      if (!this.data.contentPermissions) this.data.contentPermissions = {};
      this.data.contentPermissions[key] = data.permissions.contentPermissions;
    }
    if (data.permissions?.customRoles) {
      if (!this.data.customRoles) this.data.customRoles = {};
      this.data.customRoles[key] = data.permissions.customRoles;
    }

    // 5. Moderation items
    if (data.moderation?.approvedUsers) {
      if (!this.data.approvedUsers) this.data.approvedUsers = {};
      this.data.approvedUsers[key] = data.moderation.approvedUsers;
    }
    if (Array.isArray(data.moderation?.warnings)) {
      for (const w of data.moderation.warnings) {
        if (!this.data.warnings.some((x: any) => x.id === w.id)) {
          this.data.warnings.push(w);
        }
      }
    }
    if (Array.isArray(data.moderation?.tempActions)) {
      for (const t of data.moderation.tempActions) {
        if (!this.data.tempActions.some((x: any) => x.id === t.id)) {
          this.data.tempActions.push(t);
        }
      }
    }

    // 6. Notes & Schedules
    if (data.statistics?.notes) {
      if (!this.data.notes) this.data.notes = {};
      this.data.notes[key] = data.statistics.notes;
    }
    if (Array.isArray(data.statistics?.schedules)) {
      for (const s of data.statistics.schedules) {
        if (!this.data.schedules.some((x: any) => x.id === s.id)) {
          this.data.schedules.push(s);
        }
      }
    }

    // 7. Activity logs
    if (Array.isArray(data.activity)) {
      for (const log of data.activity) {
        if (!this.data.logs.some((l: any) => l.id === log.id)) {
          this.data.logs.push(log);
        }
      }
    }

    // 8. User lust levels
    if (Array.isArray(data.lustMode?.userLustLevels)) {
      if (!this.data.userLustLevels) this.data.userLustLevels = {};
      for (const ul of data.lustMode.userLustLevels) {
        this.data.userLustLevels[`${ul.groupId}_${ul.userId}`] = ul;
      }
    }
  }

  public scheduleSave(chatId?: number | string) {
    this.lastSaveSuccessful = true;
    if (chatId !== undefined && chatId !== null) {
      const numId = Number(chatId);
      if (!isNaN(numId)) {
        if (numId < 0) {
          this.saveGroupJsonSync(numId);
        } else if (numId > 0) {
          this.savePrivateJsonSync(numId);
        }
      }
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persist();
      this.saveGlobalJsonSync();
    }, 200);
  }

  private persist() {
    this.cleanOldLogs();
    this.cleanExpiredMemories();
    try {
      this.ensureDirectories();
      const tempFile = `${this.dbFile}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, this.dbFile);
      this.lastSaveSuccessful = true;
    } catch (err) {
      this.lastSaveSuccessful = false;
      console.error('Error persisting database:', err);
    }
  }

  // --- Private Chat JSON Persistence ---
  public buildPrivateDataObject(chatId: number | string): any {
    const key = String(chatId);
    const conv = this.data.privateConversations?.[key] || {
      chatId,
      userId: Number(chatId),
      messages: [],
      lastUpdated: Date.now()
    };
    return {
      schemaVersion: 1,
      chatId: String(conv.chatId),
      userId: conv.userId || Number(chatId),
      username: conv.username || null,
      name: conv.name || null,
      language: conv.language || 'English',
      lastUpdated: conv.lastUpdated,
      messages: conv.messages || [],
      lustLevel: this.getLustLevel(chatId, Number(chatId)),
      updatedAt: new Date().toISOString()
    };
  }

  public savePrivateJsonSync(chatId: number | string): void {
    const numChatId = Number(chatId);
    if (isNaN(numChatId) || numChatId <= 0) return;

    try {
      this.ensureDirectories();
      const rawData = this.buildPrivateDataObject(numChatId);
      const safeData = this.sanitizeGroupData(rawData);
      const targetFile = path.join(this.privateDir, `${numChatId}.json`);
      const tmpFile = path.join(this.privateDir, `${numChatId}.json.tmp`);

      if (fs.existsSync(targetFile)) {
        try {
          const bakFile = path.join(this.privateBackupDir, `${numChatId}.json.bak`);
          fs.copyFileSync(targetFile, bakFile);
        } catch {}
      }

      const jsonContent = JSON.stringify(safeData, null, 2);
      fs.writeFileSync(tmpFile, jsonContent, 'utf-8');
      fs.renameSync(tmpFile, targetFile);
      this.lastSaveSuccessful = true;
      this.lastSaveTimestamps.set(String(numChatId), new Date().toISOString());
    } catch (err: any) {
      this.lastSaveSuccessful = false;
      console.error(`[Storage] Failed to save private chat ${chatId} JSON:`, err.message);
    }
  }

  public async savePrivateJson(chatId: number | string): Promise<void> {
    const key = String(chatId);
    const prev = this.groupWriteQueues.get(`priv_${key}`) || Promise.resolve();
    const next = prev
      .then(async () => {
        this.savePrivateJsonSync(chatId);
      })
      .catch((err) => {
        console.error(`[Storage] Error in write queue for private chat ${chatId}:`, err);
      });
    this.groupWriteQueues.set(`priv_${key}`, next);
    return next;
  }

  public restorePrivateData(chatId: string | number, data: any): void {
    const key = String(chatId);
    if (!this.data.privateConversations) this.data.privateConversations = {};

    const existing = this.data.privateConversations[key] || {
      chatId,
      userId: Number(chatId),
      messages: [],
      lastUpdated: Date.now()
    };

    const mergedMessages = Array.isArray(data.messages) ? data.messages : existing.messages;

    this.data.privateConversations[key] = {
      ...existing,
      chatId: data.chatId || existing.chatId,
      userId: data.userId || existing.userId || Number(chatId),
      username: data.username || existing.username,
      name: data.name || existing.name,
      language: data.language || existing.language || 'English',
      lastUpdated: data.lastUpdated || existing.lastUpdated || Date.now(),
      messages: mergedMessages
    };

    if (data.lustLevel !== undefined) {
      this.setLustLevel(chatId, Number(chatId), Number(data.lustLevel));
    }
  }

  public loadAllPrivateJsons(): { loadedCount: number; errorsCount: number } {
    this.ensureDirectories();
    let loadedCount = 0;
    let errorsCount = 0;

    try {
      if (!fs.existsSync(this.privateDir)) return { loadedCount, errorsCount };
      const files = fs.readdirSync(this.privateDir);
      for (const file of files) {
        if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;

        const filePath = path.join(this.privateDir, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          if (!raw.trim()) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch (parseErr: any) {
            console.error(`[Storage] Failed to load private chat ${file}: JSON parse error:`, parseErr.message);
            const chatIdStr = file.replace('.json', '');
            const bakFile = path.join(this.privateBackupDir, `${chatIdStr}.json.bak`);
            if (fs.existsSync(bakFile)) {
              try {
                const bakRaw = fs.readFileSync(bakFile, 'utf-8');
                parsed = JSON.parse(bakRaw);
                console.log(`[Storage] Successfully recovered corrupted private chat ${file} from backup ${bakFile}`);
                fs.writeFileSync(filePath, bakRaw, 'utf-8');
              } catch {}
            }
            if (!parsed) {
              errorsCount++;
              continue;
            }
          }

          if (parsed && (parsed.chatId || parsed.userId)) {
            const chatId = String(parsed.chatId || parsed.userId || file.replace('.json', ''));
            this.restorePrivateData(chatId, parsed);
            loadedCount++;
          }
        } catch (readErr: any) {
          console.error(`[Storage] Failed to load private chat ${file}:`, readErr.message);
          errorsCount++;
        }
      }
    } catch (err: any) {
      console.error('[Storage] Error reading private chats directory:', err);
    }

    return { loadedCount, errorsCount };
  }

  // --- Global JSON Persistence ---
  public saveGlobalJsonSync(): void {
    try {
      this.ensureDirectories();
      const globalData = {
        schemaVersion: 1,
        globalSettings: this.getGlobalSettings(),
        customRoles: this.data.customRoles || {},
        mediaLibrary: this.data.mediaLibrary || { stickers: {}, animations: {}, stickerMetadata: {} },
        schedules: this.data.schedules || [],
        logs: (this.data.logs || []).slice(-200),
        knownUsers: this.data.knownUsers || {},
        knownUsersById: this.data.knownUsersById || {},
        updatedAt: new Date().toISOString()
      };
      const safeData = this.sanitizeGroupData(globalData);
      const targetFile = this.globalFile;
      const tmpFile = `${targetFile}.tmp`;
      const jsonContent = JSON.stringify(safeData, null, 2);
      fs.writeFileSync(tmpFile, jsonContent, 'utf-8');
      fs.renameSync(tmpFile, targetFile);
    } catch (err: any) {
      console.error('[Storage] Failed to save global.json:', err.message);
    }
  }

  public loadGlobalJson(): void {
    try {
      if (!fs.existsSync(this.globalFile)) return;
      const raw = fs.readFileSync(this.globalFile, 'utf-8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      if (parsed) {
        if (parsed.globalSettings) {
          this.data.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS, ...parsed.globalSettings };
        }
        if (parsed.customRoles) this.data.customRoles = { ...this.data.customRoles, ...parsed.customRoles };
        if (parsed.mediaLibrary) this.data.mediaLibrary = { ...this.data.mediaLibrary, ...parsed.mediaLibrary };
        if (Array.isArray(parsed.schedules) && parsed.schedules.length > 0) {
          const existingIds = new Set((this.data.schedules || []).map(s => s.id));
          for (const s of parsed.schedules) {
            if (!existingIds.has(s.id)) this.data.schedules.push(s);
          }
        }
        if (parsed.knownUsers) this.data.knownUsers = { ...this.data.knownUsers, ...parsed.knownUsers };
        if (parsed.knownUsersById) this.data.knownUsersById = { ...this.data.knownUsersById, ...parsed.knownUsersById };
      }
    } catch (err: any) {
      console.error('[Storage] Error loading global.json:', err.message);
    }
  }

  public getGlobalSettings(): GlobalSettings {
    if (!this.data.globalSettings) {
      this.data.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
    }
    return { ...this.data.globalSettings };
  }

  public updateGlobalSettings(updates: Partial<GlobalSettings>): GlobalSettings {
    if (!this.data.globalSettings) {
      this.data.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
    }
    for (const [k, v] of Object.entries(updates)) {
      if (typeof v === 'boolean') {
        (this.data.globalSettings as any)[k] = v;
      }
    }
    this.saveGlobalJsonSync();
    return { ...this.data.globalSettings };
  }

  public resetGroupSettings(chatId: number): GroupSettings {
    const numId = Number(chatId);
    const existingTitle = this.data.settings?.[numId]?.chatTitle;
    if (this.data.settings && this.data.settings[numId]) {
      delete this.data.settings[numId];
    }
    const fresh = this.getGroupSettings(numId, existingTitle);
    this.saveGroupJsonSync(numId);
    return fresh;
  }

  public resetGroupLustState(chatId: number | string): void {
    const numId = Number(chatId);
    this.updateGroupSettings(numId, { lustLevel: 0 });
    this.resetLustLevel(numId);
    this.saveGroupJsonSync(numId);
  }

  public getGroupUserLustLevels(groupId: number | string): UserLustLevelRecord[] {
    if (!this.data.userLustLevels) return [];
    const prefix = `${groupId}_`;
    return Object.entries(this.data.userLustLevels)
      .filter(([k]) => k.startsWith(prefix))
      .map(([_, v]) => v);
  }

  public getGroupMembers(chatId: number | string): Array<{
    userId: number;
    username?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    customRole?: string;
    lastActive?: string;
  }> {
    const numId = Number(chatId);
    const prefix = `${numId}_`;
    const membersMap = new Map<number, {
      userId: number;
      username?: string;
      firstName?: string;
      lastName?: string;
      role?: string;
      customRole?: string;
      lastActive?: string;
    }>();

    // 1. From groupMembers
    if (this.data.groupMembers) {
      for (const [k, member] of Object.entries(this.data.groupMembers)) {
        if (k.startsWith(prefix) && member.userId) {
          membersMap.set(member.userId, {
            userId: member.userId,
            username: member.username,
            firstName: member.firstName,
            lastName: member.lastName,
            role: (member as any).role || member.customRole || 'member',
            customRole: member.customRole,
            lastActive: member.lastSeen
          });
        }
      }
    }

    // 2. From group conversation memory
    const memory = this.getGroupMemory(numId);
    for (const msg of memory) {
      if (msg.role === 'user' && msg.sender) {
        const uId = (msg as any).userId;
        if (uId && !membersMap.has(uId)) {
          membersMap.set(uId, {
            userId: uId,
            username: msg.username,
            firstName: msg.name || msg.displayName,
            role: 'member',
            lastActive: new Date(msg.timestamp).toISOString()
          });
        }
      }
    }

    // 3. Fallback: knownUsersById
    if (membersMap.size === 0 && this.data.knownUsersById) {
      for (const [uId, u] of Object.entries(this.data.knownUsersById)) {
        membersMap.set(Number(uId), {
          userId: Number(uId),
          username: u.username,
          firstName: u.firstName,
          lastName: u.lastName,
          role: (u as any).role || u.customRole || 'member',
          lastActive: u.lastSeen
        });
        if (membersMap.size >= 25) break;
      }
    }

    return Array.from(membersMap.values());
  }

  public updateCustomSticker(
    fileId: string,
    updates: { mood?: string; category?: string; enabled?: boolean },
    chatId?: number | string
  ): boolean {
    const lib = this.getMediaLibrary(chatId);
    if (!lib.stickerMetadata || !lib.stickerMetadata[fileId]) {
      return false;
    }
    const meta = lib.stickerMetadata[fileId];
    if (updates.mood) meta.mood = updates.mood;
    if (updates.category) (meta as any).category = updates.category;
    if (updates.enabled !== undefined) (meta as any).enabled = updates.enabled;
    this.scheduleSave(chatId);
    return true;
  }

  // --- Group Export, Storage Status & System Health ---
  public getGroupStorageStatus(chatId: number | string): {
    chatId: string;
    storagePath: string;
    fileExists: boolean;
    lastModified: string | null;
    fileSize: number;
    schemaVersion: number;
    lastSuccessfulSave: string | null;
    pendingWrites: number;
    corruptionRecoveryStatus: string;
  } {
    const numId = Number(chatId);
    const key = String(numId);
    const targetFile = path.join(this.groupsDir, `${numId}.json`);
    const exists = fs.existsSync(targetFile);
    let mtime: string | null = null;
    let size = 0;
    if (exists) {
      try {
        const stat = fs.statSync(targetFile);
        mtime = stat.mtime.toISOString();
        size = stat.size;
      } catch {}
    }
    return {
      chatId: key,
      storagePath: targetFile,
      fileExists: exists,
      lastModified: mtime,
      fileSize: size,
      schemaVersion: 1,
      lastSuccessfulSave: this.lastSaveTimestamps.get(key) || mtime || null,
      pendingWrites: this.groupWriteQueues.has(key) ? 1 : 0,
      corruptionRecoveryStatus: this.corruptedRecoveries.get(key) || 'healthy'
    };
  }

  public getGroupExportData(chatId: number | string): any {
    const numId = Number(chatId);
    const targetFile = path.join(this.groupsDir, `${numId}.json`);
    if (fs.existsSync(targetFile)) {
      try {
        return JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
      } catch {}
    }
    return this.sanitizeGroupData(this.buildGroupDataObject(numId));
  }

  public getPersistenceHealth(): {
    status: 'healthy' | 'warning' | 'error';
    dataDir: string;
    storageMode: 'persistent-path' | 'local-fallback';
    isRender: boolean;
    renderPersistentConfigured: boolean;
    directoryWritable: boolean;
    filesReadable: boolean;
    lastSaveSuccessful: boolean;
    pendingWritesCount: number;
    corruptedFilesCount: number;
    recoveredFilesCount: number;
    groupsCount: number;
    privateChatsCount: number;
  } {
    let writable = false;
    let readable = false;
    try {
      this.ensureDirectories();
      readable = fs.existsSync(this.groupsDir);
      const testFile = path.join(this.dataDir, `.canary_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok', 'utf-8');
      fs.unlinkSync(testFile);
      writable = true;
    } catch {
      writable = false;
    }

    const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
    const hasExplicitDataDir = Boolean(process.env.ROXIE_DATA_DIR);

    let status: 'healthy' | 'warning' | 'error' = 'healthy';
    if (!writable || !readable) {
      status = 'error';
    } else if ((isRender && !hasExplicitDataDir) || this.corruptedFilesCount > 0) {
      status = 'warning';
    }

    const groupsFiles = fs.existsSync(this.groupsDir)
      ? fs.readdirSync(this.groupsDir).filter(f => f.endsWith('.json') && !f.endsWith('.tmp')).length
      : 0;
    const privateFiles = fs.existsSync(this.privateDir)
      ? fs.readdirSync(this.privateDir).filter(f => f.endsWith('.json') && !f.endsWith('.tmp')).length
      : 0;

    return {
      status,
      dataDir: this.dataDir,
      storageMode: hasExplicitDataDir ? 'persistent-path' : 'local-fallback',
      isRender,
      renderPersistentConfigured: hasExplicitDataDir,
      directoryWritable: writable,
      filesReadable: readable,
      lastSaveSuccessful: this.lastSaveSuccessful,
      pendingWritesCount: this.groupWriteQueues.size,
      corruptedFilesCount: this.corruptedFilesCount,
      recoveredFilesCount: this.corruptedRecoveries.size,
      groupsCount: groupsFiles,
      privateChatsCount: privateFiles
    };
  }

  public async flushAll(): Promise<void> {
    const allPending = Array.from(this.groupWriteQueues.values());
    await Promise.all(allPending);

    if (this.data.settings) {
      for (const idStr of Object.keys(this.data.settings)) {
        const numId = Number(idStr);
        if (!isNaN(numId) && numId < 0) {
          this.saveGroupJsonSync(numId);
        }
      }
    }

    if (this.data.privateConversations) {
      for (const idStr of Object.keys(this.data.privateConversations)) {
        const numId = Number(idStr);
        if (!isNaN(numId) && numId > 0) {
          this.savePrivateJsonSync(numId);
        }
      }
    }

    this.saveGlobalJsonSync();
    try {
      this.persist();
    } catch {}
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
    this.scheduleSave(chatId);
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
        autoResponse: {
          enabled: true,
          mode: 'every_message',
          cooldownSeconds: 30,
          randomize: false,
          minSeconds: 30,
          maxSeconds: 120,
          lastResponseTimestamp: 0
        },
        autoSticker: {
          enabled: true,
          mode: 'cooldown',
          cooldownSeconds: 60,
          randomize: false,
          minSeconds: 60,
          maxSeconds: 300,
          lastStickerTimestamp: 0
        },
        stickerPacks: {},
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
      if (!s.autoResponse) {
        s.autoResponse = {
          enabled: true,
          mode: 'every_message',
          cooldownSeconds: 30,
          randomize: false,
          minSeconds: 30,
          maxSeconds: 120,
          lastResponseTimestamp: 0
        };
        needsSave = true;
      }
      if (!s.autoSticker) {
        s.autoSticker = {
          enabled: true,
          mode: 'cooldown',
          cooldownSeconds: 60,
          randomize: false,
          minSeconds: 60,
          maxSeconds: 300,
          lastStickerTimestamp: 0
        };
        needsSave = true;
      }
      if (!s.stickerPacks) {
        s.stickerPacks = {};
        needsSave = true;
      }

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
    const mergedAutoResponse = updates.autoResponse
      ? { ...(current.autoResponse || {}), ...updates.autoResponse }
      : current.autoResponse;
    if (mergedAutoResponse && updates.autoResponse?.lastResponseTimestamp === 0 && !updates.autoResponse.nextAllowedAt) {
      mergedAutoResponse.nextAllowedAt = 0;
    }

    const mergedAutoSticker = updates.autoSticker
      ? { ...(current.autoSticker || {}), ...updates.autoSticker }
      : current.autoSticker;
    if (mergedAutoSticker && updates.autoSticker?.lastStickerTimestamp === 0 && !updates.autoSticker.nextAllowedAt) {
      mergedAutoSticker.nextAllowedAt = 0;
    }

    const updated = {
      ...current,
      ...updates,
      autoResponse: mergedAutoResponse,
      autoSticker: mergedAutoSticker,
      updatedAt: new Date().toISOString()
    };
    this.data.settings[chatId] = updated;
    this.scheduleSave(chatId);
    return updated;
  }

  // --- Abuse Words Management ---
  public getAbuseWords(chatId: number | string): string[] {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    return settings.abuseWords || settings.customAbusiveWords || [];
  }

  public addAbuseWord(chatId: number | string, word: string): string[] {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.abuseWords) {
      settings.abuseWords = settings.customAbusiveWords ? [...settings.customAbusiveWords] : [];
    }
    const clean = word.toLowerCase().trim();
    if (clean && !settings.abuseWords.includes(clean)) {
      settings.abuseWords.push(clean);
      settings.customAbusiveWords = settings.abuseWords;
      this.scheduleSave(numId);
    }
    return settings.abuseWords;
  }

  public removeAbuseWord(chatId: number | string, word: string): string[] {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.abuseWords) {
      settings.abuseWords = settings.customAbusiveWords ? [...settings.customAbusiveWords] : [];
    }
    const clean = word.toLowerCase().trim();
    settings.abuseWords = settings.abuseWords.filter(w => w.toLowerCase() !== clean);
    settings.customAbusiveWords = settings.abuseWords;
    this.scheduleSave(numId);
    return settings.abuseWords;
  }

  public clearAbuseWords(chatId: number | string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.abuseWords = [];
    settings.customAbusiveWords = [];
    this.scheduleSave(numId);
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
    this.scheduleSave(record.chatId);

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
    this.scheduleSave(chatId);

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
    this.scheduleSave(chatId);
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
    this.scheduleSave(chatId);
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
      this.scheduleSave(chatId);
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
      this.scheduleSave(chatId);
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
    this.scheduleSave(chatId);
    return record;
  }

  public unapproveUser(chatId: number, userId: number): boolean {
    if (!this.data.approvedUsers) return false;
    const key = `${chatId}_${userId}`;
    if (this.data.approvedUsers[key]) {
      delete this.data.approvedUsers[key];
      this.scheduleSave(chatId);
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
    const mediaLib = this.getMediaLibrary();

    return {
      version: '3.1',
      exportedAt: new Date().toISOString(),
      chatId,
      groupTitle: s.chatTitle || 'Roxie Protected Group',
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
        autoDeleteJoinLeave: s.autoDeleteJoinLeave ?? true,
        locks,
        welcomeEnabled: s.welcomeEnabled,
        welcomeMessage: s.welcomeMessage,
        goodbyeEnabled: s.goodbyeEnabled,
        goodbyeMessage: s.goodbyeMessage,
        slowModeSeconds: s.slowModeSeconds,
        reportsEnabled: s.reportsEnabled,
        chatbotEnabled: s.chatbotEnabled ?? true,
        chatbotMode: s.chatbotMode || 'auto',
        reactionEnabled: s.reactionEnabled ?? true,
        reactionProbability: s.reactionProbability ?? 0.15,
        protectionEnabled: s.protectionEnabled ?? true,
        protectionFloodCount: s.protectionFloodCount ?? 5,
        protectionFloodWindow: s.protectionFloodWindow ?? 5,
        protectionDuplicateLimit: s.protectionDuplicateLimit ?? 3,
        protectionLinkBurstLimit: s.protectionLinkBurstLimit ?? 3,
        stopSpamEnabled: s.stopSpamEnabled ?? false,
        stopAbusiveEnabled: s.stopAbusiveEnabled ?? false,
        stopPromotionEnabled: s.stopPromotionEnabled ?? false,
        automodEnabled: s.automodEnabled ?? false,
        securityEnabled: s.securityEnabled ?? false,
        joinmode: s.joinmode || 'normal',
        autoAcceptEnabled: s.autoAcceptEnabled ?? false
      },
      filters,
      notes: notes.map((n) => ({ name: n.name, content: n.content })),
      mediaLibrary: {
        stickers: mediaLib.stickers || {},
        animations: mediaLib.animations || {},
        stickerMetadata: mediaLib.stickerMetadata || {}
      }
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
    if (typeof s.autoDeleteJoinLeave === 'boolean') { updates.autoDeleteJoinLeave = s.autoDeleteJoinLeave; appliedCount++; }
    if (s.locks && typeof s.locks === 'object') { updates.locks = s.locks; appliedCount++; }
    if (typeof s.welcomeEnabled === 'boolean') { updates.welcomeEnabled = s.welcomeEnabled; appliedCount++; }
    if (typeof s.welcomeMessage === 'string') { updates.welcomeMessage = s.welcomeMessage; appliedCount++; }
    if (typeof s.goodbyeEnabled === 'boolean') { updates.goodbyeEnabled = s.goodbyeEnabled; appliedCount++; }
    if (typeof s.goodbyeMessage === 'string') { updates.goodbyeMessage = s.goodbyeMessage; appliedCount++; }
    if (typeof s.reportsEnabled === 'boolean') { updates.reportsEnabled = s.reportsEnabled; appliedCount++; }
    if (typeof s.chatbotEnabled === 'boolean') { updates.chatbotEnabled = s.chatbotEnabled; appliedCount++; }
    if (typeof s.chatbotMode === 'string') { updates.chatbotMode = s.chatbotMode; appliedCount++; }
    if (typeof s.reactionEnabled === 'boolean') { updates.reactionEnabled = s.reactionEnabled; appliedCount++; }
    if (typeof s.reactionProbability === 'number') { updates.reactionProbability = s.reactionProbability; appliedCount++; }
    if (typeof s.protectionEnabled === 'boolean') { updates.protectionEnabled = s.protectionEnabled; appliedCount++; }
    if (typeof s.protectionFloodCount === 'number') { updates.protectionFloodCount = s.protectionFloodCount; appliedCount++; }
    if (typeof s.protectionFloodWindow === 'number') { updates.protectionFloodWindow = s.protectionFloodWindow; appliedCount++; }
    if (typeof s.protectionDuplicateLimit === 'number') { updates.protectionDuplicateLimit = s.protectionDuplicateLimit; appliedCount++; }
    if (typeof s.protectionLinkBurstLimit === 'number') { updates.protectionLinkBurstLimit = s.protectionLinkBurstLimit; appliedCount++; }
    if (typeof s.stopSpamEnabled === 'boolean') { updates.stopSpamEnabled = s.stopSpamEnabled; appliedCount++; }
    if (typeof s.stopAbusiveEnabled === 'boolean') { updates.stopAbusiveEnabled = s.stopAbusiveEnabled; appliedCount++; }
    if (typeof s.stopPromotionEnabled === 'boolean') { updates.stopPromotionEnabled = s.stopPromotionEnabled; appliedCount++; }
    if (typeof s.automodEnabled === 'boolean') { updates.automodEnabled = s.automodEnabled; appliedCount++; }
    if (typeof s.securityEnabled === 'boolean') { updates.securityEnabled = s.securityEnabled; appliedCount++; }
    if (['normal', 'captcha', 'strict'].includes(s.joinmode)) { updates.joinmode = s.joinmode; appliedCount++; }
    if (typeof s.autoAcceptEnabled === 'boolean') { updates.autoAcceptEnabled = s.autoAcceptEnabled; appliedCount++; }

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

    // Import media library stickers & animations & metadata if present
    if (config.mediaLibrary && typeof config.mediaLibrary === 'object') {
      const ml = config.mediaLibrary;
      if (ml.stickers && typeof ml.stickers === 'object') {
        for (const [mood, fileIds] of Object.entries(ml.stickers)) {
          if (Array.isArray(fileIds)) {
            for (const fId of fileIds) {
              if (typeof fId === 'string' && fId.length >= 15) {
                const meta = ml.stickerMetadata && ml.stickerMetadata[fId] ? ml.stickerMetadata[fId] : undefined;
                this.addStickerToLibrary(mood, fId, meta);
                appliedCount++;
              }
            }
          }
        }
      }
      if (ml.animations && typeof ml.animations === 'object') {
        for (const [mood, fileIds] of Object.entries(ml.animations)) {
          if (Array.isArray(fileIds)) {
            for (const fId of fileIds) {
              if (typeof fId === 'string' && fId.length >= 15) {
                this.addAnimationToLibrary(mood, fId);
                appliedCount++;
              }
            }
          }
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
    this.scheduleSave(record.chatId);
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
      this.scheduleSave(chatId);
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

    this.scheduleSave(chatId);
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
      this.scheduleSave(chatId);
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
    this.scheduleSave(schedule.chatId);
    return newSchedule;
  }

  public deleteSchedule(chatId: number, scheduleId: string): boolean {
    const initial = this.data.schedules.length;
    this.data.schedules = this.data.schedules.filter(
      (s) => !(s.chatId === chatId && s.id.toUpperCase() === scheduleId.toUpperCase())
    );
    const changed = initial > this.data.schedules.length;
    if (changed) {
      this.scheduleSave(chatId);
    }
    return changed;
  }

  public updateScheduleNextRun(id: string, nextRun: string): void {
    const s = this.data.schedules.find((x) => x.id === id);
    if (s) {
      s.nextRun = nextRun;
      s.runsCount = (s.runsCount || 0) + 1;
      this.scheduleSave(s.chatId);
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
    const targetChatId = (log as any).groupId || (log as any).chatId || (log as any).targetChatId;
    this.scheduleSave(targetChatId);
    return entry;
  }

  public logAction(log: any): ModerationLog {
    return this.addLog(log);
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

  public getMediaLibrary(chatId?: number | string): MediaLibraryRecord {
    if (chatId !== undefined && chatId !== null && String(chatId).trim() !== '') {
      const key = String(chatId);
      if (!this.data.groupMediaLibraries) {
        this.data.groupMediaLibraries = {};
      }
      if (!this.data.groupMediaLibraries[key]) {
        this.data.groupMediaLibraries[key] = { stickers: {}, animations: {}, stickerMetadata: {} };
      }
      if (!this.data.groupMediaLibraries[key].stickerMetadata) {
        this.data.groupMediaLibraries[key].stickerMetadata = {};
      }
      if (!this.data.groupMediaLibraries[key].stickers) {
        this.data.groupMediaLibraries[key].stickers = {};
      }
      if (!this.data.groupMediaLibraries[key].animations) {
        this.data.groupMediaLibraries[key].animations = {};
      }
      return this.data.groupMediaLibraries[key];
    }

    if (!this.data.mediaLibrary) {
      this.data.mediaLibrary = { stickers: {}, animations: {}, stickerMetadata: {} };
    }
    if (!this.data.mediaLibrary.stickerMetadata) {
      this.data.mediaLibrary.stickerMetadata = {};
    }
    if (!this.data.mediaLibrary.stickers) {
      this.data.mediaLibrary.stickers = {};
    }
    if (!this.data.mediaLibrary.animations) {
      this.data.mediaLibrary.animations = {};
    }
    return this.data.mediaLibrary;
  }

  public addStickerToLibrary(mood: string, fileId: string, meta?: StickerMetaRecord, chatId?: number | string): boolean {
    const lib = this.getMediaLibrary(chatId);
    const normalizedMood = mood.toLowerCase().trim();
    if (!lib.stickers[normalizedMood]) {
      lib.stickers[normalizedMood] = [];
    }

    // Check capacity limit for distinct sticker packs if adding with pack metadata
    if (meta && meta.packName) {
      if (!lib.stickerMetadata) lib.stickerMetadata = {};
      const existingPackNames = new Set(
        Object.values(lib.stickerMetadata)
          .map((m) => m.packName)
          .filter(Boolean)
      );

      if (existingPackNames.size >= StorageManager.MAX_PACKS_PER_GROUP && !existingPackNames.has(meta.packName)) {
        console.warn(`[STORAGE] Group sticker pack limit reached (${StorageManager.MAX_PACKS_PER_GROUP} packs). Cannot add new pack: ${meta.packName}`);
        return false;
      }
    }

    if (!lib.stickerMetadata) lib.stickerMetadata = {};
    const metaRecord: StickerMetaRecord = {
      chatId,
      source: chatId ? 'custom' : 'default',
      addedAt: new Date().toISOString(),
      ...(meta || {}),
      fileId,
      mood: normalizedMood
    };
    if (chatId) {
      metaRecord.source = 'custom';
      metaRecord.chatId = chatId;
    }
    lib.stickerMetadata[fileId] = metaRecord;

    if (!lib.stickers[normalizedMood].includes(fileId)) {
      lib.stickers[normalizedMood].push(fileId);
      this.scheduleSave(chatId);
      return true; // newly added
    }
    return false; // already existed
  }

  public addAnimationToLibrary(mood: string, fileId: string, chatId?: number | string): boolean {
    const lib = this.getMediaLibrary(chatId);
    const normalizedMood = mood.toLowerCase().trim();
    if (!lib.animations[normalizedMood]) {
      lib.animations[normalizedMood] = [];
    }
    if (!lib.animations[normalizedMood].includes(fileId)) {
      lib.animations[normalizedMood].push(fileId);
      this.scheduleSave(chatId);
      return true;
    }
    return false;
  }

  public removeMediaFromLibrary(fileId: string, chatId?: number | string): boolean {
    const lib = this.getMediaLibrary(chatId);
    let removed = false;
    for (const mood of Object.keys(lib.stickers || {})) {
      const idx = lib.stickers[mood].indexOf(fileId);
      if (idx !== -1) {
        lib.stickers[mood].splice(idx, 1);
        removed = true;
      }
    }
    if (lib.lustStickers) {
      for (const mood of Object.keys(lib.lustStickers)) {
        const idx = lib.lustStickers[mood].indexOf(fileId);
        if (idx !== -1) {
          lib.lustStickers[mood].splice(idx, 1);
          removed = true;
        }
      }
    }
    for (const mood of Object.keys(lib.animations || {})) {
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
      this.scheduleSave(chatId);
    }
    return removed;
  }

  public removeStickerPackFromLibrary(packName: string, chatId?: number | string): number {
    const lib = this.getMediaLibrary(chatId);
    let removedCount = 0;
    const cleanPack = packName.replace(/^https:\/\/t\.me\/addstickers\//i, '').replace(/[<>]/g, '').trim().toLowerCase();

    if (!lib.stickerMetadata) return 0;

    const fileIdsToRemove: string[] = [];
    for (const [fileId, meta] of Object.entries(lib.stickerMetadata)) {
      const pName = (meta.packName || '').trim().toLowerCase();
      if (pName === cleanPack) {
        fileIdsToRemove.push(fileId);
      }
    }

    for (const fileId of fileIdsToRemove) {
      if (this.removeMediaFromLibrary(fileId, chatId)) {
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.scheduleSave(chatId);
    }
    return removedCount;
  }

  public addLustSticker(mood: string, fileId: string, meta?: StickerMetaRecord, chatId?: number | string): boolean {
    const lib = this.getMediaLibrary(chatId);
    const normalizedMood = mood.toLowerCase().trim();
    if (!lib.lustStickers) {
      lib.lustStickers = {};
    }
    if (!lib.lustStickers[normalizedMood]) {
      lib.lustStickers[normalizedMood] = [];
    }

    if (!lib.stickerMetadata) lib.stickerMetadata = {};
    const metaRecord: StickerMetaRecord = {
      chatId,
      source: 'custom',
      addedAt: new Date().toISOString(),
      ...(meta || {}),
      fileId,
      mood: normalizedMood,
      isLustMode: true
    };
    lib.stickerMetadata[fileId] = metaRecord;

    if (!lib.lustStickers[normalizedMood].includes(fileId)) {
      lib.lustStickers[normalizedMood].push(fileId);
      // Also register in group stickers for general consistency
      if (!lib.stickers[normalizedMood]) lib.stickers[normalizedMood] = [];
      if (!lib.stickers[normalizedMood].includes(fileId)) {
        lib.stickers[normalizedMood].push(fileId);
      }
      this.scheduleSave(chatId);
      return true;
    }
    return false;
  }

  public getLustStickers(chatId?: number | string, mood?: string): string[] {
    if (!chatId) return [];
    const lib = this.getMediaLibrary(chatId);
    if (!lib.lustStickers) return [];
    if (mood) {
      return lib.lustStickers[mood.toLowerCase().trim()] || [];
    }
    const all: string[] = [];
    for (const list of Object.values(lib.lustStickers)) {
      if (Array.isArray(list)) all.push(...list);
    }
    return Array.from(new Set(all));
  }

  public removeLustSticker(fileId: string, chatId?: number | string): boolean {
    if (!chatId) return false;
    const lib = this.getMediaLibrary(chatId);
    let removed = false;
    if (lib.lustStickers) {
      for (const mood of Object.keys(lib.lustStickers)) {
        const idx = lib.lustStickers[mood].indexOf(fileId);
        if (idx !== -1) {
          lib.lustStickers[mood].splice(idx, 1);
          removed = true;
        }
      }
    }
    const generalRemoved = this.removeMediaFromLibrary(fileId, chatId);
    return removed || generalRemoved;
  }

  public clearLustStickers(chatId: number | string, mood?: string): void {
    const lib = this.getMediaLibrary(chatId);
    if (!lib.lustStickers) return;
    if (mood) {
      delete lib.lustStickers[mood.toLowerCase().trim()];
    } else {
      lib.lustStickers = {};
    }
    this.scheduleSave();
  }

  public clearMediaLibrary(moodOrChatId?: string | number, chatId?: number | string): void {
    let mood: string | undefined;
    let targetChatId: number | string | undefined = chatId;

    if (typeof moodOrChatId === 'number' || (typeof moodOrChatId === 'string' && /^-?\d+$/.test(moodOrChatId) && !chatId)) {
      targetChatId = moodOrChatId;
      mood = undefined;
    } else if (typeof moodOrChatId === 'string') {
      mood = moodOrChatId;
    }

    const lib = this.getMediaLibrary(targetChatId);
    if (mood) {
      const normalizedMood = mood.toLowerCase().trim();
      if (lib.stickerMetadata && lib.stickers[normalizedMood]) {
        for (const fId of lib.stickers[normalizedMood]) {
          delete lib.stickerMetadata[fId];
        }
      }
      delete lib.stickers[normalizedMood];
      delete lib.animations[normalizedMood];
      if (lib.lustStickers) {
        delete lib.lustStickers[normalizedMood];
      }
    } else {
      lib.stickers = {};
      lib.animations = {};
      lib.stickerMetadata = {};
      lib.lustStickers = {};
    }
    this.scheduleSave();
  }

  public getGroupPacksSummary(chatId: number | string, page: number = 1, pageSize: number = 6) {
    const defaultStats = getDefaultStickersStats();
    const lib = this.getMediaLibrary(chatId);
    const customMoodCounts: Record<string, number> = {};
    let customStickersCount = 0;

    for (const [mood, list] of Object.entries(lib.stickers || {})) {
      const count = Array.isArray(list) ? list.length : 0;
      customMoodCounts[mood] = count;
      customStickersCount += count;
    }

    // Merged aggregate mood counts
    const allMoods = new Set([...Object.keys(defaultStats.moodCounts), ...Object.keys(customMoodCounts)]);
    const mergedMoodCounts: Record<string, number> = {};
    for (const m of allMoods) {
      const def = defaultStats.moodCounts[m] || 0;
      const cust = customMoodCounts[m] || 0;
      mergedMoodCounts[m] = def + cust;
    }

    // Group sticker metadata by custom pack
    const packMap: Record<string, { name: string; title: string; count: number; moods: Set<string>; addedAt?: string }> = {};

    for (const [fileId, meta] of Object.entries(lib.stickerMetadata || {})) {
      const packKey = meta.packName || 'standalone_stickers';
      if (!packMap[packKey]) {
        packMap[packKey] = {
          name: meta.packName || 'standalone',
          title: meta.packTitle || meta.packName || 'Standalone Stickers',
          count: 0,
          moods: new Set<string>(),
          addedAt: meta.addedAt
        };
      }
      packMap[packKey].count++;
      if (meta.mood) {
        packMap[packKey].moods.add(meta.mood);
      }
    }

    const allCustomPacks = Object.values(packMap).map((p) => ({
      name: p.name,
      title: p.title,
      count: p.count,
      moods: Array.from(p.moods),
      addedAt: p.addedAt
    }));

    // Sort by count descending
    allCustomPacks.sort((a, b) => b.count - a.count);

    const totalCustomPacks = allCustomPacks.length;
    const totalDefaultPacks = defaultStats.totalPacks;
    const totalPacks = totalDefaultPacks + totalCustomPacks;
    const totalStickers = defaultStats.totalStickers + customStickersCount;

    const totalPages = Math.max(1, Math.ceil(totalCustomPacks / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (safePage - 1) * pageSize;
    const paginatedPacks = allCustomPacks.slice(startIndex, startIndex + pageSize);

    return {
      defaultStickersCount: defaultStats.totalStickers,
      customStickersCount,
      totalStickers,
      totalDefaultPacks,
      totalCustomPacks,
      totalPacks,
      maxPacks: StorageManager.MAX_PACKS_PER_GROUP,
      defaultMoodCounts: defaultStats.moodCounts,
      customMoodCounts,
      moodCounts: mergedMoodCounts,
      packs: paginatedPacks,
      page: safePage,
      totalPages,
      pageSize
    };
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
      this.scheduleSave(chatId);
    }
  }

  public clearUserMemory(chatId: number | string, userId: number): boolean {
    if (!this.data.userMemories) return false;
    const key = `${chatId}_${userId}`;
    const existed = !!this.data.userMemories[key];
    if (existed) {
      delete this.data.userMemories[key];
      this.scheduleSave(chatId);
    }
    return existed;
  }

  public cleanExpiredMemories(): void {
    const now = Date.now();
    const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days inactivity
    let cleaned = false;
    if (this.data.userMemories) {
      for (const [key, record] of Object.entries(this.data.userMemories)) {
        if (now - (record.lastUpdated || 0) > TTL_MS) {
          delete this.data.userMemories[key];
          cleaned = true;
        }
      }
    }
    if (this.data.groupConversationMemories) {
      for (const [key, record] of Object.entries(this.data.groupConversationMemories)) {
        if (now - (record.lastUpdated || 0) > TTL_MS) {
          delete this.data.groupConversationMemories[key];
          cleaned = true;
        }
      }
    }
    if (this.data.userLustLevels) {
      for (const [key, record] of Object.entries(this.data.userLustLevels)) {
        if (now - (record.lastUpdated || 0) > TTL_MS) {
          delete this.data.userLustLevels[key];
          cleaned = true;
        }
      }
    }
    if (cleaned) {
      this.scheduleSave();
    }
  }

  // --- User Lusty Level Management (Group-Scoped) ---
  public getLustLevel(groupId: number | string, userId: number, decayHours: number = 1): number {
    if (!this.data.userLustLevels) this.data.userLustLevels = {};
    const key = `${groupId}_${userId}`;
    const record = this.data.userLustLevels[key];
    if (!record) return 0;

    // Apply decay if decayHours > 0
    if (decayHours > 0) {
      const now = Date.now();
      const elapsedMs = now - (record.lastUpdated || now);
      const decayIntervalMs = decayHours * 3600 * 1000;
      const decaySteps = Math.floor(elapsedMs / decayIntervalMs);
      if (decaySteps > 0) {
        const newLevel = Math.max(0, record.level - decaySteps);
        record.level = newLevel;
        record.lastUpdated = now;
        this.scheduleSave();
        return newLevel;
      }
    }

    return Math.max(0, Math.min(4, record.level || 0));
  }

  public setLustLevel(groupId: number | string, userId: number, level: number): number {
    if (!this.data.userLustLevels) this.data.userLustLevels = {};
    const key = `${groupId}_${userId}`;
    const clampedLevel = Math.max(0, Math.min(4, Math.floor(level)));
    const now = Date.now();
    this.data.userLustLevels[key] = {
      groupId,
      userId,
      level: clampedLevel,
      lastUpdated: now
    };
    this.scheduleSave(groupId);
    return clampedLevel;
  }

  public incrementLustLevel(groupId: number | string, userId: number, decayHours: number = 1): number {
    const current = this.getLustLevel(groupId, userId, decayHours);
    const next = Math.min(4, current + 1);
    return this.setLustLevel(groupId, userId, next);
  }

  public resetLustLevel(groupId: number | string, userId?: number): void {
    if (!this.data.userLustLevels) return;
    if (userId !== undefined) {
      const key = `${groupId}_${userId}`;
      if (this.data.userLustLevels[key]) {
        delete this.data.userLustLevels[key];
        this.scheduleSave(groupId);
      }
    } else {
      let modified = false;
      const prefix = `${groupId}_`;
      for (const key of Object.keys(this.data.userLustLevels)) {
        if (key.startsWith(prefix)) {
          delete this.data.userLustLevels[key];
          modified = true;
        }
      }
      if (modified) {
        this.scheduleSave(groupId);
      }
    }
  }

  // --- Group Conversation Memory Management (Shared per ChatId) ---
  public getGroupMemory(chatId: number | string): GroupConversationMessage[] {
    if (!this.data.groupConversationMemories) this.data.groupConversationMemories = {};
    const key = String(chatId);
    let record = this.data.groupConversationMemories[key];
    if (!record && this.data.groupMemories && this.data.groupMemories[key]) {
      const legacy = this.data.groupMemories[key];
      const msgs = Array.isArray(legacy.messages) ? legacy.messages : (Array.isArray(legacy.entries) ? legacy.entries : []);
      record = {
        chatId,
        messages: msgs,
        lastUpdated: legacy.lastUpdated || Date.now()
      };
      this.data.groupConversationMemories[key] = record;
    }
    if (!record || !Array.isArray(record.messages)) return [];
    return record.messages;
  }

  public addGroupConversationEntry(chatId: number | string, entry: GroupConversationMessage): void {
    if (!this.data.groupConversationMemories) this.data.groupConversationMemories = {};
    const key = String(chatId);
    let record = this.data.groupConversationMemories[key];
    const now = Date.now();
    if (!record) {
      record = { chatId, messages: [], lastUpdated: now };
      this.data.groupConversationMemories[key] = record;
    }
    record.lastUpdated = now;

    // Deduplication check: do not add duplicate message with same messageId
    if (entry.messageId && record.messages.some(m => m.messageId === entry.messageId)) {
      return;
    }
    const last = record.messages[record.messages.length - 1];
    if (last && last.role === entry.role && last.content === entry.content && Math.abs(last.timestamp - entry.timestamp) < 1000) {
      return;
    }

    record.messages.push(entry);
    while (record.messages.length > GROUP_MEMORY_LIMIT) {
      record.messages.shift();
    }
    // Backward compatibility alias for entries
    record.entries = record.messages;
    if (this.data.groupMemories) {
      this.data.groupMemories[key] = record;
    }
    this.scheduleSave(chatId);
  }

  public isMessageInOtherGroup(messageId: number, targetChatId: number): number | null {
    if (!this.data.groupConversationMemories) return null;
    for (const [gId, record] of Object.entries(this.data.groupConversationMemories)) {
      if (Number(gId) !== targetChatId) {
        if (record?.messages?.some(m => m.messageId === messageId)) {
          return Number(gId);
        }
      }
    }
    return null;
  }

  public clearGroupMemory(chatId: number | string): boolean {
    const key = String(chatId);
    let existed = false;
    if (this.data.groupConversationMemories && this.data.groupConversationMemories[key]) {
      delete this.data.groupConversationMemories[key];
      existed = true;
    }
    if (this.data.groupMemories && this.data.groupMemories[key]) {
      delete this.data.groupMemories[key];
      existed = true;
    }
    if (existed) {
      this.scheduleSave(chatId);
    }
    return existed;
  }

  // --- Private Conversations (DMs) Tracking ---
  public addPrivateMessage(
    chatId: number | string,
    userId: number,
    msg: {
      role: 'user' | 'assistant';
      content: string;
      timestamp?: number;
      messageId?: number;
      mediaType?: string;
      mediaFileId?: string;
      direction?: 'in' | 'out';
      username?: string;
      name?: string;
      language?: string;
    }
  ): void {
    if (!this.data.privateConversations) this.data.privateConversations = {};
    const key = String(chatId);
    let record = this.data.privateConversations[key];
    const now = msg.timestamp || Date.now();
    if (!record) {
      record = {
        chatId,
        userId,
        username: msg.username,
        name: msg.name,
        language: msg.language,
        lastUpdated: now,
        messages: []
      };
      this.data.privateConversations[key] = record;
    }

    if (msg.username) record.username = msg.username;
    if (msg.name) record.name = msg.name;
    if (msg.language) record.language = msg.language;
    record.lastUpdated = now;

    // Deduplication by messageId if present
    if (msg.messageId && record.messages.some(m => m.messageId === msg.messageId)) {
      return;
    }

    record.messages.push({
      role: msg.role,
      content: msg.content,
      timestamp: now,
      messageId: msg.messageId,
      mediaType: msg.mediaType,
      mediaFileId: msg.mediaFileId,
      direction: msg.direction || (msg.role === 'assistant' ? 'out' : 'in'),
      language: msg.language
    });

    if (record.messages.length > 200) {
      record.messages.shift();
    }
    this.scheduleSave(chatId);
  }

  public getPrivateChatsList(): Array<{
    chatId: number | string;
    userId: number;
    username?: string;
    name?: string;
    language?: string;
    lastUpdated: number;
    messageCount: number;
    lastMessage?: string;
  }> {
    if (!this.data.privateConversations) return [];
    return Object.values(this.data.privateConversations)
      .map(c => {
        const lastMsg = c.messages[c.messages.length - 1];
        return {
          chatId: c.chatId,
          userId: c.userId,
          username: c.username,
          name: c.name || (c.username ? `@${c.username}` : `User ${c.userId}`),
          language: c.language || 'English',
          lastUpdated: c.lastUpdated,
          messageCount: c.messages.length,
          lastMessage: lastMsg?.content || ''
        };
      })
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
  }

  public getPrivateChatMessages(chatId: number | string): PrivateConversationMessage[] {
    if (!this.data.privateConversations) return [];
    const key = String(chatId);
    return this.data.privateConversations[key]?.messages || [];
  }

  public markBotLeftGroup(chatId: number | string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.botLeft = true;
    settings.leftAt = new Date().toISOString();
    settings.unavailable = false;
    this.scheduleSave(numId);
  }

  public markGroupUnavailable(chatId: number | string, reason?: string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.unavailable = true;
    settings.unavailableAt = new Date().toISOString();
    if (reason) settings.unavailableReason = reason;
    this.scheduleSave(numId);
  }

  public getTotalStoredMessagesCount(): number {
    let count = 0;
    // 1. Group conversation messages
    if (this.data.groupConversationMemories) {
      for (const m of Object.values(this.data.groupConversationMemories)) {
        if (Array.isArray(m?.messages)) count += m.messages.length;
      }
    }
    // 2. Private conversation messages
    if (this.data.privateConversations) {
      for (const c of Object.values(this.data.privateConversations)) {
        if (Array.isArray(c?.messages)) count += c.messages.length;
      }
    }
    // 3. Moderation log events
    if (Array.isArray(this.data.logs)) {
      count += this.data.logs.length;
    }
    return count;
  }

  public getGroupStickerPacks(chatId: number | string): GroupStickerPackConfig[] {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.stickerPacks) {
      settings.stickerPacks = {};
    }

    // Auto-discover any packs that were previously imported via commands into stickerMetadata
    const lib = this.getMediaLibrary(numId);
    if (lib.stickerMetadata) {
      for (const meta of Object.values(lib.stickerMetadata)) {
        const packName = meta.packName;
        if (packName && !settings.stickerPacks[packName.toLowerCase()]) {
          settings.stickerPacks[packName.toLowerCase()] = {
            name: packName,
            title: meta.packTitle || packName,
            enabled: true,
            stickerCount: 1,
            addedAt: meta.addedAt || new Date().toISOString()
          };
        }
      }
    }

    return Object.values(settings.stickerPacks);
  }

  public addGroupStickerPack(chatId: number | string, pack: GroupStickerPackConfig): GroupStickerPackConfig {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.stickerPacks) {
      settings.stickerPacks = {};
    }
    const cleanKey = pack.name.toLowerCase().trim();
    settings.stickerPacks[cleanKey] = {
      ...pack,
      addedAt: pack.addedAt || new Date().toISOString()
    };
    this.scheduleSave(numId);
    return settings.stickerPacks[cleanKey];
  }

  public updateGroupStickerPack(
    chatId: number | string,
    packName: string,
    updates: Partial<GroupStickerPackConfig>
  ): GroupStickerPackConfig | null {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.stickerPacks) return null;
    const cleanKey = packName.toLowerCase().trim();
    if (!settings.stickerPacks[cleanKey]) return null;

    settings.stickerPacks[cleanKey] = {
      ...settings.stickerPacks[cleanKey],
      ...updates
    };
    this.scheduleSave(numId);
    return settings.stickerPacks[cleanKey];
  }

  public removeGroupStickerPack(chatId: number | string, packName: string): number {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    const cleanKey = packName.toLowerCase().trim();
    if (settings.stickerPacks && settings.stickerPacks[cleanKey]) {
      delete settings.stickerPacks[cleanKey];
      this.scheduleSave(numId);
    }
    return this.removeStickerPackFromLibrary(packName, numId);
  }

  public isStickerPackEnabled(chatId: number | string, packName?: string): boolean {
    if (!packName) return true;
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    if (!settings.stickerPacks) return true;
    const pack = settings.stickerPacks[packName.toLowerCase().trim()];
    if (!pack) return true;
    return pack.enabled !== false;
  }

  // --- Sticker Pack Convenience Aliases ---
  public addStickerPack(chatId: number | string, pack: GroupStickerPackConfig): GroupStickerPackConfig {
    return this.addGroupStickerPack(chatId, pack);
  }

  public removeStickerPack(chatId: number | string, packName: string): number {
    return this.removeGroupStickerPack(chatId, packName);
  }

  public toggleStickerPack(chatId: number | string, packName: string, enabled: boolean): GroupStickerPackConfig | null {
    return this.updateGroupStickerPack(chatId, packName, { enabled });
  }

  public checkAutoResponseEligibility(chatId: number | string): { allowed: boolean; remainingSeconds?: number; reason?: string } {
    const numId = Number(chatId);
    if (numId > 0) return { allowed: true }; // DMs are separate, not subject to group cooldown

    const settings = this.getGroupSettings(numId);
    const cfg = settings.autoResponse;
    if (!cfg || !cfg.enabled || cfg.mode === 'disabled') {
      return { allowed: false, reason: 'disabled' };
    }

    if (cfg.mode === 'every_message') {
      return { allowed: true };
    }

    const last = cfg.lastResponseTimestamp || 0;
    if (last === 0) {
      return { allowed: true };
    }

    const now = Date.now();

    // Check explicit nextAllowedAt if available and valid
    if (cfg.nextAllowedAt && cfg.nextAllowedAt > now) {
      const remainingSeconds = Math.ceil((cfg.nextAllowedAt - now) / 1000);
      if (remainingSeconds <= 86400) {
        return { allowed: false, remainingSeconds, reason: 'cooldown' };
      }
    }

    const elapsed = (now - last) / 1000;

    if (cfg.mode === 'cooldown') {
      const cooldown = Math.max(10, Math.min(86400, Number(cfg.cooldownSeconds || 30)));
      if (elapsed < cooldown) {
        return { allowed: false, remainingSeconds: Math.ceil(cooldown - elapsed), reason: 'cooldown' };
      }
      return { allowed: true };
    }

    if (cfg.mode === 'random' || cfg.randomize) {
      const rawMin = Number(cfg.minSeconds ?? 30);
      const rawMax = Number(cfg.maxSeconds ?? 120);
      const safeMin = Math.max(10, Math.min(86400, isNaN(rawMin) ? 30 : rawMin));
      const safeMax = Math.max(safeMin, Math.min(86400, isNaN(rawMax) ? 120 : rawMax));
      const target = cfg.nextIntervalSeconds || safeMin;
      if (elapsed < target) {
        return { allowed: false, remainingSeconds: Math.ceil(target - elapsed), reason: 'cooldown' };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  public recordAutoResponseSent(chatId: number | string): void {
    const numId = Number(chatId);
    if (numId > 0) return;

    const settings = this.getGroupSettings(numId);
    if (!settings.autoResponse) {
      settings.autoResponse = {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120
      };
    }

    const now = Date.now();
    settings.autoResponse.lastResponseTimestamp = now;

    if (settings.autoResponse.mode === 'random' || settings.autoResponse.randomize) {
      const rawMin = Number(settings.autoResponse.minSeconds ?? 30);
      const rawMax = Number(settings.autoResponse.maxSeconds ?? 120);
      const safeMin = Math.max(10, Math.min(86400, isNaN(rawMin) ? 30 : rawMin));
      const safeMax = Math.max(safeMin, Math.min(86400, isNaN(rawMax) ? 120 : rawMax));
      const randomSeconds = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
      settings.autoResponse.nextIntervalSeconds = randomSeconds;
      settings.autoResponse.nextAllowedAt = now + (randomSeconds * 1000);
    } else if (settings.autoResponse.mode === 'cooldown') {
      const cd = Math.max(10, Math.min(86400, Number(settings.autoResponse.cooldownSeconds || 30)));
      settings.autoResponse.nextIntervalSeconds = cd;
      settings.autoResponse.nextAllowedAt = now + (cd * 1000);
    } else {
      settings.autoResponse.nextIntervalSeconds = 0;
      settings.autoResponse.nextAllowedAt = 0;
    }

    this.scheduleSave(numId);
  }

  public checkAutoStickerEligibility(chatId: number | string): { allowed: boolean; remainingSeconds?: number; reason?: string } {
    const numId = Number(chatId);
    if (numId > 0) return { allowed: true };

    const settings = this.getGroupSettings(numId);
    const cfg = settings.autoSticker;
    if (!cfg || !cfg.enabled || cfg.mode === 'disabled') {
      return { allowed: false, reason: 'disabled' };
    }

    if (cfg.mode === 'every_message') {
      return { allowed: true };
    }

    const last = cfg.lastStickerTimestamp || 0;
    if (last === 0) {
      return { allowed: true };
    }

    const now = Date.now();

    // Check explicit nextAllowedAt if available and valid
    if (cfg.nextAllowedAt && cfg.nextAllowedAt > now) {
      const remainingSeconds = Math.ceil((cfg.nextAllowedAt - now) / 1000);
      if (remainingSeconds <= 86400) {
        return { allowed: false, remainingSeconds, reason: 'cooldown' };
      }
    }

    const elapsed = (now - last) / 1000;

    if (cfg.mode === 'cooldown') {
      const cooldown = Math.max(10, Math.min(86400, Number(cfg.cooldownSeconds || 60)));
      if (elapsed < cooldown) {
        return { allowed: false, remainingSeconds: Math.ceil(cooldown - elapsed), reason: 'cooldown' };
      }
      return { allowed: true };
    }

    if (cfg.mode === 'random' || cfg.randomize) {
      const rawMin = Number(cfg.minSeconds ?? 60);
      const rawMax = Number(cfg.maxSeconds ?? 300);
      const safeMin = Math.max(10, Math.min(86400, isNaN(rawMin) ? 60 : rawMin));
      const safeMax = Math.max(safeMin, Math.min(86400, isNaN(rawMax) ? 300 : rawMax));
      const target = cfg.nextIntervalSeconds || safeMin;
      if (elapsed < target) {
        return { allowed: false, remainingSeconds: Math.ceil(target - elapsed), reason: 'cooldown' };
      }
      return { allowed: true };
    }

    return { allowed: true };
  }

  public recordAutoStickerSent(chatId: number | string): void {
    const numId = Number(chatId);
    if (numId > 0) return;

    const settings = this.getGroupSettings(numId);
    if (!settings.autoSticker) {
      settings.autoSticker = {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300
      };
    }

    const now = Date.now();
    settings.autoSticker.lastStickerTimestamp = now;

    if (settings.autoSticker.mode === 'random' || settings.autoSticker.randomize) {
      const rawMin = Number(settings.autoSticker.minSeconds ?? 60);
      const rawMax = Number(settings.autoSticker.maxSeconds ?? 300);
      const safeMin = Math.max(10, Math.min(86400, isNaN(rawMin) ? 60 : rawMin));
      const safeMax = Math.max(safeMin, Math.min(86400, isNaN(rawMax) ? 300 : rawMax));
      const randomSeconds = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
      settings.autoSticker.nextIntervalSeconds = randomSeconds;
      settings.autoSticker.nextAllowedAt = now + (randomSeconds * 1000);
    } else if (settings.autoSticker.mode === 'cooldown') {
      const cd = Math.max(10, Math.min(86400, Number(settings.autoSticker.cooldownSeconds || 60)));
      settings.autoSticker.nextIntervalSeconds = cd;
      settings.autoSticker.nextAllowedAt = now + (cd * 1000);
    } else {
      settings.autoSticker.nextIntervalSeconds = 0;
      settings.autoSticker.nextAllowedAt = 0;
    }

    this.scheduleSave(numId);
  }
}

export const db = new StorageManager();
