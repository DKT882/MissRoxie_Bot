# Roxie Bot — Federation Architecture Design Document

**Status:** Proposed Architecture  
**Target:** Phase 3 / Phase 4  
**Author:** DeepMind Roxie Core Architecture Team  

---

## 1. Overview & Problem Statement

Federations allow multiple Telegram groups (such as an alliance of partner communities or a network of gaming/crypto chats) to share a unified banlist and security intelligence. When a malicious actor, spam bot, or compromised account is banned in one federated chat (`/fedban`), that ban automatically propagates to all other groups subscribed to the federation (`fedsubs`).

---

## 2. Core Entities & Data Model

```
   ┌────────────────────────────────────────────────────────┐
   │                       FEDERATION                       │
   │  - id: UUID                                            │
   │  - name: string                                        │
   │  - ownerId: number (Telegram User ID)                  │
   │  - createdAt: ISO Timestamp                            │
   │  - settings: { silentBans, broadcastNotifications }     │
   └─────────────┬───────────────────────────┬──────────────┘
                 │ 1..*                      │ 1..*
                 ▼                           ▼
   ┌───────────────────────────┐   ┌─────────────────────────┐
   │      FEDERATION ADMIN     │   │     FEDERATION CHAT     │
   │  - fedId: UUID            │   │  - fedId: UUID          │
   │  - userId: number         │   │  - chatId: number       │
   │  - role: 'OWNER' | 'ADMIN'│   │  - subscribedBy: number │
   │  - addedAt: ISO Timestamp │   │  - subscribedAt: ISO    │
   └───────────────────────────┘   └─────────────────────────┘
                 │
                 │ issues
                 ▼
   ┌────────────────────────────────────────────────────────┐
   │                    FEDERATION BAN                      │
   │  - id: UUID                                            │
   │  - fedId: UUID                                         │
   │  - targetUserId: number                                │
   │  - adminUserId: number                                 │
   │  - reason: string                                      │
   │  - bannedAt: ISO Timestamp                             │
   └────────────────────────────────────────────────────────┘
```

---

## 3. Command Surface & Roles

### 3.1 Federation Management
- `/newfed <fed_name>`: Create a new federation. Caller becomes the Federation Owner.
- `/delfed <fed_id>`: Delete a federation (Owner only).
- `/fedinfo <fed_id>`: View details, subscriber count, and admin roster.
- `/joinfed <fed_id>`: (Group Owner only) Subscribes the current chat to the federation.
- `/leavefed`: (Group Owner only) Unsubscribes the current chat.

### 3.2 Federation Administration & Bans
- `/fpromote <user>` / `/fdemote <user>`: Add/remove federation admins (Fed Owner only).
- `/fedban <user> [reason]`: Bans the target from the federation. Triggers immediate background worker queue to execute `banChatMember` across all subscribed chats.
- `/fedunban <user>`: Removes the target from the federation banlist and executes `unbanChatMember` across subscribed chats.
- `/fcheck <user>`: Checks whether a user is currently banned in the active chat's federation.

---

## 4. Ban Propagation Engine & Telegram API Resilience

### 4.1 Queue & Rate Limiting Architecture
Telegram imposes strict rate limits on group administrative calls (max ~30 requests/sec across API, ~1 request/sec per chat).
- **Worker Queue:** When `/fedban` is issued, Roxie records the ban record and enqueues background jobs for each subscribed `chatId`.
- **Concurrency & Backoff:** The queue processor dispatches bans in batches with token bucket rate limiting (15 req/sec aggregate) and exponential backoff upon receiving HTTP 429 (`retry_after`).
- **Failure Tolerance:** If a bot is no longer an admin in a subscribed chat, the worker logs `CHAT_PERMISSION_DENIED` and marks the group subscription as inactive after 3 consecutive failures without blocking propagation to other groups.

---

## 5. Security & Privacy Guarantees

1. **Authorization Isolation:**  
   Telegram group admins cannot issue `/fedban` unless they have been explicitly promoted as a Federation Admin (`fpromote`). Group owners cannot modify federation settings unless they own the federation.
2. **Subscribed Group Protection:**  
   Group owners retain sovereignty: they can execute `/leavefed` at any time to instantly detach their group from external ban propagation.
3. **Audit Trail:**  
   Every `/fedban` and `/fedunban` must record the issuing Fed Admin ID, timestamp, target ID, and reason, with broadcast options to a designated federation log channel.
