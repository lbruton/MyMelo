# Wiki Integration

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 108-233, 757-812, 963-990)
> **Known gaps:** None

---

## Overview

The wiki integration provides a two-step server-side pipeline that fetches game wiki content and feeds it back to Gemini so My Melody can answer game-specific questions in character with accurate information. The pipeline is triggered by the `[WIKI_SEARCH: wiki_id query]` tag emitted by the model.

## Architecture

```
  User: "What gifts does Cinnamoroll like in HKIA?"
           │
           ▼
  ┌─────────────────────────────────────────┐
  │  1. First Gemini Call                   │
  │     System prompt + memories + message  │
  │                                         │
  │  Gemini reply includes:                 │
  │  "Let me check! [WIKI_SEARCH: hkia     │
  │   Cinnamoroll gift preferences]"        │
  └──────────────┬──────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────┐
  │  2. Server Tag Detection                │
  │     regex: /\[WIKI_SEARCH:\s*([\w-]+)   │
  │             \s+(.+?)\]/                 │
  │     wikiId = "hkia"                     │
  │     query  = "Cinnamoroll gift          │
  │               preferences"              │
  └──────────────┬──────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────┐
  │  3. Wiki Fetch                          │
  │     searchWiki("hkia", query)           │
  │       → MediaWiki action=query          │
  │       → Returns up to 3 results         │
  │                                         │
  │     fetchWikiContent("hkia", topTitle)  │
  │       → MediaWiki action=parse          │
  │       → Section 0 HTML → plain text     │
  │       → Max 1500 chars                  │
  └──────────────┬──────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────┐
  │  4. Second Gemini Call                  │
  │     Original message + first reply +    │
  │     wiki content injected as context    │
  │                                         │
  │     "Use this wiki information to give  │
  │      a helpful answer IN CHARACTER..."  │
  └──────────────┬──────────────────────────┘
                 │
                 ▼
  ┌─────────────────────────────────────────┐
  │  5. Response                            │
  │     {                                   │
  │       reply: "enriched answer...",       │
  │       sources: [...],                   │
  │       wikiSource: {                     │
  │         title: "Cinnamoroll",           │
  │         url: "https://...wiki/...",     │
  │         wikiName: "Hello Kitty Island   │
  │                    Adventure"           │
  │       }                                 │
  │     }                                   │
  └─────────────────────────────────────────┘
```

## Wiki Registry

New wikis are added by inserting a single entry into the `WIKIS` object in `server.js`:

| Wiki ID | Game | API Endpoint | Base URL |
|---------|------|-------------|----------|
| `hkia` | Hello Kitty Island Adventure | `https://hellokittyislandadventure.wiki.gg/api.php` | `https://hellokittyislandadventure.wiki.gg/wiki/` |
| `minecraft` | Minecraft | `https://minecraft.wiki/api.php` | `https://minecraft.wiki/w/` |

```js
const WIKIS = {
  hkia: {
    name: 'Hello Kitty Island Adventure',
    api: 'https://hellokittyislandadventure.wiki.gg/api.php',
    baseUrl: 'https://hellokittyislandadventure.wiki.gg/wiki/'
  },
  minecraft: {
    name: 'Minecraft',
    api: 'https://minecraft.wiki/api.php',
    baseUrl: 'https://minecraft.wiki/w/'
  }
};
```

### Adding a New Wiki

Add one entry to `WIKIS` with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Human-readable display name (shown in source card) |
| `api` | `string` | Full URL to the MediaWiki `api.php` endpoint |
| `baseUrl` | `string` | Wiki page base URL (page title is appended) |

Then add a corresponding prompt instruction in the `MEDIA TAGS` section of `SYSTEM_PROMPT` so the model knows when to use the new wiki ID.

## MediaWiki API Usage

### searchWiki(wikiId, query)

Searches the wiki using the MediaWiki `action=query` API with the `list=search` module.

**Request:**
```
GET {wiki.api}?action=query&list=search&srsearch={query}&srlimit=3&format=json&origin=*
```

**Parameters:**
- `srsearch` -- URL-encoded search query
- `srlimit=3` -- Maximum 3 results
- `format=json` -- JSON response
- `origin=*` -- CORS header for cross-origin requests

**Returns:** Array of up to 3 objects:

```js
[{
  title: "Cinnamoroll",       // Wiki page title
  pageid: 12345,              // MediaWiki page ID
  snippet: "Cinnamoroll is…"  // Plain text snippet (HTML tags stripped)
}]
```

Returns an empty array on any error.

### fetchWikiContent(wikiId, pageTitle)

Fetches the intro section (section 0) of a wiki page using `action=parse`.

**Request:**
```
GET {wiki.api}?action=parse&page={pageTitle}&prop=text&section=0&format=json&origin=*
```

**Parameters:**
- `page` -- URL-encoded page title
- `prop=text` -- Return rendered HTML text
- `section=0` -- Intro/lead section only
- `format=json` -- JSON response
- `origin=*` -- CORS header

**Processing:**

