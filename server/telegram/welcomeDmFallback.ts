import crypto from 'crypto';
import { TelegramUser, RichMessageConfig } from './types.js';

export interface PendingWelcome {
  token: string;
  chatId: number;
  chatTitle: string;
  userId: number;
  user: TelegramUser;
  config: RichMessageConfig;
  createdAt: number;
  expiresAt: number;
  isDelivering?: boolean; // active delivery lock
  claimedAt?: number; // timestamp when the active delivery started
}

export type AcquireClaimResult =
  | { ok: true; pending: PendingWelcome }
  | { ok: false; reason: 'NOT_FOUND' | 'EXPIRED' | 'WRONG_USER' | 'IN_FLIGHT' };

export class WelcomeDmFallbackService {
  private static pendingWelcomes: Map<string, PendingWelcome> = new Map();
  private static readonly DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly MAX_DELIVERY_TIMEOUT_MS = 60 * 1000; // 60s watchdog safeguard against stalled deliveries

  /**
   * Generates an opaque, cryptographically secure short-lived token and records pending welcome.
   * NEVER exposes raw chatId or userId in the token.
   */
  public static createPendingWelcome(
    chatId: number,
    chatTitle: string,
    user: TelegramUser,
    config: RichMessageConfig,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): PendingWelcome {
    this.sweepExpired();

    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const record: PendingWelcome = {
      token,
      chatId,
      chatTitle,
      userId: user.id,
      user,
      config,
      createdAt: now,
      expiresAt: now + ttlMs
    };

    this.pendingWelcomes.set(token, record);
    return record;
  }

  /**
   * Look up pending welcome by token without claiming or consuming.
   */
  public static getPending(token: string): PendingWelcome | undefined {
    return this.pendingWelcomes.get(token);
  }

  /**
   * Safely acquires an in-flight claim on a pending welcome token to prevent concurrent duplicate delivery.
   * Validates token existence, expiration, and user identity before granting the claim.
   */
  public static acquireClaim(token: string, userId: number): AcquireClaimResult {
    const record = this.pendingWelcomes.get(token);
    if (!record) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      return { ok: false, reason: 'EXPIRED' };
    }

    if (record.userId !== userId) {
      return { ok: false, reason: 'WRONG_USER' };
    }

    // Check if another request is currently delivering this token (in-flight)
    if (record.isDelivering) {
      // Guard against concurrent delivery attempts while delivery is actively in progress
      if (record.claimedAt && now - record.claimedAt < this.MAX_DELIVERY_TIMEOUT_MS) {
        return { ok: false, reason: 'IN_FLIGHT' };
      }
      // If delivery stalled past the watchdog timeout, log warning and allow fresh attempt to take over
      console.warn(`[WelcomeDM] In-flight claim for token ${token} exceeded ${this.MAX_DELIVERY_TIMEOUT_MS}ms watchdog, allowing retry takeover`);
    }

    // Set delivery lock
    record.isDelivering = true;
    record.claimedAt = now;
    return { ok: true, pending: record };
  }

  /**
   * Releases an in-flight claim if message delivery failed, allowing the intended user to retry.
   */
  public static releaseClaim(token: string): void {
    const record = this.pendingWelcomes.get(token);
    if (record) {
      record.isDelivering = false;
      record.claimedAt = undefined;
    }
  }

  /**
   * Completes the claim by permanently consuming and deleting the token after successful DM delivery.
   */
  public static completeClaim(token: string): boolean {
    return this.pendingWelcomes.delete(token);
  }

  /**
   * Legacy / direct consume method.
   */
  public static consume(token: string): boolean {
    return this.pendingWelcomes.delete(token);
  }

  /**
   * Clear all pending tokens (for tests/resets).
   */
  public static clear(): void {
    this.pendingWelcomes.clear();
  }

  /**
   * Count active pending tokens (for tests).
   */
  public static getActiveCount(): number {
    this.sweepExpired();
    return this.pendingWelcomes.size;
  }

  /**
   * Sweeps old expired tokens (keeps expired records for 1 hour for user feedback).
   */
  private static sweepExpired(): void {
    const now = Date.now();
    for (const [token, record] of this.pendingWelcomes.entries()) {
      if (now > record.expiresAt + 3600_000) {
        this.pendingWelcomes.delete(token);
      }
    }
  }
}
