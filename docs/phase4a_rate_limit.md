# Phase 4A: Production Hardening & Global Per-User Rate Limiting

## Overview
Phase 4A introduces a robust, memory-efficient, global per-user sliding-window rate limiter for the Roxie Telegram Bot. This layer protects the bot's message-processing pipeline and command interface against high-frequency abuse, message spam, and command flooding without interfering with group-specific moderation features like `/flood`.

---

## Key Features & Architecture

### 1. Sliding-Window Rate Limiting (`server/telegram/rateLimiter.ts`)
- **Key Isolation**: Tracked per chat and per user (`chatId:userId`), ensuring full multi-group isolation. User activities in Group A do not affect their limits in Group B.
- **Configurable Thresholds**:
  - `windowMs`: 10,000 ms (10 seconds rolling window)
  - `maxMessages`: 25 messages per window
  - `cooldownMs`: 15,000 ms (15 seconds temporary silence/ignore cooldown upon limit violation)
- **Memory Safety**: In-memory storage with automatic stale timestamp pruning, sliding-window filtering, and expiration of cooldowns. Timestamps are **not persisted** to JSON storage, preventing database bloat and memory leaks.

### 2. Differentiated from `/flood`
- **/flood**: Group-configured moderation rule (e.g. `/flood 4 mute`) managed per group settings to punish repeated identical or rapid messages with automated moderation actions (mute, ban, kick).
- **Global Rate Limiter (Phase 4A)**: Low-level system protection against message/command spam across all chats, issuing temporary cooldowns and optional message deletion without triggering permanent bans.

### 3. Admin & Owner Exemption
- Integrates directly with `TelegramMiddleware.resolveActor` and role hierarchy (`OWNER`, `ADMIN`, `ANONYMOUS ADMIN`).
- Group owners and administrators (`actorRank >= RoleRank.MODERATOR`) are automatically exempt from global rate limiting.

### 4. Notification & Spam Prevention
- Guarded by notification cooldowns (`notifiedCooldowns`), ensuring that excessive message senders trigger at most one warning notification per cooldown period rather than flooding the chat with duplicate error messages.

---

## Test Suite (`test/rateLimitTest.ts`)
Covers 20 test vectors (RATE-01 to RATE-20):
- Normal user thresholds
- Sliding window expiration
- Multi-group bucket isolation
- Admin / Owner / Anonymous admin exemptions
- Cooldown behavior and notification spam prevention
- Memory cleanup and non-persistence in storage
- Private chat safety and missing username handling
- Command spam throttling and coexistence with `/flood`
