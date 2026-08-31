<div align="center">

🤖 Roxie

AI-Powered Telegram Moderation & Conversation

<p>
A powerful, multilingual Telegram bot that combines<br>
<strong>smart moderation • content protection • group tools • AI conversation</strong>
</p>

<br>

<a href="https://t.me/">
<img src="https://img.shields.io/badge/Telegram-Use%20Roxie-2AABEE?style=flat-square&logo=telegram&logoColor=white" alt="Telegram">
</a>
<a href="https://github.com/dkt882">
<img src="https://img.shields.io/badge/GitHub-DKT882-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub">
</a>
<a href="https://www.linkedin.com/in/dkt882">
<img src="https://img.shields.io/badge/LinkedIn-Dharmender%20Kumar-0A66C2?style=flat-square&logo=linkedin&logoColor=white" alt="LinkedIn">
</a>
<img src="https://img.shields.io/badge/License-Proprietary-B91C1C?style=flat-square" alt="Proprietary License">

<br><br>

Built by DKT • Dharmender Kumar

</div>

🧭 Overview

Roxie is a custom Telegram bot built for communities that want strong moderation without turning their group into a wall of bot messages.

It combines traditional Telegram administration with intelligent content filtering and a conversational AI personality.

At a glance

🛡️ Moderate

🔒 Protect

💬 Converse

⚙️ Control

Warn • Kick • Ban

Spam • Abuse

English

Flood

Promote • Demote

Links • Files

Hindi

Slow mode

Clear messages

Stickers • GIFs

Hinglish

/say • /all

✨ What Makes Roxie Different?

Most Telegram communities end up combining several bots:

          Bot A             Bot B             Bot C
        Moderation       Anti-Spam          AI Chat
             \              |                /
              \             |               /
               └────────────┼──────────────┘
                            ▼
                         🤖 ROXIE

Roxie brings these responsibilities into one system while keeping group configuration, permissions, and conversational state isolated.

Roxie's core principles

Powerful moderation. Minimal noise. Natural conversation.

🎯 Group-specific policies

🔐 User + group state isolation

🧹 Automatic cleanup

🧠 Multi-signal content analysis

🌐 English / Hindi / Hinglish

👮 Role-aware permissions

🆓 Trusted-member exceptions

💬 Reply-aware announcements

🧪 Dedicated regression testing

🔒 Proprietary source code

🧩 Feature Map

<details>
<summary><strong>🛡️ Moderation</strong></summary>

<br>

Roxie supports the core moderation actions needed to manage a Telegram community:

Warn

Kick

Ban

Promote

Demote

Clear messages

Moderator/admin authorization

Telegram permission validation

</details>

<details>
<summary><strong>🔒 Smart Content Protection</strong></summary>

<br>

Roxie can protect groups from unwanted content using configurable policies:

Spam detection

Promotion / advertisement filtering

Abuse-word filtering

Custom group abuse lists

Link protection

Sticker protection

Image protection

File protection

GIF protection

Flood protection

</details>

<details>
<summary><strong>💬 AI Conversation</strong></summary>

<br>

Roxie can converse naturally in:

🇬🇧 English

🇮🇳 Hindi

🔀 Hinglish

Mixed Hindi/English messages

The conversational layer detects the language/style of the incoming message and aims to respond in a matching style.

</details>

<details>
<summary><strong>😏 Personality Layer</strong></summary>

<br>

When enabled, Roxie's conversational personality can detect playful triggers such as:

bro • brooo • brother • bruh • dude
bhai • bhaiii • bhaiya • bhaisaab
भाई • भैया • भाईसाहब

Repeated characters can be normalized:

brooo  → bro
bhaiii → bhai

The system is designed to avoid accidental matches against unrelated words such as:

problem • brown • broadcast • broken

Roxie's adult-oriented personality remains non-explicit.

</details>

📋 Commands

Legend: 👤 Member · 🛡️ Moderator · 👑 Administrator

👤 General

Command

Syntax

Permission

What it does

/start

/start

👤 Everyone in DM

Starts Roxie

/help

/help

👤 Everyone

Shows help

🛡️ Moderation

Command

Syntax

Permission

What it does

/warn

Reply + /warn

🛡️ / 👑

Warns a member

/kick

Reply + /kick

🛡️ / 👑

Removes a member

/ban

Reply + /ban

🛡️ / 👑

Bans a member

/promote

Reply + /promote

👑

Promotes a member

/demote

Reply + /demote

👑

Demotes an admin

/clear

/clear

🛡️ / 👑

Clears messages

Example

User:
Stop spamming!

Admin:
 /warn

Roxie uses the replied-to message to identify the target.

🔒 Content Protection

Command

Syntax

Permission

Protection

/sticker

/sticker on/off

🛡️ / 👑

Stickers

/link

/link on/off

🛡️ / 👑

