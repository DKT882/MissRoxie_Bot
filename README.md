<div align="center">

🤖 Roxie

Intelligent Telegram Moderation & AI Conversation

One bot for cleaner groups, smarter protection, and natural conversations.

<br>






<br>

Created by DKT • Dharmender Kumar

GitHub • LinkedIn

</div>

🌸 What is Roxie?

Roxie is a custom Telegram bot designed to make communities easier to manage while still feeling natural to use.

Instead of using one bot for moderation, another for anti-spam, another for media protection, and another for AI conversation, Roxie brings these capabilities into a single system.

The idea is simple:

Let Roxie handle the repetitive work while the community stays focused on the conversation.

Roxie combines:

🛡️ Moderation · 🔒 Content Protection · 🧠 Smart Filtering · 💬 AI Conversation · 🌐 Multilingual Interaction · ⚙️ Group Automation

✨ Features

<div align="center">

🛡️

🔒

🧠

💬

Moderation

Protection

Smart Detection

AI Chat

Warn, kick, ban, promote, demote & cleanup

Links, stickers, files, images, GIFs & more

Spam, promotion & abuse detection

Natural group & DM conversations

🌐

👥

🆓

🧹

Multilingual

Group Isolation

Trusted Members

Clean Chat

English, Hindi & Hinglish

Independent settings & state per group

Give selected users protection exceptions

Remove unwanted content without unnecessary bot noise

</div>

🛡️ Smart Moderation

Roxie is built around Telegram communities, so moderation is more than simply deleting messages.

It provides a structured moderation layer for administrators and moderators, including:

Member warnings

Member removal

Banning

Promotion and demotion

Message cleanup

Flood protection

Slow-mode controls

Moderator-only actions

Telegram permission validation

Roxie checks its own authorization rules and the permissions granted to the bot by Telegram.

That means Roxie never assumes that being a moderator in its internal system gives it powers Telegram has not granted.

🔒 Smart Content Protection

Roxie can continuously inspect group activity and enforce the protection rules configured for that particular community.

Supported protection areas include:

🔗 Links
🎨 Stickers
📁 Files
🖼️ Images
🎞️ GIFs
💬 Spam
📢 Promotions / advertisements
🤬 Abusive language
🌊 Flood activity

The protection system is designed to be configurable rather than hard-coded around one type of community.

Different groups can have different policies.

🧠 Smart Detection Engine

Roxie does not rely on a single simple keyword check for every situation.

Its content-protection layer can combine multiple signals to identify unwanted content, including:

Incoming message
       │
       ▼
   Normalize
       │
       ▼
  Analyze content
       │
 ┌─────┼─────┬─────┐
 ▼     ▼     ▼     ▼
Spam  Promo Abuse Media
 └─────┴─────┴─────┘
             │
             ▼
       Group policy
             │
       ┌─────┴─────┐
       ▼           ▼
     ALLOW       REMOVE

Groups can also maintain their own custom abusive-word lists.

This allows Roxie to adapt to the vocabulary and culture of an individual community.

🧹 Clean-Chat Philosophy

One of Roxie's design goals is moderation without unnecessary chat pollution.

Traditional moderation can look like:

User sends prohibited content
          ↓
Bot deletes it
          ↓
Bot sends another message explaining
what it just deleted

Roxie's approach is:

User sends prohibited content
          ↓
       🗑️ REMOVE
          ↓
        DONE

When an administrator uses supported management commands, Roxie can also clean up the administrator's command message when the required Telegram permissions are available.

Result

Less:

"⚠️ This message was deleted because..."

More:

The group simply stays clean.

🆓 Trusted Member System

Not every member should necessarily be treated the same.

Roxie supports a trusted-member exception system.

For example:

Group protection
       │
       ├── Normal member
       │      ↓
       │   Protection applies
       │
       └── Trusted member
              ↓
          Configured exception

Administrators or authorized moderators can give selected members an exception from configured content restrictions.

