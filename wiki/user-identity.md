# User Identity

> **Last verified:** 2026-02-27
> **Source files:** `server.js` (lines 72-86: `KNOWN_USERS`, `getUserMemId()`), `public/app.js` (lines 46-95: user picker, `selectUser()`)
> **Known gaps:** No dynamic user registration — users are hardcoded in both server and client

---

## Overview

User identity (v2.5) provides multi-user support for a shared household. Each user gets isolated mem0 memory tracks, independent relationship stats, and per-user welcome flow state. The system supports a fixed set of known users plus a guest mode with reduced persistence.

## KNOWN_USERS Configuration

Defined in `server.js` at line 72:

```js
const KNOWN_USERS = {
  amelia: { name: 'Amelia', mem0Id: 'melody-friend-amelia' },
  lonnie: { name: 'Lonnie', mem0Id: 'melody-friend-lonnie' },
  guest:  { name: 'Guest',  mem0Id: 'melody-friend-guest' }
};
```

Defined in `public/app.js` at line 48 (display names only):

```js
const USER_NAMES = { amelia: 'Amelia', lonnie: 'Lonnie', guest: 'Guest' };
```

| User Key | Display Name | mem0 User ID | Notes |
|----------|--------------|--------------|-------|
| `amelia` | Amelia | `melody-friend-amelia` | Full memory persistence |
| `lonnie` | Lonnie | `melody-friend-lonnie` | Full memory persistence |
| `guest` | Guest | `melody-friend-guest` | No user-track mem0 saves |

## User Picker Overlay

On first page load, if no user is stored in `localStorage.melodyActiveUser`, the user picker overlay is displayed.

```
┌──────────────────────────────────┐
│                                  │
│     Who's chatting with Melody?  │
│                                  │
│  ┌──────────┐  ┌──────────┐     │
│  │  Amelia  │  │  Lonnie  │     │
│  └──────────┘  └──────────┘     │
│        ┌──────────┐             │
│        │  Guest   │             │
│        └──────────┘             │
│                                  │
└──────────────────────────────────┘
```

- Each button has a `data-user` attribute matching the user key
- Clicking a button calls `selectUser(userId)`:
  1. Saves `userId` to `localStorage.melodyActiveUser`
  2. Sets `activeUser` in-memory variable
  3. Hides the picker overlay
  4. Updates the header label with the display name

## Per-User mem0 Isolation

The `getUserMemId(userId)` function derives the mem0 `user_id` from the user key:

```js
function getUserMemId(userId) {
  if (userId && KNOWN_USERS[userId]) return KNOWN_USERS[userId].mem0Id;
  return MEM0_USER_ID; // backward compat fallback: 'melody-friend'
}
```

This ensures each user has a completely separate memory track in mem0:

```
┌─────────────────────────────────────────────────┐
│                    mem0 Tracks                   │
├──────────────────┬──────────────────────────────┤
│   User Tracks    │       Agent Track            │
│  (per-user)      │       (shared)               │
├──────────────────┤                              │
│ melody-friend-   │  my-melody                   │
│   amelia         │  (Melody's own personality,  │
│ melody-friend-   │   opinions, experiences —    │
│   lonnie         │   shared across all users)   │
│ melody-friend-   │                              │
│   guest          │                              │
│ melody-friend    │                              │
│   (legacy)       │                              │
└──────────────────┴──────────────────────────────┘
```

Both user and agent tracks are searched in parallel on every chat request. The agent track (`my-melody`) is **shared** — Melody's personality evolves from conversations with all users.

## Per-User Relationship Stats

The `relationship.json` file stores stats keyed by user ID (see [Relationship Tracking](relationship-tracking.md)):

```json
{
  "_version": 2,
  "_legacy": { ... },
  "amelia": { "firstChat": "2026-02-25", "totalChats": 15, ... },
  "lonnie": { "firstChat": "2026-02-25", "totalChats": 8, ... },
  "guest":  { "firstChat": null, "totalChats": 0, ... }
}
```

