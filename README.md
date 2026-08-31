<div align="center">

🤖 ROXIE

Telegram Moderation, Protection & AI Conversation

A smarter way to manage communities — without filling them with bot noise.

<br>






<br>

🛡️ MODERATE   •   🔒 PROTECT   •   💬 CHAT   •   🌐 UNDERSTAND

<br>

Created & Maintained by DKT

LinkedIn  •  GitHub

</div>

🌸 Meet Roxie

Roxie is a custom Telegram community bot built to do more than just delete messages.

She combines group moderation, smart content protection, trusted-member controls, multilingual AI conversation, and a configurable personality layer in one system.

The goal is simple:

Keep communities clean without making them feel robotic.

Whether Roxie is working quietly in a busy group or talking directly with someone in a private DM, the system is designed around the same principle:

understand what is happening → apply the right rules → respond naturally.

<div align="center">

⚡ ONE BOT. MULTIPLE LAYERS.

</div>

<table>
<tr>
<td align="center" width="25%">

🛡️

MODERATION

Warn
Kick
Ban
Promote / Demote
Message cleanup

</td>

<td align="center" width="25%">

🔒

PROTECTION

Spam
Promotions
Links
Stickers
Files
Images & GIFs

</td>

<td align="center" width="25%">

🧠

INTELLIGENCE

Content analysis
Abuse detection
Language detection
Flood detection
Group policies

</td>

<td align="center" width="25%">

💬

CONVERSATION

English
Hindi
Hinglish
Natural replies
Personality

</td>
</tr>
</table>

✨ What Makes Roxie Special?

Most Telegram communities end up with a collection of bots:

     MOD BOT
        +
    ANTI-SPAM
        +
  MEDIA FILTER
        +
     AI BOT
        +
  UTILITY BOT
        │
        ▼
   ⚙️ MANY SETTINGS
   🔔 MANY MESSAGES
   🤯 MANY BOTS

Roxie takes a different approach:

                    🤖 ROXIE
                       │
       ┌───────────────┼───────────────┐
       │               │               │
       ▼               ▼               ▼
   🛡️ MODERATION   🔒 PROTECTION   💬 AI CHAT
       │               │               │
       └───────────────┼───────────────┘
                       │
                       ▼
                 👥 ONE COMMUNITY

Roxie is built around integration, not just a collection of commands.

Traditional Bot Setup

Roxie

Several bots doing separate jobs

One integrated system

Generic moderation messages

Clean, action-first moderation

Basic keyword filtering

Multi-signal content analysis

Same behavior everywhere

Group-specific policies

Generic AI language

English + Hindi + Hinglish

No trusted-member layer

Configurable exceptions

Separate AI and moderation

AI + moderation together

User state can be global

User + group scoped state

🛡️ Smart Moderation

Roxie is designed to work with Telegram's permission model, not around it.

Moderation capabilities include:

👤 Member warnings

🚪 Member removal

🚫 Bans

👑 Promotion and demotion

🧹 Message cleanup

🌊 Flood protection

🐢 Slow-mode controls

🔐 Moderator/admin authorization

Before performing sensitive actions, Roxie considers:

Who requested the action?
          ↓
What role do they have?
          ↓
What does the group allow?
          ↓
What permissions does Telegram give Roxie?
          ↓
Can the action safely happen?

This prevents the bot from pretending it has administrative powers that Telegram has not actually granted.

🔒 Smart Content Protection

Roxie can protect a group from unwanted content while keeping the rules configurable.

Content Roxie can protect against

<div align="center">

🔗 LINKS    🎨 STICKERS    📁 FILES
🖼️ IMAGES    🎞️ GIFS    💬 SPAM
📢 PROMOTIONS    🤬 ABUSE    🌊 FLOODING

</div>

Instead of treating every group identically, Roxie stores protection policies at the group level.

That means:

GROUP A
Strict media protection
      ≠
GROUP B
Relaxed media protection

🧠 How Roxie's Protection Works

Roxie does not need to treat moderation as one giant if/else block.

The general flow is:

                 📩 MESSAGE
                     │
                     ▼
              Identify Group
                     │
                     ▼
              Identify User
                     │
                     ▼
            Check Permissions
                     │
                     ▼
           Check Trusted Status
                     │
                     ▼
            Analyze Content
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
      SPAM        PROMOTION     ABUSE
        │            │            │
        └────────────┼────────────┘
                     │
                     ▼
               Check Media
                     │
                     ▼
              Apply Group Rule
                     │
              ┌──────┴──────┐
              ▼             ▼
           ✅ ALLOW       🗑️ REMOVE

