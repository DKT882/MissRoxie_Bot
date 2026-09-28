import fs from 'fs';
import path from 'path';
import { GroupSettings, WarningRecord, StickerFreeUser, ContentType, ContentPermissionRecord, ScheduledMessage, ModerationLog, CachedMember, TrackedChatMessage, TempActionRecord, NoteRecord, ApprovedUserRecord, CaptchaSession, AutoEngineConfig, AutoEngineMode, AutoEnginePreset, AutoEngineChannelConfig, AutoResponseConfig, AutoStickerConfig, GroupStickerPackConfig, AUTO_ENGINE_PRESETS } from '../telegram/types.js';
import { getDefaultStickersStats } from '../telegram/defaultStickers.js';
import { logDebug } from '../observability/logger.js';
import { mongoManager } from './mongodb.js';
import { MongoStorageService } from './mongoStorage.js';

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

export const MAX_GROUP_STORED_MESSAGES = 500;
export const GROUP_MEMORY_LIMIT = MAX_GROUP_STORED_MESSAGES;
export const MAX_PRIVATE_CHAT_MESSAGES = 200;
export const PRIVATE_CHAT_INACTIVITY_DAYS = 5;
export const PRIVATE_CHAT_INACTIVITY_MS = PRIVATE_CHAT_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
export const MAX_BACKUPS_PER_GROUP = 5;

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
  mediaFileId?: string;
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

export interface DirtyMongoGroupState {
  chatId: number;
  failedOperationsCount: number;
  firstFailedAt: number;
  lastFailedAt: number;
  nextRetryAt: number;
  retryCount: number;
  isRetrying?: boolean;
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
  autoDelete?: boolean;
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
  migrationsApplied?: string[];
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
  maintenanceMode: false,
  migrationsApplied: []
};

export const MIGRATION_V1_6_GROUP_PURGE = 'v1_authoritative_6_group_purge_20260917';

export const AUTHORITATIVE_ALLOWED_GROUP_IDS = new Set<string>([
  '-1004223070652', // Bade Log
  '-1004449422619', // horny log
  '-1004450389363', // Nonstop Notification
  '-1004329420383', // OPEN CHAT
  '-1003834290759', // corny peeps
  '-1004384873993'  // No Filter Zone
]);

export const AUTHORITATIVE_ALLOWED_GROUP_NUM_IDS = new Set<number>([
  -1004223070652,
  -1004449422619,
  -1004450389363,
  -1004329420383,
  -1003834290759,
  -1004384873993
]);

