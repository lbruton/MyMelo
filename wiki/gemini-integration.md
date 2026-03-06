# Gemini AI Integration

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 45, 59-60, 326-333, 650-848)
> **Known gaps:** None

---

## Overview

My Melody Chat uses the Google Gemini API via the `@google/genai` SDK to power all AI chat interactions. The server makes one or two Gemini calls per user message depending on whether the wiki pipeline is triggered.

## Model Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| SDK | `@google/genai` | `GoogleGenAI` class |
| Model ID | `gemini-3-flash-preview` | Fast variant; swap to `gemini-3.1-pro-preview` for richer responses |
| Temperature | `1.0` | **Must be >= 1.0 on Gemini 3.x** to prevent looping |
| topP | `0.95` | Nucleus sampling threshold |
| thinkingBudget | `-1` | Auto (let the model decide thinking depth) |
| Tools | `[{ googleSearch: {} }]` | Google Search grounding enabled |
| JSON body limit | `10mb` | Express `express.json({ limit: '10mb' })` |

```js
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL_ID = 'gemini-3-flash-preview';
const MODEL_CONFIG = {
  temperature: 1.0,
  topP: 0.95,
  thinkingConfig: { thinkingBudget: -1 },
  tools: [{ googleSearch: {} }]
};
```

## Chat Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     POST /api/chat                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Extract { message, imageBase64, imageMime,                  │
│               replyStyle, sessionId, userId }                   │
│                                                                 │
│  2. Update relationship stats                                   │
│                                                                 │
│  3. Search mem0 (parallel):                                     │
│     ├── User track memories (limit 10)                          │
│     └── Agent track memories (limit 5)                          │
│                                                                 │
│  4. (Optional) Cross-user memory search                         │
│                                                                 │
│  5. Build system prompt:                                        │
│     SYSTEM_PROMPT + CHARACTER_CONTEXT + identityContext          │
│     + crossUserInstruction + relationshipContext                 │
│     + userMemoryContext + agentMemoryContext                     │
│     + crossUserContext + styleInstruction                        │
│                                                                 │
│  6. Build contents array:                                       │
│     [...historyBuffer, currentMessage]                          │
│                                                                 │
│  7. ai.models.generateContent({                                 │
│       model: MODEL_ID,                                          │
│       contents,                                                 │
│       config: { ...MODEL_CONFIG, systemInstruction }            │
│     })                                                          │
│                                                                 │
│  8. Extract reply text: response.text                           │
│                                                                 │
│  9. Extract grounding sources from                              │
│     candidates[0].groundingMetadata.groundingChunks             │
│                                                                 │
│ 10. (Conditional) Wiki two-step pipeline                        │
│                                                                 │
│ 11. Save image (if provided), save to conversation buffer,      │
│     save to mem0 (fire-and-forget)                              │
│                                                                 │
│ 12. Return { reply, sources, wikiSource }                       │
└─────────────────────────────────────────────────────────────────┘
```

## System Prompt Injection

The system prompt is rebuilt on every request. It is never cached. The `systemInstruction` parameter is passed inside the `config` object to `generateContent`:

```js
const response = await ai.models.generateContent({
  model: MODEL_ID,
  contents,
  config: { ...MODEL_CONFIG, systemInstruction }
});
```

See [System Prompt Architecture](system-prompt.md) for full details on prompt construction.

## Contents Array Structure

The `contents` array sent to Gemini consists of the conversation buffer history (previous exchanges) followed by the current user message:

```js
const historyBuffer = getSessionBuffer(sessionId);
const contents = [...historyBuffer];

// Text-only message
contents.push({ role: 'user', parts: [{ text: message }] });

