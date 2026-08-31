::: {align="center"}

🤖 Roxie

Smart Telegram Moderation • AI Conversation • Multilingual Personality

A proprietary, hosted Telegram bot built for smarter groups and more
natural conversations.






Created & Maintained by DKT • Dharmender Kumar

GitHub •
LinkedIn
:::

🌟 What is Roxie?

Roxie is a custom Telegram moderation and conversational bot that
combines:

🛡️ Group moderation

🔒 Smart content protection

🧹 Automatic media filtering

⚠️ Spam / promotion / abuse filtering

👮 Role-aware permissions

🌊 Flood protection

🐢 Slow mode

📢 Clean announcements

👥 Member mentions

💬 Hindi / English / Hinglish conversation

😏 Configurable playful personality

📈 Per-user conversational state

Roxie is provided as a hosted Telegram service.

🔒 Roxie is proprietary software and is NOT open source.

👥 Users can use Roxie through Telegram, but using the service does
not give anyone rights to the underlying source code.

🚀 Quick Start for Telegram Users

Add Roxie to a group

Open Telegram.

Open your group.

Add your Roxie bot as a member.

Promote Roxie to administrator.

Give it the Telegram permissions required for the features you want.

Use /help to see available commands.

Start a private conversation

Open Roxie's Telegram profile and press:

/start

Then send a normal message.

Some commands are group-only and some require moderator/administrator
permissions.

🧩 Feature Overview

Category                            Features

🛡️ Moderation                       Warn, Kick, Ban, Promote, Demote,
Clear

🔒 Content Protection               Spam, promotion, abuse, links,
stickers, images, files, GIFs

⚙️ Group Controls                   Flood protection, slow mode

📢 Communication                    /say, reply-aware /say, /all

🆓 Exceptions                       /free, /unfree

📝 Custom Rules                     Add/remove/list/clear abuse words

💬 AI Conversation                  English, Hindi, Hinglish, mixed
language

😏 Personality                      Lust Mode, brother-zone detection,
lust levels

🔐 Isolation                        Per-user and per-group state

📋 Complete Command Reference

Important: Command availability depends on the bot's configured
permission policy and Telegram's own administrative permissions.

🟢 General / Public Commands

/start

Starts Roxie in a private chat.

Syntax

/start

Who can use: Everyone in DM.

/help

Displays the available commands/help information.

Syntax

/help

Who can use: Everyone.

🛡️ Moderation Commands

/warn

Warn a member.

Syntax

/warn

Use it by replying to the target user's message.

Example:

User:      Stop spamming!
Admin:     /warn
Roxie:     Warning issued.

Who can use: Authorized moderator / administrator.

/kick

Remove a member from the group.

Syntax

/kick

Normally used by replying to the target's message.

Example:

/kick

Who can use: Authorized moderator / administrator with required
Telegram rights.

/ban

Ban a member from the group.

Syntax

/ban

Example:

Reply to User:
 /ban

Who can use: Authorized moderator / administrator with required
Telegram rights.

/promote

Promote a member.

Syntax

/promote

Use as a reply to the target member's message where supported.

Who can use: Authorized administrator with Telegram promotion
rights.

Telegram may reject this action if Roxie does not have sufficient
administrator privileges.

/demote

Demote an administrator.

Syntax

/demote

Use as a reply to the target member's message where supported.

Who can use: Authorized administrator with the required Telegram
rights.

/clear

Clear/delete messages according to Roxie's configured cleanup behavior.

Syntax

/clear

Who can use: Authorized moderator / administrator with
message-deletion permission.

🔒 Media & Content Protection

Roxie can enforce restrictive group policies for different content
types.

/sticker

Enable or disable sticker protection.

Syntax

/sticker on
/sticker off

Example:

/sticker on

When enabled, protected stickers can be automatically deleted according
to the group's policy.

Who can use: Authorized moderator / administrator.

/link

Enable or disable link protection.

Syntax

/link on
/link off

Example:

/link on

Who can use: Authorized moderator / administrator.

/image

Enable or disable image protection.

Syntax

/image on
/image off

Example:

/image on

Who can use: Authorized moderator / administrator.

/file

Enable or disable file/document protection.

Syntax

/file on
/file off

Example:

/file on

Who can use: Authorized moderator / administrator.

/gif

Enable or disable GIF protection.

Syntax

/gif on
/gif off

Example:

/gif on

Who can use: Authorized moderator / administrator.

