import { db } from '../db/storage.js';
import { telegramApi } from './api.js';
import { ChatbotService } from './chatbot.js';
import {
  GroupSettings,
  AutoEngineConfig,
  AutoEngineMode,
  AutoEnginePreset,
  AutoEngineChannelConfig,
  AutoResponseConfig,
  AutoStickerConfig
} from './types.js';

export const MIN_AUTO_ENGINE_INTERVAL_SECONDS = 120; // 2 minutes hard server-side limit

export const AUTO_ENGINE_PRESETS: Record<
  AutoEnginePreset,
  {
    messages: { minSeconds: number; maxSeconds: number; cooldownSeconds: number };
    stickers: { minSeconds: number; maxSeconds: number; cooldownSeconds: number };
  }
> = {
  very_low: {
    messages: { minSeconds: 1800, maxSeconds: 3600, cooldownSeconds: 1800 },
    stickers: { minSeconds: 1800, maxSeconds: 3600, cooldownSeconds: 1800 }
  },
  low: {
    messages: { minSeconds: 900, maxSeconds: 1800, cooldownSeconds: 900 },
    stickers: { minSeconds: 1200, maxSeconds: 2400, cooldownSeconds: 1200 }
  },
  normal: {
    messages: { minSeconds: 480, maxSeconds: 900, cooldownSeconds: 480 },
    stickers: { minSeconds: 600, maxSeconds: 1200, cooldownSeconds: 600 }
  },
  high: {
    messages: { minSeconds: 180, maxSeconds: 480, cooldownSeconds: 180 },
    stickers: { minSeconds: 300, maxSeconds: 600, cooldownSeconds: 300 }
  },
  custom: {
    messages: { minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120 },
    stickers: { minSeconds: 120, maxSeconds: 300, cooldownSeconds: 120 }
  }
};

export interface ScheduledAutoJob {
  key: string;
  botId: number;
  chatId: number;
  engineType: 'response' | 'sticker';
  targetRunAt: number;
  timeoutHandle: NodeJS.Timeout | null;
  isExecuting: boolean;
  consecutiveFailures: number;
}

export class AutoEngineService {
  private jobs: Map<string, ScheduledAutoJob> = new Map();
  private activeExecutions: Set<string> = new Set();
  private isRunning: boolean = false;
  private currentBotId: number | null = null;
  private unregisterSettingsListener: (() => void) | null = null;
  private unregisterRemovalListener: (() => void) | null = null;

  // Injectable hooks for fast, deterministic unit testing
  private customSetTimeout: typeof setTimeout = setTimeout;
  private customClearTimeout: typeof clearTimeout = clearTimeout;
  private customNow: () => number = () => Date.now();
  private bypassMinimumIntervalForTests: boolean = false;

  public makeJobKey(botId: number, chatId: number, engineType: 'response' | 'sticker'): string {
    return `${botId}:${chatId}:${engineType}`;
  }

  public getStatus() {
    let responseCount = 0;
    let stickerCount = 0;
    for (const job of this.jobs.values()) {
      if (job.engineType === 'response') responseCount++;
      if (job.engineType === 'sticker') stickerCount++;
    }
    return {
      running: this.isRunning,
      currentBotId: this.currentBotId,
      totalActiveJobs: this.jobs.size,
      activeResponseTimers: responseCount,
      activeStickerTimers: stickerCount
    };
  }

