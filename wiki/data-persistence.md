# Data Persistence

> **Last verified:** 2026-02-27 — audited from `server.js` v2.5.0, `public/app.js` v2.5.0, `public/sw.js`
> **Source files:** `server.js`, `public/app.js`, `public/sw.js`
> **Known gaps:** None

---

## Overview

Data is stored in four tiers:

1. **Server-side files** — JSON files and uploaded images inside the Docker volume
2. **Client-side localStorage** — User preferences and welcome state (per browser)
3. **Client-side sessionStorage** — Session identifiers (per tab)
4. **In-memory** — Conversation session buffers (lost on server restart)
5. **Cloud** — mem0 persistent memory (survives container rebuilds)

---

## Server-Side Files (Docker Volume)

All server-side data lives under `/app/data/` inside the container, mounted as the `melody-data` Docker named volume.

| File/Directory | Purpose | Created At |
|----------------|---------|------------|
| `relationship.json` | Friendship stats (per-user keyed) | Server startup (if missing) |
| `images-meta.json` | Image gallery metadata array | Server startup (if missing, initialized as `[]`) |
| `sanrio-characters.json` | Sanrio character universe data (46 characters) | Manual deployment via `docker cp` |
| `images/` | User-uploaded image files (UUID filenames) | Server startup (`mkdir -p`) |

### relationship.json

Per-user keyed structure with automatic migration from legacy flat format. The `_version` field indicates the keyed format is active.

