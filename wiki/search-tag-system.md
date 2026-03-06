# Search Tag System

> **Last verified:** 2026-02-27
> **Source files:** `server.js`, `public/app.js`
> **Known gaps:** None

---

## Overview

My Melody Chat uses a tag-based system to trigger media actions from within LLM responses. The model emits special bracketed tags in its reply text. Depending on the tag type, processing happens either **server-side** (wiki) or **client-side** (all others). Tags are stripped from the display text before rendering to the user.

## Tag Reference

| Tag | Format | Processing | Trigger |
|-----|--------|-----------|---------|
| `IMAGE_SEARCH` | `[IMAGE_SEARCH: query]` | Client-side | User asks to *see* a picture/image |
| `VIDEO_SEARCH` | `[VIDEO_SEARCH: query]` | Client-side | User asks for a video or how-to |
| `GALLERY_SEARCH` | `[GALLERY_SEARCH: keywords]` | Client-side | User asks about a previously shared photo |
| `WIKI_SEARCH` | `[WIKI_SEARCH: wiki_id query]` | Server-side | User asks about game-specific content |
| `REACTION` | `[REACTION: emotion]` | Client-side | Melody wants to express emotion visually |

## Processing Model

```
                          Server (server.js)
                    ┌─────────────────────────┐
                    │  Gemini generates reply  │
                    │  with embedded tags      │
                    │                          │
                    │  WIKI_SEARCH detected?   │
                    │  ├─ YES → two-step       │
                    │  │   wiki pipeline       │
                    │  │   (tag stripped        │
                    │  │    server-side)        │
                    │  └─ NO → pass through    │
                    │                          │
                    │  Response JSON:          │
                    │  { reply, sources,       │
                    │    wikiSource }           │
                    └────────────┬────────────┘
                                 │
                          Client (app.js)
                    ┌────────────▼────────────┐
                    │  processReply()          │
                    │                          │
                    │  Parse remaining tags:   │
                    │  IMAGE_SEARCH            │
                    │  VIDEO_SEARCH            │
                    │  GALLERY_SEARCH          │
                    │  REACTION                │
                    │                          │
                    │  Strip ALL tags from     │
                    │  display text            │
                    │                          │
                    │  Fetch media async       │
                    │  Render message + media  │
                    └─────────────────────────┘
```

## Tag Detection Regex Patterns

All patterns are in `public/app.js` inside `processReply()`:

```js
// Detection (capture groups extract the query/emotion)
const imageSearchMatch  = text.match(/\[IMAGE_SEARCH:\s*(.+?)\]/);
const videoSearchMatch  = text.match(/\[VIDEO_SEARCH:\s*(.+?)\]/);
const gallerySearchMatch = text.match(/\[GALLERY_SEARCH:\s*(.+?)\]/);
const reactionMatch     = text.match(/\[REACTION:\s*(\w+)\]/);
```

Server-side wiki detection in `server.js`:

```js
const wikiMatch = reply.match(/\[WIKI_SEARCH:\s*([\w-]+)\s+(.+?)\]/);
// Capture group 1: wiki ID (e.g., "hkia", "minecraft")
// Capture group 2: search query
```

## Tag Stripping

All tags are stripped from display text before rendering, regardless of whether processing succeeded. Stripping happens in `processReply()`:

```js
let displayText = text
  .replace(/\[IMAGE_SEARCH:\s*.+?\]/g, '')
  .replace(/\[VIDEO_SEARCH:\s*.+?\]/g, '')
  .replace(/\[GALLERY_SEARCH:\s*.+?\]/g, '')
  .replace(/\[WIKI_SEARCH:\s*.+?\]/g, '')
  .replace(/\[REACTION:\s*\w+\]/g, '')
  .trim();
```

WIKI_SEARCH tags are also stripped server-side in every fallback branch of the wiki pipeline (before the response reaches the client).

## IMAGE_SEARCH

### Trigger Conditions

The model emits `[IMAGE_SEARCH: query]` when the user explicitly asks to **see** a picture, image, or photo of something. The system prompt instructs the model to only use this tag for visual requests, not informational queries.

### Processing Flow

1. Client regex extracts the query string
2. Client calls `GET /api/image-search?q={query}`
3. Server proxies to Brave Image Search API (max 6 results)
4. Client filters results to those with a valid `imageUrl`
5. Client picks a random image from the first 4 valid results
6. Image is rendered inline below the message text

### Rendered Output

An `<img>` element with class `search-result-img` appended to the message bubble. Clicking opens the lightbox. Images that fail to load are silently removed via an `error` event handler.

```js
const valid = results.filter(r => r.imageUrl);
if (valid.length) {
  const pick = valid[Math.floor(Math.random() * Math.min(valid.length, 4))];
  searchImageUrl = pick.imageUrl;
}
```

## VIDEO_SEARCH

### Trigger Conditions

The model emits `[VIDEO_SEARCH: query]` when the user asks for a video, tutorial, or how-to content that benefits from video format.

### Processing Flow

1. Client regex extracts the query string
2. Client calls `GET /api/video-search?q={query}`
3. Server proxies to Brave Video Search API (max 4 results)
4. Client uses the **first result** (index 0)