  public start(botId?: number | null): void {
    const targetBotId = botId !== undefined ? botId : db.getCurrentBotId();
    if (this.isRunning && this.currentBotId === (targetBotId ?? null)) {
      return;
    }

    this.stop();
    this.isRunning = true;
    this.currentBotId = targetBotId ?? null;

    // Register storage change listeners to automatically sync timers
    this.unregisterSettingsListener = db.onSettingsChanged((chatId, settings, scopedBotId) => {
      const activeBotId = scopedBotId ?? this.currentBotId ?? 0;
      this.syncGroup(activeBotId, chatId, settings, false);
    });

    this.unregisterRemovalListener = db.onGroupRemoved((chatId, scopedBotId) => {
      const activeBotId = scopedBotId ?? this.currentBotId ?? 0;
      this.cancelAllForGroup(activeBotId, chatId);
    });

    // Staggered startup initialization: discover all active groups for current bot
    const activeBotId = this.currentBotId ?? 0;
    const scopedSettings = db.getAllGroupSettings(activeBotId);
    for (const [idStr, group] of Object.entries(scopedSettings)) {
      const chatId = Number(idStr);
      if (chatId < 0 && !group.botLeft && !group.unavailable) {
        if (group.botId === activeBotId) {
          this.syncGroup(activeBotId, chatId, group, true);
        }
      }
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.unregisterSettingsListener) {
      this.unregisterSettingsListener();
      this.unregisterSettingsListener = null;
    }
    if (this.unregisterRemovalListener) {
      this.unregisterRemovalListener();
      this.unregisterRemovalListener = null;
    }
    for (const job of this.jobs.values()) {
      if (job.timeoutHandle) {
        this.customClearTimeout(job.timeoutHandle);
        job.timeoutHandle = null;
      }
    }
    this.jobs.clear();
    this.activeExecutions.clear();
    this.currentBotId = null;
  }

  public calculateDelayMs(
    config: AutoEngineChannelConfig | AutoResponseConfig | AutoStickerConfig | undefined,
    defaultMin: number = 120,
    defaultMax: number = 300,
    defaultCooldown: number = 120,
    channel: 'messages' | 'stickers' = 'messages'
  ): number {
    const minFloor = this.bypassMinimumIntervalForTests ? 1 : MIN_AUTO_ENGINE_INTERVAL_SECONDS;

    if (!config) return Math.max(minFloor, defaultCooldown) * 1000;

    // Check if config has unified preset
    if ('preset' in config && config.preset) {
      const presetDef = AUTO_ENGINE_PRESETS[config.preset] || AUTO_ENGINE_PRESETS.normal;
      const channelDef = presetDef[channel];
      if (config.preset !== 'custom') {
        const safeMin = Math.max(minFloor, channelDef.minSeconds);
        const safeMax = Math.max(safeMin, channelDef.maxSeconds);
        const seconds = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
        return seconds * 1000;
      }
    }

    // Custom or legacy config calculation
    const isRandom = ('randomize' in config ? config.randomize : false) || ('mode' in config && (config.mode === 'random' || config.randomize));
    const rawMin = Number((config as any).minSeconds ?? defaultMin);
    const rawMax = Number((config as any).maxSeconds ?? defaultMax);
    const safeMin = Math.max(minFloor, Math.min(86400, isNaN(rawMin) ? defaultMin : rawMin));
    const safeMax = Math.max(safeMin, Math.min(86400, isNaN(rawMax) ? defaultMax : rawMax));

    if (isRandom) {
      const seconds = Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
      return seconds * 1000;
    }

    const rawCd = Number((config as any).cooldownSeconds ?? defaultCooldown);
    const safeCd = Math.max(minFloor, Math.min(86400, isNaN(rawCd) ? defaultCooldown : rawCd));
    return safeCd * 1000;
  }

  public calculateStartupJitterMs(delayMs: number): number {
    const minJitter = 5000;
    const maxJitter = Math.min(60000, Math.max(minJitter, delayMs));
    return Math.floor(Math.random() * (maxJitter - minJitter + 1)) + minJitter;
  }

