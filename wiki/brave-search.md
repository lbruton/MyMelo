# Brave Search Integration

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 885-961), `public/app.js` (lines 471-523)
> **Known gaps:** None

---

## Overview

My Melody Chat uses the Brave Search API for image and video search, triggered by `[IMAGE_SEARCH:]` and `[VIDEO_SEARCH:]` tags in LLM responses. A separate gallery search endpoint provides full-text search over user-uploaded images stored locally.

## API Configuration

| Setting | Value |
|---------|-------|
| Auth header | `X-Subscription-Token: {BRAVE_API_KEY}` |
| Accept header | `application/json` |
| Image search base | `https://api.search.brave.com/res/v1/images/search` |
| Video search base | `https://api.search.brave.com/res/v1/videos/search` |
| API key env var | `BRAVE_API_KEY` |
| API key source | Infisical (StakTrakr project, dev environment) |

## Image Search

### Endpoint

```
GET /api/image-search?q={query}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | `string` | Yes | Search query |

### Brave API Request

```
GET https://api.search.brave.com/res/v1/images/search?q={query}&count=6&safesearch=strict
```

| Parameter | Value | Notes |
|-----------|-------|-------|
| `q` | URL-encoded query | From the `[IMAGE_SEARCH:]` tag or direct API call |
| `count` | `6` | Maximum results returned |
| `safesearch` | `strict` | **Must be `strict`** -- see note below |

### Response Mapping

Each Brave result is mapped to:

```json
{
  "title": "Cute puppy photo",
  "imageUrl": "https://example.com/puppy.jpg",
  "thumbnailUrl": "https://imgs.search.brave.com/...",
  "width": 1200,
  "height": 800
}
```

| Output Field | Brave Source | Notes |
|-------------|-------------|-------|
| `title` | `i.title` | Image title |
| `imageUrl` | `i.properties?.url \|\| i.url` | Full-size image URL (prefers `properties.url`) |
| `thumbnailUrl` | `i.thumbnail?.src` | Brave-hosted thumbnail |
| `width` | `i.properties?.width` | Original image width |
| `height` | `i.properties?.height` | Original image height |

### Why safesearch Must Be "strict"

The Brave Image Search and Video Search APIs only accept `off` or `strict` for the `safesearch` parameter. Passing `moderate` (which works on the web search API) returns a **422 Unprocessable Entity** error. This is a Brave API design inconsistency.

### Error Handling

- Missing `q` parameter: returns `400 { error: 'Query required' }`
- Missing `BRAVE_API_KEY`: returns `500 { error: 'Image search not configured' }`
- API failure: returns `500 { error: 'Image search failed' }`, logs error to console

## Video Search

### Endpoint

```
GET /api/video-search?q={query}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | `string` | Yes | Search query |

### Brave API Request

```
GET https://api.search.brave.com/res/v1/videos/search?q={query}&count=4&safesearch=strict
```

| Parameter | Value | Notes |
|-----------|-------|-------|
| `q` | URL-encoded query | From the `[VIDEO_SEARCH:]` tag or direct API call |
| `count` | `4` | Maximum results returned |
| `safesearch` | `strict` | Same restriction as image search |

### Response Mapping

Each Brave result is mapped to:

```json
{
  "title": "How to make origami crane",
  "url": "https://youtube.com/watch?v=...",
  "thumbnail": "https://imgs.search.brave.com/...",
  "description": "Step by step tutorial..."
}
```

| Output Field | Brave Source | Notes |
|-------------|-------------|-------|
| `title` | `v.title` | Video title |
| `url` | `v.url` | Link to the video page |
| `thumbnail` | `v.thumbnail?.src` | Brave-hosted thumbnail |
| `description` | `v.description` | Video description text |

### Error Handling

Same pattern as image search:
- Missing `q`: `400`
- Missing API key: `500`
- API failure: `500`, logs error

## Gallery Search

### Endpoint

```
GET /api/gallery-search?q={keywords}
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | `string` | Yes | Search keywords (empty string returns `[]`) |

### Behavior

Gallery search operates entirely locally -- no external API calls. It performs **case-insensitive substring matching** against the `caption` and `reply` fields of saved image metadata in `data/images-meta.json`.

```js
const matches = meta.filter(m =>
  (m.caption || '').toLowerCase().includes(q) ||
  (m.reply || '').toLowerCase().includes(q)
);
```

- `caption` -- The text message the user sent alongside the image
- `reply` -- The first 200 characters of Melody's reply about the image

### Response

Returns an array of matching image metadata objects:

```json
[{
  "id": "a1b2c3d4-...",
  "filename": "a1b2c3d4-....jpeg",
  "caption": "Look at my cat!",
  "reply": "Oh my~ what a fluffy kitty...",
  "date": "2026-02-15T10:30:00.000Z"
}]
```

Returns an empty array on error or empty query.

## Frontend Rendering

### Image Search Results

Handled in `processReply()` in `app.js`. After fetching results, a random image is selected from the first 4 valid results:

```js
const valid = results.filter(r => r.imageUrl);
if (valid.length) {
  const pick = valid[Math.floor(Math.random() * Math.min(valid.length, 4))];
  searchImageUrl = pick.imageUrl;
}
```

The image is rendered as an `<img>` element with class `search-result-img` appended to the assistant message bubble. An `error` handler removes the image element if loading fails. Clicking opens the fullscreen lightbox.

### Video Search Results

The **first result** from the video search is used:

```js
if (results.length) {
  videoResult = results[0];
}
```

Rendered as a clickable `<a class="video-result">` containing:

```html
<a href="{url}" target="_blank" class="video-result">
  <img src="{thumbnail}" alt="{title}" class="video-thumbnail">
  <span class="video-title">{title}</span>
</a>
```

The thumbnail is optional -- if it fails to load, the `error` handler removes it but the title link remains.

### Gallery Search Results

Gallery results use the same rendering path as image search results. The image URL is constructed from the filename:

```js
searchImageUrl = `/data/images/${results[0].filename}`;
```

Gallery search has lower priority than image search. It only runs if `IMAGE_SEARCH` did not already produce a result:

```js
if (gallerySearchMatch && !searchImageUrl) {
  // ...fetch gallery result
}
```

---

## Related Pages

- [Search Tag System](search-tag-system.md) -- Tag detection, processing flow, and prompt instructions
- [Wiki Integration](wiki-integration.md) -- Game wiki two-step pipeline
- [Reaction GIFs](reaction-gifs.md) -- Emotion-based GIF system
