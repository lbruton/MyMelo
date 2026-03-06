# Sanrio Universe

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 127-168: `loadCharacterData()`, `CHARACTER_CONTEXT`), `data/sanrio-characters.json`
> **Known gaps:** None

---

## Overview

The Sanrio universe system gives My Melody knowledge of 46 Sanrio characters so she can discuss them naturally in conversation. Character data is loaded from a JSON file at server startup, condensed into a prompt-injectable string, and appended to the system prompt on every chat request.

## Purpose

Without universe context, Melody would only know characters explicitly mentioned in her base system prompt (Kuromi, Flat, My Sweet Piano, Rhythm, Mama, Papa, Grandma, Grandpa). The Sanrio characters data file extends her knowledge to the full Sanrio roster — Hello Kitty, Cinnamoroll, Pompompurin, Aggretsuko, and 42 others — so she can:

- Discuss other Sanrio characters when users ask about them
- Reference relationships between characters accurately
- Share character-specific personality details and fun facts
- Respond to questions about character birthdays, species, and likes

## Data Source

**File:** `data/sanrio-characters.json`

**Attribution:** Character data derived from Hello Kitty Wiki (hellokitty.fandom.com) under CC-BY-SA 3.0 and Aggretsuko Wiki (aggretsuko.fandom.com).

**Version:** 1.0

## Character Profile Structure

Each character in the `characters` array has the following fields:

```json
{
  "name": "Cinnamoroll",
  "species": "Dog",
  "birthday": "March 6",
  "debutYear": 2001,
  "personality": "A fluffy white puppy who can fly using his big ears. Sweet, curious, and loves napping on clouds.",
  "relationships": {
    "bestFriend": "Cappuccino",
    "friends": ["Mocha", "Chiffon", "Espresso", "Milk"],
    "owner": "Cafe owner"
  },
  "universe": "cinnamoroll",
  "likes": "Napping on clouds, the Cafe, milk",
  "hometown": "Cafe Cinnamon"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Character display name |
| `species` | string | Yes | Animal type (e.g., "Cat", "Dog", "Rabbit") |
| `birthday` | string\|null | No | Birthday date (e.g., "November 1") |
| `debutYear` | number | No | Year the character was introduced by Sanrio |
| `personality` | string | Yes | Character description and personality traits |
| `relationships` | object | No | Named relationships (bestFriend, friends, rivals, family, etc.) |
| `universe` | string | No | Franchise grouping (e.g., "hello-kitty", "my-melody", "cinnamoroll") |
| `likes` | string | No | Things the character enjoys |
| `hometown` | string | No | Where the character lives |

## How It Loads at Startup

The `loadCharacterData()` function runs once when the server starts:

```
Server Start
    │
    ▼
loadCharacterData()
    │
    ├── Check: does data/sanrio-characters.json exist?
    │   │
    │   ├── NO  → console.warn, return '' (empty string)
    │   │
    │   └── YES → Parse JSON
    │       │
    │       ├── Extract characters array
    │       │
    │       ├── For each character, build condensed one-liner:
    │       │   "- {name}: {species}, {relationships}. {personality} Birthday: {birthday}."
    │       │
    │       └── Return: "\n\nCharacters you know:\n" + all lines joined
    │
    ▼
CHARACTER_CONTEXT = result (stored as module-level constant)
```

The function logs the character count on success:

```
Loaded 46 Sanrio characters for universe context
```

## Condensed Format

Each character is condensed into a single line for prompt efficiency:

```
- My Sweet Piano: Sheep, bestFriend: My Melody. Soft, kind, and girly. Birthday: July 6.
- Kuromi: Rabbit, bestFriend: Baku. Cheeky but charming. Birthday: October 31.
- Hello Kitty: Cat, bestFriend: Mimmy, twinSister: Mimmy. Cheerful and kind. Birthday: November 1.
```

The condensing logic in `loadCharacterData()`:

```js
const lines = chars.map(c => {
  const rel = c.relationships || {};
  const relStr = Object.entries(rel)
    .filter(([, v]) => typeof v === 'string')  // only string values (skip arrays)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  const bday = c.birthday ? ` Birthday: ${c.birthday}.` : '';
  return `- ${c.name}: ${c.species}${relStr ? `, ${relStr}` : ''}. ${c.personality}${bday}`;
});
```

Note: Only string-valued relationships are included in the condensed format. Array-valued relationships (like `friends: [...]`) are filtered out to save prompt tokens.

## System Prompt Injection

The condensed character context is appended to the system prompt on every chat request at line 722:

```js
const systemInstruction = SYSTEM_PROMPT + CHARACTER_CONTEXT + identityContext
  + crossUserInstruction + relationshipContext + userMemoryContext
  + agentMemoryContext + crossUserContext + styleInstruction;
```

`CHARACTER_CONTEXT` is always present in the prompt. It is loaded once and reused for all requests (not re-read from disk).

## Graceful Degradation

The app works fully without the `sanrio-characters.json` file:

| Scenario | Behavior |
|----------|----------|
| File missing | Warning logged: `sanrio-characters.json not found — character context disabled`. `CHARACTER_CONTEXT` is empty string. |
| File exists but invalid JSON | Warning logged: `Failed to load character data: {error}`. `CHARACTER_CONTEXT` is empty string. |
| File exists but `characters` array is empty | `CHARACTER_CONTEXT` is empty string. No warning. |
| File exists and valid | All characters loaded and injected into every prompt. |

In all failure cases, the app continues to function normally — Melody simply has less knowledge about the broader Sanrio universe and falls back to her base system prompt knowledge.

## How It Enhances Conversations

With universe context, Melody can handle questions like:

- "Who is Cinnamoroll?" — Melody knows he is a fluffy white puppy who flies with his ears
- "What's Kuromi really like?" — Melody can reference her diary writing and romantic side
- "Is Aggretsuko a Sanrio character?" — Melody knows about the red panda who does death metal karaoke
- "When is Hello Kitty's birthday?" — Melody can answer November 1

Without the data file, Melody would either not know these details or generate potentially inaccurate information from her base model training.

## Extensibility

To add new Sanrio characters:

1. Edit `data/sanrio-characters.json`
2. Add a new object to the `characters` array following the profile structure above
3. Restart the server (the file is read once at startup, not hot-reloaded)

To add characters from a new franchise:

1. Add the character objects with an appropriate `universe` value
2. Optionally update the `_attribution` field if sourcing from a new wiki

The condensing logic handles any character structure — no code changes are needed as long as the JSON follows the established schema.

## Character Count by Universe

The 46 characters span multiple Sanrio franchises:

| Universe | Example Characters |
|----------|--------------------|
| `my-melody` | My Sweet Piano, Flat, Kuromi, Baku, Rhythm, Mama, Papa, Grandma, Grandpa, Kuma, Kitsune, Zou, Risu, Fukurou |
| `hello-kitty` | Hello Kitty, Mimmy, Dear Daniel |
| `cinnamoroll` | Cinnamoroll, Cappuccino, Mocha, Chiffon, Espresso, Milk |
| `pompompurin` | Pompompurin, Muffin, Macaroon |
| `aggretsuko` | Aggretsuko (Retsuko), Haida, Fenneko, Director Ton |
| Various others | Keroppi, Badtz-Maru, Tuxedo Sam, Gudetama, KeroKeroKeroppi, and more |

---

## Related Pages

- [Character Guide](character-guide.md) — My Melody's own personality and speech patterns
- [Relationship Tracking](relationship-tracking.md) — Friendship stats injected alongside character context
- [User Identity](user-identity.md) — Identity context also appended to system prompt