🆓 Protection Exceptions

/free

Give a member an exception to configured protected-content rules.

Syntax

/free

Use according to the bot's supported target format, typically by
replying to the member's message.

Example:

Reply to User:
 /free

This can allow a trusted member to send content that the group normally
blocks.

Who can use: Authorized moderator / administrator.

/unfree

Remove a member's protection exception.

Syntax

/unfree

Example:

Reply to User:
 /unfree

Who can use: Authorized moderator / administrator.

📝 Custom Abuse Word Management

Roxie supports group-specific custom abuse lists.

/addabuse

Add a custom word/pattern to the group's abuse list.

Syntax

/addabuse <word>

Example:

/addabuse badword

Who can use: Authorized moderator / administrator.

/removeabuse

Remove a custom abuse rule.

Syntax

/removeabuse <word>

Example:

/removeabuse badword

Who can use: Authorized moderator / administrator.

/listabuse

Show the configured custom abuse rules.

Syntax

/listabuse

Who can use: Authorized moderator / administrator.

/clearabuse

Clear the custom abuse list.

Syntax

/clearabuse

Roxie may request interactive confirmation before clearing the list.

Who can use: Authorized moderator / administrator.

🌊 Flood Protection

/flood

Enable or disable flood protection.

Syntax

/flood on
/flood off

Example:

/flood on

Roxie can detect excessive rapid activity according to the configured
flood policy.

Who can use: Authorized moderator / administrator.

🐢 Slow Mode

/slowmode

Configure Telegram group slow mode.

Syntax

/slowmode <duration>

Examples:

/slowmode 10s
/slowmode 30s
/slowmode 1m

Who can use: Authorized administrator with the required Telegram
permissions.

Actual supported durations depend on Telegram's capabilities and
Roxie's implementation.

📢 Communication Commands

/say

Send a clean announcement.

Syntax

/say <message>

Example:

/say Meeting starts at 7 PM.

Roxie can delete the command message after processing when it has the
required Telegram permission.

Who can use: Authorized moderator / administrator.

🎯 Reply-aware /say

Reply to a user's message:

User 1:
Hello everyone!

Then:

Admin:
 /say Hello User 1

Roxie replies directly to User 1's message:

User 1:
Hello everyone!

Roxie:
Hello User 1

This makes announcements contextual without leaving the admin's command
visible.

Who can use: Authorized moderator / administrator.

👥 /all

Mention known members of the current group.

Syntax

/all

or:

/all <message>

Example:

/all Important announcement for everyone!

Roxie generates clickable Telegram mentions for known active/cached
members.

For large groups, the mentions can be split into multiple messages to
respect Telegram message-size limits.

Who can use: Authorized moderator / administrator.

Group isolation

Group A
  ↓
Group A members

Group B
  ↓
Group B members

Roxie does not intentionally mix group member state.

😏 Lust Mode

Roxie includes a configurable playful/romantic personality layer.

Lust Mode is intended for appropriate adult communities and remains
non-explicit.

/lust

Enable or disable Lust Mode.

Syntax

/lust on
/lust off

Examples:

/lust on
/lust off

When disabled, Roxie returns to its normal conversational behavior.

When enabled, Roxie's conversational layer can use a more
playful/couple-oriented tone.

Who can use: Authorized moderator / administrator according to group
policy.

/lustmode

Alias/alternate command form where enabled by the current
implementation.

Syntax

/lustmode on
/lustmode off

Example:

/lustmode on

Who can use: Authorized moderator / administrator.

💬 Natural Conversation

Roxie does not require a command for normal conversation when
conversational handling is enabled.

English

User:
Hey Roxie, how are you?

Roxie:
I'm good 😄 How about you?

Hindi

User:
कैसी हो रोक्सी?

Roxie:
मैं बढ़िया हूँ 😊 तुम बताओ?

Hinglish

User:
kaisi ho roxie?

Roxie:
Main badhiya hoon 😄 tum batao?

Mixed

User:
Roxie aaj kya kar rahi ho?

Roxie:
Bas tumse baat kar rahi hoon 😏

Roxie can detect language patterns and respond in a matching style.

😏 Brother-Zone Detection

In Lust Mode, Roxie can recognize terms such as:

bro
brooo
brother
brother ji
bruh
dude

bhai
bhaiii
bhaiya
bhaisaab

भाई
भैया
भाईसाहब

Repeated letters can be normalized:

