# Roxie Telegram Bot — Phase 6: Live Operations & Control Center

## Overview
Phase 6 transforms the Roxie Telegram Group Moderation Bot dashboard into a secure, fully featured **Live Operations Center**. Authorized administrators can now execute real-time moderation actions, configure content policies, manage filters, trusted users, reports, security settings (CAPTCHA / Anti-Raid), automations, and run commands from the dashboard interface with enterprise-grade authorization and audit logging.

## Architecture & Data Flow
```
React Dashboard (Operations UI)
       ↓ (HTTP REST API + Actor Headers)
Centralized Authorization Middleware
       ↓ (Validates chatId, Actor Role, Bot Permissions, Hierarchy Protection)
Existing Roxie Services (ModerationService, ContentPolicyEngine, Scheduler)
       ↓
Telegram Bot API
       ↓
Telegram Group
```

## API Endpoints
- `POST /api/groups/:chatId/actions/ban` - Ban user with duration, reason, and message purging.
- `POST /api/groups/:chatId/actions/kick` - Kick user from group.
- `POST /api/groups/:chatId/actions/mute` - Restrict/mute user permissions.
- `POST /api/groups/:chatId/actions/unmute` - Restore user messaging permissions.
- `POST /api/groups/:chatId/actions/warn` - Issue warning, tracking threshold and auto-punishment.
- `POST /api/groups/:chatId/actions/promote` - Promote member to admin with customized permissions.
- `POST /api/groups/:chatId/actions/demote` - Revoke admin privileges.
- `POST /api/groups/:chatId/actions/lock` - Lock content categories (links, stickers, media, polls, etc.).
- `POST /api/groups/:chatId/actions/unlock` - Unlock content categories.
- `POST /api/groups/:chatId/actions/filter` - Add or update custom word/phrase filters.
- `DELETE /api/groups/:chatId/actions/filter/:keyword` - Remove custom filter.
- `POST /api/groups/:chatId/actions/free` - Grant trusted exemption to user.
- `DELETE /api/groups/:chatId/actions/free/:userId` - Revoke trusted exemption.
- `GET /api/groups/:chatId/reports` - Retrieve pending report queue.
- `POST /api/groups/:chatId/reports/:id/action` - Action reported items (dismiss, warn, mute, kick, ban).
- `GET /api/groups/:chatId/security` - Retrieve CAPTCHA and Anti-Raid settings & metrics.
- `POST /api/groups/:chatId/security/antiraid` - Configure Anti-Raid triggers.
- `POST /api/groups/:chatId/security/captcha` - Configure CAPTCHA verification challenges.
- `GET /api/groups/:chatId/automations` - List scheduled automations.
- `POST /api/groups/:chatId/automations` - Schedule announcements/actions.
- `DELETE /api/groups/:chatId/automations/:id` - Cancel automation task.
- `POST /api/groups/:chatId/actions/command-console` - Parse and execute text commands securely.

## Safety & Authorization Model
1. **Group Context**: Explicit `chatId` required for all mutations. "All Groups" context restricts operations to read-only aggregate views.
2. **Hierarchy Protection**: Safeguards group owners, higher-ranking administrators, the bot itself, and self-targeting attempts.
3. **Audit Logging**: Every mutation records an audit entry with `source: 'DASHBOARD'`, actor ID, username, role, target ID, action, and Telegram API result.
4. **Action Confirmations**: Destructive operations require modal confirmation dialogues and explicit confirmation phrases for sensitive actions (e.g., config import).
