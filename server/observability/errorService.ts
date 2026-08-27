import crypto from 'crypto';

export type ErrorSeverity = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type ErrorSource = 'TELEGRAM' | 'COMMAND' | 'STORAGE' | 'SCHEDULER' | 'AUTH' | 'DASHBOARD' | 'SSE' | 'SYSTEM' | 'AI';

export interface SystemErrorRecord {
  id: string;
  timestamp: string;
  requestId?: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  chatId?: number;
  operatorId?: string;
  command?: string;
  telegramErrorCode?: string;
}

class ErrorTrackerService {
  private errors: SystemErrorRecord[] = [];
  private maxErrors: number = 1000;

  public recordError(params: {
    source: ErrorSource;
    severity: ErrorSeverity;
    message: string;
    stack?: string;
    requestId?: string;
    chatId?: number;
    operatorId?: string;
    command?: string;
    telegramErrorCode?: string;
  }): SystemErrorRecord {
    // Sanitize message / stack to never leak secrets
    const cleanMessage = this.sanitize(params.message);
    const cleanStack = params.stack ? this.sanitize(params.stack) : undefined;

    const record: SystemErrorRecord = {
      id: `err_${crypto.randomBytes(6).toString('hex')}`,
      timestamp: new Date().toISOString(),
      requestId: params.requestId,
      source: params.source,
      severity: params.severity,
      message: cleanMessage,
      stack: cleanStack,
      chatId: params.chatId,
      operatorId: params.operatorId,
      command: params.command,
      telegramErrorCode: params.telegramErrorCode
    };

    this.errors.unshift(record);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }
    return record;
  }

  public getErrors(filter?: {
    severity?: ErrorSeverity;
    source?: ErrorSource;
    search?: string;
    limit?: number;
    offset?: number;
  }): { errors: SystemErrorRecord[]; total: number } {
    let list = [...this.errors];

    if (filter?.severity && filter.severity !== ('ALL' as any)) {
      list = list.filter(e => e.severity === filter.severity);
    }
    if (filter?.source && filter.source !== ('ALL' as any)) {
      list = list.filter(e => e.source === filter.source);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(e => e.message.toLowerCase().includes(q) || (e.command && e.command.toLowerCase().includes(q)));
    }

    const total = list.length;
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    const paginated = list.slice(offset, offset + limit);

    return { errors: paginated, total };
  }

  private sanitize(text: string): string {
    if (!text) return '';
    return text
      .replace(/bot\d+:[a-zA-Z0-9_-]+/g, 'bot[TOKEN_REDACTED]')
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [TOKEN_REDACTED]')
      .replace(/password['"]?\s*[:=]\s*['"][^'"]+['"]/gi, 'password: "[REDACTED]"');
  }
}

export const errorTracker = new ErrorTrackerService();