This is useful for:

Group staff

Bots

Trusted contributors

Media teams

Special members

💬 AI Conversation

Roxie is not only a moderation bot.

It can also participate in conversations.

The conversational layer is designed to understand:

English

Hindi

Hinglish

Mixed Hindi + English messages

Romanized Hindi expressions

Conversational context and tone

Example

User

kaisi ho roxie?

Roxie

Main badhiya hoon 😄 tum batao?

User

कैसी हो रोक्सी?

Roxie

मैं बढ़िया हूँ 😊 तुम बताओ?

User

Roxie what are you doing?

Roxie

Bas yahin hoon 😄 tumse baat kar rahi hoon.

The goal is not simply to translate messages.

The goal is to respond in the language style the user is actually using.

🌐 Hindi • English • Hinglish

Roxie's language layer recognizes different writing styles.

English
   ↓
"How are you?"

Hindi
   ↓
"कैसी हो?"

Hinglish
   ↓
"Kaisi ho?"

Mixed
   ↓
"Roxie aaj kya kar rahi ho?"

This makes Roxie more natural in Indian Telegram communities where users frequently switch between languages during the same conversation.

😏 Personality Layer

Roxie can also have a configurable personality layer.

For example, it can recognize playful sibling/brother-zone expressions such as:

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

The detection is designed to avoid false matches against unrelated words such as:

problem
brown
broadcast
broken

When the relevant personality mode is enabled, Roxie can respond with playful couple-oriented pushback rather than treating the message as a normal moderation event.

📈 Conversational Level

The personality layer can maintain a gradual user-specific level:

LEVEL 0  ───────── Normal
LEVEL 1  ───────── Light teasing
LEVEL 2  ───────── Couple-oriented
LEVEL 3  ───────── Stronger romantic teasing
LEVEL 4  ───────── Highest configured playful level

The state is scoped to:

GROUP ID + USER ID

So a user's state in one group is not automatically transferred to another group.

The personality layer is designed to remain playful and non-explicit.

👥 How Roxie Works in a Group

Adding Roxie to a group turns it into a moderation and conversation layer.

Typical flow

                 👥 TELEGRAM GROUP
                         │
                         ▼
                    🤖 ROXIE
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       🛡️ MOD          🔒 PROTECT      💬 AI
          │              │              │
       Members         Content        Messages
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Group-specific
                     policies

To use Roxie in a group

Add Roxie to your Telegram group.

Give Roxie the administrative permissions required for the features you want.

Configure the group's protection and moderation settings.

Roxie begins processing eligible group activity.

Members can interact with Roxie's conversational layer according to the group's configuration.

Important

Telegram permissions still control what Roxie can actually do.

For example, if Roxie does not have permission to delete messages, it cannot magically delete them.

👤 How Roxie Works in Private DM

In a private chat, Roxie primarily behaves as a conversational AI.

              👤 USER
                 │
                 ▼
              💬 DM
                 │
                 ▼
             🤖 ROXIE
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
      English   Hindi   Hinglish
        │        │        │
        └────────┼────────┘
                 ▼
           Natural reply

A user can start a conversation with Roxie and interact with its conversational personality.

Group-management behavior is separated from ordinary private conversation.

🔐 Group & User Isolation

Roxie is designed with isolation in mind.

Group configuration and conversational state are scoped to the appropriate group and user.

Example

GROUP A
│
├── User 101 → Level 3
├── User 102 → Level 1
└── Group policy → Strict

GROUP B
│
├── User 101 → Level 0
├── User 202 → Level 2
└── Group policy → Relaxed

The same Telegram user appearing in two groups does not mean the groups share the same conversational state.

This prevents accidental cross-group configuration and state leakage.

🚀 Why Roxie is Different

Roxie's biggest difference is not a single command.

It is the combination of systems.

Typical Telegram setup

Moderation Bot
      +
Anti-Spam Bot
      +
Media Protection Bot
      +