  public scheduleJob(
    botId: number,
    chatId: number,
    engineType: 'response' | 'sticker',
    delayMs: number,
    reason?: string
  ): void {
    if (!this.isRunning) return;
    if (this.currentBotId !== null && this.currentBotId !== botId) return;

    // Defensive gate: Ensure the group exists in storage and is active/connected
    const currentSettings = db.getGroupSettingsIfExists(chatId);
    if (!currentSettings || currentSettings.botLeft || currentSettings.unavailable) {
      this.cancelAllForGroup(botId, chatId);
      return;
    }

    const key = this.makeJobKey(botId, chatId, engineType);
    const existing = this.jobs.get(key);

    // Cancel existing timer if any to guarantee exactly one active timer per (botId, chatId, type)
    if (existing?.timeoutHandle) {
      this.customClearTimeout(existing.timeoutHandle);
      existing.timeoutHandle = null;
    }

    const consecutiveFailures = existing?.consecutiveFailures || 0;
    const isExecuting = existing?.isExecuting || false;
    const targetRunAt = this.customNow() + delayMs;

    const job: ScheduledAutoJob = {
      key,
      botId,
      chatId,
      engineType,
      targetRunAt,
      timeoutHandle: null,
      isExecuting,
      consecutiveFailures
    };

    job.timeoutHandle = this.customSetTimeout(async () => {
      await this.executeJob(botId, chatId, engineType);
    }, delayMs);

    this.jobs.set(key, job);

    if (engineType === 'sticker') {
      console.log(`[AUTO_ENGINE] sticker scheduled for chat ${chatId} (delay: ${delayMs}ms, reason: ${reason || 'unspecified'})`);
    } else {
      console.log(`[AUTO_ENGINE] message scheduled for chat ${chatId} (delay: ${delayMs}ms, reason: ${reason || 'unspecified'})`);
    }
  }

  public cancelJob(botId: number, chatId: number, engineType: 'response' | 'sticker'): void {
    const key = this.makeJobKey(botId, chatId, engineType);
    const existing = this.jobs.get(key);
    if (existing) {
      if (existing.timeoutHandle) {
        this.customClearTimeout(existing.timeoutHandle);
        existing.timeoutHandle = null;
      }
      this.jobs.delete(key);
    }
    this.activeExecutions.delete(key);
  }

  public cancelAllForGroup(botId: number, chatId: number): void {
    this.cancelJob(botId, chatId, 'response');
    this.cancelJob(botId, chatId, 'sticker');
  }

  public syncGroup(
    botId: number,
    chatId: number,
    settings?: GroupSettings,
    isStartup: boolean = false
  ): void {
    if (!this.isRunning) return;
    if (this.currentBotId !== null && this.currentBotId !== botId) return;

    const currentSettings = settings || db.getGroupSettingsIfExists(chatId);
    if (!currentSettings || currentSettings.botLeft || currentSettings.unavailable) {
      this.cancelAllForGroup(botId, chatId);
      return;
    }

    // Multi-bot isolation: ensure group strictly belongs to this botId
    if (currentSettings.botId !== botId) {
      this.cancelAllForGroup(botId, chatId);
      return;
    }

    // Resolve unified autoEngine configuration
    const engineConfig: AutoEngineConfig = currentSettings.autoEngine || this.resolveLegacyConfig(currentSettings);
    const isEngineEnabled = Boolean(engineConfig.enabled && engineConfig.mode !== 'off');

    if (!isEngineEnabled) {
      this.cancelAllForGroup(botId, chatId);
      return;
    }

    const mode = engineConfig.mode;

    // Messages sync
    const shouldRunMessages = (mode === 'messages_only' || mode === 'messages_and_stickers');
    if (shouldRunMessages) {
      const msgConfig = engineConfig.messages;
      const fullDelay = this.calculateDelayMs(msgConfig, 480, 900, 480, 'messages');
      const delay = isStartup ? this.calculateStartupJitterMs(fullDelay) : fullDelay;
      this.scheduleJob(botId, chatId, 'response', delay, isStartup ? 'startup_jitter' : 'settings_sync');
    } else {
      this.cancelJob(botId, chatId, 'response');
    }

    // Stickers sync
    const shouldRunStickers = (mode === 'stickers_only' || mode === 'messages_and_stickers');
    if (shouldRunStickers) {
      const stkConfig = engineConfig.stickers;
      const fullDelay = this.calculateDelayMs(stkConfig, 600, 1200, 600, 'stickers');
      const delay = isStartup ? this.calculateStartupJitterMs(fullDelay) : fullDelay;
      this.scheduleJob(botId, chatId, 'sticker', delay, isStartup ? 'startup_jitter' : 'settings_sync');
    } else {
      this.cancelJob(botId, chatId, 'sticker');
    }
  }