```json
{
  "_version": 2,
  "_legacy": {
    "firstChat": "2026-02-15",
    "totalChats": 30,
    "lastChatDate": "2026-02-20",
    "streakDays": 3,
    "lastStreakDate": "2026-02-20",
    "milestones": ["chats-10", "chats-25"]
  },
  "amelia": {
    "firstChat": "2026-02-20",
    "totalChats": 42,
    "lastChatDate": "2026-02-27",
    "streakDays": 5,
    "lastStreakDate": "2026-02-27",
    "milestones": ["chats-10", "chats-25"]
  },
  "lonnie": {
    "firstChat": "2026-02-22",
    "totalChats": 15,
    "lastChatDate": "2026-02-27",
    "streakDays": 2,
    "lastStreakDate": "2026-02-27",
    "milestones": ["chats-10"]
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

| Field | Type | Description |
|-------|------|-------------|
| `_version` | `number` | Format version (currently `2`) |
| `_legacy` | `Object` | Pre-v2.5 data preserved during migration |
| `{userId}` | `Object` | Per-user stats keyed by user ID (`amelia`, `lonnie`, `guest`) |
| `firstChat` | `string\|null` | ISO date of first conversation |
| `totalChats` | `number` | Lifetime message count |
| `lastChatDate` | `string\|null` | ISO date of most recent chat |
| `streakDays` | `number` | Consecutive days with at least one chat |
| `lastStreakDate` | `string\|null` | ISO date used for streak calculation |
| `milestones` | `string[]` | Reached milestones: `chats-10`, `chats-25`, `chats-50`, `chats-100`, `chats-250`, `chats-500`, `chats-1000` |

**Streak logic:** If the difference between `lastStreakDate` and today is exactly 1 day, streak increments. If greater than 1 day, streak resets to 1. Same-day chats do not change the streak.

**Migration:** On first access after v2.5, if `_version` is absent, the server copies the existing flat data to `_legacy` and initializes empty entries for each known user.

### images-meta.json

Array of image metadata objects, one per uploaded image.

```json
[
  {
    "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "filename": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.jpeg",
    "caption": "Look at my cat!",
    "reply": "Oh~! What a precious little kitty! Those eyes are so sparkly...",
    "date": "2026-02-27T15:30:00.000Z"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID v4 identifier |
| `filename` | `string` | File on disk: `{uuid}.{extension}` |
| `caption` | `string` | User's message when the image was shared (may be empty) |
| `reply` | `string` | Melody's reply, truncated to first 200 characters |
| `date` | `string` | ISO 8601 timestamp of upload |

### sanrio-characters.json

Loaded once at server startup by `loadCharacterData()`. Contains an array of Sanrio character objects condensed into a prompt-injectable string. If the file is missing, character context is silently disabled (empty string).

```json
{
  "characters": [
    {
      "name": "Kuromi",
      "species": "rabbit",
      "personality": "Mischievous punk rebel who secretly loves cute things.",
      "birthday": "October 31",
      "relationships": {
        "myMelody": "Self-declared rival (Melody thinks they're besties)"
      }
    }
  ]
}
```

### images/ Directory

User-uploaded images stored as `{uuid}.{extension}` files (e.g., `a1b2c3d4-...jpeg`). The extension is derived from the uploaded MIME type. Images are served at `/data/images/{filename}` via Express static middleware.

---

## Docker Volume (melody-data)

| Property | Value |
|----------|-------|
| Volume name | `melody-data` |
| Mount point | `/app/data` |
| Type | Named Docker volume (NOT a bind mount) |
| Survives `docker-compose down` | Yes |
| Survives `docker-compose up --build` | Yes |
| Destroyed by | `docker volume rm melody-data` |

### Accessing volume data

```bash
# List contents
docker exec $(docker-compose ps -q my-melody-chat) ls -la /app/data/

# Export a file
docker cp $(docker-compose ps -q my-melody-chat):/app/data/relationship.json ./

# Import a file
docker cp sanrio-characters.json $(docker-compose ps -q my-melody-chat):/app/data/
```

---

## Client-Side Storage: localStorage

Preferences and state persisted across browser sessions. Each key is read/written directly via `localStorage.getItem()` / `localStorage.setItem()`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `darkMode` | `string` | `"false"` | Dark mode enabled (`"true"` or `"false"`) |
| `replyStyle` | `string` | `"default"` | Reply verbosity: `default`, `brief`, `detailed` |
| `soundEnabled` | `string` | `"true"` | Sound effects enabled (`"true"` or `"false"`, default ON when absent) |
| `accentColor` | `string` | (none) | Accent color key from `COLOR_MAP` (e.g., `pink`, `blue`, `purple`) |
| `melodyActiveUser` | `string` | (none) | Currently selected user ID: `amelia`, `lonnie`, or `guest` |
| `melodyWelcomeDone-{userId}` | `string` | (none) | Per-user welcome flow completion flag. Set to `"true"` after onboarding. Key format: `melodyWelcomeDone-amelia`, `melodyWelcomeDone-lonnie`, etc. |

**Legacy key:** `melodyWelcomeDone` (without user suffix) was used before v2.5. The code falls back to this if no `melodyActiveUser` is set.

---

## Client-Side Storage: sessionStorage

Per-tab state that is cleared when the tab closes.

| Key | Type | Description |
|-----|------|-------------|
| `melodySessionId` | `string` | UUID v4 generated on first access. Sent with every `/api/chat` request to maintain conversation buffer continuity within the same tab session. |
| `installDismissed` | `string` | Set to `"true"` when the user dismisses the PWA install banner. Prevents re-showing the banner in the same tab session. |

---

## In-Memory Storage: Session Buffers

The server maintains an in-memory `Map` of conversation buffers keyed by `sessionId`.

```
Map<sessionId, { contents: Array<{role, parts}>, lastAccess: number }>
```

| Property | Value |
|----------|-------|
| Data structure | `Map` (ES6) |
| Key | UUID v4 `sessionId` from client |
| Max concurrent sessions | 1000 |
| Eviction policy | LRU — oldest session evicted when cap reached |
| TTL | 1 hour (pruned every 10 minutes via `setInterval`) |
| Buffer depth | Sliding window of 12 items (6 user+model exchanges) |
| Persistence | None — lost on server restart |

### Buffer entry format

```js
{
  contents: [
    { role: 'user',  parts: [{ text: 'Hello!' }] },
    { role: 'model', parts: [{ text: 'Oh~! Hi there!' }] },
    // ... up to 12 items (6 exchanges)
  ],
  lastAccess: 1709042400000  // Date.now() timestamp
}
```

When the buffer exceeds 12 items, the oldest user+model pair is shifted off the front (FIFO sliding window).

### Session ID validation

Only UUID v4 format is accepted: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`. Invalid or missing session IDs return an empty history array (no buffer continuity).

---

## Cloud Storage: mem0

Persistent memory stored in mem0's cloud API (`https://api.mem0.ai`). Survives container rebuilds, server restarts, and browser clears.

### Dual-Track Architecture

| Track | Purpose | mem0 Filter | Scope |
|-------|---------|-------------|-------|
| User track | Facts about the friend (name, preferences, life events) | `user_id` | Per-user (e.g., `melody-friend-amelia`) |
| Agent track | Melody's evolving personality, opinions, experiences | `agent_id: my-melody` | Shared across all users |

### User Track IDs

| User ID | mem0 `user_id` |
|---------|----------------|
| `amelia` | `melody-friend-amelia` |
| `lonnie` | `melody-friend-lonnie` |
| `guest` | `melody-friend-guest` |
| (legacy/none) | `melody-friend` (from `MEM0_USER_ID` env var) |

### Read Operations

- **Search** (`POST /v2/memories/search/`): Called on every chat request. User track: up to 10 results. Agent track: up to 5 results. Both searches run in parallel.
- **List** (`GET /v1/memories/`): Called by the Memories tab. Fetches both tracks, labels each with `track: 'friend'` or `track: 'melody'`, returns combined and sorted by date.

### Write Operations

- **Save** (`POST /v1/memories/`): Fire-and-forget after each chat exchange. User track save is skipped for `guest` users. Agent track is always saved. The `infer: true` flag tells mem0 to extract structured facts from the conversation.
- **Welcome save** (`POST /v1/memories/`): Explicit save during onboarding. Structured memory text for name, color, and interests.

### Delete Operations

- **Delete** (`DELETE /v1/memories/{id}/`): Called from the Memories tab. Deletes a single memory by ID.

### Cross-User Memory Access

When a user mentions another known user's name in a message, the server searches that user's mem0 track (up to 5 results) and injects the findings into the system prompt. Guest conversations are never cross-referenced (privacy).

---

## Backup and Restore

### Full data backup

```bash
# Create a backup directory
mkdir -p backup-$(date +%Y%m%d)

# Export all server-side data
docker cp $(docker-compose ps -q my-melody-chat):/app/data/relationship.json backup-$(date +%Y%m%d)/
docker cp $(docker-compose ps -q my-melody-chat):/app/data/images-meta.json backup-$(date +%Y%m%d)/
docker cp $(docker-compose ps -q my-melody-chat):/app/data/images backup-$(date +%Y%m%d)/
docker cp $(docker-compose ps -q my-melody-chat):/app/data/sanrio-characters.json backup-$(date +%Y%m%d)/
```

### Restore from backup

```bash
# Stop the container
docker-compose down

# Start it fresh (volume still exists)
docker-compose up -d

# Copy files back into the container
docker cp backup-20260227/relationship.json $(docker-compose ps -q my-melody-chat):/app/data/
docker cp backup-20260227/images-meta.json $(docker-compose ps -q my-melody-chat):/app/data/
docker cp backup-20260227/images/ $(docker-compose ps -q my-melody-chat):/app/data/
docker cp backup-20260227/sanrio-characters.json $(docker-compose ps -q my-melody-chat):/app/data/
```

### What is NOT backed up by this process

| Data | Location | Backup method |
|------|----------|---------------|
| mem0 memories | mem0 cloud API | Managed by mem0.ai — no local backup mechanism |
| Session buffers | Server RAM | Not persistent — lost on restart by design |
| localStorage | Browser | Per-device, not exportable through the app |

---

## Related Pages

- [Architecture Overview](architecture-overview.md) — system diagram, service map, design decisions
- [API Reference](api-reference.md) — endpoint documentation for memory and relationship APIs
- [Docker Deployment](docker-deployment.md) — volume management, docker cp commands
