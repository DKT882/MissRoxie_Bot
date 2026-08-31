<div align="center">

🤖 ROXIE

Smart Telegram Moderation & AI Companion

🛡️ Protect your group • ⚡ Automate moderation • 💬 Talk naturally

<p>
Roxie is a powerful Telegram bot that combines intelligent moderation,
<br>
content protection, group utilities, and multilingual AI conversation
<br>
inside one clean, customizable system.
</p>

<br>






<br><br>

Created & Maintained by DKT • Dharmender Kumar

GitHub  • 
LinkedIn

</div>

🌐 ROXIE AT A GLANCE

<table>
<tr>
<td align="center" width="25%">

🛡️

MODERATION

Warn • Kick • Ban
Promote • Demote
Message cleanup

</td>
<td align="center" width="25%">

🔒

PROTECTION

Spam • Ads • Abuse
Links • Stickers
Files • Images • GIFs

</td>
<td align="center" width="25%">

💬

AI CHAT

English
Hindi
Hinglish
Natural replies

</td>
<td align="center" width="25%">

⚙️

GROUP TOOLS

Flood control
Slow mode
/say • /all
Trusted members

</td>
</tr>
</table>

💡 WHY ROXIE?

Most communities use several bots to handle different jobs.

       ┌────────────┐
       │ Moderation │
       └─────┬──────┘
             │
       ┌─────▼──────┐
       │ Anti-Spam  │
       └─────┬──────┘
             │
       ┌─────▼──────┐
       │ Media Bot  │
       └─────┬──────┘
             │
       ┌─────▼──────┐
       │   AI Bot   │
       └─────┬──────┘
             │
             ▼
        🤯 Too many bots

Roxie brings the stack together.

                     🤖 ROXIE
                        │
        ┌───────────────┼────────────────┐
        │               │                │
        ▼               ▼                ▼
   🛡️ MODERATION   🔒 PROTECTION     💬 AI CHAT
        │               │                │
   Warn / Ban       Spam / Abuse      English
   Kick / Clear    Media controls      Hindi
   Promote         Flood control      Hinglish
   Demote          Exceptions         Personality

One bot. Multiple responsibilities. Less noise.

✨ CORE FEATURES

🛡️ Smart Moderation

Roxie provides role-aware moderation for Telegram communities.

/warn

/kick

/ban

/promote

/demote

/clear

Actions are checked against both Roxie's authorization rules and Telegram's administrative permissions.

🔒 Smart Content Protection

Roxie can protect a group from unwanted content using configurable policies.

Protected content:

🔗 Links
🎨 Stickers
🖼️ Images
📁 Files
🎞️ GIFs
💬 Spam / promotion
🤬 Custom abuse words
🌊 Flood activity

Protection is configured per group, so one community's rules do not automatically become another community's rules.

🧹 CLEAN CHAT DESIGN

Roxie's moderation philosophy is simple:

Act first. Don't flood the chat with explanations.

Instead of:

User sends sticker

Roxie:
⚠️ Sticker deleted because stickers
are not allowed in this group.

The preferred clean flow is:

User sends sticker
       ↓
    🗑️ DELETE
       ↓
      DONE

The same philosophy can be applied to moderator command cleanup.

💬 MULTILINGUAL AI

Roxie can communicate in:

Language

Example

🇬🇧 English

How are you Roxie?

🇮🇳 Hindi

कैसी हो रोक्सी?

🔀 Hinglish

kaisi ho roxie?

🌐 Mixed

Roxie aaj kya kar rahi ho?

Example

USER
kaisi ho roxie?

ROXIE
Main badhiya hoon 😄 tum batao?

USER
कैसी हो रोक्सी?

ROXIE
मैं बढ़िया हूँ 😊 तुम बताओ?

Roxie detects language and conversational style before generating its response.

😏 PERSONALITY ENGINE

When configured for the group, Roxie can recognize playful brother-zone terms.

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

Repeated characters can be normalized:

brooo   → bro
bhaiii  → bhai

