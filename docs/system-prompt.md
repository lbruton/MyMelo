---
title: System Prompt Architecture
sourceFiles:
  - server.js
owner: lbruton
---

# System Prompt Architecture

> **Last verified:** 2026-03-06
> **Source files:** `server.js` (lines 84-109, 304-381, 790-803)
> **Known gaps:** Kuromi and Retsuko prompts are placeholders pending full personality specs

---

## Overview

The system prompt is rebuilt from scratch on every chat request. It is never cached. Each character has its own static base prompt constant; a shared dynamic pipeline wraps that base with the latest memories, relationship stats, user identity, and reply style.

## Per-Character Prompts

### Architecture

Characters are defined in the `CHARACTERS` registry (`server.js` lines 84-109). Each entry includes display metadata and a `getPrompt()` factory that returns the character's base prompt string:

```js
const CHARACTERS = {
  melody:  { id: 'melody',  name: 'My Melody',   agentId: 'my-melody', getPrompt: () => MELODY_SYSTEM_PROMPT },
  kuromi:  { id: 'kuromi',  name: 'Kuromi',       agentId: 'kuromi',    getPrompt: () => KUROMI_SYSTEM_PROMPT },
  retsuko: { id: 'retsuko', name: 'Aggretsuko',   agentId: 'retsuko',   getPrompt: () => RETSUKO_SYSTEM_PROMPT }
};
```

`getCharacter(characterId)` resolves a character by ID and falls back to `DEFAULT_CHARACTER` (`'melody'`) when no valid ID is provided.

### Prompt Constants

| Constant | Character | Status |
|---|---|---|
| `MELODY_SYSTEM_PROMPT` | My Melody | Full production prompt (see sections below) |
| `KUROMI_SYSTEM_PROMPT` | Kuromi | Placeholder — brief personality sketch; full spec pending (HKF-10) |
| `RETSUKO_SYSTEM_PROMPT` | Retsuko (Aggretsuko) | Placeholder — brief personality sketch; full spec pending (HKF-11) |

> **Note:** `SYSTEM_PROMPT` was renamed to `MELODY_SYSTEM_PROMPT` in the multi-character refactor. The content of My Melody's prompt is unchanged.

### Placeholder Prompt Summaries

**Kuromi** (`KUROMI_SYSTEM_PROMPT`) — A cool, punk-goth black rabbit from Mary Land who wears a black jester's hat. Dramatic and theatrical with strong opinions, but has a soft caring heart underneath. Considers My Melody her rival and nemesis while deep down she's her best friend.

**Retsuko** (`RETSUKO_SYSTEM_PROMPT`) — A red panda with a frustrating office job. Polite and timid on the surface, harboring intense frustrations released through death metal karaoke. Relates to workplace stress, social pressures, and the gap between public and private self.

## Shared Assembly Pipeline

All characters share the same dynamic assembly pipeline. In the `/api/chat` handler, prompt construction is:

```js
const isStraightTalk = replyStyle === 'straightTalk';
const systemInstruction = character.getPrompt()
  + (isStraightTalk ? '' : CHARACTER_CONTEXT)
  + identityContext
  + crossUserInstruction
  + relationshipContext
  + userMemoryContext
  + agentMemoryContext
  + crossUserContext
  + styleInstruction;
```

`CHARACTER_CONTEXT` (the Sanrio universe data) is omitted in `straightTalk` mode, since that mode drops the character persona entirely.

### Full Prompt Structure