### Rendered Output

A clickable `<a>` element with class `video-result` containing:
- Thumbnail image (`<img class="video-thumbnail">`) if available
- Title text (`<span class="video-title">`)
- Opens in a new tab (`target="_blank"`)

## GALLERY_SEARCH

### Trigger Conditions

The model emits `[GALLERY_SEARCH: keywords]` when the user references a photo they previously shared in chat.

### Processing Flow

1. Client regex extracts the keywords
2. Client calls `GET /api/gallery-search?q={keywords}`
3. Server does case-insensitive substring match on `caption` and `reply` fields of saved image metadata
4. Client uses the first matching result's filename
5. Image URL is constructed as `/data/images/{filename}`

### Priority

Gallery search only runs if `IMAGE_SEARCH` did **not** already produce a result (`!searchImageUrl` guard). This prevents gallery images from overwriting web search results when both tags are present.

```js
if (gallerySearchMatch && !searchImageUrl) {
  // ...fetch and use gallery result
}
```

### Rendered Output

Same as IMAGE_SEARCH -- inline image appended to the message bubble with lightbox click handler.

## WIKI_SEARCH

### Trigger Conditions

The model emits `[WIKI_SEARCH: wiki_id query]` when the user asks game-specific questions (gifts, quests, characters, crafting, recipes, locations) for a supported game.

### Processing Flow (Server-Side Two-Step Pipeline)

See [Wiki Integration](wiki-integration.md) for full details.

1. Gemini's first reply contains the tag
2. Server extracts wiki ID and query via regex
3. Server searches the wiki via MediaWiki API
4. Server fetches the top result's page content
5. Server makes a **second Gemini call** with wiki content injected
6. Server strips any remaining wiki tags from the final reply
7. Server returns the enriched reply + `wikiSource` metadata

### Rendered Output

- The enriched reply text (wiki info woven into character speech)
- A lavender-themed source card with book icon linking to the wiki page

## REACTION

### Trigger Conditions

The model emits `[REACTION: emotion]` approximately 1 in 4 messages, when a visual reaction (animated GIF) would be more expressive than words alone.

### Processing Flow

See [Reaction GIFs](reaction-gifs.md) for full details.

1. Client regex extracts the emotion keyword
2. Client maps emotion to a nekos.best API category via `REACTION_MAP`
3. A random category is chosen from the mapped array
4. Client fetches a GIF from `https://nekos.best/api/v2/{category}?amount=1`
5. GIF is appended to the message bubble **asynchronously** (non-blocking)

### Rendered Output

An `<img>` element appended to the last assistant message bubble, styled inline: `max-width: 200px`, `border-radius: 8px`, `margin-top: 8px`. Failures are silently ignored.

## System Prompt Instructions

The model is taught when to emit tags via the `MEDIA TAGS` section of the system prompt:

```
MEDIA TAGS -- use ONLY when relevant:
- When your friend asks to SEE a picture/image of something: [IMAGE_SEARCH: descriptive query]
- When your friend asks for a video or "how to" that needs a video: [VIDEO_SEARCH: descriptive query]
- When your friend asks about a photo they previously shared: [GALLERY_SEARCH: keywords]
- When your friend asks about Hello Kitty Island Adventure gameplay: [WIKI_SEARCH: hkia search query]
- When your friend asks about Minecraft gameplay, crafting, mobs, etc.: [WIKI_SEARCH: minecraft search query]
- ONLY include a media tag when the friend explicitly asks for an image, picture, video, or to see something visual
- Do NOT include media tags in normal conversation -- most messages should have NO tags
- Use WIKI_SEARCH when the friend asks game-specific questions (gifts, quests, characters, crafting, recipes, locations). The wiki ID must be one of: hkia, minecraft
```

Reaction tags are taught in a separate `REACTIONS` section:

```
REACTIONS:
Occasionally (not every message -- maybe 1 in 4) you can express yourself with a reaction GIF
by including [REACTION: emotion]. Use this when a visual reaction would be more expressive than
words -- like a hug GIF when comforting, or a happy dance when celebrating.
Emotions: happy, love, shy, sad, think, playful, angry, sassy, tired, excited
```

The prompt also includes example dialogues showing correct tag usage (Ali:Chat format).

## Debug Logging

The server logs detected tags when present in the final reply:

```js
if (reply.includes('[IMAGE_SEARCH:') || reply.includes('[VIDEO_SEARCH:') ||
    reply.includes('[GALLERY_SEARCH:') || reply.includes('[WIKI_SEARCH:')) {
  console.log('Search tags found in reply:',
    reply.match(/\[(IMAGE_SEARCH|VIDEO_SEARCH|GALLERY_SEARCH|WIKI_SEARCH):\s*.+?\]/g));
}
```

Note: REACTION tags are not included in the server-side debug log because they are processed entirely client-side and do not require server intervention.

---

## Related Pages

- [Wiki Integration](wiki-integration.md) -- Full two-step wiki pipeline details
- [Brave Search](brave-search.md) -- Image and video search API integration
- [Reaction GIFs](reaction-gifs.md) -- Emotion-to-GIF mapping and nekos.best API