The detection is designed to avoid unrelated matches such as:

problem
brown
broadcast
broken

📈 LUST LEVEL SYSTEM

Roxie's playful personality can maintain a user-specific level.

┌──────────────────────────────────────────────┐
│  LEVEL 0                                     │
│  Normal conversation                         │
├──────────────────────────────────────────────┤
│  LEVEL 1                                     │
│  Light teasing                               │
├──────────────────────────────────────────────┤
│  LEVEL 2                                     │
│  Couple-oriented conversation                │
├──────────────────────────────────────────────┤
│  LEVEL 3                                     │
│  Stronger romantic teasing                   │
├──────────────────────────────────────────────┤
│  LEVEL 4                                     │
│  Highest configured playful level            │
└──────────────────────────────────────────────┘

State is scoped by:

GROUP ID + USER ID

So conversational state is isolated between different users and groups.

This personality mode is intended for appropriate adult communities and remains non-explicit.

📖 COMMAND CENTER

🟢 GENERAL

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Who can use</th>
<th>Purpose</th>
</tr>
<tr>
<td><code>/start</code></td>
<td><code>/start</code></td>
<td>👤 Everyone in DM</td>
<td>Start Roxie</td>
</tr>
<tr>
<td><code>/help</code></td>
<td><code>/help</code></td>
<td>👤 Everyone</td>
<td>Show available help</td>
</tr>
</table>

🛡️ MODERATION COMMANDS

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Permission</th>
<th>Action</th>
</tr>
<tr>
<td><code>/warn</code></td>
<td>Reply → <code>/warn</code></td>
<td>🛡️ / 👑</td>
<td>Warn member</td>
</tr>
<tr>
<td><code>/kick</code></td>
<td>Reply → <code>/kick</code></td>
<td>🛡️ / 👑</td>
<td>Remove member</td>
</tr>
<tr>
<td><code>/ban</code></td>
<td>Reply → <code>/ban</code></td>
<td>🛡️ / 👑</td>
<td>Ban member</td>
</tr>
<tr>
<td><code>/promote</code></td>
<td>Reply → <code>/promote</code></td>
<td>👑</td>
<td>Promote member</td>
</tr>
<tr>
<td><code>/demote</code></td>
<td>Reply → <code>/demote</code></td>
<td>👑</td>
<td>Demote administrator</td>
</tr>
<tr>
<td><code>/clear</code></td>
<td><code>/clear</code></td>
<td>🛡️ / 👑</td>
<td>Clear messages</td>
</tr>
</table>

Example

User:
Stop spamming!

Admin:
 /warn

Roxie uses the replied-to message to identify the target.

🔒 CONTENT PROTECTION COMMANDS

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Permission</th>
<th>Controls</th>
</tr>
<tr>
<td><code>/sticker</code></td>
<td><code>/sticker on/off</code></td>
<td>🛡️ / 👑</td>
<td>🎨 Stickers</td>
</tr>
<tr>
<td><code>/link</code></td>
<td><code>/link on/off</code></td>
<td>🛡️ / 👑</td>
<td>🔗 Links</td>
</tr>
<tr>
<td><code>/image</code></td>
<td><code>/image on/off</code></td>
<td>🛡️ / 👑</td>
<td>🖼️ Images</td>
</tr>
<tr>
<td><code>/file</code></td>
<td><code>/file on/off</code></td>
<td>🛡️ / 👑</td>
<td>📁 Files</td>
</tr>
<tr>
<td><code>/gif</code></td>
<td><code>/gif on/off</code></td>
<td>🛡️ / 👑</td>
<td>🎞️ GIFs</td>
</tr>
<tr>
<td><code>/flood</code></td>
<td><code>/flood on/off</code></td>
<td>🛡️ / 👑</td>
<td>🌊 Flood protection</td>
</tr>
</table>

Examples

/sticker on
/link on
/image on
/file on
/gif on
/flood on

Turn protection off:

/sticker off
/link off

