# API Reference

> **Last verified:** 2026-03-06 — audited from `server.js` feat-multi-character
> **Source files:** `server.js`
> **Known gaps:** None

---

## Overview

All endpoints are served by a single Express server on port 3000 (HTTP) and optionally port 3443 (HTTPS). The server accepts JSON request bodies up to 10 MB (`express.json({ limit: '10mb' })`). There is no authentication layer — the app is designed for trusted local/LAN access.

---

## Character Routing

Several endpoints accept a `characterId` parameter. This value selects:

1. **System prompt** — Each character (`melody`, `kuromi`, `retsuko`) has a distinct personality and speech-pattern prompt loaded via `getCharacter(characterId)`.
2. **mem0 agent track** — Each character has its own `agent_id` in mem0, so memories are isolated per character. The agent track is searched and saved independently for each character.

When `characterId` is omitted the server defaults to `melody`, preserving full backward compatibility.

---

## Endpoint Summary

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/chat` | Send a message to a character |
| GET | `/api/images` | List saved image metadata |
| DELETE | `/api/images/:id` | Delete a saved image |
| GET | `/api/image-search?q=` | Search images via Brave |
| GET | `/api/video-search?q=` | Search videos via Brave |
| GET | `/api/gallery-search?q=` | Search saved images by keyword |
| GET | `/api/wiki-search?wiki=&q=` | Search a game wiki (MediaWiki) |
| GET | `/api/memories?userId=&characterId=` | List all mem0 memories (dual-track) |
| DELETE | `/api/memories/:id` | Delete a specific memory |
| GET | `/api/relationship?userId=` | Get friendship stats |
| GET | `/api/welcome-status?userId=` | Check new vs returning user |
| POST | `/api/welcome` | Save onboarding data to mem0 |

---

## POST /api/chat

Send a message (and/or image) to a character. Triggers the full pipeline: memory search, Gemini call, wiki interception, image save, memory save.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | `string` | Conditional | Chat message text. Required unless `imageBase64` is provided. |
| `imageBase64` | `string` | No | Base64-encoded image data |
| `imageMime` | `string` | No | MIME type of the image. Default: `image/jpeg` |
| `replyStyle` | `string` | No | Reply verbosity: `default`, `brief`, or `detailed` |
| `sessionId` | `string` | No | UUID v4 for conversation buffer continuity across requests |
| `userId` | `string` | No | Active user identity key: `amelia`, `lonnie`, or `guest` |
| `characterId` | `string` | No | Character to chat with (`melody` \| `kuromi` \| `retsuko`). Default: `melody`. Routes to the correct system prompt and mem0 agent track. |

### Response (200)

```json
{
  "reply": "Oh~! That's so sweet of you! Mama always says...",
  "sources": [
    { "title": "Source Page Title", "url": "https://example.com" }
  ],
  "wikiSource": {
    "title": "Cinnamoroll",
    "url": "https://hellokittyislandadventure.wiki.gg/wiki/Cinnamoroll",
    "wikiName": "Hello Kitty Island Adventure"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `reply` | `string` | Character's response text. May contain control tags (`[IMAGE_SEARCH:]`, `[VIDEO_SEARCH:]`, `[REACTION:]`, `[GALLERY_SEARCH:]`) that the client parses and strips. Wiki tags are intercepted server-side and never reach the client. |
| `sources` | `Object[]` | Google Search grounding sources extracted from Gemini response metadata. Empty array if no grounding. |
| `sources[].title` | `string` | Source page title |
| `sources[].url` | `string` | Source page URL |
| `wikiSource` | `Object\|null` | Present only when the wiki two-step pipeline was triggered |
| `wikiSource.title` | `string` | Wiki page title |
| `wikiSource.url` | `string` | Full URL to the wiki page |
| `wikiSource.wikiName` | `string` | Display name of the wiki (e.g., "Hello Kitty Island Adventure") |

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Message or image is required" }` | Neither `message` nor `imageBase64` provided |
| 500 | `{ "error": "Something went wrong, my sweet friend! ♡" }` | Internal server error (Gemini failure, etc.) |

### Example Request

```json
{
  "message": "What gifts does Cinnamoroll like?",
  "replyStyle": "default",
  "sessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  "userId": "amelia",
  "characterId": "melody"
}
```

### Side Effects

- Increments chat count in `relationship.json` (per-user)
- Updates streak tracking
- Saves exchange to in-memory session buffer (sliding window, max 6 exchanges)
- Saves to mem0 user track (fire-and-forget, skipped for guest)
- Saves to mem0 agent track for the selected character (fire-and-forget, always)
- If `imageBase64` provided: saves image file to `data/images/` and appends metadata to `images-meta.json`

---

## GET /api/images

List all saved image metadata, sorted newest first.

### Response (200)

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
| `id` | `string` | UUID of the image |
| `filename` | `string` | Filename on disk (`{uuid}.{ext}`) |
| `caption` | `string` | User's message when the image was shared |
| `reply` | `string` | Character's reply (truncated to 200 chars) |
| `date` | `string` | ISO 8601 timestamp |

Image files are served at `/data/images/{filename}` via Express static middleware.

---

## DELETE /api/images/:id

Delete a saved image and its metadata entry.

### Parameters

| Param | Location | Type | Description |
|-------|----------|------|-------------|
| `id` | URL path | `string` | UUID of the image to delete |

### Response (200)

```json
{ "ok": true }
```

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 404 | `{ "error": "Not found" }` | No image with that ID exists |

### Side Effects

- Deletes the image file from `data/images/`
- Removes the metadata entry from `images-meta.json`

---

## GET /api/image-search

Search for images via the Brave Search API. Used by the client when the LLM emits an `[IMAGE_SEARCH: query]` tag.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | `string` | Yes | Search query |

### Response (200)

```json
[
  {
    "title": "Adorable fluffy puppy",
    "imageUrl": "https://example.com/puppy.jpg",
    "thumbnailUrl": "https://example.com/puppy_thumb.jpg",
    "width": 1200,
    "height": 800
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Image title from Brave |
| `imageUrl` | `string` | Full-size image URL |
| `thumbnailUrl` | `string` | Thumbnail URL |
| `width` | `number` | Image width in pixels |
| `height` | `number` | Image height in pixels |

Returns up to 6 results. Uses `safesearch=strict` (Brave rejects `moderate` with HTTP 422).

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Query required" }` | Missing `q` parameter |
| 500 | `{ "error": "Image search not configured" }` | `BRAVE_API_KEY` not set |
| 500 | `{ "error": "Image search failed" }` | Brave API call failed |

---

## GET /api/video-search

Search for videos via the Brave Search API. Used by the client when the LLM emits a `[VIDEO_SEARCH: query]` tag.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | `string` | Yes | Search query |

### Response (200)

```json
[
  {
    "title": "How to make almond pound cake",
    "url": "https://youtube.com/watch?v=abc123",
    "thumbnail": "https://example.com/thumb.jpg",
    "description": "A simple recipe for the fluffiest almond pound cake..."
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Video title |
| `url` | `string` | Video page URL |
| `thumbnail` | `string` | Thumbnail image URL |
| `description` | `string` | Video description snippet |

Returns up to 4 results. Uses `safesearch=strict`.

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Query required" }` | Missing `q` parameter |
| 500 | `{ "error": "Video search not configured" }` | `BRAVE_API_KEY` not set |
| 500 | `{ "error": "Video search failed" }` | Brave API call failed |

---

## GET /api/gallery-search

Search saved images by caption or reply keywords. Case-insensitive substring match. Used by the client when the LLM emits a `[GALLERY_SEARCH: keywords]` tag.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `q` | `string` | No | Search keywords. Returns empty array if omitted. |

### Response (200)

Returns matching image metadata objects (same shape as `GET /api/images`).

```json
[
  {
    "id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "filename": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.jpeg",
    "caption": "my cat sleeping",
    "reply": "Oh~! What a cozy little kitty...",
    "date": "2026-02-27T15:30:00.000Z"
  }
]
```

---

## GET /api/wiki-search

Search a game wiki via MediaWiki API and return results with the top page's content.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `wiki` | `string` | Yes | Wiki ID from the registry: `hkia` or `minecraft` |
| `q` | `string` | Yes | Search query |

### Response (200)

```json
{
  "results": [
    {
      "title": "Cinnamoroll",
      "pageid": 1234,
      "snippet": "Cinnamoroll is a character who loves gifts..."
    }
  ],
  "topContent": {
    "title": "Cinnamoroll",
    "text": "Cinnamoroll is a white puppy character with long ears...",
    "url": "https://hellokittyislandadventure.wiki.gg/wiki/Cinnamoroll",
    "wikiName": "Hello Kitty Island Adventure"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `results` | `Object[]` | Up to 3 search results from MediaWiki |
| `results[].title` | `string` | Wiki page title |
| `results[].pageid` | `number` | MediaWiki page ID |
| `results[].snippet` | `string` | Search snippet (HTML tags stripped) |
| `topContent` | `Object\|null` | Parsed intro of the top result page (null if no results or fetch fails) |
| `topContent.text` | `string` | Plain-text intro content (capped at 1500 chars) |
| `topContent.url` | `string` | Full URL to the wiki page |
| `topContent.wikiName` | `string` | Display name of the wiki |

### Wiki Registry

| Wiki ID | Game | API Base |
|---------|------|----------|
| `hkia` | Hello Kitty Island Adventure | `hellokittyislandadventure.wiki.gg` |
| `minecraft` | Minecraft | `minecraft.wiki` |

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "wiki and q params required" }` | Missing `wiki` or `q` |
| 400 | `{ "error": "Unknown wiki: X. Available: hkia, minecraft" }` | Invalid wiki ID |
| 500 | `{ "error": "Wiki search failed" }` | MediaWiki API error |

---

## GET /api/memories

List all mem0 memories from both tracks (user + agent), sorted by most recently updated.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | No | User key (`amelia`, `lonnie`, `guest`). Determines which user track to query. Falls back to `MEM0_USER_ID` env var if omitted. |
| `characterId` | `string` | No | Character whose agent memories to fetch (`melody` \| `kuromi` \| `retsuko`). Default: `melody`. Routes to that character's mem0 agent track. |

### Response (200)

```json
[
  {
    "id": "mem_abc123",
    "memory": "Friend's name is Amelia",
    "created_at": "2026-02-20T10:00:00Z",
    "updated_at": "2026-02-27T15:00:00Z",
    "track": "friend"
  },
  {
    "id": "mem_def456",
    "memory": "I really enjoy baking almond pound cake for my friends",
    "created_at": "2026-02-21T12:00:00Z",
    "updated_at": "2026-02-26T08:00:00Z",
    "track": "melody"
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | mem0 memory ID |
| `memory` | `string` | Memory content text |
| `created_at` | `string` | ISO 8601 creation timestamp |
| `updated_at` | `string` | ISO 8601 last update timestamp |
| `track` | `string` | `friend` (user track) or `melody` (agent track — label is always `melody` regardless of character) |

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 500 | `{ "error": "Failed to fetch memories" }` | mem0 API failure |

---

## DELETE /api/memories/:id

Delete a specific memory from mem0.

### Parameters

| Param | Location | Type | Description |
|-------|----------|------|-------------|
| `id` | URL path | `string` | mem0 memory ID |

### Response (200)

```json
{ "ok": true }
```

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| (varies) | `{ "error": "mem0 error" }` | mem0 API returned non-OK status |
| 500 | `{ "error": "Failed to delete memory" }` | Network/fetch failure |

---

## GET /api/relationship

Get friendship stats for the specified user. Used by the Memories tab to display stat cards.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | No | User key. Falls back to legacy flat data if omitted. |

### Response (200)

```json
{
  "daysTogether": 7,
  "totalChats": 42,
  "streakDays": 3,
  "firstChat": "2026-02-20",
  "milestones": ["chats-10", "chats-25"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `daysTogether` | `number` | Days since first chat (minimum 0) |
| `totalChats` | `number` | Lifetime message count |
| `streakDays` | `number` | Consecutive days with at least one chat |
| `firstChat` | `string\|null` | ISO date of first conversation |
| `milestones` | `string[]` | Chat count milestones reached (e.g., `chats-10`, `chats-25`, `chats-50`, `chats-100`, `chats-250`, `chats-500`, `chats-1000`) |

---

## GET /api/welcome-status

Check if a user is new or returning. Used by the client to decide whether to show the welcome flow or a personalized greeting.

### Query Parameters

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | `string` | No | User key. Falls back to legacy data if omitted. |

### Response (200) — New User

```json
{ "status": "new" }
```

### Response (200) — Returning User

```json
{
  "status": "returning",
  "friendName": "Amelia",
  "daysSince": 2,
  "totalChats": 42,
  "streakDays": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | `new` or `returning` |
| `friendName` | `string\|null` | User's name from KNOWN_USERS or extracted from mem0 memories. Null if not found. |
| `daysSince` | `number` | Days since last chat |
| `totalChats` | `number` | Lifetime message count |
| `streakDays` | `number` | Current streak |

---

## POST /api/welcome

Save onboarding data (name, color, or interests) to mem0. Called during the first-time welcome flow.

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Data type: `name`, `color`, or `interests` |
| `value` | `string` | Yes | The value to save (max 200 characters) |
| `userId` | `string` | No | User key. Skips mem0 save for `guest`. |

### How Each Type Is Saved

| Type | mem0 Memory Text |
|------|-----------------|
| `name` | `Friend's name is {firstName}. They said: "{value}"` |
| `color` | `Friend's favorite color is {value}` |
| `interests` | `Friend's interests and hobbies include: {value}` |

### Response (200)

```json
{ "ok": true }
```

### Error Responses

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "type and value required" }` | Missing `type` or `value` |
| 400 | `{ "error": "Invalid value" }` | Value is not a string or exceeds 200 chars |
| 400 | `{ "error": "Invalid type" }` | Type is not `name`, `color`, or `interests` |
| 500 | `{ "error": "Failed to save" }` | mem0 API failure |

### Side Effects

- Saves memory to mem0 user track (skipped for guest)
- Initializes `relationship.json` entry for the user if `firstChat` is null

---

## Static File Serving

| Path | Serves | Middleware |
|------|--------|-----------|
| `/` | `public/` directory | `express.static` |
| `/data/images/*` | `data/images/` directory | `express.static` |

---

## Related Pages

- [Architecture Overview](architecture-overview.md) — system diagram, request lifecycle, design decisions
- [Docker Deployment](docker-deployment.md) — build, run, environment variables
- [Data Persistence](data-persistence.md) — file formats, storage locations