export const AUTHORITATIVE_GROUP_METADATA: Record<string, { title: string }> = {
  '-1004223070652': { title: 'Bade Log' },
  '-1004449422619': { title: 'horny log' },
  '-1004450389363': { title: 'Nonstop Notification' },
  '-1004329420383': { title: 'OPEN CHAT' },
  '-1003834290759': { title: 'corny peeps' },
  '-1004384873993': { title: 'No Filter Zone' }
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

export class StorageManager {
  public static readonly MAX_PACKS_PER_GROUP = 1000;
  public static readonly MAX_GROUP_STORED_MESSAGES = MAX_GROUP_STORED_MESSAGES;
  public static readonly GROUP_MEMORY_LIMIT = MAX_GROUP_STORED_MESSAGES;
  public static readonly MAX_PRIVATE_CHAT_MESSAGES = MAX_PRIVATE_CHAT_MESSAGES;
  public static readonly PRIVATE_CHAT_INACTIVITY_DAYS = PRIVATE_CHAT_INACTIVITY_DAYS;
  public static readonly PRIVATE_CHAT_INACTIVITY_MS = PRIVATE_CHAT_INACTIVITY_MS;
  public static readonly MAX_BACKUPS_PER_GROUP = MAX_BACKUPS_PER_GROUP;

  private activeDataDir: string = path.resolve(process.cwd(), 'data');
  private configuredDataDir: string = process.env.ROXIE_DATA_DIR || process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
  private isDataDirWritable: boolean = false;
  private storageMode: 'persistent' | 'local_fallback' | 'degraded_readonly' = 'local_fallback';
  private storageIndicator: 'persistent' | 'local_ephemeral' | 'error' = 'local_ephemeral';
  private lastStorageError: string | null = null;
  private lastLoggedErrorTime: number = 0;
  private lastLoggedErrorMessage: string = '';

  private currentBotId: number | null = null;
  private currentBotUsername: string | null = null;
  private currentBotFirstName: string | null = null;
  private bypassMinimumIntervalForTests: boolean = false;

  public setBypassMinimumIntervalForTests(bypass: boolean): void {
    this.bypassMinimumIntervalForTests = bypass;
  }

  private settingsChangeListeners: Array<(chatId: number, settings: GroupSettings, botId: number | null) => void> = [];
  private groupRemovalListeners: Array<(chatId: number, botId: number | null) => void> = [];

  public onSettingsChanged(cb: (chatId: number, settings: GroupSettings, botId: number | null) => void): () => void {
    this.settingsChangeListeners.push(cb);
    return () => {
      this.settingsChangeListeners = this.settingsChangeListeners.filter(l => l !== cb);
    };
  }

  public onGroupRemoved(cb: (chatId: number, botId: number | null) => void): () => void {
    this.groupRemovalListeners.push(cb);
    return () => {
      this.groupRemovalListeners = this.groupRemovalListeners.filter(l => l !== cb);
    };
  }

  public setBotIdentity(bot: { id: number; username?: string; first_name?: string }): void {
    this.currentBotId = bot.id;
    this.currentBotUsername = bot.username || null;
    this.currentBotFirstName = bot.first_name || null;
  }

  public getCurrentBotId(): number | null {
    return this.currentBotId;
  }

  public getCurrentBotUsername(): string | null {
    return this.currentBotUsername;
  }

  public getCurrentBotFirstName(): string | null {
    return this.currentBotFirstName;
  }

  public get dataDir(): string {
    return this.activeDataDir;
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

  public resolveAndValidateStorage(): { activeDir: string; mode: 'persistent' | 'local_fallback' | 'degraded_readonly'; isWritable: boolean; error: string | null } {
    const rawEnv = this.configuredDataDir || process.env.ROXIE_DATA_DIR || process.env.DATA_DIR;
    const defaultLocalDir = path.resolve(process.cwd(), 'data');
    const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);

    if (rawEnv && rawEnv.trim().length > 0) {
      const configuredPath = path.resolve(rawEnv.trim());
      try {
        if (!fs.existsSync(configuredPath)) {
          fs.mkdirSync(configuredPath, { recursive: true });
        }
        const testFile = path.join(configuredPath, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
        fs.writeFileSync(testFile, 'ok', 'utf-8');
        try { fs.unlinkSync(testFile); } catch {}

        return {
          activeDir: configuredPath,
          mode: 'persistent',
          isWritable: true,
          error: null
        };
      } catch (err: any) {
        const errorMsg = `Permission/access failure on configured ROXIE_DATA_DIR='${rawEnv}': ${err.message}`;
        try {
          if (!fs.existsSync(defaultLocalDir)) {
            fs.mkdirSync(defaultLocalDir, { recursive: true });
          }
          const testFile = path.join(defaultLocalDir, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
          fs.writeFileSync(testFile, 'ok', 'utf-8');
          try { fs.unlinkSync(testFile); } catch {}

          return {
            activeDir: defaultLocalDir,
            mode: 'local_fallback',
            isWritable: true,
            error: errorMsg
          };
        } catch (localErr: any) {
          return {
            activeDir: defaultLocalDir,
            mode: 'degraded_readonly',
            isWritable: false,
            error: `${errorMsg}; local fallback failed: ${localErr.message}`
          };
        }
      }
    } else {
      try {
        if (!fs.existsSync(defaultLocalDir)) {
          fs.mkdirSync(defaultLocalDir, { recursive: true });
        }
        const testFile = path.join(defaultLocalDir, `.write_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.tmp`);
        fs.writeFileSync(testFile, 'ok', 'utf-8');
        try { fs.unlinkSync(testFile); } catch {}

        return {
          activeDir: defaultLocalDir,
          mode: isRender ? 'local_fallback' : 'persistent',
          isWritable: true,
          error: null
        };
      } catch (err: any) {
        return {
          activeDir: defaultLocalDir,
          mode: 'degraded_readonly',
          isWritable: false,
          error: `Default directory '${defaultLocalDir}' is unwritable: ${err.message}`
        };
      }
    }
  }

  public ensureDirectories(): void {
    if (!this.isDataDirWritable) return;
    try {
      const dirs = [
        this.dataDir,
        this.groupsDir,
        this.privateDir,
        this.backupDir,
        this.groupsBackupDir,
        this.privateBackupDir
      ];
      for (const d of dirs) {
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      }
    } catch (err: any) {
      this.logStorageErrorOnce('ensureDirectories', err.message);
    }
  }

  public logStorageErrorOnce(operation: string, errorMsg: string): void {
    this.lastSaveSuccessful = false;
    this.lastStorageError = errorMsg;
    const now = Date.now();
    const key = `${operation}:${errorMsg}`;
    if (this.lastLoggedErrorMessage !== key || (now - this.lastLoggedErrorTime > 60000)) {
      this.lastLoggedErrorMessage = key;
      this.lastLoggedErrorTime = now;
      console.error(`[Storage] Failed during ${operation}: ${errorMsg}`);
    }
  }

  public atomicWriteJsonSync(targetFile: string, content: string): boolean {
    const tmpFile = `${targetFile}.tmp`;
    try {
      fs.writeFileSync(tmpFile, content, 'utf-8');
      try {
        if (fs.existsSync(targetFile)) {
          try { fs.unlinkSync(targetFile); } catch {}
        }
        fs.renameSync(tmpFile, targetFile);
      } catch {
        fs.writeFileSync(targetFile, content, 'utf-8');
        try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
      }
      return true;
    } catch (err: any) {
      throw err;
    }
  }

  public getStorageHealthStatus(): 'PERSISTENT' | 'LOCAL_FALLBACK' | 'ERROR' {
    if (!this.isDataDirWritable || this.storageMode === 'degraded_readonly') return 'ERROR';
    if (this.storageMode === 'persistent') return 'PERSISTENT';
    return 'LOCAL_FALLBACK';
  }

  public getStorageHealthIndicator(): 'persistent' | 'local_ephemeral' | 'error' {
    if (!this.isDataDirWritable || this.storageMode === 'degraded_readonly') return 'error';
    if (this.storageMode === 'persistent') return 'persistent';
    return 'local_ephemeral';
  }

  public getSafeDataDirectoryDisplay(): string {
    const dir = this.dataDir;
    if (dir.includes('/var/data')) return '/var/data/roxie';
    const cwd = process.cwd();
    if (dir.startsWith(cwd)) {
      return `.${dir.slice(cwd.length).replace(/\\/g, '/')}`;
    }
    return path.basename(dir) || 'data';
  }

  public getConfiguredDataDirectoryDisplay(): string {
    return process.env.ROXIE_DATA_DIR || process.env.DATA_DIR || './data';
  }

  public isStorageWritable(): boolean {
    return this.isDataDirWritable;
  }

  public getStorageMode(): string {
    return this.storageMode;
  }

  public getLastStorageError(): string | null {
    return this.lastStorageError;
  }

  private groupWriteQueues: Map<string, Promise<void>> = new Map();
  private lastSaveTimestamps: Map<string, string> = new Map();
  private corruptedRecoveries: Map<string, string> = new Map();
  private pendingSaves: Set<number> = new Set();
  private dirtyMongoGroups: Map<number, DirtyMongoGroupState> = new Map();
  private dirtyFlushTimer: NodeJS.Timeout | null = null;
  public lastSaveSuccessful: boolean = true;
  public corruptedFilesCount: number = 0;

  public markGroupMongoDirty(chatId: number | string, operation?: string, reason?: string): void {
    const numId = Number(chatId);
    if (isNaN(numId) || numId >= 0) return;

    const now = Date.now();
    const existing = this.dirtyMongoGroups.get(numId);
    if (existing) {
      existing.failedOperationsCount++;
      existing.lastFailedAt = now;
      const backoffMs = Math.min(60000, 1000 * Math.pow(2, Math.min(existing.retryCount, 6)));
      existing.nextRetryAt = now + backoffMs;
    } else {
      this.dirtyMongoGroups.set(numId, {
        chatId: numId,
        failedOperationsCount: 1,
        firstFailedAt: now,
        lastFailedAt: now,
        nextRetryAt: now + 2000,
        retryCount: 0
      });
    }

    this.scheduleDirtyMongoFlush();
  }

  public scheduleDirtyMongoFlush(): void {
    if (this.dirtyFlushTimer || this.dirtyMongoGroups.size === 0) return;
    this.dirtyFlushTimer = setTimeout(() => {
      this.dirtyFlushTimer = null;
      this.flushDirtyMongoGroups().catch((err) => {
        console.warn('[Storage] Error during dirty Mongo groups flush:', err?.message);
      });
    }, 2000);
  }

  public async flushDirtyMongoGroups(): Promise<number> {
    if (this.dirtyMongoGroups.size === 0) return 0;
    if (!mongoManager.getStatus().isConnected) {
      this.scheduleDirtyMongoFlush();
      return 0;
    }

    const now = Date.now();
    let flushedCount = 0;

    for (const [chatId, state] of Array.from(this.dirtyMongoGroups.entries())) {
      if (state.isRetrying || now < state.nextRetryAt) {
        continue;
      }

      state.isRetrying = true;
      state.retryCount++;

      try {
        const rawData = this.buildGroupDataObject(chatId);
        const safeData = this.sanitizeGroupData(rawData);
        const targetBotId = this.currentBotId ?? safeData.settings?.botId ?? undefined;

        const saved = await MongoStorageService.saveGroup(safeData, targetBotId, this.currentBotUsername ?? undefined);
        if (saved) {
          this.dirtyMongoGroups.delete(chatId);
          flushedCount++;
          console.log(`[Storage] Successfully recovered and synchronized dirty group ${chatId} with MongoDB Atlas (${state.failedOperationsCount} accumulated mutations).`);
        } else {
          const backoffMs = Math.min(60000, 1000 * Math.pow(2, Math.min(state.retryCount, 6)));
          state.nextRetryAt = Date.now() + backoffMs;
          state.isRetrying = false;
        }
      } catch (retryErr: any) {
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, Math.min(state.retryCount, 6)));
        state.nextRetryAt = Date.now() + backoffMs;
        state.isRetrying = false;
        console.warn(`[Storage] Recovery write for dirty group ${chatId} failed (attempt ${state.retryCount}): ${retryErr?.message}`);
      }
    }

    if (this.dirtyMongoGroups.size > 0) {
      this.scheduleDirtyMongoFlush();
    }

    return flushedCount;
  }

  public getDirtyMongoGroupCount(): number {
    return this.dirtyMongoGroups.size;
  }

  public getDirtyMongoGroupState(chatId: number | string): DirtyMongoGroupState | undefined {
    const numId = Number(chatId);
    return this.dirtyMongoGroups.get(numId);
  }

  public clearDirtyMongoGroups(): void {
    if (this.dirtyFlushTimer) {
      clearTimeout(this.dirtyFlushTimer);
      this.dirtyFlushTimer = null;
    }
    this.dirtyMongoGroups.clear();
  }

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
  private lastSettingsTimestamps: Map<number, number> = new Map();
  private isLoaded: boolean = false;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(customDataDir?: string) {
    if (customDataDir) {
      this.configuredDataDir = customDataDir;
    }
    this.init();
  }

  public init() {
    try {
      const validation = this.resolveAndValidateStorage();
      this.activeDataDir = validation.activeDir;
      this.storageMode = validation.mode;
      this.isDataDirWritable = validation.isWritable;
      this.lastStorageError = validation.error;
      this.storageIndicator = validation.isWritable ? (validation.mode === 'persistent' ? 'persistent' : 'local_ephemeral') : 'error';

      if (validation.mode === 'local_fallback' && validation.error) {
        console.log(`[Roxie Storage] Using local storage directory: ${this.activeDataDir}`);
      } else if (validation.error) {
        console.warn(`[Roxie Storage] Notice: ${validation.error}. Using directory: '${this.activeDataDir}'.`);
      }

      this.ensureDirectories();

      // Render Persistence Check
      const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
      const hasExplicitDataDir = Boolean(process.env.ROXIE_DATA_DIR);
      if (isRender && !hasExplicitDataDir) {
        console.log(`[Roxie Storage] Using local storage directory: ${this.activeDataDir}`);
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

      // 5. Print Schedule Inventory Telemetry
      const dbFileSize = fs.existsSync(this.dbFile) ? fs.statSync(this.dbFile).size : 0;
      const rawSchedules = this.data.schedules || [];
      const dummyChatIds = new Set([-100111222333, -100888777, -1009876543210, -100777888999, -100999888101]);
      
      let legacyCount = 0;
      let dummyCount = 0;
      const validSchedules = rawSchedules.filter(s => {
        const cid = Number(s?.chatId);
        if (cid === -100111222333) {
          legacyCount++;
          return false;
        }
        if (dummyChatIds.has(cid)) {
          dummyCount++;
          return false;
        }
        return Boolean(cid);
      });

      this.data.schedules = validSchedules;

      const uniqueTargetChats = Array.from(new Set(validSchedules.map(s => s.chatId)));

      console.log(JSON.stringify({
        event: 'SCHEDULE_STORAGE_INVENTORY',
        sourceFile: this.dbFile,
        fileSizeBytes: dbFileSize,
        totalSchedules: validSchedules.length,
        uniqueTargetChatIds: uniqueTargetChats,
        legacyTargetCount: legacyCount,
        dummyTargetCount: dummyCount
      }));

      console.log(JSON.stringify({
        event: 'SCHEDULER_LOAD_COMPLETE',
        totalLoaded: validSchedules.length,
        uniqueTargetChats,
        activeCount: validSchedules.length
      }));

      // 6. Print startup diagnostics (Section 18)
      console.log(`[Roxie Storage]`);
      console.log(`Data directory: ${this.dataDir}`);
      console.log(`Groups loaded: ${groupLoadResult.loadedCount}`);
      console.log(`Private chats loaded: ${privateLoadResult.loadedCount}`);
      console.log(`Storage mode: ${this.storageMode}`);
      console.log(`Storage status: ${this.storageIndicator.toUpperCase()}`);
      console.log(`Directory writable: ${this.isDataDirWritable ? 'Yes' : 'No'}`);
      console.log(`Schema version: 1`);

      // 6. Safe Startup Migration: For any groups/private in memory without a file, generate one
      if (this.isDataDirWritable) {
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
        if (!fs.existsSync(this.globalFile)) {
          this.saveGlobalJsonSync();
        }
      }
    } catch (err: any) {
      console.error('Failed to initialize local bot storage:', err.message);
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
      mediaFileId: m.mediaFileId,
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

    const abuseWordsList = (settings.abuseWords || settings.customAbusiveWords || []).slice(0, 500);

    return {
      botId: settings.botId !== undefined ? settings.botId : (this.currentBotId !== null ? this.currentBotId : undefined),
      botUsername: settings.botUsername || this.currentBotUsername || null,
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
        warnings: (this.data.warnings || []).filter((w: any) => w.groupId === chatId).slice(-200),
        tempActions: (this.data.tempActions || []).filter((t: any) => t.groupId === chatId).slice(-200),
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
      stickerPacks: stickerPacksList.slice(0, 100),
      abuseWords: abuseWordsList,
      members: this.getGroupMembers(chatId).slice(0, 10000),
      moderators: ((settings as any).admins || []).slice(0, 100),
      messages,
      statistics: {
        schedules: this.getGroupSchedules(chatId).slice(-50),
        notes: this.getAllNotes(chatId),
        userMemories: Object.entries(this.data.userMemories || {})
          .filter(([k]) => k.startsWith(`${chatId}_`))
          .map(([_, v]) => v)
      },
      activity: groupLogs,
      updatedAt: settings.updatedAt || new Date().toISOString()
    };
  }

  public saveGroupJsonSync(chatId: number | string, syncToMongo: boolean = true): void {
    const numChatId = Number(chatId);
    if (isNaN(numChatId) || numChatId >= 0) return; // Supergroups and groups have negative IDs

    const writeStart = Date.now();
    logDebug({
      event: 'STORAGE_WRITE_START',
      chat_id: numChatId,
      type: 'group'
    });

    try {
      this.ensureDirectories();
      const rawData = this.buildGroupDataObject(numChatId);
      const safeData = this.sanitizeGroupData(rawData);
      const targetFile = path.join(this.groupsDir, `${numChatId}.json`);

      // Safe backup of previous valid file before replacement
      if (fs.existsSync(targetFile)) {
        try {
          const bakFile = path.join(this.groupsBackupDir, `${numChatId}.json.bak`);
          fs.copyFileSync(targetFile, bakFile);
        } catch {}
      }

      // Safe write using atomic strategy (.tmp -> target)
      const jsonContent = JSON.stringify(safeData, null, 2);
      this.atomicWriteJsonSync(targetFile, jsonContent);
      this.lastSaveSuccessful = true;
      this.lastStorageError = null;
      this.lastSaveTimestamps.set(String(numChatId), new Date().toISOString());

      // Async write to MongoDB Atlas if connected and full sync requested (non-blocking, never fails local save)
      if (syncToMongo && mongoManager.getStatus().isConnected) {
        MongoStorageService.saveGroup(safeData, this.currentBotId ?? undefined, this.currentBotUsername ?? undefined).catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB sync failed for group ${numChatId}: ${mongoErr?.message}`);
        });
      }

      const writeElapsed = Date.now() - writeStart;
      logDebug({
        event: 'STORAGE_WRITE_END',
        chat_id: numChatId,
        type: 'group',
        elapsedMs: writeElapsed
      });
    } catch (err: any) {
      this.logStorageErrorOnce(`save group ${chatId} JSON`, err.message);
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
    const incomingSettings: Partial<GroupSettings> = data.settings || {};
    const existingSettings: Partial<GroupSettings> = this.data.settings[chatId] || {};

    const resolvedBotId = data.botId !== undefined
      ? data.botId
      : (incomingSettings.botId !== undefined
        ? incomingSettings.botId
        : (existingSettings.botId !== undefined ? existingSettings.botId : undefined));

    const isLegacyRecord = resolvedBotId === undefined || resolvedBotId === null;

    const mergedSettings: GroupSettings = {
      chatId,
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
      ...existingSettings,
      ...incomingSettings,
      botId: resolvedBotId,
      botUsername: data.botUsername || incomingSettings.botUsername || existingSettings.botUsername || null,
      chatTitle: data.title || data.chat?.title || incomingSettings.chatTitle || existingSettings.chatTitle || `Group ${chatId}`,
      botLeft: data.status?.botLeft !== undefined ? Boolean(data.status.botLeft) : (incomingSettings.botLeft !== undefined ? Boolean(incomingSettings.botLeft) : Boolean(existingSettings.botLeft)),
      leftAt: data.status?.leftAt || incomingSettings.leftAt || existingSettings.leftAt,
      unavailable: data.status?.unavailable !== undefined ? Boolean(data.status.unavailable) : (incomingSettings.unavailable !== undefined ? Boolean(incomingSettings.unavailable) : Boolean(existingSettings.unavailable)),
      unavailableAt: data.status?.unavailableAt || incomingSettings.unavailableAt || existingSettings.unavailableAt,
      unavailableReason: data.status?.unavailableReason || incomingSettings.unavailableReason || existingSettings.unavailableReason,
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
    // For legacy unassigned records missing explicit configs, default them to disabled
    if (data.autoResponse || incomingSettings.autoResponse) {
      mergedSettings.autoResponse = {
        ...(mergedSettings.autoResponse || {}),
        ...(incomingSettings.autoResponse || {}),
        ...(data.autoResponse || {})
      };
    } else if (isLegacyRecord) {
      mergedSettings.autoResponse = {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      };
    } else if (!mergedSettings.autoResponse) {
      mergedSettings.autoResponse = {
        enabled: true,
        mode: 'every_message',
        cooldownSeconds: 30,
        randomize: false,
        minSeconds: 30,
        maxSeconds: 120,
        lastResponseTimestamp: 0
      };
    }

    if (data.autoSticker || incomingSettings.autoSticker) {
      mergedSettings.autoSticker = {
        ...(mergedSettings.autoSticker || {}),
        ...(incomingSettings.autoSticker || {}),
        ...(data.autoSticker || {})
      };
    } else if (isLegacyRecord) {
      mergedSettings.autoSticker = {
        enabled: false,
        mode: 'disabled',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300,
        lastStickerTimestamp: 0
      };
    } else if (!mergedSettings.autoSticker) {
      mergedSettings.autoSticker = {
        enabled: true,
        mode: 'cooldown',
        cooldownSeconds: 60,
        randomize: false,
        minSeconds: 60,
        maxSeconds: 300,
        lastStickerTimestamp: 0
      };
    }

    // Restore abuse words
    if (Array.isArray(data.abuseWords)) {
      mergedSettings.abuseWords = data.abuseWords;
      mergedSettings.customAbusiveWords = data.abuseWords;
    }

    // Restore moderators/admins
    if (Array.isArray(data.moderators) && data.moderators.length > 0) {
      (mergedSettings as any).admins = data.moderators;
    }

    this.data.settings[chatId] = mergedSettings;

    // 2. Messages restoration
    if (Array.isArray(data.messages) && data.messages.length > 0) {
      if (!this.data.groupConversationMemories) this.data.groupConversationMemories = {};
      const trimmed = data.messages.slice(-MAX_GROUP_STORED_MESSAGES);
      this.data.groupConversationMemories[key] = {
        chatId,
        messages: trimmed,
        lastUpdated: Date.now()
      };
      if (this.data.groupMemories) {
        this.data.groupMemories[key] = this.data.groupConversationMemories[key];
      }
      if (data.messages.length > MAX_GROUP_STORED_MESSAGES) {
        this.scheduleSave(chatId);
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
    if (Array.isArray(data.moderation?.warnings) && data.moderation.warnings.length > 0) {
      if (!this.data.warnings) this.data.warnings = [];
      const existingWarningIds = new Set(this.data.warnings.map((w: any) => w.id));
      for (const w of data.moderation.warnings) {
        if (w?.id && !existingWarningIds.has(w.id)) {
          this.data.warnings.push(w);
          existingWarningIds.add(w.id);
        }
      }
    }
    if (Array.isArray(data.moderation?.tempActions) && data.moderation.tempActions.length > 0) {
      if (!this.data.tempActions) this.data.tempActions = [];
      const existingActionIds = new Set(this.data.tempActions.map((t: any) => t.id));
      for (const t of data.moderation.tempActions) {
        if (t?.id && !existingActionIds.has(t.id)) {
          this.data.tempActions.push(t);
          existingActionIds.add(t.id);
        }
      }
    }

    // 6. Notes & Schedules
    const rawNotes = data.notes || data.statistics?.notes;
    if (rawNotes && typeof rawNotes === 'object') {
      if (!this.data.notes) this.data.notes = {};
      this.data.notes[key] = rawNotes;
    }
    const rawSchedules = data.schedules || data.statistics?.schedules;
    if (Array.isArray(rawSchedules) && rawSchedules.length > 0) {
      if (!this.data.schedules) this.data.schedules = [];
      const existingScheduleIds = new Set(this.data.schedules.map((s: any) => s.id));
      const incomingSchedules = rawSchedules.slice(-50);
      for (const s of incomingSchedules) {
        if (s?.id && !existingScheduleIds.has(s.id)) {
          this.data.schedules.push(s);
          existingScheduleIds.add(s.id);
        }
      }
    }

    // 7. Activity logs
    const rawLogs = data.activity || data.logs;
    if (Array.isArray(rawLogs) && rawLogs.length > 0) {
      if (!this.data.logs) this.data.logs = [];
      const existingLogIds = new Set(this.data.logs.map((l: any) => l.id));
      const incomingLogs = rawLogs.slice(-50);
      for (const log of incomingLogs) {
        if (log?.id && !existingLogIds.has(log.id)) {
          this.data.logs.push(log);
          existingLogIds.add(log.id);
        }
      }
    }

    // 8. Members restoration
    if (Array.isArray(data.members) && data.members.length > 0) {
      if (!this.data.groupMembers) this.data.groupMembers = {};
      for (const m of data.members) {
        if (m && m.userId) {
          const groupKey = `${chatId}_${m.userId}`;
          this.data.groupMembers[groupKey] = {
            userId: m.userId,
            username: m.username,
            firstName: m.firstName || (m as any).name || '',
            lastName: m.lastName,
            groupId: chatId,
            lastSeen: m.lastSeen || (m as any).lastActive || new Date().toISOString(),
            customRole: m.customRole || (m.role && m.role !== 'member' ? m.role : undefined)
          };
        }
      }
    } else if (data.groupMembers && typeof data.groupMembers === 'object') {
      if (!this.data.groupMembers) this.data.groupMembers = {};
      for (const [k, m] of Object.entries(data.groupMembers as Record<string, any>)) {
        if (m && m.userId) {
          const groupKey = k.startsWith(`${chatId}_`) ? k : `${chatId}_${m.userId}`;
          this.data.groupMembers[groupKey] = {
            userId: m.userId,
            username: m.username,
            firstName: m.firstName || (m as any).name || '',
            lastName: m.lastName,
            groupId: chatId,
            lastSeen: m.lastSeen || (m as any).lastActive || new Date().toISOString(),
            customRole: m.customRole || (m.role && m.role !== 'member' ? m.role : undefined)
          };
        }
      }
    }

    // 9. User lust levels
    if (Array.isArray(data.lustMode?.userLustLevels) && data.lustMode.userLustLevels.length > 0) {
      if (!this.data.userLustLevels) this.data.userLustLevels = {};
      for (const ul of data.lustMode.userLustLevels) {
        if (ul?.groupId && ul?.userId) {
          this.data.userLustLevels[`${ul.groupId}_${ul.userId}`] = ul;
        }
      }
    }

    // 10. Historical Member Backfill from messages
    const memory = this.getGroupMemory(chatId);
    if (Array.isArray(memory)) {
      if (!this.data.groupMembers) this.data.groupMembers = {};
      for (const msg of memory) {
        if (msg && msg.role === 'user') {
          const uId = (msg as any).userId;
          if (uId && typeof uId === 'number' && uId > 0 && uId !== 1087968824 && uId !== 777000) {
            const groupKey = `${chatId}_${uId}`;
            if (!this.data.groupMembers[groupKey]) {
              this.data.groupMembers[groupKey] = {
                userId: uId,
                username: msg.username,
                firstName: msg.name || msg.displayName || 'Member',
                groupId: chatId,
                lastSeen: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
              };
            }
          }
        }
      }
    }
  }

  public async hydrateGroupsFromMongo(botIdToHydrate?: number): Promise<{ hydratedCount: number; syncedToMongoCount: number; errorsCount: number }> {
    if (!mongoManager.getStatus().isConnected) {
      return { hydratedCount: 0, syncedToMongoCount: 0, errorsCount: 0 };
    }

    let hydratedCount = 0;
    const syncedToMongoCount = 0;
    let errorsCount = 0;

    const targetBotId = botIdToHydrate !== undefined ? botIdToHydrate : (this.currentBotId !== null ? this.currentBotId : undefined);

    try {
      const mongoGroups = await MongoStorageService.getAllGroups(targetBotId);
      console.log(`[Storage] Found ${mongoGroups.length} group(s) in MongoDB Atlas for botId=${targetBotId ?? 'ALL'} during startup hydration check.`);

      const mongoChatIds = new Set<string>();

      for (const doc of mongoGroups) {
        try {
          const rawChatId = doc.chatId || doc.numChatId;
          const numChatId = Number(rawChatId);
          if (isNaN(numChatId) || numChatId >= 0) continue;
          const chatIdStr = String(numChatId);
          mongoChatIds.add(chatIdStr);

          // MongoDB is the authoritative persistent source of truth - hydrate into RAM
          this.restoreGroupData(numChatId, doc);
          if (this.isDataDirWritable) {
            const targetFile = path.join(this.groupsDir, `${numChatId}.json`);
            const rawData = this.buildGroupDataObject(numChatId);
            const safeData = this.sanitizeGroupData(rawData);
            const jsonContent = JSON.stringify(safeData, null, 2);
            this.atomicWriteJsonSync(targetFile, jsonContent);
            this.lastSaveTimestamps.set(chatIdStr, new Date().toISOString());
          }
          hydratedCount++;
        } catch (groupErr: any) {
          console.error(`[Storage] Failed to hydrate group ${doc?.chatId} from MongoDB:`, groupErr?.message);
          errorsCount++;
        }
      }

      // If local RAM contained groups loaded from disk that are NOT in MongoDB for this bot scope,
      // prune them from local RAM cache without touching MongoDB (NEVER push local groups to MongoDB during hydration).
      if (this.data.settings) {
        for (const idStr of Object.keys(this.data.settings)) {
          const numChatId = Number(idStr);
          if (isNaN(numChatId) || numChatId >= 0) continue;
          const s = this.data.settings[numChatId];
          if (targetBotId !== undefined && s.botId !== undefined && s.botId !== targetBotId) {
            continue; // Do not touch groups belonging to other bots
          }
          if (!mongoChatIds.has(String(numChatId))) {
            // Group exists only in stale local cache, not in authoritative MongoDB.
            // Prune from local RAM/disk cache to prevent ghost state; NEVER write/insert into MongoDB.
            this.deleteGroupData(numChatId);
          }
        }
      }

      console.log(`[Storage] MongoDB hydration completed: ${hydratedCount} loaded into RAM & disk cache, 0 mutations to MongoDB, ${errorsCount} errors.`);
    } catch (err: any) {
      console.error('[Storage] Error during MongoDB startup hydration:', err?.message);
      errorsCount++;
    }

    return { hydratedCount, syncedToMongoCount, errorsCount };
  }

  public scheduleSave(chatId?: number | string) {
    this.lastSaveSuccessful = true;
    if (chatId !== undefined && chatId !== null) {
      const numId = Number(chatId);
      if (!isNaN(numId)) {
        this.pendingSaves.add(numId);
      }
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      if (this.pendingSaves && this.pendingSaves.size > 0) {
        for (const id of this.pendingSaves) {
          if (id < 0) {
            this.saveGroupJsonSync(id, false);
          } else if (id > 0) {
            this.savePrivateJsonSync(id);
          }
        }
        this.pendingSaves.clear();
      }
      this.persist();
      this.saveGlobalJsonSync();
    }, 100);
  }

  private persist() {
    this.cleanOldLogs();
    this.cleanExpiredMemories();
    try {
      this.ensureDirectories();
      this.atomicWriteJsonSync(this.dbFile, JSON.stringify(this.data, null, 2));
      this.lastSaveSuccessful = true;
      this.lastStorageError = null;
    } catch (err: any) {
      this.logStorageErrorOnce('persist database', err.message);
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
      autoDelete: Boolean(conv.autoDelete),
      lastUpdated: conv.lastUpdated,
      messages: conv.messages || [],
      lustLevel: this.getLustLevel(chatId, Number(chatId)),
      updatedAt: new Date().toISOString()
    };
  }

  public savePrivateJsonSync(chatId: number | string): void {
    const numChatId = Number(chatId);
    if (isNaN(numChatId) || numChatId <= 0) return;

    const writeStart = Date.now();
    logDebug({
      event: 'STORAGE_WRITE_START',
      chat_id: numChatId,
      type: 'private'
    });

    try {
      this.ensureDirectories();
      const rawData = this.buildPrivateDataObject(numChatId);
      const safeData = this.sanitizeGroupData(rawData);
      const targetFile = path.join(this.privateDir, `${numChatId}.json`);

      if (fs.existsSync(targetFile)) {
        try {
          const bakFile = path.join(this.privateBackupDir, `${numChatId}.json.bak`);
          fs.copyFileSync(targetFile, bakFile);
        } catch {}
      }

      const jsonContent = JSON.stringify(safeData, null, 2);
      this.atomicWriteJsonSync(targetFile, jsonContent);
      this.lastSaveSuccessful = true;
      this.lastStorageError = null;
      this.lastSaveTimestamps.set(String(numChatId), new Date().toISOString());

      const writeElapsed = Date.now() - writeStart;
      logDebug({
        event: 'STORAGE_WRITE_END',
        chat_id: numChatId,
        type: 'private',
        elapsedMs: writeElapsed
      });
    } catch (err: any) {
      this.logStorageErrorOnce(`save private chat ${chatId} JSON`, err.message);
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

    let mergedMessages = Array.isArray(data.messages) ? data.messages : existing.messages;
    if (mergedMessages.length > MAX_PRIVATE_CHAT_MESSAGES) {
      mergedMessages = mergedMessages.slice(-MAX_PRIVATE_CHAT_MESSAGES);
    }

    this.data.privateConversations[key] = {
      ...existing,
      chatId: data.chatId || existing.chatId,
      userId: data.userId || existing.userId || Number(chatId),
      username: data.username || existing.username,
      name: data.name || existing.name,
      language: data.language || existing.language || 'English',
      autoDelete: data.autoDelete !== undefined ? Boolean(data.autoDelete) : (existing.autoDelete || false),
      lastUpdated: data.lastUpdated || existing.lastUpdated || Date.now(),
      messages: mergedMessages
    };

    if (data.lustLevel !== undefined) {
      this.setLustLevel(chatId, Number(chatId), Number(data.lustLevel));
    }
  }

  public cleanupInactivePrivateConversations(thresholdDays: number = PRIVATE_CHAT_INACTIVITY_DAYS): number {
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let cleanedCount = 0;

    if (this.data.privateConversations) {
      for (const [key, conv] of Object.entries(this.data.privateConversations)) {
        const lastMsgTimestamp = conv.messages && conv.messages.length > 0
          ? conv.messages[conv.messages.length - 1].timestamp
          : conv.lastUpdated;
        const lastActivity = lastMsgTimestamp || conv.lastUpdated || 0;

        if (lastActivity > 0 && (now - lastActivity >= thresholdMs)) {
          delete this.data.privateConversations[key];
          cleanedCount++;

          try {
            const targetFile = path.join(this.privateDir, `${key}.json`);
            if (fs.existsSync(targetFile)) {
              fs.unlinkSync(targetFile);
            }
            const bakFile = path.join(this.privateBackupDir, `${key}.json.bak`);
            if (fs.existsSync(bakFile)) {
              fs.unlinkSync(bakFile);
            }
          } catch (err: any) {
            console.error(`[Storage] Error deleting inactive private chat file for ${key}:`, err.message);
          }
        }
      }
    }
    return cleanedCount;
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
            const now = Date.now();
            const lastUpdated = parsed.lastUpdated || (Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages[parsed.messages.length - 1].timestamp : 0);
            if (lastUpdated && (now - lastUpdated >= PRIVATE_CHAT_INACTIVITY_MS)) {
              // Inactivity >= 5 days: purge private chat JSON file & backup
              try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                const chatIdStr = file.replace('.json', '');
                const bakFile = path.join(this.privateBackupDir, `${chatIdStr}.json.bak`);
                if (fs.existsSync(bakFile)) fs.unlinkSync(bakFile);
              } catch {}
              continue;
            }

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
      const jsonContent = JSON.stringify(safeData, null, 2);
      this.atomicWriteJsonSync(targetFile, jsonContent);
      this.lastSaveSuccessful = true;
      this.lastStorageError = null;
    } catch (err: any) {
      this.logStorageErrorOnce('save global.json', err.message);
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

  public isMigrationApplied(migrationName: string): boolean {
    const list = this.data.globalSettings?.migrationsApplied || [];
    return list.includes(migrationName);
  }

  public markMigrationApplied(migrationName: string): void {
    if (!this.data.globalSettings) {
      this.data.globalSettings = { ...DEFAULT_GLOBAL_SETTINGS };
    }
    const currentList = this.data.globalSettings.migrationsApplied || [];
    if (!currentList.includes(migrationName)) {
      this.data.globalSettings.migrationsApplied = [...currentList, migrationName];
      this.saveGlobalJsonSync();
      this.persist();
    }
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
    user: { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean },
    groupId?: number | string
  ): CachedMember | null {
    if (!user || !user.id || user.id === 1087968824 || user.id === 777000 || user.id === 0) return null;
    if ((user as any).is_bot) return null;

    const numGroupId = groupId !== undefined && groupId !== null ? Number(groupId) : undefined;
    const now = new Date().toISOString();
    const customRole = numGroupId ? this.getCustomRole(numGroupId, user.id) : undefined;

    const cached: CachedMember = {
      userId: user.id,
      username: user.username,
      firstName: user.first_name || '',
      lastName: user.last_name || undefined,
      groupId: numGroupId || undefined,
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

    const prevGlobal = this.data.knownUsersById[user.id];
    const isGlobalMaterialChange = !prevGlobal ||
      prevGlobal.username !== cached.username ||
      prevGlobal.firstName !== cached.firstName ||
      prevGlobal.lastName !== cached.lastName;

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
      if (numGroupId) {
        for (const [key, m] of Object.entries(this.data.groupMembers)) {
          if (key.startsWith(`${numGroupId}_`) && m.userId !== user.id && m.username && m.username.toLowerCase() === uname) {
            delete m.username;
          }
        }
      }

      this.data.knownUsers[uname] = cached;
    }

    // Update group-specific member entry
    if (numGroupId) {
      const groupKey = `${numGroupId}_${user.id}`;
      const existing = this.data.groupMembers[groupKey];
      const isGroupMaterialChange = !existing ||
        existing.username !== cached.username ||
        existing.firstName !== cached.firstName ||
        existing.lastName !== cached.lastName ||
        existing.customRole !== cached.customRole;

      this.data.groupMembers[groupKey] = {
        ...cached,
        customRole: cached.customRole || existing?.customRole
      };
      if (isGroupMaterialChange) {
        this.scheduleSave(numGroupId);
      }
    } else {
      if (isGlobalMaterialChange) {
        this.scheduleSave();
      }
    }

    return cached;
  }

  public recordObservedGroupMember(
    groupId: number,
    user: { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean }
  ): CachedMember | null {
    return this.cacheUser(user, groupId);
  }

  // Alias for backward compatibility
  public registerUser(
    user: { id: number; username?: string; first_name?: string; last_name?: string; is_bot?: boolean },
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
  public getGroupSettingsIfExists(chatId: number): GroupSettings | undefined {
    return this.data.settings?.[chatId];
  }

  public getGroupSettings(chatId: number, chatTitle?: string): GroupSettings {
    if (!this.data.settings[chatId]) {
      this.data.settings[chatId] = {
        chatId,
        botId: this.currentBotId !== null ? this.currentBotId : undefined,
        botUsername: this.currentBotUsername || undefined,
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
        lastProactiveConsideredMessageId: 0,
        humanMessagesSinceLastSticker: 0,
        stickerActivityMin: 10,
        stickerActivityMax: 20,
        requiredStickerGap: Math.floor(Math.random() * (20 - 10 + 1)) + 10,
        responseTypeWeights: { text: 50, sticker: 30, both: 20 },
        autoEngine: {
          enabled: true,
          mode: 'messages_and_stickers',
          humanMessagesSinceLastSticker: 0,
          stickerActivityMin: 10,
          stickerActivityMax: 20,
          requiredStickerGap: 15,
          responseTypeWeights: { text: 50, sticker: 30, both: 20 },
          messages: {
            preset: 'normal',
            minSeconds: 480,
            maxSeconds: 900,
            cooldownSeconds: 480,
            randomize: true
          },
          stickers: {
            preset: 'normal',
            minSeconds: 600,
            maxSeconds: 1200,
            cooldownSeconds: 600,
            randomize: true
          }
        },
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
      this.scheduleSave(chatId);
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
      if (s.humanMessagesSinceLastSticker === undefined) { s.humanMessagesSinceLastSticker = 0; needsSave = true; }
      if (s.stickerActivityMin === undefined) { s.stickerActivityMin = 10; needsSave = true; }
      if (s.stickerActivityMax === undefined) { s.stickerActivityMax = 20; needsSave = true; }
      if (s.requiredStickerGap === undefined || s.requiredStickerGap === 0) {
        const min = s.stickerActivityMin || 10;
        const max = s.stickerActivityMax || 20;
        const safeMin = Math.min(min, max);
        const safeMax = Math.max(min, max);
        s.requiredStickerGap = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
        needsSave = true;
      }
      if (!s.responseTypeWeights || typeof s.responseTypeWeights !== 'object') {
        s.responseTypeWeights = { text: 50, sticker: 30, both: 20 };
        needsSave = true;
      }
      if (!s.autoEngine) {
        const arEnabled = Boolean(s.autoResponse?.enabled && s.autoResponse.mode !== 'disabled');
        const asEnabled = Boolean(s.autoSticker?.enabled && s.autoSticker.mode !== 'disabled');
        let initialMode: AutoEngineMode = 'messages_and_stickers';
        if (!arEnabled && !asEnabled) initialMode = 'off';
        else if (arEnabled && !asEnabled) initialMode = 'messages_only';
        else if (!arEnabled && asEnabled) initialMode = 'stickers_only';

        const arMin = s.autoResponse?.minSeconds;
        const arMax = s.autoResponse?.maxSeconds;
        const arIsCustom = (arMin !== undefined && arMin !== 480) || (arMax !== undefined && arMax !== 900);
        const asMin = s.autoSticker?.minSeconds;
        const asMax = s.autoSticker?.maxSeconds;
        const asIsCustom = (asMin !== undefined && asMin !== 600) || (asMax !== undefined && asMax !== 1200);

        const minFloor = this.bypassMinimumIntervalForTests ? 1 : 120;
        s.autoEngine = {
          enabled: initialMode !== 'off',
          mode: initialMode,
          humanMessagesSinceLastSticker: s.humanMessagesSinceLastSticker,
          stickerActivityMin: s.stickerActivityMin,
          stickerActivityMax: s.stickerActivityMax,
          requiredStickerGap: s.requiredStickerGap,
          responseTypeWeights: s.responseTypeWeights,
          messages: {
            preset: arIsCustom ? 'custom' : 'normal',
            minSeconds: Math.max(minFloor, arMin || 480),
            maxSeconds: Math.max(Math.max(minFloor, arMin || 480), arMax || 900),
            cooldownSeconds: Math.max(minFloor, s.autoResponse?.cooldownSeconds || 480),
            randomize: true
          },
          stickers: {
            preset: asIsCustom ? 'custom' : 'normal',
            minSeconds: Math.max(minFloor, asMin || 600),
            maxSeconds: Math.max(Math.max(minFloor, asMin || 600), asMax || 1200),
            cooldownSeconds: Math.max(minFloor, s.autoSticker?.cooldownSeconds || 600),
            randomize: true
          }
        };
        needsSave = true;
      } else {
        if (s.autoEngine.humanMessagesSinceLastSticker === undefined) s.autoEngine.humanMessagesSinceLastSticker = s.humanMessagesSinceLastSticker;
        if (s.autoEngine.stickerActivityMin === undefined) s.autoEngine.stickerActivityMin = s.stickerActivityMin;
        if (s.autoEngine.stickerActivityMax === undefined) s.autoEngine.stickerActivityMax = s.stickerActivityMax;
        if (s.autoEngine.requiredStickerGap === undefined) s.autoEngine.requiredStickerGap = s.requiredStickerGap;
        if (s.autoEngine.responseTypeWeights === undefined) s.autoEngine.responseTypeWeights = s.responseTypeWeights;

        const minFloor = this.bypassMinimumIntervalForTests ? 1 : 120;
        for (const ch of ['messages', 'stickers'] as const) {
          const cfg = s.autoEngine[ch];
          if (cfg) {
            if (cfg.minSeconds !== undefined) cfg.minSeconds = Math.max(minFloor, cfg.minSeconds);
            if (cfg.maxSeconds !== undefined) cfg.maxSeconds = Math.max(cfg.minSeconds ?? minFloor, cfg.maxSeconds);
            if (cfg.cooldownSeconds !== undefined) cfg.cooldownSeconds = Math.max(minFloor, cfg.cooldownSeconds);

            if (cfg.preset && cfg.preset !== 'custom' && AUTO_ENGINE_PRESETS[cfg.preset]) {
              const presetDef = AUTO_ENGINE_PRESETS[cfg.preset][ch];
              const isCustomTiming = (cfg.minSeconds !== undefined && cfg.minSeconds !== presetDef.minSeconds) ||
                                     (cfg.maxSeconds !== undefined && cfg.maxSeconds !== presetDef.maxSeconds);
              if (isCustomTiming) {
                cfg.preset = 'custom';
                needsSave = true;
              }
            }
          }
        }
      }
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
        this.scheduleSave(chatId);
      }
    }
    return this.data.settings[chatId];
  }

  public getAllGroupSettings(botId?: number): Record<number, GroupSettings> {
    const targetBotId = botId !== undefined ? botId : (this.currentBotId !== null ? this.currentBotId : undefined);
    const result: Record<number, GroupSettings> = {};
    if (!this.data.settings) return result;
    for (const [idStr, s] of Object.entries(this.data.settings)) {
      const numId = Number(idStr);
      if (isNaN(numId) || numId >= 0) continue;
      if (targetBotId === undefined || s.botId === targetBotId || s.botId === undefined || s.botId === null) {
        result[numId] = s;
      }
    }
    return result;
  }

  public getConnectedGroups(botId?: number): Array<any> {
    const scopedSettings = this.getAllGroupSettings(botId);
    return Object.entries(scopedSettings)
      .filter(([chatIdStr]) => Number(chatIdStr) < 0)
      .map(([chatIdStr, s]: [string, any]) => {
        const chatId = Number(chatIdStr);
        const groupLogs = this.getGroupLogs(chatId, 100);
        const bans = groupLogs.filter(l => l.action === 'ban' || l.action === 'auto_ban').length;
        const kicks = groupLogs.filter(l => l.action === 'kick').length;
        const mutes = groupLogs.filter(l => l.action === 'mute').length;
        const reports = groupLogs.filter(l => l.action === 'report').length;
        const schedules = this.getGroupSchedules(chatId).length;

        const isLeft = Boolean(s.botLeft);
        const isUnavailable = Boolean(s.unavailable);
        let status = 'Active';
        let botRole = 'Administrator';

        if (isUnavailable) {
          status = 'Unavailable';
          botRole = 'Unavailable';
        } else if (isLeft) {
          status = 'Bot Left';
          botRole = 'Left';
        } else if (!(s.linksProtection && s.stickerProtection)) {
          status = 'Limited Permissions';
        }

        return {
          chatId,
          chatTitle: s.chatTitle || `Group ${chatId}`,
          chatType: chatId < 0 ? 'supergroup' : 'private',
          username: s.username || undefined,
          memberCount: s.memberCount || 1,
          status,
          botRole,
          protectionStatus: Boolean(s.protectionEnabled || s.stickerProtection || s.linksProtection),
          lustMode: Boolean(s.lustMode),
          botLeft: isLeft,
          unavailable: isUnavailable,
          unavailableReason: s.unavailableReason,
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
  }

  public getConnectedGroupCount(botId?: number): number {
    const scopedSettings = this.getAllGroupSettings(botId);
    return Object.keys(scopedSettings).filter(k => Number(k) < 0).length;
  }

  public removeGroupFromDashboard(chatId: number | string, targetBotId?: number): boolean {
    const numChatId = Number(chatId);
    if (isNaN(numChatId) || numChatId >= 0) return false;

    const resolvedBotId = targetBotId !== undefined ? targetBotId : (this.currentBotId !== null ? this.currentBotId : undefined);
    if (!resolvedBotId) {
      console.warn(`[Storage] removeGroupFromDashboard rejected: No botId provided or active for group ${numChatId}`);
      return false;
    }

    // 1. Verify in-memory settings record if present
    const settings = this.data.settings?.[numChatId];
    if (settings) {
      // If group exists in memory and does not belong to this bot (different botId or legacy without botId), reject removal
      if (settings.botId !== resolvedBotId) {
        console.warn(`[Storage] removeGroupFromDashboard rejected: Group ${numChatId} has botId ${settings.botId ?? 'LEGACY/NONE'}, expected ${resolvedBotId}`);
        return false;
      }
      // Remove only this connected-group settings record from RAM
      delete this.data.settings[numChatId];
    }

    // 2. Remove persisted group JSON file if present and owned by targetBotId
    const targetFile = path.join(this.groupsDir, `${numChatId}.json`);
    let fileRemoved = false;
    if (fs.existsSync(targetFile)) {
      try {
        const raw = fs.readFileSync(targetFile, 'utf-8');
        if (raw.trim()) {
          const parsed = JSON.parse(raw);
          const fileBotId = parsed.botId !== undefined ? parsed.botId : parsed.settings?.botId;
          // Only remove if file strictly belongs to resolvedBotId
          if (fileBotId === resolvedBotId) {
            fs.unlinkSync(targetFile);
            fileRemoved = true;
          }
        }
      } catch (err: any) {
        console.error(`[Storage] Error inspecting/removing group file ${targetFile}:`, err.message);
      }
    }

    if (!settings && !fileRemoved) {
      return false;
    }

    // 3. Clean up backup file if present and owned by targetBotId
    const bakFile = path.join(this.groupsBackupDir, `${numChatId}.json.bak`);
    if (fs.existsSync(bakFile)) {
      try {
        const rawBak = fs.readFileSync(bakFile, 'utf-8');
        if (rawBak.trim()) {
          const parsedBak = JSON.parse(rawBak);
          const bakBotId = parsedBak.botId !== undefined ? parsedBak.botId : parsedBak.settings?.botId;
          if (bakBotId === resolvedBotId) {
            fs.unlinkSync(bakFile);
          }
        }
      } catch {}
    }

    // 4. Clean up pending write queues / save timestamps for this group
    this.groupWriteQueues.delete(String(numChatId));
    this.lastSaveTimestamps.delete(String(numChatId));
    this.pendingSaves.delete(numChatId);

    // 5. Persist bot_storage.json atomically to save the updated settings map
    this.persist();

    // 6. Trigger MongoDB delete if connected
    if (mongoManager.getStatus().isConnected) {
      MongoStorageService.deleteGroup(numChatId, resolvedBotId).catch((mongoErr) => {
        console.warn(`[Storage] Background MongoDB deleteGroup failed for group ${numChatId}: ${mongoErr?.message}`);
      });
    }

    // 7. Notify groupRemovalListeners to immediately cancel active AutoEngine timers
    for (const listener of this.groupRemovalListeners) {
      try {
        listener(numChatId, resolvedBotId);
      } catch (err) {
        console.error('[STORAGE] Error in group removal listener:', err);
      }
    }

    return settings !== undefined || fileRemoved;
  }

  public isStaleSettingsUpdate(chatId: number | string, clientTimestamp: number): boolean {
    const numId = Number(chatId);
    const last = this.lastSettingsTimestamps.get(numId) || 0;
    if (clientTimestamp && clientTimestamp < last) {
      return true; // Stale, superseded by newer request
    }
    return false;
  }

  public recordSettingsTimestamp(chatId: number | string, clientTimestamp: number): void {
    const numId = Number(chatId);
    if (clientTimestamp) {
      const current = this.lastSettingsTimestamps.get(numId) || 0;
      if (clientTimestamp > current) {
        this.lastSettingsTimestamps.set(numId, clientTimestamp);
      }
    }
  }

  public updateGroupSettings(chatId: number, updates: Partial<GroupSettings>): GroupSettings {
    const current = this.getGroupSettings(chatId);
    
    // Check if updates are identical to current settings (idempotency check)
    let hasActualChanges = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'updatedAt' || k === '_clientTimestamp' || k === '_version') continue;
      const currentVal = (current as any)[k];
      if (typeof v === 'object' && v !== null) {
        if (JSON.stringify(currentVal) !== JSON.stringify(v)) {
          hasActualChanges = true;
          break;
        }
      } else if (currentVal !== v) {
        hasActualChanges = true;
        break;
      }
    }

    if (!hasActualChanges && !updates.autoResponse && !updates.autoSticker && !updates.autoEngine) {
      return current; // Avoid redundant disk writes and memory object re-allocation
    }

    const normalizeChannelConfig = (
      channel: 'messages' | 'stickers',
      currentCh?: AutoEngineChannelConfig,
      incomingCh?: Partial<AutoEngineChannelConfig>
    ): AutoEngineChannelConfig => {
      const minFloor = this.bypassMinimumIntervalForTests ? 1 : 120;
      const defaultPreset: AutoEnginePreset = 'normal';
      const basePreset = incomingCh?.preset ?? currentCh?.preset ?? defaultPreset;

      const rawMin = incomingCh?.minSeconds ?? currentCh?.minSeconds;
      const rawMax = incomingCh?.maxSeconds ?? currentCh?.maxSeconds;
      const rawCd = incomingCh?.cooldownSeconds ?? currentCh?.cooldownSeconds;

      if (basePreset === 'custom' || incomingCh?.preset === 'custom') {
        const minSec = Math.max(minFloor, rawMin ?? (this.bypassMinimumIntervalForTests ? 30 : 120));
        const maxSec = Math.max(minSec, rawMax ?? (channel === 'messages' ? (this.bypassMinimumIntervalForTests ? 60 : 300) : (this.bypassMinimumIntervalForTests ? 60 : 300)));
        const cdSec = Math.max(minFloor, rawCd ?? minSec);
        return {
          preset: 'custom',
          minSeconds: minSec,
          maxSeconds: maxSec,
          cooldownSeconds: cdSec,
          randomize: incomingCh?.randomize ?? currentCh?.randomize ?? true
        };
      }

      const presetDef = AUTO_ENGINE_PRESETS[basePreset]?.[channel] || AUTO_ENGINE_PRESETS.normal[channel];

      const hasCustomMinMax = (incomingCh?.minSeconds !== undefined && incomingCh.minSeconds !== presetDef.minSeconds) ||
                              (incomingCh?.maxSeconds !== undefined && incomingCh.maxSeconds !== presetDef.maxSeconds);

      if (hasCustomMinMax && !incomingCh?.preset) {
        const minSec = Math.max(minFloor, rawMin ?? presetDef.minSeconds);
        const maxSec = Math.max(minSec, rawMax ?? presetDef.maxSeconds);
        const cdSec = Math.max(minFloor, rawCd ?? presetDef.cooldownSeconds);
        return {
          preset: 'custom',
          minSeconds: minSec,
          maxSeconds: maxSec,
          cooldownSeconds: cdSec,
          randomize: incomingCh?.randomize ?? currentCh?.randomize ?? true
        };
      }

      return {
        preset: basePreset,
        minSeconds: Math.max(minFloor, incomingCh?.minSeconds ?? presetDef.minSeconds),
        maxSeconds: Math.max(Math.max(minFloor, incomingCh?.minSeconds ?? presetDef.minSeconds), incomingCh?.maxSeconds ?? presetDef.maxSeconds),
        cooldownSeconds: Math.max(minFloor, incomingCh?.cooldownSeconds ?? presetDef.cooldownSeconds),
        randomize: incomingCh?.randomize ?? currentCh?.randomize ?? true
      };
    };

    const baseEngine = current.autoEngine || {
      enabled: true,
      mode: 'messages_and_stickers',
      messages: { preset: 'normal', minSeconds: 480, maxSeconds: 900, cooldownSeconds: 480, randomize: true },
      stickers: { preset: 'normal', minSeconds: 600, maxSeconds: 1200, cooldownSeconds: 600, randomize: true }
    };

    let mergedAutoEngine: AutoEngineConfig = updates.autoEngine
      ? {
          ...baseEngine,
          ...updates.autoEngine,
          messages: normalizeChannelConfig('messages', baseEngine.messages, updates.autoEngine.messages),
          stickers: normalizeChannelConfig('stickers', baseEngine.stickers, updates.autoEngine.stickers)
        }
      : {
          ...baseEngine,
          messages: normalizeChannelConfig('messages', baseEngine.messages),
          stickers: normalizeChannelConfig('stickers', baseEngine.stickers)
        };

    let mergedAutoResponse = updates.autoResponse
      ? { ...(current.autoResponse || {}), ...updates.autoResponse }
      : current.autoResponse;
    if (mergedAutoResponse && updates.autoResponse?.lastResponseTimestamp === 0 && !updates.autoResponse.nextAllowedAt) {
      mergedAutoResponse.nextAllowedAt = 0;
    }

    let mergedAutoSticker = updates.autoSticker
      ? { ...(current.autoSticker || {}), ...updates.autoSticker }
      : current.autoSticker;
    if (mergedAutoSticker && updates.autoSticker?.lastStickerTimestamp === 0 && !updates.autoSticker.nextAllowedAt) {
      mergedAutoSticker.nextAllowedAt = 0;
    }

    // Bidirectional synchronization
    if (updates.autoEngine) {
      const mode = mergedAutoEngine.mode;
      const isEnabled = Boolean(mergedAutoEngine.enabled && mode !== 'off');
      if (mergedAutoResponse) {
        mergedAutoResponse.enabled = isEnabled && (mode === 'messages_only' || mode === 'messages_and_stickers');
        mergedAutoResponse.mode = mergedAutoResponse.enabled ? 'random' : 'disabled';
        if (mergedAutoEngine.messages) {
          mergedAutoResponse.minSeconds = mergedAutoEngine.messages.minSeconds;
          mergedAutoResponse.maxSeconds = mergedAutoEngine.messages.maxSeconds;
          mergedAutoResponse.cooldownSeconds = mergedAutoEngine.messages.cooldownSeconds;
          mergedAutoResponse.randomize = mergedAutoEngine.messages.randomize;
        }
      }
      if (mergedAutoSticker) {
        mergedAutoSticker.enabled = isEnabled && (mode === 'stickers_only' || mode === 'messages_and_stickers');
        mergedAutoSticker.mode = mergedAutoSticker.enabled ? 'cooldown' : 'disabled';
        if (mergedAutoEngine.stickers) {
          mergedAutoSticker.minSeconds = mergedAutoEngine.stickers.minSeconds;
          mergedAutoSticker.maxSeconds = mergedAutoEngine.stickers.maxSeconds;
          mergedAutoSticker.cooldownSeconds = mergedAutoEngine.stickers.cooldownSeconds;
          mergedAutoSticker.randomize = mergedAutoEngine.stickers.randomize;
        }
      }
    } else if (updates.autoResponse || updates.autoSticker) {
      const arEnabled = Boolean(mergedAutoResponse?.enabled && mergedAutoResponse.mode !== 'disabled');
      const asEnabled = Boolean(mergedAutoSticker?.enabled && mergedAutoSticker.mode !== 'disabled');
      let derivedMode: AutoEngineMode = 'off';
      if (arEnabled && asEnabled) derivedMode = 'messages_and_stickers';
      else if (arEnabled && !asEnabled) derivedMode = 'messages_only';
      else if (!arEnabled && asEnabled) derivedMode = 'stickers_only';
      mergedAutoEngine.mode = derivedMode;
      mergedAutoEngine.enabled = derivedMode !== 'off';
      const minFloor = this.bypassMinimumIntervalForTests ? 1 : 120;
      if (updates.autoResponse) {
        const minS = Math.max(minFloor, updates.autoResponse.minSeconds ?? mergedAutoEngine.messages?.minSeconds ?? (this.bypassMinimumIntervalForTests ? 30 : 120));
        const maxS = Math.max(minS, updates.autoResponse.maxSeconds ?? mergedAutoEngine.messages?.maxSeconds ?? (this.bypassMinimumIntervalForTests ? 60 : 300));
        const cdS = Math.max(minFloor, updates.autoResponse.cooldownSeconds ?? mergedAutoEngine.messages?.cooldownSeconds ?? minS);
        mergedAutoEngine.messages = {
          preset: 'custom',
          minSeconds: minS,
          maxSeconds: maxS,
          cooldownSeconds: cdS,
          randomize: updates.autoResponse.randomize ?? (updates.autoResponse.mode === 'random') ?? mergedAutoEngine.messages?.randomize ?? true
        };
      }
      if (updates.autoSticker) {
        const minS = Math.max(minFloor, updates.autoSticker.minSeconds ?? mergedAutoEngine.stickers?.minSeconds ?? (this.bypassMinimumIntervalForTests ? 30 : 120));
        const maxS = Math.max(minS, updates.autoSticker.maxSeconds ?? mergedAutoEngine.stickers?.maxSeconds ?? (this.bypassMinimumIntervalForTests ? 60 : 300));
        const cdS = Math.max(minFloor, updates.autoSticker.cooldownSeconds ?? mergedAutoEngine.stickers?.cooldownSeconds ?? minS);
        mergedAutoEngine.stickers = {
          preset: 'custom',
          minSeconds: minS,
          maxSeconds: maxS,
          cooldownSeconds: cdS,
          randomize: updates.autoSticker.randomize ?? (updates.autoSticker.mode === 'random') ?? mergedAutoEngine.stickers?.randomize ?? true
        };
      }
    }

    const updatedHumanCount = updates.humanMessagesSinceLastSticker ?? updates.autoEngine?.humanMessagesSinceLastSticker ?? current.humanMessagesSinceLastSticker ?? 0;
    const updatedStickerGap = updates.requiredStickerGap ?? updates.autoEngine?.requiredStickerGap ?? current.requiredStickerGap;
    const updatedMin = updates.stickerActivityMin ?? updates.autoEngine?.stickerActivityMin ?? current.stickerActivityMin ?? 10;
    const updatedMax = updates.stickerActivityMax ?? updates.autoEngine?.stickerActivityMax ?? current.stickerActivityMax ?? 20;
    const updatedWeights = updates.responseTypeWeights ?? updates.autoEngine?.responseTypeWeights ?? current.responseTypeWeights ?? { text: 50, sticker: 30, both: 20 };

    mergedAutoEngine.humanMessagesSinceLastSticker = updatedHumanCount;
    mergedAutoEngine.requiredStickerGap = updatedStickerGap;
    mergedAutoEngine.stickerActivityMin = updatedMin;
    mergedAutoEngine.stickerActivityMax = updatedMax;
    mergedAutoEngine.responseTypeWeights = updatedWeights;

    const updated = {
      ...current,
      ...updates,
      humanMessagesSinceLastSticker: updatedHumanCount,
      requiredStickerGap: updatedStickerGap,
      stickerActivityMin: updatedMin,
      stickerActivityMax: updatedMax,
      responseTypeWeights: updatedWeights,
      autoEngine: mergedAutoEngine,
      autoResponse: mergedAutoResponse,
      autoSticker: mergedAutoSticker,
      updatedAt: new Date().toISOString()
    };
    this.data.settings[chatId] = updated;
    this.saveGroupJsonSync(chatId);
    this.scheduleSave(chatId);

    // Replicate botLeft / unavailable / settings updates to MongoDB Atlas if connected
    if (mongoManager.getStatus().isConnected) {
      const targetBotId = this.currentBotId ?? updated.botId;
      if (targetBotId !== undefined && targetBotId !== null) {
        const rawData = this.buildGroupDataObject(chatId);
        const safeData = this.sanitizeGroupData(rawData);
        MongoStorageService.saveGroup(safeData, targetBotId, this.currentBotUsername ?? undefined).catch((err) => {
          console.warn(`[Storage] Background Mongo replication failed for group ${chatId}:`, err?.message);
        });
      }
    }

    for (const listener of this.settingsChangeListeners) {
      try {
        listener(chatId, updated, this.currentBotId);
      } catch (err) {
        console.error('[STORAGE] Error in settings change listener:', err);
      }
    }

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
      this.saveGroupJsonSync(numId);
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
    this.saveGroupJsonSync(numId);
    this.scheduleSave(numId);
    return settings.abuseWords;
  }

  public clearAbuseWords(chatId: number | string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.abuseWords = [];
    settings.customAbusiveWords = [];
    this.saveGroupJsonSync(numId);
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
    this.saveGroupJsonSync(record.chatId);
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
    this.saveGroupJsonSync(chatId);
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
    this.saveGroupJsonSync(chatId);
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
    this.saveGroupJsonSync(chatId);
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
      this.saveGroupJsonSync(chatId);
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
      this.saveGroupJsonSync(chatId);
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
    this.saveGroupJsonSync(chatId);
    this.scheduleSave(chatId);
    return record;
  }

  public unapproveUser(chatId: number, userId: number): boolean {
    if (!this.data.approvedUsers) return false;
    const key = `${chatId}_${userId}`;
    if (this.data.approvedUsers[key]) {
      delete this.data.approvedUsers[key];
      this.saveGroupJsonSync(chatId);
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

  // --- Configuration Export & Lossless Backup System ---
  public exportGroupFullBackup(chatId: number | string): any {
    const numId = Number(chatId);
    const s = this.getGroupSettings(numId);
    const mediaLib = this.getMediaLibrary(numId);
    const abuseWordsList = s.abuseWords || s.customAbusiveWords || [];
    const notes = this.getAllNotes(numId);
    const schedules = this.getGroupSchedules(numId);
    const locks = this.getLocks(numId);
    const filters = this.getFilters(numId);
    const whitelist = this.getLinkWhitelist(numId);

    // Build sticker packs with Telegram URLs and metadata
    const packsList: any[] = [];
    if (s.stickerPacks && typeof s.stickerPacks === 'object') {
      for (const [pName, pack] of Object.entries(s.stickerPacks)) {
        if (pack && pack.name) {
          const cleanName = pack.name.replace(/^https:\/\/t\.me\/addstickers\//i, '').replace(/[<>]/g, '').trim();
          packsList.push({
            name: cleanName,
            title: pack.title || pack.name,
            telegramUrl: pack.telegramUrl || `https://t.me/addstickers/${cleanName}`,
            enabled: pack.enabled !== false,
            stickerCount: pack.stickerCount || pack.stickers?.length || 0,
            stickers: Array.isArray(pack.stickers) ? pack.stickers.map((stk: any) => ({
              fileId: stk.fileId || stk.file_id,
              emoji: stk.emoji || '✨',
              category: stk.category || stk.mood || 'general',
              mood: stk.mood || stk.category || 'general',
              name: stk.name
            })) : []
          });
        }
      }
    }

    // Build user lust levels for this group
    const userLustScores = Object.entries(this.data.userLustLevels || {})
      .filter(([k]) => k.startsWith(`${numId}_`))
      .map(([_, v]) => ({
        userId: v.userId,
        level: v.level,
        lastUpdated: v.lastUpdated
      }));

    return {
      version: '3.0',
      backupVersion: '1.0',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      group: {
        chatId: String(numId),
        chatTitle: s.chatTitle || `Group ${numId}`,
        title: s.chatTitle || `Group ${numId}`,
        username: (s as any).username || null,
        type: numId < 0 ? 'supergroup' : 'group'
      },
      settings: {
        chatTitle: s.chatTitle,
        slowModeSeconds: s.slowModeSeconds ?? 0,
        notes: s.notes || '',
        warnLimit: s.warnLimit ?? 3,
        warnAction: s.warnAction || 'ban',
        warnExpireSeconds: s.warnExpireSeconds ?? 0,
        autoAcceptEnabled: Boolean(s.autoAcceptEnabled),
        captchaEnabled: Boolean(s.captchaEnabled),
        captchaMode: s.captchaMode || 'button',
        captchaTimeout: s.captchaTimeout ?? 120,
        captchaAction: s.captchaAction || 'kick',
        autoDeleteJoinLeave: Boolean(s.autoDeleteJoinLeave),
        reportsEnabled: s.reportsEnabled !== false,
        reactionEnabled: Boolean(s.reactionEnabled),
        reactionProbability: s.reactionProbability ?? 0.15,
        protectionDuplicateLimit: s.protectionDuplicateLimit ?? 3,
        protectionLinkBurstLimit: s.protectionLinkBurstLimit ?? 3
      },
      welcome: {
        welcomeEnabled: Boolean(s.welcomeEnabled),
        welcomeMessage: s.welcomeMessage || 'Welcome {user} to {chat}!',
        goodbyeEnabled: Boolean(s.goodbyeEnabled),
        goodbyeMessage: s.goodbyeMessage || 'Goodbye {user}!',
        enabled: Boolean(s.welcomeEnabled),
        message: s.welcomeMessage || 'Welcome {user} to {chat}!'
      },
      moderation: {
        antiSpam: Boolean((s as any).antiSpam ?? s.stopSpamEnabled),
        antiFlood: Boolean((s as any).antiFlood ?? s.floodEnabled),
        stopSpamEnabled: Boolean(s.stopSpamEnabled ?? (s as any).antiSpam),
        floodEnabled: Boolean(s.floodEnabled ?? (s as any).antiFlood),
        floodCount: s.floodCount ?? 8,
        floodWindow: s.floodWindow ?? 5,
        floodAction: s.floodAction || 'mute',
        raidEnabled: Boolean(s.raidEnabled),
        raidLimit: s.raidLimit ?? 8,
        raidWindow: s.raidWindow ?? 30,
        raidAction: s.raidAction || 'kick',
        raidDuration: s.raidDuration ?? 300,
        stopAbusiveEnabled: Boolean(s.stopAbusiveEnabled),
        stopPromotionEnabled: Boolean(s.stopPromotionEnabled),
        automodEnabled: Boolean(s.automodEnabled),
        securityEnabled: Boolean(s.securityEnabled),
        locks,
        filters
      },
      contentProtection: {
        antiLinks: Boolean((s as any).antiLinks ?? s.linksProtection),
        blockVoiceNotes: Boolean((s as any).blockVoiceNotes ?? s.voiceProtection),
        linksProtection: Boolean(s.linksProtection ?? (s as any).antiLinks),
        stickerProtection: Boolean(s.stickerProtection),
        fileProtection: Boolean(s.fileProtection),
        imageProtection: Boolean(s.imageProtection),
        gifProtection: Boolean(s.gifProtection),
        voiceProtection: Boolean(s.voiceProtection ?? (s as any).blockVoiceNotes),
        audioProtection: Boolean(s.audioProtection),
        linksWhitelist: whitelist
      },
      abuseWords: abuseWordsList,
      stickers: {
        packs: packsList,
        stickerProtection: Boolean(s.stickerProtection),
        mediaLibrary: {
          stickers: mediaLib?.stickers || {},
          animations: mediaLib?.animations || {},
          lustStickers: mediaLib?.lustStickers || {},
          stickerMetadata: mediaLib?.stickerMetadata || {}
        }
      },
      lustMode: {
        enabled: Boolean((s as any).lustModeEnabled ?? s.lustMode),
        level: (s as any).lustModeLevel ?? s.lustLevel ?? 0,
        lustModeEnabled: Boolean((s as any).lustModeEnabled ?? s.lustMode),
        lustModeLevel: (s as any).lustModeLevel ?? s.lustLevel ?? 0,
        userLustLevels: userLustScores
      },
      autoResponse: {
        enabled: Boolean(s.autoResponse?.enabled),
        frequencyMinutes: (s.autoResponse as any)?.frequencyMinutes ?? 30,
        triggerMode: (s.autoResponse as any)?.triggerMode || s.autoResponse?.mode || 'time',
        sampleReplies: (s.autoResponse as any)?.sampleReplies || [],
        mode: s.autoResponse?.mode || 'every_message',
        cooldownSeconds: s.autoResponse?.cooldownSeconds ?? 30,
        minSeconds: s.autoResponse?.minSeconds ?? 30,
        maxSeconds: s.autoResponse?.maxSeconds ?? 120
      },
      autoSticker: {
        enabled: Boolean(s.autoSticker?.enabled),
        frequencyMinutes: (s.autoSticker as any)?.frequencyMinutes ?? 30,
        defaultPacks: (s.autoSticker as any)?.defaultPacks || [],
        mode: s.autoSticker?.mode || 'cooldown',
        cooldownSeconds: s.autoSticker?.cooldownSeconds ?? 60,
        minSeconds: s.autoSticker?.minSeconds ?? 60,
        maxSeconds: s.autoSticker?.maxSeconds ?? 300
      },
      slowmode: {
        slowModeSeconds: s.slowModeSeconds ?? 0
      },
      permissions: {
        contentPermissions: this.data.contentPermissions?.[String(numId)] || null,
        customRoles: this.data.customRoles?.[String(numId)] || {},
        stickerFreeUsers: (this.data.stickerFreeUsers || []).filter((u: any) => u.chatId === numId)
      },
      commands: {
        customCommands: (s as any).customCommands || {}
      },
      schedules: schedules.map((sc: any) => ({
        id: sc.id,
        name: sc.name || sc.title,
        cron: sc.cron || sc.time,
        enabled: sc.enabled !== false,
        text: sc.text || sc.message,
        message: sc.message || sc.text,
        target: sc.target || String(numId),
        timezone: sc.timezone || 'UTC'
      })),
      personality: {
        chatbotEnabled: Boolean(s.chatbotEnabled),
        chatbotMode: s.chatbotMode || 'auto',
        personality: (s as any).personality || 'normal',
        language: (s as any).language || 'hinglish',
        brotherZoneEnabled: (s as any).brotherZoneEnabled ?? true,
        coupleFilter: (s as any).coupleFilter ?? true
      },
      notes: notes.map((n) => ({ name: n.name, content: n.content }))
    };
  }

  public exportGroupConfig(chatId: number): object {
    return this.exportGroupFullBackup(chatId);
  }

  // --- CSV Human-Readable Flattened Export ---
  public exportGroupCSV(chatId: number | string): string {
    const backup = this.exportGroupFullBackup(chatId);
    const rows: string[][] = [
      ['type', 'category', 'key', 'value', 'details']
    ];

    const escapeCsv = (val: any) => {
      if (val === undefined || val === null) return '';
      const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Group info
    rows.push(['group', 'identity', 'chatId', backup.group.chatId, 'Telegram Chat ID']);
    rows.push(['group', 'identity', 'title', backup.group.title, 'Group Title']);
    if (backup.group.username) rows.push(['group', 'identity', 'username', backup.group.username, 'Group Username']);
    rows.push(['group', 'identity', 'type', backup.group.type, 'Group Type']);

    // General settings
    for (const [k, v] of Object.entries(backup.settings)) {
      rows.push(['setting', 'general', k, String(v), 'General Configuration']);
    }

    // Welcome & Goodbye
    rows.push(['welcome', 'greeting', 'enabled', String(backup.welcome.enabled), 'Welcome Greeting Switch']);
    rows.push(['welcome', 'greeting', 'message', backup.welcome.message, 'Welcome Message Template']);
    rows.push(['welcome', 'departure', 'goodbyeEnabled', String(backup.welcome.goodbyeEnabled), 'Goodbye Switch']);
    rows.push(['welcome', 'departure', 'goodbyeMessage', backup.welcome.goodbyeMessage, 'Goodbye Message Template']);

    // Moderation
    for (const [k, v] of Object.entries(backup.moderation)) {
      if (typeof v !== 'object') {
        rows.push(['moderation', 'antiSpam', k, String(v), 'Moderation Setting']);
      }
    }

    // Content protection
    for (const [k, v] of Object.entries(backup.contentProtection)) {
      if (k === 'linksWhitelist') {
        rows.push(['contentProtection', 'whitelist', 'domains', (v as string[]).join('; '), 'Whitelisted Domains']);
      } else {
        rows.push(['contentProtection', 'media', k, String(v), 'Content Protection Switch']);
      }
    }

    // Abuse words
    for (const w of backup.abuseWords) {
      rows.push(['abuseWord', 'filter', 'word', w, 'Custom Abuse Word']);
    }

    // Sticker packs
    for (const p of backup.stickers.packs) {
      rows.push(['stickerPack', 'library', p.name, p.enabled ? 'Enabled' : 'Disabled', `${p.title} (${p.stickerCount} stickers) - ${p.telegramUrl}`]);
    }

    // Lust mode
    rows.push(['lustMode', 'personality', 'enabled', String(backup.lustMode.enabled), 'Lust Mode Switch']);
    rows.push(['lustMode', 'personality', 'level', String(backup.lustMode.level), 'Group Base Lust Level (0-4)']);

    // Auto response & Auto sticker
    rows.push(['autoResponse', 'automation', 'mode', backup.autoResponse.mode, `cooldown: ${backup.autoResponse.cooldownSeconds}s, enabled: ${backup.autoResponse.enabled}`]);
    rows.push(['autoSticker', 'automation', 'mode', backup.autoSticker.mode, `cooldown: ${backup.autoSticker.cooldownSeconds}s, enabled: ${backup.autoSticker.enabled}`]);

    // Slowmode
    rows.push(['slowmode', 'delay', 'seconds', String(backup.slowmode.slowModeSeconds), backup.slowmode.slowModeSeconds > 0 ? `${backup.slowmode.slowModeSeconds}s delay` : 'Disabled']);

    // Personality
    for (const [k, v] of Object.entries(backup.personality)) {
      rows.push(['personality', 'ai', k, String(v), 'Conversational Intelligence']);
    }

    // Schedules
    for (const sc of backup.schedules) {
      rows.push(['schedule', 'task', sc.name || sc.id, sc.cron || sc.time, `timezone: ${sc.timezone}, enabled: ${sc.enabled}`]);
    }

    // Notes
    for (const n of backup.notes) {
      rows.push(['note', 'storage', n.name, n.content, 'Group Note']);
    }

    return rows.map(r => r.map(escapeCsv).join(',')).join('\r\n');
  }

  // --- Pre-Import Safety Snapshots ---
  public createGroupSafetyBackup(chatId: number | string): string {
    const numId = Number(chatId);
    const backupDir = path.join(this.dataDir, 'backups', `group_${numId}`);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const fullBackup = this.exportGroupFullBackup(numId);
    const timestampStr = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const filename = `backup_${timestampStr}.json`;
    const filepath = path.join(backupDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(fullBackup, null, 2), 'utf-8');
    return filename;
  }

  public listGroupSafetyBackups(chatId: number | string): Array<{ filename: string; timestamp: string; size: number; path: string }> {
    const numId = Number(chatId);
    const backupDir = path.join(this.dataDir, 'backups', `group_${numId}`);
    if (!fs.existsSync(backupDir)) return [];
    try {
      const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'));
      return files.map(filename => {
        const fullPath = path.join(backupDir, filename);
        const stat = fs.statSync(fullPath);
        return {
          filename,
          timestamp: stat.mtime.toISOString(),
          size: stat.size,
          path: fullPath
        };
      }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch {
      return [];
    }
  }

  public restoreGroupSafetyBackup(chatId: number | string, filename: string, operatorUsername?: string): boolean {
    const numId = Number(chatId);
    const cleanFilename = path.basename(filename);
    const backupPath = path.join(this.dataDir, 'backups', `group_${numId}`, cleanFilename);
    if (!fs.existsSync(backupPath)) return false;
    try {
      const raw = fs.readFileSync(backupPath, 'utf-8');
      const data = JSON.parse(raw);
      const res = this.importGroupFullBackup(numId, data, undefined, true, operatorUsername, true);
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Change Preview / Diff Calculation ---
  public previewGroupImport(
    chatId: number | string,
    incomingConfig: any,
    selectedSections?: string[]
  ): {
    matchedChatId: boolean;
    configChatId: string | null;
    currentChatId: string;
    modified: Array<{ field: string; section: string; oldValue: any; newValue: any }>;
    added: Array<{ field: string; section: string; value: any }>;
    removed: Array<{ field: string; section: string; value: any }>;
    unchanged: Array<{ field: string; section: string; value: any }>;
  } {
    const numId = Number(chatId);
    const current = this.exportGroupFullBackup(numId);
    const rawConfigChatId = incomingConfig?.group?.chatId !== undefined ? incomingConfig.group.chatId : (incomingConfig?.chatId !== undefined ? incomingConfig.chatId : null);
    const configChatId = rawConfigChatId !== null ? String(rawConfigChatId) : null;
    const matchedChatId = configChatId ? String(configChatId) === String(numId) : true;

    const modified: Array<{ field: string; section: string; oldValue: any; newValue: any }> = [];
    const added: Array<{ field: string; section: string; value: any }> = [];
    const removed: Array<{ field: string; section: string; value: any }> = [];
    const unchanged: Array<{ field: string; section: string; value: any }> = [];

    const sections = selectedSections || [
      'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
      'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
      'personality', 'schedules', 'notes'
    ];

    // Settings diff
    if (sections.includes('settings') && incomingConfig.settings) {
      for (const [k, v] of Object.entries(incomingConfig.settings)) {
        const oldVal = current.settings[k];
        if (oldVal !== undefined) {
          if (oldVal !== v) {
            modified.push({ field: k, section: 'settings', oldValue: oldVal, newValue: v });
          } else {
            unchanged.push({ field: k, section: 'settings', value: v });
          }
        } else {
          added.push({ field: k, section: 'settings', value: v });
        }
      }
    }

    // Welcome diff
    if (sections.includes('welcome') && incomingConfig.welcome) {
      for (const [k, v] of Object.entries(incomingConfig.welcome)) {
        const oldVal = current.welcome[k];
        if (oldVal !== v) {
          modified.push({ field: `welcome.${k}`, section: 'welcome', oldValue: oldVal, newValue: v });
        } else {
          unchanged.push({ field: `welcome.${k}`, section: 'welcome', value: v });
        }
      }
    }

    // Moderation diff
    if (sections.includes('moderation') && incomingConfig.moderation) {
      for (const [k, v] of Object.entries(incomingConfig.moderation)) {
        if (typeof v !== 'object') {
          const oldVal = current.moderation[k];
          if (oldVal !== v) {
            modified.push({ field: `moderation.${k}`, section: 'moderation', oldValue: oldVal, newValue: v });
          } else {
            unchanged.push({ field: `moderation.${k}`, section: 'moderation', value: v });
          }
        }
      }
    }

    // Content Protection diff
    if (sections.includes('contentProtection') && incomingConfig.contentProtection) {
      for (const [k, v] of Object.entries(incomingConfig.contentProtection)) {
        if (k !== 'linksWhitelist') {
          const oldVal = current.contentProtection[k];
          if (oldVal !== v) {
            modified.push({ field: `contentProtection.${k}`, section: 'contentProtection', oldValue: oldVal, newValue: v });
          } else {
            unchanged.push({ field: `contentProtection.${k}`, section: 'contentProtection', value: v });
          }
        }
      }
    }

    // Abuse Words diff
    if (sections.includes('abuseWords') && Array.isArray(incomingConfig.abuseWords)) {
      const oldWords = new Set(current.abuseWords || []);
      const newWords = new Set(incomingConfig.abuseWords);
      for (const w of newWords) {
        if (!oldWords.has(w)) added.push({ field: `abuseWord:${w}`, section: 'abuseWords', value: w });
      }
      for (const w of oldWords) {
        if (!newWords.has(w)) removed.push({ field: `abuseWord:${w}`, section: 'abuseWords', value: w });
      }
    }

    // Sticker Packs diff
    if (sections.includes('stickers') && incomingConfig.stickers?.packs) {
      const oldPackNames = new Set((current.stickers?.packs || []).map((p: any) => p.name));
      for (const p of incomingConfig.stickers.packs) {
        if (!oldPackNames.has(p.name)) {
          added.push({ field: `stickerPack:${p.name}`, section: 'stickers', value: p.title || p.name });
        } else {
          unchanged.push({ field: `stickerPack:${p.name}`, section: 'stickers', value: p.title || p.name });
        }
      }
    }

    // Lust Mode diff
    if (sections.includes('lustMode') && incomingConfig.lustMode) {
      if (current.lustMode.enabled !== incomingConfig.lustMode.enabled) {
        modified.push({ field: 'lustMode.enabled', section: 'lustMode', oldValue: current.lustMode.enabled, newValue: incomingConfig.lustMode.enabled });
      }
      if (current.lustMode.level !== incomingConfig.lustMode.level) {
        modified.push({ field: 'lustMode.level', section: 'lustMode', oldValue: current.lustMode.level, newValue: incomingConfig.lustMode.level });
      }
    }

    // Auto Response diff
    if (sections.includes('autoResponse') && incomingConfig.autoResponse) {
      if (current.autoResponse.enabled !== incomingConfig.autoResponse.enabled) {
        modified.push({ field: 'autoResponse.enabled', section: 'autoResponse', oldValue: current.autoResponse.enabled, newValue: incomingConfig.autoResponse.enabled });
      }
      if (current.autoResponse.cooldownSeconds !== incomingConfig.autoResponse.cooldownSeconds) {
        modified.push({ field: 'autoResponse.cooldownSeconds', section: 'autoResponse', oldValue: `${current.autoResponse.cooldownSeconds}s`, newValue: `${incomingConfig.autoResponse.cooldownSeconds}s` });
      }
    }

    // Auto Sticker diff
    if (sections.includes('autoSticker') && incomingConfig.autoSticker) {
      if (current.autoSticker.enabled !== incomingConfig.autoSticker.enabled) {
        modified.push({ field: 'autoSticker.enabled', section: 'autoSticker', oldValue: current.autoSticker.enabled, newValue: incomingConfig.autoSticker.enabled });
      }
      if (current.autoSticker.cooldownSeconds !== incomingConfig.autoSticker.cooldownSeconds) {
        modified.push({ field: 'autoSticker.cooldownSeconds', section: 'autoSticker', oldValue: `${current.autoSticker.cooldownSeconds}s`, newValue: `${incomingConfig.autoSticker.cooldownSeconds}s` });
      }
    }

    return {
      matchedChatId,
      configChatId,
      currentChatId: String(numId),
      modified,
      added,
      removed,
      unchanged
    };
  }

  // --- Authoritative Group Import Execution ---
  public importGroupFullBackup(
    chatId: number | string,
    config: any,
    selectedSections?: string[],
    overrideChatId: boolean = false,
    operatorUsername: string = 'dashboard_admin',
    skipSafetyBackup: boolean = false
  ): { ok: boolean; success?: boolean; message: string; appliedSections: string[]; backupFile?: string; error?: string } {
    const numId = Number(chatId);
    if (!config || typeof config !== 'object') {
      return { ok: false, success: false, message: 'Invalid backup format: Must be a JSON object.', appliedSections: [], error: 'INVALID_JSON' };
    }

    // Schema validation
    if (!config.backupVersion && !config.settings && !config.welcome && !config.moderation && !config.group && !config.stickers) {
      return { ok: false, success: false, message: 'Invalid backup schema: Missing backupVersion or recognized configuration sections.', appliedSections: [], error: 'INVALID_BACKUP_SCHEMA' };
    }

    // Group ID safety validation
    const rawConfigChatId = config?.group?.chatId !== undefined ? config.group.chatId : (config?.chatId !== undefined ? config.chatId : null);
    const configChatId = rawConfigChatId !== null ? String(rawConfigChatId) : null;
    if (configChatId && configChatId !== String(numId) && !overrideChatId) {
      return {
        ok: false,
        success: false,
        message: `⚠️ This backup belongs to another Telegram group (${configChatId}). Enable override confirmation to apply it to this group (${numId}).`,
        appliedSections: [],
        error: 'MISMATCHED_GROUP_ID'
      };
    }

    // Automatic Safety Backup before applying
    let backupFile = '';
    if (!skipSafetyBackup) {
      try {
        backupFile = this.createGroupSafetyBackup(numId);
      } catch (e: any) {
        console.warn(`[Storage] Failed to create pre-import safety backup for group ${numId}:`, e.message);
      }
    }

    const sections = selectedSections && selectedSections.length > 0 ? selectedSections : [
      'settings', 'welcome', 'moderation', 'contentProtection', 'abuseWords',
      'stickers', 'lustMode', 'autoResponse', 'autoSticker', 'slowmode',
      'personality', 'schedules', 'notes', 'permissions'
    ];

    const appliedSections: string[] = [];
    const existing = this.getGroupSettings(numId);
    const updates: Partial<GroupSettings> = {};

    // 1. Settings section
    if (sections.includes('settings') && (config.settings || config.general)) {
      const src = config.settings || config.general;
      if (typeof src.warnLimit === 'number') updates.warnLimit = Math.max(1, Math.min(20, src.warnLimit));
      if (typeof src.warnAction === 'string' && ['ban', 'kick', 'mute', 'warn_only'].includes(src.warnAction)) updates.warnAction = src.warnAction;
      if (typeof src.warnExpireSeconds === 'number') updates.warnExpireSeconds = Math.max(0, src.warnExpireSeconds);
      if (typeof src.autoAcceptEnabled === 'boolean') updates.autoAcceptEnabled = src.autoAcceptEnabled;
      if (typeof src.captchaEnabled === 'boolean') updates.captchaEnabled = src.captchaEnabled;
      if (typeof src.captchaMode === 'string' && ['button', 'math'].includes(src.captchaMode)) updates.captchaMode = src.captchaMode;
      if (typeof src.captchaTimeout === 'number') updates.captchaTimeout = Math.max(10, Math.min(600, src.captchaTimeout));
      if (typeof src.autoDeleteJoinLeave === 'boolean') updates.autoDeleteJoinLeave = src.autoDeleteJoinLeave;
      if (typeof src.reportsEnabled === 'boolean') updates.reportsEnabled = src.reportsEnabled;
      if (typeof src.slowModeSeconds === 'number') updates.slowModeSeconds = src.slowModeSeconds;
      if (typeof src.notes === 'string') updates.notes = src.notes as any;
      if (typeof src.chatTitle === 'string') updates.chatTitle = src.chatTitle;
      if (typeof src.antiSpam === 'boolean') (updates as any).antiSpam = src.antiSpam;
      if (typeof src.antiFlood === 'boolean') (updates as any).antiFlood = src.antiFlood;
      if (typeof src.antiLinks === 'boolean') (updates as any).antiLinks = src.antiLinks;
      if (typeof src.blockVoiceNotes === 'boolean') (updates as any).blockVoiceNotes = src.blockVoiceNotes;
      if (typeof src.protectionDuplicateLimit === 'number') updates.protectionDuplicateLimit = Math.max(1, src.protectionDuplicateLimit);
      if (typeof src.protectionLinkBurstLimit === 'number') updates.protectionLinkBurstLimit = Math.max(1, src.protectionLinkBurstLimit);
      appliedSections.push('settings');
    }

    // 2. Welcome section
    if (sections.includes('welcome') && config.welcome) {
      if (typeof config.welcome.welcomeEnabled === 'boolean') updates.welcomeEnabled = config.welcome.welcomeEnabled;
      else if (typeof config.welcome.enabled === 'boolean') updates.welcomeEnabled = config.welcome.enabled;

      if (typeof config.welcome.welcomeMessage === 'string') updates.welcomeMessage = config.welcome.welcomeMessage;
      else if (typeof config.welcome.message === 'string') updates.welcomeMessage = config.welcome.message;

      if (typeof config.welcome.goodbyeEnabled === 'boolean') updates.goodbyeEnabled = config.welcome.goodbyeEnabled;
      if (typeof config.welcome.goodbyeMessage === 'string') updates.goodbyeMessage = config.welcome.goodbyeMessage;
      appliedSections.push('welcome');
    }

    // 3. Moderation section
    if (sections.includes('moderation') && config.moderation) {
      const m = config.moderation;
      if (typeof m.stopSpamEnabled === 'boolean') updates.stopSpamEnabled = m.stopSpamEnabled;
      if (typeof m.floodEnabled === 'boolean') updates.floodEnabled = m.floodEnabled;
      if (typeof m.floodCount === 'number') updates.floodCount = Math.max(1, Math.min(50, m.floodCount));
      if (typeof m.floodWindow === 'number') updates.floodWindow = Math.max(1, Math.min(60, m.floodWindow));
      if (typeof m.floodAction === 'string' && ['delete', 'mute', 'kick', 'ban'].includes(m.floodAction)) updates.floodAction = m.floodAction;
      if (typeof m.raidEnabled === 'boolean') updates.raidEnabled = m.raidEnabled;
      if (typeof m.raidLimit === 'number') updates.raidLimit = Math.max(1, Math.min(50, m.raidLimit));
      if (typeof m.raidWindow === 'number') updates.raidWindow = Math.max(1, Math.min(120, m.raidWindow));
      if (typeof m.raidAction === 'string' && ['kick', 'mute', 'ban', 'restrict'].includes(m.raidAction)) updates.raidAction = m.raidAction;
      if (typeof m.raidDuration === 'number') updates.raidDuration = Math.max(10, Math.min(86400, m.raidDuration));
      if (typeof m.stopAbusiveEnabled === 'boolean') updates.stopAbusiveEnabled = m.stopAbusiveEnabled;
      if (typeof m.stopPromotionEnabled === 'boolean') updates.stopPromotionEnabled = m.stopPromotionEnabled;
      if (typeof m.automodEnabled === 'boolean') updates.automodEnabled = m.automodEnabled;
      if (typeof m.securityEnabled === 'boolean') updates.securityEnabled = m.securityEnabled;
      if (m.locks && typeof m.locks === 'object') updates.locks = m.locks;
      if (m.filters && typeof m.filters === 'object') {
        for (const [k, v] of Object.entries(m.filters)) {
          if (typeof v === 'string') this.setFilter(numId, k, v);
        }
      }
      appliedSections.push('moderation');
    }

    // 4. Content Protection section
    if (sections.includes('contentProtection') && (config.contentProtection || config.protection)) {
      const cp = config.contentProtection || config.protection;
      if (typeof cp.linksProtection === 'boolean') updates.linksProtection = cp.linksProtection;
      if (typeof cp.stickerProtection === 'boolean') updates.stickerProtection = cp.stickerProtection;
      if (typeof cp.fileProtection === 'boolean') updates.fileProtection = cp.fileProtection;
      if (typeof cp.imageProtection === 'boolean') updates.imageProtection = cp.imageProtection;
      if (typeof cp.gifProtection === 'boolean') updates.gifProtection = cp.gifProtection;
      if (typeof cp.voiceProtection === 'boolean') updates.voiceProtection = cp.voiceProtection;
      if (typeof cp.audioProtection === 'boolean') updates.audioProtection = cp.audioProtection;
      if (Array.isArray(cp.linksWhitelist)) updates.linksWhitelist = cp.linksWhitelist.filter((w: any) => typeof w === 'string');
      appliedSections.push('contentProtection');
    }

    // 5. Abuse Words section
    if (sections.includes('abuseWords') && Array.isArray(config.abuseWords)) {
      const cleanWords = config.abuseWords
        .filter((w: any) => typeof w === 'string' && w.trim().length > 0)
        .map((w: string) => w.trim().toLowerCase());
      updates.abuseWords = Array.from(new Set(cleanWords));
      updates.customAbusiveWords = updates.abuseWords;
      appliedSections.push('abuseWords');
    }

    // 6. Stickers section
    if (sections.includes('stickers')) {
      const stkPacks = config.stickers?.packs || config.stickerPacks;
      if (Array.isArray(stkPacks)) {
        if (!existing.stickerPacks) existing.stickerPacks = {};
        for (const pack of stkPacks) {
          if (pack && pack.name) {
            const cleanName = pack.name.replace(/^https:\/\/t\.me\/addstickers\//i, '').replace(/[<>]/g, '').trim().toLowerCase();
            existing.stickerPacks[cleanName] = {
              name: cleanName,
              title: pack.title || pack.name,
              telegramUrl: pack.telegramUrl || `https://t.me/addstickers/${cleanName}`,
              enabled: pack.enabled !== false,
              stickerCount: pack.stickerCount || pack.stickers?.length || 0,
              stickers: pack.stickers || []
            };
          }
        }
        updates.stickerPacks = existing.stickerPacks;
      }
      // Media library custom stickers
      const ml = config.stickers?.mediaLibrary || config.mediaLibrary;
      if (ml && typeof ml === 'object') {
        const lib = this.getMediaLibrary(numId);
        if (ml.stickers && typeof ml.stickers === 'object') {
          if (!lib.stickers) lib.stickers = {};
          for (const [mood, fileIds] of Object.entries(ml.stickers)) {
            if (Array.isArray(fileIds)) {
              if (!lib.stickers[mood]) lib.stickers[mood] = [];
              for (const fId of fileIds) {
                if (typeof fId === 'string' && fId.length >= 10 && !lib.stickers[mood].includes(fId)) {
                  lib.stickers[mood].push(fId);
                }
              }
            }
          }
        }
        if (ml.stickerMetadata && typeof ml.stickerMetadata === 'object') {
          if (!lib.stickerMetadata) lib.stickerMetadata = {};
          lib.stickerMetadata = { ...lib.stickerMetadata, ...ml.stickerMetadata };
        }
      }
      appliedSections.push('stickers');
    }

    // 7. Lust Mode section
    if (sections.includes('lustMode') && config.lustMode) {
      if (typeof config.lustMode.enabled === 'boolean') updates.lustMode = config.lustMode.enabled;
      if (typeof config.lustMode.level === 'number') updates.lustLevel = Math.max(0, Math.min(4, config.lustMode.level));
      if (Array.isArray(config.lustMode.userLustLevels)) {
        if (!this.data.userLustLevels) this.data.userLustLevels = {};
        for (const ul of config.lustMode.userLustLevels) {
          if (ul && ul.userId && typeof ul.level === 'number') {
            const key = `${numId}_${ul.userId}`;
            this.data.userLustLevels[key] = {
              groupId: numId,
              userId: ul.userId,
              level: Math.max(0, Math.min(4, ul.level)),
              lastUpdated: Date.now()
            };
          }
        }
      }
      appliedSections.push('lustMode');
    }

    // 8. Auto Response section
    if (sections.includes('autoResponse') && config.autoResponse) {
      const ar = config.autoResponse;
      updates.autoResponse = {
        enabled: Boolean(ar.enabled),
        mode: ['every_message', 'cooldown', 'random', 'disabled'].includes(ar.mode) ? ar.mode : 'every_message',
        cooldownSeconds: typeof ar.cooldownSeconds === 'number' ? Math.max(10, Math.min(86400, ar.cooldownSeconds)) : 30,
        minSeconds: typeof ar.minSeconds === 'number' ? Math.max(10, ar.minSeconds) : 30,
        maxSeconds: typeof ar.maxSeconds === 'number' ? Math.max(10, ar.maxSeconds) : 120
      };
      appliedSections.push('autoResponse');
    }

    // 9. Auto Sticker section
    if (sections.includes('autoSticker') && config.autoSticker) {
      const as = config.autoSticker;
      updates.autoSticker = {
        enabled: Boolean(as.enabled),
        mode: ['every_message', 'cooldown', 'random', 'disabled'].includes(as.mode) ? as.mode : 'cooldown',
        cooldownSeconds: typeof as.cooldownSeconds === 'number' ? Math.max(10, Math.min(86400, as.cooldownSeconds)) : 60,
        minSeconds: typeof as.minSeconds === 'number' ? Math.max(10, as.minSeconds) : 60,
        maxSeconds: typeof as.maxSeconds === 'number' ? Math.max(10, as.maxSeconds) : 300
      };
      appliedSections.push('autoSticker');
    }

    // 10. Slowmode section
    if (sections.includes('slowmode') && (config.slowmode !== undefined || config.settings?.slowModeSeconds !== undefined)) {
      const sm = typeof config.settings?.slowModeSeconds === 'number' ? config.settings.slowModeSeconds : (typeof config.slowmode?.slowModeSeconds === 'number' ? config.slowmode.slowModeSeconds : undefined);
      if (typeof sm === 'number') {
        updates.slowModeSeconds = Math.max(0, Math.min(86400, sm));
        appliedSections.push('slowmode');
      }
    }

    // 11. Personality / AI section
    if (sections.includes('personality') && (config.personality || config.ai)) {
      const p = config.personality || config.ai;
      if (typeof p.chatbotEnabled === 'boolean') updates.chatbotEnabled = p.chatbotEnabled;
      if (typeof p.chatbotMode === 'string') updates.chatbotMode = p.chatbotMode;
      if (typeof p.personality === 'string') (updates as any).personality = p.personality;
      if (typeof p.language === 'string') (updates as any).language = p.language;
      if (typeof p.brotherZoneEnabled === 'boolean') (updates as any).brotherZoneEnabled = p.brotherZoneEnabled;
      if (typeof p.coupleFilter === 'boolean') (updates as any).coupleFilter = p.coupleFilter;
      appliedSections.push('personality');
    }

    // 12. Schedules section
    if (sections.includes('schedules') && Array.isArray(config.schedules)) {
      for (const sc of config.schedules) {
        if (sc && (sc.message || sc.name)) {
          const newSchedule: ScheduledMessage = {
            id: sc.id || Math.random().toString(36).substring(2, 8).toUpperCase(),
            chatId: numId,
            name: sc.name || 'Restored Schedule',
            cron: sc.cron || sc.time || '0 12 * * *',
            message: sc.message || 'Scheduled Message',
            enabled: sc.enabled !== false,
            timezone: sc.timezone || 'Asia/Kolkata',
            createdAt: new Date().toISOString(),
            runsCount: 0
          };
          const existingIdx = this.data.schedules.findIndex(
            s => s.id === newSchedule.id || (s.chatId === numId && s.name.toLowerCase() === newSchedule.name.toLowerCase())
          );
          if (existingIdx >= 0) {
            this.data.schedules[existingIdx] = newSchedule;
          } else {
            this.data.schedules.push(newSchedule);
          }
        }
      }
      appliedSections.push('schedules');
    }

    // 13. Notes section
    if (sections.includes('notes') && Array.isArray(config.notes)) {
      for (const n of config.notes) {
        if (n && typeof n.name === 'string' && typeof n.content === 'string') {
          this.saveNote(numId, n.name, n.content, 0);
        }
      }
      appliedSections.push('notes');
    }

    // Apply accumulated group updates and persist to disk synchronously
    this.updateGroupSettings(numId, updates);
    this.saveGroupJsonSync(numId);

    // Audit logging
    this.logAction({
      id: Math.random().toString(36).slice(2, 9),
      timestamp: new Date().toISOString(),
      chatId: numId,
      groupId: numId,
      adminUsername: operatorUsername,
      command: appliedSections.length > 5 ? 'CONFIG_IMPORTED' : 'CONFIG_PARTIALLY_IMPORTED',
      action: 'setting_change',
      result: 'success',
      details: `Imported sections: ${appliedSections.join(', ')} (Backup: ${backupFile || 'none'})`
    });

    return {
      ok: true,
      success: true,
      message: `Successfully imported ${appliedSections.length} sections into Group ${numId}.`,
      appliedSections,
      backupFile
    };
  }

  public importGroupConfig(
    chatId: number,
    config: any,
    importedBy: number
  ): { ok: boolean; message: string; appliedCount: number } {
    const res = this.importGroupFullBackup(chatId, config, undefined, true);
    return { ok: res.ok, message: res.message, appliedCount: res.appliedSections.length };
  }

  // --- Complete Bot-Wide Export & Restore ---
  public exportAllBotBackup(): {
    backupVersion: string;
    type?: string;
    schemaVersion: number;
    exportedAt: string;
    totalGroups: number;
    globalSettings: GlobalSettings;
    groups: Record<string, any>;
  } {
    const groupsDict: Record<string, any> = {};
    if (this.data.settings) {
      for (const chatIdStr of Object.keys(this.data.settings)) {
        const numId = Number(chatIdStr);
        if (!isNaN(numId) && numId < 0) {
          groupsDict[chatIdStr] = this.exportGroupFullBackup(numId);
        }
      }
    }

    return {
      backupVersion: '1.0',
      type: 'BOT_FULL_BACKUP',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      totalGroups: Object.keys(groupsDict).length,
      globalSettings: this.getGlobalSettings(),
      groups: groupsDict
    };
  }

  public restoreAllBotBackup(
    payload: any,
    selectedGroupIds?: number[],
    operatorUsername: string = 'dashboard_admin'
  ): { ok: boolean; success: boolean; message: string; restoredGroups: number; restoredGroupIds: number[] } {
    if (!payload || typeof payload !== 'object' || !payload.groups) {
      return { ok: false, success: false, message: 'Invalid bot backup format: Must contain "groups" dictionary.', restoredGroups: 0, restoredGroupIds: [] };
    }

    // Restore global settings if present
    if (payload.globalSettings && typeof payload.globalSettings === 'object') {
      this.updateGlobalSettings(payload.globalSettings);
    }

    const restoredGroups: number[] = [];
    const targetGroups = selectedGroupIds && selectedGroupIds.length > 0
      ? selectedGroupIds.map(String)
      : Object.keys(payload.groups);

    for (const gIdStr of targetGroups) {
      const groupData = payload.groups[gIdStr];
      const numId = Number(gIdStr);
      if (groupData && !isNaN(numId)) {
        const res = this.importGroupFullBackup(numId, groupData, undefined, true, operatorUsername, true);
        if (res.ok) {
          restoredGroups.push(numId);
        }
      }
    }

    this.saveGlobalJsonSync();
    return {
      ok: true,
      success: true,
      message: `Successfully restored ${restoredGroups.length} groups from bot backup.`,
      restoredGroups: restoredGroups.length,
      restoredGroupIds: restoredGroups
    };
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

  public deleteSchedule(chatIdOrId: number | string, maybeScheduleId?: string): boolean {
    const initial = this.data.schedules.length;
    let targetChatId: number | undefined;

    if (maybeScheduleId !== undefined && typeof chatIdOrId === 'number') {
      targetChatId = chatIdOrId;
      this.data.schedules = this.data.schedules.filter(
        (s) => !(s.chatId === chatIdOrId && s.id.toUpperCase() === maybeScheduleId.toUpperCase())
      );
    } else {
      const idStr = String(chatIdOrId).toUpperCase();
      const matched = this.data.schedules.find(s => s.id.toUpperCase() === idStr);
      if (matched) targetChatId = matched.chatId;
      this.data.schedules = this.data.schedules.filter(
        (s) => s.id.toUpperCase() !== idStr
      );
    }

    const changed = initial > this.data.schedules.length;
    if (changed && targetChatId !== undefined) {
      this.scheduleSave(targetChatId);
    }
    return changed;
  }

  public getScheduleById(id: string): ScheduledMessage | undefined {
    return this.data.schedules.find((s) => s.id.toUpperCase() === id.toUpperCase());
  }

  public updateSchedule(id: string, updates: Partial<ScheduledMessage>): ScheduledMessage | null {
    const s = this.data.schedules.find((x) => x.id.toUpperCase() === id.toUpperCase());
    if (!s) return null;
    Object.assign(s, updates);
    this.scheduleSave(s.chatId);
    return s;
  }

  public toggleSchedule(id: string, enabled?: boolean): ScheduledMessage | null {
    const s = this.data.schedules.find((x) => x.id.toUpperCase() === id.toUpperCase());
    if (!s) return null;
    s.enabled = enabled !== undefined ? enabled : !s.enabled;
    this.scheduleSave(s.chatId);
    return s;
  }

  public updateScheduleNextRun(id: string, nextRun: string, status?: 'success' | 'failure', error?: string, lastSentMessageId?: number): void {
    const s = this.data.schedules.find((x) => x.id === id);
    if (s) {
      s.nextRun = nextRun;
      s.lastRun = new Date().toISOString();
      s.lastStatus = status || 'success';
      if (error) s.lastError = error;
      if (lastSentMessageId !== undefined) {
        s.lastSentMessageId = lastSentMessageId;
      }
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

  public getAuditLogs(options?: { limit?: number; chatId?: number }): ModerationLog[] {
    const limit = options?.limit || 50;
    if (options?.chatId) {
      return this.getGroupLogs(options.chatId, limit);
    }
    return this.getRecentLogs(limit);
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

  public deleteAutomation(chatId: number, id: string): boolean {
    return this.removeAutomation(chatId, id);
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
    const inactivePrivCount = this.cleanupInactivePrivateConversations();
    if (cleaned || inactivePrivCount > 0) {
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
        this.scheduleSave(groupId);
      }
    }

    return record.level;
  }

  public setLustLevel(groupId: number | string, userId: number, level: number): void {
    if (!this.data.userLustLevels) this.data.userLustLevels = {};
    const key = `${groupId}_${userId}`;
    const boundedLevel = Math.max(0, Math.min(100, Math.round(level)));
    this.data.userLustLevels[key] = {
      groupId,
      userId,
      level: boundedLevel,
      lastUpdated: Date.now()
    };
    this.scheduleSave(groupId);
  }

  public incrementLustLevel(groupId: number | string, userId: number, delta: number = 1): number {
    const current = this.getLustLevel(groupId, userId, 0);
    const updated = Math.min(100, current + delta);
    this.setLustLevel(groupId, userId, updated);
    return updated;
  }

  public decrementLustLevel(groupId: number | string, userId: number, delta: number = 1): number {
    const current = this.getLustLevel(groupId, userId, 0);
    const updated = Math.max(0, current - delta);
    this.setLustLevel(groupId, userId, updated);
    return updated;
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

  // --- Group-Shared Conversation Memory Management ---
  public getGroupMemory(chatId: number | string): GroupConversationMessage[] {
    const key = String(chatId);
    if (this.data.groupConversationMemories && this.data.groupConversationMemories[key]) {
      return this.data.groupConversationMemories[key].messages || [];
    }
    if (this.data.groupMemories && this.data.groupMemories[key]) {
      return this.data.groupMemories[key].messages || [];
    }
    return [];
  }

  public addGroupConversationEntry(chatId: number | string, entry: GroupConversationMessage, incrementHumanCounter: boolean = false): void {
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
    while (record.messages.length > MAX_GROUP_STORED_MESSAGES) {
      record.messages.shift();
    }
    // Backward compatibility alias for entries
    record.entries = record.messages;
    if (this.data.groupMemories) {
      this.data.groupMemories[key] = record;
    }
    this.scheduleSave(chatId);

    // Targeted async message append (+ optional atomic counter increment) to MongoDB Atlas
    if (mongoManager.getStatus().isConnected) {
      MongoStorageService.appendGroupMessage(chatId, entry, this.currentBotId ?? undefined, incrementHumanCounter)
        .then((ok) => {
          if (!ok) this.markGroupMongoDirty(chatId, 'appendGroupMessage', 'matchedCount 0 or write rejected');
        })
        .catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB targeted message append failed for group ${chatId}: ${mongoErr?.message}`);
          this.markGroupMongoDirty(chatId, 'appendGroupMessage', mongoErr?.message);
        });
    } else {
      this.markGroupMongoDirty(chatId, 'appendGroupMessage', 'Mongo not connected');
    }
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

    while (record.messages.length > MAX_PRIVATE_CHAT_MESSAGES) {
      record.messages.shift();
    }
    this.cleanupInactivePrivateConversations();
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
    this.cleanupInactivePrivateConversations();
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
    this.cleanupInactivePrivateConversations();
    if (!this.data.privateConversations) return [];
    const key = String(chatId);
    return this.data.privateConversations[key]?.messages || [];
  }

  public getPrivateAutoDelete(chatId: number | string): boolean {
    const key = String(chatId);
    return Boolean(this.data.privateConversations?.[key]?.autoDelete);
  }

  public setPrivateAutoDelete(chatId: number | string, enabled: boolean): void {
    if (!this.data.privateConversations) this.data.privateConversations = {};
    const key = String(chatId);
    let record = this.data.privateConversations[key];
    if (!record) {
      record = {
        chatId,
        userId: Number(chatId),
        autoDelete: enabled,
        lastUpdated: Date.now(),
        messages: []
      };
      this.data.privateConversations[key] = record;
    } else {
      record.autoDelete = enabled;
      record.lastUpdated = Date.now();
    }
    this.savePrivateJson(chatId);
    this.persist();
  }

  public markBotLeftGroup(chatId: number | string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.botLeft = true;
    settings.leftAt = new Date().toISOString();
    settings.unavailable = false;
    this.saveGroupJsonSync(numId);
    this.scheduleSave(numId);
  }

  public markGroupUnavailable(chatId: number | string, reason?: string): void {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    settings.unavailable = true;
    settings.unavailableAt = new Date().toISOString();
    if (reason) settings.unavailableReason = reason;
    this.saveGroupJsonSync(numId);
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
    this.saveGroupJsonSync(numId);
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
    this.saveGroupJsonSync(numId);
    this.scheduleSave(numId);
    return settings.stickerPacks[cleanKey];
  }

  public removeGroupStickerPack(chatId: number | string, packName: string): number {
    const numId = Number(chatId);
    const settings = this.getGroupSettings(numId);
    const cleanKey = packName.toLowerCase().trim();
    if (settings.stickerPacks && settings.stickerPacks[cleanKey]) {
      delete settings.stickerPacks[cleanKey];
      this.saveGroupJsonSync(numId);
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

    if (settings.autoEngine) {
      settings.autoEngine.lastMessageTimestamp = now;
      settings.autoEngine.lastSentTimestamp = now;
      if (settings.autoEngine.messages) {
        settings.autoEngine.messages.lastSentTimestamp = now;
        settings.autoEngine.messages.nextAllowedAt = settings.autoResponse.nextAllowedAt;
        settings.autoEngine.messages.nextIntervalSeconds = settings.autoResponse.nextIntervalSeconds;
      }
    }

    this.scheduleSave(numId);

    // Targeted auto response state update in MongoDB Atlas
    if (mongoManager.getStatus().isConnected) {
      MongoStorageService.recordAutoResponseSent(numId, this.currentBotId ?? undefined)
        .then((ok) => {
          if (!ok) this.markGroupMongoDirty(numId, 'recordAutoResponseSent', 'matchedCount 0 or write rejected');
        })
        .catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB targeted auto response update failed for group ${numId}: ${mongoErr?.message}`);
          this.markGroupMongoDirty(numId, 'recordAutoResponseSent', mongoErr?.message);
        });
    } else {
      this.markGroupMongoDirty(numId, 'recordAutoResponseSent', 'Mongo not connected');
    }
  }

  public incrementHumanMessageCount(chatId: number | string, syncToMongo: boolean = true): number {
    const numId = Number(chatId);
    if (numId > 0) return 0;
    const settings = this.getGroupSettings(numId);
    const newCount = (settings.humanMessagesSinceLastSticker || 0) + 1;
    settings.humanMessagesSinceLastSticker = newCount;
    if (settings.autoEngine) {
      settings.autoEngine.humanMessagesSinceLastSticker = newCount;
    }
    this.scheduleSave(numId);

    // Targeted atomic counter increment in MongoDB Atlas (if not already combined in appendGroupMessage)
    if (syncToMongo) {
      if (mongoManager.getStatus().isConnected) {
        MongoStorageService.incrementHumanMessageCount(numId, this.currentBotId ?? undefined)
          .then((ok) => {
            if (!ok) this.markGroupMongoDirty(numId, 'incrementHumanMessageCount', 'matchedCount 0 or write rejected');
          })
          .catch((mongoErr) => {
            console.warn(`[Storage] Background MongoDB targeted counter increment failed for group ${numId}: ${mongoErr?.message}`);
            this.markGroupMongoDirty(numId, 'incrementHumanMessageCount', mongoErr?.message);
          });
      } else {
        this.markGroupMongoDirty(numId, 'incrementHumanMessageCount', 'Mongo not connected');
      }
    }
    return newCount;
  }

  public getLastProactiveConsideredMessageId(chatId: number | string): number {
    const numId = Number(chatId);
    if (numId > 0) return 0;
    const settings = this.getGroupSettings(numId);
    return settings.lastProactiveConsideredMessageId || 0;
  }

  public setLastProactiveConsideredMessageId(chatId: number | string, messageId: number): void {
    const numId = Number(chatId);
    if (numId > 0) return;
    const settings = this.getGroupSettings(numId);
    settings.lastProactiveConsideredMessageId = messageId;
    this.scheduleSave(numId);

    // Targeted proactive state update in MongoDB Atlas
    if (mongoManager.getStatus().isConnected) {
      MongoStorageService.setLastProactiveConsideredMessageId(numId, messageId, this.currentBotId ?? undefined)
        .then((ok) => {
          if (!ok) this.markGroupMongoDirty(numId, 'setLastProactiveConsideredMessageId', 'matchedCount 0 or write rejected');
        })
        .catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB targeted proactive state update failed for group ${numId}: ${mongoErr?.message}`);
          this.markGroupMongoDirty(numId, 'setLastProactiveConsideredMessageId', mongoErr?.message);
        });
    } else {
      this.markGroupMongoDirty(numId, 'setLastProactiveConsideredMessageId', 'Mongo not connected');
    }
  }

  public getHumanMessagesSinceLastSticker(chatId: number | string): number {
    const numId = Number(chatId);
    if (numId > 0) return 9999;
    const settings = this.getGroupSettings(numId);
    return settings.humanMessagesSinceLastSticker ?? 0;
  }

  public getRequiredStickerGap(chatId: number | string): number {
    const numId = Number(chatId);
    if (numId > 0) return 0;
    const settings = this.getGroupSettings(numId);
    return settings.requiredStickerGap || settings.stickerActivityMin || 10;
  }

  public resetStickerActivity(chatId: number | string): void {
    const numId = Number(chatId);
    if (numId > 0) return;
    const settings = this.getGroupSettings(numId);
    const min = settings.stickerActivityMin || 10;
    const max = settings.stickerActivityMax || 20;
    const safeMin = Math.min(min, max);
    const safeMax = Math.max(min, max);
    const newGap = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;

    settings.humanMessagesSinceLastSticker = 0;
    settings.requiredStickerGap = newGap;
    if (settings.autoEngine) {
      settings.autoEngine.humanMessagesSinceLastSticker = 0;
      settings.autoEngine.requiredStickerGap = newGap;
    }
    this.scheduleSave(numId);

    // Targeted sticker activity reset in MongoDB Atlas
    if (mongoManager.getStatus().isConnected) {
      MongoStorageService.updateStickerActivity(numId, newGap, this.currentBotId ?? undefined)
        .then((ok) => {
          if (!ok) this.markGroupMongoDirty(numId, 'updateStickerActivity', 'matchedCount 0 or write rejected');
        })
        .catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB targeted sticker activity update failed for group ${numId}: ${mongoErr?.message}`);
          this.markGroupMongoDirty(numId, 'updateStickerActivity', mongoErr?.message);
        });
    } else {
      this.markGroupMongoDirty(numId, 'updateStickerActivity', 'Mongo not connected');
    }
  }

  public checkAutoStickerEligibility(chatId: number | string): { allowed: boolean; remainingSeconds?: number; remainingMessages?: number; reason?: string } {
    const numId = Number(chatId);
    if (numId > 0) return { allowed: true };

    const settings = this.getGroupSettings(numId);
    const engineMode = settings.autoEngine?.mode;
    const isEngineStickers = Boolean(settings.autoEngine?.enabled && (engineMode === 'stickers_only' || engineMode === 'messages_and_stickers'));
    const isLegacyStickers = Boolean(settings.autoSticker?.enabled && settings.autoSticker.mode !== 'disabled');

    if (!isEngineStickers && !isLegacyStickers) {
      return { allowed: false, reason: 'disabled' };
    }

    // Absolute Sticker Activity Gating Rule:
    const currentCount = settings.humanMessagesSinceLastSticker ?? 0;
    const requiredGap = settings.requiredStickerGap || settings.stickerActivityMin || 10;
    if (currentCount < requiredGap) {
      return {
        allowed: false,
        remainingMessages: requiredGap - currentCount,
        reason: `activity_cooldown (${currentCount}/${requiredGap})`
      };
    }

    return { allowed: true };
  }

  public recordAutoStickerSent(chatId: number | string): void {
    const numId = Number(chatId);
    if (numId > 0) return;

    const settings = this.getGroupSettings(numId);
    // Reset human message counter and generate new required gap only after successful delivery
    this.resetStickerActivity(numId);

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

    if (settings.autoEngine) {
      settings.autoEngine.lastStickerTimestamp = now;
      settings.autoEngine.lastSentTimestamp = now;
      if (settings.autoEngine.stickers) {
        settings.autoEngine.stickers.lastSentTimestamp = now;
        settings.autoEngine.stickers.nextAllowedAt = settings.autoSticker.nextAllowedAt;
        settings.autoEngine.stickers.nextIntervalSeconds = settings.autoSticker.nextIntervalSeconds;
      }
    }

    this.scheduleSave(numId);

    // Targeted auto sticker state update in MongoDB Atlas
    if (mongoManager.getStatus().isConnected) {
      const currentGap = settings.requiredStickerGap || 15;
      MongoStorageService.recordAutoStickerSent(numId, currentGap, this.currentBotId ?? undefined)
        .then((ok) => {
          if (!ok) this.markGroupMongoDirty(numId, 'recordAutoStickerSent', 'matchedCount 0 or write rejected');
        })
        .catch((mongoErr) => {
          console.warn(`[Storage] Background MongoDB targeted auto sticker update failed for group ${numId}: ${mongoErr?.message}`);
          this.markGroupMongoDirty(numId, 'recordAutoStickerSent', mongoErr?.message);
        });
    } else {
      this.markGroupMongoDirty(numId, 'recordAutoStickerSent', 'Mongo not connected');
    }
  }

  public checkAutoEngineEligibility(chatId: number | string, type: 'messages' | 'stickers'): { allowed: boolean; remainingSeconds?: number; reason?: string } {
    return type === 'messages' ? this.checkAutoResponseEligibility(chatId) : this.checkAutoStickerEligibility(chatId);
  }

  public recordAutoEngineSent(chatId: number | string, type: 'messages' | 'stickers'): void {
    if (type === 'messages') {
      this.recordAutoResponseSent(chatId);
    } else {
      this.recordAutoStickerSent(chatId);
    }
  }

  public getDataDir(): string {
    return this.dataDir;
  }

  public deleteGroupData(chatId: number | string): boolean {
    const idNum = Number(chatId);
    const idStr = String(chatId);
    if (this.data.settings) {
      delete this.data.settings[idNum];
    }
    if (this.data.groupMediaLibraries) {
      delete this.data.groupMediaLibraries[idStr];
    }
    if (this.data.groupConversationMemories) {
      delete this.data.groupConversationMemories[idStr];
    }
    if (this.data.groupMemories) {
      delete this.data.groupMemories[idStr];
    }
    
    // Clean keys prefixed with `${chatId}_`
    const prefix = `${idStr}_`;
    for (const key of Object.keys(this.data.notes || {})) {
      if (key.startsWith(prefix)) delete this.data.notes[key];
    }
    for (const key of Object.keys(this.data.approvedUsers || {})) {
      if (key.startsWith(prefix)) delete this.data.approvedUsers[key];
    }
    for (const key of Object.keys(this.data.groupMembers || {})) {
      if (key.startsWith(prefix)) delete this.data.groupMembers[key];
    }
    for (const key of Object.keys(this.data.customRoles || {})) {
      if (key.startsWith(prefix) || key === idStr) delete this.data.customRoles[key];
    }
    for (const key of Object.keys(this.data.userMemories || {})) {
      if (key.startsWith(prefix)) delete this.data.userMemories[key];
    }
    for (const key of Object.keys(this.data.userLustLevels || {})) {
      if (key.startsWith(prefix)) delete this.data.userLustLevels[key];
    }
    for (const key of Object.keys(this.data.contentPermissions || {})) {
      if (key.startsWith(prefix) || key === idStr) delete this.data.contentPermissions[key];
    }

    // Filter array structures
    this.data.warnings = (this.data.warnings || []).filter((w: any) => w.groupId !== idNum && w.chatId !== idNum);
    this.data.tempActions = (this.data.tempActions || []).filter((t: any) => t.groupId !== idNum && t.chatId !== idNum);
    this.data.stickerFreeUsers = (this.data.stickerFreeUsers || []).filter((u: any) => u.chatId !== idNum);
    this.data.captchaSessions = (this.data.captchaSessions || []).filter((s: any) => s.chatId !== idNum);
    this.data.schedules = (this.data.schedules || []).filter((s: any) => Number(s.chatId) !== idNum);

    // Clean internal queues and timestamp caches
    this.groupWriteQueues.delete(idStr);
    this.lastSaveTimestamps.delete(idStr);
    this.lastSettingsTimestamps.delete(idNum);
    this.pendingSaves.delete(idNum);

    // Delete local JSON and backup files
    try {
      const filePath = path.join(this.groupsDir, `${chatId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const bakPath = path.join(this.groupsBackupDir, `${chatId}.json.bak`);
      if (fs.existsSync(bakPath)) {
        fs.unlinkSync(bakPath);
      }
      const subBakPath = path.join(this.groupsDir, 'backups', `${chatId}.json.bak`);
      if (fs.existsSync(subBakPath)) {
        fs.unlinkSync(subBakPath);
      }
      const subBakJsonPath = path.join(this.groupsDir, 'backups', `${chatId}.json`);
      if (fs.existsSync(subBakJsonPath)) {
        fs.unlinkSync(subBakJsonPath);
      }
    } catch (err: any) {
      console.warn(`[Storage] Failed to delete group file ${chatId}:`, err.message);
    }

    for (const listener of this.groupRemovalListeners) {
      try {
        listener(idNum, this.currentBotId);
      } catch (err) {
        console.error('[STORAGE] Error in group removal listener:', err);
      }
    }

    return true;
  }

  public deletePrivateChatData(chatId: number | string): boolean {
    const idStr = String(chatId);
    if (this.data.privateConversations) {
      delete this.data.privateConversations[idStr];
    }
    
    try {
      const filePath = path.join(this.privateDir, `${chatId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const bakPath = path.join(this.privateBackupDir, `${chatId}.json.bak`);
      if (fs.existsSync(bakPath)) {
        fs.unlinkSync(bakPath);
      }
    } catch (err: any) {
      console.warn(`[Storage] Failed to delete private chat file ${chatId}:`, err.message);
    }
    return true;
  }

  public async ensureAuthoritativeMigrationApplied(options: {
    allowedIds?: Set<string>;
    force?: boolean;
    botId?: number;
  } = {}): Promise<{ applied: boolean; details?: any }> {
    if (!options.force) {
      // Historical migration has been retired from automatic execution.
      return { applied: false };
    }

    console.log(`[Storage] Explicit force purge requested. Executing dual-store purge...`);
    const details = await this.purgeNonAuthoritativeGroups({
      allowedIds: options.allowedIds,
      force: true,
      botId: options.botId
    });
    return { applied: true, details };
  }

  public async purgeNonAuthoritativeGroups(options: {
    allowedIds?: Set<string>;
    force?: boolean;
    botId?: number;
  } = {}): Promise<{
    isMigration: boolean;
    existingGroupsCount: number;
    allowedGroupsCount: number;
    removedGroupsCount: number;
    removedAutoEngineJobsCount: number;
    removedTimersCount: number;
    finalGroupsCount: number;
    survivingChatIds: number[];
    removedChatIds: Array<{ chatId: number; title: string }>;
  }> {
    const allowedIds = options.allowedIds || AUTHORITATIVE_ALLOWED_GROUP_IDS;
    const allowedNumIds = new Set(Array.from(allowedIds).map(Number));
    const isForce = options.force === true;

    const isLocalApplied = this.isMigrationApplied(MIGRATION_V1_6_GROUP_PURGE);
    let isMongoApplied = true;
    if (mongoManager.getStatus().isConnected) {
      isMongoApplied = await MongoStorageService.isMigrationApplied(MIGRATION_V1_6_GROUP_PURGE);
    }

    if (!isForce && isLocalApplied && isMongoApplied) {
      const currentSurviving = Object.keys(this.data.settings || {})
        .map(Number)
        .filter(id => id < 0);
      return {
        isMigration: false,
        existingGroupsCount: currentSurviving.length,
        allowedGroupsCount: allowedIds.size,
        removedGroupsCount: 0,
        removedAutoEngineJobsCount: 0,
        removedTimersCount: 0,
        finalGroupsCount: currentSurviving.length,
        survivingChatIds: currentSurviving,
        removedChatIds: []
      };
    }

    // 1. Purge MongoDB Atlas if connected
    if (mongoManager.getStatus().isConnected) {
      try {
        await MongoStorageService.purgeNonAuthoritativeGroups(allowedIds, allowedNumIds);
        await MongoStorageService.markMigrationApplied(MIGRATION_V1_6_GROUP_PURGE);
      } catch (mongoErr: any) {
        console.warn(`[GROUP_CLEANUP] MongoDB purge error: ${mongoErr?.message}`);
      }
    }

    // 2. Discover all existing group IDs across RAM and disk
    const allFoundGroupIds = new Set<number>();
    if (this.data.settings) {
      for (const idStr of Object.keys(this.data.settings)) {
        const numId = Number(idStr);
        if (!isNaN(numId) && numId < 0) {
          allFoundGroupIds.add(numId);
        }
      }
    }

    if (fs.existsSync(this.groupsDir)) {
      try {
        const files = fs.readdirSync(this.groupsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const numId = Number(file.replace('.json', ''));
          if (!isNaN(numId) && numId < 0) {
            allFoundGroupIds.add(numId);
          }
        }
      } catch {}
    }

    const existingCount = allFoundGroupIds.size;
    console.log(`[GROUP_CLEANUP] Starting group cleanup`);
    console.log(`[GROUP_CLEANUP] Existing groups: ${existingCount}`);
    console.log(`[GROUP_CLEANUP] Allowed groups: ${allowedIds.size}`);

    let removedGroupsCount = 0;
    const removedChatIds: Array<{ chatId: number; title: string }> = [];

    for (const chatId of allFoundGroupIds) {
      const chatIdStr = String(chatId);
      if (!allowedIds.has(chatIdStr)) {
        const title = this.data.settings?.[chatId]?.chatTitle || AUTHORITATIVE_GROUP_METADATA[chatIdStr]?.title || `Group ${chatId}`;
        console.log(`[GROUP_CLEANUP] Removing group: ${chatId} ${title}`);
        this.deleteGroupData(chatId);
        removedGroupsCount++;
        removedChatIds.push({ chatId, title });
      }
    }

    // 3. Also ensure any stray backup files for non-allowed groups are purged
    for (const dir of [this.groupsBackupDir, path.join(this.groupsDir, 'backups')]) {
      if (fs.existsSync(dir)) {
        try {
          const bakFiles = fs.readdirSync(dir).filter(f => f.endsWith('.json.bak') || f.endsWith('.json'));
          for (const bf of bakFiles) {
            const numId = Number(bf.replace('.json.bak', '').replace('.json', ''));
            if (!isNaN(numId) && numId < 0 && !allowedIds.has(String(numId))) {
              try { fs.unlinkSync(path.join(dir, bf)); } catch {}
            }
          }
        } catch {}
      }
    }

    // 4. Ensure default settings records exist for the 6 allowed groups if missing
    for (const [idStr, meta] of Object.entries(AUTHORITATIVE_GROUP_METADATA)) {
      if (allowedIds.has(idStr)) {
        const numId = Number(idStr);
        if (!this.data.settings?.[numId]) {
          const s = this.getGroupSettings(numId, meta.title);
          s.botLeft = false;
          s.unavailable = false;
          this.saveGroupJsonSync(numId);
        }
        if (mongoManager.getStatus().isConnected) {
          try {
            const rawData = this.buildGroupDataObject(numId);
            const safeData = this.sanitizeGroupData(rawData);
            await MongoStorageService.saveGroup(safeData, this.currentBotId ?? undefined, this.currentBotUsername ?? undefined);
          } catch {}
        }
      }
    }

    // Prune global maps (customRoles, contentPermissions) of non-authoritative keys
    if (this.data.customRoles) {
      for (const k of Object.keys(this.data.customRoles)) {
        const prefixId = k.includes('_') ? k.split('_')[0] : k;
        if (!allowedIds.has(prefixId)) {
          delete this.data.customRoles[k];
        }
      }
    }
    if (this.data.contentPermissions) {
      for (const k of Object.keys(this.data.contentPermissions)) {
        const prefixId = k.includes('_') ? k.split('_')[0] : k;
        if (!allowedIds.has(prefixId)) {
          delete this.data.contentPermissions[k];
        }
      }
    }

    // 5. Persist bot_storage.json, global.json and mark migration as applied
    this.markMigrationApplied(MIGRATION_V1_6_GROUP_PURGE);
    this.saveGlobalJsonSync();
    this.persist();

    const finalSurviving = Object.keys(this.data.settings || {})
      .map(Number)
      .filter(id => id < 0);

    const removedJobsCount = removedGroupsCount * 2;
    const removedTimersCount = removedJobsCount;

    console.log(`[GROUP_CLEANUP] Removed ${removedGroupsCount} group records`);
    console.log(`[GROUP_CLEANUP] Removed ${removedJobsCount} auto-engine jobs`);
    console.log(`[GROUP_CLEANUP] Removed ${removedTimersCount} timers`);
    console.log(`[GROUP_CLEANUP] Final groups: ${finalSurviving.length}`);
    console.log(`[GROUP_CLEANUP] Cleanup completed successfully`);

    return {
      isMigration: true,
      existingGroupsCount: existingCount,
      allowedGroupsCount: allowedIds.size,
      removedGroupsCount,
      removedAutoEngineJobsCount: removedJobsCount,
      removedTimersCount,
      finalGroupsCount: finalSurviving.length,
      survivingChatIds: finalSurviving,
      removedChatIds
    };
  }
}

export const db = new StorageManager();
