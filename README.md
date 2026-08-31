<div align="center">

🤖 ROXIE

Your Group's Smartest Friend & Moderator

AI-powered Telegram moderation, protection, and conversation — built as one bot.

<br>






<br>

Clean groups. Smarter moderation. Natural conversations.

<br>

Created by DKT • Dharmender Kumar

GitHub • LinkedIn

</div>

✨ What is Roxie?

Roxie is a custom Telegram bot designed to combine serious group moderation with a more human-like conversational experience.

Instead of using one bot for moderation, another for anti-spam, another for media protection, and another for AI chat, Roxie brings these capabilities together.

                         🤖 ROXIE
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       🛡️ MODERATION     🔒 PROTECTION      💬 AI CHAT
          │                 │                 │
     Warn / Ban         Spam / Abuse      Hindi
     Kick / Clear      Links / Files     English
     Promote           Stickers / GIFs   Hinglish
     Demote            Images            Personality
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                    👥 TELEGRAM GROUP

🔒 Roxie is proprietary software.

The bot can be publicly used through Telegram, but the source code is not open source and may not be copied, redistributed, modified, or self-hosted without written permission.

🚀 Why Roxie?

Most Telegram bots focus on one area.

Typical Bot

Roxie

Moderation only

🛡️ Moderation + AI

Basic spam filter

🧠 Multi-signal protection

Fixed responses

💬 Hindi + English + Hinglish

Generic settings

🎯 Group-specific policies

One global state

🔐 User + group isolation

Lots of bot messages

🧹 Clean moderation flow

Separate media bots

🔒 Unified content protection

Basic commands

⚙️ Role-aware permissions

Roxie's idea

Moderation should be powerful without making the group feel like a machine.

🌟 Features

🛡️ Smart Moderation

Warn members

Kick members

Ban members

Promote / demote members

Clear messages

Moderator-only actions

Telegram permission validation

🔒 Content Protection

Spam detection

Promotion / advertisement filtering

Abuse-word filtering

Custom abuse lists

Link protection

Sticker protection

Image protection

File protection

GIF protection

🧹 Clean Chat

Roxie is designed to keep moderation actions quiet.

User sends blocked sticker
        ↓
     🗑️ DELETE
        ↓
      DONE

Instead of filling the group with unnecessary:

⚠️ Sticker deleted!
⚠️ Warning!
⚠️ Policy violation!

The moderation flow can remain clean.

🆓 Trusted Member Exceptions

Administrators can use /free to give trusted members exceptions from configured content restrictions.

Normal members
     ↓
Protected content blocked

Trusted member
     ↓
/free
     ↓
Allowed according to policy

💬 Multilingual AI

Roxie understands:

🇬🇧 English
🇮🇳 Hindi
🔀 Hinglish / mixed language

Example:

User:
kaisi ho roxie?

Roxie:
Main badhiya hoon 😄 tum batao?

User:
कैसी हो रोक्सी?

Roxie:
मैं बढ़िया हूँ 😊 तुम बताओ?

User:
Hey Roxie, how are you?

Roxie:
I'm good 😄 How about you?

😏 Personality Layer

When enabled by the group's configuration, Roxie can use a playful conversational personality.

It can detect terms such as:

bro
brooo
brother
bruh
dude

bhai
bhaiii
bhaiya
bhaisaab

भाई
भैया
भाईसाहब

It can normalize repeated characters:

brooo  → bro
bhaiii → bhai

and avoid unrelated words such as:

problem
brown
broadcast
broken

📈 Lust Mode

Roxie includes a configurable non-explicit adult playful personality mode.

Level 0  → Normal
Level 1  → Light teasing
Level 2  → Couple-oriented
Level 3  → Stronger romantic teasing
Level 4  → Highest configured playful level

The level is tracked per:

GROUP + USER

So one user's conversational state does not automatically become another user's state.

📋 Command Center

🟢 General

Command

Syntax

Who can use

/start

/start

Everyone in DM

/help

/help

Everyone

🛡️ Moderation

Command

Syntax

Permission

/warn

Reply → /warn

Moderator / Admin

/kick

Reply → /kick

Moderator / Admin

/ban

Reply → /ban

Moderator / Admin

/promote

Reply → /promote

Admin + Telegram rights

/demote

Reply → /demote

Admin + Telegram rights

/clear

/clear

Moderator / Admin

Example

User:
Please stop spamming.

Admin:
 /warn

Roxie targets the replied-to user rather than the administrator.

🔒 Content Protection Commands

Command

Syntax

Purpose

/sticker

/sticker on/off

Sticker protection

/link

/link on/off

Link protection

/image

/image on/off

Image protection

/file

/file on/off

File protection

/gif

/gif on/off

GIF protection

Example

