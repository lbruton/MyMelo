# mem0 Memory System

> **Last verified:** 2026-03-06
> **Source files:** `server.js` (lines 62-69, 71-86, 84-120, 512-640)
> **Known gaps:** None

---

## Overview

My Melody Chat uses [mem0](https://mem0.ai) for persistent long-term memory. The system operates on a dual-track architecture: one track stores facts about the user (friend), and one stores the active character's own evolving personality. Both tracks are searched and injected into the system prompt on every chat request.

The user track is **shared across all characters** — the same friend facts apply regardless of who you are chatting with. The agent track is **per-character** — each character has an isolated memory namespace so their personalities evolve independently.

## Dual-Track Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    mem0 Cloud API                        │
│                  api.mem0.ai                             │
├───────────────────────┬─────────────────────────────────┤
│    User Track         │    Agent Track                  │
│    (Friend Facts)     │    (Character Personality)      │
├───────────────────────┼─────────────────────────────────┤
│ Filter:               │ Filter:                         │
│   user_id: per-user   │   agent_id: per-character       │
│   (melody-friend-*)   │   (see Character Agent IDs)     │
│                       │                                 │
│ Scope:                │ Scope:                          │
│   SHARED across all   │   ISOLATED per character        │
│   characters          │                                 │
│                       │                                 │
│ Contains:             │ Contains:                       │
│ - Friend's name       │ - Character's opinions          │
│ - Preferences         │ - Experiences                   │
│ - Life events         │ - Evolving personality          │
│ - Interests           │ - Learned behaviors             │
│ - Favorite color      │                                 │
├───────────────────────┼─────────────────────────────────┤
│ Search limit: 10      │ Search limit: 5                 │
│ Save: skip for guest  │ Save: always (unless            │
│                       │   skipAgentTrack set)           │
└───────────────────────┴─────────────────────────────────┘
```

## Character Agent IDs

Each character in the `CHARACTERS` registry has its own isolated `agentId` in mem0:

| Character key | Display name | mem0 `agent_id` |
|---------------|-------------|-----------------|
| `melody` | My Melody | `my-melody` |
| `kuromi` | Kuromi | `kuromi` |
| `retsuko` | Aggretsuko | `retsuko` |

The `MEM0_AGENT_ID` constant (`'my-melody'`) is the backward-compatibility fallback used when no character is passed. It is also the hardcoded default for any code path that does not yet pass a character object.

## Per-User Memory Isolation

Each known user has an isolated user track in mem0. The `KNOWN_USERS` map defines the identity-to-mem0-ID mapping:

```js
const KNOWN_USERS = {
  amelia: { name: 'Amelia', mem0Id: 'melody-friend-amelia' },
  lonnie: { name: 'Lonnie', mem0Id: 'melody-friend-lonnie' },
  guest:  { name: 'Guest',  mem0Id: 'melody-friend-guest' }
};
```

### getUserMemId() Function

Resolves a `userId` key to a mem0 `user_id` string:

```js
function getUserMemId(userId) {
  if (userId && KNOWN_USERS[userId]) return KNOWN_USERS[userId].mem0Id;
  return MEM0_USER_ID; // fallback: 'melody-friend'
}
```

| Input | Output |
|-------|--------|
| `'amelia'` | `'melody-friend-amelia'` |
| `'lonnie'` | `'melody-friend-lonnie'` |
| `'guest'` | `'melody-friend-guest'` |
| `undefined` | `'melody-friend'` (env var fallback) |
| `'unknown'` | `'melody-friend'` (env var fallback) |

The fallback `MEM0_USER_ID` defaults to `'melody-friend'` and can be overridden via the `MEM0_USER_ID` environment variable.

## API Endpoints Used

| Operation | mem0 Endpoint | Method | Notes |
|-----------|---------------|--------|-------|
| Search memories | `/v2/memories/search/` | POST | Semantic search with filters, `rerank: true` |
| List memories | `/v1/memories/?user_id=X` | GET | List all for a user track |
| List memories | `/v1/memories/?agent_id=X` | GET | List all for an agent track |
| Save memories | `/v1/memories/` | POST | With `infer: true` |
| Delete memory | `/v1/memories/:id/` | DELETE | By mem0 ID |

All requests include the header `Authorization: Token ${MEM0_KEY}`.

## Memory Search Flow

On every chat request, both tracks are searched in parallel:

```
┌────────────────────────────────────────┐
│          POST /api/chat                │
│          message received              │
├────────────────────────────────────────┤
│                                        │
│  searchQuery = message || 'image shared'
│                                        │
│  Promise.all([                         │
│    searchMemories(query, userId),      │
│    searchAgentMemories(query,          │
│                        characterId)    │
│  ])                                    │
│                                        │
│  ┌──────────────┐ ┌──────────────────┐ │
│  │ User track   │ │ Agent track      │ │
│  │ POST v2/     │ │ POST v2/         │ │
│  │ memories/    │ │ memories/        │ │
│  │ search/      │ │ search/          │ │
│  │              │ │                  │ │
│  │ filter:      │ │ filter:          │ │
│  │  user_id     │ │  agent_id:       │ │
│  │  (per-user)  │ │  (per-character) │ │
│  │ top_k: 10    │ │ top_k: 5        │ │
│  └──────┬───────┘ └────────┬─────────┘ │
│         │                  │           │
│         └────────┬─────────┘           │
│                  ▼                     │
│     Inject into system prompt          │
└────────────────────────────────────────┘
```

### searchMemories(query, userId)

Searches the user track (friend facts). User track is shared across all characters.

```js
body: JSON.stringify({
  query,
  filters: { user_id: getUserMemId(userId) },
  top_k: 10,
  rerank: true
})
```

Returns `data.results || data || []`. Returns empty array on any error.

### searchAgentMemories(query, characterId?)

Searches the active character's agent track (character personality). Resolves `agentId` from the `CHARACTERS` registry via `getCharacter(characterId).agentId`. Falls back to `MEM0_AGENT_ID` env var when `characterId` is `null` or omitted.

```js
async function searchAgentMemories(query, characterId = null) {
  const agentId = characterId ? getCharacter(characterId).agentId : MEM0_AGENT_ID;
  // ...
  body: JSON.stringify({
    query,
    filters: { agent_id: agentId },
    top_k: 5,
    rerank: true
  })
}
```

| `characterId` | Resolved `agent_id` |
|---------------|---------------------|
| `'melody'` | `'my-melody'` |
| `'kuromi'` | `'kuromi'` |
| `'retsuko'` | `'retsuko'` |
| `null` / omitted | `MEM0_AGENT_ID` (`'my-melody'`) |

Same return pattern and error handling as the user track search.

## Memory Save Flow

After every chat exchange, both tracks are saved to in a fire-and-forget pattern (non-blocking). The `character` parameter determines which agent track receives the save.

```js
function saveToMemory(userMessage, assistantReply, userId, meta = {}, character = null) {
  // User track: facts about the friend (skip for guest — no persistent identity)
  if (userId !== 'guest') {
    fetch(`${MEM0_BASE}/v1/memories/`, {
      // ...
      body: JSON.stringify({
        messages: [ { role: 'user', content: userMessage },
                    { role: 'assistant', content: assistantReply } ],
        user_id: getUserMemId(userId),
        infer: true,
        metadata
      })
    }).catch(err => console.error('mem0 user save error:', err.message));
  }

  // Agent track: character's own evolving personality
  if (meta.skipAgentTrack) return;
  const agentId = character ? character.agentId : MEM0_AGENT_ID;
  fetch(`${MEM0_BASE}/v1/memories/`, {
    // ...
    body: JSON.stringify({
      messages: [ { role: 'user', content: userMessage },
                  { role: 'assistant', content: assistantReply } ],
      agent_id: agentId,
      infer: true,
      metadata
    })
  }).catch(err => console.error('mem0 agent save error:', err.message));
}
```

Key behaviors:
- The `infer: true` flag tells mem0 to extract and store structured facts automatically
- Both tracks receive the full `[user, assistant]` message pair plus optional `metadata` (source, sessionId, hasImage, replyStyle)
- Guest users (`userId === 'guest'`) skip the user track save entirely
- When `meta.skipAgentTrack` is `true` the agent track save is skipped entirely (used by Straight Talk mode to avoid polluting character persona with out-of-character content)
- Agent track `agentId` is resolved from `character.agentId` when a character object is passed; falls back to `MEM0_AGENT_ID` when `character` is `null`
- User track is always shared — the same friend facts persist regardless of which character is active
- Errors are caught and logged but never propagate to the caller

### Function Signature

```js
saveToMemory(userMessage, assistantReply, userId, meta?, character?)
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userMessage` | `string` | Yes | User's message text |
| `assistantReply` | `string` | Yes | Character's response text |
| `userId` | `string` | Yes | User key (`'amelia'`, `'lonnie'`, `'guest'`) |
| `meta` | `Object` | No | `{ source, sessionId, hasImage, replyStyle, skipAgentTrack }` |
| `character` | `Object\|null` | No | Character config from `getCharacter()`. When `null`, uses `MEM0_AGENT_ID` fallback. |

## Memory Injection into System Prompt

Memories are formatted and appended to the system prompt as labeled sections:

```js
// User track
const userMemoryContext = userMemories.length > 0
  ? `\n\nThings you remember about ${userName || 'your friend'}:\n` +
    userMemories.map(m => `- ${m.memory || m.text || m.content || JSON.stringify(m)}`)
      .join('\n')
  : '';

// Agent track
const agentMemoryContext = agentMemories.length > 0
  ? '\n\nYour own memories and experiences as My Melody:\n' +
    agentMemories.map(m => `- ${m.memory || m.text || m.content || JSON.stringify(m)}`)
      .join('\n')
  : '';
```

The memory field accessor chain (`m.memory || m.text || m.content || JSON.stringify(m)`) handles different mem0 response formats gracefully.

## Cross-User Memory Access

When a known user mentions another known user's name in their message, the server searches that user's memory track to enable the character to share casual cross-user information:

```js
for (const [key, config] of Object.entries(KNOWN_USERS)) {
  if (key === userId || key === 'guest') continue;  // skip self, skip guest
  if (msgLower.includes(config.name.toLowerCase())) {
    const crossMemories = await searchMemories(message, key);
    // inject up to 5 memories as cross-user context
    break;  // only one cross-reference per message
  }
}
```

- Guest conversations are never shared (privacy)
- Only one cross-user lookup per message (first name match wins)
- Cross-user context is labeled: `"Things {Name} has been chatting about recently:"`

## Guest User Behavior

| Operation | Guest behavior |
|-----------|---------------|
| Memory search | Searches `melody-friend-guest` track |
| Memory save (user track) | **Skipped** — no persistent identity |
| Memory save (agent track) | Saved (character still learns from guest conversations) |
| Cross-user access | Never shared (guest privacy protected) |
| Welcome onboarding | User track save skipped |

## Frontend Memories Tab

The `GET /api/memories` endpoint fetches both tracks in parallel and labels them:

```js
const userMemories = (userData.results || userData || [])
  .map(m => ({ ...m, track: 'friend' }));
const agentMemories = (agentData.results || agentData || [])
  .map(m => ({ ...m, track: 'melody' }));
```

Combined results are sorted by `updated_at || created_at` descending (newest first). The frontend displays them with "Friend" and "Melody" labels.

The endpoint accepts a `userId` query parameter to load the correct user's memories:

```
GET /api/memories?userId=amelia
```

## Memory Deletion

Individual memories can be deleted via:

```
DELETE /api/memories/:id
```

This proxies to mem0's `DELETE /v1/memories/:id/` endpoint. Returns `{ ok: true }` on success or the mem0 status code on failure.

## Error Handling

All mem0 operations degrade gracefully:

| Operation | Failure behavior |
|-----------|-----------------|
| Search (user track) | Returns `[]`, chat works without user memories |
| Search (agent track) | Returns `[]`, chat works without agent memories |
| Save (user track) | Error logged, no user impact |
| Save (agent track) | Error logged, no user impact |
| List (memories tab) | Returns 500 with `'Failed to fetch memories'` |
| Delete | Returns mem0's HTTP status code |
| Cross-user search | Error logged, cross-user context omitted |

Chat always works even when mem0 is completely unavailable. The system prompt simply has no memory sections injected.

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `MEM0_API_KEY` | Yes | -- | mem0.ai API authentication token |
| `MEM0_USER_ID` | No | `'melody-friend'` | Default user track ID (fallback) |

> **Note:** `MEM0_AGENT_ID` is not an environment variable — it is hardcoded as `'my-melody'` in `server.js` and serves only as the backward-compatibility fallback when no character is passed to `searchAgentMemories` or `saveToMemory`. Character-specific agent IDs are defined in the `CHARACTERS` registry.

---

## Related Pages

- [System Prompt Architecture](system-prompt.md)
- [Gemini AI Integration](gemini-integration.md)
- [Conversation Buffer](conversation-buffer.md)
