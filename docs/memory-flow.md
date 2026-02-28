# Memory Architecture — My Melody Chat

## Overview

Three independent memory layers work together to give Melody context:

| Layer | Storage | Scope | Lifetime |
|-------|---------|-------|----------|
| **Conversation Buffer** | Server RAM (`Map`) | Per browser tab (sessionId) | 1 hour, max 6 exchanges |
| **mem0 Dual-Track** | mem0 cloud API | Per user + global agent | Permanent (until deleted) |
| **Relationship Stats** | `data/relationship.json` | Per user | Permanent (Docker volume) |

---

## Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        USER SENDS MESSAGE                           │
│                     POST /api/chat { message }                      │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Update Relationship  │
                    │  (relationship.json)  │
                    │  ─ totalChats++       │
                    │  ─ streak calc        │
                    │  ─ milestone check    │
                    └───────────┬───────────┘
                                │
                                ▼
              ┌─────────────────┴─────────────────┐
              │     PARALLEL: Search mem0          │
              │                                    │
              ▼                                    ▼
   ┌───────────────────┐             ┌───────────────────┐
   │  User Track Search │             │ Agent Track Search │
   │  POST /v2/memories/ │             │ POST /v2/memories/  │
   │       search/       │             │       search/       │
   │  query: user msg   │             │  query: user msg   │
   │  user_id:          │             │  agent_id:         │
   │   melody-friend-   │             │   my-melody        │
   │   {userId}         │             │  top_k: 5          │
   │  top_k: 10         │             │  rerank: true      │
   │  rerank: true      │             │                    │
   └────────┬───────────┘             └────────┬───────────┘
            │                                  │
            │  (optional: cross-user search     │
            │   if message mentions another     │
            │   family member by name)          │
            │                                  │
            └──────────┬───────────────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │   BUILD SYSTEM PROMPT    │
          │                          │
          │  Base character prompt   │
          │  + 46 Sanrio characters  │
          │  + identity context      │
          │  + relationship stats    │
          │  + user memories (≤10)   │
          │  + agent memories (≤5)   │
          │  + cross-user context    │
          │  + reply style instruction│
          └────────────┬─────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │  GET SESSION BUFFER      │
          │  (last 6 exchanges       │
          │   for this browser tab)  │
          └────────────┬─────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │   CALL GEMINI API        │
          │                          │
          │  systemInstruction: ^    │
          │  contents: buffer + msg  │
          │  tools: googleSearch     │
          └────────────┬─────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │   GEMINI RESPONSE        │
          │   (may contain tags:     │
          │    [IMAGE_SEARCH: ...]   │
          │    [WIKI_SEARCH: ...]    │
          │    [REACTION: ...] )     │
          └────────────┬─────────────┘
                       │
                       ▼
          ┌──────────────────────────┐
          │  POST-RESPONSE (parallel)│
          │                          │
          │  1. Add to session buffer│
          │  2. Save to mem0 ──────────────────────────┐
          │     (fire-and-forget)    │                  │
          │  3. Return response      │                  │
          └──────────────────────────┘                  │
                                                        │
                       ┌────────────────────────────────┘
                       │
                       ▼
         ┌─────────────┴──────────────┐
         │                            │
         ▼                            ▼
