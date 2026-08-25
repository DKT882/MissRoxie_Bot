# Roxie Bot — Phase 3 Architecture & Feature Gap Audit

**Date:** 2026-08-25  
**Version:** 3.0.0-audit  
**Scope:** Architecture Review, Feature Matrix against MissRose, Gap Analysis, Technical Debt, and Implementation Plan.

---

## 1. Codebase Architecture Overview

### 1.1 Project Structure
- **Backend Runtime:** Node.js (v22+) + TypeScript (`tsx` in development, `esbuild` CommonJS compilation for production).
- **Web Framework:** Express 4.21 with static/SPA serving.
- **Telegram Bot Client:** Native Telegram Bot API client (`/server/telegram/api.ts`) using standard HTTPS `fetch` calls, supporting long polling (`getUpdates`), full admin permission editing, chat member management, and error mapping.
- **Data Persistence:** File-based JSON storage (`/data/bot_storage.json`) managed by `StorageManager` (`/server/db/storage.ts`) with in-memory caching and debounced atomic write-back.
- **Middleware & Security:** Centralized actor and target resolution pipeline (`/server/telegram/middleware.ts`) enforcing a strict 10-role permission hierarchy with Telegram native permission negotiation.
- **Moderation Engine:** Real-time message interceptor (`/server/telegram/moderation.ts`) handling flood, locks, links, filters, and dynamic greetings.
- **Command Router:** Dispatcher (`/server/telegram/commands.ts`) routing all slash commands with command aliases and interactive callback query support.
- **Testing Framework:** Pure TypeScript/Node test suites (`/test/`) verifying security, moderation, permission editor, message clear/purge, reports, and real API integrations.

---

## 2. Existing Phase 2 Systems & Status

| Subsystem | File Location | Status | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **API Client** | `/server/telegram/api.ts` | Complete | `getMe`, `sendMessage`, `restrictChatMember`, `banChatMember`, `promoteChatMember`, `setChatPermissions`, `deleteMessages` |
| **Actor Resolution** | `/server/telegram/middleware.ts` | Complete | Ranks `OWNER (100)`, `ADMIN (80)`, `MODERATOR (50)`, `MEMBER (10)`, `BOT (0)`. Anonymous admin resolution. |
| **Target Resolution** | `/server/telegram/middleware.ts` | Complete | Priority: 1. Explicit Numeric ID / 2. Explicit `@username` / 3. Replied Message / 4. Group cache. |
| **Interactive Permissions** | `/server/telegram/commands.ts` | Complete | `/permissions` UI with inline keyboard toggles, stale-state detection, confirmation dialogs, and save commit. |
| **Granular `/free`** | `/server/telegram/moderation.ts` | Complete | Exemptions for `stickers`, `photos`, `videos`, `gifs`, `voice`, `audio`, `files`, `links`, `all`. |
| **Greetings** | `/server/telegram/moderation.ts` | Complete | HTML templating with `{first_name}`, `{last_name}`, `{name}`, `{user}`, `{username}`, `{mention}`, `{chat_title}`, `{id}`. |
| **Anti-Flood** | `/server/telegram/moderation.ts` | Complete | Message count / window tracker with mute/kick/ban actions. |
| **Message Purging** | `/server/telegram/commands.ts` | Complete | `/clear <duration\|count>` and `/purge` range deletion with in-memory ring buffer tracking. |
| **Reports** | `/server/telegram/commands.ts` | Complete | `/report` and `@admin` pinging with rate limits and private chat rejection. |

---

## 3. MissRose Feature Gap Matrix