/sticker on
/link on
/file on

Once enabled, Roxie applies the corresponding group policy.

🆓 Permission Exceptions

Command

Syntax

Purpose

/free

Reply → /free

Give member an exception

/unfree

Reply → /unfree

Remove exception

Example

Admin replies to member:

/free

The member is added to the configured exception policy.

📝 Custom Abuse Filter

Roxie allows each group to maintain its own custom abuse vocabulary.

Command

Syntax

/addabuse

/addabuse <word>

/removeabuse

/removeabuse <word>

/listabuse

/listabuse

/clearabuse

/clearabuse

Example

/addabuse exampleword

Remove:

/removeabuse exampleword

View:

/listabuse

Clear:

/clearabuse

/clearabuse can use an interactive confirmation step to prevent accidental deletion.

🌊 Anti-Flood

Enable

/flood on

Disable

/flood off

Roxie can detect rapid repeated activity according to the group's configured flood policy.

Permission: Moderator / Administrator.

🐢 Slow Mode

Syntax

/slowmode <duration>

Examples

/slowmode 10s
/slowmode 30s
/slowmode 1m

Permission: Administrator + required Telegram rights.

📢 /say — Clean Announcements

Send a moderator announcement:

/say Group meeting at 7 PM.

Roxie can remove the admin's command message and publish the announcement cleanly.

🎯 Reply-Aware /say

This is one of Roxie's cleaner communication features.

User message

User 1:
Hello everyone!

Admin replies

/say Hello User 1

Roxie

Roxie sends:

Hello User 1

as a reply to User 1's original message.

User 1: Hello everyone!
             │
             └──────► 🤖 Roxie: Hello User 1

👥 /all — Mention Everyone

Syntax

/all

or:

/all <message>

Example

/all Important announcement for everyone!

Roxie creates clickable Telegram mentions for known group members.

For large groups, the message can be automatically split to respect Telegram limits.

The admin's /all command can also be cleaned from the chat.

😏 Lust Commands

Command

Syntax

Purpose

/lust

/lust on/off

Enable / disable Lust Mode

/lustmode

/lustmode on/off

Alternate Lust Mode command

Example

/lust on

Disable:

/lust off

Disabling Lust Mode resets the relevant group lust state according to the implementation.

💬 DM vs Group

Roxie behaves differently depending on where it is used.

👤 Private DM

Typical DM flow:

User
 │
 ▼
/start
 │
 ▼
Roxie
 │
 ▼
Normal conversation

The conversational layer can respond in:

English
Hindi
Hinglish

Group-management commands do not become ordinary DM moderation commands.

👥 Group

In groups Roxie acts primarily as:

          GROUP
            │
      ┌─────┴─────┐
      ▼           ▼
 Moderation    Conversation
      │           │
      ▼           ▼
Protection    AI Personality

Group configuration and user state are isolated by group.

🔐 Permission System

Roxie uses both its own authorization logic and Telegram's administrative permissions.

                  Command
                     │
                     ▼
              Who sent it?
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
       Member              Moderator/Admin
          │                     │
          ▼                     ▼
       Reject             Permission Check
                                │
                                ▼
                         Telegram Rights
                                │
                     ┌──────────┴──────────┐
                     ▼                     ▼
                   Allow                 Reject

Simplified permission matrix

Feature

Member

Moderator

Admin

DM /start

✅

✅

✅

/help

✅

✅

✅

AI conversation

✅

✅

✅

/warn

❌

✅

✅

/kick

❌

✅

✅

/ban

❌

✅

✅

/promote

❌

⚠️

✅

/demote

❌

⚠️

✅

/clear

❌

✅

✅

Protection toggles

❌

✅

✅

/free

❌

✅

✅

Abuse management

❌

✅

✅

/flood

❌

✅

✅

/slowmode

❌

⚠️

✅

/say

❌

✅

✅

/all

❌

✅

✅

/lust

Configurable

Configurable

Configurable

⚠️ = Telegram may require higher administrative privileges.

🧠 How Smart Protection Works

Roxie does not rely on a single rule.

Incoming Message
       │
       ▼
Message Classification
       │
 ┌─────┼──────────┬──────────┐
 ▼     ▼          ▼          ▼
Spam  Promo      Abuse      Media
 │     │          │          │
 └─────┴──────────┴──────────┘
               │
               ▼
        Group Policy Check
               │
               ▼
       Exception Check (/free)
               │
               ▼
        Allow / Delete / Log

The system can combine multiple signals before deciding what to do.

🧩 Group-Specific Configuration

Roxie is designed around per-group configuration.

For example:

GROUP A
├── Sticker protection: ON
├── Link protection: ON
├── Flood protection: ON
└── Custom abuse words: 12