The raw HTML from `data.parse.text['*']` is cleaned:

1. Strip `<style>` blocks and all HTML tags
2. Decode HTML entities (`&nbsp;`, `&amp;`, `&lt;`, `&gt;`, `&quot;`)
3. Collapse whitespace
4. Truncate to **1500 characters** (with `...` suffix)

**Returns:**

```js
{
  title: "Cinnamoroll",                                      // Canonical page title
  text: "Cinnamoroll is a fluffy white dog character…",      // Plain text (max 1500 chars)
  url: "https://hellokittyislandadventure.wiki.gg/wiki/Cinnamoroll",
  wikiName: "Hello Kitty Island Adventure"                   // From WIKIS registry
}
```

Returns `null` on any error.

## Second Gemini Call

When wiki content is successfully fetched, the server makes a second Gemini call with the wiki information injected:

**Contents array:**

```js
const followupContents = [
  { role: 'user', parts: [{ text: message }] },                    // Original user message
  { role: 'model', parts: [{ text: reply }] },                     // First Gemini reply (with tag)
  { role: 'user', parts: [{ text: `Here is wiki information…` }] } // Wiki content injection
];
```

**System instruction** is the original system prompt + a wiki context suffix:

```
Wiki information from {wikiName} about "{title}":
{text}

Source: {url}

Use this wiki information to give a helpful, specific answer IN CHARACTER as My Melody.
Reference the details naturally -- do NOT just dump raw wiki text.
Do NOT include any [WIKI_SEARCH:] tags in your response.
```

The second call uses the same model (`gemini-3-flash-preview`) and config as the first.

After the second call, any stray `[WIKI_SEARCH:]` tags are defensively stripped from the reply.

## Fallback Chain

Every failure path strips the wiki tag and returns the original reply:

```
wikiMatch found?
├─ NO → return reply as-is
└─ YES → WIKIS[wikiId] exists?
    ├─ NO → strip tag, log warning
    └─ YES → searchWiki()
        ├─ error → strip tag
        └─ results.length > 0?
            ├─ NO → strip tag
            └─ YES → fetchWikiContent()
                ├─ null → strip tag
                └─ content → second Gemini call
                    ├─ error → strip tag (wikiSource still set)
                    └─ success → use enriched reply
```

In all fallback cases, the `wikiSource` object may or may not be set:
- If `fetchWikiContent()` succeeded, `wikiSource` is populated (so the source card still renders even if the second Gemini call fails)
- If `fetchWikiContent()` failed or no results were found, `wikiSource` remains `null`

## wikiSource Object Shape

Returned in the chat API response JSON when wiki content was successfully fetched:

```json
{
  "title": "Cinnamoroll",
  "url": "https://hellokittyislandadventure.wiki.gg/wiki/Cinnamoroll",
  "wikiName": "Hello Kitty Island Adventure"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | `string` | Canonical wiki page title |
| `url` | `string` | Direct link to the wiki page |
| `wikiName` | `string` | Human-readable wiki name from the registry |

## Frontend Rendering

The wiki source card is rendered in `addMessage()` in `app.js` when `wikiSource` is present on an assistant message:

```js
if (wikiSource && role === 'assistant') {
  const wikiCard = document.createElement('a');
  wikiCard.href = wikiSource.url;
  wikiCard.target = '_blank';
  wikiCard.className = 'wiki-source';
  // ...
}
```

**Structure:**
- `<a class="wiki-source">` -- Clickable card linking to the wiki page
  - `<span class="wiki-source-icon">` -- Book emoji (U+1F4D6)
  - `<div class="wiki-source-info">` -- Container for text
    - `<span class="wiki-source-label">` -- Wiki name (e.g., "Hello Kitty Island Adventure")
    - `<span class="wiki-source-title">` -- Page title (e.g., "Cinnamoroll")

The card uses a lavender theme defined in `style.css`.

## Direct API Endpoint

The wiki can also be searched directly via the REST API, independent of the chat pipeline:

### GET /api/wiki-search

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `wiki` | `string` | Yes | Wiki ID from registry (`hkia`, `minecraft`) |
| `q` | `string` | Yes | Search query |

**Success response (200):**

```json
{
  "results": [
    { "title": "Cinnamoroll", "pageid": 123, "snippet": "..." },
    { "title": "Cinnamoroll/Gifts", "pageid": 456, "snippet": "..." }
  ],
  "topContent": {
    "title": "Cinnamoroll",
    "text": "Cinnamoroll is a fluffy white dog…",
    "url": "https://hellokittyislandadventure.wiki.gg/wiki/Cinnamoroll",
    "wikiName": "Hello Kitty Island Adventure"
  }
}
```

**Error responses:**
- `400` -- Missing `wiki` or `q` parameter, or unknown wiki ID
- `500` -- Wiki API failure

---

## Related Pages

- [Search Tag System](search-tag-system.md) -- Overview of all search tags
- [Brave Search](brave-search.md) -- Image and video search integration
- [Reaction GIFs](reaction-gifs.md) -- Emotion-based reaction GIF system