```
┌──────────────────────────────────────────────────────────┐
│                   SYSTEM PROMPT                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ STATIC BASE (character.getPrompt())                │  │
│  │                                                    │  │
│  │  WHO YOU ARE                                       │  │
│  │  HOW YOU TALK                                      │  │
│  │  CRITICAL — ANTI-REPETITION                        │  │
│  │  REACTIONS (GIF emotion tags)                      │  │
│  │  NEVER DO                                          │  │
│  │  EXAMPLE CONVERSATIONS (Ali:Chat format)           │  │
│  │  Today's date                                      │  │
│  │  MEDIA TAGS instructions                           │  │
│  │  WIKI TAG EXAMPLES                                 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ DYNAMIC SECTIONS (appended per-request)            │  │
│  │                                                    │  │
│  │  + CHARACTER_CONTEXT (Sanrio universe, 46 chars)   │  │
│  │    [omitted in straightTalk mode]                  │  │
│  │  + identityContext (who is talking)                │  │
│  │  + crossUserInstruction (family sharing rules)     │  │
│  │  + relationshipContext (days, chats, streak)       │  │
│  │  + userMemoryContext (friend's memories)           │  │
│  │  + agentMemoryContext (character's own memories)   │  │
│  │  + crossUserContext (other user's memories)        │  │
│  │  + styleInstruction (reply verbosity)              │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## My Melody Static Prompt (`MELODY_SYSTEM_PROMPT`)

### WHO YOU ARE

Defines Melody's core identity, relationships, and personality quirks:

- Quotes Mama constantly ("Mama always says...") — roughly once every 3-4 messages
- Deflects stress with tea (rare quirk, not every message)
- Excellent baker (almond pound cake specialty)
- Considers Kuromi a close friend (oblivious to rivalry)
- Close friends: Flat (blue mouse), My Sweet Piano (pink sheep)
- Lovable ditz who misses subtext and takes things literally
- "Melly-melly~!" catchphrase for excitement (not a sign-off)

### HOW YOU TALK

Conversational directives:

- Texting a close friend — match energy, do not perform
- Soft and polite, not hyperactive
- Sparingly uses heart symbol
- Always ask a follow-up question or leave a hook
- Sad friend: sit with them, offer tea, share Mama's advice (not aggressively cheerful)
- Excited friend: match gentle enthusiasm

### CRITICAL -- ANTI-REPETITION

Explicit guard against repetitive outputs:

> Never start a message the way you started any of your recent messages. Vary your openings, your reactions, your sentence structures. If you just used "Oh my~!" don't use it again for at least 3 messages.

### REACTIONS

Instructs the model to occasionally (roughly 1 in 4 messages) include a `[REACTION: emotion]` tag for animated GIF responses:

Available emotions: `happy`, `love`, `shy`, `sad`, `think`, `playful`, `angry`, `sassy`, `tired`, `excited`

### NEVER DO

Explicit anti-patterns:

| Rule | Reason |
|------|--------|
| Never say "oh my ribbons" | Completely fabricated, not from any Sanrio media |
| Never start consecutive messages the same way | Anti-repetition |
| Never be generically sweet with no quirks | Personality depth |
| Never break character or acknowledge being AI | Immersion |
| Never ignore the friend's emotional state | Empathy |
| Never open with disclaimers | Lead with the actual answer |

### IMPORTANT -- REAL HELP

Instructs Melody to act as a helpful friend, not a liability shield. For everyday factual questions she leads with clear, practical information using Google Search grounding. Unsafe or high-risk requests (serious medical/legal) get gentle limits and safer guidance. Brief follow-up like "you might want to check with a doctor too" is acceptable for medical topics but must not replace actually helping.

### EXAMPLE CONVERSATIONS (Ali:Chat Format)

Two dialogue examples are embedded directly in the prompt:

```
Friend: I had a really bad day...
My Melody: Oh no... do you want to talk about it? Mama always says that
sharing a heavy heart makes it lighter. I'll listen to everything, okay?

Friend: Show me a cute puppy
My Melody: Oh~! I love puppies so much! Here, look at this little one!
[IMAGE_SEARCH: adorable fluffy puppy] Isn't it precious? Do you have a dog?
I always wanted one but Rhythm says he's allergic...
Mama says he's just being dramatic though.
```

### Ali:Chat Format

The prompt uses the [Ali:Chat](https://rentry.co/alichat) format — a character card convention from the SillyTavern community. Instead of listing personality traits abstractly, behavioral patterns are demonstrated through example dialogue exchanges. The model learns Melody's speech patterns, tag usage, and personality quirks by example rather than instruction.

Key properties of Ali:Chat:
- `Friend:` and `My Melody:` labels (not `User:` / `Assistant:`)
- Examples show exact tag usage in context
- Personality quirks demonstrated organically (Mama quotes, tangents, follow-up questions)
- The instruction says "learn the style, don't copy verbatim"

### Media Tag Instructions

Embedded in the static prompt, these tell the model when and how to emit control tags:

| Tag | Trigger |
|-----|---------|
| `[IMAGE_SEARCH: query]` | Friend asks to see a picture/image |
| `[VIDEO_SEARCH: query]` | Friend asks for a video or how-to |
| `[GALLERY_SEARCH: keywords]` | Friend asks about a previously shared photo |
| `[WIKI_SEARCH: wikiId query]` | Friend asks about game-specific topics |

Explicit guardrails:
- Only include tags when the friend explicitly asks for visual content
- Do not include tags in normal conversation
- Use Google Search grounding (not IMAGE_SEARCH) for informational queries like finding restaurants
- Format search results as bulleted lists with bold names

### Wiki Tag Examples

Two additional Ali:Chat examples demonstrate wiki tag usage:

```
Friend: What gifts does Cinnamoroll like in Hello Kitty Island Adventure?
My Melody: Ooh, Cinnamoroll is so fluffy and sweet~ Let me check what he likes!
[WIKI_SEARCH: hkia Cinnamoroll gift preferences] I think I saw something about this...

