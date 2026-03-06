# Architecture Overview

> **Last verified:** 2026-03-06 — audited from `server.js` v2.6.0, `public/app.js`, `Dockerfile`, `docker-compose.yml`, `package.json`
> **Source files:** `server.js`, `public/app.js`, `public/index.html`, `public/sw.js`, `Dockerfile`, `docker-compose.yml`
> **Known gaps:** None

---

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Docker Container (my-melody-chat)                              │
│  node:20-alpine                                                 │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Express Server (server.js)                            │     │
│  │  ┌──────────────┐  ┌────────────┐  ┌───────────────┐  │     │
│  │  │ POST /api/   │  │ Static     │  │ /data/images  │  │     │
│  │  │   chat       │  │ public/    │  │ (uploaded)    │  │     │
│  │  │   welcome    │  │            │  │               │  │     │
│  │  │ GET /api/    │  │ index.html │  │               │  │     │
│  │  │   images     │  │ app.js     │  │               │  │     │
│  │  │   memories   │  │ style.css  │  │               │  │     │
│  │  │   etc.       │  │ sw.js      │  │               │  │     │
│  │  └──────┬───────┘  └────────────┘  └───────────────┘  │     │
│  │         │                                              │     │
│  │  ┌──────▼──────────────────────────────────────────┐   │     │
│  │  │ In-Memory Session Buffers (Map)                 │   │     │
│  │  │ max 1000 sessions, 1hr TTL, 10min prune cycle   │   │     │
│  │  └─────────────────────────────────────────────────┘   │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌─────────────────────────────────────┐                        │
│  │  /app/data (Docker volume)          │                        │
│  │  relationship.json                  │                        │
│  │  images-meta.json                   │                        │
│  │  sanrio-characters.json             │                        │
│  │  images/*.jpg                       │                        │
│  └─────────────────────────────────────┘                        │
│                                                                 │
│  Port 3000 (HTTP)  ─────────►  Host 3030                       │
│  Port 3443 (HTTPS) ─────────►  Host 3031                       │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  ┌──────────────┐   ┌───────────────┐   ┌────────────────┐
  │ Gemini API   │   │ mem0 API      │   │ Brave Search   │
  │ (Google AI)  │   │ (mem0.ai)     │   │ API            │
  │              │   │               │   │                │
  │ Chat + Vision│   │ User track    │   │ Image search   │
  │ Google Search│   │ Agent track   │   │ Video search   │
  │ grounding    │   │ (per-char)    │   │                │
  └──────────────┘   └───────────────┘   └────────────────┘
                                                  │
         ┌────────────────────────────────────────┘
         ▼
  ┌──────────────────┐
  │ MediaWiki APIs   │
  │                  │
  │ HKIA wiki.gg     │
  │ minecraft.wiki   │
  └──────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20 (Alpine) | `node:20-alpine` Docker image |
| Framework | Express | ^4.21.2 | JSON body parser, static file serving |
| AI SDK | @google/genai | ^1.0.0 | Gemini 3 Flash Preview |
| Config | dotenv | ^16.4.7 | Environment variable loading |
| Frontend | Vanilla JS | ES2022+ | No framework, no build step |
| Styling | Plain CSS | CSS custom properties | Dark mode via `data-theme` attribute |
| PWA | Service Worker | Cache API | Stale-while-revalidate for static assets |
| Containerization | Docker | node:20-alpine | Single-container deployment |
| Orchestration | Docker Compose | v3 (implicit) | Named volume, port mapping, restart policy |
| Module system | ES Modules | `"type": "module"` | `import`/`export` syntax throughout |

---

## Multi-Character Support

As of v2.6.0 the app supports three playable characters. Character state lives in two places: a server-side registry (source of truth for prompts and mem0 routing) and a client-side config (source of truth for UI state).

### Server — CHARACTERS Registry (`server.js`)

```js
const CHARACTERS = {
  melody:  { id: 'melody',  name: 'My Melody',  agentId: 'my-melody', color: '#FF69B4', avatarFile: 'melody-avatar.png',  getPrompt: () => MELODY_SYSTEM_PROMPT  },
  kuromi:  { id: 'kuromi',  name: 'Kuromi',      agentId: 'kuromi',    color: '#FF1493', avatarFile: 'kuromi-avatar.png',   getPrompt: () => KUROMI_SYSTEM_PROMPT  },
  retsuko: { id: 'retsuko', name: 'Aggretsuko',  agentId: 'retsuko',   color: '#FF4500', avatarFile: 'retsuko-avatar.png',  getPrompt: () => RETSUKO_SYSTEM_PROMPT }
};
const DEFAULT_CHARACTER = 'melody';
```

`getCharacter(characterId)` resolves a character by registry key, falling back to `melody` for unknown or missing IDs.

Each character entry carries:

| Field | Purpose |
|-------|---------|
| `id` | Registry key; echoed back in responses |
| `name` | Display name |
| `agentId` | mem0 `agent_id` — isolates each character's own memory track |
| `color` | Accent hex color (informational; applied on client) |
| `avatarFile` | Filename under `public/images/` |
| `getPrompt()` | Returns the character's full system prompt string |

### Client — Character Picker (`public/app.js`)

`CHARACTER_CONFIG` mirrors the registry for UI purposes:

```js
const CHARACTER_CONFIG = {
  melody:  { name: 'My Melody',  avatar: '/images/melody-avatar.png',  color: '#FF69B4' },
  kuromi:  { name: 'Kuromi',     avatar: '/images/kuromi-avatar.png',   color: '#FF1493' },
  retsuko: { name: 'Aggretsuko', avatar: '/images/retsuko-avatar.png',  color: '#FF4500' }
};
let activeCharacter = localStorage.getItem('activeCharacter') || 'melody';
```

`selectCharacter(characterId)` (no server round-trip) updates `activeCharacter`, persists it to `localStorage`, swaps the header avatar and name, applies the accent color, and highlights the active picker button. Character switches take effect on the next message send.

### Per-Request Routing

The active character is passed in every chat request body:

```
POST /api/chat  { ..., characterId: "kuromi" }
```

The server uses `characterId` to:

1. Resolve the character config via `getCharacter(characterId)`
2. Inject that character's system prompt into the Gemini call
3. Search and save that character's dedicated mem0 `agent_id` track (e.g., `agentId: 'kuromi'`)

### Memory Architecture with Multiple Characters

| Track | mem0 key | Scope | Shared? |
|-------|----------|-------|---------|
| User track | `user_id: melody-friend-<userId>` | Facts about the human friend | Yes — all characters read the same user track |
| Agent track | `agent_id: <character.agentId>` | Character's own experiences and opinions | No — each character has an isolated track |

The user track is shared across all characters so each one knows the friend's name, preferences, and life events. The agent track is per-character so Kuromi's memories do not bleed into My Melody's personality.

---

## Service Map

| Service | Purpose | Base URL | Auth Method |
|---------|---------|----------|-------------|
| Gemini (Google AI) | Chat, image vision, Google Search grounding | SDK-managed | `GEMINI_API_KEY` env var via SDK constructor |
| mem0 | Persistent memory (dual-track: user + per-character agent) | `https://api.mem0.ai` | `Token` header via `MEM0_API_KEY` |
| Brave Search | Image search, video search | `https://api.search.brave.com` | `X-Subscription-Token` header via `BRAVE_API_KEY` |
| HKIA Wiki | Hello Kitty Island Adventure wiki search | `https://hellokittyislandadventure.wiki.gg/api.php` | None (public MediaWiki API) |
| Minecraft Wiki | Minecraft wiki search | `https://minecraft.wiki/api.php` | None (public MediaWiki API) |

---

## Request Lifecycle (POST /api/chat)

```
Client (app.js)
  │
  │  POST /api/chat { message, imageBase64?, imageMime?, replyStyle?, sessionId, userId, characterId }
  ▼
Express Server
  │
  ├─► getCharacter(characterId) ──► resolve character config (prompt, agentId)
  │
  ├─► updateRelationship(userId) ──► read/write relationship.json
  │
  ├─► Parallel mem0 searches:
  │     ├─► searchMemories(query, userId)              ──► mem0 user track (shared)
  │     └─► searchAgentMemories(query, characterId)    ──► mem0 agent track (per-character)
  │
  ├─► Cross-user memory check (if message mentions another known user)
  │     └─► searchMemories(query, otherUserId) ──► mem0 other user track
  │
  ├─► Build system prompt:
  │     character.getPrompt() + CHARACTER_CONTEXT + identityContext
  │     + crossUserInstruction + relationshipContext
  │     + userMemoryContext + agentMemoryContext + crossUserContext
  │     + styleInstruction
  │
  ├─► Prepend session buffer history (sliding window, max 6 exchanges)
  │
  ├─► Gemini generateContent (1st call)
  │     model: gemini-3-flash-preview
  │     config: temp 1.0, topP 0.95, thinkingBudget -1, googleSearch tool
  │
  ├─► Extract grounding sources from response metadata
  │
  ├─► Wiki pipeline check:
  │     If reply contains [WIKI_SEARCH: wikiId query]:
  │       ├─► searchWiki(wikiId, query)      ──► MediaWiki search API
  │       ├─► fetchWikiContent(wikiId, title) ──► MediaWiki parse API
  │       └─► Gemini generateContent (2nd call) with wiki context
  │
  ├─► Save image if provided (UUID filename → data/images/, metadata → images-meta.json)
  │
  ├─► addToSessionBuffer(sessionId, message, reply)
  │
  ├─► saveToMemory(message, reply, userId, meta, character) (fire-and-forget)
  │     ├─► mem0 user track (skipped for guest)
  │     └─► mem0 agent track keyed to character.agentId (always)
  │
  └─► Response: { reply, sources, wikiSource? }
```

---

## Port Configuration

| Protocol | Container Port | Host Port | Purpose |
|----------|---------------|-----------|---------|
| HTTP | 3000 | 3030 | Primary app access |
| HTTPS | 3443 | 3031 | PWA install over LAN (requires certs) |

HTTPS is optional. The server checks for `certs/cert.pem` and `certs/key.pem` at startup. If present, an `https.createServer` listener starts on port 3443. If absent, only HTTP is available.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No frontend framework | Single-page app is simple enough for vanilla JS. No build step, no bundler, no transpiler. |
| No build step | `public/` is served directly by Express. Edit and reload. |
| CHARACTERS registry on server | Single source of truth for prompt selection and mem0 agent routing. Client `CHARACTER_CONFIG` is UI-only and never trusted for prompt or memory decisions. |
| Character switch is client-only | No server round-trip to change active character. `selectCharacter()` updates `activeCharacter` + `localStorage`; the new value is sent on the next message. |
| Per-character agent track | Each character has its own `agent_id` in mem0, keeping personalities isolated. The shared user track ensures all characters know the friend equally. |
| System prompt rebuilt per request | Each request gets fresh memory context, relationship stats, and reply style injection. No stale system prompts. |
| Chat session recreated per request | `ai.models.generateContent()` called each time with full contents array (buffer + current message). No persistent SDK chat session. |
| Conversation buffer in-memory | `Map<sessionId, {contents, lastAccess}>` with sliding window (max 6 exchanges = 12 items). Pruned every 10 minutes (1hr TTL). |
| ES Modules | `"type": "module"` in package.json. All imports use `import` syntax. |
| Images compressed client-side | Canvas resize to 1024px max width, JPEG 0.8 quality before base64 encoding. Reduces upload payload. |
| Brave Search over Google CSE | Single API key, no engine setup, returns images + videos. Google CSE requires a Programmable Search Engine ID. |
| `safesearch=strict` | Brave image/video API does not accept `"moderate"` — returns HTTP 422. |
| Web Audio API for sounds | Synthesized chimes (sine waves), zero audio files. Reply chime = C5+E5, typing tick = A5 blip. |
| Fire-and-forget memory saves | `saveToMemory()` does not `await` — errors are logged but do not block the response. |
| Per-user keyed data | `relationship.json` uses a versioned keyed structure (`_version: 2`). Auto-migrates from legacy flat format. |
| Guest privacy | Guest user skips mem0 user track saves. Cross-user memory never queries guest data. |

---

## Known Users

| User ID | Display Name | mem0 User ID |
|---------|-------------|-------------|
| `amelia` | Amelia | `melody-friend-amelia` |
| `lonnie` | Lonnie | `melody-friend-lonnie` |
| `guest` | Guest | `melody-friend-guest` |
| (none/legacy) | - | `melody-friend` (MEM0_USER_ID env var fallback) |

---

## Related Pages

- [API Reference](api-reference.md) — full endpoint documentation
- [Docker Deployment](docker-deployment.md) — build, run, and environment setup
- [Data Persistence](data-persistence.md) — server-side files, client storage, mem0 tracks
