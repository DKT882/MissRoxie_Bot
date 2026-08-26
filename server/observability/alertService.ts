import crypto from 'crypto';

export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type AlertType = 'TELEGRAM_DISCONNECTED' | 'STORAGE_ERROR' | 'HIGH_MEMORY' | 'API_ERRORS_EXCESSIVE' | 'COMMAND_FAILURES' | 'SCHEDULER_FAILURE' | 'AUTH_FAILURES_EXCESSIVE' | 'RATE_LIMIT_SPIKE';

export interface SystemAlert {
  alertId: string;
  severity: AlertSeverity;
  type: AlertType;
  message: string;
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  status: AlertStatus;
  operatorId?: string;
}

class AlertManagerService {
  private alerts: SystemAlert[] = [];

  public createAlert(params: {
    severity: AlertSeverity;
    type: AlertType;
    message: string;
  }): SystemAlert {
    // Check if an open alert of this type already exists
    const existing = this.alerts.find(a => a.type === params.type && a.status === 'OPEN');
    if (existing) {
      existing.message = params.message;
      existing.createdAt = new Date().toISOString();
      return existing;
    }

    const alert: SystemAlert = {
      alertId: `alt_${crypto.randomBytes(6).toString('hex')}`,
      severity: params.severity,
      type: params.type,
      message: params.message,
      createdAt: new Date().toISOString(),
      status: 'OPEN'
    };

    this.alerts.unshift(alert);
    return alert;
  }

  public getAlerts(status?: AlertStatus): SystemAlert[] {
    if (status) {
      return this.alerts.filter(a => a.status === status);
    }
    return [...this.alerts];
  }

  public acknowledgeAlert(alertId: string, operatorId: string): boolean {
    const alert = this.alerts.find(a => a.alertId === alertId);
    if (!alert) return false;
    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedAt = new Date().toISOString();
    alert.operatorId = operatorId;
    return true;
  }

  public resolveAlert(alertId: string, operatorId: string): boolean {
    const alert = this.alerts.find(a => a.alertId === alertId);
    if (!alert) return false;
    alert.status = 'RESOLVED';
    alert.resolvedAt = new Date().toISOString();
    alert.operatorId = operatorId;
    return true;
  }
}

export const alertManager = new AlertManagerService();
