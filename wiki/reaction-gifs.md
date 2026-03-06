# Reaction GIFs

> **Last verified:** 2026-02-27
> **Source files:** `public/app.js` (lines 471-566)
> **Known gaps:** None

---

## Overview

The reaction GIF system allows My Melody to express emotions visually through animated GIFs sourced from the nekos.best API. The model emits a `[REACTION: emotion]` tag in its reply, which the client parses, maps to an API category, and fetches a random GIF to append to the message bubble.

## Tag Format

```
[REACTION: emotion]
```

- Tag is case-sensitive for the bracket syntax but the emotion keyword is lowercased during processing
- Only one reaction tag per message is supported (regex uses `.match()`, not `.matchAll()`)
- The tag is stripped from display text before rendering

### Detection Regex

```js
const reactionMatch = text.match(/\[REACTION:\s*(\w+)\]/);
```

### Stripping Regex

```js
.replace(/\[REACTION:\s*\w+\]/g, '')
```

## Supported Emotions

| Emotion | nekos.best Categories | Typical Trigger |
|---------|----------------------|-----------------|
| `happy` | `happy`, `smile`, `dance` | Good news, celebrations |
| `love` | `hug`, `cuddle`, `pat` | Comforting, affection, heartfelt moments |
| `shy` | `blush`, `wave`, `wink` | Compliments, embarrassment |
| `sad` | `cry`, `pout` | Bad news, empathy |
| `think` | `think`, `nod`, `shrug` | Pondering, uncertainty |
| `playful` | `tickle`, `poke`, `nom` | Teasing, fun, silly moments |
| `angry` | `angry`, `facepalm`, `baka` | Frustration, mild annoyance (in character) |
| `sassy` | `smug`, `thumbsup`, `yeet` | Witty remarks, confidence |
| `tired` | `yawn`, `bored`, `sleep` | Late night chats, low energy |
| `excited` | `highfive`, `thumbsup`, `dance` | Excitement, big announcements |

## Emotion-to-Endpoint Mapping

The mapping is defined in the `REACTION_MAP` object in `app.js`:

```js
const REACTION_MAP = {
  happy:    ['happy', 'smile', 'dance'],
  love:     ['hug', 'cuddle', 'pat'],
  shy:      ['blush', 'wave', 'wink'],
  sad:      ['cry', 'pout'],
  think:    ['think', 'nod', 'shrug'],
  playful:  ['tickle', 'poke', 'nom'],
  angry:    ['angry', 'facepalm', 'baka'],
  sassy:    ['smug', 'thumbsup', 'yeet'],
  tired:    ['yawn', 'bored', 'sleep'],
  excited:  ['highfive', 'thumbsup', 'dance']
};
```

Each emotion maps to an array of nekos.best API category endpoints. One category is chosen at random per request, providing visual variety.

## nekos.best API Integration

### Request

```
GET https://nekos.best/api/v2/{category}?amount=1
```

- `{category}` is one of the mapped values (e.g., `hug`, `smile`, `dance`)
- `amount=1` requests a single GIF
- No authentication required (public API)

### Response

```json
{
  "results": [{
    "anime_name": "Some Anime",
    "url": "https://nekos.best/api/v2/hug/abc123.gif"
  }]
```

The `url` field from `results[0]` is used as the GIF source.

### Category Selection

A random category is picked from the emotion's array:

```js
const category = categories[Math.floor(Math.random() * categories.length)];
```

For example, `[REACTION: happy]` might fetch from `happy`, `smile`, or `dance` on any given message.

## Processing Flow

```
  Gemini reply: "That's wonderful! [REACTION: happy] I'm so glad!"
           │
           ▼
  ┌──────────────────────────────────┐
  │  1. Regex detects tag            │
  │     emotion = "happy"            │
  │                                  │
  │  2. Strip tag from display text  │
  │     "That's wonderful! I'm so   │
  │      glad!"                      │
  │                                  │
  │  3. Render message immediately   │
  │     (non-blocking)               │
  └──────────────┬───────────────────┘
                 │
                 ▼ (async, after render)
  ┌──────────────────────────────────┐
  │  4. Look up REACTION_MAP[happy]  │
  │     → ['happy', 'smile', 'dance']│
  │                                  │
  │  5. Pick random: e.g. "dance"    │
  │                                  │
  │  6. Fetch nekos.best/api/v2/     │
  │     dance?amount=1               │
  │                                  │
  │  7. Get GIF URL from response    │
  │                                  │
  │  8. Append <img> to last         │
  │     assistant message bubble     │
  └──────────────────────────────────┘
```