AI Chat Bot
      +
Utility Bot
      =
Several bots to configure

Roxie

                    🤖 ROXIE
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
   MODERATION      PROTECTION       AI CHAT
       │               │               │
       ├───────────────┼───────────────┤
       │               │               │
       ▼               ▼               ▼
   GROUP TOOLS     SMART FILTERS   MULTILINGUAL
       │               │               │
       └───────────────┼───────────────┘
                       ▼
                 CLEANER GROUP

Roxie's key differentiators

Traditional approach

Roxie

Multiple bots

One integrated system

Basic keyword filtering

Multi-signal content analysis

Generic responses

Language-aware AI conversation

Same settings everywhere

Group-specific configuration

Bot messages fill the chat

Clean-chat moderation approach

No trusted exceptions

/free exception system

User state can be generic

User + group scoped state

Moderation and AI are separate

Moderation + conversation in one bot

🧩 Designed as a System, Not Just a Bot

Roxie is built around separate behavioral layers:

┌─────────────────────────────────────┐
│              TELEGRAM               │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│          COMMAND / EVENT LAYER      │
└──────────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
┌─────────────────┐ ┌─────────────────┐
│   MODERATION    │ │  CONVERSATION   │
│     ENGINE      │ │     ENGINE      │
└────────┬────────┘ └────────┬────────┘
         │                   │
         ▼                   ▼
┌─────────────────┐ ┌─────────────────┐
│    POLICY &     │ │ LANGUAGE &      │
│    CONTENT      │ │ PERSONALITY    │
│   PROTECTION    │ │     LAYER      │
└────────┬────────┘ └────────┬────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
          ┌─────────────────┐
          │     STORAGE     │
          └─────────────────┘

This separation makes it easier to extend Roxie without turning every new feature into one large block of logic.

🧪 Reliability & Verification

Roxie includes dedicated tests for its major behavioral systems.

Verification includes areas such as:

Security

Permission handling

Moderation

Content protection

Media controls

Custom abuse rules

Message cleanup

Custom sticker behavior

Language detection

Hindi / Hinglish behavior

Personality detection

Conversational levels

User isolation

Group isolation

Edge cases

The project also uses:

npm run lint
npm test
npm run build

for development verification.

🛠️ Technology

<div align="center">

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

Messaging

Telegram Bot API

Configuration

dotenv

AI

Configured AI provider

Testing

Dedicated project test suites

</div>

🔒 Public Bot • Private Source

Roxie follows a public-service / private-source model.

             🤖 ROXIE
                │
       ┌────────┴────────┐
       ▼                 ▼
   TELEGRAM            SOURCE
     BOT                CODE
       │                 │
    PUBLIC              PRIVATE
       │                 │
 Users can use       Owner / authorized
     Roxie              access only

People may be allowed to use Roxie through Telegram without receiving ownership or redistribution rights over the source code.

Roxie is NOT open source.

Without written permission, the source code may not be:

Copied

Published

Redistributed

Modified for redistribution

Self-hosted

Sold

Sublicensed

Used to create a competing service

Presented as an official Roxie implementation

Using Roxie does not give anyone ownership of Roxie or its source code.

📜 License

Roxie is distributed under a custom Proprietary Software License.

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

The source code is not open source and is not granted under MIT, Apache-2.0, GPL, BSD, or another open-source license.

See LICENSE for the complete legal terms.

For permission to use, modify, deploy, redistribute, or access the source code, contact the copyright owner.

👨‍💻 Creator

<div align="center">

DKT — Dharmender Kumar

Creator & Copyright Owner of Roxie

<br>





<br>

For licensing • collaboration • deployment permission • source access

</div>

<div align="center">

🤖 ROXIE

Smarter moderation. Cleaner groups. More natural conversations.

<br>

Built with ❤️ by DKT

© 2026 Dharmender Kumar — All Rights Reserved.

<br>

PROPRIETARY • NOT OPEN SOURCE

</div>
