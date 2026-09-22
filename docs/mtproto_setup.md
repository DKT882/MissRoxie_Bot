# Telegram MTProto Configuration Guide for MissRoxie_Bot

This document explains how to set up and configure Telegram's MTProto client to enable **True Full Telegram Member Enumeration for `/all`** using Roxie's native bot identity.

---

## 1. Why MTProto is Required

Telegram's Bot API (HTTP) does not provide a method to retrieve non-admin members of a supergroup (`getChatAdministrators` only returns administrators, and bots only observe members who join, message, or interact).

By pairing the primary Bot API bot with a dedicated, on-demand **MTProto Participant Service** (using GramJS), Roxie calls `channels.getParticipants` directly to enumerate all supergroup members (e.g. 537 members → ~54 batches of 10 emoji mentions), including silent users who have never messaged Roxie.

The primary Bot API bot continues handling all updates, polling, moderation, and command dispatch without interruption.

---

## 2. Obtaining Telegram API Credentials

1. Log in to [https://my.telegram.org](https://my.telegram.org) with your Telegram account.
2. Navigate to **API development tools**.
3. Create a new application (if you have not already):
   - **App title**: e.g., `MissRoxieMTProto`
   - **Short name**: e.g., `roxie_mtproto`
   - **Platform**: Other
4. Copy the resulting:
   - `api_id` (an integer, e.g. `12345678`)
   - `api_hash` (a 32-character hexadecimal string, e.g. `0123456789abcdef0123456789abcdef`)

---

## 3. Bot Identity Authentication (No Personal Account Required)

Roxie's MTProto service authenticates directly as `@MissRoxie_Bot` via Telegram MTProto's `auth.importBotAuthorization` using your existing `TELEGRAM_BOT_TOKEN`.

* **No personal phone number login required.**
* **No OTP verification codes required.**
* **No 2FA cloud password required.**
* **`TELEGRAM_MT_PROTO_SESSION` is NOT required for `/all`.**
* The developer's personal account is never required to join or stay in groups.

---

## 4. Production Environment Configuration (Render)

Ensure the following environment variables are set in your Render Dashboard (**Dashboard → Service → Environment Variables**):

| Variable Name | Type | Description |
| :--- | :--- | :--- |
| `TELEGRAM_BOT_TOKEN` | String | Your Telegram Bot Token from `@BotFather` |
| `TELEGRAM_API_ID` | Integer | Your Telegram App API ID from `my.telegram.org` |
| `TELEGRAM_API_HASH` | String | Your Telegram App API Hash from `my.telegram.org` |

> [!WARNING]
> **Security Notice:**
> - Never commit `TELEGRAM_BOT_TOKEN` or `TELEGRAM_API_HASH` to git repositories.
> - Roxie's logging subsystem is hardened to never output or leak bot tokens, session strings, or API hashes in debug logs.

---

## 5. Supergroup Permissions & Telegram Visibility Rules

To enumerate members in a supergroup:

1. **Roxie Presence**: `@MissRoxie_Bot` must be present in the target supergroup.
2. **Administrator Privileges**: Telegram MTProto requires that bots calling `channels.getParticipants` must be an **Administrator** in the supergroup.
   - If Roxie is not an admin, Telegram returns `CHAT_ADMIN_REQUIRED` and Roxie will notify:
     `❌ Roxie needs administrator access in this supergroup to enumerate its members.`
3. **Hidden Members ("Hide Members" setting)**:
   - When a supergroup enables "Hide Members", Telegram permits group administrators (including `@MissRoxie_Bot`) to view and enumerate all members.
4. **Basic Group Chats**:
   - Telegram MTProto participant enumeration is supported on supergroups/channels (`-100...` IDs). Basic groups must be converted to supergroups.

---

## 6. Verification & Diagnostics

Once deployed:

1. Send `/all status` in any supergroup:
   - Roxie will report the active member source (`MTProto Enumeration (Full)`), eligible member count, and estimated message batches.
2. Send `/all` or `/all [custom message]`:
   - Roxie enumerates all group participants in memory, deduplicates by Telegram ID, excludes bots/Roxie/deleted accounts, and broadcasts emoji-only mentions in sequential 10-user batches.