  private resolveLegacyConfig(settings: GroupSettings): AutoEngineConfig {
    const ar = settings.autoResponse;
    const as = settings.autoSticker;
    const arEnabled = Boolean(ar?.enabled && ar.mode !== 'disabled');
    const asEnabled = Boolean(as?.enabled && as.mode !== 'disabled');

    let mode: AutoEngineMode = 'off';
    if (arEnabled && asEnabled) mode = 'messages_and_stickers';
    else if (arEnabled && !asEnabled) mode = 'messages_only';
    else if (!arEnabled && asEnabled) mode = 'stickers_only';

    return {
      enabled: mode !== 'off',
      mode,
      messages: {
        preset: 'custom',
        minSeconds: ar?.minSeconds ?? 480,
        maxSeconds: ar?.maxSeconds ?? 900,
        cooldownSeconds: ar?.cooldownSeconds ?? 480,
        randomize: ar?.randomize ?? (ar?.mode === 'random') ?? true
      },
      stickers: {
        preset: 'custom',
        minSeconds: as?.minSeconds ?? 600,
        maxSeconds: as?.maxSeconds ?? 1200,
        cooldownSeconds: as?.cooldownSeconds ?? 600,
        randomize: as?.randomize ?? (as?.mode === 'random') ?? true
      }
    };
  }

  private async executeJob(botId: number, chatId: number, engineType: 'response' | 'sticker'): Promise<void> {
    const key = this.makeJobKey(botId, chatId, engineType);
    const job = this.jobs.get(key);
    if (!job || !this.isRunning) return;
    if (this.currentBotId !== null && this.currentBotId !== botId) return;

    if (this.activeExecutions.has(key) || job.isExecuting) {
      console.warn(`[AUTO_ENGINE] Duplicate ${engineType} execution suppressed for chat ${chatId}`);
      return; // Avoid overlapping runs
    }

    this.activeExecutions.add(key);
    job.isExecuting = true;
    job.timeoutHandle = null;

    console.log(`[AUTO_ENGINE] ${engineType} executing for chat ${chatId}`);

    try {
      const settings = db.getGroupSettingsIfExists(chatId);
      if (!settings || settings.botLeft || settings.unavailable) {
        this.cancelAllForGroup(botId, chatId);
        return;
      }

      if (settings.botId !== botId) {
        this.cancelAllForGroup(botId, chatId);
        return;
      }

      const engineConfig: AutoEngineConfig = settings.autoEngine || this.resolveLegacyConfig(settings);
      if (!engineConfig.enabled || engineConfig.mode === 'off') {
        this.cancelAllForGroup(botId, chatId);
        return;
      }

      if (engineType === 'response') {
        if (engineConfig.mode !== 'messages_only' && engineConfig.mode !== 'messages_and_stickers') {
          this.cancelJob(botId, chatId, 'response');
          return;
        }
        await this.executeAutoResponse(botId, chatId, settings, engineConfig);
      } else {
        if (engineConfig.mode !== 'stickers_only' && engineConfig.mode !== 'messages_and_stickers') {
          this.cancelJob(botId, chatId, 'sticker');
          return;
        }
        await this.executeAutoSticker(botId, chatId, settings, engineConfig);
      }
    } catch (err: any) {
      console.error(`[AUTO_ENGINE] Error executing ${engineType} for chat ${chatId}:`, err?.message || err);
      this.handleFailure(botId, chatId, engineType, err);
    } finally {
      this.activeExecutions.delete(key);
      const currentJob = this.jobs.get(key);
      if (currentJob) {
        currentJob.isExecuting = false;
      }
    }
  }