Links

/image

/image on/off

🛡️ / 👑

Images

/file

/file on/off

🛡️ / 👑

Files

/gif

/gif on/off

🛡️ / 👑

GIFs

/flood

/flood on/off

🛡️ / 👑

Flood protection

Example

/sticker on
/link on
/file on
/flood on

When a protected message violates the active policy, Roxie can remove it without unnecessarily flooding the chat with explanation messages.

🆓 Trusted Members

Command

Syntax

Permission

What it does

/free

Reply + /free

🛡️ / 👑

Gives an exception

/unfree

Reply + /unfree

🛡️ / 👑

Removes an exception

Example

Admin → reply to member

/free

The member can receive the configured exception from content restrictions.

📝 Custom Abuse Rules

Command

Syntax

Permission

/addabuse

/addabuse <word>

🛡️ / 👑

/removeabuse

/removeabuse <word>

🛡️ / 👑

/listabuse

/listabuse

🛡️ / 👑

/clearabuse

/clearabuse

🛡️ / 👑

Example:

/addabuse unwantedword

Remove it:

/removeabuse unwantedword

View the current list:

/listabuse

Clear it:

/clearabuse

Clearing the list can require confirmation to prevent accidental removal of all custom rules.

📢 Communication

/say

Send an announcement:

/say Group meeting at 7 PM.

Permission: 🛡️ Moderator / 👑 Administrator

Roxie can clean up the administrator's command message when it has the required Telegram permission.

Reply-aware /say

If an administrator replies to a user's message:

User 1:
Hello everyone!

and sends:

/say Hello User 1

Roxie sends:

User 1:
Hello everyone!

Roxie:
Hello User 1

The announcement is attached to the original user's message.

👥 /all

Mention known members of the current group.

Syntax

/all

or:

/all <message>

Example

/all Important announcement for everyone!

Roxie generates clickable Telegram mentions and can split large mention sets to respect Telegram message-size limits.

Permission: 🛡️ Moderator / 👑 Administrator

🐢 Slow Mode

Syntax

/slowmode <duration>

Examples

/slowmode 10s
/slowmode 30s
/slowmode 1m

Permission: 👑 Administrator + required Telegram rights

The actual accepted values depend on Telegram and the current implementation.

😏 Lust Mode

Command

Syntax

Permission

/lust

/lust on/off

Configurable

/lustmode

/lustmode on/off

Configurable

Example:

/lust on

Disable:

/lust off

Conversational levels

0 ─ Normal
1 ─ Light teasing
2 ─ Couple-oriented
3 ─ Stronger romantic teasing
4 ─ Highest configured playful level

State is scoped to the specific user + group.

🗺️ Group vs DM

👤 Private DM

Roxie can act as a conversational assistant.

/start
   │
   ▼
Hello Roxie!
   │
   ▼
Language detection
   │
   ▼
Hindi / English / Hinglish response

Group-management features are not treated as normal DM conversation commands.

👥 Telegram Group

Inside a group, Roxie can operate as:

                 👥 GROUP
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   🛡️ MODERATION             💬 AI
        │                       │
   ┌────┼────┐            ┌─────┼─────┐
   ▼    ▼    ▼            ▼     ▼     ▼
 Spam Media Abuse        EN    HI   Hinglish

🔐 Permission Model

Roxie checks two layers:

              Command
                 │
                 ▼
          Roxie authorization
                 │
                 ▼
        Telegram admin rights
                 │
          ┌──────┴──────┐
          ▼             ▼
        Allow          Reject

Having permission inside Roxie's own policy does not allow Roxie to bypass Telegram.

For example, /promote can still fail if Telegram has not granted Roxie sufficient administrative rights.

Permission overview

Feature

👤 Member

🛡️ Moderator

👑 Admin

/start / /help

✅

✅

✅

AI conversation

✅

✅

✅

Moderation

❌

✅

✅

Content toggles

❌

✅

✅

/free / /unfree

❌

✅

✅

Abuse management

❌

✅

✅

/say

❌

✅

✅

/all

❌

✅

✅

/slowmode

❌

⚠️

✅

/promote / /demote

❌

⚠️

✅

⚠️ means additional Telegram administrative rights may be required.

🧠 How Roxie Works

Smart protection pipeline

Telegram message
       │
       ▼
Identify group + sender
       │
       ▼
Check permissions / exceptions
       │
       ▼
Analyze message
       │
 ┌─────┼────────┬─────────┐
 ▼     ▼        ▼         ▼
Spam  Promo    Abuse     Media
 └─────┴────────┴─────────┘
               │
               ▼
          Group policy
               │
        ┌──────┴──────┐
        ▼             ▼
      Allow         Delete

Conversation pipeline

Incoming message
       │
       ▼
Normalize
       │
       ▼
Detect language
       │
       ▼
Detect Hinglish / code-switching
       │
       ▼
