import { telegramApi } from './api.js';
import { db } from '../db/storage.js';
import { mtprotoParticipantService } from './mtprotoParticipantService.js';
import { mediaUploadStore } from './mediaUploadStore.js';
import { TelegramMiddleware, RoleRank, ActorResolution } from './middleware.js';
import { CachedMember, TelegramMessage } from './types.js';
import { logPerformance } from '../observability/logger.js';

export const ALL_MENTION_EMOJIS = [
  '✨', '🌟', '💫', '⚡', '🔥', '🌸', '💖', '👑', '💎', '🎉',
  '🦋', '🌙', '⭐', '🍀', '🍬', '🍒', '🎈', '🕊️', '💐', '🍭'
];

export const ALL_MESSAGE_INTERVAL_MS = 20_000;

export interface ActiveAllOperation {
  chatId: number;
  operationId: string;
  actorUserId?: number;
  actorUsername?: string;
  actorDisplayName?: string;
  source: 'command' | 'dashboard';
  contentType: 'text' | 'photo' | 'video' | 'animation' | 'document';
  startedAt: number;
  abortController: AbortController;
  totalBatches: number;
  sentBatches: number;
  mentionsCount: number;
  isCancelled: boolean;
  status: 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'failed';
  error?: string;
  cancelledBy?: {
    userId?: number;
    username?: string;
    displayName?: string;
  };
  completionResolve: () => void;
  completionPromise: Promise<void>;
}

export interface CompletedOperationSummary {
  operationId: string;
  chatId: number;
  chatTitle?: string;
  source: 'command' | 'dashboard';
  contentType: 'text' | 'photo' | 'video' | 'animation' | 'document';
  totalBatches: number;
  sentBatches: number;
  mentionsCount: number;
  status: 'completed' | 'cancelled' | 'failed';
  startedAt: number;
  endedAt: number;
  actorDisplayName?: string;
  cancelledBy?: { displayName?: string; username?: string };
  error?: string;
}

export interface MentionAllMediaInput {
  contentType?: 'text' | 'photo' | 'video' | 'animation' | 'document';
  repliedPhotoId?: string;
  repliedAnimationId?: string;
  repliedVideoId?: string;
  repliedDocumentId?: string;
  mediaFileId?: string;
  mediaUploadId?: string;
  mediaBuffer?: { buffer: Buffer | Uint8Array; filename: string; contentType?: string };
}

export interface StartMentionAllParams {
  chatId: number;
  chatTitle?: string;
  actor: {
    actorUserId?: number;
    actorUsername?: string;
    actorDisplayName?: string;
    actorRank?: number;
  };
  source: 'command' | 'dashboard';
  messageText?: string;
  targetReplyId?: number;
  media?: MentionAllMediaInput;
  awaitWorker?: boolean;
}

export class MentionAllService {
  private static instance: MentionAllService;
  public activeOperations: Map<number, ActiveAllOperation> = new Map();
  public lastOperationSummaries: Map<number, CompletedOperationSummary> = new Map();
  public allMessageIntervalMs: number | null = null;

  public static getInstance(): MentionAllService {
    if (!MentionAllService.instance) {
      MentionAllService.instance = new MentionAllService();
    }
    return MentionAllService.instance;
  }