// OR image + text message
contents.push({
  role: 'user',
  parts: [
    { inlineData: { mimeType: imageMime || 'image/jpeg', data: imageBase64 } },
    { text: message || 'What do you see in this image?' }
  ]
});
```

## Vision Support

Images are sent as inline base64 data in the `parts` array alongside the text message. The client compresses images to 1024px max width at JPEG 0.8 quality before sending.

| Field | Source | Default |
|-------|--------|---------|
| `inlineData.mimeType` | `req.body.imageMime` | `image/jpeg` |
| `inlineData.data` | `req.body.imageBase64` | (required) |
| `text` | `req.body.message` | `'What do you see in this image?'` |

When an image is provided, it is also saved to disk (`data/images/`) with a UUID filename and metadata recorded in `images-meta.json`.

## Response Extraction

### Reply Text

```js
let reply = response.text;
```

The `response.text` accessor is a convenience property from the `@google/genai` SDK that extracts the text content from the first candidate.

### Grounding Sources

Google Search grounding metadata is extracted from the first candidate's `groundingMetadata`:

```js
const candidate = response.candidates?.[0];
const grounding = candidate?.groundingMetadata;
let sources = [];
if (grounding?.groundingChunks) {
  sources = grounding.groundingChunks
    .filter(c => c.web)
    .map(c => ({ title: c.web.title || '', url: c.web.uri || '' }));
}
```

Sources are returned as an array of `{ title, url }` objects in the response JSON.

## Two-Step Wiki Pipeline

When Gemini's reply contains a `[WIKI_SEARCH: wikiId query]` tag, the server intercepts it and makes a second Gemini call enriched with wiki content.

```
┌──────────────────────────────────────────────────────────┐
│                 Wiki Pipeline Flow                        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. Regex match: /\[WIKI_SEARCH:\s*([\w-]+)\s+(.+?)\]/  │
│     Extract wikiId and wikiQuery                         │
│                                                          │
│  2. searchWiki(wikiId, wikiQuery)                        │
│     → MediaWiki API search (srlimit=3)                   │
│                                                          │
│  3. fetchWikiContent(wikiId, topResult.title)            │
│     → MediaWiki parse API, HTML→plaintext, cap 1500ch    │
│                                                          │
│  4. Second Gemini call:                                  │
│     contents: [                                          │
│       { role: 'user',  parts: [{ text: message }] },    │
│       { role: 'model', parts: [{ text: reply }] },      │
│       { role: 'user',  parts: [{ text: wikiText }] }    │
│     ]                                                    │
│     config.systemInstruction += wikiContext               │
│                                                          │
│  5. Replace reply with second call output                │
│     Strip any residual [WIKI_SEARCH:] tags               │
│                                                          │
│  6. Return wikiSource: { title, url, wikiName }          │
│     (rendered as a source card in the frontend)          │
└──────────────────────────────────────────────────────────┘
```

### Wiki Registry

| Wiki ID | Game | API Base |
|---------|------|----------|
| `hkia` | Hello Kitty Island Adventure | `hellokittyislandadventure.wiki.gg` |
| `minecraft` | Minecraft | `minecraft.wiki` |

New wikis are added by inserting one entry into the `WIKIS` object.

### Fallback Behavior

- If the second Gemini call fails, the original reply is returned with the `[WIKI_SEARCH:]` tag stripped
- If the wiki page cannot be fetched, the tag is stripped and the source card still shows (if search results were found)
- If the wiki ID is unknown, the tag is stripped and a warning is logged

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No message or image | 400: `'Message or image is required'` |
| Gemini API failure | 500: `'Something went wrong, my sweet friend!'` |
| Wiki pipeline failure | Falls back to original reply (tag stripped), error logged |
| mem0 search failure | Graceful degradation: chat works without memories |
| mem0 save failure | Fire-and-forget: errors logged but not propagated |

All errors in the main chat handler are caught by a top-level try/catch that returns a 500 with a friendly error message.

## Performance Notes

- **gemini-3-flash-preview** is approximately 3x faster than `gemini-3.1-pro-preview` but produces less nuanced responses
- Swap `MODEL_ID` to `gemini-3.1-pro-preview` for richer, more detailed replies at the cost of latency
- Temperature below 1.0 on Gemini 3.x causes response looping (model repeats itself). Always keep `temperature >= 1.0`
- The wiki pipeline adds a second Gemini call per wiki-tagged message, roughly doubling response latency for those messages
- Google Search grounding adds minimal overhead as it is handled server-side by Gemini

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key |

---

## Related Pages

- [System Prompt Architecture](system-prompt.md)
- [mem0 Memory System](mem0-memory-system.md)
- [Conversation Buffer](conversation-buffer.md)