Key design point: the message text is rendered **immediately** without waiting for the GIF fetch. The GIF is appended asynchronously to avoid blocking the chat flow.

## Frontend Rendering

The GIF is appended to the **last assistant message bubble** in the chat area:

```js
const lastBubble = chatArea.querySelector('.message.assistant:last-child .message-bubble');
fetch(`https://nekos.best/api/v2/${category}?amount=1`)
  .then(r => r.json())
  .then(data => {
    const url = data.results?.[0]?.url;
    if (url && lastBubble) {
      const gif = document.createElement('img');
      gif.src = url;
      gif.alt = 'Reaction';
      gif.style.cssText = 'max-width:200px;border-radius:8px;margin-top:8px;display:block';
      gif.addEventListener('error', () => gif.remove());
      lastBubble.appendChild(gif);
    }
  })
  .catch(() => { /* silently skip */ });
```

### Styling

Inline styles applied to the GIF element:

| Property | Value | Purpose |
|----------|-------|---------|
| `max-width` | `200px` | Keep GIFs compact in the message bubble |
| `border-radius` | `8px` | Match the app's rounded corner aesthetic |
| `margin-top` | `8px` | Spacing between message text and GIF |
| `display` | `block` | Force GIF onto its own line |

### Error Handling

- If the nekos.best API call fails, the error is silently caught (`.catch(() => {})`)
- If the GIF image fails to load, the `error` event handler removes the `<img>` element
- If the emotion keyword is not in `REACTION_MAP`, no fetch is attempted
- The message text always renders regardless of GIF fetch outcome

## System Prompt Instructions

The model is instructed when to emit reaction tags via the `REACTIONS` section of the system prompt:

```
REACTIONS:
Occasionally (not every message -- maybe 1 in 4) you can express yourself with a reaction GIF
by including [REACTION: emotion]. Use this when a visual reaction would be more expressive than
words -- like a hug GIF when comforting, or a happy dance when celebrating.
Emotions: happy, love, shy, sad, think, playful, angry, sassy, tired, excited
```

### Frequency Guidance

The prompt specifies "maybe 1 in 4" messages should include a reaction tag. This is a soft instruction -- the model decides contextually. The intention is that reactions enhance rather than overwhelm the conversation.

### When Reactions Are Used

- **Comforting moments** -- `love` (hug/cuddle GIFs) when the user is sad
- **Celebrations** -- `happy` or `excited` when sharing good news
- **Playful teasing** -- `playful` or `sassy` during fun banter
- **Thinking out loud** -- `think` when considering a question
- **Empathy** -- `sad` when the user shares something difficult
- **Embarrassment** -- `shy` when receiving compliments

## Tag Stripping

The reaction tag is removed from the display text along with all other search tags in `processReply()`:

```js
let displayText = text
  .replace(/\[IMAGE_SEARCH:\s*.+?\]/g, '')
  .replace(/\[VIDEO_SEARCH:\s*.+?\]/g, '')
  .replace(/\[GALLERY_SEARCH:\s*.+?\]/g, '')
  .replace(/\[WIKI_SEARCH:\s*.+?\]/g, '')
  .replace(/\[REACTION:\s*\w+\]/g, '')
  .trim();
```

The tag is always stripped regardless of whether the emotion is recognized or the GIF fetch succeeds.

---

## Related Pages

- [Search Tag System](search-tag-system.md) -- Overview of all search tags and processing model
- [Brave Search](brave-search.md) -- Image and video search integration
- [Wiki Integration](wiki-integration.md) -- Game wiki two-step pipeline