| Feature Module | MissRose Reference | Roxie Current Status | Gap / Required Evolution |
| :--- | :--- | :--- | :--- |
| **Locks / Content Policy** | Full lock system (20+ types) | `PARTIALLY IMPLEMENTED` | Currently handled via individual ad-hoc flags. Needs unified `ContentPolicyEngine` with `canSendContent()` checking `locks` + `/free` + `/approve`. |
| **Warnings** | `/warn`, `/unwarn`, `/warns`, `/resetwarns`, auto-action | `PARTIALLY IMPLEMENTED` | Has `/warn`, `/warnings`, `/resetwarns`. Missing `/unwarn`, configurable threshold actions (`mute`/`kick`/`ban`/`tban`), and warn reason indexing. |
| **Filters / Auto-Response** | Custom trigger-reply filters with reply-saving | `PARTIALLY IMPLEMENTED` | Has basic string filter. Missing reply-based `/filter <trigger>`, word-boundary matching, `/stopall`, ReDoS protection, and chat-isolated filters. |
| **Anti-Raid** | Velocity-based join detection & auto-lockdown | `MISSING` | Need join velocity tracking (X joins in Y sec), temporary raid mode lockdown, admin alerts, `/antiraid` commands. |
| **CAPTCHA / Verification** | Interactive join verification (button/math) | `MISSING` | Need new join restriction, challenge generation, user-bound callback verification, timeout cleanup, `/captcha` commands. |
| **Notes / Knowledge** | `/save <name>`, `/get <name>`, `#notename`, `/notes` | `MISSING` | Need chat-isolated note repository, reply-to-save note content, hashtag triggering `#note`, `/clear <name>`. |
| **Approvals / Trusted** | `/approve`, `/unapprove`, `/approved` | `PARTIALLY IMPLEMENTED` | Need dedicated `approvedUsers` set per chat allowing trusted members to bypass locks and anti-flood without granting admin rights. |
| **Group Configuration** | `/settings`, `/export`, `/import` | `PARTIALLY IMPLEMENTED` | Has `/settings`. Missing `/export` and `/import` for owner backup/restoration with schema validation. |
| **Federations** | Multi-group cross-ban network | `MISSING` (Phase 3 Design) | Must create architectural blueprint `docs/federation_design.md` prior to implementation. |
| **Temporary Actions** | `/tmute`, `/tban` with automatic unrestrict | `IMPLEMENTED` | Tested and working with `processExpiredTempActions()`. |

---

## 4. Technical Debt & Risks

1. **Ad-Hoc Lock Logic in Moderation Interceptor:**  
   Media and link locks were evaluated in separate branches with duplicated exemption checks. Consolidating into `ContentPolicyEngine` eliminates code duplication and ensures new lock types (`contact`, `location`, `poll`, `forward`, `command`, `button`, `invitelink`) are instantly covered.
2. **ReDoS Vulnerability in Filters:**  
   User-configured regexes or complex search patterns must avoid backtracking traps. Strict string-based word matching (`\b...\b`) with escaped special characters is required.
3. **Multi-Group State Leakage:**  
   All new collections (`notes`, `approvedUsers`, `filters`, `raidState`, `captchaSessions`) must strictly index by `chatId`.

---

## 5. Phase 3 Implementation Order

1. **P0: Locks & Content Policy Engine** (`server/telegram/policyEngine.ts`):
   - Generalized `canSendContent(chatId, userId, contentType)`
   - Lock types: `sticker`, `photo`, `video`, `gif`, `audio`, `voice`, `file`, `link`, `contact`, `location`, `poll`, `forward`, `command`, `all`.
   - Commands: `/lock`, `/unlock`, `/locks`, `/locklist`.
   - Exemption layers: Admin/Owner bypass -> Approved User bypass -> `/free` permission bypass -> Lock enforcement.
2. **P1: Warning Engine Strengthening** (`server/telegram/commands.ts` & `server/db/storage.ts`):
   - Add `/unwarn <target>` (removes latest warning).
   - Add `/setwarnaction <ban|mute|kick|warn_only>`.
   - Automated threshold execution with reason and audit logging.
3. **P1: Persistent Filter System** (`server/telegram/commands.ts` & `server/db/storage.ts`):
   - Add `/filter <keyword> <reply>`, `/filter <keyword>` (via reply), `/stop <keyword>`, `/stopall`, `/filters`.
   - Word boundary and exact match detection with chat isolation.
4. **P1: Anti-Raid Engine** (`server/telegram/moderation.ts` & `server/db/storage.ts`):
   - Join velocity detection with automatic temporary raid mode.
   - Admin alert dispatching and `/antiraid` toggle/thresholds.
5. **P1: CAPTCHA / Join Verification** (`server/telegram/moderation.ts` & `server/telegram/commands.ts`):
   - Restrict new joins, issue user-bound interactive challenge, handle callback, auto-timeout cleanup.
   - Commands: `/captcha`, `/captchamode`, `/captchatime`.
6. **P2: Notes System** (`server/telegram/commands.ts` & `server/db/storage.ts`):
   - `/save <name> <text>`, reply-to-save `/save <name>`, `/get <name>`, `#name`, `/notes`, `/delnote <name>`.
7. **P2: Approvals / Trusted Users** (`server/telegram/commands.ts` & `server/db/storage.ts`):
   - `/approve <target>`, `/unapprove <target>`, `/approved`.
8. **P2: Group Configuration Export & Import** (`server/telegram/commands.ts`):
   - `/export` and `/import <json>` with cryptographic and structural validation.
9. **P3: Federation Design Blueprint** (`docs/federation_design.md`).
10. **Comprehensive Verification**:
    - `LOCK-01..XX`, `WARN-01..XX`, `FILTER-01..XX`, `RAID-01..XX`, `CAPTCHA-01..XX`, `NOTE-01..XX`, `APPROVAL-01..XX`.
    - 10-Actor permission verification, Group-A / Group-B isolation tests, and restart persistence test.