The user key resolves through `updateRelationship(userId)` and `getRelationshipContext(userId)`.

## Guest User Behavior

| Feature | Guest Behavior |
|---------|---------------|
| Chat | Works normally — sends messages and receives replies |
| mem0 user track | **Skipped** — `saveToMemory()` does not save to user track when `userId === 'guest'` |
| mem0 agent track | **Saved** — Melody's personality still evolves from guest conversations |
| Welcome flow | Runs normally but mem0 saves are skipped for each step |
| Relationship stats | Tracked in `relationship.json` under the `guest` key |
| Cross-user memory | **Excluded** — guest conversations are never shared with other users |
| Identity context | System prompt includes: "You are talking to a guest friend. Be welcoming but don't assume you know them well." |

## Cross-User Memory Access

When a known user mentions another known user by name in a message, the server performs a cross-user memory search:

```
User message: "What has Lonnie been up to?"
    │
    ▼
Scan message for known user names (case-insensitive)
    │
    ├── Skip self (don't cross-reference your own memories)
    ├── Skip guest (privacy — never share guest conversations)
    │
    ▼
Search mem0 for matching user's memories (limit 5)
    │
    ▼
Inject into system prompt:
"Things Lonnie has been chatting about recently:
- ..."
```

The system prompt also includes a cross-user instruction:

> "You know multiple family members. If someone asks about another family member, you can share casual, friendly info about what they've been chatting about. Frame it naturally (e.g. 'Oh~! Lonnie told me about...'). Never share Guest conversations — guests get privacy."

Only one cross-user lookup is performed per message (breaks after first match).

## localStorage Persistence

| Key | Value | Purpose |
|-----|-------|---------|
| `melodyActiveUser` | `"amelia"` / `"lonnie"` / `"guest"` | Currently selected user identity |
| `melodyWelcomeDone-amelia` | `"true"` | Amelia completed the welcome flow |
| `melodyWelcomeDone-lonnie` | `"true"` | Lonnie completed the welcome flow |
| `melodyWelcomeDone-guest` | `"true"` | Guest completed the welcome flow |

## Header Label Update

The active user's display name appears in the app header via `activeUserLabel`:

```js
activeUserLabel.textContent = USER_NAMES[userId] || userId;
```

This is updated on:

- Page load (if `melodyActiveUser` exists in localStorage)
- User picker selection
- User switch from settings dropdown

## userId in API Requests

All API requests that support per-user behavior accept a `userId` parameter:

| Endpoint | Parameter Type | Usage |
|----------|---------------|-------|
| `POST /api/chat` | body: `userId` | Determines mem0 track, relationship stats, identity context |
| `POST /api/welcome` | body: `userId` | Determines which mem0 track to save onboarding data to |
| `GET /api/memories` | query: `userId` | Fetches memories for the correct user track |
| `GET /api/relationship` | query: `userId` | Returns stats for the correct user |
| `GET /api/welcome-status` | query: `userId` | Checks returning status for the correct user |

The client sends `activeUser` in every request:

```js
const body = { message: text, replyStyle, sessionId, userId: activeUser };
```

## User Switch

Users can switch identities via the "Switch User" button in the settings dropdown:

1. Click settings gear icon
2. Click "Switch User"
3. Settings dropdown closes
4. User picker overlay shows
5. Select new user
6. Header label updates, all subsequent API calls use new `userId`

Note: Switching users does NOT clear the chat area or session buffer. The conversation buffer (in-memory on the server, keyed by `sessionId`) persists across user switches within the same tab session.

---

## Related Pages

- [Welcome Flow](welcome-flow.md) — Per-user onboarding and returning user greetings
- [Relationship Tracking](relationship-tracking.md) — Per-user friendship stats
- [Character Guide](character-guide.md) — Identity context shapes Melody's behavior per user
