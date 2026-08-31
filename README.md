# 🤖 Roxie

### Smart Telegram Moderation • AI Conversation • Multilingual Personality

**A custom-built Telegram group management and conversational bot
engineered for cleaner, smarter and more interactive communities.**

`<br>`{=html}

[![Telegram](https://img.shields.io/badge/Telegram-Bot-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://telegram.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Backend-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-Runtime-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-Dashboard-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)

`<br>`{=html}

**Created & Maintained by [DKT • Dharmender
Kumar](https://github.com/dkt882)**

[GitHub](https://github.com/dkt882) •
[LinkedIn](https://www.linkedin.com/in/dkt882)
:::

------------------------------------------------------------------------

## ✨ What is Roxie?

**Roxie** is a custom Telegram moderation and conversational bot built
to go beyond the traditional:

> `command → action`

model.

Instead, Roxie combines **permissions, moderation, content analysis,
media protection, group-specific policies, AI-style conversation and
user state** into one system.

``` text
                         ┌──────────────────────┐
                         │       TELEGRAM       │
                         └──────────┬───────────┘
                                    │
                                    ▼
                       ┌────────────────────────┐
                       │   ROXIE MESSAGE CORE   │
                       └───────────┬────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
      🔐 Permissions        🛡️ Protection          💬 Conversation
             │                     │                     │
             ▼                     ▼                     ▼
       Admin / Mod          Spam / Abuse /       Hindi / English /
       Authorization        Promotion / Media    Hinglish / Persona
             │                     │                     │
             └─────────────────────┼─────────────────────┘
                                   ▼
                         ⚡ Action / Response
```

------------------------------------------------------------------------

# 🚀 Why Roxie?

Most Telegram bots are primarily command collections.

Roxie is designed as a **group operating layer**:

  Traditional Bot          Roxie
  ------------------------ -----------------------------------------
  Static commands          Context-aware processing
  Basic keyword filters    Multi-signal content analysis
  One language             Hindi + English + Hinglish
  Global behavior          Group-specific state
  Generic responses        Configurable conversational personality
  Manual media cleanup     Automatic protection
  Simple permissions       Role + Telegram permission validation
  Repetitive bot replies   Response variation
  Basic moderation         Moderation + conversation in one system

### The core idea

> **Roxie should understand the context of the group before deciding
> what to do.**

------------------------------------------------------------------------

# 🧩 Feature Overview

::: {align="center"}
   🛡️ Moderation      🔒 Protection         💬 AI / Persona
  --------------- --------------------- ------------------------
       Warn          Spam Detection             English
       Kick        Promotion Filtering           Hindi
        Ban          Abuse Filtering            Hinglish
      Promote      Sticker Protection          Lust Mode
      Demote         Link Protection     Brother-zone Detection
       Clear         File Protection        Stateful Levels
       Flood        Image Protection         Per-user State
     Slow Mode       GIF Protection       Per-group Isolation
:::

------------------------------------------------------------------------

# 🛡️ Smart Moderation

Roxie provides role-aware moderation tools for group administrators and
moderators.

### Moderation capabilities

-   ⚠️ Warnings
-   👢 Kick members
-   🔨 Ban members
-   ⬆️ Promote members
-   ⬇️ Demote members
-   🧹 Clear messages
-   🌊 Flood protection
-   🐢 Slow mode
-   📢 Administrative announcements
-   👥 Group-wide member mentions

Roxie does not rely only on its internal permission checks. Telegram's
own administrative permissions remain authoritative.

------------------------------------------------------------------------

# 🧠 Smart Content Protection

Roxie's protection layer analyzes incoming content before deciding
whether it should remain in the group.

### Text protection

``` text
Message
   │
   ├── Spam?
   │
   ├── Promotion / Advertisement?
   │
   ├── Abusive language?
   │
   └── Custom group rule?
          │
          ▼
     Allow / Delete / Log
```

Supported language patterns include:

-   🇬🇧 English
-   🇮🇳 Hindi
-   🔤 Hinglish
-   🧩 Custom group-defined words

The system is designed to combine multiple signals rather than depend
exclusively on a single keyword.

------------------------------------------------------------------------

# 🧹 Media Protection

Roxie can protect groups from unwanted media and content types.

  Content       Control
  ------------- ------------
  🎞️ GIF        `/gif`
  🔗 Links      `/link`
  🖼️ Images     `/image`
  📁 Files      `/file`
  🎨 Stickers   `/sticker`

### Example

``` text
/sticker on
```

Protected stickers are automatically handled according to the group's
configured policy.

The same pattern applies to:

``` text
/gif on
/gif off

/link on
/link off

/image on
/image off

/file on
/file off

/sticker on
/sticker off
```

### Default protection

A group can use a restrictive default policy:

``` text
Sticker  → blocked
Link     → blocked
Image    → blocked
File     → blocked
GIF      → blocked
```

Then authorized users can receive exceptions through `/free`.

------------------------------------------------------------------------

# 🆓 `/free` --- Trusted Content Permission

`/free` gives an eligible user permission to send protected content
according to the group's media policy.

### Example

``` text
/free @username
```

Or use the supported reply-based target format.

### Related command

``` text
/unfree @username
```

removes the exception.

**Typical permission:** Moderator / Administrator.

------------------------------------------------------------------------

# 🚨 Custom Abuse Management

Each group can maintain its own custom abusive-word list.

### Add

``` text
/addabuse word
```

Example:

``` text
/addabuse exampleword
```

### Remove

``` text
/removeabuse word
```

### List

``` text
/listabuse
```

### Clear

``` text
/clearabuse
```

Interactive confirmation is used where configured.

### Why group-specific lists?

``` text
Group A
└── custom abuse rules

Group B
└── different custom abuse rules
```

One group's custom vocabulary does not automatically become another
group's rule set.

------------------------------------------------------------------------

# 🌊 Flood & Slow Mode

## `/flood`

Enable or disable flood protection.

``` text
/flood on
/flood off
```

Roxie can detect excessive rapid activity according to the configured
policy.

------------------------------------------------------------------------

## `/slowmode`

Configure supported slow-mode durations.

Examples:

``` text
/slowmode 10s
/slowmode 30s
/slowmode 1m
```

Telegram permissions and chat capabilities determine whether the
requested action can actually be applied.

------------------------------------------------------------------------

# 📢 `/say` --- Clean Admin Announcements

`/say` allows moderators and administrators to publish an announcement
without leaving the administrative command visible.

### Basic usage

``` text
/say Meeting starts at 7 PM.
```

### Reply-aware usage

Suppose:

``` text
User 1:
Hello everyone!
```

The admin replies to that message:

``` text
/say Hello User 1
```

Roxie sends the announcement **as a reply to User 1's original
message**.

``` text
User 1: Hello everyone!
          ↳ Roxie: Hello User 1
```

This creates a cleaner, contextual conversation.

Where Telegram permissions allow it, the admin's command message is
deleted after processing.

------------------------------------------------------------------------

# 👥 `/all` --- Mention Group Members

`/all` performs a group-wide announcement using known valid members from
the **current group**.

### Without text

``` text
/all
```

### With text

``` text
/all Important meeting at 7 PM
```

Roxie generates clickable Telegram user mentions.

### Large groups

Telegram message limits are respected.

If necessary:

``` text
/all
   ↓
Mention chunk 1
Mention chunk 2
Mention chunk 3
...
```

No individual mention should be silently truncated.

### Group isolation

``` text
Group A → Group A members only
Group B → Group B members only
```

The command does not intentionally mix member state between groups.

### Cleanup

The administrator's `/all` command is removed where Telegram permissions
allow it.

------------------------------------------------------------------------

# 💬 Conversational Roxie

Roxie's conversational layer is designed to communicate naturally
instead of forcing every user into one language.

## 🇬🇧 English

``` text
User:
Hey Roxie, how are you?

Roxie:
I'm good 😄 How about you?
```

## 🇮🇳 Hindi

``` text
User:
कैसी हो रोक्सी?

Roxie:
मैं बढ़िया हूँ 😊 तुम बताओ?
```

## 🔤 Hinglish

``` text
User:
kaisi ho roxie?

Roxie:
Main badhiya hoon 😄 tum batao?
```

## 🔀 Mixed language

``` text
User:
Roxie aaj kya kar rahi ho?

Roxie:
Bas tumse baat kar rahi hoon 😏
```

The language detector considers:

-   Script
-   Vocabulary
-   Romanized Hindi
-   Mixed-language messages
-   Conversational context

------------------------------------------------------------------------

# 🔥 Lust Mode

Roxie includes a configurable playful/romantic conversational
personality called **Lust Mode**.

It is designed for adult communities and remains **non-explicit**.

### Enable

``` text
/lust on
```

### Disable

``` text
/lust off
```

The project also supports the corresponding `/lustmode` form where
registered.

------------------------------------------------------------------------

# 😏 Brother-Zone Detection

When Lust Mode is active, Roxie can recognize sibling/friend-style
addressing.

### English

``` text
bro
brooo
brother
brother ji
bruh
dude
```

### Hindi

``` text
भाई
भैया
भाईसाहब
```

### Hinglish

``` text
bhai
bhaiii
bhaiya
bhaisaab
arre bhai
```

Repeated letters are normalized:

``` text
brooo    → bro
bhaiiii  → bhai
```

The detector is token-boundary aware to reduce false positives.

For example:

``` text
problem
brown
broadcast
broken
```

should not be treated as `bro`.

------------------------------------------------------------------------

# 💕 Couple-Oriented Pushback

When a valid brother-zone trigger is detected while Lust Mode is active,
Roxie can respond with playful romantic/couple-oriented language.

Example:

``` text
User:
bhai kya kar rahi ho?

Roxie:
Phir se bhai? 😏 Kuch aur cute sa bulao na.
```

Another example:

``` text
User:
brooo kaha ho?

Roxie:
Bro again? 😏 You can definitely find a better name for me.
```

Responses are varied rather than being a single fixed sentence.

------------------------------------------------------------------------

# 📈 Lusty Level System

Roxie's conversational intensity can be tracked from **0 → 4**.

    Level Personality
  ------- -------------------------------------------
        0 Normal
        1 Light teasing
        2 Flirty / couple-oriented
        3 Stronger romantic teasing
        4 Highest configured playful-romantic level

A relevant brother-zone trigger can increase the level gradually.

``` text
Level 0
   ↓ bro/bhai
Level 1
   ↓ repeated trigger
Level 2
   ↓ repeated trigger
Level 3
   ↓ repeated trigger
Level 4
```

The level is capped and can decay with inactivity.

------------------------------------------------------------------------

# 🔐 Per-User + Per-Group State

Roxie stores conversational state conceptually as:

``` text
group_id + user_id
```

Example:

``` text
GROUP A
├── User 101 → Level 3
├── User 102 → Level 1
└── User 103 → Level 0

GROUP B
├── User 101 → Level 0
└── User 204 → Level 2
```

The same Telegram user can therefore have different state in different
groups.

This is a core part of Roxie's **group isolation** design.

------------------------------------------------------------------------

# 🏠 Group vs Private DM

## 👥 Group

Roxie's main environment.

Features can include:

-   Moderation
-   Media protection
-   Spam detection
-   Promotion filtering
-   Abuse filtering
-   Custom abuse lists
-   Flood protection
-   Slow mode
-   `/say`
-   `/all`
-   Conversational behavior
-   Lust Mode
-   Per-user state

## 💬 Private DM

Roxie can support conversational interaction in private chats where the
relevant handlers are enabled.

Typical flow:

``` text
User → /start
User → /help
User → message
Roxie → response
```

Group-only operations such as banning a member, configuring group media
protection, or mentioning group members are contextual group features
and should not be treated as ordinary DM commands.

### Telegram privacy mode

What a bot receives in a group depends on Telegram's privacy-mode rules
and whether the bot is an administrator. For a moderation bot,
administrator status is recommended.

------------------------------------------------------------------------

# 🧹 Clean Chat Philosophy

Roxie is designed to reduce moderation clutter.

Instead of:

``` text
Admin: /say Important update
Roxie: Announcement sent successfully!
```

the intended flow can be:

``` text
Admin: /say Important update
          ↓
       [deleted]

Roxie: Important update
```

For protected content:

``` text
User: [blocked sticker/link/file]
          ↓
      Roxie deletes it
          ↓
      Chat stays clean
```

The exact deletion behavior depends on Telegram permissions and the
configured policy.

------------------------------------------------------------------------

# 🔐 Permission Matrix

> Internal authorization and Telegram permissions are separate layers.
> Telegram ultimately decides whether an administrative action can be
> executed.

  Feature / Command               Member              Moderator    Admin     Owner
  ------------------- ------------------------------ ----------- --------- ---------
  `/start`                          ✅                   ✅         ✅        ✅
  `/help`                           ✅                   ✅         ✅        ✅
  `/warn`                           ❌                   ✅         ✅        ✅
  `/kick`                           ❌                   ✅         ✅        ✅
  `/ban`                            ❌                   ✅         ✅        ✅
  `/promote`                        ❌                   ⚠️        ✅\*      ✅\*
  `/demote`                         ❌                   ⚠️        ✅\*      ✅\*
  `/clear`                          ❌                   ✅         ✅        ✅
  `/gif`                            ❌                   ✅         ✅        ✅
  `/link`                           ❌                   ✅         ✅        ✅
  `/image`                          ❌                   ✅         ✅        ✅
  `/file`                           ❌                   ✅         ✅        ✅
  `/sticker`                        ❌                   ✅         ✅        ✅
  `/free`                           ❌                   ✅         ✅        ✅
  `/unfree`                         ❌                   ✅         ✅        ✅
  `/addabuse`                       ❌                   ✅         ✅        ✅
  `/removeabuse`                    ❌                   ✅         ✅        ✅
  `/listabuse`                      ❌                   ✅         ✅        ✅
  `/clearabuse`                     ❌                   ✅         ✅        ✅
  `/flood`                          ❌                   ✅         ✅        ✅
  `/slowmode`                       ❌                   ⚠️         ✅        ✅
  `/say`                            ❌                   ✅         ✅        ✅
  `/all`                            ❌                   ✅         ✅        ✅
  `/lust`              Depends on configured policy    Depends    Depends   Depends

`*` Telegram's actual administrative rights are required.

`⚠️` means the command may be available depending on the project's
configured permission policy and Telegram rights.

------------------------------------------------------------------------

# 🧪 Engineering & Verification

Roxie is developed with dedicated test and verification layers.

The project includes testing around:

-   🔐 Security
-   🛡️ Moderation
-   👮 Permissions
-   🧹 Message cleanup
-   📊 Reporting
-   🎨 Custom stickers
-   🧠 Conversational behavior
-   🛡️ Smart content protection
-   🔒 Group isolation

The conversational behavior suite includes coverage for:

``` text
✓ English detection
✓ Hindi detection
✓ Hinglish detection
✓ Mixed-language detection
✓ Bro detection
✓ Bhai detection
✓ Repeated-letter normalization
✓ Hindi-script detection
✓ Lust Mode
✓ Level escalation
✓ Level cap
✓ Level decay
✓ User isolation
✓ Group isolation
✓ Response variation
✓ Edge cases
✓ Hindi response generation
```

### Verification commands

``` bash
npm run lint
npm test
npm run build
```

Do not treat a build as a substitute for live Telegram testing. Telegram
permissions, API limits, privacy settings and runtime configuration can
still affect production behavior.

------------------------------------------------------------------------

# 🧰 Technology Stack

### Backend

-   Node.js
-   TypeScript
-   Express
-   dotenv

### Telegram

-   Telegram Bot API
-   Group message handling
-   Administrative permissions
-   Message deletion
-   Reply targeting
-   User mentions

### Frontend / Dashboard

-   React
-   Vite
-   Tailwind CSS
-   Lucide React
-   Motion

### Build & Development

-   Vite
-   ESBuild
-   TSX
-   TypeScript

### AI / Conversation

-   Configured AI provider
-   Dedicated conversational service
-   Language detection
-   Persona/state management

------------------------------------------------------------------------

# 🗂️ High-Level Project Structure

``` text
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
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── test/
│
├── package.json
├── README.md
└── LICENSE
```

The structure may evolve as the project develops.

------------------------------------------------------------------------

# ⚙️ Installation

Clone the repository:

``` bash
git clone https://github.com/DKT882/MissRoxie_Bot.git
cd MissRoxie_Bot
```

Install dependencies:

``` bash
npm install
```

Create your environment configuration:

``` text
.env
```

Never commit secrets.

------------------------------------------------------------------------

# ▶️ Development

Run the development server:

``` bash
npm run dev
```

Type-check:

``` bash
npm run lint
```

Run tests:

``` bash
npm test
```

------------------------------------------------------------------------

# 📦 Production

Build:

``` bash
npm run build
```

Start:

``` bash
npm start
```

The production build uses:

``` text
Vite
  +
ESBuild
  ↓
dist/server.cjs
```

------------------------------------------------------------------------

# 🔒 Security Rules

Never commit:

``` text
.env
```

or credentials such as:

``` text
BOT_TOKEN
OPENAI_API_KEY
other API keys
database credentials
private service credentials
```

AI/API keys should remain server-side and must never be exposed through
the frontend.

------------------------------------------------------------------------

# ⚠️ Telegram Limitations

Roxie operates within Telegram's Bot API rules.

Behavior can be affected by:

-   Bot administrator status
-   Telegram permissions
-   Privacy mode
-   Message deletion limits
-   Message length limits
-   API rate limits
-   Member information available to the bot
-   Chat type
-   Telegram's own permission checks

For example, Roxie's internal authorization may allow `/promote`, but
Telegram can still reject the operation if the bot does not have the
required `can_promote_members` permission.

------------------------------------------------------------------------

# 📌 Important: Public Repository ≠ Open Source

Roxie is intentionally **proprietary**.

The repository may be publicly visible for:

-   Portfolio presentation
-   Technical demonstration
-   Development
-   Code review

but public visibility **does not grant permission to use, copy, modify,
deploy, redistribute, rebrand, sell or create derivative versions of
Roxie**.

See [`LICENSE`](LICENSE) for the complete terms.

If strict access control is required, the repository should be kept
private.

------------------------------------------------------------------------

# 👨‍💻 Creator

::: {align="center"}
## DKT • Dharmender Kumar

**Creator & Copyright Owner of Roxie**

`<br>`{=html}

[![GitHub](https://img.shields.io/badge/GitHub-DKT882-181717?style=for-the-badge&logo=github)](https://github.com/dkt882)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Dharmender%20Kumar-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/dkt882)
:::

------------------------------------------------------------------------

# 📜 License

## Proprietary --- All Rights Reserved

Copyright © 2026 **Dharmender Kumar (DKT)**.

Roxie is **not open-source software**.

Without prior written permission from the copyright owner, you may not:

-   ❌ Use the software
-   ❌ Deploy or host it
-   ❌ Copy the source code
-   ❌ Modify the source code
-   ❌ Redistribute it
-   ❌ Rebrand it
-   ❌ Create derivative works
-   ❌ Sell it
-   ❌ Commercially exploit it
-   ❌ Publish modified versions
-   ❌ Use it to create a competing product

Permission requests:

-   GitHub: https://github.com/dkt882
-   LinkedIn: https://www.linkedin.com/in/dkt882

See the [`LICENSE`](LICENSE) file for the full proprietary license
notice.

------------------------------------------------------------------------

# 🤝 Credits & Attribution

If written permission is granted to use any part of Roxie, the following
attribution should remain unless the permission agreement explicitly
says otherwise:

> **Roxie --- Created by DKT (Dharmender Kumar)**\
> GitHub: https://github.com/dkt882\
> LinkedIn: https://www.linkedin.com/in/dkt882

Third-party libraries and services remain subject to their own licenses
and terms.

------------------------------------------------------------------------

::: {align="center"}
### 🤖 Roxie

**Smarter moderation. Cleaner groups. More natural conversations.**

Built with ❤️ by **DKT**



**© 2026 Dharmender Kumar --- All Rights Reserved**
:::