Detect personality triggers
       │
       ▼
Read group + user state
       │
       ▼
Generate response
       │
       ▼
Store relevant state

🔐 Isolation by Design

Roxie's state is scoped using:

groupId + userId

Example:

GROUP A
├── User 101 → Level 3
└── User 102 → Level 1

GROUP B
├── User 101 → Level 0
└── User 202 → Level 2

A user's state in Group A does not automatically become their state in Group B.

Likewise, one member's state is not intended to become another member's state.

🧹 Clean Chat Philosophy

Roxie tries to act instead of talking about acting.

Traditional moderation flow

User sends sticker
       ↓
Bot deletes sticker
       ↓
Bot sends:
"⚠️ Sticker is not allowed."

Roxie-style clean flow

User sends sticker
       ↓
🗑️ Sticker removed

The goal is a group where moderation happens in the background instead of becoming the conversation.

🧪 Quality & Verification

Roxie has dedicated tests covering major systems.

Tested areas

✅ Security

✅ Permissions

✅ Moderation

✅ Content protection

✅ Media controls

✅ Custom abuse rules

✅ Message cleanup

✅ Custom stickers

✅ Language detection

✅ Hindi / Hinglish behavior

✅ Brother-zone detection

✅ Lust levels

✅ User isolation

✅ Group isolation

✅ Edge cases

Development checks

npm run lint
npm test
npm run build

🏗️ Architecture

                         TELEGRAM
                            │
                  ┌─────────┴─────────┐
                  │                   │
                 DM                 GROUP
                  │                   │
                  └─────────┬─────────┘
                            ▼
                     ┌─────────────┐
                     │   🤖 ROXIE  │
                     └──────┬──────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
       🛡️ Moderation                 💬 Conversation
              │                           │
      ┌───────┼────────┐          ┌───────┼───────┐
      ▼       ▼        ▼          ▼       ▼       ▼
     Spam    Media    Abuse     Hindi  English  Hinglish
              │                           │
              └─────────────┬─────────────┘
                            ▼
                         💾 Storage

🛠️ Technology

Layer

Technology

Runtime

Node.js

Language

TypeScript

API / Server

Express

Frontend

React + Vite

Styling

Tailwind CSS

Build

ESBuild + Vite

Telegram

Telegram Bot API

Configuration

dotenv

AI

Configured AI provider

Testing

Project test suites

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

🔒 For authorized contributors only.

Install:

npm install

Development:

npm run dev

Type check:

npm run lint

Tests:

npm test

Build:

npm run build

Start:

npm start

Never commit secrets:

.env
BOT_TOKEN
AI_API_KEY
DATABASE_URL
private credentials

🌐 Public Bot • Private Source

Roxie's distribution model is intentionally simple:

                    🤖 ROXIE
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
       Telegram Service      Source Code
             │                   │
          PUBLIC              PRIVATE
             │                   │
       Users can use       Owner / authorized
       the bot             contributors only

Public users can

✅ Use Roxie through Telegram

✅ Chat with Roxie

✅ Add Roxie to eligible groups

✅ Use supported commands

✅ Configure supported group features

Without written permission, users may NOT

❌ Copy the source code

❌ Publish the source code

❌ Redistribute the source

❌ Modify the source

❌ Self-host the proprietary implementation

❌ Sell or sublicense the source

❌ Create a competing bot from the source

❌ Remove copyright notices

❌ Present a copy as official Roxie

Using Roxie does not mean owning Roxie.

📜 License

Roxie is proprietary software.

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

Roxie is NOT open source.

The repository may be private, and access to the repository does not automatically grant redistribution or deployment rights.

Read the complete terms in LICENSE.

👨‍💻 Creator

<div align="center">

DKT • Dharmender Kumar

Creator & Copyright Owner of Roxie

<br>

<a href="https://github.com/dkt882">
<img src="https://img.shields.io/badge/GitHub-dkt882-181717?style=for-the-badge&logo=github&logoColor=white">
</a>
<a href="https://www.linkedin.com/in/dkt882">
<img src="https://img.shields.io/badge/LinkedIn-Dharmender%20Kumar-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white">
</a>

<br><br>

For licensing, collaboration, deployment permission, or authorized source-code access,<br>
contact the copyright owner.

</div>

⚠️ Disclaimer

Roxie is an independently developed Telegram bot.

Telegram and related trademarks belong to their respective owners. Roxie is not an official Telegram product.

Third-party libraries, APIs, frameworks, AI services, and dependencies remain subject to their respective licenses and terms.

<div align="center">

🤖 Roxie

Smarter moderation. Cleaner groups. More natural conversations.

<br>

Built with ❤️ by DKT

© 2026 Dharmender Kumar — All Rights Reserved.

<br>

🔒 PROPRIETARY • NOT OPEN SOURCE

</div>