🆓 TRUSTED MEMBER EXCEPTIONS

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Purpose</th>
</tr>
<tr>
<td><code>/free</code></td>
<td>Reply → <code>/free</code></td>
<td>Give a trusted member an exception</td>
</tr>
<tr>
<td><code>/unfree</code></td>
<td>Reply → <code>/unfree</code></td>
<td>Remove the exception</td>
</tr>
</table>

Example:

Admin replies to a member:

/free

The member receives the configured exception from protected-content rules.

📝 CUSTOM ABUSE FILTER

Every group can maintain its own custom abuse list.

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Purpose</th>
</tr>
<tr>
<td><code>/addabuse</code></td>
<td><code>/addabuse &lt;word&gt;</code></td>
<td>Add a custom rule</td>
</tr>
<tr>
<td><code>/removeabuse</code></td>
<td><code>/removeabuse &lt;word&gt;</code></td>
<td>Remove a rule</td>
</tr>
<tr>
<td><code>/listabuse</code></td>
<td><code>/listabuse</code></td>
<td>Show custom rules</td>
</tr>
<tr>
<td><code>/clearabuse</code></td>
<td><code>/clearabuse</code></td>
<td>Clear custom rules</td>
</tr>
</table>

Example:

/addabuse unwantedword

/removeabuse unwantedword

📢 COMMUNICATION

/say

Send a clean moderator announcement.

/say Group meeting at 7 PM.

Roxie can remove the administrator's command after processing when it has the required Telegram permission.

🎯 Reply-aware /say

USER 1
Hello everyone!

Admin replies:

/say Welcome User 1 👋

Roxie:

↳ Welcome User 1 👋

The response is attached to the user's original message.

👥 /all

Mention known members of the current group.

Syntax

/all

or:

/all <message>

Example

/all Important announcement for everyone!

Roxie creates clickable Telegram mentions and can split large mention sets when necessary to respect Telegram message-size limits.

🐢 SLOW MODE

Syntax

/slowmode <duration>

Examples

/slowmode 10s
/slowmode 30s
/slowmode 1m

Permission: 👑 Administrator + required Telegram rights.

😏 LUST COMMANDS

<table>
<tr>
<th>Command</th>
<th>Syntax</th>
<th>Purpose</th>
</tr>
<tr>
<td><code>/lust</code></td>
<td><code>/lust on/off</code></td>
<td>Enable / disable Lust Mode</td>
</tr>
<tr>
<td><code>/lustmode</code></td>
<td><code>/lustmode on/off</code></td>
<td>Alternate Lust Mode command</td>
</tr>
</table>

👮 PERMISSION OVERVIEW

<div align="center">

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

/flood

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

</div>

Legend

✅ Available
❌ Not available
⚠️ Requires additional Telegram administrative rights

Telegram remains the final authority. Roxie cannot bypass Telegram's permission system.

👤 PRIVATE DM

In a private chat, Roxie can primarily act as a conversational AI.

/start
   │
   ▼
User message
   │
   ▼
Language detection
   │
   ├── English
   ├── Hindi
   └── Hinglish
   │
   ▼
AI response

Group-management commands are not treated as ordinary DM conversation.

👥 GROUP MODE

Inside a Telegram group, Roxie becomes a moderation + conversation layer.

                     👥 TELEGRAM GROUP
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
            🛡️ MODERATION                💬 AI
                 │                         │
        ┌────────┼────────┐         ┌──────┼──────┐
        ▼        ▼        ▼         ▼      ▼      ▼
       Spam    Media     Abuse      EN     HI   Hinglish

🧠 HOW ROXIE DECIDES

Message protection

Incoming message
       │
       ▼
Identify user + group
       │
       ▼
Check permissions
       │
       ▼
Check /free exception
       │
       ▼
Analyze content
       │
 ┌─────┼──────┬───────┐
 ▼     ▼      ▼       ▼
Spam  Promo  Abuse   Media
 └─────┴──────┴───────┘
             │
             ▼
       Group policy
             │
       ┌─────┴─────┐
       ▼           ▼
    ALLOW        DELETE

Conversation