  private async executeAutoResponse(
    botId: number,
    chatId: number,
    settings: GroupSettings,
    engineConfig: AutoEngineConfig
  ): Promise<void> {
    if (settings.chatbotEnabled === false) {
      const nextDelay = this.calculateDelayMs(engineConfig.messages, 480, 900, 480, 'messages');
      this.scheduleJob(botId, chatId, 'response', nextDelay, 'chatbot_disabled');
      return;
    }

    const decision = await ChatbotService.generateProactiveResponse(chatId, null);
    if (!decision || decision.responseType === 'none' || !decision.content) {
      this.handleFailure(botId, chatId, 'response', new Error('OpenRouter proactive generation produced no response'));
      return;
    }

    // Send typing status ONLY after AI has generated a valid response
    telegramApi.sendChatAction(chatId, 'typing').catch(() => {});

    const sendRes = await telegramApi.sendMessage(chatId, decision.content);
    if (sendRes.ok || (sendRes as any).message_id) {
      db.recordAutoResponseSent(chatId);
      const job = this.jobs.get(this.makeJobKey(botId, chatId, 'response'));
      if (job) job.consecutiveFailures = 0;
    } else {
      const desc = (sendRes as any)?.description || 'Telegram send failed';
      if (this.isPermanentInvalidTargetError(desc)) {
        this.handlePermanentInvalidTarget(botId, chatId, desc);
        return;
      }
      throw new Error(desc);
    }

    const nextDelay = this.calculateDelayMs(engineConfig.messages, 480, 900, 480, 'messages');
    this.scheduleJob(botId, chatId, 'response', nextDelay, 'next_interval');
  }

  private async executeAutoSticker(
    botId: number,
    chatId: number,
    settings: GroupSettings,
    engineConfig: AutoEngineConfig
  ): Promise<void> {
    const stickerCheck = db.checkAutoStickerEligibility(chatId);
    if (!stickerCheck.allowed) {
      console.log(`[AUTO_ENGINE] Sticker skipped for chat ${chatId}: ${stickerCheck.reason || 'activity cooldown active'}`);
      const nextDelay = this.calculateDelayMs(engineConfig.stickers, 600, 1200, 600, 'stickers');
      this.scheduleJob(botId, chatId, 'sticker', nextDelay, 'activity_cooldown');
      return;
    }

    const stickerFileId = ChatbotService.selectProactiveSticker(chatId);
    if (stickerFileId) {
      const sendRes = await telegramApi.sendSticker(chatId, stickerFileId);
      if (sendRes.ok || (sendRes as any).message_id) {
        db.recordAutoStickerSent(chatId);
        console.log(`[AUTO_ENGINE] sticker sent for chat ${chatId} (stickerId: ${stickerFileId})`);
        const job = this.jobs.get(this.makeJobKey(botId, chatId, 'sticker'));
        if (job) job.consecutiveFailures = 0;
      } else {
        const desc = (sendRes as any)?.description || 'Telegram sendSticker failed';
        if (this.isPermanentInvalidTargetError(desc)) {
          this.handlePermanentInvalidTarget(botId, chatId, desc);
          return;
        }
        throw new Error(desc);
      }
    }

    const nextDelay = this.calculateDelayMs(engineConfig.stickers, 600, 1200, 600, 'stickers');
    console.log(`[AUTO_ENGINE] sticker next run for chat ${chatId} scheduled in ${nextDelay}ms`);
    this.scheduleJob(botId, chatId, 'sticker', nextDelay, 'next_interval');
  }

