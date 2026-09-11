import crypto from 'crypto';
import { db } from '../db/storage.js';

export type OperatorRole = 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'VIEWER';
export type OperatorStatus = 'ACTIVE' | 'DISABLED';

export interface Operator {
  id: string;
  username: string;
  name: string;
  passwordHash: string; // salt:hash
  role: OperatorRole;
  status: OperatorStatus;
  createdAt: string;
  lastLogin?: string;
  lastActivity?: string;
}

export interface OperatorSession {
  sessionId: string; // Signed token: `${rawSessionId}.${signature}`
  rawSessionId: string;
  operatorId: string;
  username: string;
  role: OperatorRole;
  expiresAt: number;
  createdAt: string;
}

class AuthManager {
  private operators: Map<string, Operator> = new Map();
  private sessions: Map<string, OperatorSession> = new Map();
  private failedAttempts: Map<string, { count: number; lockedUntil: number; windowStart: number }> = new Map();
  private isConfigured: boolean = false;

  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes lockout
  private readonly ATTEMPT_WINDOW_MS = 5 * 60 * 1000; // 5 minute sliding window

  constructor() {
    this.initDefaultOperator();
  }

  public getIsConfigured(): boolean {
    return this.isConfigured;
  }

  public initDefaultOperator() {
    const defaultPassword = process.env.DASHBOARD_ADMIN_PASSWORD?.trim();
    const sessionSecret = process.env.DASHBOARD_SESSION_SECRET?.trim();

    if (!defaultPassword || !sessionSecret) {
      this.isConfigured = false;
      this.operators.clear();
      const missing: string[] = [];
      if (!defaultPassword) missing.push('DASHBOARD_ADMIN_PASSWORD');
      if (!sessionSecret) missing.push('DASHBOARD_SESSION_SECRET');
      console.warn(`[Auth] Dashboard authentication is not configured. Set ${missing.join(' and ')} in environment.`);
      return;
    }

    this.isConfigured = true;
    const defaultId = 'op-super-1';
    const username = process.env.DASHBOARD_ADMIN_USERNAME?.trim() || 'admin';
    const passwordHash = this.hashPassword(defaultPassword);

    this.operators.set(defaultId, {
      id: defaultId,
      username,
      name: 'System Super Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    });
  }

  public reloadConfig() {
    this.initDefaultOperator();
  }

  public getSessionSecret(): string | null {
    const envSecret = process.env.DASHBOARD_SESSION_SECRET?.trim();
    if (envSecret && envSecret.length > 0) {
      return envSecret;
    }
    return null;
  }

  public signToken(rawId: string): string | null {
    const secret = this.getSessionSecret();
    if (!secret) return null;
    return crypto.createHmac('sha256', secret).update(rawId).digest('hex');
  }

  public verifySignature(rawId: string, signature: string): boolean {
    try {
      const secret = this.getSessionSecret();
      if (!secret) return false;
      const expected = crypto.createHmac('sha256', secret).update(rawId).digest('hex');
      if (expected.length !== signature.length) return false;
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  public checkBruteForce(ip: string): { isLocked: boolean; remainingSeconds: number } {
    if (!ip) return { isLocked: false, remainingSeconds: 0 };
    const record = this.failedAttempts.get(ip);
    if (!record) return { isLocked: false, remainingSeconds: 0 };

    const now = Date.now();
    if (record.lockedUntil > now) {
      const remainingSeconds = Math.ceil((record.lockedUntil - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }

    if (now - record.windowStart > this.ATTEMPT_WINDOW_MS) {
      this.failedAttempts.delete(ip);
      return { isLocked: false, remainingSeconds: 0 };
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  public recordFailedAttempt(ip: string): { isLocked: boolean; remainingSeconds: number; attemptsLeft: number } {
    if (!ip) return { isLocked: false, remainingSeconds: 0, attemptsLeft: this.MAX_FAILED_ATTEMPTS };
    const now = Date.now();
    let record = this.failedAttempts.get(ip);

    if (!record || now - record.windowStart > this.ATTEMPT_WINDOW_MS) {
      record = { count: 1, lockedUntil: 0, windowStart: now };
    } else {
      record.count++;
    }

    if (record.count >= this.MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.failedAttempts.set(ip, record);
      const remainingSeconds = Math.ceil(this.LOCKOUT_DURATION_MS / 1000);
      return { isLocked: true, remainingSeconds, attemptsLeft: 0 };
    }

    this.failedAttempts.set(ip, record);
    return { isLocked: false, remainingSeconds: 0, attemptsLeft: this.MAX_FAILED_ATTEMPTS - record.count };
  }

  public resetFailedAttempts(ip: string): void {
    if (ip) {
      this.failedAttempts.delete(ip);
    }
  }

  public hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  public verifyPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, hash] = storedHash.split(':');
      if (!salt || !hash) return false;
      const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
    } catch {
      return false;
    }
  }

  public authenticate(
    username: string,
    pass: string,
    ip?: string
  ): {
    operator?: Operator;
    session?: OperatorSession;
    error?: string;
    notConfigured?: boolean;
    locked?: boolean;
    remainingSeconds?: number;
  } {
    if (!this.isConfigured || this.operators.size === 0 || !this.getSessionSecret()) {
      return {
        error: 'Dashboard authentication is not configured. Set DASHBOARD_ADMIN_PASSWORD and DASHBOARD_SESSION_SECRET in environment.',
        notConfigured: true
      };
    }

    if (ip) {
      const bruteCheck = this.checkBruteForce(ip);
      if (bruteCheck.isLocked) {
        return {
          error: `Too many failed login attempts. Access temporarily locked for ${bruteCheck.remainingSeconds} seconds.`,
          locked: true,
          remainingSeconds: bruteCheck.remainingSeconds
        };
      }
    }

    const op = Array.from(this.operators.values()).find(
      o => o.username.toLowerCase() === username.toLowerCase() && o.status === 'ACTIVE'
    );

    if (!op || !this.verifyPassword(pass, op.passwordHash)) {
      if (ip) {
        const failRecord = this.recordFailedAttempt(ip);
        if (failRecord.isLocked) {
          return {
            error: `Too many failed login attempts. Access locked for ${failRecord.remainingSeconds} seconds.`,
            locked: true,
            remainingSeconds: failRecord.remainingSeconds
          };
        }
      }
      return { error: 'Invalid username or password' };
    }

    if (ip) {
      this.resetFailedAttempts(ip);
    }

    op.lastLogin = new Date().toISOString();
    op.lastActivity = op.lastLogin;

    const rawSessionId = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const signature = this.signToken(rawSessionId);
    if (!signature) {
      return {
        error: 'Dashboard authentication is not configured. DASHBOARD_SESSION_SECRET is missing.',
        notConfigured: true
      };
    }
    const signedToken = `${rawSessionId}.${signature}`;
    const expiresAt = Date.now() + 86400000; // 24 hours

    const session: OperatorSession = {
      sessionId: signedToken,
      rawSessionId,
      operatorId: op.id,
      username: op.username,
      role: op.role,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    this.sessions.set(rawSessionId, session);
    return { operator: op, session };
  }

  public getSession(token?: string): OperatorSession | null {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) {
      return null;
    }

    const [rawId, signature] = parts;
    if (!rawId || !signature) return null;

    // Cryptographic signature check with DASHBOARD_SESSION_SECRET
    if (!this.verifySignature(rawId, signature)) {
      return null;
    }

    // Server-side session tracking & revocation lookup
    const session = this.sessions.get(rawId);
    if (!session) return null;

    // Expiry check
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(rawId);
      return null;
    }

    // Rolling 24-hour expiration renewal on active request
    session.expiresAt = Date.now() + 86400000;
    return session;
  }

  public parseCookies(cookieHeader?: string): Record<string, string> {
    const list: Record<string, string> = {};
    if (!cookieHeader) return list;
    const pairs = cookieHeader.split(';');
    for (const pair of pairs) {
      const [key, ...vals] = pair.trim().split('=');
      if (key) {
        list[key] = decodeURIComponent(vals.join('='));
      }
    }
    return list;
  }

  public logout(token: string): boolean {
    if (!token) return false;
    const rawId = token.includes('.') ? token.split('.')[0] : token;
    return this.sessions.delete(rawId);
  }

  public getOperators(): Operator[] {
    return Array.from(this.operators.values()).map(o => ({
      ...o,
      passwordHash: '[PROTECTED]'
    }));
  }

  public createOperator(data: { username: string; name: string; password?: string; role: OperatorRole }): Operator {
    const id = `op_${crypto.randomBytes(8).toString('hex')}`;
    const rawPassword = data.password || crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(rawPassword);
    const op: Operator = {
      id,
      username: data.username,
      name: data.name,
      passwordHash,
      role: data.role || 'MODERATOR',
      status: 'ACTIVE',
      createdAt: new Date().toISOString()
    };
    this.operators.set(id, op);
    return { ...op, passwordHash: '[PROTECTED]' };
  }

  public updateOperator(id: string, updates: Partial<Operator> & { password?: string }): Operator | null {
    const op = this.operators.get(id);
    if (!op) return null;

    if (updates.name) op.name = updates.name;
    if (updates.role) op.role = updates.role;
    if (updates.status) op.status = updates.status;
    if (updates.password) {
      op.passwordHash = this.hashPassword(updates.password);
    }
    this.operators.set(id, op);
    return { ...op, passwordHash: '[PROTECTED]' };
  }

  public deleteOperator(id: string): boolean {
    // Cannot delete last super admin
    const op = this.operators.get(id);
    if (op?.role === 'SUPER_ADMIN') {
      const superAdmins = Array.from(this.operators.values()).filter(o => o.role === 'SUPER_ADMIN' && o.status === 'ACTIVE');
      if (superAdmins.length <= 1) {
        return false; // must keep at least 1 superadmin
      }
    }
    // Revoke sessions
    for (const [rawId, sess] of this.sessions.entries()) {
      if (sess.operatorId === id) {
        this.sessions.delete(rawId);
      }
    }
    return this.operators.delete(id);
  }
}

export const authManager = new AuthManager();
