import fs from 'fs';
import path from 'path';
import { db } from '../db/storage.js';
import { telegramApi } from '../telegram/api.js';

export const PROTECTED_CHAT_IDS = [-1004331070653, -1004356470022, -1004494262619, -5377649576];
export const PROTECTED_NAMES = ['horny log', 'horney log', 'bade log', 'lovers'];

export function normalizeTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .normalize('NFKD')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function isGroupProtected(chatId: number | string, title?: string): boolean {
  const numId = Number(chatId);
  if (PROTECTED_CHAT_IDS.includes(numId)) return true;

  if (title) {
    const norm = normalizeTitle(title);
    if (PROTECTED_NAMES.includes(norm)) return true;
  }
  return false;
}

export interface CleanupGroupResult {
  chatId: number;
  rawTitle: string;
  normTitle: string;
  action: 'PROTECTED' | 'LEFT_AND_CLEANED' | 'DRY_RUN_WOULD_LEAVE' | 'LEAVE_FAILED' | 'UNRESOLVED';
  reason: string;
  telegramResult?: any;
}

export interface CleanupPrivateChatResult {
  chatId: number;
  userId: number;
  action: 'CLEANED' | 'DRY_RUN_WOULD_CLEAN';
  reason: string;
}

export interface CleanupOperationReport {
  timestamp: string;
  dryRun: boolean;
  protectedGroups: CleanupGroupResult[];
  dummyGroups: CleanupGroupResult[];
  unresolvedGroups: CleanupGroupResult[];
  privateChats: CleanupPrivateChatResult[];
  summary: {
    totalGroupsScanned: number;
    totalProtected: number;
    totalDummy: number;
    totalUnresolved: number;
    totalPrivateChatsScanned: number;
    totalPrivateChatsCleaned: number;
  };
}

export async function runDummyDataCleanup(options: { dryRun: boolean }): Promise<CleanupOperationReport> {
  const dryRun = options.dryRun;
  const groupsDir = path.join(db.getDataDir(), 'groups');
  const privateDir = path.join(db.getDataDir(), 'private');

  const protectedGroups: CleanupGroupResult[] = [];
  const dummyGroups: CleanupGroupResult[] = [];
  const unresolvedGroups: CleanupGroupResult[] = [];
  const privateChats: CleanupPrivateChatResult[] = [];

  // 1. Scan Groups
  const groupFiles = fs.existsSync(groupsDir)
    ? fs.readdirSync(groupsDir).filter(f => f.endsWith('.json'))
    : [];

  const scannedGroupIds = new Set<number>();

  for (const file of groupFiles) {
    const chatId = Number(file.replace('.json', ''));
    scannedGroupIds.add(chatId);

    let rawTitle = 'Unknown';
    try {
      const raw = fs.readFileSync(path.join(groupsDir, file), 'utf8');
      const data = JSON.parse(raw);
      rawTitle = data.chat?.title || data.settings?.chatTitle || 'Unknown';
    } catch {}

    const norm = normalizeTitle(rawTitle);

    if (isGroupProtected(chatId, rawTitle)) {
      protectedGroups.push({
        chatId,
        rawTitle,
        normTitle: norm,
        action: 'PROTECTED',
        reason: 'Matches protected canonical group name or ID (horny log, bade log, lovers)'
      });
    } else if (!rawTitle || rawTitle === 'Unknown') {
      unresolvedGroups.push({
        chatId,
        rawTitle,
        normTitle: norm,
        action: 'UNRESOLVED',
        reason: 'Group title could not be resolved safely. Holding untouched.'
      });
    } else {
      if (dryRun) {
        dummyGroups.push({
          chatId,
          rawTitle,
          normTitle: norm,
          action: 'DRY_RUN_WOULD_LEAVE',
          reason: 'Identified as dummy/test group. Dry run: no action taken.'
        });
      } else {
        let leaveSuccess = true;
        let tgResult: any = null;

        // Try calling Telegram leaveChat if bot is configured
        try {
          const res = await telegramApi.leaveChat(chatId);
          tgResult = res;
          if (!res.ok) {
            const desc = (res.description || '').toLowerCase();
            // If already left, not a member, or chat not found, it is safe to clean
            if (
              desc.includes('not a member') ||
              desc.includes('left') ||
              desc.includes('kicked') ||
              desc.includes('chat not found') ||
              desc.includes('not configured') ||
              res.error_code === 401
            ) {
              leaveSuccess = true;
            } else {
              leaveSuccess = false;
            }
          }
        } catch (err: any) {
          tgResult = { ok: false, error: err.message };
          leaveSuccess = false;
        }

        if (leaveSuccess) {
          db.deleteGroupData(chatId);
          dummyGroups.push({
            chatId,
            rawTitle,
            normTitle: norm,
            action: 'LEFT_AND_CLEANED',
            reason: 'Successfully left Telegram group and purged local data.',
            telegramResult: tgResult
          });
        } else {
          dummyGroups.push({
            chatId,
            rawTitle,
            normTitle: norm,
            action: 'LEAVE_FAILED',
            reason: `Telegram leaveChat failed: ${tgResult?.description || tgResult?.error || 'Unknown error'}. Preserved local data.`,
            telegramResult: tgResult
          });
        }
      }
    }
  }

  // 2. Scan Private Chats
  const privateFiles = fs.existsSync(privateDir)
    ? fs.readdirSync(privateDir).filter(f => f.endsWith('.json'))
    : [];

  for (const file of privateFiles) {
    const userId = Number(file.replace('.json', ''));
    if (dryRun) {
      privateChats.push({
        chatId: userId,
        userId,
        action: 'DRY_RUN_WOULD_CLEAN',
        reason: 'Dummy private conversation history. Dry run: no action taken.'
      });
    } else {
      db.deletePrivateChatData(userId);
      privateChats.push({
        chatId: userId,
        userId,
        action: 'CLEANED',
        reason: 'Purged local dummy private conversation history.'
      });
    }
  }

  return {
    timestamp: new Date().toISOString(),
    dryRun,
    protectedGroups,
    dummyGroups,
    unresolvedGroups,
    privateChats,
    summary: {
      totalGroupsScanned: scannedGroupIds.size,
      totalProtected: protectedGroups.length,
      totalDummy: dummyGroups.length,
      totalUnresolved: unresolvedGroups.length,
      totalPrivateChatsScanned: privateFiles.length,
      totalPrivateChatsCleaned: privateChats.length
    }
  };
}