  private handleFailure(botId: number, chatId: number, engineType: 'response' | 'sticker', err: any): void {
    const key = this.makeJobKey(botId, chatId, engineType);
    const job = this.jobs.get(key);
    if (!job) return;

    job.consecutiveFailures++;
    const errMsg = err?.message || String(err);

    if (this.isPermanentInvalidTargetError(errMsg)) {
      this.handlePermanentInvalidTarget(botId, chatId, errMsg);
      return;
    }

    let backoffMs = 60000;
    if (errMsg.includes('retry after') || errMsg.includes('429')) {
      const match = errMsg.match(/retry after (\d+)/i);
      const retrySec = match ? parseInt(match[1], 10) : 30;
      backoffMs = (retrySec + 5) * 1000;
    } else {
      backoffMs = Math.min(600000, 60000 * Math.pow(2, Math.min(3, job.consecutiveFailures - 1)));
    }

    this.scheduleJob(botId, chatId, engineType, backoffMs, 'failure_backoff');
  }

  public isPermanentInvalidTargetError(msg: string): boolean {
    const lower = (msg || '').toLowerCase();
    return (
      lower.includes('chat not found') ||
      lower.includes('bot was kicked') ||
      lower.includes('bot was removed') ||
      lower.includes('bot is not a member') ||
      lower.includes('upgraded to a supergroup') ||
      lower.includes('group chat was upgraded') ||
      lower.includes('legacy dummy') ||
      lower.includes('blocked call to legacy dummy') ||
      lower.includes('telegram_invalid_legacy_target') ||
      lower.includes('peer_id_invalid') ||
      lower.includes('group chat was deactivated') ||
      lower.includes('chat was deleted') ||
      lower.includes('bot was blocked by') ||
      lower.includes('user is deactivated')
    );
  }

  public handlePermanentInvalidTarget(botId: number, chatId: number, reason: string): void {
    console.warn(`[AUTO_ENGINE] Permanent invalid target detected for chat ${chatId} (${reason}). Canceling auto engine jobs for this group only.`);
    this.cancelAllForGroup(botId, chatId);
    try {
      db.updateGroupSettings(chatId, {
        botLeft: true,
        unavailable: true,
        unavailableReason: reason
      });
    } catch (err: any) {
      console.error(`[AUTO_ENGINE] Failed to mark group ${chatId} as unavailable in storage:`, err?.message);
    }
  }

  // --- Test & Inspection Helpers ---
  public getActiveJobCount(): { response: number; sticker: number; total: number } {
    let response = 0;
    let sticker = 0;
    for (const job of this.jobs.values()) {
      if (job.engineType === 'response') response++;
      if (job.engineType === 'sticker') sticker++;
    }
    return { response, sticker, total: this.jobs.size };
  }

  public getJob(botId: number, chatId: number, engineType: 'response' | 'sticker'): ScheduledAutoJob | undefined {
    return this.jobs.get(this.makeJobKey(botId, chatId, engineType));
  }

  public setTestHooks(hooks: {
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    now?: () => number;
    bypassMinimumIntervalForTests?: boolean;
  }): void {
    if (hooks.setTimeout) this.customSetTimeout = hooks.setTimeout;
    if (hooks.clearTimeout) this.customClearTimeout = hooks.clearTimeout;
    if (hooks.now) this.customNow = hooks.now;
    if (hooks.bypassMinimumIntervalForTests !== undefined) {
      this.bypassMinimumIntervalForTests = hooks.bypassMinimumIntervalForTests;
    } else if (hooks.setTimeout) {
      this.bypassMinimumIntervalForTests = true;
    }
  }

  public resetTestHooks(): void {
    this.customSetTimeout = setTimeout;
    this.customClearTimeout = clearTimeout;
    this.customNow = () => Date.now();
    this.bypassMinimumIntervalForTests = false;
  }
}

export const autoEngineService = new AutoEngineService();
