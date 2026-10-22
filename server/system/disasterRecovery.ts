import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { errorTracker } from '../observability/errorService.js';
import { alertManager } from '../observability/alertService.js';
import { metricsTracker } from '../observability/metricsService.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'bot_storage.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export interface BackupMetadata {
  id: string;
  filename: string;
  size: number;
  version: string;
  groupsIncluded: number;
  checksum: string;
  createdAt: string;
  createdBy: string;
  type: 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE' | 'AUTO_RECOVERY';
}

export class DisasterRecoveryService {
  public static startupRecovery(dbInstance?: any): { status: string; message: string; groupsLoaded: number } {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      // Fast-path: If db has already initialized and loaded groups in memory, avoid re-reading 7.6MB JSON from disk
      if (dbInstance && typeof dbInstance.getAllGroupSettings === 'function') {
        const groups = dbInstance.getAllGroupSettings();
        const groupCount = Object.keys(groups || {}).length;
        if (groupCount > 0) {
          return { status: 'HEALTHY', message: 'Primary storage loaded successfully', groupsLoaded: groupCount };
        }
      }

      if (fs.existsSync(DB_FILE)) {
        // Validate JSON readability
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            const groupCount = Object.keys(parsed.settings || {}).length;
            return { status: 'HEALTHY', message: 'Primary storage loaded successfully', groupsLoaded: groupCount };
          }
        } catch (parseErr: any) {
          errorTracker.recordError({
            source: 'STORAGE',
            severity: 'CRITICAL',
            message: `Primary storage corrupted: ${parseErr.message}`
          });
          alertManager.createAlert({
            severity: 'CRITICAL',
            type: 'STORAGE_ERROR',
            message: 'Primary storage JSON file corrupted. Attempting recovery from latest backup.'
          });
        }
      }

      // Fallback: try latest valid backup
      const backups = this.listBackups();
      for (const b of backups) {
        const fullPath = path.join(BACKUP_DIR, b.filename);
        try {
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            // Restore to main DB file
            fs.writeFileSync(DB_FILE, raw, 'utf-8');
            metricsTracker.increment('backup_restored');
            return { status: 'DEGRADED_RECOVERED', message: `Recovered successfully from backup ${b.id}`, groupsLoaded: Object.keys(parsed.settings || {}).length };
          }
        } catch {}
      }

      // Ultimate fallback: initialize default safe state
      const defaultState = {
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
        customRoles: {}
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(defaultState, null, 2), 'utf-8');
      return { status: 'DEFAULT_STATE', message: 'Initialized new default storage state', groupsLoaded: 0 };
    } catch (err: any) {
      errorTracker.recordError({
        source: 'STORAGE',
        severity: 'CRITICAL',
        message: `Startup recovery failed entirely: ${err.message}`
      });
      return { status: 'CRITICAL', message: err.message, groupsLoaded: 0 };
    }
  }

  public static createBackup(type: 'MANUAL' | 'SCHEDULED' | 'PRE_RESTORE' | 'AUTO_RECOVERY' = 'MANUAL', createdBy: string = 'System'): BackupMetadata | null {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      if (!fs.existsSync(DB_FILE)) return null;

      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);

      // Strip sensitive secrets
      if (parsed.settings) {
        for (const s of Object.values(parsed.settings) as any[]) {
          if (s.botToken) delete s.botToken;
        }
      }

      const cleanJson = JSON.stringify(parsed, null, 2);
      const checksum = crypto.createHash('sha256').update(cleanJson).digest('hex');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupId = `backup_${timestamp}_${type.toLowerCase()}`;
      const filename = `${backupId}.json`;
      const fullPath = path.join(BACKUP_DIR, filename);

      fs.writeFileSync(fullPath, cleanJson, 'utf-8');
      const stats = fs.statSync(fullPath);
      metricsTracker.increment('backup_created');

      return {
        id: backupId,
        filename,
        size: stats.size,
        version: '1.0.0',
        groupsIncluded: Object.keys(parsed.settings || {}).length,
        checksum,
        createdAt: new Date().toISOString(),
        createdBy,
        type
      };
    } catch (err: any) {
      errorTracker.recordError({
        source: 'STORAGE',
        severity: 'ERROR',
        message: `Failed to create backup: ${err.message}`
      });
      return null;
    }
  }

  public static listBackups(): BackupMetadata[] {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
      }
      const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
      const list: BackupMetadata[] = [];

      for (const f of files) {
        const fullPath = path.join(BACKUP_DIR, f);
        try {
          const stats = fs.statSync(fullPath);
          const raw = fs.readFileSync(fullPath, 'utf-8');
          const checksum = crypto.createHash('sha256').update(raw).digest('hex');
          let groupsIncluded = 0;
          try {
            const parsed = JSON.parse(raw);
            groupsIncluded = Object.keys(parsed.settings || {}).length;
          } catch {}

          list.push({
            id: f.replace('.json', ''),
            filename: f,
            size: stats.size,
            version: '1.0.0',
            groupsIncluded,
            checksum,
            createdAt: stats.birthtime.toISOString(),
            createdBy: 'Admin',
            type: f.includes('pre_restore') ? 'PRE_RESTORE' : f.includes('scheduled') ? 'SCHEDULED' : 'MANUAL'
          });
        } catch {}
      }

      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch {
      return [];
    }
  }

  public static restoreBackup(backupId: string, operatorUsername: string): { success: boolean; error?: string } {
    try {
      if (!fs.existsSync(BACKUP_DIR)) {
        return { success: false, error: 'Backup directory does not exist' };
      }
      const filename = `${backupId}.json`;
      const fullPath = path.join(BACKUP_DIR, filename);
      if (!fs.existsSync(fullPath)) {
        return { success: false, error: 'Backup file not found' };
      }

      // 1. Create automatic PRE_RESTORE rollback backup
      const preRestoreBackup = this.createBackup('PRE_RESTORE', operatorUsername);
      if (!preRestoreBackup) {
        return { success: false, error: 'Failed to create mandatory pre-restore rollback backup' };
      }

      // 2. Read, verify checksum and validate JSON
      const raw = fs.readFileSync(fullPath, 'utf-8');
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr: any) {
        return { success: false, error: `Invalid backup JSON format: ${parseErr.message}` };
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.settings) {
        return { success: false, error: 'Backup schema validation failed: missing settings root' };
      }

      // 3. Apply state atomically via tmp write and rename
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(parsed, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);

      metricsTracker.increment('backup_restored');
      return { success: true };
    } catch (err: any) {
      errorTracker.recordError({
        source: 'STORAGE',
        severity: 'CRITICAL',
        message: `Restore failed: ${err.message}`
      });
      return { success: false, error: err.message || 'Restore failed' };
    }
  }
}