This architecture allows protection rules to evolve without changing the entire moderation system.

🧹 Clean-Chat Philosophy

One of Roxie's core design choices is not making the bot louder than the problem.

A traditional moderation flow may look like:

User sends prohibited content
            ↓
Bot deletes it
            ↓
Bot sends a warning
            ↓
Bot sends another explanation
            ↓
Chat becomes noisy

Roxie's preferred flow:

User sends prohibited content
            ↓
        🗑️ REMOVE
            ↓
          DONE

The objective is simple:

The group should feel moderated — not dominated by the moderator bot.

Supported moderator actions can also clean up the administrator's command message when Telegram permissions allow it.

🆓 Trusted Members

Not every member needs identical restrictions.

Roxie supports a trusted-member exception layer so authorized staff can give selected members configured exemptions.

                    GROUP
                      │
              ┌───────┴───────┐
              ▼               ▼
        👤 NORMAL USER    ⭐ TRUSTED USER
              │               │
              ▼               ▼
        Rules apply      Configured
                         exception

Useful for:

Group staff

Trusted contributors

Media teams

Special members

Other approved users

💬 Roxie Can Actually Talk

Roxie isn't only an invisible moderation service.

The AI conversation layer lets members interact with Roxie naturally.

It understands three common communication styles:

<div align="center">

🇬🇧 ENGLISH

How are you Roxie?

🇮🇳 HINDI

कैसी हो रोक्सी?

🔀 HINGLISH

Kaisi ho Roxie?

</div>

Roxie can detect the language style and generate a response appropriate to the user's message.

The important part

It isn't simply:

Hindi → translate → English → reply

It is intended to be:

Understand language
       ↓
Understand conversational style
       ↓
Generate response in that style

🌐 English • Hindi • Hinglish

Indian online communities naturally switch between languages.

Roxie is designed for that behavior.

English
"what are you doing?"

Hindi
"क्या कर रही हो?"

Hinglish
"aaj kya kar rahi ho?"

Mixed
"Roxie aaj kya kar rahi ho?"

The conversational layer can handle these styles without forcing everyone into one language.

😏 Personality Layer

Roxie's conversational system can also detect playful expressions and adapt its personality when the relevant mode is enabled.

For example:

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

brooo  → bro
bhaiii → bhai

The detection is designed to distinguish these triggers from unrelated words such as:

problem
brown
broadcast
broken

When the configured personality mode is active, Roxie can respond with playful couple-oriented pushback instead of simply ignoring the conversational context.

The personality layer is intended to remain playful and non-explicit.

📈 Adaptive Conversational Personality

Roxie can maintain a gradual user-specific conversational level.

       ┌─────────────────────────────┐
       │ LEVEL 0                     │
       │ Normal conversation         │
       └──────────────┬──────────────┘
                      ↓
       ┌─────────────────────────────┐
       │ LEVEL 1                     │
       │ Light teasing               │
       └──────────────┬──────────────┘
                      ↓
       ┌─────────────────────────────┐
       │ LEVEL 2                     │
       │ Couple-oriented             │
       └──────────────┬──────────────┘
                      ↓
       ┌─────────────────────────────┐
       │ LEVEL 3                     │
       │ Stronger playful teasing    │
       └──────────────┬──────────────┘
                      ↓
       ┌─────────────────────────────┐
       │ LEVEL 4                     │
       │ Highest configured level    │
       └─────────────────────────────┘

The state is scoped using:

GROUP ID + USER ID

So one user's conversational state does not automatically become another user's state.

👥 Using Roxie in a Telegram Group

Adding Roxie to a group turns it into a moderation + protection + conversation layer.

Setup

1. Add Roxie to your Telegram group
             ↓
2. Make Roxie an administrator
             ↓
3. Give the Telegram permissions
   required for your desired features
             ↓
4. Configure group protection
             ↓
5. Members can interact with Roxie

Inside the group

Roxie can quietly monitor eligible activity:

        👥 GROUP ACTIVITY
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
  MESSAGE    MEDIA     COMMAND
     │         │         │
     ▼         ▼         ▼
   🧠 CHECK  🔒 CHECK  🛡️ AUTH
     │         │         │
     └─────────┼─────────┘
               ▼
          TAKE ACTION