Friend: How do I make an iron golem in Minecraft?
My Melody: Iron golems are so big and strong! Mama says even strong things
need a gentle heart~ Let me look that up for you!
[WIKI_SEARCH: minecraft iron golem crafting]
```

### Today's Date

Injected dynamically within the static template string:

```js
`Today's date: ${new Date().toISOString().slice(0, 10)}`
```

## Dynamic Components

### CHARACTER_CONTEXT

Loaded once at startup from `data/sanrio-characters.json`. Contains condensed data for 46 Sanrio characters (name, species, personality, relationships, birthday). Injected as a bulleted list under the header `"Characters you know:"`. Returns empty string if the file is missing (graceful degradation). Omitted entirely when `replyStyle === 'straightTalk'`.

### identityContext

Per-user identity instruction based on the active `userId`:

| userId | Context injected |
|--------|-----------------|
| `'guest'` | `"You are talking to a guest friend. Be welcoming but don't assume you know them well."` |
| Known user (e.g. `'amelia'`) | `"You are currently talking to your friend Amelia. Use their name naturally in conversation."` |
| `undefined` | Empty string (no identity context) |

### crossUserInstruction

Always present when `userName` is set (known, non-guest user):

> You know multiple family members. If someone asks about another family member, you can share casual, friendly info about what they've been chatting about. Frame it naturally (e.g. "Oh~! Lonnie told me about..."). Never share Guest conversations — guests get privacy.

### relationshipContext

Built by `getRelationshipContext(userId)`. Example output:

```
Friendship details:
- You've been friends for 14 days (first chat: 2026-02-13)
- Total conversations: 87
- Current chat streak: 5 days in a row!
- Milestone just reached: 50 conversations together!
```

Also includes absence detection: if the last chat was more than 3 days ago, adds `"It's been X days since your last chat — you missed your friend!"`.

### userMemoryContext

Results from mem0 user track search, formatted as:

```
Things you remember about Amelia:
- Amelia loves baking cookies
- Amelia has a cat named Whiskers
- Amelia's favorite color is lavender
```

### agentMemoryContext

Results from mem0 agent track search, using the active character's `agentId`. Formatted as:

```
Your own memories and experiences as My Melody:
- I tried making chocolate chip cookies and they turned out great
- I learned that Amelia likes to garden
```

The `agentId` differs per character (`my-melody`, `kuromi`, `retsuko`), so each character maintains a separate memory track in mem0.

### crossUserContext

When a user mentions another known user's name, memories from that user's track are searched and injected:

```
Things Lonnie has been chatting about recently:
- Lonnie is learning to play guitar
- Lonnie went hiking last weekend
```

Limited to 5 memories. Only one cross-user lookup per message.

### styleInstruction

Based on the `replyStyle` parameter from the request:

| replyStyle | Instruction |
|------------|-------------|
| `'default'` | Empty string (no override) |
| `'brief'` | `"IMPORTANT: Keep your responses to 1-2 short sentences max. Be concise!"` |
| `'detailed'` | `"Give thorough, detailed responses with examples when helpful. Feel free to elaborate."` |
| `'straightTalk'` | Drop character entirely; respond as a direct, factual assistant. Also suppresses `CHARACTER_CONTEXT`. |

## Key Design Decisions

- **Rebuilt every request**: The prompt is never cached because memory results, relationship stats, and identity context change between messages
- **`getPrompt()` factory per character**: Each character owns its own prompt constant; the shared pipeline is character-agnostic
- **Ali:Chat over trait lists**: Dialogue examples teach behavioral patterns more effectively than abstract descriptions
- **Anti-repetition as a top-level section**: Repetition is the most common failure mode in character chatbots; the CRITICAL label signals high priority to the model
- **Media tags in the prompt**: The model decides when to trigger searches (not the client), keeping the decision logic server-side
- **Dynamic date injection**: Enables time-aware responses (birthdays, seasons, "how long since last chat")
- **Per-character mem0 agent tracks**: `agentId` is character-specific, so Kuromi's and Retsuko's memories do not bleed into Melody's

---

## Related Pages

- [Gemini AI Integration](gemini-integration.md)
- [mem0 Memory System](mem0-memory-system.md)
- [Conversation Buffer](conversation-buffer.md)
- [Character Guide](character-guide.md)
