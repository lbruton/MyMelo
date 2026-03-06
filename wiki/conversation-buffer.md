# Conversation Buffer

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 566-635), `public/app.js` (lines 35-37)
> **Known gaps:** None

---

## Overview

The conversation buffer provides short-term, session-scoped multi-turn context for Gemini. It is an in-memory sliding window that keeps the last 6 exchanges (12 messages) per session, enabling Melody to reference recent conversation without relying on long-term memory (mem0) or database storage.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Server (Node.js)                    │
│                                                          │
│   sessionBuffers: Map<string, {                          │
│     contents: Array<{role, parts}>,                      │
│     lastAccess: number (timestamp)                       │
│   }>                                                     │
│                                                          │
│   Max sessions: 1000                                     │
│   Sliding window: 6 exchanges (12 items)                 │
│   Cleanup interval: every 10 minutes                     │
│   Session TTL: 1 hour                                    │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                      Client (Browser)                    │
│                                                          │
│   sessionStorage.getItem('melodySessionId')              │
│   Generated via crypto.randomUUID()                      │
│   Sent as req.body.sessionId on every POST /api/chat     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## In-Memory Map Structure

```js
const sessionBuffers = new Map();
```

Each entry is keyed by a UUID `sessionId` and stores:

| Field | Type | Description |
|-------|------|-------------|
| `contents` | `Array<{role: string, parts: Array<{text: string}>}>` | Gemini-formatted message history |
| `lastAccess` | `number` | `Date.now()` timestamp of last read/write |

The `contents` array uses Gemini's expected format:

```js
{ role: 'user',  parts: [{ text: 'Hello!' }] }
{ role: 'model', parts: [{ text: 'Hi there~! How are you?' }] }
```

## Session Lifecycle

### 1. Client Generates UUID

On page load, the client generates or retrieves a session ID:

```js
const sessionId = sessionStorage.getItem('melodySessionId') || (() => {
  const id = crypto.randomUUID();
  sessionStorage.setItem('melodySessionId', id);
  return id;
})();
```

The ID is stored in `sessionStorage` (not `localStorage`), so it is scoped to the browser tab. Closing the tab discards the ID. Opening a new tab creates a new session.

### 2. Client Sends sessionId

Every chat request includes the session ID:

```js
const body = { message: text, replyStyle, sessionId, userId: activeUser };
```

### 3. Server Gets or Creates Buffer

```js
function getSessionBuffer(sessionId) {
  if (!sessionId || !UUID_RE.test(sessionId)) return [];
  if (!sessionBuffers.has(sessionId)) {
    // Enforce max session cap
    if (sessionBuffers.size >= MAX_SESSIONS) {
      // Evict oldest session by lastAccess
      let oldest = null, oldestTime = Infinity;
      for (const [id, s] of sessionBuffers) {
        if (s.lastAccess < oldestTime) { oldest = id; oldestTime = s.lastAccess; }
      }
      if (oldest) sessionBuffers.delete(oldest);
    }
    sessionBuffers.set(sessionId, { contents: [], lastAccess: Date.now() });
  }
  const session = sessionBuffers.get(sessionId);
  session.lastAccess = Date.now();
  return session.contents;
}
```

### 4. Buffer Sent to Gemini

The buffer contents are spread into the `contents` array before the current message:

```js
const historyBuffer = getSessionBuffer(sessionId);
const contents = [...historyBuffer];
contents.push({ role: 'user', parts: [{ text: message }] });
```

### 5. Exchange Appended After Response

After Gemini responds, both the user message and model reply are appended:

```js
addToSessionBuffer(sessionId, message || '[shared an image]', reply);
```

## Sliding Window

The buffer enforces a maximum of 12 items (6 user-model exchange pairs):

```js
function addToSessionBuffer(sessionId, userMessage, assistantReply) {
  if (!sessionId) return;
  const buffer = getSessionBuffer(sessionId);
  buffer.push(
    { role: 'user',  parts: [{ text: userMessage }] },
    { role: 'model', parts: [{ text: assistantReply }] }
  );
  while (buffer.length > 12) {
    buffer.shift(); // drop oldest user message
    buffer.shift(); // drop oldest model reply
  }
}
```

Oldest exchanges are dropped in pairs (user + model together) to maintain role alternation.

## Max Concurrent Sessions

| Constant | Value | Purpose |
|----------|-------|---------|
| `MAX_SESSIONS` | `1000` | Prevent memory exhaustion from unbounded session growth |

When the limit is reached, the oldest session (by `lastAccess` timestamp) is evicted to make room for the new one. This is a linear scan of all sessions.

## Session Cleanup

An interval timer prunes expired sessions every 10 minutes:

```js
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;  // 1 hour ago
  for (const [id, session] of sessionBuffers) {
    if (session.lastAccess < cutoff) sessionBuffers.delete(id);
  }
}, 10 * 60 * 1000);  // every 10 minutes
```

| Parameter | Value |
|-----------|-------|
| Cleanup interval | 10 minutes |
| Session TTL | 1 hour of inactivity |

Note: The CLAUDE.md mentions "24-hour lazy cleanup" but the actual implementation uses a 1-hour TTL with 10-minute interval checks.

## UUID Validation

Session IDs must match UUID v4 format:

```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
```

Invalid or missing session IDs cause `getSessionBuffer()` to return an empty array, meaning the chat still works but without multi-turn context.

## Ephemeral Nature

The conversation buffer is deliberately ephemeral:

- Stored in process memory only (a JavaScript `Map`)
- Lost on server restart or container rebuild
- No disk persistence, no database
- Each browser tab gets its own session (via `sessionStorage`)

Long-term memory is handled by [mem0](mem0-memory-system.md), which stores extracted facts permanently. The conversation buffer only provides short-term conversational coherence within a single session.

## Why This Design

| Alternative | Why not |
|-------------|---------|
| Database (SQLite, Redis) | Adds infrastructure complexity for data that is inherently temporary |
| localStorage persistence | Conversation history does not need to survive across sessions; mem0 handles long-term recall |
| Unlimited buffer | Gemini context window has limits; 6 exchanges provides enough context for coherent multi-turn conversation without excessive token usage |
| No buffer at all | Without recent context, Melody cannot reference anything said earlier in the same session, leading to disjointed conversations |

The design prioritizes simplicity: an in-memory Map with automatic cleanup, no external dependencies, and graceful degradation (chat works without a session ID).

---

## Related Pages

- [Gemini AI Integration](gemini-integration.md)
- [mem0 Memory System](mem0-memory-system.md)
- [System Prompt Architecture](system-prompt.md)