brooo  → bro
bhaiii → bhai

Token-boundary matching is designed to avoid unrelated matches such as:

problem
brown
broadcast
broken

📈 Lust Level

Roxie's conversational intensity can be tracked per user.

Level Behavior

    0 Normal conversation
    1 Light teasing
    2 Flirty / couple-oriented
    3 Stronger romantic teasing
    4 Highest configured playful-romantic level

Example progression:

0 → 1 → 2 → 3 → 4

The level is capped at the configured maximum and can decay after
inactivity.

Executing:

/lust off

resets the group's lust-level state according to the implementation.

🔐 User & Group Isolation

Roxie's conversational state is scoped by user and group.

Conceptually:

group_id + user_id

Example:

GROUP A
├── User 101 → Level 3
├── User 102 → Level 1
└── User 103 → Level 0

GROUP B
├── User 101 → Level 0
└── User 204 → Level 2

This prevents intentional cross-group state leakage.

👮 Permission Matrix

Command / Feature      Member    Moderator        Admin

/start                 ✅          ✅             ✅
/help                  ✅          ✅             ✅
Normal conversation      ✅          ✅             ✅
/warn                  ❌          ✅             ✅
/kick                  ❌          ✅             ✅
/ban                   ❌          ✅             ✅
/promote               ❌          ⚠️             ✅
/demote                ❌          ⚠️             ✅
/clear                 ❌          ✅             ✅
/sticker               ❌          ✅             ✅
/link                  ❌          ✅             ✅
/image                 ❌          ✅             ✅
/file                  ❌          ✅             ✅
/gif                   ❌          ✅             ✅
/free                  ❌          ✅             ✅
/unfree                ❌          ✅             ✅
/addabuse              ❌          ✅             ✅
/removeabuse           ❌          ✅             ✅
/listabuse             ❌          ✅             ✅
/clearabuse            ❌          ✅             ✅
/flood                 ❌          ✅             ✅
/slowmode              ❌          ⚠️             ✅
/say                   ❌          ✅             ✅
/all                   ❌          ✅             ✅
/lust                  ❌     Configurable   Configurable

Legend:

✅ Allowed
❌ Not allowed
⚠️ Requires appropriate Telegram/admin privilege

🧠 How Roxie Processes a Message

For protected content:

Telegram Message
       ↓
Identify Group/User
       ↓
Check Permissions
       ↓
Read Group Policy
       ↓
Check Exceptions (/free)
       ↓
Analyze Content
       ↓
 ┌─────┼────────┬─────────┐
Spam  Promo    Abuse    Media
 └─────┼────────┴─────────┘
       ↓
  Policy Decision
       ↓
 Allow / Delete / Log

For conversation:

Incoming Message
       ↓
Normalize
       ↓
Detect Language
       ↓
Detect Hindi / Hinglish
       ↓
Detect Personality Trigger
       ↓
Read Lust Mode
       ↓
Read User + Group State
       ↓
Update Lust Level
       ↓
Generate Response
       ↓
Return Response

🧹 Clean Moderation Philosophy

Roxie is designed to minimize unnecessary bot messages.

Instead of:

User sends protected sticker
        ↓
Roxie:
"Sticker deleted because stickers are not allowed."

the preferred clean flow can be:

User sends sticker
        ↓
🗑️ Sticker deleted

Likewise, moderator commands can be cleaned:

Admin:
/say Important update

        ↓

Admin command deleted

        ↓

Roxie:
Important update

This keeps busy groups cleaner.

🔒 Telegram Permissions Matter

Roxie cannot override Telegram.

For example:

Roxie wants to delete message
        ↓
Telegram checks bot permissions
        ↓
Allowed → deleted
Denied  → action fails

For administrative features, make Roxie an administrator and grant the
required permissions.

🏗️ Architecture

                    Telegram
                       │
             ┌─────────┴─────────┐
             │                   │
            DM                 Groups
             │                   │
             └─────────┬─────────┘
                       ▼
                ┌──────────────┐
                │    Roxie     │
                │ Telegram Bot │
                └──────┬───────┘
                       │
                       ▼
                ┌──────────────┐
                │ Roxie Server │
                │   Private    │
                └──────┬───────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
             AI              Database

🧪 Verification & Testing

The project includes dedicated verification for:

🔐 Security

🛡️ Moderation

👮 Permissions

🧹 Message cleanup

📊 Reporting

🎨 Custom stickers