┌─────────────────┐       ┌─────────────────────┐
│ User Track Save │       │  Agent Track Save   │
│ POST /v1/memories│       │  POST /v1/memories  │
│                 │       │                     │
│ messages: [     │       │  messages: [        │
│   {user: msg},  │       │    {user: msg},     │
│   {asst: reply} │       │    {asst: reply}    │
│ ]               │       │  ]                  │
│ user_id:        │       │  agent_id:          │
│  melody-friend- │       │   my-melody         │
│  {userId}       │       │  infer: true        │
│ infer: true     │       │                     │
│                 │       │  (shared across     │
│ (skipped for    │       │   ALL users)        │
│  guest users)   │       │                     │
└─────────────────┘       └─────────────────────┘
```

---

## What Each Layer Does

### 1. Conversation Buffer (Short-Term)

The **only** layer that provides multi-turn context within a single chat session.

- **Where:** Server RAM, `sessionBuffers` Map
- **Key:** `sessionId` (UUID created per browser tab, stored in `sessionStorage`)
- **Capacity:** 6 exchanges (12 messages) per session, sliding window
- **Pruning:** Sessions older than 1 hour are evicted every 10 minutes
- **Max sessions:** 1,000 (oldest evicted when limit hit)

Without this buffer, every message would be a standalone request — Melody would have no idea what you just said 2 messages ago.

### 2. mem0 Dual-Track (Long-Term)

Permanent memory that persists across sessions, browser clears, and restarts.

**User Track** — Facts Melody remembers about each person:

- `user_id: melody-friend-lonnie` (per-user identity)
- Stores: name, preferences, life events, interests, things they've shared
- Searched with the user's message as the query (semantic search, top 10)
- Injected as "Things you remember about Lonnie:" in the system prompt
- Guest users skip this track entirely

**Agent Track** — Melody's own evolving personality:

- `agent_id: my-melody` (shared globally, same for all users)
- Stores: Melody's opinions, experiences, emotional growth, things she's learned
- Searched with the user's message as the query (semantic search, top 5)
- Injected as "Your own memories and experiences:" in the system prompt

**How mem0 decides what to store:**

- `infer: true` tells mem0 to auto-extract key facts from the conversation
- mem0's AI decides what's worth remembering — not every message creates a memory
- The full `[user message, assistant reply]` pair is sent so mem0 has context

### 3. Relationship Stats (Friendship Tracking)

Numeric stats about the friendship, stored locally in `data/relationship.json`.

- **Per-user keys:** `amelia`, `lonnie`, `guest`, `_legacy`
- **Tracks:** `firstChat`, `totalChats`, `streakDays`, `lastChatDate`, `milestones`
- **Milestones:** Triggered at 10, 25, 50, 100, 250, 500, 1,000 chats
- **Injected into prompt** as natural language: "You've been friends for 42 days..."

---

## Welcome Flow Memory

First-time users go through an interactive onboarding that saves structured memories:

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  "What's     │     │  "Favorite   │     │  "What do    │
│  your name?" │────▶│  color?"     │────▶│  you like    │
│              │     │              │     │  to do?"     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       ▼                    ▼                    ▼
  POST /api/welcome    POST /api/welcome    POST /api/welcome
  type: "name"         type: "color"        type: "interests"
       │                    │                    │
       ▼                    ▼                    ▼
  mem0 save:           mem0 save:           mem0 save:
  "Friend's name       "Friend's favorite   "Friend's interests
   is Lonnie"           color is blue"       include: gaming"
       │
       ▼
  relationship.json
  initialized with
  firstChat = today
```

**Returning users** are detected server-side via `relationship.json` (has `firstChat`), so onboarding is skipped even if localStorage is cleared.

---

## Current Limitations

### No Local Buffering Before mem0

There is **no batching or local queue** — every single chat exchange fires two HTTP requests to mem0 immediately (fire-and-forget). If mem0 is down, those memories are silently lost.

### mem0 Controls What Gets Stored

The `infer: true` flag means mem0's AI decides what facts to extract. We send the full conversation pair but have no control over what mem0 actually persists. This is why memory labels sometimes say things like "user's friend is named Lonnie" — that's mem0's own phrasing, not ours.

### No Rolling Summary

Older conversations are never summarized. The session buffer drops messages after 6 exchanges, and mem0 stores individual facts — but there's no condensed "story so far" that captures the arc of the friendship.

### No Entity Graph

People, pets, places, and relationships mentioned in chat are not tracked structurally. mem0 stores flat facts, not a connected graph of entities.

### Session Buffer Is Server RAM Only

If the container restarts, all session buffers are lost. The next message in that browser tab will have no multi-turn context (though mem0 long-term memories still work).

---

## Optimization Roadmap

Research into mem0's platform features (Feb 2026) revealed several capabilities we're not using. Prioritized by effort vs. impact:

### Tier 1 — Quick Wins (one patch, low effort, high impact)

#### 1. Custom Instructions (project-level)

One API call configures what mem0 extracts from every conversation. Right now `infer: true` uses mem0's generic extraction — it decides what matters, which is why we get noise like "user said hello" and odd phrasing like "user's friend is named Lonnie."

```text
PUT /v1/projects/{project_id}

custom_instructions:
  TASK: Extract memories from conversations between a user and My Melody (Sanrio character).

  EXTRACT:
  - User's name, family members, pets, close friends
  - Hobbies, interests, favorite games, favorite foods, favorite colors
  - Emotional events (milestones, sad moments, achievements, struggles)
  - Preferences (conversation style, topics they enjoy)
  - Things the user explicitly asked to be remembered
  - Games played (especially Hello Kitty Island Adventure, Minecraft)
  - Favorite Sanrio characters

  FORMAT:
  - Use the user's name, not "user" or "friend" (e.g., "Lonnie likes blue" not "User's friend likes blue")
  - One fact per memory entry, keep it concise
  - Preserve emotional context ("Lonnie was excited about..." not just "Lonnie got a job")

  EXCLUDE:
  - Greetings, small talk, pleasantries ("hi", "how are you", "thanks")
  - Melody's character dialogue and roleplay text
  - Search queries and wiki lookups
  - Image descriptions from vision analysis
  - Temporary states
```

