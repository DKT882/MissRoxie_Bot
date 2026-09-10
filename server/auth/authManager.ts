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
  sessionId: string;
  operatorId: string;
  username: string;
  role: OperatorRole;
  expiresAt: number;
  createdAt: string;
}

class AuthManager {
  private operators: Map<string, Operator> = new Map();
  private sessions: Map<string, OperatorSession> = new Map();

  constructor() {
    this.initDefaultOperator();
  }

  private initDefaultOperator() {
    // Create default superadmin if none exist
    const defaultId = 'op-super-1';
    const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
    if (!this.operators.has(defaultId)) {
      const defaultPassword = process.env.ADMIN_PASSWORD?.trim() || 'RoxieAdmin2026!';
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

  public authenticate(username: string, pass: string): { operator?: Operator; session?: OperatorSession; error?: string } {
    const op = Array.from(this.operators.values()).find(
      o => o.username.toLowerCase() === username.toLowerCase() && o.status === 'ACTIVE'
    );
    if (!op || !this.verifyPassword(pass, op.passwordHash)) {
      return { error: 'Invalid username or password' };
    }

    op.lastLogin = new Date().toISOString();
    op.lastActivity = op.lastLogin;

    const sessionId = `sess_${crypto.randomBytes(24).toString('hex')}`;
    const expiresAt = Date.now() + 86400000; // 24 hours
    const session: OperatorSession = {
      sessionId,
      operatorId: op.id,
      username: op.username,
      role: op.role,
      expiresAt,
      createdAt: new Date().toISOString()
    };

    this.sessions.set(sessionId, session);
    return { operator: op, session };
  }

  public getSession(sessionId?: string): OperatorSession | null {
    if (!sessionId) return null;
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    session.expiresAt = Date.now() + 86400000; // rolling 24h
    return session;
  }

  public logout(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  public getOperators(): Operator[] {
    return Array.from(this.operators.values()).map(o => ({
      ...o,
      passwordHash: '[PROTECTED]'
    }));
  }

  public createOperator(data: { username: string; name: string; password?: string; role: OperatorRole }): Operator {
    const id = `op_${crypto.randomBytes(8).toString('hex')}`;
    const passwordHash = this.hashPassword(data.password || 'RoxieOperator2026!');
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
    for (const [sessId, sess] of this.sessions.entries()) {
      if (sess.operatorId === id) {
        this.sessions.delete(sessId);
      }
    }
    return this.operators.delete(id);
  }
}

export const authManager = new AuthManager();
