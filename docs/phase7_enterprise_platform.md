# Roxie Telegram Bot — Phase 7: Enterprise Admin Platform & Real-Time Analytics

## Overview
Phase 7 elevates the Roxie Telegram Group Moderation Bot into a secure, multi-operator enterprise administration platform featuring robust dashboard authentication, operator role-based access control (RBAC), real-time Server-Sent Events (SSE) streaming, advanced global and per-group analytics, group heatmaps, security centers, automated system backups with rollback protection, and correlation ID tracing.

## Architecture & Data Flow
```
React Enterprise Dashboard
       ↓ (HTTP REST + X-Roxie-Request-ID + Session Token)
Enterprise Security Middleware & RBAC
       ↓
Server Services (AuthManager, AnalyticsService, SystemManager, EventStream)
       ↓
Centralized Storage & Telegram Bot API
```

## New Enterprise APIs
- `POST /api/auth/login` - Authenticate operator and establish secure session.
- `POST /api/auth/logout` - Revoke operator session.
- `GET /api/auth/session` - Retrieve active session metadata.
- `GET /api/operators` - List system operators (ADMIN+).
- `POST /api/operators` - Create new operator (SUPER_ADMIN).
- `PUT /api/operators/:id` - Update operator settings/roles.
- `DELETE /api/operators/:id` - Disable or delete operator account.
- `GET /api/events/stream` - Server-Sent Events (SSE) real-time event stream.
- `GET /api/analytics/global` - Global moderation metrics and totals across connected groups.
- `GET /api/analytics/trends` - Time-series moderation trend aggregation.
- `GET /api/analytics/groups/:chatId/health` - Group health scoring and diagnostic breakdown.
- `GET /api/analytics/heatmap` - Day of week x hour of day moderation activity heatmap.
- `GET /api/analytics/commands` - Command execution frequency and success rates.
- `GET /api/system/status` - Telegram polling, bot permissions, and system resource monitor.
- `GET /api/system/backups` - List system state backups.
- `POST /api/system/backups` - Create secure state backup (stripping secrets).
- `POST /api/system/backups/:id/restore` - Restore backup with mandatory rollback protection and confirmation phrase.
- `GET /api/system/export` - Export logs, settings, and analytics in JSON or CSV.

## Security & Compliance
1. **Password Hashing**: Scrypt cryptographic salt-and-hash with timing-safe comparison.
2. **Request Correlation**: `X-Roxie-Request-ID` attached to all requests for end-to-end audit tracing.
3. **Backup Rollback**: State restoration automatically generates a prior rollback backup to prevent catastrophic data loss.
4. **Group Isolation**: Multi-operator actions strictly enforce group boundaries and role hierarchies.