Incoming message
       │
       ▼
Normalize
       │
       ▼
Detect language
       │
       ▼
Detect Hinglish / mixed language
       │
       ▼
Detect personality triggers
       │
       ▼
Read user + group state
       │
       ▼
Generate response
       │
       ▼
Save relevant state

🔐 GROUP & USER ISOLATION

Roxie stores conversational state using a group + user scope.

GROUP A
├── User 101 → Level 3
├── User 102 → Level 1
└── User 103 → Level 0

GROUP B
├── User 101 → Level 0
└── User 202 → Level 2

This prevents intentional cross-group state leakage.

🧪 TESTING

Roxie contains dedicated verification for major systems.

✓ Security
✓ Moderation
✓ Permissions
✓ Message cleanup
✓ Content protection
✓ Custom abuse rules
✓ Custom stickers
✓ Language detection
✓ Hindi / Hinglish behavior
✓ Brother-zone detection
✓ Lust-level escalation
✓ Lust-level decay
✓ User isolation
✓ Group isolation
✓ Edge cases

Development checks:

npm run lint
npm test
npm run build

🏗️ ARCHITECTURE

                         TELEGRAM
                            │
                 ┌──────────┴──────────┐
                 │                     │
                DM                   GROUP
                 │                     │
                 └──────────┬──────────┘
                            ▼
                    ┌──────────────┐
                    │   🤖 ROXIE   │
                    │ Telegram Bot │
                    └──────┬───────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
      🛡️ MODERATION                 💬 AI CHAT
             │                           │
      ┌──────┼──────┐              ┌────┼────┐
      ▼      ▼      ▼              ▼    ▼    ▼
     Spam   Media  Abuse           EN   HI  Hinglish
             │                           │
             └─────────────┬─────────────┘
                           ▼
                       💾 STORAGE

🛠️ TECH STACK

Layer

Technology

Runtime

Node.js

Language

TypeScript

Server

Express

Frontend

React + Vite

Styling

Tailwind CSS

Build

Vite + ESBuild

Telegram

Telegram Bot API

Configuration

dotenv

AI

Configured AI provider

Testing

Dedicated project test suites

📁 PROJECT STRUCTURE

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

⚙️ AUTHORIZED DEVELOPMENT

🔒 The following section is for authorized developers only.

Install:

npm install

Development:

npm run dev

Type checking:

npm run lint

Tests:

npm test

Production build:

npm run build

Production start:

npm start

Never commit secrets:

.env
BOT_TOKEN
AI_API_KEY
DATABASE_URL
private credentials

🔒 PROPRIETARY SOFTWARE

Roxie is not open source.

The Telegram bot may be publicly available for people to use, while the underlying source code remains private.

                 🤖 ROXIE
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
    TELEGRAM SERVICE       SOURCE CODE
          │                   │
       PUBLIC               PRIVATE
          │                   │
     Users can use      Owner / authorized
      the bot            contributors

✅ You may

Use Roxie through Telegram

Add Roxie to eligible groups

Chat with Roxie

Use supported commands

Configure supported group features

❌ You may NOT, without written permission

Copy the source code

Publish the source code

Redistribute the source

Modify the source

Self-host the proprietary implementation

Sell or sublicense the source

Create a competing bot from the source

Remove copyright notices

Present a copy as official Roxie

Using Roxie does not mean owning Roxie.

📜 LICENSE

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

Roxie is licensed under a custom Proprietary Software License.

See LICENSE for the complete terms.

👨‍💻 CREATOR

<div align="center">

DKT • Dharmender Kumar

Creator & Copyright Owner of Roxie

<br>





<br>

For licensing, collaboration, deployment permission,<br>
or authorized source-code access, contact the copyright owner.

</div>

<div align="center">

🤖 ROXIE

Smarter moderation. Cleaner groups. More natural conversations.

<br>

Built with ❤️ by DKT

© 2026 Dharmender Kumar — All Rights Reserved.

<br>

🔒 PROPRIETARY • NOT OPEN SOURCE

</div>
