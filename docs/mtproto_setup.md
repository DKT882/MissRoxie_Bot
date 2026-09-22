# Telegram MTProto Configuration Guide for MissRoxie_Bot

This document explains how to set up and configure Telegram's MTProto client session to enable **True Full Telegram Member Enumeration for `/all`**.

---

## 1. Why MTProto is Required

Telegram's Bot API does not provide a method to retrieve all non-admin members of a group or supergroup (`getChatAdministrators` only returns administrators, and bots only observe members who join, message, or interact).

By pairing the primary Bot API bot with a dedicated, on-demand **MTProto Participant Service** (using GramJS), Roxie can call `channels.getParticipants` directly to enumerate all group members (e.g. 537 members → ~54 batches of 10 emoji mentions), including silent users who have never messaged Roxie.

The primary Bot API bot continues handling all updates, polling, moderation, and command dispatch without interruption.

---

## 2. Obtaining Telegram API Credentials

1. Log in to [https://my.telegram.org](https://my.telegram.org) with your Telegram phone number.
2. Navigate to **API development tools**.
3. Create a new application (if you have not already):
   - **App title**: e.g., `MissRoxieMTProto`
   - **Short name**: e.g., `roxie_mtproto`
   - **Platform**: Other
4. Copy the resulting:
   - `api_id` (an integer, e.g. `12345678`)
   - `api_hash` (a 32-character hexadecimal string, e.g. `0123456789abcdef0123456789abcdef`)

---

## 3. Generating the MTProto Session String (One-Time Local Setup)

To allow the bot to connect persistently in non-interactive environments (such as Render) without prompting for OTP codes on every restart, generate an authenticated `StringSession` once locally:

1. Run the local session generator script:
   ```bash
   npx tsx scripts/generateMtprotoSession.ts
   ```
2. Enter your `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` when prompted.
3. Enter your phone number (in international format, e.g. `+1234567890`).
4. Enter the verification code received on Telegram (and your 2FA cloud password if enabled).
5. The script will output your unique `TELEGRAM_MT_PROTO_SESSION` string.

---

## 4. Production Environment Configuration (Render)

Add the following environment variables in your Render Dashboard (**Dashboard → Service → Environment Variables**):

| Variable Name | Type | Description |
| :--- | :--- | :--- |
| `TELEGRAM_API_ID` | Integer | Your Telegram App API ID |
| `TELEGRAM_API_HASH` | String | Your Telegram App API Hash |
| `TELEGRAM_MT_PROTO_SESSION` | String | The persistent string session generated from Step 3 |

> [!WARNING]
> **Security Notice:**
> - Never commit `TELEGRAM_API_HASH` or `TELEGRAM_MT_PROTO_SESSION` to git repositories.
> - Never share your session string; it provides authenticated Telegram access to the session account.
> - Roxie's logging subsystem is hardened to never output or leak session strings or API hashes in debug logs.

---

## 5. Verification & Diagnostics

Once deployed:

1. Send `/all status` in any supergroup:
   - Roxie will report the active member source (`MTProto Enumeration (Full)`), eligible member count, and estimated message batches.
2. Send `/all` or `/all [custom message]`:
   - Roxie enumerates all group participants in memory, deduplicates by Telegram ID, excludes bots/Roxie/deleted accounts, and broadcasts emoji-only mentions in sequential 10-user batches.

### Troubleshooting Telegram Visibility Restrictions

- If a group has **Hidden Members** enabled, Telegram restricts participant access to group administrators.
- If the MTProto account is not an administrator in a hidden-member group, Roxie will report:
  `⚠️ Telegram did not allow Roxie to retrieve the complete member list for this group.`
- Making the MTProto account an administrator in the supergroup grants full member enumeration access.
