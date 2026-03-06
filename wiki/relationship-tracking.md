# Relationship Tracking

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 345-452: `updateRelationship()`, `getRelationshipContext()`), `public/app.js` (lines 767-795: `loadRelationshipStats()`)
> **Known gaps:** Closeness score (numeric friendship level) planned but not yet implemented (Linear HKF-2)

---

## Overview

The relationship tracking system maintains per-user friendship statistics that evolve over time. Stats are persisted to `data/relationship.json`, injected into the system prompt so Melody knows the friendship history, and displayed as stat cards in the frontend Memories tab.

## Data Structure

The `relationship.json` file uses a **keyed per-user format** (version 2). Each known user has their own stats object.

```json
{
  "_version": 2,
  "_legacy": {
    "firstChat": "2026-02-20",
    "totalChats": 42,
    "lastChatDate": "2026-02-27",
    "streakDays": 3,
    "lastStreakDate": "2026-02-27",
    "milestones": ["chats-10", "chats-25"]
  },
  "amelia": {
    "firstChat": "2026-02-25",
    "totalChats": 15,
    "lastChatDate": "2026-02-27",
    "streakDays": 3,
    "lastStreakDate": "2026-02-27",
    "milestones": ["chats-10"]
  },
  "lonnie": {
    "firstChat": "2026-02-25",
    "totalChats": 8,
    "lastChatDate": "2026-02-26",
    "streakDays": 2,
    "lastStreakDate": "2026-02-26",
    "milestones": []
  },
  "guest": {
    "firstChat": null,
    "totalChats": 0,
    "lastChatDate": null,
    "streakDays": 0,
    "lastStreakDate": null,
    "milestones": []
  }
}
```

## Per-User Stats Fields

| Field | Type | Description |
|-------|------|-------------|
| `firstChat` | `string\|null` | ISO date string (YYYY-MM-DD) of first conversation. Set on first welcome interaction or first chat. |
| `totalChats` | `number` | Lifetime message count. Incremented on every `/api/chat` call. |
| `lastChatDate` | `string\|null` | ISO date string of the most recent chat. Updated every chat. |
| `streakDays` | `number` | Consecutive days chatting. Resets to 1 if more than 1 day gap. |
| `lastStreakDate` | `string\|null` | ISO date string of the last streak calculation. Used for day-difference math. |
| `milestones` | `string[]` | Array of milestone keys reached (e.g., `"chats-10"`, `"chats-25"`). |

## Milestone Trigger Points

| Milestone | Trigger |
|-----------|---------|
| `chats-10` | 10 total conversations |
| `chats-25` | 25 total conversations |
| `chats-50` | 50 total conversations |
| `chats-100` | 100 total conversations |
| `chats-250` | 250 total conversations |
| `chats-500` | 500 total conversations |
| `chats-1000` | 1000 total conversations |

Milestones are checked after each chat increment. Each milestone fires exactly once — the key is added to the `milestones` array and never duplicated.

## Streak Calculation Logic

The streak is calculated in `updateRelationship()` by comparing today's date to `lastStreakDate`:

```
┌─────────────────────────────┐
│  diffDays = today - lastStreakDate  │
├─────────────────────────────┤
│  diffDays === 0  →  no change (same day)       │
│  diffDays === 1  →  streakDays += 1 (continue) │
│  diffDays > 1    →  streakDays = 1 (reset)     │
│  no lastStreakDate → streakDays = 1 (init)      │
└─────────────────────────────┘
```

After calculation, `lastStreakDate` is set to today regardless of outcome.

## incrementChatCount() Flow

The `updateRelationship(userId)` function is called at the start of every `/api/chat` request:

```
POST /api/chat
    │
    ▼
updateRelationship(userId)
    │
    ├── Read relationship.json
    │
    ├── Migration check: if no _version key, convert flat → keyed format
    │
    ├── Resolve userKey: known user ID or '_legacy' fallback
    │
    ├── Set firstChat if null (first ever chat)
    │
    ├── Increment totalChats
    │
    ├── Calculate streak (see logic above)
    │
    ├── Set lastStreakDate and lastChatDate to today
    │
    ├── Check milestone triggers (10, 25, 50, 100, 250, 500, 1000)
    │
    ├── Write updated data back to relationship.json
    │
    └── Return updated RelationshipStats for this user
```

## Context Injection into System Prompt

The `getRelationshipContext(userId)` function builds a string injected into the system prompt on every chat request. It includes:

- Days together (calculated from `firstChat` to today)
- Total conversations count
- Current streak (only shown if > 1 day)
- Most recent milestone reached
- Absence gap warning (if > 3 days since last chat)

Example injected context:

```
Friendship details:
- You've been friends for 7 days (first chat: 2026-02-20)
- Total conversations: 42
- Current chat streak: 3 days in a row!
- Milestone just reached: 25 conversations together!
```

This context is appended to the system prompt at line 722 in `server.js`:

```js
const systemInstruction = SYSTEM_PROMPT + CHARACTER_CONTEXT + identityContext
  + crossUserInstruction + relationshipContext + userMemoryContext
  + agentMemoryContext + crossUserContext + styleInstruction;
```

## Frontend Display

The Memories tab displays three stat cards at the top via `loadRelationshipStats()`:

```
┌────────────┐  ┌────────────┐  ┌────────────┐
│     7      │  │     42     │  │      3     │
│    Days    │  │   Chats    │  │   Streak   │
└────────────┘  └────────────┘  └────────────┘
```

- **Days** — calculated as `daysTogether` from the API response
- **Chats** — `totalChats` from the API response
- **Streak** — `streakDays` from the API response

Stats are fetched on every Memories tab load via `GET /api/relationship?userId=<activeUser>`.

## Legacy Data Migration

When the system encounters a `relationship.json` without a `_version` key, it automatically migrates from the flat format (pre-v2.5) to the keyed format:

1. The existing flat data is preserved under the `_legacy` key
2. A `_version: 2` flag is set
3. Empty stat objects are created for each key in `KNOWN_USERS`
4. The migrated structure is written back to disk
5. If no `userId` was provided, the legacy data is returned for backward compatibility

## API Endpoint

### GET /api/relationship

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | query string | No | User key (e.g., `amelia`, `lonnie`, `guest`). Falls back to legacy data if omitted. |

**Response (200):**

```json
{
  "daysTogether": 7,
  "totalChats": 42,
  "streakDays": 3,
  "firstChat": "2026-02-20",
  "milestones": ["chats-10", "chats-25"]
}
```

---

## Related Pages

- [User Identity](user-identity.md) — Per-user isolation that keys relationship stats
- [Welcome Flow](welcome-flow.md) — Initializes relationship on first welcome interaction
- [Character Guide](character-guide.md) — How relationship context shapes Melody's personality