  public static abortableSleep(ms: number, signal?: AbortSignal): Promise<boolean> {
    if (!signal) {
      return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }
    if (signal.aborted) {
      return Promise.resolve(false);
    }
    if (ms <= 0) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | null = null;
      const onAbort = () => {
        if (timer) clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        resolve(false);
      };
      timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve(true);
      }, ms);
      signal.addEventListener('abort', onAbort);
    });
  }

  public async getEligibleGroupMembers(chatId: number, botId?: number): Promise<CachedMember[]> {
    try {
      const adminRes = await telegramApi.getChatAdministrators(chatId);
      if (adminRes.ok && Array.isArray(adminRes.result)) {
        for (const admin of adminRes.result) {
          if (admin.user && !admin.user.is_bot) {
            db.cacheUser(admin.user, chatId);
          }
        }
      }
    } catch {
      // Non-blocking fallback to cached members
    }

    const primaryMembers = db.getGroupMembersList(chatId) || [];
    const secondaryMembers = db.getGroupMembers(chatId) || [];

    const seenUserIds = new Set<number>();
    const eligibleMembers: CachedMember[] = [];
    const allCandidateMembers = [...primaryMembers, ...secondaryMembers];

    for (const m of allCandidateMembers) {
      if (!m || !m.userId) continue;
      const uid = Number(m.userId);
      if (isNaN(uid) || uid <= 0) continue;
      if (uid === 1087968824 || uid === 777000) continue;
      if (botId && uid === botId) continue;
      if (seenUserIds.has(uid)) continue;

      const rawUname = (m.username || '').trim();
      const cleanUname = rawUname.replace(/^@/, '').trim();
      const firstName = (m.firstName || '').trim();

      if ((m as any).is_bot === true || (m as any).isBot === true) {
        continue;
      }

      if (firstName.toLowerCase() === 'deleted account' || cleanUname.toLowerCase() === 'deletedaccount') {
        continue;
      }

      seenUserIds.add(uid);
      eligibleMembers.push({
        userId: uid,
        username: cleanUname || undefined,
        firstName: firstName || 'Member',
        lastSeen: (m as any).lastSeen || (m as any).lastActive || new Date().toISOString()
      });
    }

    return eligibleMembers;
  }

  public static buildAllMentionsChunks(
    members: CachedMember[],
    defaultMsg: string,
    botId?: number,
    chunkSize: number = 10
  ): { mentions: string[]; chunks: string[] } {
    const seenUserIds = new Set<number>();
    const mentions: string[] = [];
    const emojis = ALL_MENTION_EMOJIS;

    for (const m of members) {
      if (!m || !m.userId) continue;
      const uid = Number(m.userId);
      if (isNaN(uid) || uid <= 0) continue;
      if (uid === 1087968824 || uid === 777000) continue;
      if (botId && uid === botId) continue;
      if (seenUserIds.has(uid)) continue;

      const rawUname = (m.username || '').trim();
      const cleanUname = rawUname.replace(/^@/, '').trim();
      const firstName = (m.firstName || '').trim();

      if ((m as any).is_bot === true || (m as any).isBot === true) {
        continue;
      }

      if (firstName.toLowerCase() === 'deleted account' || cleanUname.toLowerCase() === 'deletedaccount') {
        continue;
      }

      seenUserIds.add(uid);

      const emoji = emojis[Math.floor(Math.random() * emojis.length)];
      mentions.push(`<a href="tg://user?id=${uid}">${emoji}</a>`);
    }

    if (mentions.length === 0) {
      return { mentions: [], chunks: [] };
    }

    const chunks: string[] = [];
    const cleanDefaultMsg = (defaultMsg || '').trim();
    for (let i = 0; i < mentions.length; i += chunkSize) {
      const chunkMentions = mentions.slice(i, i + chunkSize);
      const emojiRow = chunkMentions.join('');
      if (cleanDefaultMsg) {
        chunks.push(`${cleanDefaultMsg}\n\n${emojiRow}`);
      } else {
        chunks.push(emojiRow);
      }
    }

    return { mentions, chunks };
  }

  public hasActiveOperation(chatId: number): boolean {
    const existing = this.activeOperations.get(chatId);
    if (existing) {
      const now = Date.now();
      // Auto-evict stale operations: starting for >120s or running for >30m
      if (
        (existing.status === 'starting' && now - existing.startedAt > 120_000) ||
        (now - existing.startedAt > 30 * 60_000)
      ) {
        this.activeOperations.delete(chatId);
        mtprotoParticipantService.releaseChatLock(chatId);
        try { existing.abortController.abort(); } catch {}
        try { existing.completionResolve(); } catch {}
        return false;
      }
      return true;
    }
    return mtprotoParticipantService.isChatLocked(chatId);
  }

  public getActiveOperation(chatId: number): ActiveAllOperation | undefined {
    return this.activeOperations.get(chatId);
  }

  public async startOperation(params: StartMentionAllParams): Promise<{
    ok: boolean;
    status: 'running' | 'already_running' | 'no_members' | 'mtproto_error' | 'mtproto_partial' | 'error';
    error?: string;
    operation?: ActiveAllOperation;
  }> {
    const { chatId, chatTitle, actor, source } = params;

    // Check concurrency lock: reject concurrent starts for same group
    if (this.hasActiveOperation(chatId)) {
      return {
        ok: false,
        status: 'already_running',
        error: 'An /all broadcast is already in progress for this group. Please wait for it to complete.'
      };
    }

    const abortController = new AbortController();
    let completionResolve!: () => void;
    const completionPromise = new Promise<void>((resolve) => {
      completionResolve = resolve;
    });

    const contentType = params.media?.contentType || 'text';

    const operation: ActiveAllOperation = {
      chatId,
      operationId: `all_${chatId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      actorUserId: actor.actorUserId,
      actorUsername: actor.actorUsername,
      actorDisplayName: actor.actorDisplayName,
      source,
      contentType,
      startedAt: Date.now(),
      abortController,
      totalBatches: 0,
      sentBatches: 0,
      mentionsCount: 0,
      isCancelled: false,
      status: 'starting',
      completionResolve,
      completionPromise
    };

    // Atomically register before any async operations
    this.activeOperations.set(chatId, operation);
    mtprotoParticipantService.acquireChatLock(chatId, () => {
      const op = this.activeOperations.get(chatId);
      if (!op || op.isCancelled) return false;
      if (op.status === 'starting' && Date.now() - op.startedAt > 120_000) return false;
      return op.status === 'starting' || op.status === 'running';
    });

    let workerDispatched = false;
    try {
      const botMe = await telegramApi.getMe().catch(() => null);
      const botId = botMe?.result?.id;

      if (operation.abortController.signal.aborted || operation.isCancelled) {
        return { ok: false, status: 'error', error: 'Operation cancelled before member resolution.' };
      }

      let members: CachedMember[] = [];
      const isMtprotoConfigured = mtprotoParticipantService.isConfigured();

      if (isMtprotoConfigured) {
        const fetchStart = Date.now();
        const fetchRes = await mtprotoParticipantService.fetchGroupParticipants(chatId, botId);
        logPerformance({
          path: 'mention_all',
          stage: 'participant_discovery',
          durationMs: Date.now() - fetchStart,
          operationId: operation.operationId,
          chatId,
          handlerName: 'startOperation',
          outcome: fetchRes.status
        });

        if (fetchRes.status === 'FETCH_FAILED') {
          members = await this.getEligibleGroupMembers(chatId, botId);
          if (members.length === 0) {
            const errorMsg = fetchRes.error || 'Failed to retrieve group participants via MTProto.';
            return { ok: false, status: 'mtproto_error', error: errorMsg };
          }
        } else if (fetchRes.status === 'PARTIAL_FETCH') {
          if (fetchRes.members && fetchRes.members.length > 0) {
            members = fetchRes.members;
          } else {
            members = await this.getEligibleGroupMembers(chatId, botId);
            if (members.length === 0) {
              const restrictionMsg = fetchRes.diagnosticMessage ||
                `Telegram did not allow Roxie to retrieve the complete member list for this group (${fetchRes.uniqueCount}/${fetchRes.telegramTotal} available).`;
              return { ok: false, status: 'mtproto_partial', error: restrictionMsg };
            }
          }
        } else {
          members = fetchRes.members;
        }
      } else {
        if (process.env.NODE_ENV === 'test') {
          members = await this.getEligibleGroupMembers(chatId, botId);
        } else {
          return {
            ok: false,
            status: 'mtproto_error',
            error: 'MTProto is not configured on this server. Please configure TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_BOT_TOKEN.'
          };
        }
      }

      if (operation.abortController.signal.aborted || operation.isCancelled) {
        return { ok: false, status: 'error', error: 'Operation cancelled.' };
      }

      const defaultMsg = params.messageText || '';
      const { mentions, chunks } = MentionAllService.buildAllMentionsChunks(members, defaultMsg, botId, 10);

      if (mentions.length === 0) {
        return { ok: false, status: 'no_members', error: 'No eligible group members found to mention.' };
      }

      operation.totalBatches = chunks.length;
      operation.mentionsCount = mentions.length;
      operation.status = 'running';

      if (operation.abortController.signal.aborted || operation.isCancelled) {
        return { ok: false, status: 'error', error: 'Operation cancelled.' };
      }

      workerDispatched = true;
      const workerPromise = this.executeWorker(
        chatId,
        chatTitle,
        actor,
        chunks,
        operation,
        params.targetReplyId,
        params.media,
        mentions.length
      );

      const shouldAwait = params.awaitWorker !== undefined
        ? params.awaitWorker
        : (process.env.NODE_ENV === 'test');

      if (shouldAwait) {
        await workerPromise;
      } else {
        workerPromise.catch((err) => {
          console.error(`[ALL] Background broadcast worker unhandled exception:`, err);
        });
      }

      return {
        ok: true,
        status: 'running',
        operation
      };
    } finally {
      if (!workerDispatched) {
        this.activeOperations.delete(chatId);
        mtprotoParticipantService.releaseChatLock(chatId);
        operation.completionResolve();
      }
    }
  }

  private async executeWorker(
    chatId: number,
    chatTitle: string | undefined,
    actor: { actorUserId?: number; actorUsername?: string; actorDisplayName?: string },
    chunks: string[],
    operation: ActiveAllOperation,
    targetReplyId?: number,
    media?: MentionAllMediaInput,
    mentionsCount: number = 0
  ): Promise<void> {
    let effectiveContentType: 'text' | 'photo' | 'video' | 'animation' | 'document' = media?.contentType || 'text';
    let mediaToSend: string | { buffer: Buffer | Uint8Array; filename: string; contentType?: string } | undefined = undefined;

    if (media) {
      if (media.repliedPhotoId) {
        effectiveContentType = 'photo';
        mediaToSend = media.repliedPhotoId;
      } else if (media.repliedAnimationId) {
        effectiveContentType = 'animation';
        mediaToSend = media.repliedAnimationId;
      } else if (media.repliedVideoId) {
        effectiveContentType = 'video';
        mediaToSend = media.repliedVideoId;
      } else if (media.repliedDocumentId) {
        effectiveContentType = 'document';
        mediaToSend = media.repliedDocumentId;
      } else if (media.mediaUploadId) {
        const item = mediaUploadStore.getMedia(media.mediaUploadId);
        if (item) {
          mediaToSend = {
            buffer: item.buffer,
            filename: item.filename,
            contentType: item.mimeType
          };
          if (item.mimeType === 'image/gif' || item.filename.toLowerCase().endsWith('.gif')) {
            effectiveContentType = 'animation';
          }
        }
      } else if (media.mediaBuffer) {
        mediaToSend = media.mediaBuffer;
      } else if (media.mediaFileId) {
        mediaToSend = media.mediaFileId;
      }
    }

    let cachedTelegramFileId: string | undefined = undefined;

    try {
      for (let i = 0; i < chunks.length; i++) {
        // Cooperative cancellation check before each batch
        if (operation.abortController.signal.aborted || operation.isCancelled) {
          console.log(`[ALL] Broadcast stopped cooperatively before batch ${i + 1}/${chunks.length} for chatId=${chatId}`);
          break;
        }

        const chunkText = chunks[i];
        console.log(`[ALL] sending batch=${i + 1}/${chunks.length}`);

        let sendSuccess = false;
        let batchAttempts = 0;
        const maxBatchAttempts = 3;

        let currentReplyId = (i === 0 && targetReplyId) ? targetReplyId : undefined;

        while (!sendSuccess && batchAttempts <= maxBatchAttempts) {
          if (operation.abortController.signal.aborted || operation.isCancelled) {
            break;
          }

          batchAttempts++;
          let sendRes: any;
          try {
            const currentMedia = cachedTelegramFileId || mediaToSend;

            if (effectiveContentType === 'photo' && currentMedia) {
              sendRes = await telegramApi.sendPhoto(chatId, currentMedia, {
                caption: chunkText,
                parse_mode: 'HTML',
                reply_to_message_id: currentReplyId,
                allow_sending_without_reply: true
              });
              if (sendRes?.ok && sendRes.result?.photo?.length) {
                cachedTelegramFileId = sendRes.result.photo[sendRes.result.photo.length - 1].file_id;
              }
            } else if (effectiveContentType === 'video' && currentMedia) {
              sendRes = await telegramApi.sendVideo(chatId, currentMedia, {
                caption: chunkText,
                parse_mode: 'HTML',
                reply_to_message_id: currentReplyId,
                allow_sending_without_reply: true
              });
              if (sendRes?.ok && sendRes.result?.video?.file_id) {
                cachedTelegramFileId = sendRes.result.video.file_id;
              }
            } else if (effectiveContentType === 'animation' && currentMedia) {
              sendRes = await telegramApi.sendAnimation(chatId, currentMedia, {
                caption: chunkText,
                parse_mode: 'HTML',
                reply_to_message_id: currentReplyId,
                allow_sending_without_reply: true
              });
              if (sendRes?.ok && (sendRes.result?.animation?.file_id || sendRes.result?.document?.file_id)) {
                cachedTelegramFileId = sendRes.result.animation?.file_id || sendRes.result.document?.file_id;
              }
            } else if (effectiveContentType === 'document' && currentMedia) {
              sendRes = await telegramApi.sendDocument(chatId, currentMedia, {
                caption: chunkText,
                parse_mode: 'HTML',
                reply_to_message_id: currentReplyId,
                allow_sending_without_reply: true
              });
              if (sendRes?.ok && sendRes.result?.document?.file_id) {
                cachedTelegramFileId = sendRes.result.document.file_id;
              }
            } else {
              sendRes = await telegramApi.sendMessage(chatId, chunkText, {
                reply_to_message_id: currentReplyId,
                allow_sending_without_reply: true,
                parse_mode: 'HTML'
              });
            }
          } catch (sendErr: any) {
            console.warn(`[ALL] Exception on sending batch ${i + 1}: ${sendErr.message}`);
          }

          if (sendRes && sendRes.ok) {
            sendSuccess = true;
          } else if (currentReplyId && (
            sendRes?.description?.toLowerCase().includes('message to be replied not found') ||
            sendRes?.description?.toLowerCase().includes('reply message not found') ||
            sendRes?.description?.toLowerCase().includes('message to reply not found') ||
            sendRes?.error_code === 400
          )) {
            console.warn(`[ALL] Batch ${i + 1} rejected with reply_to_message_id=${currentReplyId} (${sendRes?.description}). Retrying immediately without reply...`);
            currentReplyId = undefined;
            continue;
          } else if (sendRes && sendRes.error_code === 429) {
            const retryAfterSec = sendRes.parameters?.retry_after || 2;
            console.warn(`[ALL] 429 flood wait on batch ${i + 1}. Retrying in ${retryAfterSec}s...`);
            if (batchAttempts <= maxBatchAttempts) {
              const completed = await MentionAllService.abortableSleep(retryAfterSec * 1000, operation.abortController.signal);
              if (!completed || operation.isCancelled) {
                console.log(`[ALL] 429 flood wait aborted by cancellation for chatId=${chatId}`);
                break;
              }
            } else {
              sendSuccess = false;
              break;
            }
          } else {
            console.warn(`[ALL] Batch ${i + 1} sending error: ${sendRes?.description || 'Unknown error'}`);
            if (batchAttempts <= maxBatchAttempts) {
              const completed = await MentionAllService.abortableSleep(1000, operation.abortController.signal);
              if (!completed || operation.isCancelled) {
                break;
              }
            } else {
              sendSuccess = false;
              break;
            }
          }
        }

        if (operation.abortController.signal.aborted || operation.isCancelled) {
          if (sendSuccess) {
            operation.sentBatches = i + 1;
          }
          break;
        }

        if (sendSuccess) {
          operation.sentBatches = i + 1;
          if (i === 0) {
            logPerformance({
              path: 'mention_all',
              stage: 'first_message_sent',
              durationMs: Date.now() - operation.startedAt,
              operationId: operation.operationId,
              chatId,
              handlerName: 'executeWorker',
              outcome: 'success'
            });
          }
        }

        // Pacing delay between batches
        if (i < chunks.length - 1) {
          const pacingMs = this.allMessageIntervalMs !== null
            ? this.allMessageIntervalMs
            : (process.env.NODE_ENV === 'test' ? 10 : ALL_MESSAGE_INTERVAL_MS);
          if (pacingMs > 0) {
            const completed = await MentionAllService.abortableSleep(pacingMs, operation.abortController.signal);
            if (!completed || operation.isCancelled) {
              console.log(`[ALL] Pacing delay aborted by cancellation for chatId=${chatId}`);
              break;
            }
          }
        }
      }

      const actorResolution: ActorResolution = {
        actorUserId: actor.actorUserId || 0,
        actorUsername: actor.actorUsername,
        actorDisplayName: actor.actorDisplayName || actor.actorUsername || 'Admin',
        actorRole: 'ADMIN',
        actorRank: RoleRank.ADMIN,
        isAnonymousAdmin: false
      };

      if (operation.isCancelled) {
        console.log(`[ALL] Broadcast stopped chatId=${chatId} after ${operation.sentBatches}/${chunks.length} batches`);
        operation.status = 'cancelled';
        TelegramMiddleware.logAudit({
          chatId,
          chatTitle,
          actor: actorResolution,
          command: operation.source === 'command' ? 'all' : 'dashboard_mention_all',
          action: 'all_broadcast',
          result: 'success',
          details: `Broadcast stopped by ${operation.cancelledBy?.displayName || operation.cancelledBy?.username || 'admin'}. Sent ${operation.sentBatches} of ${chunks.length} batch(es)`
        });
      } else {
        console.log(`[ALL] completed batches=${chunks.length}`);
        operation.status = operation.sentBatches === chunks.length ? 'completed' : 'failed';
        TelegramMiddleware.logAudit({
          chatId,
          chatTitle,
          actor: actorResolution,
          command: operation.source === 'command' ? 'all' : 'dashboard_mention_all',
          action: 'all_broadcast',
          result: 'success',
          details: `Mentioned ${mentionsCount} members across ${chunks.length} message(s)`
        });
      }

      this.lastOperationSummaries.set(chatId, {
        operationId: operation.operationId,
        chatId,
        chatTitle,
        source: operation.source,
        contentType: operation.contentType,
        totalBatches: operation.totalBatches,
        sentBatches: operation.sentBatches,
        mentionsCount: operation.mentionsCount,
        status: operation.status,
        startedAt: operation.startedAt,
        endedAt: Date.now(),
        actorDisplayName: operation.actorDisplayName,
        cancelledBy: operation.cancelledBy,
        error: operation.error
      });
    } catch (workerErr: any) {
      console.error(`[ALL] Worker error in chatId=${chatId}:`, workerErr);
      operation.status = 'failed';
      operation.error = workerErr.message;
    } finally {
      logPerformance({
        path: 'mention_all',
        stage: 'operation_completed',
        durationMs: Date.now() - operation.startedAt,
        operationId: operation.operationId,
        chatId,
        handlerName: 'executeWorker',
        outcome: operation.status,
        details: { sentBatches: operation.sentBatches, totalBatches: chunks.length }
      });
      try {
        this.activeOperations.delete(chatId);
        mtprotoParticipantService.releaseChatLock(chatId);
      } finally {
        operation.completionResolve();
      }
    }
  }

  public async stopOperation(
    chatId: number,
    cancelledBy: { userId?: number; username?: string; displayName?: string }
  ): Promise<{
    ok: boolean;
    status: 'stopped' | 'already_stopping' | 'not_running';
    operation?: ActiveAllOperation;
    message: string;
    sentBatches?: number;
    totalBatches?: number;
  }> {
    const op = this.activeOperations.get(chatId);
    if (!op) {
      return {
        ok: false,
        status: 'not_running',
        message: 'There is no active /all broadcast running in this group.'
      };
    }

    if (op.isCancelled) {
      return {
        ok: false,
        status: 'already_stopping',
        message: 'The active broadcast is already stopping. Please wait.',
        sentBatches: op.sentBatches,
        totalBatches: op.totalBatches
      };
    }

    op.isCancelled = true;
    op.status = 'stopping';
    op.cancelledBy = cancelledBy;
    op.abortController.abort();

    await op.completionPromise;

    const actorName = cancelledBy.displayName || cancelledBy.username || 'admin';
    const stopMessage = op.totalBatches > 0
      ? `⏹️ <b>/all Broadcast Stopped</b>\n\nBroadcast stopped by ${actorName}.\nSent <b>${op.sentBatches}</b> of <b>${op.totalBatches}</b> batch(es).`
      : `⏹️ <b>/all Broadcast Stopped</b>\n\nBroadcast stopped by ${actorName} before batches were dispatched.`;

    return {
      ok: true,
      status: 'stopped',
      operation: op,
      message: stopMessage,
      sentBatches: op.sentBatches,
      totalBatches: op.totalBatches
    };
  }

  public getOperationStatus(chatId: number): {
    active: boolean;
    operation?: {
      operationId: string;
      chatId: number;
      source: 'command' | 'dashboard';
      contentType: string;
      totalBatches: number;
      sentBatches: number;
      mentionsCount: number;
      isCancelled: boolean;
      status: string;
      startedAt: number;
      actorDisplayName?: string;
    };
    lastOperation?: CompletedOperationSummary;
  } {
    const active = this.activeOperations.get(chatId);
    if (active) {
      return {
        active: true,
        operation: {
          operationId: active.operationId,
          chatId: active.chatId,
          source: active.source,
          contentType: active.contentType,
          totalBatches: active.totalBatches,
          sentBatches: active.sentBatches,
          mentionsCount: active.mentionsCount,
          isCancelled: active.isCancelled,
          status: active.status,
          startedAt: active.startedAt,
          actorDisplayName: active.actorDisplayName
        }
      };
    }

    const last = this.lastOperationSummaries.get(chatId);
    return {
      active: false,
      lastOperation: last
    };
  }

  public getActiveOperationsList(): Array<{
    chatId: number;
    operationId: string;
    source: 'command' | 'dashboard';
    contentType: string;
    totalBatches: number;
    sentBatches: number;
    mentionsCount: number;
    startedAt: number;
    actorDisplayName?: string;
    status: string;
  }> {
    return Array.from(this.activeOperations.values()).map(op => ({
      chatId: op.chatId,
      operationId: op.operationId,
      source: op.source,
      contentType: op.contentType,
      totalBatches: op.totalBatches,
      sentBatches: op.sentBatches,
      mentionsCount: op.mentionsCount,
      startedAt: op.startedAt,
      actorDisplayName: op.actorDisplayName,
      status: op.status
    }));
  }
}

export const mentionAllService = MentionAllService.getInstance();