#### 2. Custom Categories

Replace mem0's default 15 generic categories with companion-specific ones. Memories are auto-classified on ingestion.

```text
PUT /v1/projects/{project_id}

custom_categories:
  - personal_info: "Name, age, birthday, location, family members"
  - interests_hobbies: "Games, hobbies, activities, creative projects"
  - emotional_events: "Life milestones, emotional moments, achievements, struggles"
  - preferences: "Favorite foods, colors, Sanrio characters, music, style"
  - relationships: "Friends, family dynamics, pets, people they mention"
  - gaming: "Games played, in-game progress, characters, strategies"
  - requests: "Things the user explicitly asked Melody to remember"
  - melody_personality: "Melody's own opinions, experiences, evolving traits"
```

Enables filtered retrieval — fetch `gaming` memories for wiki queries, `emotional_events` for emotional support, etc.

#### 3. Search Improvements (threshold + rerank)

We now use `top_k` and `rerank` for better retrieval quality:

```javascript
// Current (v2.5.1)
{ query, filters: { user_id }, top_k: 10, rerank: true }

// Future improvement
{ query, filters: { user_id }, top_k: 10, threshold: 0.3, rerank: true }
```

- `rerank: true` — re-ranks results for better ordering after initial retrieval (enabled in v2.5.1)
- `threshold: 0.3` — filters out low-relevance noise (not yet enabled, future improvement)

#### 4. Metadata on Saves

Attach context to every memory for future filtering:

```javascript
// Current
{ messages: [...], user_id, infer: true }

// Improved
{ messages: [...], user_id, infer: true, metadata: {
    source: 'chat',           // vs 'welcome', 'image_caption'
    session_id: sessionId,
    has_image: !!imageBase64,
    reply_style: replyStyle
}}
```

### Tier 2 — Medium Effort, High Impact

#### 5. Criteria-Based Retrieval

Weighted scoring that re-ranks memories beyond semantic similarity. Useful for emotional context — "User's dog passed away" should rank higher than "User likes pizza" when user says "I'm feeling sad."

```text
PUT /v1/projects/{project_id}

retrieval_criteria:
  - name: emotional_significance
    description: "How emotionally important this memory is to the friendship"
    weight: 3
  - name: personal_relevance
    description: "How personally revealing or specific this fact is"
    weight: 2
  - name: actionability
    description: "Whether Melody can naturally reference this in conversation"
    weight: 2
```

#### 6. Rolling Session Summaries

At session end (or every N messages), summarize the conversation and store as a memory:

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Session ends     │────▶│ Gemini summarizes │────▶│ mem0 save with  │
│ (tab close or    │     │ the full session  │     │ infer: false    │
│  6+ exchanges)   │     │ buffer            │     │ source: summary │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

Enables "last time we talked about..." context on next visit. Store with `infer: false` (raw summary, don't re-extract) and metadata `{ source: 'session_summary' }`.

### Tier 3 — Larger Features (own spec required)

#### 7. Entity Graph

Track relationships between entities mentioned in chat (people, pets, places). mem0 stores flat facts — an entity layer would connect "Lonnie's dog Max" → "Max is a golden retriever" → "Max passed away in February."

#### 8. Closeness Score

Numeric friendship level derived from chat frequency, emotional depth, and shared experiences. Subtly shifts Melody's openness, playfulness, and vulnerability over time.

#### 9. Session-Scoped mem0 Memory

Replace the in-memory `sessionBuffers` Map with mem0's `session_id` scoping. Session context survives server restarts and enables cross-session "we were just talking about..." references.

---

## Sources

- [mem0 Custom Instructions](https://docs.mem0.ai/platform/features/custom-instructions)
- [mem0 Custom Categories](https://docs.mem0.ai/platform/features/custom-categories)
- [mem0 Criteria Retrieval](https://docs.mem0.ai/platform/features/criteria-retrieval)
- [mem0 Search API Reference](https://docs.mem0.ai/api-reference/memory/search-memories)
- [mem0 Memory Types](https://docs.mem0.ai/core-concepts/memory-types)
- [mem0 Companion Guide](https://mem0.ai/blog/how-to-add-long-term-memory-to-ai-companions-a-step-by-step-guide)
- [LLM Chat History Summarization Guide](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)
- [mem0 Research: 26% Accuracy Boost](https://mem0.ai/research)