Telegram permissions matter

Roxie cannot bypass Telegram.

For example:

Telegram allows delete?
        │
     YES ─────→ Roxie can delete

     NO ──────→ Roxie cannot delete

This keeps the bot's authority aligned with the actual Telegram administrator permissions.

👤 Using Roxie in Private DM

In a private conversation, Roxie primarily behaves as an AI companion rather than a group moderation engine.

             👤 USER
                │
                ▼
           💬 PRIVATE DM
                │
                ▼
             🤖 ROXIE
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
     🇬🇧 EN    🇮🇳 HI   🔀 MIXED
       │        │        │
       └────────┼────────┘
                ▼
          Natural Reply

A user can start a conversation with Roxie and communicate naturally.

Group-specific moderation rules remain associated with their respective communities rather than becoming universal DM behavior.

🔐 Isolation by Design

Roxie keeps group behavior separated.

Imagine the same user belongs to two groups:

             USER 101
                │
        ┌───────┴───────┐
        ▼               ▼
     GROUP A          GROUP B
        │               │
     Level 3         Level 0
     Strict rules    Relaxed rules

The user's presence in Group A does not automatically modify Group B.

This group/user scoping is important for:

Protection policies

Trusted-member status

Conversational state

Personality state

Group-specific configuration

⚙️ Under the Hood

Roxie is organized into separate behavioral layers rather than treating the entire bot as one feature.

                         TELEGRAM
                            │
                            ▼
                 ┌────────────────────┐
                 │   EVENT / COMMAND  │
                 │       LAYER        │
                 └─────────┬──────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌──────────────┐          ┌──────────────┐
       │ MODERATION   │          │ CONVERSATION │
       │    ENGINE    │          │    ENGINE    │
       └──────┬───────┘          └──────┬───────┘
              │                         │
       ┌──────┴───────┐          ┌──────┴───────┐
       ▼              ▼          ▼              ▼
   POLICY         CONTENT     LANGUAGE      PERSONALITY
   RULES          ANALYSIS    DETECTION        STATE
       │              │          │              │
       └──────────────┴──────────┴──────────────┘
                           │
                           ▼
                       STORAGE

This makes the system easier to extend and maintain as Roxie grows.

🧪 Built With Verification in Mind

Roxie's development includes dedicated testing around its important behavioral systems.

Areas covered include:

Security
Permissions
Moderation
Content protection
Media controls
Custom abuse rules
Message cleanup
Language detection
Hindi / Hinglish behavior
Personality detection
Conversational levels
User isolation
Group isolation
Edge cases

Development verification includes:

npm run lint
npm test
npm run build

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

UI

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

Dedicated test suites

</div>

🔒 Public Bot. Private Source.

Roxie follows a deliberate model:

                 🤖 ROXIE
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
     TELEGRAM BOT         SOURCE CODE
          │                   │
       PUBLIC               PRIVATE
          │                   │
     Users may use       Copyright owner /
       the bot            authorized users

What this means

People can be allowed to use Roxie through Telegram without receiving the source code or ownership of the implementation.

Roxie is:

🔒 NOT OPEN SOURCE

The source code remains proprietary.

Without written permission, the source may not be:

Copied

Published

Redistributed

Self-hosted

Modified for redistribution

Sold

Sublicensed

Used to create a competing implementation

Presented as official Roxie software

Used outside the permissions granted by the copyright owner

Using Roxie does not transfer ownership of Roxie.

📜 License

Roxie is distributed under a custom Proprietary Software License.

Copyright © 2026 Dharmender Kumar (DKT)
All Rights Reserved.

This project is not licensed under MIT, Apache-2.0, GPL, BSD, or another open-source license.

The complete terms are available in:

LICENSE

For source-code access, deployment permission, modification rights, redistribution rights, or commercial licensing, contact the copyright owner.

👨‍💻 Creator

<div align="center">

DKT — Dharmender Kumar

Creator & Copyright Owner of Roxie

<br>





<br>

Licensing • Collaboration • Deployment Permission • Source Access

</div>

<div align="center">

🤖 ROXIE

Smarter moderation. Cleaner groups. More natural conversations.

<br>

Built with ❤️ by DKT

© 2026 Dharmender Kumar — All Rights Reserved.

<br>

PROPRIETARY  •  NOT OPEN SOURCE

</div>