🔒 Content protection

💬 Conversational behavior

🌐 Language detection

😏 Lust Mode

📈 Lust-level escalation/decay

🔐 User isolation

🔐 Group isolation

Conversational tests cover:

✓ English
✓ Hindi
✓ Hinglish
✓ Mixed language
✓ bro / brooo
✓ bhai / bhaiii
✓ भाई / भैया / भाईसाहब
✓ brother / bruh / dude
✓ Lust Mode OFF
✓ Lust Mode ON
✓ Level escalation
✓ Level cap
✓ Level decay
✓ User isolation
✓ Group isolation
✓ Response variation
✓ Edge cases
✓ Hindi response generation

Development verification:

npm run lint
npm test
npm run build

🧰 Technology

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

Build

TypeScript

TSX

Vite

ESBuild

Telegram

Telegram Bot API

Group message handling

Administrative permissions

Message deletion

Reply targeting

User mentions

AI / Conversation

Configured AI provider

Dedicated conversational service

Language detection

Persona/state management

📁 Project Structure

MissRoxie_Bot/
│
├── server/
│   ├── db/
│   │   └── storage.ts
│   │
│   └── telegram/
│       ├── api.ts
│       ├── botManager.ts
│       ├── commands.ts
│       ├── errorMapper.ts
│       ├── middleware.ts
│       ├── moderation.ts
│       ├── policyEngine.ts
│       ├── scheduler.ts
│       ├── telegram.ts
│       └── types.ts
│
├── src/
├── test/
├── package.json
├── README.md
└── LICENSE

The implementation may evolve over time.

⚙️ Authorized Development

If you have authorized access to the proprietary repository:

npm install

Development:

npm run dev

Type checking:

npm run lint

Testing:

npm test

Production build:

npm run build

Production start:

npm start

These instructions do not grant anyone permission to obtain, copy,
deploy, or use Roxie's proprietary source code.

🔐 Security

Never commit secrets such as:

.env
BOT_TOKEN
AI_API_KEY
DATABASE_URL
private credentials

Keep secrets on the server.

Recommended:

Telegram
   ↓
Roxie Backend
   ↓
AI / Database / Services

Never expose private API credentials to a client-side application.

🌐 Public Service, Private Source

Roxie's intended distribution model is:

             ROXIE
               │
       ┌───────┴────────┐
       │                │
   Telegram Service   Source Code
       │                │
      PUBLIC           PRIVATE
       │                │
   Users can use       Owner only
   the bot             / authorized
                       developers

Users can

✅ Chat with Roxie

✅ Use supported DM features

✅ Add Roxie to eligible Telegram groups

✅ Use supported moderation features when authorized

✅ Configure supported group features

Users cannot, without written permission

❌ Copy source code

❌ Publish source code

❌ Modify source code

❌ Self-host using the proprietary implementation

❌ Redistribute source code

❌ Create a competing implementation from the proprietary source

❌ Rebrand a copy as official Roxie

❌ Sell the proprietary source

Using Roxie is not the same as owning Roxie.

📜 License

Roxie is licensed under a custom Proprietary Software License.

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

Roxie is not open source.

See LICENSE for the complete terms.

In simple terms

Use Roxie through Telegram
        ↓
       YES ✅

Copy Roxie source
        ↓
       NO ❌

Self-host Roxie from source
        ↓
       NO ❌

Modify / redistribute source
        ↓
       NO ❌

Permission from DKT
        ↓
   Possible ✅

👨‍💻 Creator & Copyright Owner

DKT • Dharmender Kumar

Roxie is independently created and maintained by Dharmender Kumar
(DKT).

🔗 Links

GitHub: https://github.com/dkt882

LinkedIn: https://www.linkedin.com/in/dkt882

For source-code licensing, collaboration, deployment permission, or
other authorization requests, contact the copyright owner.

⚠️ Disclaimer

Roxie is an independently developed Telegram bot.

Telegram and related trademarks belong to their respective owners. Roxie
is not an official Telegram product.

Third-party libraries, APIs, AI providers, frameworks, and services
remain subject to their respective licenses and terms.

::: {align="center"}

🤖 Roxie

Smarter moderation. Cleaner groups. More natural conversations.

Built by DKT • Dharmender Kumar

© 2026 Dharmender Kumar --- All Rights Reserved.

🔒 ROXIE IS PROPRIETARY SOFTWARE • NOT OPEN SOURCE

:::