GROUP B
├── Sticker protection: OFF
├── Link protection: ON
├── Flood protection: OFF
└── Custom abuse words: 4

One group's configuration should not silently affect another group.

🔐 Isolation

Roxie's conversational state uses a group + user scope.

Group A
 ├── User 101 → Level 3
 └── User 102 → Level 1

Group B
 ├── User 101 → Level 0
 └── User 202 → Level 2

This prevents intentional cross-group state leakage.

🧪 Testing & Reliability

The project contains dedicated test coverage for major systems, including:

✓ Security
✓ Moderation
✓ Permission handling
✓ Message cleanup
✓ Content protection
✓ Custom abuse rules
✓ Custom stickers
✓ Conversational behavior
✓ Language detection
✓ Brother-zone detection
✓ Lust levels
✓ User isolation
✓ Group isolation
✓ Edge cases

Development checks:

npm run lint
npm test
npm run build

🏗️ Architecture

                         TELEGRAM
                            │
                ┌───────────┴───────────┐
                │                       │
               DM                     GROUP
                │                       │
                └───────────┬───────────┘
                            ▼
                     ┌─────────────┐
                     │    ROXIE    │
                     │ Telegram Bot│
                     └──────┬──────┘
                            │
                 ┌──────────┴──────────┐
                 ▼                     ▼
          🛡️ Moderation          💬 Conversation
                 │                     │
        ┌────────┼────────┐      ┌─────┼─────┐
        ▼        ▼        ▼      ▼     ▼     ▼
      Spam     Media    Abuse  Hindi English AI
                 │                     │
                 └──────────┬──────────┘
                            ▼
                       💾 Storage

🛠️ Technology Stack

Backend

Node.js

TypeScript

Express

dotenv

Frontend / Dashboard

React

Vite

Tailwind CSS

Lucide React

Motion

Build & Development

TypeScript

TSX

ESBuild

Vite

Integrations

Telegram Bot API

AI provider integration

Persistent application storage

📁 Project Structure

MissRoxie_Bot/
│
├── server/
│   ├── db/
│   │   └── storage.ts
│   │
│   └── telegram/
│       ├── commands.ts
│       ├── moderation.ts
│       ├── policyEngine.ts
│       ├── middleware.ts
│       ├── telegram.ts
│       ├── types.ts
│       └── ...
│
├── src/
├── test/
├── package.json
├── README.md
└── LICENSE

⚙️ Development

Only authorized developers should access or deploy the proprietary source.

Install dependencies:

npm install

Development:

npm run dev

Type check:

npm run lint

Tests:

npm test

Production build:

npm run build

Production:

npm start

These commands are provided for authorized development only. They do not grant anyone permission to obtain, copy, deploy, modify, or redistribute Roxie's source code.

🔒 Security Rules

Never commit:

.env
BOT_TOKEN
AI_API_KEY
DATABASE_URL
private credentials

Use environment variables on the server.

Telegram
    │
    ▼
Roxie Backend
    │
    ├── AI
    ├── Database
    └── Telegram API

Private credentials should remain server-side.

🌐 Public Bot. Private Code.

Roxie follows a simple distribution model:

                    ROXIE
                      │
          ┌───────────┴───────────┐
          ▼                       ▼
    TELEGRAM SERVICE          SOURCE CODE
          │                       │
       PUBLIC                   PRIVATE
          │                       │
     Anyone can use         Owner / authorized
                            contributors only

You can:

✅ Use Roxie through Telegram

✅ Add Roxie to eligible groups

✅ Chat with Roxie

✅ Use available group features

✅ Configure supported moderation policies

You cannot, without written permission:

❌ Copy the source

❌ Publish the source

❌ Redistribute the source

❌ Modify the source

❌ Self-host the proprietary implementation

❌ Sell the source

❌ Create a competing bot from the source

❌ Remove ownership notices

❌ Rebrand a copy as official Roxie

Using Roxie ≠ owning Roxie.

📜 License

Roxie is licensed under a custom Proprietary Software License.

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

Roxie is NOT open source.

See LICENSE for the complete license.

👨‍💻 Creator

<div align="center">

DKT • Dharmender Kumar

Creator & Copyright Owner of Roxie

<br>




</div>

⚠️ Disclaimer

Roxie is an independently developed Telegram bot.

Telegram and related trademarks belong to their respective owners. Roxie is not an official Telegram product.

Third-party libraries, APIs, frameworks, AI services, and other dependencies remain subject to their respective licenses and terms.

<div align="center">

🤖 ROXIE

Smarter moderation. Cleaner groups. More natural conversations.

<br>

Built with ❤️ by DKT

© 2026 Dharmender Kumar — All Rights Reserved.

🔒 PROPRIETARY • NOT OPEN SOURCE

</div>
